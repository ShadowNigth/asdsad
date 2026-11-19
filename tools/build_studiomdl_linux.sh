#!/usr/bin/env bash
# Build the open-source GoldSrc studiomdl++ compiler on Linux.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="${ROOT}/.cache/studiomdlplusplus"
OUT="${ROOT}/.cache/studiomdl++"
if [[ ! -d "${SRC}/src" ]]; then
  git clone --depth 1 https://github.com/G2Pavon/studiomdlPlusPlus.git "${SRC}"
fi
mkdir -p "$(dirname "${OUT}")"
g++ -std=c++17 -O2 \
  -I"${SRC}/src" -I"${SRC}/src/utils" -I"${SRC}/src/format" \
  -I"${SRC}/src/format/image" -I"${SRC}/src/monsters" \
  "${SRC}/src/utils/cmdlib.cpp" \
  "${SRC}/src/utils/mathlib.cpp" \
  "${SRC}/src/utils/stripification.cpp" \
  "${SRC}/src/format/image/bmpread.cpp" \
  "${SRC}/src/format/qc.cpp" \
  "${SRC}/src/studiomdl.cpp" \
  "${SRC}/src/writemdl.cpp" \
  -o "${OUT}"
echo "GoldSrc compiler built: ${OUT}"
