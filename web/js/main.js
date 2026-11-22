// ============================================================================
//  main.js — Nucleo ejecutable WebGL2 de Counter-Strike 1.5 Retail (Whisk3D)
// ============================================================================
import { CSMapData } from "./w3dbsp_loader.js";
import { assetUrl, detectAssetBase } from "./asset_path.js";
import { BSPRenderer } from "./bsp_renderer.js";
import { BSPPhysics, PlayerMover, PM, SCALE } from "./physics.js";
import { WEAPONS, BUY_MENU, createWeaponInstance } from "./weapons.js";
import { AudioEngine } from "./audio.js";
import { EffectsManager } from "./effects.js";
import { buildNavGraph, createActor, generateBotNames, getActiveWeapon, updateBotAI } from "./bots.js";
import { BombDefusalGame } from "./gamemode.js";
import { CSHud } from "./hud.js";

const glCanvas = document.getElementById("glCanvas");
const renderer = new BSPRenderer(glCanvas);
const audio = new AudioEngine();
const fx = new EffectsManager();
const hud = new CSHud();

const uiTeamMenu = document.getElementById("teamMenu");
const uiMapSelect = document.getElementById("mapSelect");
const uiBotSelect = document.getElementById("botSelect");
const uiBtnResume = document.getElementById("btnResume");
const uiTelemetry = document.getElementById("telemetry");
const uiClickPrompt = document.getElementById("clickPrompt");
const uiScCT = document.getElementById("scCT");
const uiScT = document.getElementById("scT");
const uiScMap = document.getElementById("scMap");
const uiConLog = document.getElementById("consoleLog");
const uiConInput = document.getElementById("consoleInput");

let currentMapName = "de_dust2";
let mapData = null;
let physics = null;
let navNodes = [];
let game = null;
let botQuota = 4;
let actors = [];
let player = createActor(0, false, "CT", "Player", "urban");
let mover = null;
let started = false;

// Camera & Weapon State
let punchPitch = 0, punchYaw = 0;
let shakeAmp = 0;
let scopeLevel = 0;
let lastSlot = 2;
let vmAnim = "draw";
let vmAnimTime = 0;
let vmFlash = 0;
let burstLeft = 0;
let burstTimer = 0;
let godMode = false;
let dynamicCrosshair = true;
let showTelemetry = true;
let sensitivity = 0.14;
let lastBuyBundle = [];

const keys = new Set();
let mouseL = false;
let mouseR = false;
let prevMouseL = false;

function conPrint(msg) {
    const div = document.createElement("div");
    div.textContent = msg;
    uiConLog.appendChild(div);
    uiConLog.scrollTop = uiConLog.scrollHeight;
}

function makeModelMat(pos, yawDeg, out) {
    const yr = (yawDeg * Math.PI) / 180.0;
    const c = Math.cos(yr), s = Math.sin(yr);
    out.fill(0);
    out[0] = c;  out[2] = -s;
    out[5] = 1;
    out[8] = s;  out[10] = c;
    out[12] = pos[0]; out[13] = pos[1]; out[14] = pos[2]; out[15] = 1;
}

function makeViewModelMat(recoilKick, bobPhase, speedUnits, reloadFrac) {
    const m = new Float32Array(16);
    m.fill(0);
    m[0] = 1; m[5] = 1; m[10] = 1; m[15] = 1;
    const bobAmp = Math.min(1.0, speedUnits / 250.0) * 0.008;
    m[12] = Math.cos(bobPhase * 0.5) * bobAmp;
    m[13] = Math.abs(Math.sin(bobPhase)) * -bobAmp - reloadFrac * 0.04;
    m[14] = recoilKick * 0.035;
    return m;
}

async function preloadCoreAssets() {
    const models = [
        "models/player_urban.glb", "models/player_gsg9.glb", "models/player_sas.glb", "models/player_gign.glb",
        "models/player_terror.glb", "models/player_leet.glb", "models/player_arctic.glb", "models/player_guerilla.glb",
        "models/w_c4.glb", "models/v_knife.glb", "models/v_usp.glb", "models/v_glock18.glb",
        "models/v_ak47.glb", "models/v_m4a1.glb", "models/v_awp.glb", "models/v_deagle.glb",
        "models/v_mp5.glb", "models/v_c4.glb", "models/v_hegrenade.glb", "models/v_flashbang.glb", "models/v_smokegrenade.glb",
    ];
    await Promise.all(models.map(u => renderer.loadGLB(assetUrl(u))));
}

async function loadMap(mapName) {
    currentMapName = mapName;
    uiScMap.textContent = mapName.toUpperCase();
    uiTelemetry.textContent = `Loading ${mapName}.w3dbsp...`;
    fx.clearRound();

    mapData = await CSMapData.load(mapName);
    physics = new BSPPhysics(mapData);
    await renderer.setMap(mapData);
    navNodes = buildNavGraph(mapData, physics);

    mover = new PlayerMover(physics);
    const sp = (mapData.meta.spawnsCT && mapData.meta.spawnsCT[0]) || { pos: [0, 2, 0], yaw: 0 };
    mover.feetPos = physics.placeOnFloor(sp.pos);
    mover.yaw = sp.yaw || 0;
    player.feetPos = [...mover.feetPos];

    game = new BombDefusalGame(
        mapData.meta,
        physics,
        audio,
        (a, at, v, vt, w, hs) => hud.addKillfeed(a, at, v, vt, w, hs),
        (txt, d) => hud.showBanner(txt, d)
    );
    conPrint(`Loaded ${mapName} (.w3dbsp v${mapData.ver}, ${mapData.faces.length} faces, ${navNodes.length} nav nodes)`);
}

function startMatch(teamChoice, skinChoice) {
    audio.unlock();
    audio.preload([
        "sounds/weapons/ak47-1.wav", "sounds/weapons/m4a1-1.wav", "sounds/weapons/m4a1_unsil-1.wav",
        "sounds/weapons/usp1.wav", "sounds/weapons/usp_unsil-1.wav", "sounds/weapons/glock18-1.wav",
        "sounds/weapons/deagle-1.wav", "sounds/weapons/awp1.wav", "sounds/weapons/mp5-1.wav",
        "sounds/weapons/knife_slash1.wav", "sounds/weapons/knife_stab.wav", "sounds/weapons/headshot2.wav",
        "sounds/weapons/hegrenade-1.wav", "sounds/weapons/flashbang-1.wav", "sounds/weapons/sg_explode.wav",
        "sounds/weapons/c4_beep2.wav", "sounds/weapons/c4_explode1.wav",
        "sounds/radio/locknload.wav", "sounds/radio/letsgo.wav", "sounds/radio/bombpl.wav",
        "sounds/radio/bombdef.wav", "sounds/radio/ctwin.wav", "sounds/radio/terwin.wav",
    ]);

    const team = teamChoice === "AUTO" ? (Math.random() < 0.5 ? "CT" : "T") : teamChoice;
    const skin = skinChoice || (team === "CT" ? "urban" : "terror");
    player = createActor(0, false, team, "Player", skin);
    botQuota = parseInt(uiBotSelect.value, 10) || 0;

    actors = [player];
    const botDefs = generateBotNames(botQuota);
    let bid = 1;
    for (const bd of botDefs) {
        actors.push(createActor(bid++, true, bd.team, bd.name, bd.skin));
    }

    game.startRound(actors, true);
    mover.feetPos = [...player.feetPos];
    mover.yaw = player.yaw;
    mover.pitch = 0;
    scopeLevel = 0;
    vmAnim = "draw";
    vmAnimTime = 0;
    started = true;

    uiTeamMenu.classList.add("hidden");
    uiBtnResume.classList.remove("hidden");
    glCanvas.requestPointerLock?.();
}

function switchWeaponSlot(slot) {
    if (!player.alive) return;
    if (slot === 1 && !player.primary) return;
    if (slot === 2 && !player.secondary) return;
    if (slot === 4) {
        // Cycle available grenades
        const order = ["he", "flash", "smoke"];
        const cur = player.selectedGrenade || "he";
        const idx = order.indexOf(cur);
        for (let i = 1; i <= 3; i++) {
            const g = order[(idx + i) % 3];
            if (player.grenades[g] > 0) {
                player.selectedGrenade = g;
                lastSlot = player.activeSlot;
                player.activeSlot = 4;
                scopeLevel = 0;
                vmAnim = "draw"; vmAnimTime = 0;
                return;
            }
        }
        return;
    }
    if (slot === 5 && !player.hasC4) return;
    if (player.activeSlot !== slot) lastSlot = player.activeSlot;
    player.activeSlot = slot;
    player.reloadingUntil = 0;
    scopeLevel = 0;
    vmAnim = "draw";
    vmAnimTime = 0;
}

function activePlayerWeapon() {
    if (player.activeSlot === 4) {
        const g = player.selectedGrenade || (player.grenades.he > 0 ? "he" : player.grenades.flash > 0 ? "flash" : "smoke");
        if (!g || player.grenades[g] <= 0) return null;
        const id = g === "he" ? "hegrenade" : g === "flash" ? "flashbang" : "smokegrenade";
        return { id, def: WEAPONS[id], isGrenade: g };
    }
    return getActiveWeapon(player);
}

function getSpread(actor, wep, speedUnits, onGround, ducking) {
    let sp = wep.def.spread || 0.01;
    if (ducking) sp *= 0.65;
    if (!onGround) sp += 0.075;
    else if (speedUnits > 140) sp += 0.025;
    else if (speedUnits > 20) sp += 0.008;
    if (wep.def.sniper && (actor.isBot || scopeLevel === 0)) sp += 0.045;
    return sp;
}

function fireActorWeapon(actor, eyePos, isBot, rmb = false) {
    const now = performance.now() / 1000;
    const wep = isBot ? getActiveWeapon(actor) : activePlayerWeapon();
    if (!wep || !actor.alive) return;
    if (now < actor.nextFireTime || now < actor.reloadingUntil) return;

    // Grenades
    if (wep.def.grenade) {
        if (!isBot && actor.grenades[wep.def.grenade] > 0) {
            actor.grenades[wep.def.grenade]--;
            const yr = (actor.yaw * Math.PI) / 180;
            const pr = ((actor.pitch + 8) * Math.PI) / 180;
            const cp = Math.cos(pr);
            const dir = [Math.cos(yr)*cp, Math.sin(pr), -Math.sin(yr)*cp];
            const spd = 16.5;
            fx.spawnGrenade(wep.def.grenade, eyePos, [dir[0]*spd + actor.vel[0]*0.4, dir[1]*spd + 1.5, dir[2]*spd + actor.vel[2]*0.4], actor);
            audio.play3D("sounds/weapons/pinpull.wav", eyePos, mover.eyePos(), mover.yaw, 20, 0.6);
            actor.nextFireTime = now + 0.6;
            // Switch away if empty
            if (actor.grenades[wep.def.grenade] <= 0) {
                switchWeaponSlot(actor.primary ? 1 : 2);
            }
        }
        return;
    }

    if (wep.def.isC4) return; // Handled via hold plant

    // Knife
    if (wep.def.melee) {
        const stab = !isBot && rmb;
        actor.nextFireTime = now + (stab ? 0.85 : wep.def.rate);
        if (!isBot) { vmAnim = stab ? "stab" : "slash"; vmAnimTime = 0; }
        const yr = (actor.yaw * Math.PI) / 180, pr = (actor.pitch * Math.PI) / 180;
        const cp = Math.cos(pr);
        const dir = [Math.cos(yr)*cp, Math.sin(pr), -Math.sin(yr)*cp];
        const hit = raycastHit(actor, eyePos, dir, 1.85);
        if (hit.actor) {
            // Check backstab
            const ey = (hit.actor.yaw * Math.PI) / 180;
            const dot = dir[0]*Math.cos(ey) + dir[2]*(-Math.sin(ey));
            const baseDmg = stab ? 65 : 18;
            const dmg = dot > 0.5 ? baseDmg * 3 : baseDmg;
            applyDamage(hit.actor, actor, dmg, false, "Knife", hit.pos);
            audio.play3D(stab ? "sounds/weapons/knife_stab.wav" : "sounds/weapons/knife_hit1.wav", hit.pos, mover.eyePos(), mover.yaw, 25, 0.85);
        } else if (hit.wall) {
            fx.addDecal(hit.pos, hit.normal);
            audio.play3D("sounds/weapons/knife_hitwall1.wav", hit.pos, mover.eyePos(), mover.yaw, 22, 0.65);
        } else {
            audio.play3D("sounds/weapons/knife_slash1.wav", eyePos, mover.eyePos(), mover.yaw, 20, 0.55);
        }
        return;
    }

    // Firearms
    if (wep.clip <= 0) {
        if (!isBot) audio.play("sounds/weapons/dryfire_rifle.wav", 0.5);
        startReload(actor, wep, now);
        return;
    }

    wep.clip--;
    const fireRate = wep.def.rate * (isBot ? 1.55 : 1.0);
    actor.nextFireTime = now + fireRate;
    if (!isBot) {
        vmAnim = "shoot"; vmAnimTime = 0; vmFlash = 1.0;
        if (wep.def.sniper && scopeLevel > 0) scopeLevel = 0;
        if (wep.burst && burstLeft === 0) { burstLeft = 2; burstTimer = 0.065; }
    }

    const snd = (wep.silenced && wep.def.silSnd) ? wep.def.silSnd : wep.def.snd;
    audio.play3D(snd, eyePos, mover.eyePos(), mover.yaw, wep.silenced ? 26 : 55, wep.silenced ? 0.55 : 0.85);
    fx.addShell(eyePos, actor.yaw);

    const pellets = wep.def.pellets || 1;
    const speedU = isBot ? 110 : Math.hypot(mover.vel[0], mover.vel[2]) / SCALE;
    const spread = getSpread(actor, wep, speedU, isBot ? true : mover.onGround, actor.ducking) * (isBot ? 2.1 : 1.0);

    for (let p = 0; p < pellets; p++) {
        const yawOff = (Math.random() - 0.5) * 2 * spread * 57.3;
        const pitOff = (Math.random() - 0.5) * 2 * spread * 57.3;
        const yr = ((actor.yaw + yawOff + (isBot ? 0 : punchYaw)) * Math.PI) / 180;
        const pr = ((actor.pitch + pitOff + (isBot ? 0 : punchPitch)) * Math.PI) / 180;
        const cp = Math.cos(pr);
        const dir = [Math.cos(yr)*cp, Math.sin(pr), -Math.sin(yr)*cp];

        const hit = raycastHit(actor, eyePos, dir, 95.0);
        const tracerStart = isBot ? eyePos : [eyePos[0] + dir[0]*0.4, eyePos[1] - 0.12, eyePos[2] + dir[2]*0.4];
        if (!wep.silenced) fx.addTracer(tracerStart, hit.pos);

        if (hit.actor) {
            applyDamage(hit.actor, actor, wep.def.dmg, hit.headshot, wep.def.name, hit.pos, wep.def.headMult);
        } else if (hit.wall) {
            fx.addDecal(hit.pos, hit.normal);
            if (Math.random() < 0.25) audio.play3D("sounds/weapons/ric1.wav", hit.pos, mover.eyePos(), mover.yaw, 25, 0.35);
            // Wallbang penetration!
            if (wep.def.pen >= 2) {
                const probe = [hit.pos[0] + dir[0]*0.32, hit.pos[1] + dir[1]*0.32, hit.pos[2] + dir[2]*0.32];
                if (mapData.leafAt(probe[0], probe[1], probe[2]) > 0) {
                    const hit2 = raycastHit(actor, probe, dir, 40.0);
                    if (hit2.actor) {
                        applyDamage(hit2.actor, actor, wep.def.dmg * 0.45, hit2.headshot, wep.def.name, hit2.pos, wep.def.headMult);
                    }
                }
            }
        }
    }

    if (!isBot) {
        punchPitch = Math.min(11.0, punchPitch + wep.def.recoil * (player.ducking ? 0.65 : 1.0));
        punchYaw += (Math.random() - 0.5) * wep.def.recoil * 0.7;
    }
    if (wep.clip <= 0 && wep.reserve > 0) startReload(actor, wep, now);
}

function startReload(actor, wep, now) {
    if (!wep || !wep.def.clip || wep.clip >= wep.def.clip || wep.reserve <= 0) return;
    if (now < actor.reloadingUntil) return;
    actor.reloadingUntil = now + wep.def.reload;
    if (!actor.isBot) {
        scopeLevel = 0;
        vmAnim = "reload"; vmAnimTime = 0;
        if (wep.def.relSnd) audio.play(wep.def.relSnd, 0.55);
    }
}

function finishReloads(now) {
    for (const a of actors) {
        if (a.reloadingUntil > 0 && now >= a.reloadingUntil) {
            a.reloadingUntil = 0;
            const w = a.isBot ? getActiveWeapon(a) : activePlayerWeapon();
            if (w && w.def.clip && w.reserve > 0) {
                const need = w.def.clip - w.clip;
                const take = Math.min(need, w.reserve);
                w.clip += take;
                w.reserve -= take;
            }
        }
    }
}

function raycastHit(shooter, start, dir, maxDist) {
    const end = [start[0] + dir[0]*maxDist, start[1] + dir[1]*maxDist, start[2] + dir[2]*maxDist];
    const wtr = physics.traceRay(start, end);
    let bestT = wtr.fraction * maxDist;
    let bestActor = null;
    let bestHS = false;

    for (const a of actors) {
        if (!a.alive || a === shooter) continue;
        // Cylinder hitbox check (radius 0.44m, height 1.72m standing / 0.96m ducking)
        const r = 0.44;
        const ox = start[0] - a.feetPos[0], oz = start[2] - a.feetPos[2];
        const A = dir[0]*dir[0] + dir[2]*dir[2];
        const B = 2 * (ox*dir[0] + oz*dir[2]);
        const C = ox*ox + oz*oz - r*r;
        const disc = B*B - 4*A*C;
        if (disc < 0 || A < 1e-6) continue;
        const t = (-B - Math.sqrt(disc)) / (2 * A);
        if (t <= 0 || t >= bestT) continue;
        const hy = start[1] + dir[1] * t;
        const hMax = a.ducking ? 0.96 : 1.72;
        if (hy >= a.feetPos[1] && hy <= a.feetPos[1] + hMax) {
            bestT = t;
            bestActor = a;
            bestHS = hy >= (a.feetPos[1] + (a.ducking ? 0.68 : 1.38));
        }
    }

    const pos = [start[0] + dir[0]*bestT, start[1] + dir[1]*bestT, start[2] + dir[2]*bestT];
    return { actor: bestActor, headshot: bestHS, wall: !bestActor && wtr.fraction < 1.0, pos, normal: wtr.normal };
}

function applyDamage(victim, attacker, baseDmg, isHeadshot, weaponName, hitPos, headMult = 3.5) {
    if (!victim.alive) return;
    if (victim === player && godMode) return;
    let dmg = baseDmg * (isHeadshot ? headMult : 1.0);
    if (victim.armor > 0 && (!isHeadshot || victim.helmet)) {
        const absorbed = dmg * 0.45;
        victim.armor = Math.max(0, victim.armor - absorbed * 0.5);
        dmg -= absorbed;
    }
    victim.hp -= dmg;
    fx.addBlood(hitPos);

    if (isHeadshot) {
        audio.play3D("sounds/weapons/headshot2.wav", hitPos, mover.eyePos(), mover.yaw, 30, 0.85);
    } else {
        audio.play3D("sounds/player/bhit_flesh-1.wav", hitPos, mover.eyePos(), mover.yaw, 25, 0.7);
    }
    if (victim === player) hud.damageFlash = 1.0;

    if (victim.hp <= 0) {
        victim.hp = 0;
        audio.play3D("sounds/player/die1.wav", victim.feetPos, mover.eyePos(), mover.yaw, 35, 0.8);
        game.onActorKilled(victim, attacker, weaponName, isHeadshot);
    }
}

function handleGrenadeEvent(g, isBounce) {
    if (isBounce) {
        audio.play3D("sounds/weapons/he_bounce-1.wav", g.pos, mover.eyePos(), mover.yaw, 24, 0.5);
        return;
    }
    if (g.type === "he") {
        audio.play3D("sounds/weapons/hegrenade-1.wav", g.pos, mover.eyePos(), mover.yaw, 60, 0.95);
        fx.addExplosion(g.pos);
        applyExplosionDamage(g.pos, 9.0, 98, g.owner, "HE Grenade");
    } else if (g.type === "flash") {
        audio.play3D("sounds/weapons/flashbang-1.wav", g.pos, mover.eyePos(), mover.yaw, 50, 0.9);
        for (const a of actors) {
            if (!a.alive) continue;
            const eye = a === player ? mover.eyePos() : [a.feetPos[0], a.feetPos[1] + 1.4, a.feetPos[2]];
            const dist = Math.hypot(g.pos[0]-eye[0], g.pos[1]-eye[1], g.pos[2]-eye[2]);
            if (dist > 22) continue;
            const tr = physics.traceRay(eye, g.pos);
            if (tr.fraction < 0.95) continue;
            const yr = (a.yaw * Math.PI) / 180;
            const toG = [(g.pos[0]-eye[0])/Math.max(0.1,dist), (g.pos[2]-eye[2])/Math.max(0.1,dist)];
            const facing = Math.cos(yr)*toG[0] + (-Math.sin(yr))*toG[1];
            const strength = Math.max(0.15, (1.0 - dist / 22.0) * (0.45 + 0.55 * Math.max(0, facing)));
            a.flashBlind = Math.min(1.0, a.flashBlind + strength * 1.15);
            if (a === player) audio.playFlashRing(strength);
        }
    } else if (g.type === "smoke") {
        audio.play3D("sounds/weapons/sg_explode.wav", g.pos, mover.eyePos(), mover.yaw, 40, 0.85);
        fx.addSmokeCloud(g.pos);
    }
}

function applyExplosionDamage(pos, radius, maxDmg, owner, label) {
    const dPlayer = Math.hypot(pos[0] - mover.feetPos[0], pos[2] - mover.feetPos[2]);
    if (dPlayer < radius * 1.5) shakeAmp = Math.max(shakeAmp, (1.0 - dPlayer / (radius * 1.5)) * 4.5);
    for (const a of actors) {
        if (!a.alive) continue;
        const d = Math.hypot(pos[0] - a.feetPos[0], pos[1] - a.feetPos[1], pos[2] - a.feetPos[2]);
        if (d < radius) {
            const dmg = maxDmg * (1.0 - d / radius);
            applyDamage(a, owner, dmg, false, label, a.feetPos);
        }
    }
}

function isOccludedBySmoke(a, b) {
    for (const sm of fx.smokes) {
        const px = sm.pos[0], py = sm.pos[1] + 1.0, pz = sm.pos[2];
        const vx = b[0]-a[0], vy = b[1]-a[1], vz = b[2]-a[2];
        const l2 = vx*vx + vy*vy + vz*vz;
        if (l2 < 1e-4) continue;
        const t = Math.max(0, Math.min(1, ((px-a[0])*vx + (py-a[1])*vy + (pz-a[2])*vz) / l2));
        const d = Math.hypot(a[0]+t*vx - px, a[1]+t*vy - py, a[2]+t*vz - pz);
        if (d < 2.2) return true;
    }
    return false;
}

function tryBuyItem(key) {
    if (!player.alive) return;
    if (!game.isInsideBuyzone(player)) {
        hud.showBanner("You are outside the buyzone or buytime expired!", 1.8);
        hud.closeBuyMenu();
        return;
    }
    if (key === "0") {
        if (hud.buyPage === 0) hud.closeBuyMenu();
        else hud.openBuyMenu(0);
        return;
    }
    const page = BUY_MENU[hud.buyPage];
    if (!page) return;
    const item = page.items.find(it => it.key === key && (!it.team || it.team === player.team));
    if (!item) return;

    if (item.sub !== undefined) {
        hud.openBuyMenu(item.sub);
        return;
    }
    if (item.action) {
        if (player.money < item.price) return;
        if (item.action === "kevlar") { player.money -= 650; player.armor = 100; audio.play("sounds/items/kevlar.wav", 0.7); }
        else if (item.action === "kevlar_helmet") { player.money -= 1000; player.armor = 100; player.helmet = true; audio.play("sounds/items/kevlar.wav", 0.7); }
        else if (item.action === "defuser" && player.team === "CT" && !player.defuser) { player.money -= 200; player.defuser = true; audio.play("sounds/items/kevlar.wav", 0.6); }
        else if (item.action === "nvg" && !player.nvg) { player.money -= 1250; player.nvg = true; audio.play("sounds/items/equip_nvg.wav", 0.6); }
        else if (item.action === "ammo1" && player.primary) { player.money -= 60; player.primary.reserve = player.primary.def.res; audio.play("sounds/weapons/clipin1.wav", 0.6); }
        else if (item.action === "ammo2" && player.secondary) { player.money -= 40; player.secondary.reserve = player.secondary.def.res; audio.play("sounds/weapons/clipin1.wav", 0.6); }
        hud.closeBuyMenu();
        return;
    }
    if (item.id) {
        const w = WEAPONS[item.id];
        if (w.team !== "BOTH" && w.team !== player.team) return;
        if (player.money < w.price) return;
        player.money -= w.price;
        if (w.grenade) {
            player.grenades[w.grenade] = Math.min(w.grenade === "flash" ? 2 : 1, player.grenades[w.grenade] + 1);
            audio.play("sounds/items/kevlar.wav", 0.5);
        } else if (w.slot === 1) {
            player.primary = createWeaponInstance(item.id);
            player.activeSlot = 1;
            vmAnim = "draw"; vmAnimTime = 0;
            lastBuyBundle.push(item.id);
            audio.play("sounds/items/kevlar.wav", 0.5);
        } else if (w.slot === 2) {
            player.secondary = createWeaponInstance(item.id);
            player.activeSlot = 2;
            vmAnim = "draw"; vmAnimTime = 0;
            audio.play("sounds/items/kevlar.wav", 0.5);
        }
        hud.closeBuyMenu();
    }
}

function autoBuy() {
    if (!player.alive || !game.isInsideBuyzone(player)) return;
    if (player.money >= 1000 && !player.helmet) { player.money -= 1000; player.armor = 100; player.helmet = true; }
    else if (player.money >= 650 && player.armor < 50) { player.money -= 650; player.armor = 100; }
    const rifle = player.team === "T" ? "ak47" : "m4a1";
    if (!player.primary && player.money >= WEAPONS[rifle].price) {
        player.money -= WEAPONS[rifle].price;
        player.primary = createWeaponInstance(rifle);
        player.activeSlot = 1;
    } else if (!player.primary && player.money >= WEAPONS.mp5.price) {
        player.money -= WEAPONS.mp5.price;
        player.primary = createWeaponInstance("mp5");
        player.activeSlot = 1;
    }
    if (player.team === "CT" && !player.defuser && player.money >= 200) { player.money -= 200; player.defuser = true; }
    if (player.grenades.he === 0 && player.money >= 300) { player.money -= 300; player.grenades.he = 1; }
    if (player.grenades.flash === 0 && player.money >= 200) { player.money -= 200; player.grenades.flash = 1; }
    audio.play("sounds/items/kevlar.wav", 0.65);
    hud.showBanner("Autobuy Complete", 1.5);
}

// Console Commands
document.getElementById("consoleForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const raw = uiConInput.value.trim();
    uiConInput.value = "";
    if (!raw) return;
    conPrint(`] ${raw}`);
    const parts = raw.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const arg = parts[1];

    if (cmd === "map" && arg) {
        await loadMap(arg);
        startMatch(player.team, player.skin);
    } else if (cmd === "bot_quota" && arg !== undefined) {
        botQuota = Math.max(0, Math.min(8, parseInt(arg, 10) || 0));
        uiBotSelect.value = String(botQuota);
        startMatch(player.team, player.skin);
    } else if (cmd === "sv_gravity" && arg !== undefined) {
        PM.GRAVITY = (parseFloat(arg) || 800) * SCALE;
        conPrint(`sv_gravity = ${arg}`);
    } else if (cmd === "sv_airaccelerate" && arg !== undefined) {
        PM.AIR_ACCEL = parseFloat(arg) || 10;
        conPrint(`sv_airaccelerate = ${PM.AIR_ACCEL}`);
    } else if (cmd === "cl_dynamiccrosshair") {
        dynamicCrosshair = arg !== "0";
    } else if (cmd === "noclip") {
        mover.noclip = !mover.noclip;
        conPrint(`noclip ${mover.noclip ? "ON" : "OFF"}`);
    } else if (cmd === "god") {
        godMode = !godMode;
        conPrint(`god ${godMode ? "ON" : "OFF"}`);
    } else if (cmd === "impulse" && arg === "101") {
        player.money = 16000;
        conPrint("$16,000 granted");
    } else if (cmd === "give" && arg) {
        const wid = arg.replace(/^weapon_/, "");
        if (WEAPONS[wid]) {
            const w = WEAPONS[wid];
            if (w.slot === 1) { player.primary = createWeaponInstance(wid); player.activeSlot = 1; }
            else if (w.slot === 2) { player.secondary = createWeaponInstance(wid); player.activeSlot = 2; }
            else if (w.grenade) player.grenades[w.grenade] = 1;
            conPrint(`Given ${w.name}`);
        }
    } else if (cmd === "sensitivity" && arg) {
        sensitivity = Math.max(0.02, parseFloat(arg) || 0.14);
    } else {
        conPrint("Commands: map <de_name>, bot_quota <n>, sv_gravity <n>, sv_airaccelerate <n>, noclip, god, impulse 101, give weapon_<id>");
    }
});

// Input Handlers
window.addEventListener("keydown", (e) => {
    if (e.code === "Backquote" || e.code === "F4") {
        e.preventDefault();
        hud.consoleOpen = !hud.consoleOpen;
        hud.elConsole.classList.toggle("hidden", !hud.consoleOpen);
        if (hud.consoleOpen) {
            document.exitPointerLock?.();
            uiConInput.focus();
        }
        return;
    }
    if (hud.consoleOpen) {
        if (e.code === "Escape") {
            hud.consoleOpen = false;
            hud.elConsole.classList.add("hidden");
        }
        return;
    }

    keys.add(e.code);
    if (e.code === "Tab") e.preventDefault();
    if (!started) return;

    if (e.code === "KeyB") {
        if (hud.buyOpen) hud.closeBuyMenu();
        else if (game.isInsideBuyzone(player)) hud.openBuyMenu(0);
        else hud.showBanner("Not in buyzone / buytime expired", 1.5);
        return;
    }
    if (hud.buyOpen && e.key >= "0" && e.key <= "8") {
        tryBuyItem(e.key);
        return;
    }

    if (e.code === "Digit1") switchWeaponSlot(1);
    else if (e.code === "Digit2") switchWeaponSlot(2);
    else if (e.code === "Digit3") switchWeaponSlot(3);
    else if (e.code === "Digit4") switchWeaponSlot(4);
    else if (e.code === "Digit5") switchWeaponSlot(5);
    else if (e.code === "KeyQ") switchWeaponSlot(lastSlot);
    else if (e.code === "KeyR") startReload(player, activePlayerWeapon(), performance.now() / 1000);
    else if (e.code === "KeyN" && player.nvg) {
        player.nvgOn = !player.nvgOn;
        audio.play(player.nvgOn ? "sounds/items/nvg_on.wav" : "sounds/items/nvg_off.wav", 0.6);
    }
    else if (e.code === "KeyG" && player.alive && player.activeSlot === 1 && player.primary) {
        game.droppedWeapons.push({ id: player.primary.id, instance: player.primary, pos: [...player.feetPos] });
        player.primary = null;
        player.activeSlot = 2;
        scopeLevel = 0;
    }
    else if (e.code === "F1") autoBuy();
    else if (e.code === "F3") { showTelemetry = !showTelemetry; uiTelemetry.classList.toggle("hidden", !showTelemetry); }
});

window.addEventListener("keyup", (e) => keys.delete(e.code));

glCanvas.addEventListener("click", () => {
    audio.unlock();
    if (started && !hud.consoleOpen && uiTeamMenu.classList.contains("hidden")) {
        glCanvas.requestPointerLock?.();
    }
});

window.addEventListener("mousedown", (e) => {
    if (document.pointerLockElement !== glCanvas) return;
    if (e.button === 0) mouseL = true;
    if (e.button === 2) {
        mouseR = true;
        const w = activePlayerWeapon();
        if (w && player.alive) {
            if (w.def.zoomFov) {
                scopeLevel = (scopeLevel + 1) % (w.def.zoomFov.length + 1);
                audio.play("sounds/weapons/zoom.wav", 0.5);
            } else if (w.def.silCap) {
                w.silenced = !w.silenced;
                vmAnim = w.silenced ? "add_silencer" : "detach_silencer";
                vmAnimTime = 0;
                audio.play(w.silenced ? "sounds/weapons/m4a1_silencer_on.wav" : "sounds/weapons/m4a1_silencer_off.wav", 0.6);
            } else if (w.def.burstCap) {
                w.burst = !w.burst;
                hud.showBanner(w.burst ? "Switched to Burst-Fire mode" : "Switched to Semi-Automatic", 1.2);
            } else if (w.def.melee) {
                fireActorWeapon(player, mover.eyePos(), false, true);
            }
        }
    }
});
window.addEventListener("mouseup", (e) => {
    if (e.button === 0) mouseL = false;
    if (e.button === 2) mouseR = false;
});
window.addEventListener("contextmenu", (e) => e.preventDefault());

window.addEventListener("mousemove", (e) => {
    if (document.pointerLockElement !== glCanvas || !started || !player.alive) return;
    const zoomScale = scopeLevel > 0 ? 0.4 : 1.0;
    mover.yaw   -= e.movementX * sensitivity * zoomScale;
    mover.pitch -= e.movementY * sensitivity * zoomScale;
    mover.pitch = Math.max(-89, Math.min(89, mover.pitch));
    player.yaw = mover.yaw;
    player.pitch = mover.pitch;
});

document.addEventListener("pointerlockchange", () => {
    const locked = document.pointerLockElement === glCanvas;
    uiClickPrompt.classList.toggle("hidden", locked || !started || !uiTeamMenu.classList.contains("hidden"));
});

// Escape opens Team/Map Menu when pointer isn't locked or from pause
window.addEventListener("keydown", (e) => {
    if (e.code === "KeyM" && started && !hud.consoleOpen) {
        document.exitPointerLock?.();
        uiTeamMenu.classList.toggle("hidden");
    }
});

// Team & Map UI Bindings
document.querySelectorAll(".team-btn[data-team]").forEach(btn => {
    btn.addEventListener("click", async () => {
        const chosenMap = uiMapSelect.value;
        if (chosenMap && chosenMap !== currentMapName) await loadMap(chosenMap);
        startMatch(btn.dataset.team, btn.dataset.skin);
    });
});
uiBtnResume.addEventListener("click", async () => {
    const chosenMap = uiMapSelect.value;
    if (chosenMap && chosenMap !== currentMapName) {
        await loadMap(chosenMap);
        startMatch(player.team, player.skin);
    } else {
        uiTeamMenu.classList.add("hidden");
        glCanvas.requestPointerLock?.();
    }
});

// Main Loop
let lastTs = performance.now();
let fpsSmooth = 60;
const tmpMat = new Float32Array(16);

function frame(ts) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0.001, (ts - lastTs) / 1000));
    lastTs = ts;
    const now = ts / 1000;
    fpsSmooth = fpsSmooth * 0.92 + (1 / dt) * 0.08;

    if (!mapData || !game) return;

    let speedUnits = 0;
    let progressBar = 0, progressLabel = "";
    const activeWep = activePlayerWeapon();

    if (started) {
        // Player movement & actions
        if (player.alive) {
            if (player.flashBlind > 0) player.flashBlind = Math.max(0, player.flashBlind - dt * 0.45);
            const frozen = game.freezeTime > 0 || hud.consoleOpen;
            const fwd = frozen ? 0 : ((keys.has("KeyW") ? 1 : 0) - (keys.has("KeyS") ? 1 : 0));
            const side = frozen ? 0 : ((keys.has("KeyD") ? 1 : 0) - (keys.has("KeyA") ? 1 : 0));
            const input = {
                fwd, side,
                jump: !frozen && keys.has("Space"),
                duck: !frozen && (keys.has("ControlLeft") || keys.has("KeyC")),
                walk: !frozen && (keys.has("ShiftLeft") || keys.has("ShiftRight")),
            };
            const maxSpd = activeWep ? (activeWep.def.spd || 250) : 250;
            const mv = mover.step(dt, input, scopeLevel > 0 ? maxSpd * 0.65 : maxSpd, audio);
            speedUnits = mv.speedUnits;
            if (mv.fallDamage > 0) applyDamage(player, null, mv.fallDamage, false, "Fall", mover.feetPos);

            player.feetPos = [...mover.feetPos];
            player.vel = [...mover.vel];
            player.ducking = mover.ducking;

            // Pickup dropped C4 or Primary weapon
            if (game.c4DroppedPos && player.team === "T" &&
                Math.hypot(player.feetPos[0]-game.c4DroppedPos[0], player.feetPos[2]-game.c4DroppedPos[2]) < 1.25) {
                game.pickupDroppedC4(player);
            }
            if (!player.primary) {
                for (let i = game.droppedWeapons.length - 1; i >= 0; i--) {
                    const dw = game.droppedWeapons[i];
                    if (Math.hypot(player.feetPos[0]-dw.pos[0], player.feetPos[2]-dw.pos[2]) < 1.15) {
                        player.primary = dw.instance;
                        game.droppedWeapons.splice(i, 1);
                        player.activeSlot = 1;
                        break;
                    }
                }
            }

            // Shooting
            const trigger = activeWep && activeWep.def.auto ? mouseL : (mouseL && !prevMouseL);
            if (!frozen && !hud.buyOpen && document.pointerLockElement === glCanvas && trigger) {
                fireActorWeapon(player, mover.eyePos(), false, false);
            }
            if (burstLeft > 0) {
                burstTimer -= dt;
                if (burstTimer <= 0) {
                    burstLeft--; burstTimer = 0.065;
                    player.nextFireTime = 0;
                    fireActorWeapon(player, mover.eyePos(), false, false);
                }
            }

            // Planting C4 (E or LMB with C4 inside site)
            const holdUse = keys.has("KeyE");
            if (!frozen && player.hasC4 && !game.c4Planted && game.isInsideBombsite(player.feetPos) &&
                (holdUse || (player.activeSlot === 5 && mouseL))) {
                game.plantProgress += dt;
                progressBar = game.plantProgress / 3.2;
                progressLabel = "PLANTING C4...";
                if (game.plantProgress >= 3.2) game.completePlant(player);
            } else if (!actors.some(a => a.isBot && a.planting)) {
                game.plantProgress = 0;
            }

            // Defusing C4 (CT holding E near planted C4)
            if (!frozen && player.team === "CT" && game.c4Planted && holdUse &&
                Math.hypot(player.feetPos[0]-game.c4Pos[0], player.feetPos[2]-game.c4Pos[2]) < 2.2) {
                const req = player.defuser ? 5.0 : 10.0;
                game.defuseProgress += dt / req;
                progressBar = game.defuseProgress;
                progressLabel = player.defuser ? "DEFUSING C4 (KIT)..." : "DEFUSING C4...";
                if (game.defuseProgress >= 1.0) game.completeDefuse(player);
            } else if (!actors.some(a => a.isBot && a.defusing)) {
                game.defuseProgress = 0;
            }
        }
        prevMouseL = mouseL;

        // Bots AI
        const botCtx = {
            game, physics, navNodes, actors, now,
            fireWeapon: (b, eye) => fireActorWeapon(b, eye, true, false),
            isOccludedBySmoke,
        };
        for (const a of actors) {
            if (a.isBot) updateBotAI(a, dt, botCtx);
        }

        finishReloads(now);
        fx.update(dt, physics, handleGrenadeEvent);
        game.update(dt, mover.eyePos(), mover.yaw, (pos, rad, dmg) => {
            fx.addExplosion(pos);
            applyExplosionDamage(pos, rad, dmg, game.c4Planter, "C4");
        });
    }

    // Recoil & Screen Shake Recovery
    punchPitch = Math.max(0, punchPitch - dt * 16.0);
    punchYaw *= Math.max(0, 1 - dt * 12.0);
    shakeAmp = Math.max(0, shakeAmp - dt * 7.0);
    vmFlash = Math.max(0, vmFlash - dt * 18.0);
    vmAnimTime += dt;

    // Camera (Alive FPS or Spectator orbit/follow)
    let camPos = mover.eyePos();
    let camYaw = mover.yaw + punchYaw + (Math.random()-0.5)*shakeAmp;
    let camPitch = mover.pitch + punchPitch + (Math.random()-0.5)*shakeAmp;
    let camFov = 90;

    if (started && !player.alive) {
        const specTarget = actors.find(a => a.alive && a.team === player.team) || actors.find(a => a.alive);
        if (specTarget) {
            camPos = [specTarget.feetPos[0], specTarget.feetPos[1] + 1.55, specTarget.feetPos[2]];
            camYaw = specTarget.yaw;
            camPitch = specTarget.pitch;
        }
    } else if (scopeLevel > 0 && activeWep && activeWep.def.zoomFov) {
        camFov = activeWep.def.zoomFov[scopeLevel - 1] || 40;
    }

    // World Models list (Bots + C4)
    const worldModels = [];
    for (const a of actors) {
        if (a === player) continue;
        if (!a.alive) continue;
        const m = new Float32Array(16);
        makeModelMat(a.feetPos, a.yaw, m);
        const moving = Math.hypot(a.vel[0], a.vel[2]) > 0.25;
        const pref = a.ducking ? (moving ? ["crouchrun", "crouch_aim"] : ["crouch_idle", "crouch_aim"]) : (moving ? ["run", "walk"] : ["idle1", "ref_aim"]);
        worldModels.push({ url: assetUrl(`models/player_${a.skin}.glb`), modelMat: m, animPrefixes: pref, animTime: a.animTime });
    }
    if (game.c4Planted || game.c4DroppedPos) {
        const m = new Float32Array(16);
        makeModelMat(game.c4Planted ? game.c4Pos : game.c4DroppedPos, 0, m);
        worldModels.push({ url: assetUrl("models/w_c4.glb"), modelMat: m, animPrefixes: ["idle"], animTime: 0 });
    }

    // Render 3D Scene (Whisk3D .w3dbsp + Skybox + GLB + FX)
    const reloadFrac = (now < player.reloadingUntil) ? Math.sin(((player.reloadingUntil - now) / (activeWep?.def.reload || 2)) * Math.PI) : 0;
    const vmUrl = activeWep ? assetUrl(activeWep.def.vm) : null;
    renderer.render(
        { pos: camPos, yaw: camYaw, pitch: camPitch, fov: camFov },
        {
            time: now,
            nvg: !!player.nvgOn,
            alive: player.alive && started,
            scoped: scopeLevel > 0,
            worldModels,
            fxRenderer: fx,
            c4LedPos: game.c4Planted ? game.c4Pos : null,
            c4LedOn: game.c4LedOn,
            viewmodel: vmUrl ? {
                url: vmUrl,
                mat: makeViewModelMat(punchPitch * 0.14, mover.bobPhase, speedUnits, reloadFrac),
                animPrefixes: [vmAnim, "idle1", "idle"],
                animTime: vmAnimTime,
                muzzleFlash: vmFlash,
            } : null,
        }
    );

    // 2D HUD & Telemetry
    if (started) {
        uiScCT.textContent = game.ctScore;
        uiScT.textContent  = game.tScore;
        const curSpdSpread = activeWep ? getSpread(player, activeWep, speedUnits, mover.onGround, mover.ducking) : 0.01;
        hud.draw2D(dt, {
            player, wep: activeWep, game, speedUnits, spread: curSpdSpread,
            scopeLevel, nvg: !!player.nvgOn,
            progressBar, progressLabel,
            radarActors: actors,
            mapMeta: mapData.meta,
            dynamicCrosshair,
        });
        hud.renderBuyMenu(player, tryBuyItem);
        hud.renderScoreboard(keys.has("Tab"), game, actors, currentMapName);
    }

    if (showTelemetry) {
        const st = renderer.stats;
        uiTelemetry.textContent = `Whisk3D .w3dbsp | ${currentMapName} | FPS:${fpsSmooth.toFixed(0)} | Cluster:${st.cluster} Leaves:${st.leaves} Draws:${st.draws} Tris:${st.tris} | Vel:${speedUnits.toFixed(0)} u/s`;
    }
}

async function init() {
    await detectAssetBase();
    const idxResp = await fetch(assetUrl("maps/index.json"));
    const idx = await idxResp.json();
    const mapList = Array.isArray(idx) ? idx : (idx.maps || []);
    for (const m of mapList) {
        const opt = document.createElement("option");
        opt.value = m.name;
        opt.textContent = `${m.name.toUpperCase()} (${m.bombsites} sites, ${m.spawnsCT}v${m.spawnsT})`;
        if (m.name === "de_dust2") opt.selected = true;
        uiMapSelect.appendChild(opt);
    }
    await Promise.all([loadMap("de_dust2"), preloadCoreAssets()]);
    conPrint("CS 1.5 Retail / Whisk3D Engine initialized. All 15 de_* maps ready.");
    requestAnimationFrame(frame);
}

init().catch(err => {
    console.error(err);
    uiTelemetry.textContent = `Error: ${err.message}`;
});
