#!/usr/bin/env python3
"""Validate and stage the complete Counter-Strike 1.6 replacement pack."""
from __future__ import annotations

import argparse
import shutil
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_sound_pack import EXPECTED, validate as validate_sounds  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "dist" / "cstrike",
                        help="directorio de salida cstrike (por defecto: dist/cstrike)")
    args = parser.parse_args()

    errors = validate_sounds(ROOT / "cstrike" / "sound" / "weapons")
    if errors:
        for error in errors:
            print(error, file=sys.stderr)
        return 1

    models = sorted((ROOT / "cstrike" / "models").glob("v_*.mdl"))
    alternatives = sorted((ROOT / "cstrike" / "alternatives").glob("*/models/v_*.mdl"))
    if not models:
        print("No hay viewmodels GoldSrc en cstrike/models", file=sys.stderr)
        return 1
    for model in models + alternatives:
        with model.open("rb") as stream:
            header = stream.read(8)
        version = struct.unpack("<i", header[4:8])[0] if len(header) == 8 else -1
        if header[:4] != b"IDST" or version != 10:
            print(f"Modelo no GoldSrc v10: {model}", file=sys.stderr)
            return 1

    args.output.mkdir(parents=True, exist_ok=True)
    for source in (ROOT / "cstrike").rglob("*"):
        if source.is_file():
            target = args.output / source.relative_to(ROOT / "cstrike")
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
    print(f"Pack listo en {args.output}: {len(models)} viewmodels instalables, "
          f"{len(alternatives)} variantes, y {len(EXPECTED)} sonidos WAV; todos los MDL son v10.")
    print("Copia el contenido de esa carpeta sobre cstrike/ del juego; haz copia de seguridad antes.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
