# Conversión de modelos de `archi` a viewmodels de CS 1.6

## Compatibilidad comprobada

El repositorio fuente `ShadowNigth/archi` trae modelos de armas de CS:GO/Source 1 en sus carpetas `EXTRAIDOS/.../#pak/models/weapons/`. Los `.mdl` inspeccionados empiezan con `IDST` y declaran versión 49 (Source); un modelo GoldSrc para CS 1.6 usa versión 10. Los ficheros complementarios `.vvd`, `.dx90.vtx` y `.ani` también son parte del formato Source. No son archivos intercambiables con el motor GoldSrc.

El origen contiene modelos ya compilados para Source y no incluye SMD/QC GoldSrc listos para compilar. El preflight detecta 50 archivos `v_*.mdl` (incluye variantes de inspección/accesorios), todos `IDST v49`; el detalle está en [`source-model-inventory.csv`](source-model-inventory.csv). Renombrarlos no los convierte.

## Auditoría y primer port

El detalle de vértices LOD 0, triángulos, huesos, secuencias y archivos laterales está en [`source-model-audit.csv`](source-model-audit.csv). Solo dos entradas son máscaras auxiliares de lente de 58 y 82 triángulos; los otros 48 superan 2.048 vértices y triángulos. El AK-47 tiene 21.756 vértices, 29.960 triángulos y 69 huesos; el P90, 43.373 vértices, 63.246 triángulos y 110 huesos.

Se compilaron **29 viewmodels para slots estándar** en `cstrike/models/` y **15 alternativas** en `cstrike/alternatives/`; los detalles están en [`compiled-models.csv`](compiled-models.csv) y [`compiled-alternatives.csv`](compiled-alternatives.csv). Esto cubre los 44 addons de armas/equipo con viewmodel principal; seis entradas restantes de las 50 son máscaras auxiliares, modelos de inspección o duplicados de smoke por equipo. Para ajustarse al límite de vértices por submodelo, el exportador divide la geometría entre bodyparts (AK-47: 13; M4A1 desde el modelo M4A4: 21; P90: 25; M249: 30), conservando la malla, la textura base y las secuencias seleccionadas. Cada archivo instalado fue aceptado por `studiomdl++` y verificado como `IDST v10`.

**No pude probarlos dentro de una instalación de CS 1.6.** La posición en pantalla, materiales, secuencias numéricas y reproducción en juego siguen pendientes; son builds compilados, no ports certificados. El exportador [`tools/port_source_viewmodel.py`](../tools/port_source_viewmodel.py) trabaja con un viewmodel cada vez. Se proporcionó un orden de secuencias candidato para cada uno. Las alternativas en `cstrike/alternatives/` no deben instalarse todas a la vez: elige una para el slot indicado en el CSV. Taser requiere un mod/plugin, y los modelos de granadas alternativos solo cambian el aspecto del slot, no su comportamiento.

El compilador GoldSrc se puede reconstruir en Linux desde [`G2Pavon/studiomdlPlusPlus`](https://github.com/G2Pavon/studiomdlPlusPlus) mediante `tools/build_studiomdl_linux.sh`. El compilador no decompila modelos Source: esa extracción y la adaptación de secuencias las realiza el exportador, con SourceIO y conversión de VTF/VMT a BMP paletizado.

## Reproducir el port AK-47

En Linux con `git`, `g++` y Python 3:

```bash
python3 -m pip install -r requirements-model-port.txt
mkdir -p .cache
git clone --depth 1 https://github.com/REDxEYE/SourceIO.git .cache/SourceIO
tools/build_studiomdl_linux.sh
python3 tools/port_source_viewmodel.py \\
  --source "/ruta/a/archi" \\
  --addon m_cs2_ak47 \\
  --output work/ak47 \\
  --target v_ak47.mdl \\
  --sequence-order ak47_idle,ak47_fire1,ak47_fire2,ak47_fire3,ak47_reload,ak47_draw \\
  --sourceio .cache \\
  --compiler .cache/studiomdl++
```

El compilador genera `work/ak47/v_ak47.mdl`; el archivo incluido en `cstrike/models/` es esa salida verificada como GoldSrc v10. Para otro addon, confirma primero los nombres y el orden de secuencias que espera el arma de destino; evita instalar un candidato sin una prueba visual/animada en juego.

## Flujo de trabajo por arma

1. **Elegir el arma y el modelo en primera persona.** En el contenido extraído, localizar `v_*.mdl` dentro de `#pak/models/weapons/`; no usar el `w_*.mdl`, que es el modelo del mundo.
2. **Decompilar el modelo Source** con una herramienta compatible con modelos Source 1 (por ejemplo, Crowbar), exportando geometría, esqueleto, materiales y secuencias. No se debe copiar el `.mdl` Source al juego.
3. **Convertir las texturas** VTF/VMT a texturas compatibles con GoldSrc (BMP de paleta/índice adecuado) y ajustar UV, nombres y límites de textura.
4. **Retargetear las animaciones** al esqueleto y a los nombres/secuencias que espera el arma de CS 1.6: como mínimo idle, draw, fire y reload, además de las variantes necesarias (por ejemplo, silenciador, zoom o inspección si se quieren). Revisar eventos y tiempos; no todos los gestos de CS:GO tienen equivalencia directa.
5. **Optimizar y adaptar** polígonos, huesos, vértices y mallas a los límites de GoldSrc. El modelo de Source puede excederlos. Corregir escala, pivote, orientación y posición de manos en primera persona.
6. **Escribir/ajustar el QC GoldSrc** para exportar formato de estudio 10, con secuencias y eventos apropiados; compilar con un `studiomdl` de GoldSrc (no el compilador de Source). Abrir el resultado en un visor compatible con GoldSrc y probar todas las animaciones en CS 1.6.
7. Instalar el resultado con el **nombre exacto del viewmodel original** en `cstrike/models/`. Así se reemplaza el modelo local de esa arma sin tocar el código del juego.

> El compilador debe ser el de GoldSrc y la salida debe verificarse como versión 10. La conversión puede requerir trabajo manual de rigging/animación; no hay una conversión fiable de lote que transforme directamente el Source `.mdl` incluido.

## Nombres habituales de viewmodels en CS 1.6

Usa el nombre que corresponde al arma que quieres reemplazar, no un nombre genérico `v_model.mdl`:

| Arma de CS 1.6 | Archivo local |
|---|---|
| AK-47 | `cstrike/models/v_ak47.mdl` |
| M4A1 | `cstrike/models/v_m4a1.mdl` |
| AWP | `cstrike/models/v_awp.mdl` |
| Scout | `cstrike/models/v_scout.mdl` |
| AUG | `cstrike/models/v_aug.mdl` |
| SG-552 | `cstrike/models/v_sg552.mdl` |
| Galil | `cstrike/models/v_galil.mdl` |
| FAMAS | `cstrike/models/v_famas.mdl` |
| G3SG1 | `cstrike/models/v_g3sg1.mdl` |
| SG-550 | `cstrike/models/v_sg550.mdl` |
| MP5 | `cstrike/models/v_mp5.mdl` |
| P90 | `cstrike/models/v_p90.mdl` |
| MAC-10 | `cstrike/models/v_mac10.mdl` |
| TMP | `cstrike/models/v_tmp.mdl` |
| UMP-45 | `cstrike/models/v_ump45.mdl` |
| M249 | `cstrike/models/v_m249.mdl` |
| USP | `cstrike/models/v_usp.mdl` |
| Glock-18 | `cstrike/models/v_glock18.mdl` |
| Desert Eagle | `cstrike/models/v_deagle.mdl` |
| P228 | `cstrike/models/v_p228.mdl` |
| Five-SeveN | `cstrike/models/v_fiveseven.mdl` |
| Dual Elites | `cstrike/models/v_elite.mdl` |
| M3 | `cstrike/models/v_m3.mdl` |
| XM1014 | `cstrike/models/v_xm1014.mdl` |

Los nombres pueden variar en instalaciones modificadas; confirma los `v_*.mdl` originales de tu instalación antes de reemplazarlos. Haz copia de seguridad.

## Sonidos

Los WAV de este proyecto ya están en formato PCM mono, 16-bit y 22.050 Hz. Se instalan bajo `cstrike/sound/weapons/` conservando los nombres de evento que usa CS 1.6, por ejemplo `ak47-1.wav`, `m4a1-1.wav` y `usp_unsil-1.wav`. El motor selecciona los sonidos mediante los eventos de arma; **el sonido no queda vinculado automáticamente a un modelo por renombrarlo**. Para que coincidan, hay que sustituir los sonidos/eventos de la misma arma y conservar sus nombres/rutas. Los WAV incluidos cubren sustituciones de audio, pero no cambian eventos de animación ni scripts del juego.

Validar y preparar el directorio de instalación:

```bash
python3 tools/build_sound_pack.py --check-only
python3 tools/build_sound_pack.py
```

El comando arma `dist/cstrike/sound/weapons/`, listo para copiar sobre la carpeta `cstrike/` del juego.
