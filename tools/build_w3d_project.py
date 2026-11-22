#!/usr/bin/env python3
"""
Builds whisk3d_project/proyecto.json (Whisk3D v4 format) and packages cs15_de_dust2.w3d
for direct opening in Whisk3D Editor (Desktop, Android, WebGL).
"""
import os
import json
import zipfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
PROJ_DIR = os.path.join(ROOT, "whisk3d_project")
ASSETS_DIR = os.path.join(ROOT, "assets")

def main():
    with open(os.path.join(ASSETS_DIR, "maps", "de_dust2.csmap.json")) as f:
        d2 = json.load(f)

    ct0 = d2["spawnsCT"][0]["pos"]
    t0  = d2["spawnsT"][0]["pos"]
    siteA = d2["bombsites"][0]["center"] if d2["bombsites"] else [0, 0, 0]
    siteB = d2["bombsites"][1]["center"] if len(d2["bombsites"]) > 1 else siteA

    proyecto = {
        "version": 4,
        "contenedor": {"formato": 2, "generador": "Whisk3D"},
        "compilar": {
            "modoVentana": "pantallaCompleta",
            "orientacion": "horizontal",
            "fisica": True,
            "sonido": True,
            "volumen": 100,
            "debug": False,
            "assets": "sueltos",
            "plataforma": "linux-deb",
            "uid": "0x43533135"
        },
        "fps": 60,
        "fullscreen": False,
        "reproduciendo": False,
        "mallas": [],
        "escena": {
            "objetos": [
                {
                    "tipo": "rutina",
                    "nombre": "Constructor",
                    "constructor": True,
                    "version": 2,
                    "pasos": [{"paso": "colorLimpieza", "id": 1, "n": [0.55, 0.62, 0.70, 1.0]}]
                },
                {
                    "tipo": "rutina",
                    "nombre": "Limpiar pantalla",
                    "version": 2,
                    "pasos": [{"paso": "limpiar", "id": 1, "entero": 3}]
                },
                {
                    "tipo": "ui",
                    "archivo": "ui/hud.w3dui"
                },
                {
                    "tipo": "coleccion",
                    "nombre": "CounterStrike15_de_dust2",
                    "pos": [0, 0, 0],
                    "rot": [0, 0, 0],
                    "escala": [1, 1, 1],
                    "hijos": [
                        {
                            "tipo": "luz",
                            "nombre": "Sol_Desert",
                            "pos": [15, 45, -10],
                            "rot": [-55, 25, 0],
                            "escala": [1, 1, 1],
                            "color": [1.0, 0.95, 0.85]
                        },
                        {
                            "tipo": "culling",
                            "nombre": "Mapa_de_dust2",
                            "pos": [0, 0, 0],
                            "rot": [0, 0, 0],
                            "escala": [1, 1, 1],
                            "soloCamaraActiva": True,
                            "distanciaMax": 0,
                            "metodo": "bsp",
                            "bsp": "bsp/de_dust2.w3dbsp",
                            "hijos": []
                        },
                        {
                            "tipo": "vacio",
                            "nombre": "BombsiteA",
                            "pos": siteA,
                            "rot": [0, 0, 0],
                            "escala": [1, 1, 1]
                        },
                        {
                            "tipo": "vacio",
                            "nombre": "BombsiteB",
                            "pos": siteB,
                            "rot": [0, 0, 0],
                            "escala": [1, 1, 1]
                        },
                        {
                            "tipo": "vacio",
                            "nombre": "GameMode_DE",
                            "pos": [0, 0, 0],
                            "rot": [0, 0, 0],
                            "escala": [1, 1, 1],
                            "scripts": [{"archivo": "scripts/cs_config.lua"}, {"archivo": "scripts/cs_gamemode_de.lua"}]
                        },
                        {
                            "tipo": "vacio",
                            "nombre": "Jugador",
                            "pos": ct0,
                            "rot": [0, 0, 0],
                            "escala": [1, 1, 1],
                            "scripts": [
                                {"archivo": "scripts/cs_movement.lua", "refs": {"camara": "CamaraFPS", "mundo": "Mapa_de_dust2"}},
                                {"archivo": "scripts/cs_weapons.lua", "refs": {"camara": "CamaraFPS"}}
                            ],
                            "hijos": [
                                {
                                    "tipo": "camara",
                                    "nombre": "CamaraFPS",
                                    "pos": [0, 1.625, 0],
                                    "rot": [0, 0, 0],
                                    "escala": [1, 1, 1],
                                    "fov": 90,
                                    "orto": False,
                                    "near": 0.05,
                                    "far": 250
                                }
                            ]
                        },
                        {
                            "tipo": "vacio",
                            "nombre": "bot_T1",
                            "pos": t0,
                            "rot": [0, 0, 0],
                            "escala": [1, 1, 1],
                            "scripts": [
                                {"archivo": "scripts/cs_bots.lua", "refs": {"equipo": "T", "objetivoA": "BombsiteA", "objetivoB": "BombsiteB", "jugador": "Jugador"}}
                            ]
                        }
                    ]
                }
            ]
        },
        "materiales": [],
        "sesion": {"frame": 1, "activo": "", "seleccion": []},
        "layout": "Layout {\n  ViewportRow {\n    ViewportColumn {\n      Viewport3D {\n        posX: 0\n        posY: 4\n        posZ: 12\n        orbitDistance: 12\n        ViewFromCameraActive: true\n        view: Rendered\n      }\n    }\n  }\n}\n"
    }

    os.makedirs(PROJ_DIR, exist_ok=True)
    proj_json_path = os.path.join(PROJ_DIR, "proyecto.json")
    with open(proj_json_path, "w") as f:
        json.dump(proyecto, f, indent=1)

    # Package self-contained .w3d v4 ZIP for de_dust2 (keeps size ~4 MB)
    out_w3d = os.path.join(ROOT, "cs15_de_dust2.w3d")
    with zipfile.ZipFile(out_w3d, "w", compression=zipfile.ZIP_DEFLATED) as z:
        z.writestr("mimetype", "application/vnd.whisk3d.proyecto+zip")
        z.write(proj_json_path, "proyecto.json")
        z.write(os.path.join(PROJ_DIR, "ui", "hud.w3dui"), "ui/hud.w3dui")
        for fn in sorted(os.listdir(os.path.join(PROJ_DIR, "scripts"))):
            if fn.endswith(".lua"):
                z.write(os.path.join(PROJ_DIR, "scripts", fn), f"scripts/{fn}")
        # Add de_dust2.w3dbsp + its referenced textures & lightmap
        z.write(os.path.join(ASSETS_DIR, "maps", "de_dust2.w3dbsp"), "bsp/de_dust2.w3dbsp")
        z.write(os.path.join(ASSETS_DIR, "maps", "de_dust2_lm.png"), "texturas/de_dust2_lm.png")
        for m in d2["materials"]:
            tex_src = os.path.join(ASSETS_DIR, m["tex"])
            tex_dst = "texturas/" + os.path.basename(m["tex"])
            if os.path.exists(tex_src):
                z.write(tex_src, tex_dst)
        # Core weapon/player sounds
        for sub in ("weapons", "player", "radio", "items"):
            sdir = os.path.join(ASSETS_DIR, "sounds", sub)
            if os.path.isdir(sdir):
                for sfn in sorted(os.listdir(sdir)):
                    if sfn.endswith(".wav"):
                        z.write(os.path.join(sdir, sfn), f"sounds/{sub}/{sfn}")

    print(f"[OK] Built {proj_json_path} and packaged {out_w3d} ({os.path.getsize(out_w3d) // 1024} KB)")

if __name__ == "__main__":
    main()
