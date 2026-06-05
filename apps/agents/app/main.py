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
AGENTS_SHARED_SECRET = os.environ["AGENTS_SHARED_SECRET"]

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

                # Conversación primero: así cargamos el historial del hilo como
                # contexto de la inferencia (continuidad de la charla).
                conversation_id = _ensure_conversation(
                    cur, ctx, body.agent, body.patientId, body.conversationId
                )
                history = _load_history(cur, conversation_id)
                clinical = _load_clinical_context(cur, body.patientId)

                result = infer(body.agent, body.message, clinical, history)
                latency_ms = int((time.monotonic() - started) * 1000)

                _insert_message(cur, ctx, conversation_id, "user", body.message)
                _insert_message(cur, ctx, conversation_id, "assistant", result.reply)
                _insert_run(cur, ctx, conversation_id, body.agent, result, latency_ms)

    return {
        "conversationId": conversation_id,
        "reply": result.reply,
        # La crisis viaja como `blocked` + flag para que la UI muestre recursos.
        "status": "blocked" if result.crisis else "ok",
        "crisis": result.crisis,
    }


# ── lectura del contexto clínico (bajo RLS) ─────────────────────────────────────

def _load_clinical_context(cur, patient_id: str | None) -> dict:
    if not patient_id:
        return {}
    cur.execute(
        "select full_name, goal, reason_for_consult, dietary_preferences, allergies "
        "from patients where id = %s limit 1",
        (patient_id, ),
    )
    p = cur.fetchone()
    if not p:
        return {}
    ctx: dict = {
        "full_name": p[0],
        "goal": p[1],
        "reason": p[2],
        "dietary_preferences": p[3],
        "allergies": p[4],
    }
    # Plan activo: título/versión para NUTRI; body (jsonb) para que CHEF derive recetas.
    cur.execute(
        "select title, version, body from meal_plans "
        "where patient_id = %s and status = 'active' limit 1",
        (patient_id, ),
    )
    plan = cur.fetchone()
    if plan:
        ctx["plan"] = {"title": plan[0], "version": plan[1], "body": plan[2]}
    cur.execute(
        "select measured_at, weight_kg from patient_metrics "
        "where patient_id = %s order by measured_at desc limit 3",
        (patient_id, ),
    )
    ctx["metrics"] = [{"date": str(r[0]), "weight_kg": float(r[1]) if r[1] is not None else None}
                      for r in cur.fetchall()]
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
