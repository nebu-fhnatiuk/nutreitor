"""Borrador de plan de NUTRI (Fase 4.3, ADR 0020).

NUTRI PROPONE comidas → alimentos del catálogo (por slug) + gramos. No escribe
valores nutricionales: la API resuelve los slugs contra el catálogo, calcula los
macros y abre el borrador en el editor sin guardar (lo revisa el profesional).

  - `stub`: armado determinístico (día tipo base escalado a las kcal objetivo,
    excluyendo por alergias/preferencias). Sin IA ni PHI afuera.
  - `bedrock`: Claude elige del catálogo (ya filtrado) y responde JSON.
"""

from __future__ import annotations

import json
import logging

from .inference import (
    AWS_REGION,
    BEDROCK_MODEL_ID,
    INFERENCE_PROVIDER,
    MAX_OUTPUT_TOKENS,
    InferenceResult,
    _clinical_block,
    _estimate_tokens,
    _normalize,
)

logger = logging.getLogger("nutreitor.agents.plan_draft")

DEFAULT_KCAL = 2000


def load_catalog(cur) -> list[dict]:
    """Catálogo global (referencia, sin PHI). Valores por 100 g."""
    cur.execute(
        "select slug, name, food_group, energy_kcal, protein_g, carbs_g, fat_g "
        "from food_catalog order by food_group, name"
    )
    return [
        {
            "slug": r[0],
            "name": r[1],
            "group": r[2],
            "kcal": float(r[3]),
            "protein_g": float(r[4]),
            "carbs_g": float(r[5]),
            "fat_g": float(r[6]),
        }
        for r in cur.fetchall()
    ]


# ── exclusiones por alergias / preferencias ────────────────────────────────────
# Heurística conservadora sobre texto libre: preferimos excluir de más. El
# profesional revisa igual el borrador. (disparadores en el texto del paciente →
# fragmentos de slug/grupo a excluir; todo normalizado sin tildes.)
_EXCLUSION_RULES: tuple[tuple[tuple[str, ...], tuple[str, ...]], ...] = (
    (("lactosa", "leche", "lacteo", "aplv", "caseina"),
     ("lacteos", "leche", "yogur", "queso", "ricota", "crema-de-leche", "manteca", "proteina-whey")),
    (("gluten", "celiac", "tacc", "trigo"),
     ("avena", "pan-", "fideos", "harina", "galletitas")),
    (("huevo",), ("huevo", "clara", "mayonesa")),
    (("pescado", "marisco"), ("pescados",)),
    (("mani",), ("mani",)),
    (("frutos secos", "nuez", "nueces", "almendra"), ("frutos secos", "almendra", "nueces", "pasta-de-mani")),
    (("soja",), ("soja", "tofu")),
    (("vegetarian", "vegano", "vegana", "veggie"), ("carnes", "pescados", "jamon")),
    (("vegano", "vegana"), ("lacteos", "huevo", "clara", "miel", "proteina-whey", "mayonesa")),
)


def excluded_slugs(catalog: list[dict], allergies: str | None, preferences: str | None) -> dict[str, str]:
    """slug → motivo ("alergia: maní"). Reglas por categoría + coincidencia directa
    de palabras de las alergias con el nombre del alimento."""
    out: dict[str, str] = {}
    for label, text in (("alergias", allergies), ("preferencias", preferences)):
        norm = _normalize(text or "")
        if not norm.strip():
            continue
        frags: list[str] = []
        for triggers, foods in _EXCLUSION_RULES:
            if any(t in norm for t in triggers):
                frags.extend(foods)
        words = [w for w in "".join(c if c.isalnum() else " " for c in norm).split() if len(w) >= 4]
        for f in catalog:
            hay = f"{f['slug']} {_normalize(f['group'])}"
            name = _normalize(f["name"])
            if any(fr in hay for fr in frags) or (
                label == "alergias" and any(w in name for w in words)
            ):
                out.setdefault(f["slug"], label)
    return out


def target_kcal(targets: dict | None) -> tuple[float, bool]:
    """kcal objetivo (de kcal o de los macros) y si salió del default."""
    t = targets or {}
    if t.get("kcal"):
        return float(t["kcal"]), False
    p, c, g = (t.get(k) or 0 for k in ("protein_g", "carbs_g", "fat_g"))
    if p or c or g:
        return float(p * 4 + c * 4 + g * 9), False
    return float(DEFAULT_KCAL), True


# ── stub: día tipo base, escalado ──────────────────────────────────────────────
# (comida, hora, parte de las kcal, [(candidatos por prioridad, gramos base)])
_BASE_DAY = (
    ("Desayuno", "08:00", 0.25, (
        (("leche-descremada", "yogur-descremado-natural", "bebida-de-almendras"), 200),
        (("avena-arrollada", "pan-integral", "galletas-de-arroz"), 40),
        (("banana", "manzana", "frutillas"), 120),
        (("queso-untable-descremado", "palta", "pasta-de-mani"), 30),
    )),
    ("Almuerzo", "13:00", 0.35, (
        (("pechuga-pollo-cocida", "nalga-vacuna-cocida", "merluza-cocida", "tofu", "lentejas-cocidas"), 130),
        (("arroz-integral-cocido", "quinoa-cocida", "papa-hervida"), 150),
        (("brocoli-cocido", "zapallito-cocido", "acelga-cocida"), 150),
        (("tomate-crudo", "lechuga", "zanahoria-cruda"), 80),
        (("aceite-de-oliva", "aceite-de-girasol"), 10),
    )),
    ("Merienda", "17:00", 0.15, (
        (("yogur-descremado-natural", "yogur-griego-natural", "bebida-de-almendras"), 170),
        (("manzana", "mandarina", "kiwi"), 120),
        (("galletas-de-arroz", "pan-integral", "galletitas-de-agua"), 25),
        (("almendras", "nueces", "semillas-de-girasol"), 15),
    )),
    ("Cena", "21:00", 0.25, (
        (("merluza-cocida", "pechuga-pollo-cocida", "huevo-entero", "tofu", "garbanzos-cocidos"), 130),
        (("batata-hervida", "papa-hervida", "fideos-integrales-cocidos"), 150),
        (("zapallo-cocido", "espinaca-cocida", "berenjena-cocida"), 150),
        (("aceite-de-oliva", "aceite-de-girasol"), 10),
    )),
)


# Cuánto se puede estirar/achicar una comida base para acercarse al objetivo: más
# allá, las cantidades dejan de ser realistas (550 ml de bebida en una merienda).
_MIN_FACTOR, _MAX_FACTOR = 0.5, 1.75


def _round5(g: float) -> int:
    return max(5, int(round(g / 5.0)) * 5)


def _stub_proposal(catalog: list[dict], excluded: dict[str, str], targets: dict | None) -> dict:
    by_slug = {f["slug"]: f for f in catalog if f["slug"] not in excluded}
    kcal, defaulted = target_kcal(targets)
    meals = []
    for name, time, share, slots in _BASE_DAY:
        picks = []
        for candidates, grams in slots:
            food = next((by_slug[s] for s in candidates if s in by_slug), None)
            if food:
                picks.append((food, grams))
        base = sum(f["kcal"] * g / 100 for f, g in picks)
        if not picks or base <= 0:
            continue
        factor = min(max(kcal * share / base, _MIN_FACTOR), _MAX_FACTOR)
        meals.append({
            "name": name,
            "time": time,
            "items": [{"slug": f["slug"], "grams": _round5(g * factor)} for f, g in picks],
        })
    total = sum(
        by_slug[i["slug"]]["kcal"] * i["grams"] / 100 for m in meals for i in m["items"]
    )
    notes = [
        f"Borrador automático (modo de prueba, sin IA): día tipo de ~{round(total)} kcal "
        f"para un objetivo de {round(kcal)}, repartido 25 % desayuno, 35 % almuerzo, "
        "15 % merienda y 25 % cena."
    ]
    if defaulted:
        notes.append(f"Sin objetivo cargado: se usó {DEFAULT_KCAL} kcal de referencia.")
    if excluded:
        names = sorted({f["name"] for f in catalog if f["slug"] in excluded})
        notes.append(
            f"Se excluyeron {len(names)} alimentos por alergias/preferencias "
            f"(ej.: {', '.join(names[:6])})."
        )
    notes.append(
        "Las cantidades escalan las kcal, no ajustan el reparto de macros: revisá "
        "proteínas y porciones antes de guardar."
    )
    return {"meals": meals, "notes": " ".join(notes)}


# ── bedrock ────────────────────────────────────────────────────────────────────

_DRAFT_SYSTEM = (
    "Sos NUTRI, asistente del NUTRICIONISTA. Armás un BORRADOR de plan alimentario de "
    "un día tipo que el profesional revisa antes de usar. Reglas IRRENUNCIABLES: usá "
    "SOLO alimentos de la lista provista, por su slug exacto; respetá alergias y "
    "preferencias; ajustá los gramos para acercarte al objetivo de kcal y macros; "
    "comidas habituales en Argentina (desayuno, almuerzo, merienda, cena; colaciones "
    "si hace falta). No inventes valores nutricionales. Respondé SOLO con JSON, sin "
    "texto alrededor, con esta forma: "
    '{"meals":[{"name":"Desayuno","time":"08:00","items":[{"slug":"...","grams":40,'
    '"note":"opcional"}]}],"notes":"criterio del armado y qué revisar, en español '
    'rioplatense, máx. 3 oraciones"}'
)


def _catalog_block(catalog: list[dict], excluded: dict[str, str]) -> str:
    lines = ["slug | nombre | grupo | kcal/P/C/G por 100 g"]
    for f in catalog:
        if f["slug"] in excluded:
            continue
        lines.append(
            f"{f['slug']} | {f['name']} | {f['group']} | "
            f"{f['kcal']:.0f}/{f['protein_g']:.1f}/{f['carbs_g']:.1f}/{f['fat_g']:.1f}"
        )
    return "\n".join(lines)


def _parse_json(text: str) -> dict:
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end <= start:
        raise ValueError("la respuesta no trae JSON")
    data = json.loads(text[start : end + 1])
    if not isinstance(data, dict) or not isinstance(data.get("meals"), list):
        raise ValueError("JSON sin 'meals'")
    return data


def _bedrock_proposal(
    clinical: dict, catalog: list[dict], excluded: dict[str, str], targets: dict | None, instructions: str | None
) -> tuple[dict, InferenceResult]:
    import boto3

    model = f"bedrock:{BEDROCK_MODEL_ID}"
    kcal, _ = target_kcal(targets)
    system = [
        {"text": f"{_DRAFT_SYSTEM}\n\n--- Alimentos disponibles ---\n{_catalog_block(catalog, excluded)}"},
        {"cachePoint": {"type": "default"}},
    ]
    ask = (
        f"--- Paciente ---\n{_clinical_block(clinical)}\n\n"
        f"Objetivo diario: {json.dumps(targets or {'kcal': kcal}, ensure_ascii=False)}\n"
        f"Indicaciones del profesional: {instructions or 'ninguna'}"
    )
    client = boto3.client("bedrock-runtime", region_name=AWS_REGION)
    resp = client.converse(
        modelId=BEDROCK_MODEL_ID,
        system=system,
        messages=[{"role": "user", "content": [{"text": ask}]}],
        inferenceConfig={"maxTokens": max(MAX_OUTPUT_TOKENS, 2048), "temperature": 0.2},
    )
    parts = (resp.get("output") or {}).get("message", {}).get("content") or []
    text = next((p["text"] for p in parts if isinstance(p, dict) and p.get("text")), "")
    proposal = _parse_json(text)
    # Defensa: lo excluido no entra aunque el modelo lo proponga.
    for m in proposal["meals"]:
        m["items"] = [i for i in m.get("items", []) if i.get("slug") not in excluded]
    usage = resp.get("usage", {})
    result = InferenceResult(
        reply=text,
        input_tokens=(
            usage.get("inputTokens", 0)
            + usage.get("cacheReadInputTokens", 0)
            + usage.get("cacheWriteInputTokens", 0)
        ) or None,
        output_tokens=usage.get("outputTokens"),
        model=model,
    )
    return proposal, result


def propose(
    clinical: dict, catalog: list[dict], targets: dict | None, instructions: str | None
) -> tuple[dict | None, InferenceResult]:
    """Propuesta (o None si el provider falló) + resultado para el audit."""
    excluded = excluded_slugs(catalog, clinical.get("allergies"), clinical.get("dietary_preferences"))
    if INFERENCE_PROVIDER == "stub":
        proposal = _stub_proposal(catalog, excluded, targets)
        text = json.dumps(proposal, ensure_ascii=False)
        return proposal, InferenceResult(
            reply=text,
            input_tokens=_estimate_tokens(_clinical_block(clinical) + (instructions or "")),
            output_tokens=_estimate_tokens(text),
            model="stub:nutri-draft",
        )
    if INFERENCE_PROVIDER == "bedrock":
        try:
            return _bedrock_proposal(clinical, catalog, excluded, targets, instructions)
        except Exception as exc:  # noqa: BLE001 — degradamos cualquier fallo del provider
            logger.warning("bedrock falló armando el borrador: %s", exc)
            return None, InferenceResult(
                reply="", input_tokens=None, output_tokens=None,
                model=f"bedrock:{BEDROCK_MODEL_ID}", status="error",
            )
    raise RuntimeError(f"INFERENCE_PROVIDER desconocido: {INFERENCE_PROVIDER}")
