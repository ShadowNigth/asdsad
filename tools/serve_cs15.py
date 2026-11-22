#!/usr/bin/env python3
"""Live Preview HTTP Server for Counter-Strike 1.5 Retail (Whisk3D WebGL)."""
import http.server
import mimetypes
import os
import posixpath
import socketserver
from urllib.parse import unquote

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB_DIR = os.path.join(ROOT_DIR, "web")
ASSETS_DIR = os.path.join(ROOT_DIR, "assets")

mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("text/css", ".css")
mimetypes.add_type("model/gltf-binary", ".glb")
mimetypes.add_type("application/octet-stream", ".w3dbsp")
mimetypes.add_type("application/octet-stream", ".bin")
mimetypes.add_type("audio/wav", ".wav")
mimetypes.add_type("image/png", ".png")

class CS15Handler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        path = unquote(path.split("?", 1)[0].split("#", 1)[0])
        path = posixpath.normpath(path)
        parts = [p for p in path.split("/") if p and p not in (".", "..")]
        if parts and parts[0] == "assets":
            return os.path.join(ASSETS_DIR, *parts[1:])
        if not parts:
            return os.path.join(WEB_DIR, "index.html")
        return os.path.join(WEB_DIR, *parts)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass  # Keep server stdout clean

class ThreadingHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8080"))
    with ThreadingHTTPServer(("0.0.0.0", port), CS15Handler) as srv:
        print(f"CS 1.5 Whisk3D WebGL Preview listening on 0.0.0.0:{port}", flush=True)
        srv.serve_forever()
