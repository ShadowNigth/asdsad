# Modelos y sonidos para Counter-Strike 1.6

Este repositorio prepara los **42 WAV de reemplazo** que vienen en `ShadowNigth/archi` para instalarse como sonidos de armas de CS 1.6. Los archivos están en la ruta que GoldSrc espera:

```text
cstrike/sound/weapons/<sonido>.wav
```

Los WAV son PCM mono, 16-bit y 22.050 Hz; conservan sus nombres de evento para sustituir los sonidos estándar. Valida el banco y prepara la instalación completa con:

```bash
python3 tools/build_sound_pack.py --check-only
python3 tools/package_install.py
```

El empaquetador copia modelos y sonidos a `dist/cstrike/`. Para volver a obtener los WAV desde el repositorio de origen puedes usar `python3 tools/build_sound_pack.py --source "/ruta/a/archi/sound"`.

## Estado de los modelos

Los modelos originales de `archi` son **Source 1/CS:GO** (`IDST v49`), no modelos GoldSrc. Se exportaron sus geometrías, animaciones y texturas, y se dividieron en bodyparts compatibles con GoldSrc antes de compilarlos como `IDST v10`. El flujo reproducible está en `tools/port_source_viewmodel.py`; se debe indicar el orden de animaciones que corresponde al arma de CS 1.6.

No se renombraron modelos Source como si fueran GoldSrc. Ya compilé **29 viewmodels para slots estándar** en `cstrike/models/` y **15 variantes** en `cstrike/alternatives/`; sus orígenes y datos de compilación están en [`docs/compiled-models.csv`](docs/compiled-models.csv) y [`docs/compiled-alternatives.csv`](docs/compiled-alternatives.csv). Los 42 sonidos compatibles están en `cstrike/sound/weapons/`. Los modelos son GoldSrc v10, pero aún requieren prueba visual y de animaciones dentro de CS 1.6.

Para preparar una carpeta instalable con ambos tipos de assets:

```bash
python3 tools/package_install.py
```

Copia el contenido de `dist/cstrike/` sobre la carpeta `cstrike/` del juego después de hacer una copia de seguridad.

Se inventariaron 50 viewmodels de origen (incluidas variantes de inspección/accesorios); el CSV registra el formato detectado y destinos candidatos, y señala colisiones o armas sin slot vanilla: [`docs/source-model-inventory.csv`](docs/source-model-inventory.csv). Puedes regenerarlo sobre un checkout extraído de `archi` con:

```bash
python3 tools/inventory_source_models.py --source "/ruta/a/archi"
```

La guía de conversión está en [`docs/modelos-goldsrc.md`](docs/modelos-goldsrc.md). La conversión final debe probarse en CS 1.6 antes de instalarse.
