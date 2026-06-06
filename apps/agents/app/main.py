"""Servicio de agentes (NUTRI/CHEF/PSICO).

Fase 1: agente NUTRI (asiste al profesional). Flujo de cada /chat:
  1. verifica el contexto de tenant FIRMADO por el gateway Nest (HMAC+TTL);
  2. abre una transacción con el rol `nutreitor_agents` (sin BYPASSRLS) e inyecta
     `app.current_tenant_id` (SET LOCAL) → lee bajo RLS, igual que la API;
  3. arma el contexto clínico (ficha/plan/evolución del paciente);
  4. llama a la inferencia — provider STUB en dev (sin nube, sin PHI afuera);
     Anthropic real (bajo BAA) detrás de INFERENCE_PROVIDER;
  5. persiste conversación + mensajes + un run (audit) y responde.
"""

from __future__ import annotations

import os
import time

import psycopg
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel

from .context import verify_agent_context
from .inference import INFERENCE_PROVIDER, infer

DATABASE_AGENTS_URL = os.environ["DATABASE_AGENTS_URL"]


def _load_agent_secrets() -> list[str]:
    """Secretos activos para verificar el contexto (rotación dual-secret). Se lee la
    lista `AGENTS_SHARED_SECRETS` (separada por comas; primero=primary) y, si está
    vacía, se cae a `AGENTS_SHARED_SECRET`. Fail-closed: sin ningún secreto, el
    servicio NO arranca."""
    raw = os.environ.get("AGENTS_SHARED_SECRETS", "")
    secrets = [s.strip() for s in raw.split(",") if s.strip()]
    if not secrets:
        single = os.environ.get("AGENTS_SHARED_SECRET", "").strip()
        secrets = [single] if single else []
    if not secrets:
        raise RuntimeError(
            "Falta el secreto de firma de contexto: configurá AGENTS_SHARED_SECRETS "
            "(o AGENTS_SHARED_SECRET). Sin secreto, el servicio no puede verificar (fail-closed)."
        )
    return secrets


AGENTS_SHARED_SECRETS = _load_agent_secrets()
# Tope de uso por tenant — DEFENSA EN PROFUNDIDAD: el gateway TS ya corta antes de
# reenviar; esto vuelve a chequear acá por si el servicio se alcanzara sin pasar por el
# gateway. Mismos nombres de env que el gateway. 0 = sin límite.
AGENTS_RATELIMIT_PER_MIN = int(os.environ.get("AGENTS_RATELIMIT_PER_MIN", "30"))
AGENTS_MONTHLY_TOKEN_CAP = int(os.environ.get("AGENTS_MONTHLY_TOKEN_CAP", "0"))

app = FastAPI(title="nutreitor-agents")


class ChatRequest(BaseModel):
    agent: str
    message: str
    patientId: str | None = None
    conversationId: str | None = None


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "provider": INFERENCE_PROVIDER}


@app.post("/chat")
def chat(body: ChatRequest, x_agent_context: str | None = Header(default=None)) -> dict:
    ctx = verify_agent_context(x_agent_context or "", AGENTS_SHARED_SECRETS)
    if ctx is None:
        # Sin contexto firmado válido y vigente, no hay tenant (fail-closed).
        raise HTTPException(status_code=401, detail="Contexto inválido.")

    started = time.monotonic()
    with psycopg.connect(DATABASE_AGENTS_URL) as conn:
        with conn.transaction():
            with conn.cursor() as cur:
                # RLS: todo lo que sigue queda scopeado a este tenant.
                cur.execute(
                    "select set_config('app.current_tenant_id', %s, true)",
                    (ctx.tenant_id, ),
                )

                # Defensa en profundidad: tope de uso por tenant también acá.
                _check_budget(cur)

                # Conversación primero: así cargamos el historial del hilo como
                # contexto de la inferencia (continuidad de la charla).
                conversation_id = _ensure_conversation(
                    cur, ctx, body.agent, body.patientId, body.conversationId
                )
                history = _load_history(cur, conversation_id)
                # Contexto clínico MINIMIZADO por agente (allow-list).
                clinical = _load_clinical_context(cur, body.patientId, body.agent)

                result = infer(body.agent, body.message, clinical, history)
                latency_ms = int((time.monotonic() - started) * 1000)

                _insert_message(cur, ctx, conversation_id, "user", body.message)
                _insert_message(cur, ctx, conversation_id, "assistant", result.reply)
                _insert_run(cur, ctx, conversation_id, body.agent, result, latency_ms)

    return {
        "conversationId": conversation_id,
        "reply": result.reply,
        # crisis → `blocked` (la UI muestra recursos); error del provider → `error`.
        "status": (
            "blocked" if result.crisis else "error" if result.status == "error" else "ok"
        ),
        "crisis": result.crisis,
    }


def _check_budget(cur) -> None:
    """Tope de uso por tenant (defensa en profundidad). Corre bajo RLS: `agent_runs`
    ya queda scopeado al tenant del contexto. 0 = sin límite."""
    if AGENTS_RATELIMIT_PER_MIN > 0:
        cur.execute(
            "select count(*) from agent_runs where created_at >= now() - interval '1 minute'"
        )
        if cur.fetchone()[0] >= AGENTS_RATELIMIT_PER_MIN:
            raise HTTPException(status_code=429, detail="Límite de uso por minuto alcanzado.")
    if AGENTS_MONTHLY_TOKEN_CAP > 0:
        cur.execute(
            "select coalesce(sum(coalesce(input_tokens, 0) + coalesce(output_tokens, 0)), 0) "
            "from agent_runs where created_at >= date_trunc('month', now())"
        )
        if cur.fetchone()[0] >= AGENTS_MONTHLY_TOKEN_CAP:
            raise HTTPException(status_code=429, detail="Tope mensual de uso alcanzado.")


# ── lectura del contexto clínico (bajo RLS) ─────────────────────────────────────
#
# MINIMIZACIÓN DE DATOS POR AGENTE (allow-list). Cada agente recibe SÓLO los campos
# que necesita para su función; nunca el dict crudo completo. Principio de minimización
# (defendible para Fase 3) y respeto del espíritu de la visibilidad por campo (ADR 0008).
#
# >> A RATIFICAR (decisión clínica de Matías): QUÉ CONTEXTO RECIBE PSICO.
#    Default implementado = MÍNIMO (nombre + objetivo general). PSICO habla con el
#    PACIENTE y no necesita el plan, las alergias, las métricas ni el motivo crudo para
#    acompañar emocionalmente. Si se ratifica distinto, cambiar acá y en el ADR 0015.
#
# Tokens de campo: full_name | goal | reason | dietary_preferences | allergies
#                  plan_meta (título+versión) | plan_full (+ body) | metrics
_AGENT_CONTEXT_FIELDS: dict[str, frozenset[str]] = {
    # NUTRI asiste al PROFESIONAL: evolución + ajuste del plan.
    "nutri": frozenset({"full_name", "goal", "reason", "plan_meta", "metrics"}),
    # CHEF asiste al PROFESIONAL/paciente con recetas: necesita el plan y lo que no puede comer.
    "chef": frozenset({"full_name", "dietary_preferences", "allergies", "plan_full"}),
    # PSICO habla con el PACIENTE: contexto MÍNIMO (ver nota "a ratificar").
    "psico": frozenset({"full_name", "goal"}),
}
_DEFAULT_CONTEXT_FIELDS = frozenset({"full_name"})

# field token (de patients) -> columna real
_PATIENT_COLS = {
    "full_name": "full_name",
    "goal": "goal",
    "reason": "reason_for_consult",
    "dietary_preferences": "dietary_preferences",
    "allergies": "allergies",
}


def _load_clinical_context(cur, patient_id: str | None, agent: str) -> dict:
    if not patient_id:
        return {}
    fields = _AGENT_CONTEXT_FIELDS.get(agent, _DEFAULT_CONTEXT_FIELDS)

    # 1) Columnas de patients: SOLO las permitidas para este agente (no se leen de más).
    patient_fields = [f for f in _PATIENT_COLS if f in fields]
    ctx: dict = {}
    if patient_fields:
        cols = ", ".join(_PATIENT_COLS[f] for f in patient_fields)
        cur.execute(f"select {cols} from patients where id = %s limit 1", (patient_id, ))
        row = cur.fetchone()
        if not row:
            return {}
        ctx = {f: row[i] for i, f in enumerate(patient_fields)}

    # 2) Plan activo: meta (título+versión) o full (+ body), según el agente.
    if "plan_full" in fields or "plan_meta" in fields:
        cur.execute(
            "select title, version, body from meal_plans "
            "where patient_id = %s and status = 'active' limit 1",
            (patient_id, ),
        )
        plan = cur.fetchone()
        if plan:
            ctx["plan"] = {"title": plan[0], "version": plan[1]}
            if "plan_full" in fields:
                ctx["plan"]["body"] = plan[2]

    # 3) Evolución (últimas mediciones) sólo si el agente la necesita.
    if "metrics" in fields:
        cur.execute(
            "select measured_at, weight_kg from patient_metrics "
            "where patient_id = %s order by measured_at desc limit 3",
            (patient_id, ),
        )
        ctx["metrics"] = [
            {"date": str(r[0]), "weight_kg": float(r[1]) if r[1] is not None else None}
            for r in cur.fetchall()
        ]
    return ctx


# ── historial del hilo (bajo RLS) ───────────────────────────────────────────────

def _load_history(cur, conversation_id: str) -> list[dict]:
    """Mensajes previos de la conversación, en orden cronológico. La ventana real la
    acota el provider; acá traemos hasta 20 para tener margen."""
    cur.execute(
        "select role, content from agent_messages "
        "where conversation_id = %s order by created_at asc limit 20",
        (conversation_id, ),
    )
    return [{"role": r[0], "content": r[1]} for r in cur.fetchall()]


# ── persistencia ────────────────────────────────────────────────────────────────

def _ensure_conversation(cur, ctx, agent: str, patient_id, conversation_id) -> str:
    if conversation_id:
        # RLS garantiza que sólo se ve/usa una conversación del propio tenant.
        cur.execute("select id from agent_conversations where id = %s", (conversation_id, ))
        if cur.fetchone():
            return conversation_id
    cur.execute(
        "insert into agent_conversations (tenant_id, region, agent, patient_id) "
        "values (%s, %s, %s, %s) returning id",
        (ctx.tenant_id, ctx.region, agent, patient_id),
    )
    return str(cur.fetchone()[0])


def _insert_message(cur, ctx, conversation_id: str, role: str, content: str) -> None:
    cur.execute(
        "insert into agent_messages (tenant_id, region, conversation_id, role, content) "
        "values (%s, %s, %s, %s, %s)",
        (ctx.tenant_id, ctx.region, conversation_id, role, content),
    )


def _insert_run(cur, ctx, conversation_id: str, agent: str, result, latency_ms: int) -> None:
    cur.execute(
        "insert into agent_runs "
        "(tenant_id, region, conversation_id, agent, model, input_tokens, output_tokens, "
        " latency_ms, status) "
        "values (%s, %s, %s, %s, %s, %s, %s, %s, %s)",
        (
            ctx.tenant_id, ctx.region, conversation_id, agent, result.model,
            result.input_tokens, result.output_tokens, latency_ms, result.status,
        ),
    )
