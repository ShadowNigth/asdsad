#!/usr/bin/env python3
"""
Counter-Strike 1.5 (cs15_retail) -> Whisk3D & WebGL Asset Converter
Converts:
  - All 15 de_* HL1 BSP v30 maps -> Whisk3D .w3dbsp v2 + .cscol.bin + .csmap.json + lightmap PNGs
  - HL1 WAD3 & embedded BSP textures -> PNG (with '{' cutout alpha) + procedural fallbacks
  - GoldSrc MDL v10 viewmodels, world models & player models -> Binary glTF 2.0 (.glb) with textures, skeleton & animations
  - TGA skyboxes -> PNG faces
  - Essential CS 1.5 WAV sounds
"""

import os
import sys
import glob
import json
import math
import zlib
import struct
import shutil
import hashlib

RAW_DIR = "/tmp/cs15-raw/cstrike"
OUT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "assets"))

# GoldSrc uses ~39.37 units per meter (1 unit = 1 inch)
SCALE = 1.0 / 39.37

# ---------------------------------------------------------------------------
# Pure-Python PNG Encoder
# ---------------------------------------------------------------------------
def _png_chunk(tag, data):
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xffffffff)

def encode_png(w, h, rgba_bytes):
    raw_rows = bytearray()
    stride = w * 4
    for y in range(h):
        raw_rows.append(0)
        raw_rows.extend(rgba_bytes[y * stride : (y + 1) * stride])
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)
    idat = zlib.compress(bytes(raw_rows), 6)
    return b"\x89PNG\r\n\x1a\n" + _png_chunk(b"IHDR", ihdr) + _png_chunk(b"IDAT", idat) + _png_chunk(b"IEND", b"")

def encode_png_rgb(w, h, rgb_bytes):
    raw_rows = bytearray()
    stride = w * 3
    for y in range(h):
        raw_rows.append(0)
        raw_rows.extend(rgb_bytes[y * stride : (y + 1) * stride])
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)
    idat = zlib.compress(bytes(raw_rows), 6)
    return b"\x89PNG\r\n\x1a\n" + _png_chunk(b"IHDR", ihdr) + _png_chunk(b"IDAT", idat) + _png_chunk(b"IEND", b"")

def write_png_rgba(path, w, h, rgba):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(encode_png(w, h, rgba))

def write_png_rgb(path, w, h, rgb):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(encode_png_rgb(w, h, rgb))

# ---------------------------------------------------------------------------
# TGA Loader (24/32-bit uncompressed or RLE)
# ---------------------------------------------------------------------------
def load_tga(path):
    with open(path, "rb") as f:
        d = f.read()
    id_len, cmap_type, img_type = struct.unpack_from("<BBB", d, 0)
    w, h, bpp, desc = struct.unpack_from("<HHBB", d, 12)
    bpp_bytes = bpp // 8
    pos = 18 + id_len
    if cmap_type:
        cmap_len = struct.unpack_from("<H", d, 5)[0]
        cmap_bpp = d[7] // 8
        pos += cmap_len * cmap_bpp
    pixels = bytearray(w * h * 4)
    if img_type == 2:
        for i in range(w * h):
            b = d[pos + i * bpp_bytes]
            g = d[pos + i * bpp_bytes + 1]
            r = d[pos + i * bpp_bytes + 2]
            a = d[pos + i * bpp_bytes + 3] if bpp_bytes == 4 else 255
            pixels[i*4:i*4+4] = bytes((r, g, b, a))
    elif img_type == 10:
        i = 0
        while i < w * h and pos < len(d):
            pkt = d[pos]; pos += 1
            cnt = (pkt & 0x7F) + 1
            if pkt & 0x80:
                b, g, r = d[pos], d[pos+1], d[pos+2]
                a = d[pos+3] if bpp_bytes == 4 else 255
                pos += bpp_bytes
                for _ in range(cnt):
                    if i >= w * h: break
                    pixels[i*4:i*4+4] = bytes((r, g, b, a))
                    i += 1
            else:
                for _ in range(cnt):
                    if i >= w * h or pos + bpp_bytes > len(d): break
                    b, g, r = d[pos], d[pos+1], d[pos+2]
                    a = d[pos+3] if bpp_bytes == 4 else 255
                    pos += bpp_bytes
                    pixels[i*4:i*4+4] = bytes((r, g, b, a))
                    i += 1
    if not (desc & 0x20):
        flipped = bytearray(w * h * 4)
        stride = w * 4
        for y in range(h):
            flipped[y*stride:(y+1)*stride] = pixels[(h-1-y)*stride:(h-y)*stride]
        pixels = flipped
    return w, h, bytes(pixels)

# ---------------------------------------------------------------------------
# WAD3 & MipTex Decoder
# ---------------------------------------------------------------------------
def decode_miptex(buf, offset, is_alpha_name=False):
    if offset + 40 > len(buf):
        return None
    name = buf[offset:offset+16].split(b"\x00", 1)[0].decode("ascii", "ignore").lower()
    w, h, o0, o1, o2, o3 = struct.unpack_from("<6I", buf, offset + 16)
    if w == 0 or h == 0 or w > 2048 or h > 2048 or o0 == 0:
        return None
    npix = w * h
    pix_start = offset + o0
    mip_total = npix + (npix // 4) + (npix // 16) + (npix // 64)
    pal_start = pix_start + mip_total
    if pal_start + 2 + 768 > len(buf):
        return None
    pal = buf[pal_start + 2 : pal_start + 2 + 768]
    idx_bytes = buf[pix_start : pix_start + npix]
    rgba = bytearray(npix * 4)
    cutout = is_alpha_name or name.startswith("{")
    for i, idx in enumerate(idx_bytes):
        if cutout and idx == 255:
            rgba[i*4:i*4+4] = b"\x00\x00\x00\x00"
        else:
            p = idx * 3
            rgba[i*4]   = pal[p]
            rgba[i*4+1] = pal[p+1]
            rgba[i*4+2] = pal[p+2]
            rgba[i*4+3] = 255
    return w, h, bytes(rgba), cutout

def load_all_wads(cstrike_dir):
    wad_textures = {}
    for wpath in sorted(glob.glob(os.path.join(cstrike_dir, "*.[wW][aA][dD]"))):
        with open(wpath, "rb") as f:
            data = f.read()
        if len(data) < 12 or data[:4] != b"WAD3":
            continue
        _, num, diroff = struct.unpack_from("<4sII", data, 0)
        for i in range(num):
            ent_off = diroff + i * 32
            if ent_off + 32 > len(data):
                break
            off, dsize, size, typ, comp, _ = struct.unpack_from("<IIIBBH", data, ent_off)
            tname = data[ent_off+16:ent_off+32].split(b"\x00", 1)[0].decode("ascii", "ignore").lower()
            if comp == 0 and typ in (0x43, 0x42):
                if tname not in wad_textures:
                    wad_textures[tname] = (data, off)
    return wad_textures

def make_procedural_texture(name, w, h):
    w = max(16, min(256, w if w > 0 else 64))
    h = max(16, min(256, h if h > 0 else 64))
    ln = name.lower()
    hval = int(hashlib.md5(ln.encode()).hexdigest()[:8], 16)
    if ln.startswith("!"):
        base = (35, 78, 110) if "blue" in ln else (42, 85, 72)
        mode = "water"
    elif "lgt" in ln or "light" in ln or "lamp" in ln or "white" in ln:
        base = (240, 236, 215)
        mode = "light"
    elif "exit" in ln:
        base = (45, 165, 65)
        mode = "sign"
    elif "crate" in ln or "wood" in ln or "box" in ln:
        base = (138, 102, 64)
        mode = "crate"
    elif "comp" in ln or "crt" in ln or "panel" in ln or "lab" in ln or "elev" in ln:
        base = (72, 84, 92)
        mode = "panel"
    elif "brick" in ln or "wall" in ln:
        base = (132, 96, 82)
        mode = "brick"
    elif "dirt" in ln or "sand" in ln or "rock" in ln or "cliff" in ln:
        base = (128, 112, 88)
        mode = "noise"
    elif "mtl" in ln or "steel" in ln or "iron" in ln or "pipe" in ln or "truss" in ln:
        base = (98, 104, 110)
        mode = "metal"
    elif "glass" in ln:
        base = (110, 155, 175)
        mode = "glass"
    else:
        r = 85 + (hval & 0x3F)
        g = 85 + ((hval >> 6) & 0x3F)
        b = 85 + ((hval >> 12) & 0x3F)
        base = (r, g, b)
        mode = "concrete"

    cutout = ln.startswith("{")
    rgba = bytearray(w * h * 4)
    for y in range(h):
        for x in range(w):
            idx = (y * w + x) * 4
            n = ((x * 374761393 + y * 668265263 + hval) ^ ((x + y) * 1274126177)) & 0xFF
            delta = (n % 21) - 10
            r, g, b = base
            a = 255
            if mode == "crate":
                if x < 2 or y < 2 or x >= w-2 or y >= h-2 or abs(x - y) < 2:
                    delta -= 32
                elif (y % 16) == 0:
                    delta -= 18
            elif mode == "brick":
                row = y // 12
                bx = (x + (row % 2) * 16) % 32
                if (y % 12) == 0 or bx == 0:
                    delta -= 35
            elif mode == "panel":
                if x < 2 or y < 2 or x >= w-2 or y >= h-2:
                    delta -= 25
                elif 6 <= x < w-6 and 6 <= y < h//2:
                    r, g, b = (28, 90, 75) if ((x + y) % 5 != 0) else (70, 210, 145)
            elif mode == "light":
                if x < 3 or y < 3 or x >= w-3 or y >= h-3:
                    r, g, b = (90, 90, 95)
            elif mode == "metal":
                if (x % 32) < 2 or (y % 32) < 2:
                    delta -= 22
            elif mode == "water":
                delta += int(12 * math.sin(x * 0.25 + y * 0.15))
            if cutout and ((x % 8) < 2 or (y % 8) < 2):
                a = 255
            elif cutout:
                a = 0
            rgba[idx]   = max(0, min(255, r + delta))
            rgba[idx+1] = max(0, min(255, g + delta))
            rgba[idx+2] = max(0, min(255, b + delta))
            rgba[idx+3] = a
    return w, h, bytes(rgba), cutout

def sanitize_tex_name(name):
    out = []
    for c in name.lower():
        if c.isalnum() or c in ("_", "-"):
            out.append(c)
        elif c == "{":
            out.append("_a_")
        elif c == "!":
            out.append("_w_")
        elif c == "+":
            out.append("_p_")
        elif c == "~":
            out.append("_t_")
        else:
            out.append("_")
    return "".join(out) or "unnamed"

def parse_entities(ent_text):
    entities = []
    cur = None
    for line in ent_text.splitlines():
        line = line.strip()
        if not line:
            continue
        if line == "{":
            cur = {}
        elif line == "}":
            if cur is not None:
                entities.append(cur)
                cur = None
        elif cur is not None and line.startswith('"'):
            parts = line.split('"')
            if len(parts) >= 4:
                cur[parts[1]] = parts[3]
    return entities

class LightmapAtlas:
    def __init__(self, size=1024):
        self.size = size
        self.data = bytearray([128, 128, 128] * (size * size))
        self.x = 1
        self.y = 1
        self.row_h = 0

    def alloc_and_fill(self, w, h, rgb_bytes):
        pw = w + 2
        ph = h + 2
        if self.x + pw > self.size:
            self.x = 1
            self.y += self.row_h + 1
            self.row_h = 0
        if self.y + ph > self.size:
            return None
        ox, oy = self.x + 1, self.y + 1
        for row in range(h):
            for col in range(w):
                si = (row * w + col) * 3
                r = min(255, int(pow(rgb_bytes[si] / 255.0, 0.72) * 255))
                g = min(255, int(pow(rgb_bytes[si+1] / 255.0, 0.72) * 255))
                b = min(255, int(pow(rgb_bytes[si+2] / 255.0, 0.72) * 255))
                di = ((oy + row) * self.size + (ox + col)) * 3
                self.data[di] = r; self.data[di+1] = g; self.data[di+2] = b
        for col in range(-1, w + 1):
            sc = max(0, min(w - 1, col))
            for sr, dr in [(0, -1), (h - 1, h)]:
                si = ((oy + sr) * self.size + (ox + sc)) * 3
                di = ((oy + dr) * self.size + (ox + sc)) * 3
                self.data[di:di+3] = self.data[si:si+3]
        for row in range(-1, h + 1):
            sr = max(0, min(h - 1, row))
            for sc, dc in [(0, -1), (w - 1, w)]:
                si = ((oy + sr) * self.size + (ox + sc)) * 3
                di = ((oy + sr) * self.size + (ox + dc)) * 3
                self.data[di:di+3] = self.data[si:si+3]
        self.x += pw
        if ph > self.row_h:
            self.row_h = ph
        return ox, oy

def hl_to_w3d_pos(x, y, z):
    return (x * SCALE, z * SCALE, -y * SCALE)

def hl_to_w3d_plane(nx, ny, nz, dist):
    return (nx, nz, -ny, dist * SCALE)

def aabb_overlap(a, b):
    return (a[0] <= b[3] and a[3] >= b[0] and
            a[1] <= b[4] and a[4] >= b[1] and
            a[2] <= b[5] and a[5] >= b[2])

def convert_bsp_map(bsp_path, wad_textures, exported_textures, exported_skyboxes):
    map_name = os.path.splitext(os.path.basename(bsp_path))[0]
    with open(bsp_path, "rb") as f:
        d = f.read()

    ver = struct.unpack_from("<i", d, 0)[0]
    if ver != 30:
        raise RuntimeError(f"{map_name}: unsupported BSP version {ver}")
    lumps = [struct.unpack_from("<2i", d, 4 + i * 8) for i in range(15)]

    eoff, elen = lumps[0]
    entities = parse_entities(d[eoff:eoff+elen].decode("ascii", "ignore"))

    poff, plen = lumps[1]
    n_planes = plen // 20
    planes_hl = [struct.unpack_from("<4fi", d, poff + i * 20) for i in range(n_planes)]

    toff, tlen = lumps[2]
    ntex = struct.unpack_from("<I", d, toff)[0]
    bsp_textures = []
    for i in range(ntex):
        moff = struct.unpack_from("<i", d, toff + 4 + i * 4)[0]
        if moff < 0 or toff + moff + 40 > len(d):
            bsp_textures.append(("default", 64, 64, False))
            continue
        p = toff + moff
        tname = d[p:p+16].split(b"\x00", 1)[0].decode("ascii", "ignore").lower()
        tw, th, o0 = struct.unpack_from("<3I", d, p + 16)
        safe_name = sanitize_tex_name(tname)
        is_cutout = tname.startswith("{")
        if safe_name not in exported_textures and tname not in ("sky", "aaatrigger", "clip", "origin", "null", "hint", "skip"):
            decoded = None
            if o0 > 0:
                decoded = decode_miptex(d, p, is_cutout)
            if decoded is None and tname in wad_textures:
                wbuf, woff = wad_textures[tname]
                decoded = decode_miptex(wbuf, woff, is_cutout)
            if decoded is None:
                decoded = make_procedural_texture(tname, tw, th)
            dw, dh, drgba, dcut = decoded
            tex_rel = f"textures/{safe_name}.png"
            write_png_rgba(os.path.join(OUT_DIR, tex_rel), dw, dh, drgba)
            exported_textures[safe_name] = {
                "file": tex_rel, "w": dw, "h": dh, "cutout": dcut, "orig": tname
            }
        bsp_textures.append((tname, tw if tw > 0 else 64, th if th > 0 else 64, is_cutout))

    voff, vlen = lumps[3]
    n_verts = vlen // 12
    verts_hl = [struct.unpack_from("<3f", d, voff + i * 12) for i in range(n_verts)]

    visoff, vislen = lumps[4]
    pvs_bytes = d[visoff:visoff+vislen]

    noff, nlen = lumps[5]
    n_nodes = nlen // 24
    nodes_hl = []
    for i in range(n_nodes):
        pnum, c0, c1, minx, miny, minz, maxx, maxy, maxz, ff, nf = struct.unpack_from("<ihh6hHH", d, noff + i * 24)
        nodes_hl.append((pnum, c0, c1, (minx, miny, minz), (maxx, maxy, maxz)))

    tioff, tilen = lumps[6]
    n_ti = tilen // 40
    texinfos = []
    for i in range(n_ti):
        s0, s1, s2, s3, t0, t1, t2, t3, miptex, flags = struct.unpack_from("<8fii", d, tioff + i * 40)
        texinfos.append(((s0, s1, s2, s3), (t0, t1, t2, t3), miptex, flags))

    foff, flen = lumps[7]
    n_faces = flen // 20
    faces_hl = [struct.unpack_from("<HhIhH4Bi", d, foff + i * 20) for i in range(n_faces)]

    loff, llen = lumps[8]
    light_data = d[loff:loff+llen]

    cnoff, cnlen = lumps[9]
    n_clipnodes = cnlen // 8
    clipnodes_hl = [struct.unpack_from("<ihh", d, cnoff + i * 8) for i in range(n_clipnodes)]

    lvoff, lvlen = lumps[10]
    n_leaves = lvlen // 28
    leaves_hl = []
    for i in range(n_leaves):
        contents, lvisofs, minx, miny, minz, maxx, maxy, maxz, fms, nms = struct.unpack_from("<ii6hHH", d, lvoff + i * 28)
        leaves_hl.append((contents, lvisofs, (minx, miny, minz), (maxx, maxy, maxz), fms, nms))

    msoff, mslen = lumps[11]
    n_ms = mslen // 2
    marksurfaces = struct.unpack_from(f"<{n_ms}H", d, msoff)

    eoff2, elen2 = lumps[12]
    n_edges = elen2 // 4
    edges = [struct.unpack_from("<HH", d, eoff2 + i * 4) for i in range(n_edges)]
    seoff, selen = lumps[13]
    n_se = selen // 4
    surfedges = struct.unpack_from(f"<{n_se}i", d, seoff)

    moff, mlen = lumps[14]
    n_models = mlen // 64
    models_hl = []
    for i in range(n_models):
        vals = struct.unpack_from("<9f7i", d, moff + i * 64)
        models_hl.append({
            "mins": vals[0:3], "maxs": vals[3:6], "origin": vals[6:9],
            "headnode": vals[9:13], "visleafs": vals[13],
            "firstface": vals[14], "numfaces": vals[15]
        })

    submodel_meta = {}
    spawns_ct, spawns_t, bombsites, buyzones, ladders, lights = [], [], [], [], [], []
    skyname = "desert"

    for ent in entities:
        cn = ent.get("classname", "")
        if cn == "worldspawn":
            skyname = ent.get("skyname", "desert").strip() or "desert"
        elif cn == "info_player_start":
            org = [float(v) for v in ent.get("origin", "0 0 0").split()[:3]]
            ang = float(ent.get("angle", "0").split()[0])
            spawns_ct.append({"pos": list(hl_to_w3d_pos(*org)), "yaw": ang})
        elif cn == "info_player_deathmatch":
            org = [float(v) for v in ent.get("origin", "0 0 0").split()[:3]]
            ang = float(ent.get("angle", "0").split()[0])
            spawns_t.append({"pos": list(hl_to_w3d_pos(*org)), "yaw": ang})
        elif cn in ("light", "light_spot", "light_environment"):
            org = [float(v) for v in ent.get("origin", "0 0 0").split()[:3]]
            col = [float(v) for v in ent.get("_light", "255 240 210 200").split()[:3]]
            lights.append({
                "type": cn,
                "pos": list(hl_to_w3d_pos(*org)),
                "color": [min(1.0, c / 255.0) for c in col[:3]]
            })
        mdl = ent.get("model", "")
        if mdl.startswith("*"):
            midx = int(mdl[1:])
            if 0 < midx < len(models_hl):
                m = models_hl[midx]
                p0 = hl_to_w3d_pos(*m["mins"])
                p1 = hl_to_w3d_pos(*m["maxs"])
                bmin = [min(p0[k], p1[k]) for k in range(3)]
                bmax = [max(p0[k], p1[k]) for k in range(3)]
                submodel_meta[midx] = {"classname": cn, "ent": ent, "bmin": bmin, "bmax": bmax}
                if cn in ("func_bomb_target", "info_bomb_target"):
                    bombsites.append({
                        "id": "A" if len(bombsites) == 0 else "B",
                        "min": bmin, "max": bmax,
                        "center": [(bmin[k] + bmax[k]) * 0.5 for k in range(3)]
                    })
                elif cn == "func_buyzone":
                    team = int(ent.get("team", "0"))
                    buyzones.append({"team": team, "min": bmin, "max": bmax})
                elif cn == "func_ladder":
                    ladders.append({"min": bmin, "max": bmax})

    for ent in entities:
        if ent.get("classname") == "info_bomb_target" and not ent.get("model", "").startswith("*"):
            org = [float(v) for v in ent.get("origin", "0 0 0").split()[:3]]
            cp = list(hl_to_w3d_pos(*org))
            bombsites.append({
                "id": "A" if len(bombsites) == 0 else "B",
                "min": [cp[0]-3.5, cp[1]-1.0, cp[2]-3.5],
                "max": [cp[0]+3.5, cp[1]+3.0, cp[2]+3.5],
                "center": cp
            })

    sky_sides = ["bk", "dn", "ft", "lf", "rt", "up"]
    if skyname.lower() not in exported_skyboxes:
        sky_files = {}
        env_dir = os.path.join(RAW_DIR, "gfx", "env")
        for side in sky_sides:
            candidates = glob.glob(os.path.join(env_dir, f"{skyname}{side}.tga"))
            if not candidates:
                target = f"{skyname}{side}.tga".lower()
                for fn in os.listdir(env_dir):
                    if fn.lower() == target:
                        candidates = [os.path.join(env_dir, fn)]
                        break
            if candidates:
                sw, sh, srgba = load_tga(candidates[0])
                srel = f"skyboxes/{skyname.lower()}_{side}.png"
                write_png_rgba(os.path.join(OUT_DIR, srel), sw, sh, srgba)
                sky_files[side] = srel
        exported_skyboxes[skyname.lower()] = sky_files

    face_owner = [0] * n_faces
    for midx, m in enumerate(models_hl):
        if midx == 0:
            continue
        meta = submodel_meta.get(midx, {})
        cn = meta.get("classname", "")
        ent = meta.get("ent", {})
        rendermode = int(ent.get("rendermode", "0"))
        renderamt = int(ent.get("renderamt", "255"))
        invisible = cn in ("func_bomb_target", "info_bomb_target", "func_buyzone", "trigger_hurt",
                           "trigger_multiple", "trigger_once", "func_ladder", "func_clip", "func_water")
        if rendermode == 2 and renderamt == 0:
            invisible = True
        for fi in range(m["firstface"], m["firstface"] + m["numfaces"]):
            if 0 <= fi < n_faces:
                face_owner[fi] = -1 if invisible else midx

    lm_atlas = LightmapAtlas(1024)
    lm_rel = f"maps/{map_name}_lm.png"

    mat_map = {}
    materials_list = []

    def get_mat_idx(tname, cutout):
        key = (tname, cutout)
        if key not in mat_map:
            idx = len(materials_list)
            mat_map[key] = idx
            materials_list.append({"name": tname, "cutout": cutout})
        return mat_map[key]

    tri_faces = {}
    white_lm = lm_atlas.alloc_and_fill(2, 2, bytes([210, 210, 210] * 4))

    for fi, (pnum, side, firstedge, numedges, ti_idx, s0, s1, s2, s3, lightofs) in enumerate(faces_hl):
        if face_owner[fi] == -1:
            continue
        if ti_idx < 0 or ti_idx >= len(texinfos):
            continue
        s_vec, t_vec, miptex, tiflags = texinfos[ti_idx]
        if miptex < 0 or miptex >= len(bsp_textures):
            continue
        tname, tw, th, is_cutout = bsp_textures[miptex]
        if tname in ("aaatrigger", "clip", "origin", "null", "hint", "skip", "sky"):
            continue
        if (tiflags & 1) and not tname.startswith("!"):
            continue

        poly_verts = []
        for ei in range(firstedge, firstedge + numedges):
            se = surfedges[ei]
            vi = edges[se][0] if se >= 0 else edges[-se][1]
            poly_verts.append(verts_hl[vi])
        if len(poly_verts) < 3:
            continue

        uvs = []
        min_u = min_v = 1e9
        max_u = max_v = -1e9
        for vx, vy, vz in poly_verts:
            u = vx * s_vec[0] + vy * s_vec[1] + vz * s_vec[2] + s_vec[3]
            v = vx * t_vec[0] + vy * t_vec[1] + vz * t_vec[2] + t_vec[3]
            uvs.append((u, v))
            if u < min_u: min_u = u
            if u > max_u: max_u = u
            if v < min_v: min_v = v
            if v > max_v: max_v = v

        smin = math.floor(min_u / 16.0)
        tmin = math.floor(min_v / 16.0)
        smax = math.ceil(max_u / 16.0)
        tmax = math.ceil(max_v / 16.0)
        lw = max(1, smax - smin + 1)
        lh = max(1, tmax - tmin + 1)

        lm_pos = None
        if lightofs >= 0 and s0 != 255 and lw <= 256 and lh <= 256:
            need = lw * lh * 3
            if lightofs + need <= len(light_data):
                lm_pos = lm_atlas.alloc_and_fill(lw, lh, light_data[lightofs : lightofs + need])
        if lm_pos is None:
            lm_pos = white_lm
            use_flat_lm = True
        else:
            use_flat_lm = False

        safe_t = sanitize_tex_name(tname)
        mat_idx = get_mat_idx(safe_t, is_cutout)

        face_verts = []
        bmin = [1e9, 1e9, 1e9]
        bmax = [-1e9, -1e9, -1e9]
        for (vx, vy, vz), (u, v) in zip(poly_verts, uvs):
            wx, wy, wz = hl_to_w3d_pos(vx, vy, vz)
            for k, c in enumerate((wx, wy, wz)):
                if c < bmin[k]: bmin[k] = c
                if c > bmax[k]: bmax[k] = c
            tu = u / float(tw)
            tv = v / float(th)
            if use_flat_lm:
                lu = (lm_pos[0] + 0.5) / lm_atlas.size
                lv = (lm_pos[1] + 0.5) / lm_atlas.size
            else:
                lu = (lm_pos[0] + (u / 16.0 - smin) + 0.5) / lm_atlas.size
                lv = (lm_pos[1] + (v / 16.0 - tmin) + 0.5) / lm_atlas.size
            face_verts.append((wx, wy, wz, tu, tv, lu, lv))

        face_tris = []
        for k in range(1, len(face_verts) - 1):
            face_tris.extend((0, k + 1, k))

        tri_faces[fi] = (mat_idx, face_owner[fi], face_verts, face_tris, bmin + bmax)

    write_png_rgb(os.path.join(OUT_DIR, lm_rel), lm_atlas.size, lm_atlas.size, bytes(lm_atlas.data))

    groups = [{"pos": [], "uv": [], "lm": [], "col": [], "idx": []}]
    w3d_faces = []
    face_to_w3d = {}
    submodel_w3d_faces = []

    for fi in sorted(tri_faces.keys()):
        mat_idx, owner, fverts, ftris, bbox6 = tri_faces[fi]
        cur_g = groups[-1]
        if (len(cur_g["pos"]) // 3) + len(fverts) > 65000:
            cur_g = {"pos": [], "uv": [], "lm": [], "col": [], "idx": []}
            groups.append(cur_g)
        gi = len(groups) - 1
        base_v = len(cur_g["pos"]) // 3
        for wx, wy, wz, tu, tv, lu, lv in fverts:
            cur_g["pos"].extend((wx, wy, wz))
            cur_g["uv"].extend((tu, tv))
            cur_g["lm"].extend((lu, lv))
            cur_g["col"].extend((255, 255, 255, 255))
        first_idx = len(cur_g["idx"])
        for t in ftris:
            cur_g["idx"].append(base_v + t)
        w3d_fi = len(w3d_faces)
        w3d_faces.append((gi, mat_idx, first_idx, len(ftris), bbox6))
        if owner == 0:
            face_to_w3d[fi] = w3d_fi
        else:
            submodel_w3d_faces.append((w3d_fi, bbox6))

    n_clusters = max(1, models_hl[0]["visleafs"])
    bytes_fila = (n_clusters + 7) // 8
    hoja_cluster = []
    pvs_stream = bytearray()
    pvs_offsets = [0] * n_clusters
    for li, (contents, lvisofs, lmin, lmax, fms, nms) in enumerate(leaves_hl):
        if li == 0 or li > n_clusters or lvisofs < 0:
            hoja_cluster.append(-1)
        else:
            cl = li - 1
            hoja_cluster.append(cl)
            pvs_offsets[cl] = len(pvs_stream)
            p = lvisofs
            out_cnt = 0
            while out_cnt < bytes_fila and p < len(pvs_bytes):
                b = pvs_bytes[p]; p += 1
                pvs_stream.append(b)
                if b:
                    out_cnt += 1
                else:
                    cnt = pvs_bytes[p] if p < len(pvs_bytes) else 1
                    p += 1
                    if out_cnt + cnt > bytes_fila:
                        cnt = bytes_fila - out_cnt
                    pvs_stream.append(cnt)
                    out_cnt += cnt
            while out_cnt < bytes_fila:
                pvs_stream.append(0xFF)
                out_cnt += 1

    # Leaf boxes in W3D coords
    leaf_boxes = []
    for _, _, mn, mx, _, _ in leaves_hl:
        p0 = hl_to_w3d_pos(*mn); p1 = hl_to_w3d_pos(*mx)
        leaf_boxes.append([min(p0[k], p1[k]) for k in range(3)] + [max(p0[k], p1[k]) for k in range(3)])

    # Assign world faces per leaf + attach visible submodel faces to overlapping leaves so BOTH Whisk3D & WebGL render crates/doors!
    leaf_face_sets = [[] for _ in range(n_leaves)]
    for li, (_, _, _, _, fms, nms) in enumerate(leaves_hl):
        seen = set()
        for mi in range(fms, fms + nms):
            fi = marksurfaces[mi]
            if fi in face_to_w3d:
                wfi = face_to_w3d[fi]
                if wfi not in seen:
                    seen.add(wfi)
                    leaf_face_sets[li].append(wfi)
        if li > 0 and hoja_cluster[li] >= 0:
            lb = leaf_boxes[li]
            for wfi, fbox in submodel_w3d_faces:
                if aabb_overlap(lb, fbox) and wfi not in seen:
                    seen.add(wfi)
                    leaf_face_sets[li].append(wfi)

    hoja_cara_off = [0]
    hoja_caras = []
    for lf in leaf_face_sets:
        hoja_caras.extend(lf)
        hoja_cara_off.append(len(hoja_caras))

    # Write Whisk3D .w3dbsp v2 (read by BOTH Whisk3D MundoBsp AND WebGL renderer!)
    w3dbsp_path = os.path.join(OUT_DIR, f"maps/{map_name}.w3dbsp")
    os.makedirs(os.path.dirname(w3dbsp_path), exist_ok=True)
    with open(w3dbsp_path, "wb") as f:
        f.write(struct.pack("<4sHH4I", b"W3BS", 2, 1, n_nodes, n_leaves, n_clusters, 0))
        for pnum, c0, c1, _, _ in nodes_hl:
            nx, ny, nz, nd, _ = planes_hl[pnum]
            a, b, c, d_w = hl_to_w3d_plane(nx, ny, nz, nd)
            f.write(struct.pack("<4fii", a, b, c, d_w, c0, c1))
        for cl in hoja_cluster:
            f.write(struct.pack("<i", cl))
        f.write(struct.pack("<I", len(pvs_stream)))
        for off in pvs_offsets:
            f.write(struct.pack("<I", off))
        f.write(pvs_stream)
        f.write(b"GEOM")
        f.write(struct.pack("<I", len(materials_list)))
        for mat in materials_list:
            t_str = f"texturas/{mat['name']}.png".encode("utf-8")
            l_str = f"texturas/{map_name}_lm.png".encode("utf-8")
            f.write(struct.pack("<I", len(t_str)))
            f.write(t_str)
            f.write(struct.pack("<I", len(l_str)))
            f.write(l_str)
            flags = 1 if mat["cutout"] else 0
            f.write(struct.pack("<If", flags, 0.5))
        f.write(struct.pack("<I", len(groups)))
        for g in groups:
            nv = len(g["pos"]) // 3
            f.write(struct.pack("<IB", nv, 1))
            f.write(struct.pack(f"<{len(g['pos'])}f", *g["pos"]))
            f.write(struct.pack(f"<{len(g['uv'])}f", *g["uv"]))
            f.write(struct.pack(f"<{len(g['lm'])}f", *g["lm"]))
            f.write(bytes(g["col"]))
            f.write(struct.pack("<I", len(g["idx"])))
            f.write(struct.pack(f"<{len(g['idx'])}H", *g["idx"]))
        f.write(struct.pack("<I", len(w3d_faces)))
        for gi, mi, fi0, cnt, _ in w3d_faces:
            f.write(struct.pack("<HHII", gi, mi, fi0, cnt))
        f.write(struct.pack("<I", n_leaves))
        f.write(struct.pack(f"<{len(hoja_cara_off)}I", *hoja_cara_off))
        f.write(struct.pack("<I", len(hoja_caras)))
        if hoja_caras:
            f.write(struct.pack(f"<{len(hoja_caras)}I", *hoja_caras))
        for _, _, _, mn, mx in nodes_hl:
            p0 = hl_to_w3d_pos(*mn); p1 = hl_to_w3d_pos(*mx)
            f.write(struct.pack("<6f", *(min(p0[k], p1[k]) for k in range(3)), *(max(p0[k], p1[k]) for k in range(3))))
        for lb in leaf_boxes:
            f.write(struct.pack("<6f", *lb))
        f.write(struct.pack("<B", 1))
        for _, _, _, _, bbox6 in w3d_faces:
            f.write(struct.pack("<6f", *bbox6))

    # Write compact collision lump (.cscol.bin) for GoldSrc Hull Collision (standing/crouch/raycast)
    cscol_path = os.path.join(OUT_DIR, f"maps/{map_name}.cscol.bin")
    with open(cscol_path, "wb") as f:
        f.write(b"CSC1")
        f.write(struct.pack("<I", n_planes))
        for nx, ny, nz, nd, _ in planes_hl:
            f.write(struct.pack("<4f", *hl_to_w3d_plane(nx, ny, nz, nd)))
        f.write(struct.pack("<I", n_clipnodes))
        for pnum, c0, c1 in clipnodes_hl:
            f.write(struct.pack("<ihh", pnum, c0, c1))
        f.write(struct.pack("<I", len(models_hl)))
        for m in models_hl:
            p0 = hl_to_w3d_pos(*m["mins"]); p1 = hl_to_w3d_pos(*m["maxs"])
            bmin = [min(p0[k], p1[k]) for k in range(3)]
            bmax = [max(p0[k], p1[k]) for k in range(3)]
            f.write(struct.pack("<6f4i", *bmin, *bmax, *m["headnode"]))

    if not spawns_ct: spawns_ct = [{"pos": [0.0, 2.0, 0.0], "yaw": 0.0}]
    if not spawns_t:  spawns_t  = [{"pos": [5.0, 2.0, 0.0], "yaw": 180.0}]

    p0 = hl_to_w3d_pos(*models_hl[0]["mins"])
    p1 = hl_to_w3d_pos(*models_hl[0]["maxs"])
    world_min = [min(p0[k], p1[k]) for k in range(3)]
    world_max = [max(p0[k], p1[k]) for k in range(3)]

    csmap_meta = {
        "name": map_name,
        "skybox": skyname.lower(),
        "lightmap": lm_rel,
        "worldMin": world_min,
        "worldMax": world_max,
        "materials": [
            {
                "tex": f"textures/{m['name']}.png",
                "cutout": m["cutout"],
                "water": m["name"].startswith("_w_")
            }
            for m in materials_list
        ],
        "spawnsCT": spawns_ct,
        "spawnsT": spawns_t,
        "bombsites": bombsites,
        "buyzones": buyzones,
        "ladders": ladders,
        "lights": lights[:32],
        "solidSubmodels": [
            {"id": midx, "classname": meta["classname"], "min": meta["bmin"], "max": meta["bmax"]}
            for midx, meta in sorted(submodel_meta.items())
            if meta["classname"] in ("func_wall", "func_door", "func_door_rotating", "func_breakable", "func_train")
        ],
        "w3dbsp": f"maps/{map_name}.w3dbsp",
        "colbin": f"maps/{map_name}.cscol.bin"
    }
    with open(os.path.join(OUT_DIR, f"maps/{map_name}.csmap.json"), "w") as f:
        json.dump(csmap_meta, f, separators=(",", ":"))

    return csmap_meta

# ---------------------------------------------------------------------------
# GoldSrc MDL v10 -> Binary glTF 2.0 (.glb) with Skinning & Keyframe Animations
# ---------------------------------------------------------------------------
def euler_to_quat(rx, ry, rz):
    cx, sx = math.cos(rx * 0.5), math.sin(rx * 0.5)
    cy, sy = math.cos(ry * 0.5), math.sin(ry * 0.5)
    cz, sz = math.cos(rz * 0.5), math.sin(rz * 0.5)
    qx = sx * cy * cz - cx * sy * sz
    qy = cx * sy * cz + sx * cy * sz
    qz = cx * cy * sz - sx * sy * cz
    qw = cx * cy * cz + sx * sy * sz
    return (qx, qy, qz, qw)

def mat4_from_trs(t, q):
    x, y, z, w = q
    xx, yy, zz = x*x, y*y, z*z
    xy, xz, yz = x*y, x*z, y*z
    wx, wy, wz = w*x, w*y, w*z
    return [
        [1-2*(yy+zz), 2*(xy-wz), 2*(xz+wy), t[0]],
        [2*(xy+wz), 1-2*(xx+zz), 2*(yz-wx), t[1]],
        [2*(xz-wy), 2*(yz+wx), 1-2*(xx+yy), t[2]],
        [0.0, 0.0, 0.0, 1.0]
    ]

def mat4_mul(A, B):
    return [[sum(A[i][k]*B[k][j] for k in range(4)) for j in range(4)] for i in range(4)]

def mat4_inv_rigid(M):
    # Inverse of rigid transform [R t; 0 1]
    Rt = [[M[j][i] for j in range(3)] for i in range(3)]
    t = [M[0][3], M[1][3], M[2][3]]
    it = [-(Rt[i][0]*t[0] + Rt[i][1]*t[1] + Rt[i][2]*t[2]) for i in range(3)]
    return [
        [Rt[0][0], Rt[0][1], Rt[0][2], it[0]],
        [Rt[1][0], Rt[1][1], Rt[1][2], it[1]],
        [Rt[2][0], Rt[2][1], Rt[2][2], it[2]],
        [0.0, 0.0, 0.0, 1.0]
    ]

def decode_mdl_rle_frame(d, anim_off, bone_idx, frame):
    off = anim_off + bone_idx * 12
    vals = []
    for ch in range(6):
        ch_off = struct.unpack_from("<H", d, off + ch * 2)[0]
        if ch_off == 0:
            vals.append(0)
            continue
        p = off + ch_off
        k = frame
        v = 0
        while p + 2 <= len(d):
            valid, total = d[p], d[p+1]
            p += 2
            if total == 0:
                break
            if k < total:
                idx = min(k, valid - 1) if valid > 0 else 0
                if valid > 0 and p + idx * 2 + 2 <= len(d):
                    v = struct.unpack_from("<h", d, p + idx * 2)[0]
                break
            k -= total
            p += valid * 2
        vals.append(v)
    return vals

def convert_mdl_to_glb(mdl_path, out_glb_path, is_viewmodel=False, is_player=False):
    with open(mdl_path, "rb") as f:
        d = f.read()
    if len(d) < 200 or d[:4] != b"IDST":
        return False

    (numbones, boneidx, numbc, bcidx, numhb, hbidx,
     numseq, seqidx, numseqg, seqgidx,
     numtex, texidx, texdataidx,
     numskinref, numskinfam, skinidx,
     numbp, bpidx) = struct.unpack_from("<18i", d, 140)

    if numtex == 0 or numbp == 0 or numbones == 0:
        return False

    bones = []
    for i in range(numbones):
        bo = boneidx + i * 112
        bname = d[bo:bo+32].split(b"\x00", 1)[0].decode("ascii", "ignore") or f"bone_{i}"
        parent, flags = struct.unpack_from("<ii", d, bo + 32)
        bvals = struct.unpack_from("<12f", d, bo + 64)
        bones.append({
            "name": bname, "parent": parent,
            "pos": bvals[0:3], "rot": bvals[3:6],
            "pscale": bvals[6:9], "rscale": bvals[9:12]
        })

    # Convert GoldSrc bone pos/rot to glTF Y-up space:
    # We put the coordinate conversion matrix C on the root node (or convert root bone) so local bone TRS stays exact!
    # Wait: transforming root node by R_coord lets all GoldSrc bone animations stay in native GoldSrc space!
    # Let's verify:
    #   For viewmodels: x_g = -y_hl, y_g = z_hl, z_g = -x_hl  (rotation -90 around Y then -90 around X... or matrix)
    #   For player/world: x_g = x_hl, y_g = z_hl, z_g = -y_hl
    # Matrix C (3x3 orthogonal, det=+1) * SCALE:
    #   For player/world: [[1,0,0],[0,0,1],[0,-1,0]] (det = +1! Rotate -90 around X)
    #   For viewmodels:   [[0,-1,0],[0,0,1],[-1,0,0]] (det = 0 - (-1)*(0 - 0) + 0... wait: det([[0,-1,0],[0,0,1],[-1,0,0]]) = +1! )
    # Let's check:
    #   det([[0,-1,0],[0,0,1],[-1,0,0]]) = -(-1)*(0 - (-1)) = +1*(-1)? Wait:
    #   (+1)*... second col -(-1) * (0*0 - 1*(-1)) = +1 * (+1) = +1! YES! Right-handed rotation!
    #   quat for player/world (Rotate -90 deg X): (-sin(45), 0, 0, cos(45)) = (-0.70710678, 0, 0, 0.70710678)
    #   quat for viewmodels (Rotate -90 deg X then -90 deg Y):
    #     Wait: R_y(-90) * R_x(-90):
    #     v=(x,y,z) -> R_x(-90): (x, z, -y) -> R_y(-90): ( -(-y), z, -x ) = (y, z, -x)? Wait: R_y(-90) sends +X->+Z, +Z->-X! Let's check R_y(+90): +Z->+X, +X->-Z -> R_y(+90)*(x, z, -y) = (-y, z, -x)!
    #     YES! So viewmodel root quat = Q_y(+90) * Q_x(-90) = (0, +s, 0, s) * (-s, 0, 0, s) = (-0.5, 0.5, 0.5, 0.5)!
    #     Let's double check Q=(-0.5, 0.5, 0.5, 0.5):
    #     M[0] = (1-2(.25+.25), 2(-.25-.25), 2(-.25+.25)) = (0, -1, 0) -> x' = -y!
    #     M[1] = (2(-.25+.25), 1-2(.25+.25), 2(.25+.25)) = (0, 0, 1)  -> y' = +z!
    #     M[2] = (2(-.25-.25), 2(.25-.25), 1-2(.25+.25)) = (-1, 0, 0) -> z' = -x!
    #     EXACT! No reflection, pure rigid rotation!

    skin_refs = struct.unpack_from(f"<{numskinref}h", d, skinidx) if numskinref > 0 else ()

    tex_pngs = []
    tex_dims = []
    for i in range(numtex):
        to = texidx + i * 80
        tflags, tw, th, toff = struct.unpack_from("<4i", d, to + 64)
        npix = tw * th
        pix = d[toff : toff + npix]
        pal = d[toff + npix : toff + npix + 768]
        rgba = bytearray(npix * 4)
        masked = bool(tflags & 64)
        for pi, idx in enumerate(pix):
            if masked and idx == 255:
                rgba[pi*4:pi*4+4] = b"\x00\x00\x00\x00"
            else:
                rgba[pi*4]   = pal[idx*3]
                rgba[pi*4+1] = pal[idx*3+1]
                rgba[pi*4+2] = pal[idx*3+2]
                rgba[pi*4+3] = 255
        tex_pngs.append(encode_png(tw, th, bytes(rgba)))
        tex_dims.append((max(1, tw), max(1, th)))

    # Bind pose matrices in GoldSrc local units
    bind_mats = []
    for i, b in enumerate(bones):
        q = euler_to_quat(*b["rot"])
        lm = mat4_from_trs(b["pos"], q)
        if b["parent"] >= 0:
            bind_mats.append(mat4_mul(bind_mats[b["parent"]], lm))
        else:
            bind_mats.append(lm)

    inv_bind_mats = [mat4_inv_rigid(m) for m in bind_mats]

    primitives_data = []
    for bi in range(numbp):
        bp = bpidx + bi * 76
        nummodels, base, modelindex = struct.unpack_from("<3i", d, bp + 64)
        if nummodels == 0:
            continue
        mo = modelindex
        mname = d[mo:mo+64].split(b"\x00", 1)[0].decode("ascii", "ignore").lower()
        if mname == "blank":
            continue
        (_, _, nummesh, meshidx, numverts, vertinfo_idx, verts_idx,
         numnorms, norminfo_idx, norms_idx, _, _) = struct.unpack_from("<if10i", d, mo + 64)
        if numverts == 0 or nummesh == 0:
            continue

        vert_bones = d[vertinfo_idx : vertinfo_idx + numverts]
        raw_verts = [struct.unpack_from("<3f", d, verts_idx + i * 12) for i in range(numverts)]
        raw_norms = [struct.unpack_from("<3f", d, norms_idx + i * 12) for i in range(numnorms)]

        for msi in range(nummesh):
            ms = meshidx + msi * 20
            numtris, triidx, skinref, _, _ = struct.unpack_from("<5i", d, ms)
            tidx = skin_refs[skinref] if skinref < len(skin_refs) else 0
            if tidx < 0 or tidx >= len(tex_dims):
                tidx = 0
            tw, th = tex_dims[tidx]

            positions, normals, uvs, joints, weights, indices = [], [], [], [], [], []
            p = triidx
            while p + 2 <= len(d):
                cnt = struct.unpack_from("<h", d, p)[0]
                p += 2
                if cnt == 0:
                    break
                is_fan = cnt < 0
                n = -cnt if is_fan else cnt
                strip_verts = []
                for _ in range(n):
                    vi, ni, s, t = struct.unpack_from("<4h", d, p)
                    p += 8
                    b_i = vert_bones[vi] if vi < len(vert_bones) else 0
                    vx, vy, vz = raw_verts[vi]
                    nx, ny, nz = raw_norms[ni] if ni < len(raw_norms) else (0, 0, 1)
                    bm = bind_mats[b_i]
                    wx = bm[0][0]*vx + bm[0][1]*vy + bm[0][2]*vz + bm[0][3]
                    wy = bm[1][0]*vx + bm[1][1]*vy + bm[1][2]*vz + bm[1][3]
                    wz = bm[2][0]*vx + bm[2][1]*vy + bm[2][2]*vz + bm[2][3]
                    wnx = bm[0][0]*nx + bm[0][1]*ny + bm[0][2]*nz
                    wny = bm[1][0]*nx + bm[1][1]*ny + bm[1][2]*nz
                    wnz = bm[2][0]*nx + bm[2][1]*ny + bm[2][2]*nz
                    nlen = math.sqrt(wnx*wnx + wny*wny + wnz*wnz) or 1.0
                    v_idx = len(positions) // 3
                    positions.extend((wx, wy, wz))
                    normals.extend((wnx/nlen, wny/nlen, wnz/nlen))
                    uvs.extend((s / float(tw), t / float(th)))
                    joints.extend((b_i, 0, 0, 0))
                    weights.extend((1.0, 0.0, 0.0, 0.0))
                    strip_verts.append(v_idx)

                if is_fan:
                    for k in range(1, len(strip_verts) - 1):
                        indices.extend((strip_verts[0], strip_verts[k+1], strip_verts[k]))
                else:
                    for k in range(len(strip_verts) - 2):
                        if k % 2 == 0:
                            indices.extend((strip_verts[k], strip_verts[k+2], strip_verts[k+1]))
                        else:
                            indices.extend((strip_verts[k], strip_verts[k+1], strip_verts[k+2]))

            if indices:
                primitives_data.append((tidx, positions, normals, uvs, joints, weights, indices))

    if not primitives_data:
        return False

    # Select sequences to export
    wanted_player = {"idle1", "crouch_idle", "walk", "run", "crouchrun", "jump", "death1", "die_simple", "ref_aim_rifle", "crouch_aim_rifle"}
    seqs_to_export = []
    for si in range(numseq):
        so = seqidx + si * 176
        lbl = d[so:so+32].split(b"\x00", 1)[0].decode("ascii", "ignore")
        fps, flags, act, actw, nevt, evtidx, nframes, npiv, pividx, mot, motb, _, _, _, _, _, anim_off = struct.unpack_from("<f6i", d, so + 32) if False else (0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0)
        # mstudioseqdesc_t exact layout after label[32]:
        # float fps (32), int flags (36), int activity (40), int actweight (44),
        # int numevents (48), int eventindex (52), int numframes (56),
        # int numpivots (60), int pivotindex (64), int motiontype (68), int motionbone (72),
        # vec3 linearmovement (76..88), int automoveposindex (88), int automoveangleindex (92),
        # vec3 bbmin (96..108), vec3 bbmax (108..120), int numblends (120), int animindex (124)
        fps = struct.unpack_from("<f", d, so + 32)[0]
        nframes = struct.unpack_from("<i", d, so + 56)[0]
        anim_off = struct.unpack_from("<i", d, so + 124)[0]
        if nframes <= 0 or fps <= 0 or anim_off <= 0:
            continue
        if is_player and lbl.lower() not in wanted_player:
            continue
        seqs_to_export.append((lbl, fps, nframes, anim_off))

    bin_buf = bytearray()
    buffer_views = []
    accessors = []

    def add_bv(raw_bytes, target=None):
        while len(bin_buf) % 4 != 0:
            bin_buf.append(0)
        off = len(bin_buf)
        bin_buf.extend(raw_bytes)
        bv = {"buffer": 0, "byteOffset": off, "byteLength": len(raw_bytes)}
        if target is not None:
            bv["target"] = target
        idx = len(buffer_views)
        buffer_views.append(bv)
        return idx

    def add_acc(bv_idx, comp_type, count, acc_type, mins=None, maxs=None):
        acc = {"bufferView": bv_idx, "componentType": comp_type, "count": count, "type": acc_type}
        if mins is not None: acc["min"] = mins
        if maxs is not None: acc["max"] = maxs
        idx = len(accessors)
        accessors.append(acc)
        return idx

    images, textures, materials = [], [], []
    for i, png_bytes in enumerate(tex_pngs):
        bv = add_bv(png_bytes)
        images.append({"bufferView": bv, "mimeType": "image/png"})
        textures.append({"source": i})
        materials.append({
            "pbrMetallicRoughness": {
                "baseColorTexture": {"index": i},
                "metallicFactor": 0.05,
                "roughnessFactor": 0.85
            },
            "doubleSided": True
        })

    gltf_prims = []
    for tidx, pos, norm, uv, jnt, wgt, idx in primitives_data:
        nv = len(pos) // 3
        xs, ys, zs = pos[0::3], pos[1::3], pos[2::3]
        bv_pos = add_bv(struct.pack(f"<{len(pos)}f", *pos), 34962)
        bv_nrm = add_bv(struct.pack(f"<{len(norm)}f", *norm), 34962)
        bv_uv  = add_bv(struct.pack(f"<{len(uv)}f", *uv), 34962)
        bv_jnt = add_bv(struct.pack(f"<{len(jnt)}B", *jnt), 34962)
        bv_wgt = add_bv(struct.pack(f"<{len(wgt)}f", *wgt), 34962)
        bv_idx = add_bv(struct.pack(f"<{len(idx)}H", *idx), 34963)
        acc_pos = add_acc(bv_pos, 5126, nv, "VEC3", [min(xs), min(ys), min(zs)], [max(xs), max(ys), max(zs)])
        acc_nrm = add_acc(bv_nrm, 5126, nv, "VEC3")
        acc_uv  = add_acc(bv_uv,  5126, nv, "VEC2")
        acc_jnt = add_acc(bv_jnt, 5121, nv, "VEC4")
        acc_wgt = add_acc(bv_wgt, 5126, nv, "VEC4")
        acc_idx = add_acc(bv_idx, 5123, len(idx), "SCALAR")
        gltf_prims.append({
            "attributes": {
                "POSITION": acc_pos, "NORMAL": acc_nrm, "TEXCOORD_0": acc_uv,
                "JOINTS_0": acc_jnt, "WEIGHTS_0": acc_wgt
            },
            "indices": acc_idx,
            "material": tidx
        })

    # Node hierarchy:
    # Node 0: Root transform (GoldSrc -> Y-up + SCALE) with children [1 (Mesh), 2.. (Root Bones)]
    # Bone i -> Node (2 + i)
    root_quat = [-0.5, 0.5, 0.5, 0.5] if is_viewmodel else [-0.70710678, 0.0, 0.0, 0.70710678]
    nodes = [
        {"name": os.path.splitext(os.path.basename(mdl_path))[0], "rotation": root_quat, "scale": [SCALE, SCALE, SCALE], "children": [1]},
        {"name": "mesh", "mesh": 0, "skin": 0}
    ]
    for i, b in enumerate(bones):
        q = euler_to_quat(*b["rot"])
        nd = {"name": b["name"], "translation": list(b["pos"]), "rotation": list(q), "children": []}
        nodes.append(nd)
    for i, b in enumerate(bones):
        pnode = 0 if b["parent"] < 0 else (2 + b["parent"])
        nodes[pnode].setdefault("children", []).append(2 + i)
    for nd in nodes:
        if "children" in nd and not nd["children"]:
            del nd["children"]

    # Inverse bind matrices (column-major!)
    ibm_floats = []
    for m in inv_bind_mats:
        for col in range(4):
            for row in range(4):
                ibm_floats.append(m[row][col])
    bv_ibm = add_bv(struct.pack(f"<{len(ibm_floats)}f", *ibm_floats))
    acc_ibm = add_acc(bv_ibm, 5126, numbones, "MAT4")
    skins = [{"inverseBindMatrices": acc_ibm, "joints": [2 + i for i in range(numbones)], "skeleton": 0}]

    # Keyframe Animations
    animations = []
    for lbl, fps, nframes, anim_off in seqs_to_export:
        # Step downsample slightly if very long (>45 frames) to keep GLB compact
        step = 2 if nframes > 50 else 1
        frame_indices = list(range(0, nframes, step))
        if frame_indices[-1] != nframes - 1:
            frame_indices.append(nframes - 1)
        times = [fi / fps for fi in frame_indices]
        bv_t = add_bv(struct.pack(f"<{len(times)}f", *times))
        acc_t = add_acc(bv_t, 5126, len(times), "SCALAR", [times[0]], [times[-1]])

        samplers = []
        channels = []
        for bi, b in enumerate(bones):
            t_list, r_list = [], []
            for fi in frame_indices:
                vals = decode_mdl_rle_frame(d, anim_off, bi, fi)
                px = b["pos"][0] + vals[0] * b["pscale"][0]
                py = b["pos"][1] + vals[1] * b["pscale"][1]
                pz = b["pos"][2] + vals[2] * b["pscale"][2]
                rx = b["rot"][0] + vals[3] * b["rscale"][0]
                ry = b["rot"][1] + vals[4] * b["rscale"][1]
                rz = b["rot"][2] + vals[5] * b["rscale"][2]
                t_list.extend((px, py, pz))
                r_list.extend(euler_to_quat(rx, ry, rz))
            bv_tr = add_bv(struct.pack(f"<{len(t_list)}f", *t_list))
            acc_tr = add_acc(bv_tr, 5126, len(frame_indices), "VEC3")
            s_tr = len(samplers)
            samplers.append({"input": acc_t, "output": acc_tr, "interpolation": "LINEAR"})
            channels.append({"sampler": s_tr, "target": {"node": 2 + bi, "path": "translation"}})

            bv_rt = add_bv(struct.pack(f"<{len(r_list)}f", *r_list))
            acc_rt = add_acc(bv_rt, 5126, len(frame_indices), "VEC4")
            s_rt = len(samplers)
            samplers.append({"input": acc_t, "output": acc_rt, "interpolation": "LINEAR"})
            channels.append({"sampler": s_rt, "target": {"node": 2 + bi, "path": "rotation"}})

        animations.append({"name": lbl, "samplers": samplers, "channels": channels})

    gltf_json = {
        "asset": {"version": "2.0", "generator": "CS15-Whisk3D-Converter"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": nodes,
        "meshes": [{"primitives": gltf_prims}],
        "skins": skins,
        "animations": animations,
        "materials": materials,
        "textures": textures,
        "images": images,
        "buffers": [{"byteLength": 0}],
        "bufferViews": buffer_views,
        "accessors": accessors
    }

    while len(bin_buf) % 4 != 0:
        bin_buf.append(0)
    gltf_json["buffers"][0]["byteLength"] = len(bin_buf)

    json_bytes = json.dumps(gltf_json, separators=(",", ":")).encode("utf-8")
    while len(json_bytes) % 4 != 0:
        json_bytes += b" "

    total_len = 12 + 8 + len(json_bytes) + 8 + len(bin_buf)
    os.makedirs(os.path.dirname(out_glb_path), exist_ok=True)
    with open(out_glb_path, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, total_len))
        f.write(struct.pack("<II", len(json_bytes), 0x4E4F534A))
        f.write(json_bytes)
        f.write(struct.pack("<II", len(bin_buf), 0x004E4942))
        f.write(bin_buf)
    return True

def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    # Remove old .csmap.bin if present
    for old_bin in glob.glob(os.path.join(OUT_DIR, "maps", "*.csmap.bin")):
        os.remove(old_bin)

    print("Loading WAD3 texture archives...")
    wad_textures = load_all_wads(RAW_DIR)
    print(f"  Loaded {len(wad_textures)} WAD3 texture entries.")

    exported_textures = {}
    exported_skyboxes = {}
    maps_index = []

    de_bsps = sorted(glob.glob(os.path.join(RAW_DIR, "maps", "de_*.bsp")))
    print(f"Converting {len(de_bsps)} de_* Bomb Defusal maps...")
    for bsp_path in de_bsps:
        meta = convert_bsp_map(bsp_path, wad_textures, exported_textures, exported_skyboxes)
        maps_index.append({
            "name": meta["name"],
            "skybox": meta["skybox"],
            "spawnsCT": len(meta["spawnsCT"]),
            "spawnsT": len(meta["spawnsT"]),
            "bombsites": len(meta["bombsites"]),
            "meta": f"maps/{meta['name']}.csmap.json"
        })
        print(f"  [OK] {meta['name']:14s} CT={len(meta['spawnsCT']):2d} T={len(meta['spawnsT']):2d} Sites={len(meta['bombsites'])} Ladders={len(meta['ladders'])} Sky={meta['skybox']}")

    with open(os.path.join(OUT_DIR, "maps", "index.json"), "w") as f:
        json.dump(maps_index, f, indent=2)

    print("Converting GoldSrc MDL v10 models (with skeleton & animations) -> GLB...")
    mdl_count = 0
    for vp in sorted(glob.glob(os.path.join(RAW_DIR, "models", "v_*.mdl"))):
        name = os.path.splitext(os.path.basename(vp))[0]
        if convert_mdl_to_glb(vp, os.path.join(OUT_DIR, "models", f"{name}.glb"), is_viewmodel=True, is_player=False):
            mdl_count += 1
    for wp in sorted(glob.glob(os.path.join(RAW_DIR, "models", "p_*.mdl")) + [os.path.join(RAW_DIR, "models", "w_c4.mdl")]):
        if os.path.exists(wp):
            name = os.path.splitext(os.path.basename(wp))[0]
            if convert_mdl_to_glb(wp, os.path.join(OUT_DIR, "models", f"{name}.glb"), is_viewmodel=False, is_player=False):
                mdl_count += 1
    for pp in sorted(glob.glob(os.path.join(RAW_DIR, "models", "player", "*", "*.mdl"))):
        cls_name = os.path.basename(os.path.dirname(pp))
        if cls_name == "vip":
            continue
        if convert_mdl_to_glb(pp, os.path.join(OUT_DIR, "models", f"player_{cls_name}.glb"), is_viewmodel=False, is_player=True):
            mdl_count += 1
    print(f"  [OK] Converted {mdl_count} animated GLB models.")

    print("Copying CS 1.5 WAV sounds...")
    snd_out = os.path.join(OUT_DIR, "sounds")
    snd_count = 0
    for sub in ("weapons", "player", "items"):
        src_sub = os.path.join(RAW_DIR, "sound", sub)
        dst_sub = os.path.join(snd_out, sub)
        os.makedirs(dst_sub, exist_ok=True)
        for wf in sorted(glob.glob(os.path.join(src_sub, "*.wav"))):
            shutil.copy2(wf, os.path.join(dst_sub, os.path.basename(wf)))
            snd_count += 1
    radio_keep = {
        "bombpl.wav", "bombdef.wav", "terwin.wav", "ctwin.wav", "rounddraw.wav",
        "fireinhole.wav", "com_go.wav", "locknload.wav", "letsgo.wav", "moveout.wav",
        "enemydown.wav", "roger.wav", "negative.wav", "clear.wav"
    }
    os.makedirs(os.path.join(snd_out, "radio"), exist_ok=True)
    for wf in sorted(glob.glob(os.path.join(RAW_DIR, "sound", "radio", "*.wav"))):
        bn = os.path.basename(wf)
        if bn in radio_keep:
            shutil.copy2(wf, os.path.join(snd_out, "radio", bn))
            snd_count += 1
    print(f"  [OK] Copied {snd_count} WAV sound files.")
    print("Done! Assets written to:", OUT_DIR)

if __name__ == "__main__":
    main()
