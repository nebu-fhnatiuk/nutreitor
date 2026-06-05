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

DATABASE_AGENTS_URL = os.environ["DATABASE_AGENTS_URL"]
AGENTS_SHARED_SECRET = os.environ["AGENTS_SHARED_SECRET"]
INFERENCE_PROVIDER = os.environ.get("INFERENCE_PROVIDER", "stub")

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
    ctx = verify_agent_context(x_agent_context or "", AGENTS_SHARED_SECRET)
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

                clinical = _load_clinical_context(cur, body.patientId)
                reply = _infer(body.agent, body.message, clinical)
                latency_ms = int((time.monotonic() - started) * 1000)

                conversation_id = _ensure_conversation(
                    cur, ctx, body.agent, body.patientId, body.conversationId
                )
                _insert_message(cur, ctx, conversation_id, "user", body.message)
                _insert_message(cur, ctx, conversation_id, "assistant", reply)
                _insert_run(cur, ctx, conversation_id, body.agent, latency_ms)

    return {"conversationId": conversation_id, "reply": reply, "status": "ok"}


# ── lectura del contexto clínico (bajo RLS) ─────────────────────────────────────

def _load_clinical_context(cur, patient_id: str | None) -> dict:
    if not patient_id:
        return {}
    cur.execute(
        "select full_name, goal, reason_for_consult from patients where id = %s limit 1",
        (patient_id, ),
    )
    p = cur.fetchone()
    if not p:
        return {}
    ctx: dict = {"full_name": p[0], "goal": p[1], "reason": p[2]}
    cur.execute(
        "select title, version from meal_plans where patient_id = %s and status = 'active' limit 1",
        (patient_id, ),
    )
    plan = cur.fetchone()
    if plan:
        ctx["plan"] = {"title": plan[0], "version": plan[1]}
    cur.execute(
        "select measured_at, weight_kg from patient_metrics "
        "where patient_id = %s order by measured_at desc limit 3",
        (patient_id, ),
    )
    ctx["metrics"] = [{"date": str(r[0]), "weight_kg": float(r[1]) if r[1] is not None else None}
                      for r in cur.fetchall()]
    return ctx


# ── inferencia ──────────────────────────────────────────────────────────────────

def _infer(agent: str, message: str, clinical: dict) -> str:
    if INFERENCE_PROVIDER == "stub":
        return _stub_reply(agent, message, clinical)
    # Provider real (Anthropic, bajo BAA) — se implementa cuando el BAA esté firmado.
    raise HTTPException(status_code=503, detail=f"Provider '{INFERENCE_PROVIDER}' no implementado.")


def _stub_reply(agent: str, message: str, clinical: dict) -> str:
    bits: list[str] = []
    if clinical.get("full_name"):
        line = f"Paciente {clinical['full_name']}"
        if clinical.get("goal"):
            line += f" · objetivo: {clinical['goal']}"
        bits.append(line)
    if clinical.get("plan"):
        bits.append(f"Plan activo: «{clinical['plan']['title']}» (v{clinical['plan']['version']})")
    metrics = clinical.get("metrics") or []
    if metrics and metrics[0].get("weight_kg") is not None:
        bits.append(f"Último peso: {metrics[0]['weight_kg']} kg ({metrics[0]['date']})")
    contexto = " · ".join(bits) if bits else "Sin contexto de paciente."
    return (
        f"[{agent.upper()} · borrador, revisá antes de aplicar]\n{contexto}\n\n"
        f"Sobre tu consulta: «{message}» — sugerencia preliminar: revisá la adherencia y la "
        f"evolución reciente y ajustá porciones/macros en consecuencia.\n\n"
        f"(Respuesta de DEV/stub: sin IA real hasta firmar el BAA.)"
    )


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


def _insert_run(cur, ctx, conversation_id: str, agent: str, latency_ms: int) -> None:
    cur.execute(
        "insert into agent_runs (tenant_id, region, conversation_id, agent, model, latency_ms, status) "
        "values (%s, %s, %s, %s, %s, %s, 'ok')",
        (ctx.tenant_id, ctx.region, conversation_id, agent, f"{INFERENCE_PROVIDER}:nutri", latency_ms),
    )
