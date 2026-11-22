// ============================================================================
//  effects.js — Efectos 3D CS 1.5: trazadoras, casquillos, impactos en pared,
//  sangre, granadas (HE, Flashbang, Smoke) con rebotes BSP y LED de C4.
// ============================================================================
import { SCALE } from "./physics.js";

function makeTRSMat(pos, rx, ry, sx, sy, sz, out) {
    const cy = Math.cos(ry), syr = Math.sin(ry);
    const cp = Math.cos(rx), sp = Math.sin(rx);
    // Simple Y * X rotation * scale
    out[0] = cy * sx;        out[1] = 0;        out[2] = -syr * sx;      out[3] = 0;
    out[4] = syr * sp * sy;  out[5] = cp * sy;  out[6] = cy * sp * sy;   out[7] = 0;
    out[8] = syr * cp * sz;  out[9] = -sp * sz; out[10] = cy * cp * sz;  out[11] = 0;
    out[12] = pos[0];        out[13] = pos[1];  out[14] = pos[2];        out[15] = 1;
}

export class EffectsManager {
    constructor() {
        this.tracers = [];
        this.decals = [];
        this.particles = [];
        this.shells = [];
        this.grenades = [];
        this.smokes = [];
        this.tmpMat = new Float32Array(16);
    }

    clearRound() {
        this.tracers.length = 0;
        this.decals.length = 0;
        this.particles.length = 0;
        this.shells.length = 0;
        this.grenades.length = 0;
        this.smokes.length = 0;
    }

    addTracer(start, end) {
        const dx = end[0] - start[0], dy = end[1] - start[1], dz = end[2] - start[2];
        const len = Math.hypot(dx, dy, dz);
        if (len < 0.05) return;
        const mid = [(start[0] + end[0]) * 0.5, (start[1] + end[1]) * 0.5, (start[2] + end[2]) * 0.5];
        const yaw = Math.atan2(dx, dz);
        const pitch = Math.atan2(dy, Math.hypot(dx, dz));
        this.tracers.push({ mid, yaw, pitch, len: Math.min(len, 60), life: 0.065 });
    }

    addDecal(pos, normal) {
        if (this.decals.length > 90) this.decals.shift();
        this.decals.push({
            pos: [pos[0] + normal[0] * 0.015, pos[1] + normal[1] * 0.015, pos[2] + normal[2] * 0.015],
            size: 0.05,
        });
        // Wall dust spark
        for (let i = 0; i < 4; i++) {
            this.particles.push({
                pos: [...pos],
                vel: [normal[0]*1.8 + (Math.random()-0.5)*1.6, normal[1]*1.8 + Math.random()*1.5, normal[2]*1.8 + (Math.random()-0.5)*1.6],
                size: 0.035,
                color: [0.85, 0.78, 0.62, 0.9],
                life: 0.25,
                maxLife: 0.25,
                gravity: 6.0,
            });
        }
    }

    addBlood(pos) {
        for (let i = 0; i < 8; i++) {
            this.particles.push({
                pos: [...pos],
                vel: [(Math.random()-0.5)*2.6, Math.random()*2.2, (Math.random()-0.5)*2.6],
                size: 0.055,
                color: [0.75, 0.04, 0.04, 0.95],
                life: 0.38,
                maxLife: 0.38,
                gravity: 8.5,
            });
        }
    }

    addShell(pos, yawDeg) {
        const yr = (yawDeg * Math.PI) / 180;
        const rx = Math.sin(yr), rz = Math.cos(yr);
        this.shells.push({
            pos: [pos[0] + rx * 0.12, pos[1] - 0.08, pos[2] + rz * 0.12],
            vel: [rx * 1.8 + (Math.random()-0.5)*0.4, 1.4 + Math.random()*0.4, rz * 1.8 + (Math.random()-0.5)*0.4],
            life: 1.1,
        });
    }

    spawnGrenade(type, pos, vel, owner) {
        this.grenades.push({
            type,
            pos: [...pos],
            vel: [...vel],
            owner,
            fuse: type === "flash" ? 1.5 : 2.1,
            rest: false,
        });
    }

    addExplosion(pos) {
        for (let i = 0; i < 24; i++) {
            const spd = 2.0 + Math.random() * 5.0;
            const th = Math.random() * Math.PI * 2;
            const ph = Math.random() * Math.PI - Math.PI * 0.3;
            this.particles.push({
                pos: [...pos],
                vel: [Math.cos(th)*Math.cos(ph)*spd, Math.abs(Math.sin(ph))*spd + 1.5, Math.sin(th)*Math.cos(ph)*spd],
                size: 0.28 + Math.random() * 0.35,
                color: i % 2 === 0 ? [1.0, 0.55, 0.1, 0.95] : [0.35, 0.33, 0.30, 0.85],
                life: 0.55,
                maxLife: 0.55,
                gravity: 4.5,
            });
        }
    }

    addSmokeCloud(pos) {
        const puffs = [];
        for (let i = 0; i < 16; i++) {
            puffs.push({
                off: [(Math.random()-0.5)*2.4, 0.35 + Math.random()*1.6, (Math.random()-0.5)*2.4],
                size: 1.5 + Math.random() * 1.1,
            });
        }
        this.smokes.push({ pos: [...pos], puffs, life: 15.0, maxLife: 15.0 });
    }

    update(dt, physics, onGrenadeDetonate) {
        for (let i = this.tracers.length - 1; i >= 0; i--) {
            this.tracers[i].life -= dt;
            if (this.tracers[i].life <= 0) this.tracers.splice(i, 1);
        }
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.life -= dt;
            if (p.life <= 0) { this.particles.splice(i, 1); continue; }
            p.vel[1] -= p.gravity * dt;
            p.pos[0] += p.vel[0] * dt;
            p.pos[1] += p.vel[1] * dt;
            p.pos[2] += p.vel[2] * dt;
        }
        for (let i = this.shells.length - 1; i >= 0; i--) {
            const s = this.shells[i];
            s.life -= dt;
            if (s.life <= 0) { this.shells.splice(i, 1); continue; }
            s.vel[1] -= 14.0 * dt;
            s.pos[0] += s.vel[0] * dt;
            s.pos[1] += s.vel[1] * dt;
            s.pos[2] += s.vel[2] * dt;
        }
        for (let i = this.smokes.length - 1; i >= 0; i--) {
            this.smokes[i].life -= dt;
            if (this.smokes[i].life <= 0) this.smokes.splice(i, 1);
        }
        for (let i = this.grenades.length - 1; i >= 0; i--) {
            const g = this.grenades[i];
            g.fuse -= dt;
            if (!g.rest) {
                g.vel[1] -= 800 * SCALE * dt;
                const next = [
                    g.pos[0] + g.vel[0] * dt,
                    g.pos[1] + g.vel[1] * dt,
                    g.pos[2] + g.vel[2] * dt,
                ];
                const tr = physics.traceRay(g.pos, next);
                if (tr.fraction < 1.0) {
                    const n = tr.normal;
                    const dot = g.vel[0]*n[0] + g.vel[1]*n[1] + g.vel[2]*n[2];
                    g.vel[0] = (g.vel[0] - 2 * dot * n[0]) * 0.55;
                    g.vel[1] = (g.vel[1] - 2 * dot * n[1]) * 0.55;
                    g.vel[2] = (g.vel[2] - 2 * dot * n[2]) * 0.55;
                    g.pos = [tr.endpos[0] + n[0]*0.04, tr.endpos[1] + n[1]*0.04, tr.endpos[2] + n[2]*0.04];
                    if (Math.hypot(g.vel[0], g.vel[1], g.vel[2]) < 0.35 && n[1] > 0.7) {
                        g.rest = true;
                        g.vel = [0, 0, 0];
                    }
                    if (onGrenadeDetonate) onGrenadeDetonate(g, true);
                } else {
                    g.pos = next;
                }
            }
            if (g.fuse <= 0) {
                this.grenades.splice(i, 1);
                if (onGrenadeDetonate) onGrenadeDetonate(g, false);
            }
        }
    }

    render(renderer, vpMat, c4LedPos = null, c4LedOn = false) {
        const gl = renderer.gl;
        gl.useProgram(renderer.fxProg);
        gl.uniformMatrix4fv(gl.getUniformLocation(renderer.fxProg, "uVP"), false, vpMat);
        const locModel = gl.getUniformLocation(renderer.fxProg, "uModel");
        const locColor = gl.getUniformLocation(renderer.fxProg, "uColor");
        gl.bindVertexArray(renderer.boxVao);

        const drawBox = (pos, rx, ry, sx, sy, sz, col) => {
            makeTRSMat(pos, rx, ry, sx, sy, sz, this.tmpMat);
            gl.uniformMatrix4fv(locModel, false, this.tmpMat);
            gl.uniform4f(locColor, col[0], col[1], col[2], col[3]);
            gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0);
        };

        // Decals
        for (const d of this.decals) {
            drawBox(d.pos, 0, 0, d.size, d.size, d.size, [0.08, 0.08, 0.08, 0.9]);
        }
        // Brass shells
        for (const s of this.shells) {
            drawBox(s.pos, 0.3, 0.4, 0.014, 0.014, 0.036, [0.95, 0.75, 0.25, 1.0]);
        }
        // Grenades in flight
        for (const g of this.grenades) {
            const col = g.type === "he" ? [0.22, 0.35, 0.18, 1] : g.type === "flash" ? [0.75, 0.78, 0.82, 1] : [0.28, 0.42, 0.32, 1];
            drawBox(g.pos, 0.2, 0.2, 0.11, 0.14, 0.11, col);
        }
        // C4 blinking red LED
        if (c4LedPos && c4LedOn) {
            drawBox([c4LedPos[0], c4LedPos[1] + 0.12, c4LedPos[2]], 0, 0, 0.11, 0.11, 0.11, [1.0, 0.08, 0.08, 1.0]);
        }

        // Blended FX: Tracers, Particles, Smokes
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(false);

        for (const t of this.tracers) {
            drawBox(t.mid, -t.pitch, t.yaw, 0.015, 0.015, t.len, [1.0, 0.88, 0.45, Math.min(1, t.life * 18)]);
        }
        for (const p of this.particles) {
            const a = (p.life / p.maxLife) * p.color[3];
            drawBox(p.pos, 0, 0, p.size, p.size, p.size, [p.color[0], p.color[1], p.color[2], a]);
        }
        for (const sm of this.smokes) {
            const fade = Math.min(1.0, sm.life / 3.0) * Math.min(1.0, (sm.maxLife - sm.life) * 0.9);
            for (const pf of sm.puffs) {
                drawBox(
                    [sm.pos[0] + pf.off[0], sm.pos[1] + pf.off[1], sm.pos[2] + pf.off[2]],
                    0, 0, pf.size, pf.size * 0.82, pf.size,
                    [0.72, 0.74, 0.76, 0.52 * fade]
                );
            }
        }

        gl.depthMask(true);
        gl.disable(gl.BLEND);
    }
}
