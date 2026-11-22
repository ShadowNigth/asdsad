// ============================================================================
//  bots.js — Bots tacticos CS 1.5 para modo Bomb Defusal (de_*)
//  - NavGraph automatico generado desde hojas BSP caminables + spawns + bombsites
//  - Compra automatica de armas/kevlar, plantado y desactivacion de C4,
//    cobertura de sitios, combate con rafagas y reaccion a Flashbang/Smoke.
// ============================================================================
import { PM, SCALE } from "./physics.js";
import { createWeaponInstance, WEAPONS } from "./weapons.js";

const CT_SKINS = ["urban", "gsg9", "sas", "gign"];
const T_SKINS  = ["terror", "leet", "arctic", "guerilla"];
const CT_NAMES = ["[POD] Maverick", "[POD] Ghost", "[POD] Eagle", "[POD] Viper", "[POD] Falcon", "[POD] Bravo"];
const T_NAMES  = ["[POD] Cobra", "[POD] Viper_T", "[POD] Shadow", "[POD] Bandit", "[POD] Jackal", "[POD] Nomad"];

export function buildNavGraph(mapData, physics) {
    const nodes = [];
    const meta = mapData.meta;
    const minDistSq = 2.1 * 2.1;

    const findNear = (pos) => {
        for (let i = 0; i < nodes.length; i++) {
            const n = nodes[i].pos;
            const dx = n[0] - pos[0], dy = n[1] - pos[1], dz = n[2] - pos[2];
            if (dx*dx + dz*dz < minDistSq && Math.abs(dy) < 1.3) return i;
        }
        return -1;
    };

    const tryAdd = (pos, tag = "") => {
        const c = [pos[0], pos[1] + PM.STAND_HALF_H + 0.35, pos[2]];
        const tr = physics.traceHull(c, [c[0], c[1] - 3.5, c[2]], false);
        if (tr.startsolid || tr.fraction === 1.0 || tr.normal[1] < 0.65) return -1;
        const feet = [tr.endpos[0], tr.endpos[1] - PM.STAND_HALF_H + 0.02, tr.endpos[2]];
        const chk = physics.traceHull([feet[0], feet[1] + PM.STAND_HALF_H + 0.04, feet[2]], [feet[0], feet[1] + PM.STAND_HALF_H + 0.04, feet[2]], false);
        if (chk.startsolid) return -1;

        const existing = findNear(feet);
        if (existing >= 0) return existing;
        const id = nodes.length;
        nodes.push({ id, pos: feet, adj: [], tag });
        return id;
    };

    const queues = [];
    if (meta.spawnsT && meta.spawnsT[0]) { const id = tryAdd(meta.spawnsT[0].pos, "T"); if (id >= 0) queues.push([id]); }
    if (meta.spawnsCT && meta.spawnsCT[0]) { const id = tryAdd(meta.spawnsCT[0].pos, "CT"); if (id >= 0) queues.push([id]); }
    for (const b of (meta.bombsites || [])) {
        const c = b.center || [(b.min[0]+b.max[0])*0.5, (b.min[1]+b.max[1])*0.5, (b.min[2]+b.max[2])*0.5];
        const id = tryAdd(c, b.id || b.name || "SITE");
        if (id >= 0) queues.push([id]);
    }

    // Round-robin flood-fill from T, CT, and Bombsites on 2.4m 8-way grid
    const dirs = [
        [2.4, 0], [-2.4, 0], [0, 2.4], [0, -2.4],
        [2.1, 2.1], [2.1, -2.1], [-2.1, 2.1], [-2.1, -2.1],
    ];
    let active = true;
    while (active && nodes.length < 900) {
        active = false;
        for (const q of queues) {
            if (q.length === 0 || nodes.length >= 900) continue;
            active = true;
            const uid = q.shift();
            const u = nodes[uid];
            const uEye = [u.pos[0], u.pos[1] + 0.9, u.pos[2]];
            for (const [dx, dz] of dirs) {
                const cand = [u.pos[0] + dx, u.pos[1] + 0.65, u.pos[2] + dz];
                const vid = tryAdd(cand);
                if (vid < 0 || vid === uid) continue;
                const v = nodes[vid];
                if (Math.abs(v.pos[1] - u.pos[1]) > 2.2) continue;
                const tr = physics.traceRay(uEye, [v.pos[0], v.pos[1] + 0.9, v.pos[2]]);
                if (tr.fraction > 0.92) {
                    const cost = Math.hypot(v.pos[0]-u.pos[0], v.pos[2]-u.pos[2]);
                    if (!u.adj.some(e => e.to === vid)) u.adj.push({ to: vid, cost });
                    if (!v.adj.some(e => e.to === uid)) v.adj.push({ to: uid, cost });
                    if (vid === nodes.length - 1) q.push(vid);
                }
            }
        }
    }

    // Cross-connect nearby mutually visible nodes
    for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
            const a = nodes[i].pos, b = nodes[j].pos;
            const d = Math.hypot(a[0]-b[0], a[2]-b[2]);
            if (d > 6.0 || Math.abs(a[1]-b[1]) > 2.0) continue;
            if (nodes[i].adj.some(e => e.to === j)) continue;
            const tr = physics.traceRay([a[0], a[1]+0.9, a[2]], [b[0], b[1]+0.9, b[2]]);
            if (tr.fraction > 0.94) {
                nodes[i].adj.push({ to: j, cost: d });
                nodes[j].adj.push({ to: i, cost: d });
            }
        }
    }
    return nodes;
}

function nearestNode(nodes, pos) {
    let best = -1, bestD = 1e9;
    for (let i = 0; i < nodes.length; i++) {
        const p = nodes[i].pos;
        const d = (p[0]-pos[0])**2 + (p[1]-pos[1])**2 * 2.5 + (p[2]-pos[2])**2;
        if (d < bestD) { bestD = d; best = i; }
    }
    return best;
}

export function findNavPath(nodes, startPos, goalPos) {
    if (!nodes || nodes.length === 0) return [goalPos];
    const s = nearestNode(nodes, startPos);
    const g = nearestNode(nodes, goalPos);
    if (s < 0 || g < 0) return [goalPos];
    if (s === g) return [goalPos];

    const n = nodes.length;
    const dist = new Float32Array(n).fill(1e9);
    const prev = new Int32Array(n).fill(-1);
    const vis = new Uint8Array(n);
    dist[s] = 0;

    for (let iter = 0; iter < n; iter++) {
        let u = -1, bd = 1e9;
        for (let i = 0; i < n; i++) {
            if (!vis[i] && dist[i] < bd) { bd = dist[i]; u = i; }
        }
        if (u < 0 || u === g) break;
        vis[u] = 1;
        for (const e of nodes[u].adj) {
            const nd = dist[u] + e.cost;
            if (nd < dist[e.to]) {
                dist[e.to] = nd;
                prev[e.to] = u;
            }
        }
    }

    if (prev[g] === -1) return [goalPos];
    const path = [goalPos];
    let cur = g;
    while (cur !== -1 && cur !== s) {
        path.push(nodes[cur].pos);
        cur = prev[cur];
    }
    path.reverse();
    return path;
}

export function createActor(id, isBot, team, name, skin) {
    return {
        id,
        isBot,
        team,
        name,
        skin: skin || (team === "CT" ? CT_SKINS[id % 4] : T_SKINS[id % 4]),
        alive: true,
        hp: 100,
        armor: 0,
        helmet: false,
        defuser: false,
        nvg: false,
        money: 800,
        kills: 0,
        deaths: 0,
        feetPos: [0, 0, 0],
        vel: [0, 0, 0],
        yaw: 0,
        pitch: 0,
        ducking: false,
        primary: null,
        secondary: createWeaponInstance(team === "CT" ? "usp" : "glock18"),
        knife: createWeaponInstance("knife"),
        grenades: { he: 0, flash: 0, smoke: 0 },
        hasC4: false,
        activeSlot: 2,
        nextFireTime: 0,
        reloadingUntil: 0,
        flashBlind: 0,
        animTime: 0,
        deathTime: 0,
        // Bot AI state
        path: [],
        pathIdx: 0,
        repathTimer: 0,
        goalSite: null,
        targetEnemy: null,
        strafeDir: 1,
        strafeTimer: 0,
        stuckTimer: 0,
        lastCheckPos: [0, 0, 0],
        defusing: false,
        planting: false,
    };
}

export function getActiveWeapon(actor) {
    if (actor.activeSlot === 1 && actor.primary) return actor.primary;
    if (actor.activeSlot === 2 && actor.secondary) return actor.secondary;
    if (actor.activeSlot === 3) return actor.knife;
    if (actor.activeSlot === 5 && actor.hasC4) return createWeaponInstance("c4");
    return actor.secondary || actor.knife;
}

export function botAutoBuy(bot) {
    if (bot.money >= 1000 && !bot.helmet) {
        bot.money -= 1000; bot.armor = 100; bot.helmet = true;
    } else if (bot.money >= 650 && bot.armor < 50) {
        bot.money -= 650; bot.armor = 100;
    }
    if (bot.team === "CT" && bot.money >= 200 && !bot.defuser && Math.random() < 0.6) {
        bot.money -= 200; bot.defuser = true;
    }
    if (!bot.primary) {
        const pool = bot.team === "T"
            ? ["ak47", "sg552", "awp", "mp5", "p90", "mac10"]
            : ["m4a1", "aug", "awp", "mp5", "p90", "ump45"];
        for (const wid of pool) {
            const w = WEAPONS[wid];
            if (bot.money >= w.price + 200) {
                bot.money -= w.price;
                bot.primary = createWeaponInstance(wid);
                bot.activeSlot = 1;
                break;
            }
        }
    } else {
        bot.primary.clip = bot.primary.def.clip;
        bot.primary.reserve = bot.primary.def.res;
    }
    if (bot.money >= 650 && bot.secondary.id !== "deagle" && Math.random() < 0.35) {
        bot.money -= 650;
        bot.secondary = createWeaponInstance("deagle");
    }
    if (!bot.primary) bot.activeSlot = 2;
    else bot.activeSlot = 1;
}

export function generateBotNames(countPerTeam) {
    const res = [];
    for (let i = 0; i < countPerTeam; i++) {
        res.push({ team: "CT", name: CT_NAMES[i % CT_NAMES.length] + (i >= CT_NAMES.length ? i : ""), skin: CT_SKINS[i % 4] });
        res.push({ team: "T",  name: T_NAMES[i % T_NAMES.length] + (i >= T_NAMES.length ? i : ""), skin: T_SKINS[i % 4] });
    }
    return res;
}

export function updateBotAI(bot, dt, ctx) {
    if (!bot.alive) return;
    if (bot.flashBlind > 0) bot.flashBlind = Math.max(0, bot.flashBlind - dt * 0.55);

    const { game, physics, navNodes, actors, now } = ctx;
    if (game.freezeTime > 0) return;

    const myEye = [bot.feetPos[0], bot.feetPos[1] + 1.45, bot.feetPos[2]];

    // 1. Enemy visibility scan
    let bestEnemy = null, bestDist = 45.0;
    if (bot.flashBlind < 0.45) {
        for (const other of actors) {
            if (!other.alive || other.team === bot.team) continue;
            const oEye = [other.feetPos[0], other.feetPos[1] + 1.45, other.feetPos[2]];
            const dist = Math.hypot(oEye[0] - myEye[0], oEye[1] - myEye[1], oEye[2] - myEye[2]);
            if (dist > bestDist) continue;
            // Smoke occlusion check
            if (ctx.isOccludedBySmoke(myEye, oEye)) continue;
            const tr = physics.traceRay(myEye, oEye);
            if (tr.fraction > 0.97) {
                bestDist = dist;
                bestEnemy = other;
            }
        }
    }
    bot.targetEnemy = bestEnemy;

    // 2. Objective / Goal selection
    let goalPos = null;
    bot.defusing = false;
    bot.planting = false;

    const sites = game.mapMeta.bombsites || [];
    if (bot.team === "T") {
        if (game.c4Planted) {
            goalPos = game.c4Pos;
        } else if (game.c4DroppedPos && !bestEnemy) {
            goalPos = game.c4DroppedPos;
            if (Math.hypot(bot.feetPos[0] - game.c4DroppedPos[0], bot.feetPos[2] - game.c4DroppedPos[2]) < 1.3) {
                game.pickupDroppedC4(bot);
            }
        } else if (sites.length > 0) {
            if (!bot.goalSite) bot.goalSite = sites[Math.floor(Math.random() * sites.length)];
            const b = bot.goalSite;
            goalPos = [(b.min[0]+b.max[0])*0.5, (b.min[1]+b.max[1])*0.5, (b.min[2]+b.max[2])*0.5];
            // Check if C4 carrier is inside bombsite
            if (bot.hasC4 && game.isInsideBombsite(bot.feetPos) && !bestEnemy) {
                bot.planting = true;
                bot.vel = [0, 0, 0];
                bot.ducking = true;
                game.advanceBotPlant(bot, dt);
                return;
            }
        }
    } else {
        // CT
        if (game.c4Planted) {
            goalPos = game.c4Pos;
            const dc4 = Math.hypot(bot.feetPos[0] - game.c4Pos[0], bot.feetPos[2] - game.c4Pos[2]);
            if (dc4 < 2.1 && !bestEnemy) {
                bot.defusing = true;
                bot.vel = [0, 0, 0];
                bot.ducking = true;
                game.advanceBotDefuse(bot, dt);
                return;
            }
        } else if (sites.length > 0) {
            if (!bot.goalSite) bot.goalSite = sites[bot.id % sites.length];
            const b = bot.goalSite;
            goalPos = [(b.min[0]+b.max[0])*0.5, (b.min[1]+b.max[1])*0.5, (b.min[2]+b.max[2])*0.5];
        }
    }

    // 3. Follow nav path if not frozen in combat
    bot.repathTimer -= dt;
    if (goalPos && (bot.repathTimer <= 0 || bot.path.length === 0)) {
        bot.repathTimer = 2.0 + Math.random() * 1.2;
        bot.path = findNavPath(navNodes, bot.feetPos, goalPos);
        bot.pathIdx = 0;
    }

    let moveTarget = null;
    if (bot.path.length > 0 && bot.pathIdx < bot.path.length) {
        moveTarget = bot.path[bot.pathIdx];
        if (Math.hypot(moveTarget[0] - bot.feetPos[0], moveTarget[2] - bot.feetPos[2]) < 1.15) {
            bot.pathIdx++;
            if (bot.pathIdx < bot.path.length) moveTarget = bot.path[bot.pathIdx];
        }
    }

    // 4. Aim & Combat
    let fwd = 0, side = 0;
    bot.ducking = false;
    if (bestEnemy) {
        const eEye = [bestEnemy.feetPos[0], bestEnemy.feetPos[1] + 1.38, bestEnemy.feetPos[2]];
        const dx = eEye[0] - myEye[0], dy = eEye[1] - myEye[1], dz = eEye[2] - myEye[2];
        const targetYaw = (Math.atan2(-dz, dx) * 180) / Math.PI;
        const targetPitch = (Math.atan2(dy, Math.hypot(dx, dz)) * 180) / Math.PI;
        bot.yaw = lerpAngle(bot.yaw, targetYaw, Math.min(1, dt * 11));
        bot.pitch = bot.pitch + (targetPitch - bot.pitch) * Math.min(1, dt * 11);

        bot.strafeTimer -= dt;
        if (bot.strafeTimer <= 0) {
            bot.strafeTimer = 0.45 + Math.random() * 0.5;
            bot.strafeDir = Math.random() < 0.5 ? -1 : 1;
        }
        side = bot.strafeDir * 0.7;
        if (bestDist > 12) fwd = 0.4;
        if (bestDist < 10 && Math.random() < 0.4) bot.ducking = true;

        // Shoot burst
        const wep = getActiveWeapon(bot);
        if (wep.def.melee && bestDist > 2.2) {
            bot.activeSlot = bot.primary ? 1 : 2;
        }
        if (now >= bot.nextFireTime && now >= bot.reloadingUntil) {
            ctx.fireWeapon(bot, myEye, true);
        }
    } else if (moveTarget) {
        const dx = moveTarget[0] - bot.feetPos[0];
        const dz = moveTarget[2] - bot.feetPos[2];
        if (Math.hypot(dx, dz) > 0.25) {
            const targetYaw = (Math.atan2(-dz, dx) * 180) / Math.PI;
            bot.yaw = lerpAngle(bot.yaw, targetYaw, Math.min(1, dt * 8));
            bot.pitch *= 0.9;
            fwd = 1.0;
        }
    }

    // 5. Move bot along BSP hull
    const wep = getActiveWeapon(bot);
    const spd = (wep.def.spd || 230) * SCALE * (bot.ducking ? 0.45 : 0.88);
    const yr = (bot.yaw * Math.PI) / 180;
    const fx = Math.cos(yr), fz = -Math.sin(yr);
    const rx = Math.sin(yr), rz = Math.cos(yr);
    let vx = (fx * fwd + rx * side) * spd;
    let vz = (fz * fwd + rz * side) * spd;

    const hh = bot.ducking ? PM.DUCK_HALF_H : PM.STAND_HALF_H;
    let center = [bot.feetPos[0], bot.feetPos[1] + hh, bot.feetPos[2]];

    // Check ground & apply gravity
    const gtr = physics.traceHull(center, [center[0], center[1] - 0.06, center[2]], bot.ducking);
    const onGround = gtr.fraction < 1.0 && gtr.normal[1] >= 0.7;
    if (onGround) bot.vel[1] = 0;
    else bot.vel[1] -= PM.GRAVITY * dt;

    // Step up & slide
    const end = [center[0] + vx * dt, center[1] + bot.vel[1] * dt, center[2] + vz * dt];
    let tr = physics.traceHull(center, end, bot.ducking);
    if (tr.fraction < 0.85 && onGround) {
        // Try stepping up stairs
        const up = physics.traceHull(center, [center[0], center[1] + PM.STEP_SIZE, center[2]], bot.ducking);
        const stepFwd = physics.traceHull(up.endpos, [up.endpos[0] + vx * dt, up.endpos[1], up.endpos[2] + vz * dt], bot.ducking);
        const down = physics.traceHull(stepFwd.endpos, [stepFwd.endpos[0], stepFwd.endpos[1] - PM.STEP_SIZE, stepFwd.endpos[2]], bot.ducking);
        if (down.fraction < 1.0 && down.normal[1] >= 0.7) {
            tr = down;
        } else if (tr.fraction < 0.35) {
            bot.strafeDir = -bot.strafeDir;
            bot.repathTimer = 0.2;
        }
    }
    center = tr.endpos;
    bot.feetPos = [center[0], center[1] - hh, center[2]];
    bot.vel[0] = vx; bot.vel[2] = vz;
    if (Math.hypot(vx, vz) > 0.2) bot.animTime += dt;
}

function lerpAngle(a, b, t) {
    let d = ((b - a + 540) % 360) - 180;
    return a + d * t;
}
