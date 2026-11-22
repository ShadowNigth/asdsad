#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
PORT="${PORT:-8080}"
echo "Iniciando Counter-Strike 1.5 Retail (Whisk3D WebGL) en http://127.0.0.1:${PORT} ..."
(sleep 1.2 && command -v xdg-open >/dev/null 2>&1 && xdg-open "http://127.0.0.1:${PORT}" >/dev/null 2>&1) &
exec python3 tools/serve_cs15.py
