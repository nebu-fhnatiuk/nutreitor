"""Genera audio sintético de una consulta a partir de `consulta.txt`.

Cada línea es `P: ...` (profesional) o `D: ...` (deportista). Se sintetiza con `say`
(macOS) y `afconvert`, con una voz distinta por hablante, y se arman dos archivos
PCM 16 kHz / 16 bit en `out/`:

  - `consulta-mono.wav`: las dos voces en un canal (caso presencial: un solo
    micrófono, se separan hablantes con diarización).
  - `consulta-estereo.wav`: profesional a la izquierda y deportista a la derecha
    (caso online: micrófono + audio de la pestaña, identificación por canal).

Limitación: las voces de macOS son de México y de España. Sirven para medir el
vocabulario técnico y el camino de punta a punta, no el acento rioplatense; eso se
mide con grabaciones reales (ver README).

Uso: python3 generar_audio.py [--voz-p Paulina] [--voz-d Mónica]
"""

from __future__ import annotations

import argparse
import subprocess
import tempfile
import wave
from pathlib import Path

RATE = 16_000
SILENCIO_ENTRE_TURNOS_S = 0.6
AQUI = Path(__file__).resolve().parent


def leer_turnos(ruta: Path) -> list[tuple[str, str]]:
    turnos = []
    for linea in ruta.read_text(encoding="utf-8").splitlines():
        linea = linea.strip()
        if not linea:
            continue
        hablante, _, texto = linea.partition(":")
        if hablante not in ("P", "D") or not texto.strip():
            raise ValueError(f"Línea inválida (se espera 'P: ...' o 'D: ...'): {linea!r}")
        turnos.append((hablante, texto.strip()))
    return turnos


def sintetizar(texto: str, voz: str, tmp: Path, i: int) -> bytes:
    aiff = tmp / f"{i:03}.aiff"
    wav = tmp / f"{i:03}.wav"
    subprocess.run(["say", "-v", voz, "-o", str(aiff), texto], check=True)
    subprocess.run(
        ["afconvert", "-f", "WAVE", "-d", f"LEI16@{RATE}", "-c", "1", str(aiff), str(wav)],
        check=True,
    )
    with wave.open(str(wav), "rb") as w:
        assert w.getframerate() == RATE and w.getnchannels() == 1 and w.getsampwidth() == 2
        return w.readframes(w.getnframes())


def intercalar(izq: bytes, der: bytes) -> bytes:
    """Arma PCM estéreo (muestras de 16 bit intercaladas L/R)."""
    assert len(izq) == len(der)
    out = bytearray(len(izq) * 2)
    for k in range(0, len(izq), 2):
        out[2 * k : 2 * k + 2] = izq[k : k + 2]
        out[2 * k + 2 : 2 * k + 4] = der[k : k + 2]
    return bytes(out)


def escribir_wav(ruta: Path, pcm: bytes, canales: int) -> None:
    with wave.open(str(ruta), "wb") as w:
        w.setnchannels(canales)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(pcm)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--guion", type=Path, default=AQUI / "consulta.txt")
    ap.add_argument("--voz-p", default="Paulina", help="voz de la profesional (say -v '?')")
    ap.add_argument("--voz-d", default="Mónica", help="voz de la deportista")
    ap.add_argument("--salida", type=Path, default=AQUI / "out")
    args = ap.parse_args()

    turnos = leer_turnos(args.guion)
    silencio = b"\x00\x00" * int(RATE * SILENCIO_ENTRE_TURNOS_S)
    mono = bytearray()
    canal_p = bytearray()
    canal_d = bytearray()

    with tempfile.TemporaryDirectory() as d:
        for i, (hablante, texto) in enumerate(turnos):
            voz = args.voz_p if hablante == "P" else args.voz_d
            pcm = sintetizar(texto, voz, Path(d), i) + silencio
            vacio = b"\x00" * len(pcm)
            mono += pcm
            canal_p += pcm if hablante == "P" else vacio
            canal_d += pcm if hablante == "D" else vacio

    args.salida.mkdir(exist_ok=True)
    escribir_wav(args.salida / "consulta-mono.wav", bytes(mono), 1)
    escribir_wav(args.salida / "consulta-estereo.wav", intercalar(bytes(canal_p), bytes(canal_d)), 2)
    print(f"{len(turnos)} turnos, {len(mono) / 2 / RATE:.1f} s de audio → {args.salida}")


if __name__ == "__main__":
    main()
