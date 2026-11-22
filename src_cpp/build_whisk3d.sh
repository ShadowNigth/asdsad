#!/usr/bin/env bash
set -e
CORE="${WHISK3D_CORE_DIR:-/tmp/whisk3d-core}"
if command -v emcc >/dev/null 2>&1; then
  echo "Building WebGL target via Whisk3D Core + Emscripten..."
  mkdir -p build_web
  emcc main.cpp \
    "$CORE/graphics/gles2/w3dGraphicsGLES2.cpp" \
    "$CORE/math/Matrix4.cpp" "$CORE/math/Vector3.cpp" "$CORE/math/Quaternion.cpp" \
    "$CORE/objects/CameraBase.cpp" "$CORE/objects/VisBsp.cpp" "$CORE/objects/MundoBsp.cpp" \
    "$CORE/graphics/w3dTexture.cpp" "$CORE/io/w3dFilesystem.cpp" "$CORE/base/w3dlog.cpp" \
    -DW3D_WEBGL -DW3D_STB_IMPL \
    -I"$CORE" -I"$CORE/base" -I"$CORE/graphics" -I"$CORE/io" -I"$CORE/thirdparty" \
    -sUSE_SDL=2 -O2 \
    --preload-file ../assets@/assets \
    -o build_web/cs15_whisk3d.html
else
  echo "Building Desktop target via CMake + Whisk3D Core..."
  cmake -B build -DWHISK3D_CORE_DIR="$CORE"
  cmake --build build -j4
fi
