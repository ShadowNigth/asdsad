// ============================================================================
//  physics.js — Fisica autentica GoldSrc / Counter-Strike 1.5
//  - Colision real contra clipnodes BSP (hull 1 parado, hull 3 agachado, hull 0 rayo)
//  - Submodelos solidos (func_wall, func_door, func_breakable) + escaleras (func_ladder)
//  - PM_Accelerate, PM_AirAccelerate (30 u/s cap -> air-strafe & bunnyhop!),
//    PM_Friction, StepSlideMove (sube escalones), Crouch-Jump, Shift Walk, Fall Damage.
// ============================================================================
export const SCALE = 1.0 / 39.37;

export const PM = {
    GRAVITY: 800.0 * SCALE,
    ACCELERATE: 5.0,
    AIR_ACCEL: 10.0,
    AIR_WISH_CAP: 30.0 * SCALE,
    FRICTION: 4.0,
    STOPSPEED: 75.0 * SCALE,
    JUMP_VEL: 268.328 * SCALE,
    STEP_SIZE: 18.0 * SCALE,
    STAND_HALF_H: 36.0 * SCALE,   // hull 1 center above feet
    DUCK_HALF_H:  18.0 * SCALE,   // hull 3 center above feet
    EYE_STAND: 64.0 * SCALE,      // +64u from feet
    EYE_DUCK:  30.0 * SCALE,      // +30u from feet
};

const CONTENTS_EMPTY = -1;
const CONTENTS_SOLID = -2;
const CONTENTS_WATER = -3;
const CONTENTS_CLIP  = -6;
const DIST_EPSILON   = 0.03125 * SCALE;

function isSolidContent(c) {
    return c === CONTENTS_SOLID || c === CONTENTS_CLIP;
}

export class BSPPhysics {
    constructor(mapData) {
        this.map = mapData;
        this.solidModels = [];
        if (mapData && mapData.meta && mapData.meta.solidSubmodels) {
            for (const sm of mapData.meta.solidSubmodels) {
                const cm = mapData.colModels[sm.id];
                if (cm) this.solidModels.push({ id: sm.id, min: cm.min, max: cm.max, headnode: cm.headnode });
            }
        }
    }

    hullPointContents(headnode, hull, p) {
        if (hull === 0) {
            // Hull 0 uses nodes
            let num = headnode;
            const nodes = this.map.nodes;
            const lc = this.map.leafCluster;
            while (num >= 0 && num < nodes.length) {
                const nd = nodes[num];
                const d = nd.a * p[0] + nd.b * p[1] + nd.c * p[2] - nd.d;
                num = d < 0 ? nd.c1 : nd.c0;
            }
            // Note: in .w3dbsp leaf index is -num-1; check colModels? Wait: let's keep clipnode hull 1/3 for solid & AABB fallback
            return num === -2 ? CONTENTS_SOLID : CONTENTS_EMPTY;
        }
        let num = headnode;
        const cn = this.map.clipnodes;
        const pl = this.map.colPlanes;
        while (num >= 0 && num < cn.length) {
            const node = cn[num];
            const pi = node.plane * 4;
            const d = pl[pi] * p[0] + pl[pi+1] * p[1] + pl[pi+2] * p[2] - pl[pi+3];
            num = d < 0 ? node.c1 : node.c0;
        }
        return num;
    }

    recursiveHullCheck(hullIdx, num, p1f, p2f, p1, p2, trace) {
        if (num < 0) {
            if (!isSolidContent(num)) {
                trace.allsolid = false;
                if (num === CONTENTS_EMPTY) trace.inopen = true;
                else trace.inwater = true;
            } else {
                trace.startsolid = true;
            }
            return true;
        }

        const cn = this.map.clipnodes;
        const pl = this.map.colPlanes;
        if (num >= cn.length) return true;
        const node = cn[num];
        const pi = node.plane * 4;
        const nx = pl[pi], ny = pl[pi+1], nz = pl[pi+2], dist = pl[pi+3];

        const t1 = nx * p1[0] + ny * p1[1] + nz * p1[2] - dist;
        const t2 = nx * p2[0] + ny * p2[1] + nz * p2[2] - dist;

        if (t1 >= 0 && t2 >= 0) return this.recursiveHullCheck(hullIdx, node.c0, p1f, p2f, p1, p2, trace);
        if (t1 < 0 && t2 < 0)  return this.recursiveHullCheck(hullIdx, node.c1, p1f, p2f, p1, p2, trace);

        let frac, frac2, side;
        if (t1 < t2) {
            const idist = 1.0 / (t1 - t2);
            side = 1;
            frac2 = (t1 + DIST_EPSILON) * idist;
            frac  = (t1 - DIST_EPSILON) * idist;
        } else if (t1 > t2) {
            const idist = 1.0 / (t1 - t2);
            side = 0;
            frac2 = (t1 - DIST_EPSILON) * idist;
            frac  = (t1 + DIST_EPSILON) * idist;
        } else {
            side = 0;
            frac = 1; frac2 = 0;
        }

        frac  = Math.max(0, Math.min(1, frac));
        frac2 = Math.max(0, Math.min(1, frac2));

        const midf = p1f + (p2f - p1f) * frac;
        const mid = [
            p1[0] + frac * (p2[0] - p1[0]),
            p1[1] + frac * (p2[1] - p1[1]),
            p1[2] + frac * (p2[2] - p1[2]),
        ];

        const cA = side === 0 ? node.c0 : node.c1;
        if (!this.recursiveHullCheck(hullIdx, cA, p1f, midf, p1, mid, trace)) return false;

        const cB = side === 0 ? node.c1 : node.c0;
        if (!isSolidContent(this.hullPointContents(cB, hullIdx, mid))) {
            return this.recursiveHullCheck(hullIdx, cB, midf, p2f, mid, p2, trace);
        }
        if (trace.allsolid) return false;

        if (side === 0) {
            trace.normal = [nx, ny, nz];
        } else {
            trace.normal = [-nx, -ny, -nz];
        }

        while (isSolidContent(this.hullPointContents(this.hullHead(hullIdx), hullIdx, mid))) {
            frac -= 0.08;
            if (frac < 0) {
                trace.fraction = midf;
                trace.endpos = [...mid];
                return false;
            }
            mid[0] = p1[0] + frac * (p2[0] - p1[0]);
            mid[1] = p1[1] + frac * (p2[1] - p1[1]);
            mid[2] = p1[2] + frac * (p2[2] - p1[2]);
        }
        trace.fraction = p1f + (p2f - p1f) * frac;
        trace.endpos = [...mid];
        return false;
    }

    hullHead(hullIdx) {
        return this.map.colModels[0].headnode[hullIdx];
    }

    traceHull(start, end, ducking = false) {
        const hullIdx = ducking ? 3 : 1;
        const trace = {
            allsolid: true,
            startsolid: false,
            inopen: false,
            inwater: false,
            fraction: 1.0,
            endpos: [...end],
            normal: [0, 1, 0],
            hitEntity: null,
        };
        this.recursiveHullCheck(hullIdx, this.hullHead(hullIdx), 0.0, 1.0, start, end, trace);
        if (trace.fraction === 1.0) trace.endpos = [...end];

        // Also test solid brush submodels (crates, doors, walls) via expanded AABB sweep
        const rad = 16.0 * SCALE;
        const hh  = ducking ? PM.DUCK_HALF_H : PM.STAND_HALF_H;
        for (const sm of this.solidModels) {
            const bmin = [sm.min[0] - rad, sm.min[1] - hh, sm.min[2] - rad];
            const bmax = [sm.max[0] + rad, sm.max[1] + hh, sm.max[2] + rad];
            const hit = this._sweepAABB(start, trace.endpos, bmin, bmax);
            if (hit && hit.t < 1.0) {
                const realFrac = hit.t * trace.fraction;
                if (realFrac < trace.fraction) {
                    trace.fraction = realFrac;
                    trace.endpos = [
                        start[0] + (end[0] - start[0]) * realFrac,
                        start[1] + (end[1] - start[1]) * realFrac,
                        start[2] + (end[2] - start[2]) * realFrac,
                    ];
                    trace.normal = hit.normal;
                    trace.hitEntity = sm;
                }
            }
        }
        return trace;
    }

    // Raycast for bullets, line-of-sight & grenades (hull 0 via BSP nodes + submodel AABBs)
    traceRay(start, end) {
        const trace = { fraction: 1.0, endpos: [...end], normal: [0, 1, 0], hitSolid: false };
        this._traceNodeRay(0, 0.0, 1.0, start, end, trace);
        if (trace.fraction === 1.0) trace.endpos = [...end];

        for (const sm of this.solidModels) {
            const hit = this._sweepAABB(start, trace.endpos, sm.min, sm.max);
            if (hit && hit.t < 1.0) {
                const rf = hit.t * trace.fraction;
                if (rf < trace.fraction) {
                    trace.fraction = rf;
                    trace.endpos = [
                        start[0] + (end[0] - start[0]) * rf,
                        start[1] + (end[1] - start[1]) * rf,
                        start[2] + (end[2] - start[2]) * rf,
                    ];
                    trace.normal = hit.normal;
                    trace.hitSolid = true;
                }
            }
        }
        return trace;
    }

    _traceNodeRay(num, p1f, p2f, p1, p2, trace) {
        if (num < 0) {
            const leaf = -num - 1;
            const cl = this.map.leafCluster[leaf];
            // Leaf 0 or cluster -1 (except non-solid)
            if (leaf === 0) {
                return false;
            }
            return true;
        }
        if (num >= this.map.nodes.length) return true;
        const nd = this.map.nodes[num];
        const t1 = nd.a * p1[0] + nd.b * p1[1] + nd.c * p1[2] - nd.d;
        const t2 = nd.a * p2[0] + nd.b * p2[1] + nd.c * p2[2] - nd.d;
        if (t1 >= 0 && t2 >= 0) return this._traceNodeRay(nd.c0, p1f, p2f, p1, p2, trace);
        if (t1 < 0 && t2 < 0)  return this._traceNodeRay(nd.c1, p1f, p2f, p1, p2, trace);

        const side = t1 < 0 ? 1 : 0;
        const frac = Math.max(0, Math.min(1, (t1 + (side ? 1e-4 : -1e-4)) / (t1 - t2)));
        const midf = p1f + (p2f - p1f) * frac;
        const mid = [
            p1[0] + frac * (p2[0] - p1[0]),
            p1[1] + frac * (p2[1] - p1[1]),
            p1[2] + frac * (p2[2] - p1[2]),
        ];
        const cA = side === 0 ? nd.c0 : nd.c1;
        if (!this._traceNodeRay(cA, p1f, midf, p1, mid, trace)) return false;
        const cB = side === 0 ? nd.c1 : nd.c0;
        const leafB = this.map.leafAt(mid[0] + (side ? 0.01 : -0.01) * nd.a, mid[1] + (side ? 0.01 : -0.01) * nd.b, mid[2] + (side ? 0.01 : -0.01) * nd.c);
        if (leafB === 0) {
            trace.fraction = midf;
            trace.endpos = [...mid];
            trace.normal = side === 0 ? [nd.a, nd.b, nd.c] : [-nd.a, -nd.b, -nd.c];
            trace.hitSolid = true;
            return false;
        }
        return this._traceNodeRay(cB, midf, p2f, mid, p2, trace);
    }

    _sweepAABB(p0, p1, bmin, bmax) {
        let tmin = 0.0, tmax = 1.0;
        const hitN = [0, 1, 0];
        for (let k = 0; k < 3; k++) {
            const d = p1[k] - p0[k];
            if (Math.abs(d) < 1e-8) {
                if (p0[k] < bmin[k] || p0[k] > bmax[k]) return null;
            } else {
                let t1 = (bmin[k] - p0[k]) / d;
                let t2 = (bmax[k] - p0[k]) / d;
                let n = -1;
                if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; n = 1; }
                if (t1 > tmin) {
                    tmin = t1;
                    hitN[0] = 0; hitN[1] = 0; hitN[2] = 0;
                    hitN[k] = n;
                }
                if (t2 < tmax) tmax = t2;
                if (tmin > tmax) return null;
            }
        }
        if (tmin <= 0 || tmin >= 1) return null;
        return { t: Math.max(0, tmin - 0.001), normal: hitN };
    }

    isInsideLadder(pos) {
        const ladders = this.map.meta.ladders || [];
        const pad = 0.35;
        for (const l of ladders) {
            if (pos[0] >= l.min[0] - pad && pos[0] <= l.max[0] + pad &&
                pos[1] >= l.min[1] - 0.9 && pos[1] <= l.max[1] + 0.9 &&
                pos[2] >= l.min[2] - pad && pos[2] <= l.max[2] + pad) {
                return true;
            }
        }
        return false;
    }

    placeOnFloor(spawnPos) {
        // Spawn pos in map is feet/origin; lift to hull 1 center and drop to floor
        const c = [spawnPos[0], spawnPos[1] + PM.STAND_HALF_H + 0.25, spawnPos[2]];
        const end = [c[0], c[1] - 4.0, c[2]];
        const tr = this.traceHull(c, end, false);
        return [tr.endpos[0], tr.endpos[1] - PM.STAND_HALF_H + 0.02, tr.endpos[2]];
    }
}

function clipVelocity(vel, normal, overbounce = 1.0) {
    const backoff = (vel[0] * normal[0] + vel[1] * normal[1] + vel[2] * normal[2]) * overbounce;
    vel[0] -= normal[0] * backoff;
    vel[1] -= normal[1] * backoff;
    vel[2] -= normal[2] * backoff;
}

export class PlayerMover {
    constructor(physics) {
        this.phys = physics;
        this.feetPos = [0, 1, 0];
        this.vel = [0, 0, 0];
        this.yaw = 0;
        this.pitch = 0;
        this.onGround = false;
        this.ducking = false;
        this.duckFrac = 0;
        this.onLadder = false;
        this.noclip = false;
        this.stepAccum = 0;
        this.bobPhase = 0;
        this.fallImpactVel = 0;
    }

    hullCenter() {
        const hh = this.ducking ? PM.DUCK_HALF_H : PM.STAND_HALF_H;
        return [this.feetPos[0], this.feetPos[1] + hh, this.feetPos[2]];
    }

    eyePos() {
        const eyeH = PM.EYE_STAND + (PM.EYE_DUCK - PM.EYE_STAND) * this.duckFrac;
        return [this.feetPos[0], this.feetPos[1] + eyeH, this.feetPos[2]];
    }

    step(dt, input, maxSpeedUnits, audio) {
        if (this.noclip) {
            const yr = (this.yaw * Math.PI) / 180;
            const pr = (this.pitch * Math.PI) / 180;
            const cp = Math.cos(pr);
            const fx = Math.cos(yr) * cp, fy = Math.sin(pr), fz = -Math.sin(yr) * cp;
            const rx = Math.sin(yr), rz = Math.cos(yr);
            const spd = 12.0 * dt;
            this.feetPos[0] += (fx * input.fwd + rx * input.side) * spd;
            this.feetPos[1] += (fy * input.fwd + (input.jump ? 1 : 0) - (input.duck ? 1 : 0)) * spd;
            this.feetPos[2] += (fz * input.fwd + rz * input.side) * spd;
            this.onGround = false;
            return { fallDamage: 0, speedUnits: 300 };
        }

        // Duck / Unduck with stand-up clearance check
        if (input.duck && !this.ducking) {
            this.ducking = true;
            if (!this.onGround) this.feetPos[1] += (PM.STAND_HALF_H - PM.DUCK_HALF_H);
        } else if (!input.duck && this.ducking) {
            // Check standing hull clearance
            const testCenter = [this.feetPos[0], this.feetPos[1] + PM.STAND_HALF_H + 0.02, this.feetPos[2]];
            const tr = this.phys.traceHull(testCenter, testCenter, false);
            if (!tr.startsolid) {
                this.ducking = false;
                if (!this.onGround) this.feetPos[1] -= (PM.STAND_HALF_H - PM.DUCK_HALF_H);
            }
        }
        const targetDuck = this.ducking ? 1.0 : 0.0;
        this.duckFrac += (targetDuck - this.duckFrac) * Math.min(1.0, dt * 14.0);

        const hh = this.ducking ? PM.DUCK_HALF_H : PM.STAND_HALF_H;
        let center = [this.feetPos[0], this.feetPos[1] + hh, this.feetPos[2]];

        // Ladder check
        this.onLadder = this.phys.isInsideLadder(center);

        const yr = (this.yaw * Math.PI) / 180;
        const fx = Math.cos(yr), fz = -Math.sin(yr);
        const rx = Math.sin(yr), rz = Math.cos(yr);
        let wx = fx * input.fwd + rx * input.side;
        let wz = fz * input.fwd + rz * input.side;
        const wlen = Math.hypot(wx, wz);
        let maxSpd = maxSpeedUnits * SCALE;
        if (this.ducking) maxSpd *= 0.34;
        else if (input.walk) maxSpd *= 0.52;

        let wishspeed = 0;
        if (wlen > 0.001) {
            wx /= wlen; wz /= wlen;
            wishspeed = maxSpd;
        }

        let fallDamage = 0;

        if (this.onLadder) {
            const ladderSpd = 200 * SCALE;
            this.vel[0] = wx * ladderSpd * 0.7;
            this.vel[2] = wz * ladderSpd * 0.7;
            const lookPitch = (this.pitch * Math.PI) / 180;
            this.vel[1] = input.fwd * (Math.sin(lookPitch) * ladderSpd + (input.fwd > 0 ? 1.8 : -1.8));
            if (input.jump) {
                this.vel[1] = PM.JUMP_VEL * 0.9;
                this.onLadder = false;
            }
        } else {
            // Check ground
            const gtr = this.phys.traceHull(center, [center[0], center[1] - 0.04, center[2]], this.ducking);
            const wasGround = this.onGround;
            this.onGround = gtr.fraction < 1.0 && gtr.normal[1] >= 0.7;
            if (this.onGround && !wasGround && this.fallImpactVel < -14.7) {
                fallDamage = Math.floor((-this.fallImpactVel - 14.7) * 4.2);
                if (fallDamage > 0 && audio) audio.play("sounds/player/pl_fallpain1.wav", 0.7);
            }

            // Jump (supports holding space for smooth bunnyhop!)
            if (this.onGround && input.jump) {
                this.vel[1] = PM.JUMP_VEL;
                this.onGround = false;
                if (audio) audio.play("sounds/player/pl_step1.wav", 0.28, 1.15);
            }

            if (this.onGround) {
                this.vel[1] = 0;
                // Friction
                const spd = Math.hypot(this.vel[0], this.vel[2]);
                if (spd > 0.001) {
                    const ctrl = spd < PM.STOPSPEED ? PM.STOPSPEED : spd;
                    const drop = ctrl * PM.FRICTION * dt;
                    const ns = Math.max(0, spd - drop);
                    this.vel[0] *= ns / spd;
                    this.vel[2] *= ns / spd;
                }
                // Accelerate
                const cur = this.vel[0] * wx + this.vel[2] * wz;
                const add = wishspeed - cur;
                if (add > 0) {
                    const acc = Math.min(add, PM.ACCELERATE * dt * wishspeed);
                    this.vel[0] += acc * wx;
                    this.vel[2] += acc * wz;
                }
            } else {
                // AirAccelerate with 30 u/s wishspeed cap -> authentic CS 1.5 bunnyhopping!
                const wspd = Math.min(wishspeed, PM.AIR_WISH_CAP);
                const cur = this.vel[0] * wx + this.vel[2] * wz;
                const add = wspd - cur;
                if (add > 0) {
                    const acc = Math.min(add, PM.AIR_ACCEL * wishspeed * dt);
                    this.vel[0] += acc * wx;
                    this.vel[2] += acc * wz;
                }
                this.vel[1] -= PM.GRAVITY * dt;
            }
        }
        this.fallImpactVel = this.vel[1];

        // StepSlideMove
        center = this._stepSlideMove(center, dt);
        this.feetPos = [center[0], center[1] - hh, center[2]];

        const horizSpd = Math.hypot(this.vel[0], this.vel[2]);
        if (this.onGround && horizSpd > 0.2) {
            this.bobPhase += horizSpd * dt * 2.2;
        }
        if (this.onGround && horizSpd > 3.6 && !input.walk && !this.ducking) {
            this.stepAccum -= dt;
            if (this.stepAccum <= 0) {
                this.stepAccum = 0.35;
                if (audio) {
                    const i = 1 + Math.floor(Math.random() * 4);
                    audio.play(`sounds/player/pl_step${i}.wav`, 0.32);
                }
            }
        }

        return { fallDamage, speedUnits: horizSpd / SCALE };
    }

    _flyMove(pos, dt) {
        let timeLeft = dt;
        const planes = [];
        let cur = [...pos];
        for (let bump = 0; bump < 4; bump++) {
            const end = [
                cur[0] + this.vel[0] * timeLeft,
                cur[1] + this.vel[1] * timeLeft,
                cur[2] + this.vel[2] * timeLeft,
            ];
            const tr = this.phys.traceHull(cur, end, this.ducking);
            if (tr.allsolid) {
                this.vel = [0, 0, 0];
                return cur;
            }
            if (tr.fraction > 0) {
                cur = tr.endpos;
                planes.length = 0;
            }
            if (tr.fraction === 1.0) break;
            timeLeft -= timeLeft * tr.fraction;
            planes.push(tr.normal);

            if (planes.length === 1) {
                clipVelocity(this.vel, planes[0], 1.0);
            } else {
                // Clip against two planes (crease)
                let i;
                for (i = 0; i < planes.length; i++) {
                    clipVelocity(this.vel, planes[i], 1.0);
                    let ok = true;
                    for (let j = 0; j < planes.length; j++) {
                        if (j !== i && (this.vel[0]*planes[j][0] + this.vel[1]*planes[j][1] + this.vel[2]*planes[j][2]) < 0) {
                            ok = false; break;
                        }
                    }
                    if (ok) break;
                }
                if (i === planes.length && planes.length >= 2) {
                    const p0 = planes[0], p1 = planes[1];
                    const dir = [
                        p0[1]*p1[2] - p0[2]*p1[1],
                        p0[2]*p1[0] - p0[0]*p1[2],
                        p0[0]*p1[1] - p0[1]*p1[0],
                    ];
                    const d = this.vel[0]*dir[0] + this.vel[1]*dir[1] + this.vel[2]*dir[2];
                    this.vel = [dir[0]*d, dir[1]*d, dir[2]*d];
                }
            }
        }
        return cur;
    }

    _stepSlideMove(pos, dt) {
        const origPos = [...pos];
        const origVel = [...this.vel];
        const downPos = this._flyMove(pos, dt);
        if (!this.onGround && !this.onLadder) return downPos;

        // Try stepping up
        const upEnd = [origPos[0], origPos[1] + PM.STEP_SIZE, origPos[2]];
        const trUp = this.phys.traceHull(origPos, upEnd, this.ducking);
        if (trUp.startsolid || trUp.fraction < 0.05) return downPos;

        this.vel = [...origVel];
        const stepPos = this._flyMove(trUp.endpos, dt);
        const stepDown = [stepPos[0], stepPos[1] - PM.STEP_SIZE, stepPos[2]];
        const trDown = this.phys.traceHull(stepPos, stepDown, this.ducking);
        if (trDown.normal[1] < 0.7) {
            return downPos;
        }
        const distDown = (downPos[0]-origPos[0])**2 + (downPos[2]-origPos[2])**2;
        const distStep = (trDown.endpos[0]-origPos[0])**2 + (trDown.endpos[2]-origPos[2])**2;
        if (distStep > distDown) {
            this.vel[1] = 0;
            return trDown.endpos;
        }
        return downPos;
    }
}
