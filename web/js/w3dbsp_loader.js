// ============================================================================
//  w3dbsp_loader.js — Cargador de mapas Whisk3D (.w3dbsp v2) + .cscol.bin + .csmap.json
//  Lee exactamente el mismo archivo .w3dbsp v2 que usa Whisk3D Core (VisBsp + MundoBsp).
// ============================================================================
export class CSMapData {
    constructor() {
        this.meta = null;
        // VisBsp
        this.nodes = [];
        this.leafCluster = null;
        this.nClusters = 0;
        this.bytesRow = 0;
        this.pvsOff = null;
        this.pvs = null;
        // MundoBsp
        this.materials = [];
        this.groups = [];
        this.faces = [];
        this.leafFaceOff = null;
        this.leafFaces = null;
        this.nodeBoxes = null;
        this.leafBoxes = null;
        // Collision (.cscol.bin)
        this.colPlanes = null;
        this.clipnodes = null;
        this.colModels = [];
    }

    static async load(mapName) {
        const m = new CSMapData();
        const metaResp = await fetch(assetUrl(`maps/${mapName}.csmap.json`));
        if (!metaResp.ok) throw new Error(`Failed loading ${mapName}.csmap.json`);
        m.meta = await metaResp.json();

        const [w3dBuf, colBuf] = await Promise.all([
            fetch(assetUrl(`maps/${mapName}.w3dbsp`)).then(r => r.arrayBuffer()),
            fetch(assetUrl(`maps/${mapName}.cscol.bin`)).then(r => r.arrayBuffer()),
        ]);

        m._parseW3dBsp(w3dBuf);
        m._parseColBin(colBuf);
        return m;
    }

    _parseW3dBsp(buf) {
        const dv = new DataView(buf);
        const u8 = new Uint8Array(buf);
        const magic = String.fromCharCode(u8[0], u8[1], u8[2], u8[3]);
        if (magic !== "W3BS") throw new Error("Invalid .w3dbsp magic");
        const ver = dv.getUint16(4, true);
        const flags = dv.getUint16(6, true);
        const nNodos = dv.getUint32(8, true);
        const nHojas = dv.getUint32(12, true);
        const nCl = dv.getUint32(16, true);
        const nHijos = dv.getUint32(20, true);
        let p = 24;

        this.nodes = new Array(nNodos);
        for (let i = 0; i < nNodos; i++) {
            this.nodes[i] = {
                a: dv.getFloat32(p, true),
                b: dv.getFloat32(p + 4, true),
                c: dv.getFloat32(p + 8, true),
                d: dv.getFloat32(p + 12, true),
                c0: dv.getInt32(p + 16, true),
                c1: dv.getInt32(p + 20, true),
            };
            p += 24;
        }
        this.leafCluster = new Int32Array(nHojas);
        for (let i = 0; i < nHojas; i++) {
            this.leafCluster[i] = dv.getInt32(p, true);
            p += 4;
        }
        this.nClusters = nCl;
        this.bytesRow = (nCl + 7) >> 3;
        this.rle = (flags & 1) !== 0;

        const tamStream = dv.getUint32(p, true); p += 4;
        this.pvsOff = new Uint32Array(nCl);
        for (let i = 0; i < nCl; i++) {
            this.pvsOff[i] = dv.getUint32(p, true);
            p += 4;
        }
        this.pvs = u8.subarray(p, p + tamStream);
        p += tamStream;

        const dec = new TextDecoder();
        for (let i = 0; i < nHijos; i++) {
            const l1 = dv.getUint32(p, true); p += 4 + l1;
            const l2 = dv.getUint32(p, true); p += 4 + l2;
        }

        // GEOM section
        const gmagic = String.fromCharCode(u8[p], u8[p+1], u8[p+2], u8[p+3]);
        if (gmagic !== "GEOM") throw new Error("Missing GEOM in .w3dbsp");
        p += 4;

        const nMat = dv.getUint32(p, true); p += 4;
        this.materials = new Array(nMat);
        for (let i = 0; i < nMat; i++) {
            const l1 = dv.getUint32(p, true); p += 4;
            const tex = dec.decode(u8.subarray(p, p + l1)); p += l1;
            const l2 = dv.getUint32(p, true); p += 4;
            const lm = dec.decode(u8.subarray(p, p + l2)); p += l2;
            const mflags = dv.getUint32(p, true);
            const alphaRef = dv.getFloat32(p + 4, true);
            p += 8;
            this.materials[i] = { tex, lm, flags: mflags, alphaRef };
        }

        const nGroups = dv.getUint32(p, true); p += 4;
        this.groups = new Array(nGroups);
        for (let gi = 0; gi < nGroups; gi++) {
            const nVerts = dv.getUint32(p, true); p += 4;
            const conLm = u8[p] !== 0; p += 1;
            const pos = new Float32Array(buf.slice(p, p + nVerts * 12)); p += nVerts * 12;
            const uv  = new Float32Array(buf.slice(p, p + nVerts * 8));  p += nVerts * 8;
            const lm  = conLm ? new Float32Array(buf.slice(p, p + nVerts * 8)) : null;
            if (conLm) p += nVerts * 8;
            p += nVerts * 4; // vertex color
            const nIdx = dv.getUint32(p, true); p += 4;
            const idx = new Uint16Array(buf.slice(p, p + nIdx * 2)); p += nIdx * 2;
            this.groups[gi] = { nVerts, pos, uv, lm, idx };
        }

        const nFaces = dv.getUint32(p, true); p += 4;
        this.faces = new Array(nFaces);
        for (let i = 0; i < nFaces; i++) {
            this.faces[i] = {
                group: dv.getUint16(p, true),
                mat: dv.getUint16(p + 2, true),
                first: dv.getUint32(p + 4, true),
                count: dv.getUint32(p + 8, true),
            };
            p += 12;
        }

        const nH = dv.getUint32(p, true); p += 4;
        this.leafFaceOff = new Uint32Array(buf.slice(p, p + (nH + 1) * 4)); p += (nH + 1) * 4;
        const nHC = dv.getUint32(p, true); p += 4;
        this.leafFaces = new Uint32Array(buf.slice(p, p + nHC * 4)); p += nHC * 4;

        this.nodeBoxes = new Float32Array(buf.slice(p, p + nNodos * 24)); p += nNodos * 24;
        this.leafBoxes = new Float32Array(buf.slice(p, p + nHojas * 24)); p += nHojas * 24;
        this.ver = ver;
    }

    _parseColBin(buf) {
        const dv = new DataView(buf);
        const u8 = new Uint8Array(buf);
        if (String.fromCharCode(u8[0], u8[1], u8[2], u8[3]) !== "CSC1") {
            throw new Error("Invalid .cscol.bin");
        }
        let p = 4;
        const nPlanes = dv.getUint32(p, true); p += 4;
        this.colPlanes = new Float32Array(buf.slice(p, p + nPlanes * 16)); p += nPlanes * 16;
        const nClip = dv.getUint32(p, true); p += 4;
        this.clipnodes = new Array(nClip);
        for (let i = 0; i < nClip; i++) {
            this.clipnodes[i] = {
                plane: dv.getInt32(p, true),
                c0: dv.getInt16(p + 4, true),
                c1: dv.getInt16(p + 6, true),
            };
            p += 8;
        }
        const nMod = dv.getUint32(p, true); p += 4;
        this.colModels = new Array(nMod);
        for (let i = 0; i < nMod; i++) {
            const min = [dv.getFloat32(p, true), dv.getFloat32(p+4, true), dv.getFloat32(p+8, true)];
            const max = [dv.getFloat32(p+12, true), dv.getFloat32(p+16, true), dv.getFloat32(p+20, true)];
            const headnode = [dv.getInt32(p+24, true), dv.getInt32(p+28, true), dv.getInt32(p+32, true), dv.getInt32(p+36, true)];
            p += 40;
            this.colModels[i] = { min, max, headnode };
        }
    }

    leafAt(x, y, z) {
        let i = 0;
        for (let step = 0; step < 10000 && i >= 0; step++) {
            const nd = this.nodes[i];
            const s = nd.a * x + nd.b * y + nd.c * z - nd.d;
            i = s >= 0 ? nd.c0 : nd.c1;
        }
        return i < 0 ? (-i - 1) : -1;
    }

    clusterAt(x, y, z) {
        const h = this.leafAt(x, y, z);
        if (h < 0 || h >= this.leafCluster.length) return -1;
        return this.leafCluster[h];
    }

    decodePvsRow(cluster, out) {
        out.fill(0);
        if (cluster < 0 || cluster >= this.nClusters) {
            out.fill(255);
            return;
        }
        let p = this.pvsOff[cluster];
        if (!this.rle) {
            out.set(this.pvs.subarray(p, p + this.bytesRow));
            return;
        }
        let o = 0;
        while (o < this.bytesRow && p < this.pvs.length) {
            const b = this.pvs[p++];
            if (b !== 0) {
                out[o++] = b;
            } else {
                const cnt = this.pvs[p++];
                o += cnt;
            }
        }
    }
}
