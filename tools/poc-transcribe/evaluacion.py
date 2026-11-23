"""Evaluación compartida de la prueba de concepto (KAN-92): misma métrica para cada proveedor."""

from __future__ import annotations

import json
import re
import statistics
import unicodedata
from pathlib import Path

AQUI = Path(__file__).resolve().parent


def normalizar(texto: str) -> list[str]:
    t = unicodedata.normalize("NFKD", texto.lower())
    t = "".join(c for c in t if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9ñ ]+", " ", t).split()


def wer(ref: list[str], hip: list[str]) -> float:
    prev = list(range(len(hip) + 1))
    for i, r in enumerate(ref, 1):
        cur = [i] + [0] * len(hip)
        for j, h in enumerate(hip, 1):
            cur[j] = min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (r != h))
        prev = cur
    return prev[-1] / max(len(ref), 1)


def vocabulario() -> list[str]:
    return [l.strip() for l in (AQUI / "vocabulario.txt").read_text(encoding="utf-8").splitlines() if l.strip()]


def evaluar(
    *,
    proveedor: str,
    audio: Path,
    modo: str,
    con_vocabulario: bool,
    duracion_s: float,
    lineas: list[str],
    texto: str,
    retrasos: list[float],
    guion: Path,
) -> dict:
    """Imprime la transcripción y el resumen, y los guarda en out/."""
    print("\n".join(lineas))

    ref = normalizar(re.sub(r"^[PD]:", "", guion.read_text(encoding="utf-8"), flags=re.M))
    hip = normalizar(texto)
    terminos = [t for t in normalizar(" ".join(vocabulario())) if t in ref]
    acertados = [t for t in terminos if t in hip]

    resumen = {
        "proveedor": proveedor,
        "audio": audio.name,
        "modo": modo,
        "vocabulario": con_vocabulario,
        "duracion_s": round(duracion_s, 1),
        "wer_aprox": round(wer(ref, hip), 3),
        "recall_vocabulario": f"{len(acertados)}/{len(terminos)}",
        "terminos_perdidos": sorted(set(terminos) - set(acertados)),
        "retraso_final_mediana_s": round(statistics.median(retrasos), 2) if retrasos else None,
        "retraso_final_p90_s": round(statistics.quantiles(retrasos, n=10)[-1], 2) if len(retrasos) > 1 else None,
    }
    print("\n" + json.dumps(resumen, ensure_ascii=False, indent=2))

    salida = AQUI / "out" / f"{proveedor}-{audio.stem}-{modo}{'-vocab' if con_vocabulario else ''}.json"
    salida.parent.mkdir(exist_ok=True)
    salida.write_text(json.dumps({"resumen": resumen, "transcripcion": lineas}, ensure_ascii=False, indent=2), encoding="utf-8")
    return resumen
