"""Prueba de concepto de KAN-92: streaming a Amazon Transcribe por WebSocket prefirmado.

Recorre el mismo camino que propone el ADR 0050, sin el navegador:

  1. "La API" firma una URL `wss://` con SigV4 (válida 5 min para conectar) que fija
     idioma, formato, vocabulario y modo de hablantes. El cliente no puede cambiarlos
     sin romper la firma.
  2. "El navegador" abre el WebSocket y manda el audio en frames de event-stream de
     100 ms, a ritmo de tiempo real.
  3. Se reciben los resultados parciales y finales; se guardan los finales.

Después compara contra el guion: WER aproximado, recall del vocabulario técnico y el
retraso entre lo dicho y la llegada del resultado final.

Requiere credenciales de AWS con `transcribe:StartStreamTranscriptionWebSocket`.

Uso:
  python3 transcribir.py out/consulta-mono.wav                 # presencial, diarización
  python3 transcribir.py out/consulta-estereo.wav --canales    # online, un canal por hablante
  python3 transcribir.py out/consulta-mono.wav --vocabulario nutreitor-poc
"""

from __future__ import annotations

import argparse
import asyncio
import json
import re
import statistics
import struct
import time
import unicodedata
import wave
import zlib
from pathlib import Path
from urllib.parse import urlencode

import botocore.session
import websockets
from botocore.auth import SigV4QueryAuth
from botocore.awsrequest import AWSRequest
from botocore.eventstream import EventStreamBuffer

AQUI = Path(__file__).resolve().parent
CHUNK_S = 0.1


# ── 1. URL prefirmada (en producción la emite la API después de auth + consentimiento) ──

def url_prefirmada(region: str, idioma: str, rate: int, canales: bool, vocabulario: str | None) -> str:
    params = {
        "language-code": idioma,
        "media-encoding": "pcm",
        "sample-rate": str(rate),
    }
    if canales:
        params |= {"enable-channel-identification": "true", "number-of-channels": "2"}
    else:
        params["show-speaker-label"] = "true"
    if vocabulario:
        params["vocabulary-name"] = vocabulario

    creds = botocore.session.get_session().get_credentials()
    if creds is None:
        raise SystemExit("No hay credenciales de AWS configuradas.")
    host = f"transcribestreaming.{region}.amazonaws.com:8443"
    req = AWSRequest(method="GET", url=f"https://{host}/stream-transcription-websocket?{urlencode(sorted(params.items()))}")
    SigV4QueryAuth(creds.get_frozen_credentials(), "transcribe", region, expires=300).add_auth(req)
    return req.url.replace("https://", "wss://", 1)


# ── 2. Codificación event-stream (lo mismo que hará el navegador) ──

def _header(nombre: str, valor: str) -> bytes:
    n, v = nombre.encode(), valor.encode()
    return struct.pack(">B", len(n)) + n + b"\x07" + struct.pack(">H", len(v)) + v


def frame_audio(pcm: bytes) -> bytes:
    headers = (
        _header(":content-type", "application/octet-stream")
        + _header(":event-type", "AudioEvent")
        + _header(":message-type", "event")
    )
    total = 12 + len(headers) + len(pcm) + 4
    prelude = struct.pack(">II", total, len(headers))
    cuerpo = prelude + struct.pack(">I", zlib.crc32(prelude)) + headers + pcm
    return cuerpo + struct.pack(">I", zlib.crc32(cuerpo))


# ── 3. Sesión de streaming ──

async def transcribir(url: str, pcm: bytes, rate: int, n_canales: int, velocidad: float) -> tuple[list[dict], list[float]]:
    bytes_chunk = int(rate * CHUNK_S) * 2 * n_canales
    finales: list[dict] = []
    retrasos: list[float] = []

    async with websockets.connect(url, max_size=None) as ws:
        inicio = time.monotonic()

        async def enviar() -> None:
            for i in range(0, len(pcm), bytes_chunk):
                await ws.send(frame_audio(pcm[i : i + bytes_chunk]))
                await asyncio.sleep(CHUNK_S / velocidad)
            await ws.send(frame_audio(b""))  # fin del stream

        async def recibir() -> None:
            buf = EventStreamBuffer()
            async for data in ws:
                buf.add_data(data)
                for msg in buf:
                    h = msg.headers
                    if h.get(":message-type") == "exception":
                        raise RuntimeError(f"{h.get(':exception-type')}: {msg.payload.decode()}")
                    if h.get(":event-type") != "TranscriptEvent":
                        continue
                    for r in json.loads(msg.payload)["Transcript"]["Results"]:
                        if r["IsPartial"]:
                            continue
                        finales.append(r)
                        dicho = r["EndTime"] / velocidad
                        retrasos.append(time.monotonic() - inicio - dicho)

        await asyncio.gather(enviar(), recibir())
    return finales, retrasos


# ── Evaluación ──

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


def etiqueta(r: dict) -> str:
    if "ChannelId" in r:
        return {"ch_0": "P", "ch_1": "D"}.get(r["ChannelId"], r["ChannelId"])
    hablantes = {i.get("Speaker") for i in r["Alternatives"][0].get("Items", []) if i.get("Speaker")}
    return "spk_" + "/".join(sorted(hablantes)) if hablantes else "?"


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("audio", type=Path)
    ap.add_argument("--canales", action="store_true", help="identificación por canal (audio estéreo)")
    ap.add_argument("--vocabulario", help="nombre del vocabulario personalizado ya creado en Transcribe")
    ap.add_argument("--idioma", default="es-US")
    ap.add_argument("--region", default="us-east-1")
    ap.add_argument("--velocidad", type=float, default=1.0, help=">1 manda más rápido que tiempo real")
    ap.add_argument("--guion", type=Path, default=AQUI / "consulta.txt")
    args = ap.parse_args()

    with wave.open(str(args.audio), "rb") as w:
        rate, n_canales = w.getframerate(), w.getnchannels()
        pcm = w.readframes(w.getnframes())
    if args.canales != (n_canales == 2):
        raise SystemExit("--canales va con audio estéreo y sin --canales, mono.")

    url = url_prefirmada(args.region, args.idioma, rate, args.canales, args.vocabulario)
    finales, retrasos = asyncio.run(transcribir(url, pcm, rate, n_canales, args.velocidad))
    finales.sort(key=lambda r: r["StartTime"])

    lineas = [f"{etiqueta(r)}: {r['Alternatives'][0]['Transcript']}" for r in finales]
    print("\n".join(lineas))

    guion = args.guion.read_text(encoding="utf-8")
    ref = normalizar(re.sub(r"^[PD]:", "", guion, flags=re.M))
    hip = normalizar(" ".join(r["Alternatives"][0]["Transcript"] for r in finales))
    terminos = [t for t in normalizar((AQUI / "vocabulario.txt").read_text(encoding="utf-8")) if t in ref]
    acertados = [t for t in terminos if t in hip]

    resumen = {
        "audio": args.audio.name,
        "modo": "canales" if args.canales else "diarizacion",
        "vocabulario": args.vocabulario,
        "duracion_s": round(len(pcm) / 2 / n_canales / rate, 1),
        "wer_aprox": round(wer(ref, hip), 3),
        "recall_vocabulario": f"{len(acertados)}/{len(terminos)}",
        "terminos_perdidos": sorted(set(terminos) - set(acertados)),
        "retraso_final_mediana_s": round(statistics.median(retrasos), 2) if retrasos else None,
        "retraso_final_p90_s": round(statistics.quantiles(retrasos, n=10)[-1], 2) if len(retrasos) > 1 else None,
    }
    print("\n" + json.dumps(resumen, ensure_ascii=False, indent=2))

    salida = AQUI / "out" / f"{args.audio.stem}-{resumen['modo']}{'-vocab' if args.vocabulario else ''}.json"
    salida.parent.mkdir(exist_ok=True)
    salida.write_text(json.dumps({"resumen": resumen, "transcripcion": lineas}, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
