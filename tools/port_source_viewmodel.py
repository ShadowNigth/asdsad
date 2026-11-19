#!/usr/bin/env python3
"""Extract a Source 1 viewmodel to SMD/QC and optionally compile a GoldSrc MDL.

This ports geometry/animation data; it does not decide the CS 1.6 animation
indices for you. Supply --sequence-order for the target weapon. The generated
model still needs an in-game visual/animation check before distribution.
"""
from __future__ import annotations

import argparse
import math
import re
import subprocess
import sys
from collections import defaultdict
from contextlib import redirect_stderr, redirect_stdout
from io import StringIO
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, type=Path,
                        help="checkout of ShadowNigth/archi")
    parser.add_argument("--addon", required=True,
                        help="EXTRAIDOS folder name, for example m_cs2_ak47")
    parser.add_argument("--output", required=True, type=Path,
                        help="directory for SMD/QC, textures, and compiled MDL")
    parser.add_argument("--target", default="v_model.mdl",
                        help="GoldSrc output filename, for example v_ak47.mdl")
    parser.add_argument("--sequence-order", default="",
                        help="comma-separated source sequence labels in the CS 1.6 numeric order")
    parser.add_argument("--compiler", type=Path,
                        help="path to a GoldSrc studiomdl++ executable; omit to export SMD/QC only")
    parser.add_argument("--sourceio", type=Path,
                        help="parent directory containing the SourceIO checkout; alternatively set PYTHONPATH")
    parser.add_argument("--max-body-vertices", type=int, default=1800,
                        help="maximum distinct source vertices in each GoldSrc $body chunk (default: 1800)")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.sourceio:
        sys.path.insert(0, str(args.sourceio.resolve()))
    if not args.source.is_dir():
        raise SystemExit(f"No existe el checkout de archi: {args.source}")
    if not args.target.lower().endswith(".mdl") or "/" in args.target or "\\" in args.target:
        raise SystemExit("--target debe ser solo un nombre de archivo .mdl, por ejemplo v_ak47.mdl")
    if not 256 <= args.max_body_vertices <= 2000:
        raise SystemExit("--max-body-vertices debe estar entre 256 y 2000")

    try:
        import numpy as np
        from PIL import Image
        from SourceIO.library.models.mdl.v49.mdl_file import MdlV49
        from SourceIO.library.models.mdl.load_animations import load_animations_from_mdl
        from SourceIO.library.models.mdl.structs.local_animation import (
            ANIM_DTYPE, AniBoneFlags, StudioAnimDesc,
        )
        from SourceIO.library.models.mdl.structs.frame_anim import StudioFrameAnim
        from SourceIO.library.models.mdl.structs.compressed_vectors import Quat48, Quat48S
        from SourceIO.library.models.vvd import Vvd
        from SourceIO.library.models.vtx import open_vtx
        from SourceIO.library.shared.content_manager import ContentManager
        from SourceIO.library.source1.vtf import load_texture
        from SourceIO.library.utils import FileBuffer, TinyPath
    except ImportError as exc:
        raise SystemExit(
            "Faltan dependencias. Instala numpy y Pillow, clona REDxEYE/SourceIO "
            "y pasa --sourceio con el directorio padre del checkout. "
            f"Detalle: {exc}"
        ) from exc

    # SourceIO's stock decoder assumes FRAMEANIM constant and animated channels
    # are mutually exclusive. CS:GO v49 files can contain both in one section.
    def read_frame_animation(self, buffer, bones, frame_count):
        entry = buffer.tell()
        header = StudioFrameAnim.from_buffer(buffer)
        flags = [AniBoneFlags(buffer.read_uint8()) for _ in bones]
        is_delta = bool(self.flags & 4)
        output = {}
        for bone in bones:
            pos = (0.0, 0.0, 0.0) if is_delta else bone.position
            rot = (0.0, 0.0, 0.0, 1.0) if is_delta else bone.quat
            values = np.zeros((frame_count,), ANIM_DTYPE)
            values["pos"][:] = pos
            values["rot"][:] = rot
            output[bone.name] = values
        if header.constant_offset > 0:
            buffer.seek(entry + header.constant_offset)
            for bone, bone_flags in zip(bones, flags):
                if bone_flags & AniBoneFlags.CONST_ROT2:
                    output[bone.name]["rot"][:] = Quat48S.read(buffer)
                if bone_flags & AniBoneFlags.RAW_ROT:
                    output[bone.name]["rot"][:] = Quat48.read(buffer)
                if bone_flags & AniBoneFlags.RAW_POS:
                    output[bone.name]["pos"][:] = buffer.read_fmt("3e")
                if bone_flags & AniBoneFlags.CONST_POS2:
                    output[bone.name]["pos"][:] = buffer.read_fmt("3f")
        if header.frame_offset > 0 and header.frame_length > 0:
            buffer.seek(entry + header.frame_offset)
            for frame_id in range(frame_count):
                for bone, bone_flags in zip(bones, flags):
                    if bone_flags & AniBoneFlags.ANIM_ROT2:
                        output[bone.name][frame_id]["rot"] = Quat48S.read(buffer)
                    if bone_flags & AniBoneFlags.ANIM_ROT:
                        output[bone.name][frame_id]["rot"] = Quat48.read(buffer)
                    if bone_flags & AniBoneFlags.ANIM_POS:
                        output[bone.name][frame_id]["pos"] = buffer.read_fmt("3e")
                    if bone_flags & AniBoneFlags.FULL_ANIM_POS:
                        output[bone.name][frame_id]["pos"] = buffer.read_fmt("3f")
        return output

    StudioAnimDesc._read_frame_animations = read_frame_animation

    model_dir = None
    for candidate in args.source.rglob(args.addon):
        if candidate.is_dir() and (candidate / "#pak" / "models" / "weapons").is_dir():
            model_dir = candidate / "#pak" / "models" / "weapons"
            break
    if model_dir is None:
        raise SystemExit(f"No se encontró EXTRAIDOS/{args.addon}/#pak/models/weapons")
    model_files = sorted(model_dir.glob("v_*.mdl"))
    model_files = [p for p in model_files if "_inspect" not in p.stem.lower()
                   and "lensmask" not in p.stem.lower()]
    if len(model_files) != 1:
        raise SystemExit(f"Se esperaba un viewmodel principal en {model_dir}; hay {len(model_files)}")
    model_path = model_files[0]
    vvd_path = model_path.with_suffix(".vvd")
    vtx_candidates = sorted(model_dir.glob(model_path.stem + "*.vtx"))
    if not vvd_path.is_file() or not vtx_candidates:
        raise SystemExit(f"Faltan los sidecars VVD/VTX de {model_path.name}")

    # SourceIO's MDL parser prints a traceback for unsupported inline animation
    # blocks, even though its dedicated ANI loader can read them separately.
    with redirect_stderr(StringIO()), redirect_stdout(StringIO()):
        mdl = MdlV49.from_buffer(FileBuffer(model_path))
    if mdl.header.version != 49:
        raise SystemExit(f"Se esperaba Source MDL v49, se encontró v{mdl.header.version}")
    if len(mdl.bones) > 128:
        raise SystemExit(f"{len(mdl.bones)} huesos exceden el límite GoldSrc de 128")

    vvd = Vvd.from_buffer(FileBuffer(vvd_path))
    vtx = open_vtx(FileBuffer(vtx_candidates[0]))
    loaded = load_animations_from_mdl(
        mdl, FileBuffer(model_path), ContentManager(), TinyPath(model_path.as_posix())
    )
    animations = {animation.name: animation for animation in loaded}
    sequence_by_name = {sequence.name: sequence for sequence in mdl.sequences}
    if args.sequence_order:
        labels = [label.strip() for label in args.sequence_order.split(",") if label.strip()]
        missing = [label for label in labels if label not in sequence_by_name]
        if missing:
            raise SystemExit("Secuencias no encontradas: " + ", ".join(missing))
    else:
        labels = [sequence.name for sequence in mdl.sequences]
        print("AVISO: se conserva el orden Source; no se puede asumir que coincida "
              "con los índices numéricos que CS 1.6 espera.")

    args.output.mkdir(parents=True, exist_ok=True)
    target = args.target
    out = args.output.resolve()

    def smd_name(value: str) -> str:
        value = re.sub(r"[^A-Za-z0-9_.-]+", "_", value).strip("._")
        return value or "material"

    def write_nodes(f):
        f.write("version 1\nnodes\n")
        for bone in mdl.bones:
            f.write(f'{bone.bone_id} "{bone.name.replace(chr(34), chr(39))}" {bone.parent_id}\n')
        f.write("end\n")

    def write_skeleton(f, frames):
        f.write("skeleton\n")
        for frame_id, frame in enumerate(frames):
            f.write(f"time {frame_id}\n")
            for bone_id, (position, rotation) in enumerate(frame):
                f.write(f"{bone_id} {position[0]:.7f} {position[1]:.7f} {position[2]:.7f} "
                        f"{rotation[0]:.7f} {rotation[1]:.7f} {rotation[2]:.7f}\n")
        f.write("end\n")

    def quat_euler(quat):
        x, y, z, w = map(float, quat)
        rx = math.atan2(2 * (w * x + y * z), 1 - 2 * (x * x + y * y))
        sy = 2 * (w * y - z * x)
        ry = math.copysign(math.pi / 2, sy) if abs(sy) >= 1 else math.asin(sy)
        rz = math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z))
        return rx, ry, rz

    def pose_frames(animation):
        result = []
        for frame_id in range(animation.frame_count):
            pose = []
            for bone in mdl.bones:
                rows = animation.frames.get(bone.name)
                if rows is None:
                    pose.append((bone.position, bone.rotation))
                else:
                    pose.append((tuple(map(float, rows[frame_id]["pos"])),
                                 quat_euler(rows[frame_id]["rot"])))
            result.append(pose)
        return result

    # Convert each referenced VMT base texture to the palette BMP format expected
    # by GoldSrc. Normal/roughness maps are intentionally not used by GoldSrc.
    addon_root = model_dir.parents[2]
    material_names = {}
    for material in mdl.materials:
        name = material.name
        vmt_paths = list((addon_root / "materials").rglob(Path(name).name + ".vmt"))
        if not vmt_paths:
            raise SystemExit(f"No se encontró VMT para el material {name!r}")
        vmt_text = vmt_paths[0].read_text(errors="replace")
        match = re.search(r'basetexture"?\s+"?([^"\s]+)', vmt_text, re.I)
        if not match:
            raise SystemExit(f"El VMT no declara $basetexture: {vmt_paths[0]}")
        texture_name = Path(match.group(1).replace(chr(92), "/")).name + ".vtf"
        texture_paths = list((addon_root / "materials").rglob(texture_name))
        if not texture_paths:
            raise SystemExit(f"No se encontró el VTF base {texture_name}")
        rgba, _height, _width = load_texture(FileBuffer(texture_paths[0]))
        if rgba is None:
            raise SystemExit(f"No se pudo decodificar {texture_paths[0]}")
        pixels = np.clip(rgba * 255, 0, 255).astype(np.uint8)
        image = Image.fromarray(pixels, "RGBA")
        image.thumbnail((512, 512), Image.Resampling.LANCZOS)
        pixels = np.asarray(image)
        quantized = Image.fromarray(pixels[:, :, :3], "RGB").quantize(
            colors=255, method=Image.Quantize.MEDIANCUT
        )
        alpha = Image.fromarray(pixels[:, :, 3], "L")
        quantized.paste(255, mask=alpha.point(lambda value: 255 if value < 128 else 0))
        palette = quantized.getpalette()
        palette[765:768] = [0, 0, 255]
        quantized.putpalette(palette)
        bmp_name = smd_name(name) + ".bmp"
        quantized.save(out / bmp_name)
        material_names[name] = bmp_name

    # Split geometry over GoldSrc bodyparts. Every part stays below the old
    # per-submodel vertex cap while retaining the original mesh and skin weights.
    triangles = []
    for bodypart, vtx_bodypart in zip(mdl.body_parts, vtx.body_parts):
        for source_model, vtx_model in zip(bodypart.models, vtx_bodypart.models):
            if not source_model.vertex_count or not source_model.meshes:
                continue
            source_vertices = vvd.lod_data[0][
                source_model.vertex_offset:source_model.vertex_offset + source_model.vertex_count
            ]
            if not vtx_model.model_lods:
                continue
            for source_mesh, vtx_mesh in zip(source_model.meshes, vtx_model.model_lods[0].meshes):
                material = source_mesh.material_index
                if not 0 <= material < len(mdl.materials):
                    raise SystemExit(f"Índice de material fuera de rango en {model_path.name}")
                for group in vtx_mesh.strip_groups:
                    local_indices = (group.vertexes["original_mesh_vertex_index"].astype(np.int64)
                                     .reshape(-1) + source_mesh.vertex_index_start)
                    for face in group.indices.reshape(-1, 3):
                        indices = tuple(int(local_indices[int(index)]) for index in face)
                        triangles.append((material, source_vertices, indices))
    if not triangles:
        raise SystemExit("El modelo no tiene triángulos de primera persona exportables")

    chunks = []
    current = []
    used_vertices = set()
    for triangle in triangles:
        material_id, source_vertices, ids = triangle
        # GoldSrc duplicates a vertex at material seams. Count those as separate
        # output vertices rather than counting only the Source VVD vertex index.
        keys = {(id(source_vertices), material_id, vertex_id) for vertex_id in ids}
        added = keys - used_vertices
        if current and (len(used_vertices | added) > args.max_body_vertices or len(current) >= 12000):
            chunks.append(current)
            current, used_vertices = [], set()
        current.append(triangle)
        used_vertices.update(keys)
    if current:
        chunks.append(current)
    if len(chunks) > 32:
        raise SystemExit(f"Se necesitan {len(chunks)} bodyparts; GoldSrc admite como máximo 32")

    base_pose = [[(bone.position, bone.rotation) for bone in mdl.bones]]
    for chunk_id, chunk in enumerate(chunks):
        with (out / f"body_{chunk_id:02d}.smd").open("w", encoding="utf-8", newline="\n") as f:
            write_nodes(f)
            write_skeleton(f, base_pose)
            f.write("triangles\n")
            for material_id, vertices, indices in chunk:
                material = material_names[mdl.materials[material_id].name]
                f.write(material + "\n")
                for vertex_id in indices:
                    row = vertices[vertex_id]
                    position, normal, uv = row["vertex"], row["normal"], row["uv"]
                    count = int(row["pad"]) or 1
                    links = []
                    for link_id in range(count):
                        bone_id = int(row["bone_id"][link_id])
                        weight = float(row["weight"][link_id])
                        if weight > 0 and bone_id < len(mdl.bones):
                            links.append((bone_id, weight))
                    if not links:
                        links = [(0, 1.0)]
                    total = sum(weight for _, weight in links)
                    links = [(bone_id, weight / total) for bone_id, weight in links]
                    f.write(
                        f"{links[0][0]} {position[0]:.7f} {position[1]:.7f} {position[2]:.7f} "
                        f"{normal[0]:.7f} {normal[1]:.7f} {normal[2]:.7f} "
                        f"{uv[0]:.7f} {uv[1]:.7f} {len(links)} "
                        + " ".join(f"{bone_id} {weight:.7f}" for bone_id, weight in links) + "\n"
                    )
            f.write("end\n")

    sequence_records = []
    for label in labels:
        sequence = sequence_by_name[label]
        if not sequence.anim_desc_indices:
            print(f"AVISO: se omite la secuencia sin animación {label}")
            continue
        descriptor = mdl.anim_descs[sequence.anim_desc_indices[0]]
        animation_name = ("d." if descriptor.flags & 4 else "") + descriptor.name
        animation = animations.get(animation_name)
        if animation is None:
            print(f"AVISO: no se pudo decodificar la animación {descriptor.name} para {label}; se omite")
            continue
        clean_label = smd_name(label)
        animation_file = f"anim_{clean_label}.smd"
        with (out / animation_file).open("w", encoding="utf-8", newline="\n") as f:
            write_nodes(f)
            write_skeleton(f, pose_frames(animation))
        sequence_records.append((clean_label, animation_file, animation.fps))

    if not sequence_records:
        raise SystemExit("No se pudo exportar ninguna secuencia de animación")

    qc_path = out / "port.qc"
    with qc_path.open("w", encoding="utf-8", newline="\n") as qc:
        qc.write(f'$modelname "{target}"\n$cd "."\n$cdtexture "."\n$scale 1.0\n')
        for chunk_id in range(len(chunks)):
            qc.write(f'$body "part{chunk_id:02d}" "body_{chunk_id:02d}.smd"\n')
        for label, animation_file, fps in sequence_records:
            loop = " loop" if "idle" in label.lower() else ""
            qc.write(f'$sequence "{label}" "{animation_file}" fps {fps:g}{loop}\n')

    print(f"Exportados {len(chunks)} bodyparts, {len(triangles)} triángulos, "
          f"{len(sequence_records)} secuencias a {out}")
    if args.compiler:
        result = subprocess.run([str(args.compiler.resolve()), qc_path.name], cwd=out,
                                check=False, capture_output=True, text=True)
        print(result.stdout)
        if result.stderr:
            print(result.stderr, file=sys.stderr)
        if result.returncode:
            raise SystemExit(f"studiomdl++ terminó con código {result.returncode}")
        compiled = out / target
        if not compiled.is_file():
            raise SystemExit(f"El compilador no creó {compiled}")
        with compiled.open("rb") as model:
            header = model.read(8)
        version = int.from_bytes(header[4:8], "little", signed=True) if header[:4] == b"IDST" else -1
        if version != 10:
            raise SystemExit(f"Salida no GoldSrc: magic={header[:4]!r}, version={version}")
        print(f"GoldSrc v10 compilado: {compiled} ({compiled.stat().st_size} bytes)")
    else:
        print("Solo se exportaron QC/SMD. Pasa --compiler para compilar a GoldSrc.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
