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

import logging
import os
import unicodedata
from dataclasses import dataclass

logger = logging.getLogger("nutreitor.agents.inference")

INFERENCE_PROVIDER = os.environ.get("INFERENCE_PROVIDER", "stub")
BEDROCK_MODEL_ID = os.environ.get(
    "BEDROCK_MODEL_ID", "anthropic.claude-sonnet-4-20250514-v1:0"
)
# Bedrock se configura aparte de la región de la app (ADR 0048: hoy las dos son
# us-east-1). Sin BEDROCK_REGION, cae en la región del proceso.
BEDROCK_REGION = os.environ.get("BEDROCK_REGION") or os.environ.get("AWS_REGION", "us-east-1")
MAX_OUTPUT_TOKENS = int(os.environ.get("AGENT_MAX_OUTPUT_TOKENS", "1024"))
# Cuántos mensajes previos del hilo se mandan como contexto (acota costo/latencia).
HISTORY_WINDOW = int(os.environ.get("AGENT_HISTORY_WINDOW", "10"))


@dataclass(frozen=True)
class InferenceResult:
    reply: str
    input_tokens: int | None
    output_tokens: int | None
    model: str
    # ok | crisis (guardrail PSICO) | error. Se persiste en agent_runs.status y la
    # crisis se le notifica al profesional asignado.
    status: str = "ok"
    crisis: bool = False


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

_PSICO_SYSTEM = (
    "Sos PSICO, un asistente de ACOMPAÑAMIENTO emocional para el PACIENTE en su "
    "relación con la comida y el tratamiento. NO sos terapia ni un servicio de "
    "emergencia, y NO reemplazás a un profesional. Reglas IRRENUNCIABLES: no "
    "diagnostiques ni indiques medicación; ofrecé escucha, psicoeducación y técnicas "
    "simples de regulación; si detectás riesgo (autolesión, suicidio, daño a terceros) "
    "NO sigas como si nada: validá, sugerí buscar ayuda inmediata y derivá a recursos "
    "de emergencia y a su profesional. Hablás con la persona en primera persona, en "
    "español rioplatense, con calidez y sin tecnicismos. Recordale que su profesional "
    "puede ver estas conversaciones."
)

_SYSTEM_BY_AGENT = {"nutri": _NUTRI_SYSTEM, "chef": _CHEF_SYSTEM, "psico": _PSICO_SYSTEM}

# Detección de crisis (red de seguridad heurística, vale para todo provider).
# Deliberadamente SENSIBLE: preferimos un falso positivo —mostrar recursos de más— a
# dejar pasar una crisis real. Se evalúa en DOS capas (input del paciente y output del
# modelo); el corte heurístico va SIEMPRE primero. Cuando Bedrock esté activo, acá se
# puede sumar un clasificador del propio modelo como segunda capa (ver gancho en
# `_model_crisis_classifier`). Patrones escritos SIN tildes: se comparan normalizados
# (minúsculas + sin acentos), así "daño/dano", "más/mas", etc. caen igual.
_CRISIS_PATTERNS = (
    "suicid", "matarme", "me quiero morir", "quiero morir", "no quiero vivir",
    "no quiero seguir", "no quiero estar", "quitarme la vida", "terminar con todo",
    "terminar con mi vida", "acabar con todo", "acabar con mi vida", "lastimarme",
    "hacerme dano", "hacerme mal", "autolesion", "autolastim", "cortarme",
    "no aguanto mas", "no doy mas", "desaparecer", "dejar de existir",
    "mejor no estar", "no vale la pena vivir", "no vale la pena seguir",
    "estoy en peligro", "ya no quiero", "me quiero ir para siempre",
)


def _normalize(text: str) -> str:
    """minúsculas + sin acentos, para que la heurística no se escape por tildes."""
    nfkd = unicodedata.normalize("NFKD", text.lower())
    return "".join(c for c in nfkd if not unicodedata.combining(c))

# Recursos de emergencia (Argentina). Configurables a futuro por región del tenant.
_CRISIS_RESOURCES_AR = (
    "Centro de Asistencia al Suicida — Línea 135 (CABA/GBA) o 0800-345-1435 (todo el país)",
    "Emergencias: 911 · Emergencias médicas SAME: 107",
    "Salud mental (Ministerio de Salud): 0800-222-1002, opción 4",
)


def _detect_crisis(text: str) -> bool:
    norm = _normalize(text)
    return any(p in norm for p in _CRISIS_PATTERNS)


def _model_crisis_classifier(text: str) -> bool:
    """Gancho (no implementado) para una segunda capa de detección con el propio
    modelo, cuando Bedrock esté activo. El corte heurístico de `_detect_crisis` va
    SIEMPRE primero; esto sólo sumaría recall. Hoy es no-op."""
    return False


def _crisis_result() -> InferenceResult:
    recursos = "\n".join(f"• {r}" for r in _CRISIS_RESOURCES_AR)
    reply = (
        "Lo que estás sintiendo importa y no tenés que atravesarlo solo/a. No soy un "
        "servicio de emergencia, pero quiero que estés a salvo ahora mismo. Si pensás "
        "en hacerte daño o estás en peligro, comunicate ya con:\n\n"
        f"{recursos}\n\n"
        "Avisé a tu profesional para que pueda acompañarte. Si podés, contale a alguien "
        "de confianza lo que te pasa. Estoy acá para escucharte."
    )
    return InferenceResult(
        reply=reply,
        input_tokens=None,
        output_tokens=None,
        model="guardrail:crisis",
        status="crisis",
        crisis=True,
    )


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
    # Capa 1 (PSICO): la crisis en el INPUT del paciente se corta ANTES de inferir.
    # Vale para todo provider; el corte heurístico va siempre primero.
    if agent == "psico" and (_detect_crisis(message) or _model_crisis_classifier(message)):
        return _crisis_result()

    if INFERENCE_PROVIDER == "stub":
        result = _stub(agent, message, clinical)
    elif INFERENCE_PROVIDER == "bedrock":
        result = _bedrock(agent, message, clinical, history)
    else:
        raise RuntimeError(f"INFERENCE_PROVIDER desconocido: {INFERENCE_PROVIDER}")

    # Capa 2 (PSICO): si la PROPIA respuesta del modelo toca temas de riesgo, no la
    # devolvemos: aplicamos el mismo guardrail (recursos + marca de crisis).
    if agent == "psico" and (_detect_crisis(result.reply) or _model_crisis_classifier(result.reply)):
        return _crisis_result()
    return result


# ── stub (dev/tests) ───────────────────────────────────────────────────────────

def _estimate_tokens(text: str) -> int:
    # Aproximación grosera (~4 chars/token) sólo para que el audit y el tope tengan
    # números reales en dev. El provider real reporta los tokens exactos.
    return max(1, len(text) // 4)


def _stub(agent: str, message: str, clinical: dict) -> InferenceResult:
    block = _clinical_block(clinical)
    if agent == "chef":
        body = (
            f"[CHEF]\nTu plan: {block}\n\n"
            f"Sobre tu pedido: «{message}» — idea: con los alimentos de tu plan podés armar "
            f"preparaciones simples respetando tus porciones y evitando lo que no te cae bien. "
            f"Si algo no te cierra, consultalo con tu profesional."
        )
    elif agent == "psico":
        body = (
            "[PSICO]\nGracias por compartir cómo te sentís. No soy terapia ni un servicio de "
            f"emergencia, pero estoy para escucharte. Sobre lo que me contás («{message}»): "
            "probá registrar qué situaciones disparan eso y hablalo con tu profesional, que "
            "puede ver estas charlas y acompañarte mejor."
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

    try:
        client = boto3.client("bedrock-runtime", region_name=BEDROCK_REGION)
        resp = client.converse(
            modelId=BEDROCK_MODEL_ID,
            system=system,
            messages=messages,
            inferenceConfig={"maxTokens": MAX_OUTPUT_TOKENS, "temperature": 0.3},
        )
        # No accedemos a la cadena cruda: si Bedrock corta por content filter / max_tokens
        # / stopReason inesperado, puede no venir texto. Extraemos defensivamente.
        parts = (resp.get("output") or {}).get("message", {}).get("content") or []
        reply = next((p["text"] for p in parts if isinstance(p, dict) and p.get("text")), None)
        if not reply:
            raise ValueError(f"respuesta sin texto (stopReason={resp.get('stopReason')!r})")
    except Exception as exc:  # noqa: BLE001 — degradamos cualquier fallo del provider
        logger.warning("bedrock falló para agent=%s: %s", agent, exc)
        return InferenceResult(
            reply=(
                "No pude generar una respuesta en este momento. Probá de nuevo en un rato; "
                "si sigue, avisale a tu profesional."
            ),
            input_tokens=None,
            output_tokens=None,
            model=f"bedrock:{BEDROCK_MODEL_ID}",
            status="error",
        )

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
