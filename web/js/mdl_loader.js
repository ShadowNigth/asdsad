// ============================================================================
//  mdl_loader.js — Cargador glTF 2.0 (.glb) con esqueletos, texturas PNG y
//  animaciones keyframe (viewmodels v_*.glb y player_*.glb convertidos de MDL).
// ============================================================================
const ACCESSOR_COMPS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function quatToMat4(q, t, s, out) {
    const x = q[0], y = q[1], z = q[2], w = q[3];
    const sx = s ? s[0] : 1, sy = s ? s[1] : 1, sz = s ? s[2] : 1;
    const x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2;
    const yy = y * y2, yz = y * z2, zz = z * z2;
    const wx = w * x2, wy = w * y2, wz = w * z2;
    out[0] = (1 - (yy + zz)) * sx; out[1] = (xy + wz) * sx;       out[2] = (xz - wy) * sx;       out[3] = 0;
    out[4] = (xy - wz) * sy;       out[5] = (1 - (xx + zz)) * sy; out[6] = (yz + wx) * sy;       out[7] = 0;
    out[8] = (xz + wy) * sz;       out[9] = (yz - wx) * sz;       out[10] = (1 - (xx + yy)) * sz; out[11] = 0;
    out[12] = t[0];                out[13] = t[1];                out[14] = t[2];                out[15] = 1;
}

export function mulMat4(a, b, out) {
    for (let c = 0; c < 4; c++) {
        const b0 = b[c*4], b1 = b[c*4+1], b2 = b[c*4+2], b3 = b[c*4+3];
        out[c*4]   = a[0]*b0 + a[4]*b1 + a[8]*b2  + a[12]*b3;
        out[c*4+1] = a[1]*b0 + a[5]*b1 + a[9]*b2  + a[13]*b3;
        out[c*4+2] = a[2]*b0 + a[6]*b1 + a[10]*b2 + a[14]*b3;
        out[c*4+3] = a[3]*b0 + a[7]*b1 + a[11]*b2 + a[15]*b3;
    }
}

function slerp(a, b, t, out) {
    let ax = a[0], ay = a[1], az = a[2], aw = a[3];
    let bx = b[0], by = b[1], bz = b[2], bw = b[3];
    let dot = ax*bx + ay*by + az*bz + aw*bw;
    if (dot < 0) { dot = -dot; bx = -bx; by = -by; bz = -bz; bw = -bw; }
    if (dot > 0.9995) {
        out[0] = ax + t*(bx-ax); out[1] = ay + t*(by-ay);
        out[2] = az + t*(bz-az); out[3] = aw + t*(bw-aw);
    } else {
        const th0 = Math.acos(dot);
        const th = th0 * t;
        const s0 = Math.cos(th) - dot * Math.sin(th) / Math.sin(th0);
        const s1 = Math.sin(th) / Math.sin(th0);
        out[0] = s0*ax + s1*bx; out[1] = s0*ay + s1*by;
        out[2] = s0*az + s1*bz; out[3] = s0*aw + s1*bw;
    }
    const l = Math.hypot(out[0], out[1], out[2], out[3]) || 1;
    out[0] /= l; out[1] /= l; out[2] /= l; out[3] /= l;
}

export class GLBModel {
    constructor() {
        this.primitives = [];
        this.textures = [];
        this.nodes = [];
        this.skin = null;
        this.animations = new Map();
        this.ibm = null;
    }

    static async load(gl, url) {
        const buf = await fetch(url).then(r => {
            if (!r.ok) throw new Error(`Missing GLB ${url}`);
            return r.arrayBuffer();
        });
        const dv = new DataView(buf);
        if (dv.getUint32(0, true) !== 0x46546C67) throw new Error("Not a GLB");
        const jLen = dv.getUint32(12, true);
        const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jLen)));
        const bOff = 20 + jLen + 8;
        const bin = buf.slice(bOff);

        const m = new GLBModel();
        m._json = json;

        const getAcc = (idx) => {
            const acc = json.accessors[idx];
            const bv = json.bufferViews[acc.bufferView];
            const byteOffset = (bv.byteOffset || 0) + (acc.byteOffset || 0);
            const comps = ACCESSOR_COMPS[acc.type];
            const count = acc.count * comps;
            if (acc.componentType === 5126) return new Float32Array(bin, byteOffset, count);
            if (acc.componentType === 5123) return new Uint16Array(bin, byteOffset, count);
            if (acc.componentType === 5121) return new Uint8Array(bin, byteOffset, count);
            return new Float32Array(bin, byteOffset, count);
        };

        // Load embedded PNG textures
        m.textures = await Promise.all((json.images || []).map(async (img) => {
            const bv = json.bufferViews[img.bufferView];
            const blob = new Blob([new Uint8Array(bin, bv.byteOffset || 0, bv.byteLength)], { type: img.mimeType || "image/png" });
            const bmp = await createImageBitmap(blob);
            const tex = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, tex);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bmp);
            gl.generateMipmap(gl.TEXTURE_2D);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            bmp.close();
            return tex;
        }));

        // Build primitives with VAO
        const mesh = json.meshes[0];
        for (const prim of mesh.primitives) {
            const pos = getAcc(prim.attributes.POSITION);
            const nrm = getAcc(prim.attributes.NORMAL);
            const uv  = getAcc(prim.attributes.TEXCOORD_0);
            const jnt = prim.attributes.JOINTS_0 !== undefined ? getAcc(prim.attributes.JOINTS_0) : new Uint8Array((pos.length / 3) * 4);
            const wgt = prim.attributes.WEIGHTS_0 !== undefined ? getAcc(prim.attributes.WEIGHTS_0) : new Float32Array((pos.length / 3) * 4);
            const idx = getAcc(prim.indices);

            const vao = gl.createVertexArray();
            gl.bindVertexArray(vao);

            const mkBuf = (data, loc, size, type, norm = false) => {
                const b = gl.createBuffer();
                gl.bindBuffer(gl.ARRAY_BUFFER, b);
                gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
                gl.enableVertexAttribArray(loc);
                if (type === gl.UNSIGNED_BYTE && !norm) {
                    gl.vertexAttribIPointer(loc, size, type, 0, 0);
                } else {
                    gl.vertexAttribPointer(loc, size, type, norm, 0, 0);
                }
            };
            mkBuf(pos, 0, 3, gl.FLOAT);
            mkBuf(nrm, 1, 3, gl.FLOAT);
            mkBuf(uv,  2, 2, gl.FLOAT);
            mkBuf(jnt, 3, 4, gl.UNSIGNED_BYTE, false);
            mkBuf(wgt, 4, 4, gl.FLOAT);

            const eb = gl.createBuffer();
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, eb);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
            gl.bindVertexArray(null);

            m.primitives.push({ vao, count: idx.length, material: prim.material || 0 });
        }

        // Nodes & skin
        m.nodes = json.nodes.map((nd, idx) => ({
            idx,
            name: nd.name || "",
            t: nd.translation ? Float32Array.from(nd.translation) : new Float32Array([0, 0, 0]),
            r: nd.rotation ? Float32Array.from(nd.rotation) : new Float32Array([0, 0, 0, 1]),
            s: nd.scale ? Float32Array.from(nd.scale) : new Float32Array([1, 1, 1]),
            children: nd.children || [],
            parent: -1,
        }));
        for (const nd of m.nodes) {
            for (const c of nd.children) m.nodes[c].parent = nd.idx;
        }
        if (json.skins && json.skins.length > 0) {
            m.skin = json.skins[0];
            m.ibm = getAcc(m.skin.inverseBindMatrices);
        }

        // Animations
        for (const anim of (json.animations || [])) {
            const chans = [];
            let duration = 0;
            for (const ch of anim.channels) {
                const samp = anim.samplers[ch.sampler];
                const times = getAcc(samp.input);
                const vals = getAcc(samp.output);
                if (times.length && times[times.length - 1] > duration) duration = times[times.length - 1];
                chans.push({ node: ch.target.node, path: ch.target.path, times, vals });
            }
            m.animations.set(anim.name.toLowerCase(), { name: anim.name, duration: Math.max(0.05, duration), channels: chans });
        }

        return m;
    }

    findAnim(prefixes) {
        for (const pref of prefixes) {
            if (this.animations.has(pref)) return this.animations.get(pref);
        }
        for (const [k, v] of this.animations) {
            for (const pref of prefixes) {
                if (k.includes(pref)) return v;
            }
        }
        return this.animations.values().next().value || null;
    }

    computeBoneMatrices(anim, time, outJointMats, rootMatOut) {
        const nNodes = this.nodes.length;
        const localT = new Array(nNodes);
        const localR = new Array(nNodes);
        for (let i = 0; i < nNodes; i++) {
            localT[i] = [this.nodes[i].t[0], this.nodes[i].t[1], this.nodes[i].t[2]];
            localR[i] = [this.nodes[i].r[0], this.nodes[i].r[1], this.nodes[i].r[2], this.nodes[i].r[3]];
        }
        if (anim) {
            const t = time % anim.duration;
            for (const ch of anim.channels) {
                const times = ch.times;
                let k = 0;
                while (k + 1 < times.length && times[k + 1] <= t) k++;
                const k1 = Math.min(k + 1, times.length - 1);
                const span = times[k1] - times[k];
                const alpha = span > 1e-5 ? (t - times[k]) / span : 0;
                if (ch.path === "translation") {
                    const a = k * 3, b = k1 * 3;
                    localT[ch.node][0] = ch.vals[a]   + alpha * (ch.vals[b]   - ch.vals[a]);
                    localT[ch.node][1] = ch.vals[a+1] + alpha * (ch.vals[b+1] - ch.vals[a+1]);
                    localT[ch.node][2] = ch.vals[a+2] + alpha * (ch.vals[b+2] - ch.vals[a+2]);
                } else if (ch.path === "rotation") {
                    const a = k * 4, b = k1 * 4;
                    slerp(
                        [ch.vals[a], ch.vals[a+1], ch.vals[a+2], ch.vals[a+3]],
                        [ch.vals[b], ch.vals[b+1], ch.vals[b+2], ch.vals[b+3]],
                        alpha, localR[ch.node]
                    );
                }
            }
        }

        const worldMats = new Array(nNodes);
        const localM = new Float32Array(16);
        // Node 0 is root transform (orientation + SCALE)
        for (let i = 0; i < nNodes; i++) {
            quatToMat4(localR[i], localT[i], this.nodes[i].s, localM);
            worldMats[i] = new Float32Array(16);
            if (this.nodes[i].parent >= 0) {
                mulMat4(worldMats[this.nodes[i].parent], localM, worldMats[i]);
            } else {
                worldMats[i].set(localM);
            }
        }
        if (rootMatOut) rootMatOut.set(worldMats[0]);

        if (this.skin) {
            const joints = this.skin.joints;
            const tmp = new Float32Array(16);
            for (let j = 0; j < joints.length; j++) {
                const jNode = joints[j];
                const ibmSlice = this.ibm.subarray(j * 16, j * 16 + 16);
                // outJointMats[j] = worldMats[jNode] * ibm
                mulMat4(worldMats[jNode], ibmSlice, tmp);
                outJointMats.set(tmp, j * 16);
            }
        }
    }
}
