"""Inferencia de los agentes, detrás de una abstracción de provider.

`INFERENCE_PROVIDER` elige la implementación:
  - `stub`  → respuesta determinística para dev/tests (sin API key, sin PHI a la
              nube). Estima tokens para poder ejercitar el tope de costo end-to-end.
  - `bedrock` → Claude vía AWS Bedrock (Converse API). El PHI no sale de la cuenta
                AWS; lo cubre el BAA de AWS (ver ADR 0014). Prompt caching sobre el
                bloque estable (system + contexto del paciente) para abaratar el hilo.

Todas las ramas devuelven un `InferenceResult` uniforme (texto + tokens + modelo),
así el caller persiste el audit igual sin saber qué provider corrió.
"""

from __future__ import annotations

import os
from dataclasses import dataclass

INFERENCE_PROVIDER = os.environ.get("INFERENCE_PROVIDER", "stub")
BEDROCK_MODEL_ID = os.environ.get(
    "BEDROCK_MODEL_ID", "anthropic.claude-sonnet-4-20250514-v1:0"
)
AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")
MAX_OUTPUT_TOKENS = int(os.environ.get("AGENT_MAX_OUTPUT_TOKENS", "1024"))
# Cuántos mensajes previos del hilo se mandan como contexto (acota costo/latencia).
HISTORY_WINDOW = int(os.environ.get("AGENT_HISTORY_WINDOW", "10"))


@dataclass(frozen=True)
class InferenceResult:
    reply: str
    input_tokens: int | None
    output_tokens: int | None
    model: str


# ── system prompts por agente ──────────────────────────────────────────────────
# Acotan el rol y la seguridad. El output SIEMPRE es un borrador que revisa el
# profesional; el agente nunca habla con el paciente ni inventa datos clínicos.

_NUTRI_SYSTEM = (
    "Sos NUTRI, un asistente para el NUTRICIONISTA (no para el paciente). Ayudás a "
    "leer la evolución del paciente y a pensar ajustes del plan. Reglas: basate SOLO "
    "en el contexto provisto; si falta un dato, decilo en vez de inventarlo; no "
    "diagnostiques ni prescribís medicación; tu respuesta es un BORRADOR que el "
    "profesional revisa y aprueba antes de aplicar. Respondé en español rioplatense, "
    "claro y conciso."
)

_CHEF_SYSTEM = (
    "Sos CHEF, un asistente para el NUTRICIONISTA. Traducís el plan alimentario activo "
    "a recetas/preparaciones concretas. Reglas IRRENUNCIABLES: respetá SIEMPRE las "
    "alergias y restricciones del paciente — nunca sugieras un ingrediente prohibido; "
    "mantené las porciones y los macros objetivo del plan; basate SOLO en el contexto "
    "provisto. Tu respuesta es un BORRADOR que el profesional revisa. Respondé en "
    "español rioplatense."
)

_SYSTEM_BY_AGENT = {"nutri": _NUTRI_SYSTEM, "chef": _CHEF_SYSTEM}


def _clinical_block(clinical: dict) -> str:
    """Serializa el contexto clínico (ya cargado bajo RLS) a texto para el prompt."""
    if not clinical:
        return "Sin contexto de paciente."
    lines: list[str] = []
    if clinical.get("full_name"):
        lines.append(f"Paciente: {clinical['full_name']}")
    if clinical.get("goal"):
        lines.append(f"Objetivo: {clinical['goal']}")
    if clinical.get("reason"):
        lines.append(f"Motivo de consulta: {clinical['reason']}")
    if clinical.get("dietary_preferences"):
        lines.append(f"Preferencias/restricciones: {clinical['dietary_preferences']}")
    if clinical.get("allergies"):
        lines.append(f"Alergias: {clinical['allergies']}")
    plan = clinical.get("plan")
    if plan:
        lines.append(f"Plan activo: «{plan['title']}» (v{plan['version']}).")
        body = plan.get("body")
        if body:
            lines.append(f"Estructura del plan (JSON): {body}")
    metrics = clinical.get("metrics") or []
    if metrics:
        serie = "; ".join(
            f"{m['date']}: {m['weight_kg']} kg"
            for m in metrics
            if m.get("weight_kg") is not None
        )
        if serie:
            lines.append(f"Últimas mediciones: {serie}")
    return "\n".join(lines)


def infer(agent: str, message: str, clinical: dict, history: list[dict]) -> InferenceResult:
    """Punto único de inferencia. `history` = mensajes previos del hilo
    [{role, content}], en orden cronológico."""
    if INFERENCE_PROVIDER == "stub":
        return _stub(agent, message, clinical)
    if INFERENCE_PROVIDER == "bedrock":
        return _bedrock(agent, message, clinical, history)
    raise RuntimeError(f"INFERENCE_PROVIDER desconocido: {INFERENCE_PROVIDER}")


# ── stub (dev/tests) ───────────────────────────────────────────────────────────

def _estimate_tokens(text: str) -> int:
    # Aproximación grosera (~4 chars/token) sólo para que el audit y el tope tengan
    # números reales en dev. El provider real reporta los tokens exactos.
    return max(1, len(text) // 4)


def _stub(agent: str, message: str, clinical: dict) -> InferenceResult:
    block = _clinical_block(clinical)
    if agent == "chef":
        body = (
            f"[CHEF · borrador, revisá antes de aplicar]\n{block}\n\n"
            f"Sobre tu pedido: «{message}» — idea preliminar: armá preparaciones simples "
            f"para cada comida del plan, manteniendo porciones y macros objetivo y "
            f"evitando todo lo listado en alergias/restricciones."
        )
    else:
        body = (
            f"[{agent.upper()} · borrador, revisá antes de aplicar]\n{block}\n\n"
            f"Sobre tu consulta: «{message}» — sugerencia preliminar: revisá la adherencia "
            f"y la evolución reciente y ajustá porciones/macros en consecuencia."
        )
    reply = f"{body}\n\n(Respuesta de DEV/stub: sin IA real hasta firmar el BAA.)"
    return InferenceResult(
        reply=reply,
        input_tokens=_estimate_tokens(block + message),
        output_tokens=_estimate_tokens(reply),
        model=f"stub:{agent}",
    )


# ── bedrock (Claude en AWS, bajo BAA) ──────────────────────────────────────────

def _bedrock(agent: str, message: str, clinical: dict, history: list[dict]) -> InferenceResult:
    # Import perezoso: boto3 sólo hace falta si este provider está activo.
    import boto3

    system_prompt = _SYSTEM_BY_AGENT.get(agent, _NUTRI_SYSTEM)
    # Bloque estable (rol + contexto del paciente) → se cachea; el hilo varía después.
    system = [
        {"text": f"{system_prompt}\n\n--- Contexto del paciente ---\n{_clinical_block(clinical)}"},
        {"cachePoint": {"type": "default"}},
    ]
    messages = [
        {"role": m["role"], "content": [{"text": m["content"]}]}
        for m in history[-HISTORY_WINDOW:]
        if m.get("role") in ("user", "assistant") and m.get("content")
    ]
    messages.append({"role": "user", "content": [{"text": message}]})

    client = boto3.client("bedrock-runtime", region_name=AWS_REGION)
    resp = client.converse(
        modelId=BEDROCK_MODEL_ID,
        system=system,
        messages=messages,
        inferenceConfig={"maxTokens": MAX_OUTPUT_TOKENS, "temperature": 0.3},
    )
    reply = resp["output"]["message"]["content"][0]["text"]
    usage = resp.get("usage", {})
    # Sumamos los tokens cacheados al input para el tope (igual se facturan, baratos).
    input_tokens = (
        usage.get("inputTokens", 0)
        + usage.get("cacheReadInputTokens", 0)
        + usage.get("cacheWriteInputTokens", 0)
    )
    return InferenceResult(
        reply=reply,
        input_tokens=input_tokens or None,
        output_tokens=usage.get("outputTokens"),
        model=f"bedrock:{BEDROCK_MODEL_ID}",
    )
