#!/usr/bin/env python3
"""Inventory Source viewmodels in an extracted ShadowNigth/archi checkout.

This is a preflight report only: it never renames or copies Source .mdl files
into a GoldSrc installation, because that would produce unusable models.
"""
from __future__ import annotations

import argparse
import csv
import struct
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "docs" / "source-model-inventory.csv"

# Suggested vanilla CS 1.6 replacement slots, not guaranteed one-to-one ports.
# Several Source weapons compete for the same GoldSrc slot; resolve those choices
# before doing the manual rig/animation conversion.
TARGETS = {
    "m_cs2_c4": "v_c4.mdl",
    "m_cs2_grenade_decoy": "",
    "m_cs2_grenade_flashbang": "v_flashbang.mdl",
    "m_cs2_grenade_he": "v_hegrenade.mdl",
    "m_cs2_grenade_incendary": "",
    "m_cs2_grenade_molotov": "",
    "m_cs2_grenade_smoke": "v_smokegrenade.mdl",
    "m_cs2_knife_kukri": "v_knife.mdl",
    "m_cs2_knife_kukri_ct": "v_knife.mdl",
    "m_cs2_knife_kukri_t": "v_knife.mdl",
    "m_cs2_taser": "",
    "m_cs2_m249": "v_m249.mdl",
    "m_cs2_mag7": "v_m3.mdl",
    "m_cs2_negev": "v_m249.mdl",
    "m_cs2_nova": "v_m3.mdl",
    "m_cs2_sawedoff": "v_m3.mdl",
    "m_cs2_xm1014": "v_xm1014.mdl",
    "m_cs2_cz75a": "v_p228.mdl",
    "m_cs2_deagle": "v_deagle.mdl",
    "m_cs2_elite": "v_elite.mdl",
    "m_cs2_fiveseven": "v_fiveseven.mdl",
    "m_cs2_glock": "v_glock18.mdl",
    "m_cs2_p2000": "v_usp.mdl",
    "m_cs2_p250": "v_p228.mdl",
    "m_cs2_revolver": "v_deagle.mdl",
    "m_cs2_tec9": "v_glock18.mdl",
    "m_cs2_usp": "v_usp.mdl",
    "m_cs2_ak47": "v_ak47.mdl",
    "m_cs2_aug": "v_aug.mdl",
    "m_cs2_awp": "v_awp.mdl",
    "m_cs2_famas": "v_famas.mdl",
    "m_cs2_g3sg1": "v_g3sg1.mdl",
    "m_cs2_galilar": "v_galil.mdl",
    "m_cs2_m4a1s": "v_m4a1.mdl",
    "m_cs2_m4a4": "v_m4a1.mdl",
    "m_cs2_scar20": "v_sg550.mdl",
    "m_cs2_sg556": "v_sg552.mdl",
    "m_cs2_ssg08": "v_scout.mdl",
    "m_cs2_bizon": "v_mp5.mdl",
    "m_cs2_mac10": "v_mac10.mdl",
    "m_cs2_mp5sd": "v_mp5.mdl",
    "m_cs2_mp7": "v_mp5.mdl",
    "m_cs2_mp9": "v_tmp.mdl",
    "m_cs2_p90": "v_p90.mdl",
    "m_cs2_ump45": "v_ump45.mdl",
}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, type=Path,
                        help="raíz del checkout de ShadowNigth/archi")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT,
                        help="CSV destino (por defecto: docs/source-model-inventory.csv)")
    args = parser.parse_args()
    if not args.source.is_dir():
        parser.error(f"no existe el checkout: {args.source}")

    paths = sorted(args.source.glob("**/#pak/models/weapons/v_*.mdl"))
    if not paths:
        parser.error("no se encontraron modelos bajo **/#pak/models/weapons/v_*.mdl")

    rows = []
    for path in paths:
        try:
            relative = path.relative_to(args.source).as_posix()
            parts = path.parts
            idx = parts.index("EXTRAIDOS")
            addon = parts[idx + 1]
        except (ValueError, IndexError):
            relative = path.relative_to(args.source).as_posix()
            addon = "(sin identificador EXTRAIDOS)"
        raw = path.read_bytes()[:8]
        magic = raw[:4].decode("ascii", errors="replace") if len(raw) >= 4 else "invalid"
        version = struct.unpack("<i", raw[4:8])[0] if len(raw) >= 8 else -1
        target = TARGETS.get(addon, "")
        stem = path.stem.lower()
        variant = "inspección/auxiliar" if "inspect" in stem or "lensmask" in stem else "viewmodel"
        if magic == "IDST" and version == 49:
            format_status = "Source 1 IDST v49; requiere port manual a GoldSrc v10"
        else:
            format_status = f"formato no validado ({magic}, versión {version})"
        rows.append({
            "addon_origen": addon,
            "modelo_source": relative,
            "tipo": variant,
            "destino_cs16_candidato": target or "sin slot vanilla; definir reemplazo",
            "formato_detectado": f"{magic} v{version}",
            "estado": format_status,
        })

    counts = Counter(row["destino_cs16_candidato"] for row in rows
                     if row["destino_cs16_candidato"].endswith(".mdl"))
    for row in rows:
        target = row["destino_cs16_candidato"]
        if target.endswith(".mdl") and counts[target] > 1:
            row["estado"] += "; destino compartido, elegir una variante"

    args.output.parent.mkdir(parents=True, exist_ok=True)
    columns = ["addon_origen", "modelo_source", "tipo", "destino_cs16_candidato",
               "formato_detectado", "estado"]
    with args.output.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=columns)
        writer.writeheader()
        writer.writerows(rows)
    print(f"Inventario: {len(rows)} modelos detectados; informe en {args.output}")
    print("Este preflight no compila ni instala modelos.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
