"""Prueba de concepto de KAN-92: el mismo guion por Speechmatics en tiempo real.

Recorre el camino equivalente al del ADR 0050 para Transcribe:

  1. "La API" pide a Speechmatics una clave temporal de tiempo real (válida 60 s para
     conectar) con la clave de la cuenta, que nunca llega al navegador.
  2. "El navegador" abre el WebSocket con esa clave, manda la configuración
     (idioma, diarización y vocabulario) y el audio crudo en bloques de 100 ms, a
     ritmo de tiempo real.
  3. Se guardan los resultados finales y se mide igual que con Transcribe
     (evaluacion.py).

Diferencia con Transcribe: la configuración la manda el cliente en el primer
mensaje, no queda fijada por una firma. En producción, el control de parámetros
tendría que venir de otro lado (lo anota el README).

Requiere SPEECHMATICS_API_KEY (cuenta del portal de Speechmatics).

Uso:
  python3 speechmatics.py out/consulta-mono.wav                 # presencial, diarización
  python3 speechmatics.py out/consulta-mono.wav --vocabulario   # con vocabulario adicional
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import time
import urllib.request
import wave
from pathlib import Path

import websockets

from evaluacion import AQUI, evaluar, vocabulario

CHUNK_S = 0.1
REGIONES = {"us": "wss://us2.rt.speechmatics.com/v2", "eu": "wss://eu2.rt.speechmatics.com/v2"}


# ── 1. Clave temporal (en producción la emite la API después de auth + consentimiento) ──

def clave_temporal(api_key: str, ttl: int = 60) -> str:
    req = urllib.request.Request(
        "https://mp.speechmatics.com/v1/api_keys?type=rt",
        data=json.dumps({"ttl": ttl}).encode(),
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.load(r)["key_value"]


# ── 2. Sesión de tiempo real ──

def configuracion(rate: int, idioma: str, con_vocabulario: bool) -> dict:
    tc: dict = {
        "language": idioma,
        "operating_point": "enhanced",
        "diarization": "speaker",
        "enable_partials": False,
        "max_delay": 2.0,
    }
    if con_vocabulario:
        tc["additional_vocab"] = [{"content": t} for t in vocabulario()]
    return {
        "message": "StartRecognition",
        "audio_format": {"type": "raw", "encoding": "pcm_s16le", "sample_rate": rate},
        "transcription_config": tc,
    }


async def transcribir(url: str, inicio_msg: dict, pcm: bytes, rate: int, velocidad: float) -> tuple[list[dict], list[float]]:
    bytes_chunk = int(rate * CHUNK_S) * 2
    finales: list[dict] = []
    retrasos: list[float] = []
    empezado = asyncio.Event()

    async with websockets.connect(url, max_size=None) as ws:
        await ws.send(json.dumps(inicio_msg))
        inicio = time.monotonic()

        async def enviar() -> None:
            await empezado.wait()
            seq = 0
            for i in range(0, len(pcm), bytes_chunk):
                await ws.send(pcm[i : i + bytes_chunk])
                seq += 1
                await asyncio.sleep(CHUNK_S / velocidad)
            await ws.send(json.dumps({"message": "EndOfStream", "last_seq_no": seq}))

        async def recibir() -> None:
            nonlocal inicio
            async for data in ws:
                msg = json.loads(data)
                tipo = msg.get("message")
                if tipo == "RecognitionStarted":
                    inicio = time.monotonic()
                    empezado.set()
                elif tipo == "AddTranscript" and msg["results"]:
                    finales.append(msg)
                    dicho = msg["metadata"]["end_time"] / velocidad
                    retrasos.append(time.monotonic() - inicio - dicho)
                elif tipo == "Error":
                    raise RuntimeError(f"{msg.get('type')}: {msg.get('reason')}")
                elif tipo == "Warning":
                    print(f"[aviso] {msg.get('type')}: {msg.get('reason')}")
                elif tipo == "EndOfTranscript":
                    return

        await asyncio.gather(enviar(), recibir())
    return finales, retrasos


def lineas_por_hablante(finales: list[dict]) -> list[str]:
    """Agrupa las palabras en turnos por hablante (S1, S2…)."""
    lineas: list[str] = []
    actual, palabras = None, []
    for msg in finales:
        for r in msg["results"]:
            alt = r["alternatives"][0]
            hablante = alt.get("speaker", "?")
            if r["type"] == "word" and hablante != actual:
                if palabras:
                    lineas.append(f"{actual}: {' '.join(palabras)}")
                actual, palabras = hablante, []
            if r["type"] == "punctuation" and palabras:
                palabras[-1] += alt["content"]
            else:
                palabras.append(alt["content"])
    if palabras:
        lineas.append(f"{actual}: {' '.join(palabras)}")
    return lineas


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("audio", type=Path)
    ap.add_argument("--vocabulario", action="store_true", help="manda vocabulario.txt como additional_vocab")
    ap.add_argument("--idioma", default="es")
    ap.add_argument("--region", choices=REGIONES, default="us")
    ap.add_argument("--velocidad", type=float, default=1.0, help=">1 manda más rápido que tiempo real")
    ap.add_argument("--guion", type=Path, default=AQUI / "consulta.txt")
    args = ap.parse_args()

    api_key = os.environ.get("SPEECHMATICS_API_KEY")
    if not api_key:
        raise SystemExit("Falta SPEECHMATICS_API_KEY.")

    with wave.open(str(args.audio), "rb") as w:
        rate, n_canales = w.getframerate(), w.getnchannels()
        pcm = w.readframes(w.getnframes())
    if n_canales != 1:
        raise SystemExit("Por ahora solo audio mono (presencial). Ver el README para el caso online.")

    url = f"{REGIONES[args.region]}?jwt={clave_temporal(api_key)}"
    finales, retrasos = asyncio.run(
        transcribir(url, configuracion(rate, args.idioma, args.vocabulario), pcm, rate, args.velocidad)
    )

    evaluar(
        proveedor=f"speechmatics-{args.region}",
        audio=args.audio,
        modo="diarizacion",
        con_vocabulario=args.vocabulario,
        duracion_s=len(pcm) / 2 / rate,
        lineas=lineas_por_hablante(finales),
        texto=" ".join(msg["metadata"]["transcript"] for msg in finales),
        retrasos=retrasos,
        guion=args.guion,
    )


if __name__ == "__main__":
    main()
