# Counter-Strike 1.5 Retail (`cs15_retail`) en Whisk3D

Port completo de **Counter-Strike 1.5 Retail** (todos los **15 mapas `de_*` Bomb Defusal**) ejecutándose sobre la arquitectura de **Whisk3D** (`.w3dbsp` v2 + `.w3d` v4 + `.w3dui` + Lua + C++ `Whisk3D-Core` + Cliente jugable WebGL2).

- **Rama en GitHub:** [`arena/6dbd5bad-asdsad`](https://github.com/ShadowNigth/asdsad/tree/arena/6dbd5bad-asdsad)
- **Descarga directa ZIP de la rama:** [`asdsad-arena-6dbd5bad-asdsad.zip`](https://github.com/ShadowNigth/asdsad/archive/refs/heads/arena/6dbd5bad-asdsad.zip)
- **Paquete `.w3d` (ZIP Whisk3D):** [`cs15_de_dust2.w3d`](https://github.com/ShadowNigth/asdsad/raw/refs/heads/arena/6dbd5bad-asdsad/cs15_de_dust2.w3d)

## Estructura del Repositorio

- **`whisk3d_project/`**: Proyecto nativo de **Whisk3D Editor** (`proyecto.json` formato v4) con:
  - `ui/hud.w3dui` (HUD nativo Whisk3D)
  - `scripts/cs_config.lua` (arsenal completo de 27 armas CS 1.5 y constantes GoldSrc)
  - `scripts/cs_movement.lua` (física `PM_Move`: aceleración, `sv_airaccelerate`, bunnyhop, crouch-jump, sigilo y escaleras)
  - `scripts/cs_weapons.lua` (retroceso, dispersión dinámica, silenciador, zoom de francotirador, ráfaga Glock, cuchillo y granadas)
  - `scripts/cs_gamemode_de.lua` (reglas `de_` Bomb Defusal: economía, buyzone, plantado/desactivación de C4)
  - `scripts/cs_bots.lua` (IA táctica de bots CT y T)
  - `scripts/cs_hud.lua` (mira dinámica, radar, killfeed, menú de compra y scoreboard)
- **`cs15_de_dust2.w3d`**: Paquete autocontenido `.w3d` v4 (ZIP) listo para abrir/compilar en Whisk3D Editor (`de_dust2.w3dbsp`, texturas, lightmap, WAVs, UI y scripts Lua).
- **`src_cpp/`**: Código fuente C++ para **Whisk3D-Core** (`main.cpp`, `CMakeLists.txt`, `build_whisk3d.sh`) usando `w3dEngine`, `VisBsp`, `MundoBsp`, `CameraBase`, `w3dTexture` y `W3dAudio` (Desktop SDL2+OpenGL y Emscripten/WebGL).
- **`assets/`**: Todos los assets convertidos de `cs15_retail`:
  - `assets/maps/`: Los **15 mapas `de_*`** (`de_aztec`, `de_cbble`, `de_chateau`, `de_dust`, `de_dust2`, `de_inferno`, `de_nuke`, `de_piranesi`, `de_prodigy`, `de_storm`, `de_survivor`, `de_torn`, `de_train`, `de_vegas`, `de_vertigo`) en formato Whisk3D **`.w3dbsp` v2** + **`.cscol.bin`** (clipnodes GoldSrc) + **`.csmap.json`** + lightmaps **`_lm.png`**.
  - `assets/models/`: 65 modelos `.glb` con esqueleto y animaciones (`v_*` viewmodels, `player_*` 8 skins CT/T, `w_c4`).
  - `assets/textures/` y `assets/skyboxes/`: Texturas de mapas y skyboxes convertidos de WAD/TGA a PNG.
  - `assets/sounds/`: 254 efectos de sonido WAV originales de CS 1.5 (armas, radio, pasos, impactos, C4).
- **`web/`**: Cliente WebGL2 jugable en vivo (`index.html`, `js/`, `css/`) que carga directamente los archivos `.w3dbsp` v2 (con PVS + Frustum Culling + Lightmaps 2x), `.cscol.bin` (colisiones BSP GoldSrc), `.glb` animados y audio 3D WAV.
- **`tools/`**:
  - `cs15_converter.py`: Conversor completo de GoldSrc BSP/WAD/MDL/TGA/WAV a Whisk3D `.w3dbsp` v2 + `.cscol.bin` + `.glb` + PNG/WAV.
  - `build_w3d_project.py`: Generador de `whisk3d_project/proyecto.json` y `cs15_de_dust2.w3d`.
  - `serve_cs15.py`: Servidor HTTP para la vista previa en vivo (`0.0.0.0:8080`).

## Controles en la Vista Previa WebGL

- **`WASD`**: Moverse &nbsp;|&nbsp; **`Space`**: Saltar / Bunnyhop &nbsp;|&nbsp; **`Shift`**: Caminar sin ruido &nbsp;|&nbsp; **`Ctrl` / `C`**: Agacharse
- **`Click Izq`**: Disparar / Lanzar granada / Plantar C4 &nbsp;|&nbsp; **`Click Der`**: Zoom (AWP/Scout/AUG/SG552) / Silenciador (M4A1/USP) / Ráfaga (Glock) / Puñalada (Cuchillo)
- **`R`**: Recargar &nbsp;|&nbsp; **`E`**: Plantar / Desactivar C4 &nbsp;|&nbsp; **`B`**: Menú de compra &nbsp;|&nbsp; **`F1`**: Autobuy
- **`1–5` / `Q` / `G`**: Cambiar / soltar arma &nbsp;|&nbsp; **`N`**: Visión nocturna &nbsp;|&nbsp; **`Tab`**: Marcador &nbsp;|&nbsp; **`M`**: Menú de equipo/mapa &nbsp;|&nbsp; **`~`**: Consola (`map de_inferno`, `bot_quota 5`, `noclip`, `god`, `impulse 101`)
