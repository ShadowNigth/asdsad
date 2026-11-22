// ============================================================================
//  bsp_renderer.js — Renderizador WebGL2 para .w3dbsp v2 (PVS + Frustum + Lightmap)
//  + Skybox TGA->PNG + Modelos GLB con animacion esqueletal + Efectos 3D.
// ============================================================================
import { GLBModel, mulMat4 } from "./mdl_loader.js";
import { assetUrl } from "./asset_path.js";

export function mat4Perspective(fovDeg, aspect, near, far, out) {
    const f = 1.0 / Math.tan((fovDeg * Math.PI) / 360.0);
    const nf = 1.0 / (near - far);
    out.fill(0);
    out[0] = f / aspect;
    out[5] = f;
    out[10] = (far + near) * nf;
    out[11] = -1;
    out[14] = 2 * far * near * nf;
}

export function mat4ViewFromYawPitch(pos, yawDeg, pitchDeg, rollDeg, out) {
    const yr = (yawDeg * Math.PI) / 180.0;
    const pr = (pitchDeg * Math.PI) / 180.0;
    const rr = ((rollDeg || 0) * Math.PI) / 180.0;

    // Camera forward in Y-up: yaw=0 -> +X (GoldSrc angle 0), yaw=90 -> -Z (because z_w = -y_hl)
    //Wait: let's match hl_to_w3d_pos: (x_hl, y_hl) -> (x_w, -y_hl)!
    // So GoldSrc yaw=0 (+X_hl) -> +X_w; yaw=90 (+Y_hl) -> -Z_w!
    const cp = Math.cos(pr), sp = Math.sin(pr);
    const cy = Math.cos(yr), sy = Math.sin(yr);
    const fx = cy * cp;
    const fy = sp;
    const fz = -sy * cp;

    // Right = normalize(cross(forward, worldUp(0,1,0)))
    let rx = -fz;
    let ry = 0;
    let rz = fx;
    const rlen = Math.hypot(rx, rz) || 1;
    rx /= rlen; rz /= rlen;

    // Up = cross(right, forward)
    let ux = ry * fz - rz * fy;
    let uy = rz * fx - rx * fz;
    let uz = rx * fy - ry * fx;

    if (Math.abs(rr) > 1e-4) {
        const cr = Math.cos(rr), sr = Math.sin(rr);
        const nrx = rx * cr + ux * sr, nry = ry * cr + uy * sr, nrz = rz * cr + uz * sr;
        const nux = ux * cr - rx * sr, nuy = uy * cr - ry * sr, nuz = uz * cr - rz * sr;
        rx = nrx; ry = nry; rz = nrz;
        ux = nux; uy = nuy; uz = nuz;
    }

    out[0] = rx;  out[4] = ry;  out[8]  = rz;  out[12] = -(rx*pos[0] + ry*pos[1] + rz*pos[2]);
    out[1] = ux;  out[5] = uy;  out[9]  = uz;  out[13] = -(ux*pos[0] + uy*pos[1] + uz*pos[2]);
    out[2] = -fx; out[6] = -fy; out[10] = -fz; out[14] = (fx*pos[0] + fy*pos[1] + fz*pos[2]);
    out[3] = 0;   out[7] = 0;   out[11] = 0;   out[15] = 1;
}

function extractFrustumPlanes(vp, planes) {
    // 6 planes [a,b,c,d] for ax+by+cz+d >= 0
    const r0 = [vp[0], vp[4], vp[8], vp[12]];
    const r1 = [vp[1], vp[5], vp[9], vp[13]];
    const r2 = [vp[2], vp[6], vp[10], vp[14]];
    const r3 = [vp[3], vp[7], vp[11], vp[15]];
    const raw = [
        [r3[0]+r0[0], r3[1]+r0[1], r3[2]+r0[2], r3[3]+r0[3]],
        [r3[0]-r0[0], r3[1]-r0[1], r3[2]-r0[2], r3[3]-r0[3]],
        [r3[0]+r1[0], r3[1]+r1[1], r3[2]+r1[2], r3[3]+r1[3]],
        [r3[0]-r1[0], r3[1]-r1[1], r3[2]-r1[2], r3[3]-r1[3]],
        [r3[0]+r2[0], r3[1]+r2[1], r3[2]+r2[2], r3[3]+r2[3]],
        [r3[0]-r2[0], r3[1]-r2[1], r3[2]-r2[2], r3[3]-r2[3]],
    ];
    for (let i = 0; i < 6; i++) {
        const l = Math.hypot(raw[i][0], raw[i][1], raw[i][2]) || 1;
        planes[i][0] = raw[i][0]/l; planes[i][1] = raw[i][1]/l;
        planes[i][2] = raw[i][2]/l; planes[i][3] = raw[i][3]/l;
    }
}

function aabbInFrustum(boxes, idx6, planes) {
    const x0 = boxes[idx6], y0 = boxes[idx6+1], z0 = boxes[idx6+2];
    const x1 = boxes[idx6+3], y1 = boxes[idx6+4], z1 = boxes[idx6+5];
    for (let i = 0; i < 6; i++) {
        const p = planes[i];
        const px = p[0] >= 0 ? x1 : x0;
        const py = p[1] >= 0 ? y1 : y0;
        const pz = p[2] >= 0 ? z1 : z0;
        if (p[0]*px + p[1]*py + p[2]*pz + p[3] < 0) return false;
    }
    return true;
}

function compileShader(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(s));
    }
    return s;
}

function createProgram(gl, vsSrc, fsSrc) {
    const p = gl.createProgram();
    gl.attachShader(p, compileShader(gl, gl.VERTEX_SHADER, vsSrc));
    gl.attachShader(p, compileShader(gl, gl.FRAGMENT_SHADER, fsSrc));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(p));
    }
    return p;
}

export class BSPRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.gl = canvas.getContext("webgl2", { antialias: true, alpha: false });
        if (!this.gl) throw new Error("WebGL2 not supported");
        this.texCache = new Map();
        this.glbCache = new Map();
        this.map = null;
        this.gpuGroups = [];
        this.mapTextures = [];
        this.lightmapTex = null;
        this.skyTextures = [];
        this.pvsRow = null;
        this.lastCluster = -999;
        this.visibleLeafMask = null;
        this.faceStamp = null;
        this.stamp = 0;
        this.buckets = [];
        this.projMat = new Float32Array(16);
        this.viewMat = new Float32Array(16);
        this.vpMat = new Float32Array(16);
        this.frustumPlanes = Array.from({ length: 6 }, () => [0, 0, 0, 0]);
        this.jointMats = new Float32Array(64 * 16);
        this.stats = { cluster: -1, leaves: 0, draws: 0, tris: 0 };
        this._initShaders();
        this._initPrimitives();
    }

    _initShaders() {
        const gl = this.gl;
        // BSP World Shader (Diffuse + Lightmap 2x + Alpha Test + Water Scroll + NVG)
        this.bspProg = createProgram(gl, `#version 300 es
            layout(location=0) in vec3 aPos;
            layout(location=1) in vec2 aUV;
            layout(location=2) in vec2 aLM;
            uniform mat4 uVP;
            uniform vec2 uScroll;
            out vec2 vUV;
            out vec2 vLM;
            out float vDist;
            void main() {
                vUV = aUV + uScroll;
                vLM = aLM;
                vec4 p = uVP * vec4(aPos, 1.0);
                vDist = p.w;
                gl_Position = p;
            }`,
            `#version 300 es
            precision highp float;
            in vec2 vUV;
            in vec2 vLM;
            in float vDist;
            uniform sampler2D uTex;
            uniform sampler2D uLM;
            uniform int uCutout;
            uniform float uAlpha;
            uniform float uNVG;
            uniform vec3 uFogColor;
            uniform float uFogDensity;
            out vec4 fragColor;
            void main() {
                vec4 diff = texture(uTex, vUV);
                if (uCutout == 1 && diff.a < 0.48) discard;
                vec3 lm = texture(uLM, vLM).rgb;
                vec3 col = diff.rgb * lm * 1.95;
                if (uFogDensity > 0.0) {
                    float fog = clamp(1.0 - exp(-vDist * uFogDensity), 0.0, 0.85);
                    col = mix(col, uFogColor, fog);
                }
                if (uNVG > 0.5) {
                    float lum = dot(col, vec3(0.3, 0.59, 0.11));
                    col = vec3(0.08, 0.95, 0.25) * (0.35 + lum * 1.6);
                }
                fragColor = vec4(col, diff.a * uAlpha);
            }`
        );

        // Skybox Shader
        this.skyProg = createProgram(gl, `#version 300 es
            layout(location=0) in vec3 aPos;
            layout(location=1) in vec2 aUV;
            uniform mat4 uVP;
            out vec2 vUV;
            void main() {
                vUV = aUV;
                vec4 p = uVP * vec4(aPos, 1.0);
                gl_Position = p.xyww;
            }`,
            `#version 300 es
            precision mediump float;
            in vec2 vUV;
            uniform sampler2D uTex;
            uniform float uNVG;
            out vec4 fragColor;
            void main() {
                vec3 col = texture(uTex, vUV).rgb;
                if (uNVG > 0.5) {
                    float lum = dot(col, vec3(0.3, 0.59, 0.11));
                    col = vec3(0.06, 0.75, 0.2) * (0.25 + lum);
                }
                fragColor = vec4(col, 1.0);
            }`
        );

        // Skinned GLB Shader (Viewmodels & Player Models)
        this.mdlProg = createProgram(gl, `#version 300 es
            layout(location=0) in vec3 aPos;
            layout(location=1) in vec3 aNorm;
            layout(location=2) in vec2 aUV;
            layout(location=3) in uvec4 aJoints;
            layout(location=4) in vec4 aWeights;
            uniform mat4 uVP;
            uniform mat4 uModel;
            uniform mat4 uBones[64];
            out vec2 vUV;
            out vec3 vNorm;
            void main() {
                float wsum = aWeights.x + aWeights.y + aWeights.z + aWeights.w;
                mat4 skinMat = mat4(1.0);
                if (wsum > 0.01) {
                    skinMat = uBones[aJoints.x] * aWeights.x
                            + uBones[aJoints.y] * aWeights.y
                            + uBones[aJoints.z] * aWeights.z
                            + uBones[aJoints.w] * aWeights.w;
                }
                vec4 wp = uModel * skinMat * vec4(aPos, 1.0);
                vNorm = mat3(uModel) * mat3(skinMat) * aNorm;
                vUV = aUV;
                gl_Position = uVP * wp;
            }`,
            `#version 300 es
            precision highp float;
            in vec2 vUV;
            in vec3 vNorm;
            uniform sampler2D uTex;
            uniform vec3 uTint;
            uniform float uFlash;
            uniform float uNVG;
            out vec4 fragColor;
            void main() {
                vec4 diff = texture(uTex, vUV);
                if (diff.a < 0.45) discard;
                vec3 n = normalize(vNorm);
                float ndl = max(dot(n, normalize(vec3(0.45, 0.85, 0.35))), 0.0);
                vec3 lit = diff.rgb * (0.48 + 0.62 * ndl + uFlash * 0.65) * uTint;
                if (uNVG > 0.5) {
                    float lum = dot(lit, vec3(0.3, 0.59, 0.11));
                    lit = vec3(0.1, 0.98, 0.3) * (0.35 + lum * 1.4);
                }
                fragColor = vec4(lit, diff.a);
            }`
        );

        // Simple Colored Particle / Tracer / Smoke / Decal Shader
        this.fxProg = createProgram(gl, `#version 300 es
            layout(location=0) in vec3 aPos;
            uniform mat4 uVP;
            uniform mat4 uModel;
            void main() {
                gl_Position = uVP * uModel * vec4(aPos, 1.0);
            }`,
            `#version 300 es
            precision mediump float;
            uniform vec4 uColor;
            out vec4 fragColor;
            void main() {
                fragColor = uColor;
            }`
        );
    }

    _initPrimitives() {
        const gl = this.gl;
        // Unit Cube for skybox & tracers/particles
        const skySides = [
            // bk (-X_w? Wait: GoldSrc skybox orientation: bk, ft, lf, rt, up, dn)
            // Let's build 6 separate quads [x,y,z, u,v] for exact TGA edge matching
            { name: "ft", verts: [-1,-1,-1, 1,1,  1,-1,-1, 0,1,  1, 1,-1, 0,0, -1, 1,-1, 1,0] }, // -Z
            { name: "bk", verts: [ 1,-1, 1, 1,1, -1,-1, 1, 0,1, -1, 1, 1, 0,0,  1, 1, 1, 1,0] }, // +Z
            { name: "lf", verts: [-1,-1, 1, 1,1, -1,-1,-1, 0,1, -1, 1,-1, 0,0, -1, 1, 1, 1,0] }, // -X
            { name: "rt", verts: [ 1,-1,-1, 1,1,  1,-1, 1, 0,1,  1, 1, 1, 0,0,  1, 1,-1, 1,0] }, // +X
            { name: "up", verts: [-1, 1,-1, 0,1,  1, 1,-1, 0,0,  1, 1, 1, 1,0, -1, 1, 1, 1,1] }, // +Y
            { name: "dn", verts: [-1,-1, 1, 1,0,  1,-1, 1, 0,0,  1,-1,-1, 0,1, -1,-1,-1, 1,1] }, // -Y
        ];
        const quadIdx = new Uint16Array([0, 1, 2, 0, 2, 3]);
        this.skyQuads = skySides.map(s => {
            const vao = gl.createVertexArray();
            gl.bindVertexArray(vao);
            const vb = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, vb);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(s.verts), gl.STATIC_DRAW);
            gl.enableVertexAttribArray(0);
            gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0);
            gl.enableVertexAttribArray(1);
            gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 12);
            const eb = gl.createBuffer();
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, eb);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, quadIdx, gl.STATIC_DRAW);
            gl.bindVertexArray(null);
            return { name: s.name, vao };
        });

        // Unit Box VAO for FX (tracers, grenades, shells, smoke puffs, blood)
        const boxPos = new Float32Array([
            -0.5,-0.5, 0.5,  0.5,-0.5, 0.5,  0.5, 0.5, 0.5, -0.5, 0.5, 0.5,
             0.5,-0.5,-0.5, -0.5,-0.5,-0.5, -0.5, 0.5,-0.5,  0.5, 0.5,-0.5,
            -0.5, 0.5, 0.5,  0.5, 0.5, 0.5,  0.5, 0.5,-0.5, -0.5, 0.5,-0.5,
            -0.5,-0.5,-0.5,  0.5,-0.5,-0.5,  0.5,-0.5, 0.5, -0.5,-0.5, 0.5,
             0.5,-0.5, 0.5,  0.5,-0.5,-0.5,  0.5, 0.5,-0.5,  0.5, 0.5, 0.5,
            -0.5,-0.5,-0.5, -0.5,-0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5,-0.5,
        ]);
        const boxIdx = new Uint16Array([
            0,1,2, 0,2,3, 4,5,6, 4,6,7, 8,9,10, 8,10,11,
            12,13,14, 12,14,15, 16,17,18, 16,18,19, 20,21,22, 20,22,23
        ]);
        this.boxVao = gl.createVertexArray();
        gl.bindVertexArray(this.boxVao);
        const bvb = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, bvb);
        gl.bufferData(gl.ARRAY_BUFFER, boxPos, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
        const beb = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, beb);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, boxIdx, gl.STATIC_DRAW);
        gl.bindVertexArray(null);

        // Dynamic index buffer for BSP material batching
        this.dynIdxBuf = gl.createBuffer();
    }

    async loadTexture(url, clamp = false) {
        if (this.texCache.has(url)) return this.texCache.get(url);
        const gl = this.gl;
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([160, 160, 160, 255]));
        this.texCache.set(url, tex);

        try {
            const resp = await fetch(url);
            if (resp.ok) {
                const bmp = await createImageBitmap(await resp.blob());
                gl.bindTexture(gl.TEXTURE_2D, tex);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bmp);
                gl.generateMipmap(gl.TEXTURE_2D);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
                const wrap = clamp ? gl.CLAMP_TO_EDGE : gl.REPEAT;
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
                bmp.close();
            }
        } catch (e) { /* fallback grey pixel */ }
        return tex;
    }

    async loadGLB(url) {
        if (this.glbCache.has(url)) return this.glbCache.get(url);
        try {
            const mdl = await GLBModel.load(this.gl, url);
            this.glbCache.set(url, mdl);
            return mdl;
        } catch (e) {
            this.glbCache.set(url, null);
            return null;
        }
    }

    async setMap(mapData) {
        const gl = this.gl;
        // Clean previous map VBOs
        for (const g of this.gpuGroups) {
            gl.deleteVertexArray(g.vao);
        }
        this.gpuGroups = [];
        this.map = mapData;
        this.lastCluster = -999;
        this.pvsRow = new Uint8Array(mapData.bytesRow);
        this.visibleLeafMask = new Uint8Array(mapData.leafCluster.length);
        this.faceStamp = new Uint32Array(mapData.faces.length);
        this.stamp = 0;

        for (const g of mapData.groups) {
            const vao = gl.createVertexArray();
            gl.bindVertexArray(vao);
            const mk = (arr, loc, sz) => {
                const b = gl.createBuffer();
                gl.bindBuffer(gl.ARRAY_BUFFER, b);
                gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW);
                gl.enableVertexAttribArray(loc);
                gl.vertexAttribPointer(loc, sz, gl.FLOAT, false, 0, 0);
            };
            mk(g.pos, 0, 3);
            mk(g.uv,  1, 2);
            if (g.lm) mk(g.lm, 2, 2);
            gl.bindVertexArray(null);
            this.gpuGroups.push({ vao, idx: g.idx });
        }

        this.buckets = Array.from({ length: mapData.groups.length * mapData.materials.length }, () => []);
        this.lightmapTex = await this.loadTexture(assetUrl(mapData.meta.lightmap), true);
        this.mapTextures = await Promise.all(
            mapData.meta.materials.map(m => this.loadTexture(assetUrl(m.tex), false))
        );
        const sky = mapData.meta.skybox || "des";
        this.skyTextures = {};
        await Promise.all(["ft", "bk", "lf", "rt", "up", "dn"].map(async s => {
            this.skyTextures[s] = await this.loadTexture(assetUrl(`skyboxes/${sky}_${s}.png`), true);
        }));
    }

    render(cam, state) {
        const gl = this.gl;
        const w = this.canvas.width = this.canvas.clientWidth;
        const h = this.canvas.height = this.canvas.clientHeight;
        gl.viewport(0, 0, w, h);
        gl.clearColor(0.1, 0.12, 0.16, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        if (!this.map) return;

        const aspect = w / Math.max(1, h);
        mat4Perspective(cam.fov, aspect, 0.05, 320.0, this.projMat);
        mat4ViewFromYawPitch(cam.pos, cam.yaw, cam.pitch, cam.roll || 0, this.viewMat);
        mulMat4(this.projMat, this.viewMat, this.vpMat);
        extractFrustumPlanes(this.vpMat, this.frustumPlanes);

        const nvg = state.nvg ? 1.0 : 0.0;

        // 1. Skybox
        const skyView = new Float32Array(this.viewMat);
        skyView[12] = 0; skyView[13] = 0; skyView[14] = 0;
        const skyVP = new Float32Array(16);
        mulMat4(this.projMat, skyView, skyVP);
        gl.depthMask(false);
        gl.depthFunc(gl.LEQUAL);
        gl.useProgram(this.skyProg);
        gl.uniformMatrix4fv(gl.getUniformLocation(this.skyProg, "uVP"), false, skyVP);
        gl.uniform1f(gl.getUniformLocation(this.skyProg, "uNVG"), nvg);
        gl.activeTexture(gl.TEXTURE0);
        gl.uniform1i(gl.getUniformLocation(this.skyProg, "uTex"), 0);
        for (const q of this.skyQuads) {
            gl.bindTexture(gl.TEXTURE_2D, this.skyTextures[q.name] || this.lightmapTex);
            gl.bindVertexArray(q.vao);
            gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
        }
        gl.depthMask(true);
        gl.depthFunc(gl.LESS);

        // 2. BSP World (Whisk3D .w3dbsp PVS + Frustum Culling)
        const cl = this.map.clusterAt(cam.pos[0], cam.pos[1], cam.pos[2]);
        if (cl !== this.lastCluster) {
            this.lastCluster = cl;
            this.map.decodePvsRow(cl, this.pvsRow);
            const lc = this.map.leafCluster;
            for (let i = 0; i < lc.length; i++) {
                const c = lc[i];
                this.visibleLeafMask[i] = (c >= 0 && (this.pvsRow[c >> 3] & (1 << (c & 7)))) ? 1 : 0;
            }
        }

        for (let b = 0; b < this.buckets.length; b++) this.buckets[b].length = 0;
        this.stamp++;
        let visLeaves = 0;
        const nMat = this.map.materials.length;
        const nLeaves = this.map.leafCluster.length;
        const leafBoxes = this.map.leafBoxes;
        const lOff = this.map.leafFaceOff;
        const lFaces = this.map.leafFaces;
        const faces = this.map.faces;

        for (let li = 1; li < nLeaves; li++) {
            if (cl >= 0 && !this.visibleLeafMask[li]) continue;
            if (!aabbInFrustum(leafBoxes, li * 6, this.frustumPlanes)) continue;
            visLeaves++;
            const f0 = lOff[li], f1 = lOff[li + 1];
            for (let k = f0; k < f1; k++) {
                const fi = lFaces[k];
                if (this.faceStamp[fi] === this.stamp) continue;
                this.faceStamp[fi] = this.stamp;
                const f = faces[fi];
                this.buckets[f.group * nMat + f.mat].push(fi);
            }
        }

        gl.enable(gl.DEPTH_TEST);
        gl.enable(gl.CULL_FACE);
        gl.cullFace(gl.BACK);
        gl.useProgram(this.bspProg);
        gl.uniformMatrix4fv(gl.getUniformLocation(this.bspProg, "uVP"), false, this.vpMat);
        gl.uniform1f(gl.getUniformLocation(this.bspProg, "uNVG"), nvg);
        gl.uniform3f(gl.getUniformLocation(this.bspProg, "uFogColor"), 0.72, 0.68, 0.60);
        gl.uniform1f(gl.getUniformLocation(this.bspProg, "uFogDensity"), 0.0045);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.lightmapTex);
        gl.uniform1i(gl.getUniformLocation(this.bspProg, "uLM"), 1);
        gl.activeTexture(gl.TEXTURE0);
        gl.uniform1i(gl.getUniformLocation(this.bspProg, "uTex"), 0);

        const locCut = gl.getUniformLocation(this.bspProg, "uCutout");
        const locScr = gl.getUniformLocation(this.bspProg, "uScroll");
        const locAlp = gl.getUniformLocation(this.bspProg, "uAlpha");

        let draws = 0, tris = 0;
        const timeSec = state.time || 0;

        for (let gi = 0; gi < this.gpuGroups.length; gi++) {
            const gpuG = this.gpuGroups[gi];
            gl.bindVertexArray(gpuG.vao);
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.dynIdxBuf);

            for (let mi = 0; mi < nMat; mi++) {
                const flist = this.buckets[gi * nMat + mi];
                if (flist.length === 0) continue;
                const matMeta = this.map.meta.materials[mi];
                let totalIdx = 0;
                for (let k = 0; k < flist.length; k++) totalIdx += faces[flist[k]].count;
                const tmpIdx = new Uint16Array(totalIdx);
                let ptr = 0;
                for (let k = 0; k < flist.length; k++) {
                    const f = faces[flist[k]];
                    tmpIdx.set(gpuG.idx.subarray(f.first, f.first + f.count), ptr);
                    ptr += f.count;
                }
                gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, tmpIdx, gl.DYNAMIC_DRAW);
                gl.bindTexture(gl.TEXTURE_2D, this.mapTextures[mi]);
                gl.uniform1i(locCut, matMeta.cutout ? 1 : 0);
                if (matMeta.cutout) gl.disable(gl.CULL_FACE);
                else gl.enable(gl.CULL_FACE);
                if (matMeta.water) {
                    gl.uniform2f(locScr, timeSec * 0.15, Math.sin(timeSec * 0.8) * 0.05);
                    gl.uniform1f(locAlp, 0.85);
                    gl.enable(gl.BLEND);
                    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
                } else {
                    gl.uniform2f(locScr, 0, 0);
                    gl.uniform1f(locAlp, 1.0);
                    gl.disable(gl.BLEND);
                }
                gl.drawElements(gl.TRIANGLES, totalIdx, gl.UNSIGNED_SHORT, 0);
                draws++;
                tris += totalIdx / 3;
            }
        }
        gl.disable(gl.BLEND);
        gl.enable(gl.CULL_FACE);
        this.stats.cluster = cl;
        this.stats.leaves = visLeaves;
        this.stats.draws = draws;
        this.stats.tris = Math.floor(tris);

        // 3. Render Player Models, Dropped Weapons & C4 in World Space
        gl.useProgram(this.mdlProg);
        gl.uniformMatrix4fv(gl.getUniformLocation(this.mdlProg, "uVP"), false, this.vpMat);
        gl.uniform1f(gl.getUniformLocation(this.mdlProg, "uNVG"), nvg);
        gl.activeTexture(gl.TEXTURE0);
        gl.uniform1i(gl.getUniformLocation(this.mdlProg, "uTex"), 0);

        for (const ent of (state.worldModels || [])) {
            const glb = this.glbCache.get(ent.url);
            if (!glb) continue;
            this._drawGLB(glb, ent.modelMat, ent.animPrefixes, ent.animTime, ent.tint || [1,1,1], ent.flash || 0);
        }

        // 4. 3D Effects (Tracers, Bullets, Shells, Grenades, Smoke, Blood, C4 LED)
        if (state.fxRenderer) {
            state.fxRenderer.render(this, this.vpMat, state.c4LedPos, state.c4LedOn);
        }

        // 5. Viewmodel (cleared depth buffer, view space, classic CS 1.5 bob & kick!)
        if (state.viewmodel && !state.scoped && state.alive) {
            const vm = this.glbCache.get(state.viewmodel.url);
            if (vm) {
                gl.clear(gl.DEPTH_BUFFER_BIT);
                const vmProj = new Float32Array(16);
                mat4Perspective(70, aspect, 0.01, 10.0, vmProj);
                gl.useProgram(this.mdlProg);
                gl.uniformMatrix4fv(gl.getUniformLocation(this.mdlProg, "uVP"), false, vmProj);
                const vmMat = state.viewmodel.mat;
                this._drawGLB(vm, vmMat, state.viewmodel.animPrefixes, state.viewmodel.animTime, [1,1,1], state.viewmodel.muzzleFlash || 0);
            }
        }
    }

    _drawGLB(glb, modelMat, animPrefixes, animTime, tint, flash) {
        const gl = this.gl;
        const anim = glb.findAnim(animPrefixes);
        glb.computeBoneMatrices(anim, animTime, this.jointMats);

        gl.uniformMatrix4fv(gl.getUniformLocation(this.mdlProg, "uModel"), false, modelMat);
        gl.uniformMatrix4fv(gl.getUniformLocation(this.mdlProg, "uBones"), false, this.jointMats);
        gl.uniform3f(gl.getUniformLocation(this.mdlProg, "uTint"), tint[0], tint[1], tint[2]);
        gl.uniform1f(gl.getUniformLocation(this.mdlProg, "uFlash"), flash);

        gl.disable(gl.CULL_FACE);
        for (const p of glb.primitives) {
            gl.bindTexture(gl.TEXTURE_2D, glb.textures[p.material] || glb.textures[0]);
            gl.bindVertexArray(p.vao);
            gl.drawElements(gl.TRIANGLES, p.count, gl.UNSIGNED_SHORT, 0);
        }
        gl.enable(gl.CULL_FACE);
    }
}
