// Auto-detects whether assets/ is served at ./assets/ (tools/serve_cs15.py)
// or ../assets/ (e.g. `python3 -m http.server` from repo root opening /web/).
export let ASSET_BASE = "assets/";

export async function detectAssetBase() {
    try {
        const r = await fetch("assets/maps/index.json", { method: "HEAD" });
        if (r.ok) { ASSET_BASE = "assets/"; return ASSET_BASE; }
    } catch {}
    try {
        const r2 = await fetch("../assets/maps/index.json", { method: "HEAD" });
        if (r2.ok) { ASSET_BASE = "../assets/"; return ASSET_BASE; }
    } catch {}
    return ASSET_BASE;
}

export function assetUrl(rel) {
    return ASSET_BASE + rel.replace(/^\/+/, "");
}
