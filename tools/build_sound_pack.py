#!/usr/bin/env python3
"""Validate and stage the supplied CS 1.6 replacement sounds.

The source files are already GoldSrc-friendly PCM WAVs. This script deliberately
refuses to resample or rename files: in CS 1.6 the stock event names are part of
how the client resolves weapon sounds.
"""
from __future__ import annotations

import argparse
import shutil
import sys
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = ROOT / "cstrike" / "sound" / "weapons"
DEFAULT_OUTPUT = ROOT / "dist" / "cstrike" / "sound" / "weapons"

# Asset names provided by the upstream archi repository's sound/ directory.
EXPECTED = {
    "ak47-1.wav", "ak47-2.wav", "aug-1.wav", "awp1.wav",
    "deagle-1.wav", "deagle-2.wav", "elite_fire.wav", "famas-1.wav",
    "famas-2.wav", "fiveseven-1.wav", "flashbang-1.wav", "flashbang-2.wav",
    "g3sg1-1.wav", "galil-1.wav", "galil-2.wav", "glock18-1.wav",
    "glock18-2.wav", "hegrenade-1.wav", "hegrenade-2.wav", "m249-1.wav",
    "m249-2.wav", "m3-1.wav", "m4a1-1.wav", "m4a1_unsil-1.wav",
    "m4a1_unsil-2.wav", "mac10-1.wav", "mp5-1.wav", "mp5-2.wav",
    "p228-1.wav", "p90-1.wav", "scout_fire-1.wav", "sg550-1.wav",
    "sg552-1.wav", "sg552-2.wav", "sg_explode.wav", "tmp-1.wav",
    "tmp-2.wav", "ump45-1.wav", "usp1.wav", "usp2.wav",
    "usp_unsil-1.wav", "xm1014-1.wav",
}


def validate(source: Path) -> list[str]:
    errors: list[str] = []
    if not source.is_dir():
        return [f"No existe el directorio de sonidos: {source}"]

    found = {p.name for p in source.glob("*.wav") if p.is_file()}
    missing = sorted(EXPECTED - found)
    extra = sorted(found - EXPECTED)
    if missing:
        errors.append("Faltan sonidos requeridos: " + ", ".join(missing))
    if extra:
        errors.append("Hay WAV no contemplados en el pack: " + ", ".join(extra))

    for name in sorted(EXPECTED & found):
        path = source / name
        try:
            with wave.open(str(path), "rb") as wav:
                params = wav.getparams()
                if (params.nchannels, params.sampwidth, params.framerate) != (1, 2, 22050):
                    errors.append(
                        f"{name}: se esperaba PCM mono, 16-bit, 22050 Hz; "
                        f"se encontró {params.nchannels} canal(es), "
                        f"{params.sampwidth * 8}-bit, {params.framerate} Hz"
                    )
                if params.nframes < 1:
                    errors.append(f"{name}: archivo sin muestras")
                if params.comptype != "NONE":
                    errors.append(f"{name}: WAV comprimido ({params.comptype})")
        except (OSError, wave.Error) as exc:
            errors.append(f"{name}: WAV inválido: {exc}")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE,
                        help="directorio con los WAV de entrada (por defecto: cstrike/sound/weapons)")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT,
                        help="raíz de salida del pack (por defecto: dist/cstrike/sound/weapons)")
    parser.add_argument("--check-only", action="store_true",
                        help="validar sin copiar los sonidos")
    args = parser.parse_args()

    errors = validate(args.source)
    if errors:
        print("Error: el pack de sonidos no pasó la validación:", file=sys.stderr)
        for error in errors:
            print(f"  - {error}", file=sys.stderr)
        return 1

    if args.check_only:
        print(f"OK: {len(EXPECTED)} WAV válidos (PCM mono, 16-bit, 22050 Hz).")
        return 0

    args.output.mkdir(parents=True, exist_ok=True)
    for name in sorted(EXPECTED):
        shutil.copy2(args.source / name, args.output / name)
    print(f"Pack listo: {len(EXPECTED)} sonidos en {args.output}")
    print("Copia el contenido de dist/cstrike/ en la carpeta cstrike/ del juego.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
