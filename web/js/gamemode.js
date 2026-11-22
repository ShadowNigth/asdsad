// ============================================================================
//  gamemode.js — Reglas oficiales Counter-Strike 1.5 Bomb Defusal (de_*)
// ============================================================================
import { botAutoBuy } from "./bots.js";
import { createWeaponInstance } from "./weapons.js";

export class BombDefusalGame {
    constructor(mapMeta, physics, audio, onKillfeed, onBanner) {
        this.mapMeta = mapMeta;
        this.phys = physics;
        this.audio = audio;
        this.onKillfeed = onKillfeed;
        this.onBanner = onBanner;

        this.ctScore = 0;
        this.tScore = 0;
        this.roundNum = 0;
        this.tLossStreak = 0;
        this.ctLossStreak = 0;

        this.phase = "freezetime";
        this.freezeTime = 3.0;
        this.roundTime = 150.0;
        this.buyTime = 90.0;
        this.roundEndTimer = 0;

        this.c4Planted = false;
        this.c4Timer = 45.0;
        this.c4BeepAccum = 0;
        this.c4LedOn = false;
        this.c4Pos = [0, 0, 0];
        this.c4DroppedPos = null;
        this.c4Planter = null;

        this.plantProgress = 0;
        this.defuseProgress = 0;
        this.actors = [];
        this.droppedWeapons = [];
    }

    startRound(actors, resetAll = false) {
        this.actors = actors;
        this.roundNum++;
        this.phase = "freezetime";
        this.freezeTime = 3.0;
        this.roundTime = 150.0;
        this.buyTime = 90.0;
        this.roundEndTimer = 0;
        this.c4Planted = false;
        this.c4Timer = 45.0;
        this.c4DroppedPos = null;
        this.c4Planter = null;
        this.plantProgress = 0;
        this.defuseProgress = 0;
        this.droppedWeapons = [];

        if (resetAll) {
            this.ctScore = 0;
            this.tScore = 0;
            this.roundNum = 1;
            this.tLossStreak = 0;
            this.ctLossStreak = 0;
        }

        const spawnsT = this.mapMeta.spawnsT || [];
        const spawnsCT = this.mapMeta.spawnsCT || [];
        let ti = 0, cti = 0;
        const tActors = [];

        for (const a of actors) {
            if (a.team === "SPEC") { a.alive = false; continue; }
            const wasDead = !a.alive || resetAll;
            a.alive = true;
            a.hp = 100;
            a.vel = [0, 0, 0];
            a.ducking = false;
            a.hasC4 = false;
            a.flashBlind = 0;
            a.reloadingUntil = 0;
            a.path = [];
            a.goalSite = null;
            if (wasDead || resetAll) {
                a.armor = 0;
                a.helmet = false;
                a.defuser = false;
                a.primary = null;
                a.secondary = createWeaponInstance(a.team === "CT" ? "usp" : "glock18");
                a.activeSlot = 2;
                a.grenades = { he: 0, flash: 0, smoke: 0 };
                if (resetAll) a.money = 800;
            } else {
                // Reload surviving weapons
                if (a.primary) a.primary.clip = a.primary.def.clip;
                if (a.secondary) a.secondary.clip = a.secondary.def.clip;
            }

            const spList = a.team === "CT" ? spawnsCT : spawnsT;
            const sp = spList[(a.team === "CT" ? cti++ : ti++) % Math.max(1, spList.length)];
            if (sp) {
                a.feetPos = this.phys.placeOnFloor(sp.pos);
                a.yaw = sp.yaw || 0;
                a.pitch = 0;
            }
            if (a.team === "T") tActors.push(a);
            if (a.isBot) botAutoBuy(a);
        }

        // Give C4 to one Terrorist (prefer bot or human randomly)
        if (tActors.length > 0) {
            const carrier = tActors[this.roundNum % tActors.length];
            carrier.hasC4 = true;
        }

        if (this.audio) this.audio.play("sounds/radio/locknload.wav", 0.55);
    }

    isInsideBombsite(pos) {
        const sites = this.mapMeta.bombsites || [];
        for (const b of sites) {
            if (pos[0] >= b.min[0] - 0.5 && pos[0] <= b.max[0] + 0.5 &&
                pos[1] >= b.min[1] - 1.2 && pos[1] <= b.max[1] + 2.0 &&
                pos[2] >= b.min[2] - 0.5 && pos[2] <= b.max[2] + 0.5) {
                return b;
            }
        }
        return null;
    }

    isInsideBuyzone(actor) {
        if (this.buyTime <= 0) return false;
        const bz = this.mapMeta.buyzones || [];
        const teamId = actor.team === "T" ? 1 : 2;
        for (const z of bz) {
            if (z.team !== 0 && z.team !== teamId) continue;
            const p = actor.feetPos;
            if (p[0] >= z.min[0] - 1.0 && p[0] <= z.max[0] + 1.0 &&
                p[1] >= z.min[1] - 1.5 && p[1] <= z.max[1] + 2.0 &&
                p[2] >= z.min[2] - 1.0 && p[2] <= z.max[2] + 1.0) {
                return true;
            }
        }
        // Fallback near spawn if map lacks explicit buyzone brush
        const spList = actor.team === "CT" ? this.mapMeta.spawnsCT : this.mapMeta.spawnsT;
        for (const s of (spList || [])) {
            if (Math.hypot(actor.feetPos[0] - s.pos[0], actor.feetPos[2] - s.pos[2]) < 7.0) return true;
        }
        return false;
    }

    pickupDroppedC4(actor) {
        if (actor.team === "T" && actor.alive && this.c4DroppedPos) {
            actor.hasC4 = true;
            this.c4DroppedPos = null;
            if (!actor.isBot) this.onBanner("You picked up the C4!", 2.0);
        }
    }

    advanceBotPlant(bot, dt) {
        if (!bot.hasC4 || this.c4Planted) return;
        this.plantProgress += dt;
        if (this.plantProgress >= 3.2) {
            this.completePlant(bot);
        }
    }

    advanceBotDefuse(bot, dt) {
        if (!this.c4Planted) return;
        const req = bot.defuser ? 5.0 : 10.0;
        this.defuseProgress += dt / req;
        if (this.defuseProgress >= 1.0) {
            this.completeDefuse(bot);
        }
    }

    completePlant(planter) {
        planter.hasC4 = false;
        if (planter.activeSlot === 5) planter.activeSlot = planter.primary ? 1 : 2;
        this.c4Planted = true;
        this.phase = "planted";
        this.c4Timer = 45.0;
        this.c4BeepAccum = 0;
        this.c4Pos = [...planter.feetPos];
        this.c4Planter = planter;
        this.plantProgress = 0;
        planter.money = Math.min(16000, planter.money + 300);
        if (this.audio) this.audio.play("sounds/radio/bombpl.wav", 0.75);
        this.onBanner("The bomb has been planted!", 3.0);
    }

    completeDefuse(defuser) {
        this.c4Planted = false;
        this.defuseProgress = 0;
        defuser.money = Math.min(16000, defuser.money + 300);
        if (this.audio) this.audio.play("sounds/radio/bombdef.wav", 0.75);
        this.endRound("CT", "Bomb has been defused!", 3500);
    }

    onActorKilled(victim, attacker, weaponName, isHeadshot) {
        victim.alive = false;
        victim.deaths++;
        victim.deathTime = 0;
        if (victim.hasC4) {
            victim.hasC4 = false;
            this.c4DroppedPos = [...victim.feetPos];
        }
        if (victim.primary) {
            this.droppedWeapons.push({ id: victim.primary.id, instance: victim.primary, pos: [...victim.feetPos] });
            victim.primary = null;
        }
        if (attacker && attacker !== victim) {
            if (attacker.team !== victim.team) {
                attacker.kills++;
                attacker.money = Math.min(16000, attacker.money + (weaponName === "Knife" ? 1500 : 300));
            } else {
                attacker.money = Math.max(0, attacker.money - 300);
            }
        }
        this.onKillfeed(attacker ? attacker.name : "World", attacker ? attacker.team : "", victim.name, victim.team, weaponName, isHeadshot);
    }

    endRound(winner, reason, reward) {
        if (this.phase === "roundend") return;
        this.phase = "roundend";
        this.roundEndTimer = 4.5;

        if (winner === "CT") {
            this.ctScore++;
            this.ctLossStreak = 0;
            this.tLossStreak = Math.min(4, this.tLossStreak + 1);
            if (this.audio) setTimeout(() => this.audio.play("sounds/radio/ctwin.wav", 0.7), 600);
        } else if (winner === "T") {
            this.tScore++;
            this.tLossStreak = 0;
            this.ctLossStreak = Math.min(4, this.ctLossStreak + 1);
            if (this.audio) setTimeout(() => this.audio.play("sounds/radio/terwin.wav", 0.7), 600);
        }

        const lossBonusT = 1400 + this.tLossStreak * 500;
        const lossBonusCT = 1400 + this.ctLossStreak * 500;
        for (const a of this.actors) {
            if (a.team === winner) a.money = Math.min(16000, a.money + reward);
            else if (a.team === "T") a.money = Math.min(16000, a.money + lossBonusT);
            else if (a.team === "CT") a.money = Math.min(16000, a.money + lossBonusCT);
        }
        this.onBanner(`${winner === "CT" ? "Counter-Terrorists" : "Terrorists"} Win! — ${reason}`, 4.2);
    }

    update(dt, listenerPos, listenerYaw, onExplosion) {
        if (this.phase === "freezetime") {
            this.freezeTime -= dt;
            if (this.freezeTime <= 0) {
                this.freezeTime = 0;
                this.phase = "live";
                if (this.audio) this.audio.play("sounds/radio/letsgo.wav", 0.6);
            }
            return;
        }

        if (this.buyTime > 0) this.buyTime = Math.max(0, this.buyTime - dt);

        if (this.phase === "roundend") {
            this.roundEndTimer -= dt;
            if (this.roundEndTimer <= 0) {
                this.startRound(this.actors, false);
            }
            return;
        }

        // Check team elimination
        let aliveCT = 0, aliveT = 0;
        for (const a of this.actors) {
            if (!a.alive) continue;
            if (a.team === "CT") aliveCT++;
            else if (a.team === "T") aliveT++;
        }

        if (this.c4Planted) {
            this.c4Timer -= dt;
            const interval = Math.max(0.14, (this.c4Timer / 45.0) * 1.05);
            this.c4BeepAccum += dt;
            this.c4LedOn = (this.c4BeepAccum < 0.09);
            if (this.c4BeepAccum >= interval) {
                this.c4BeepAccum = 0;
                const idx = this.c4Timer < 6 ? 5 : this.c4Timer < 14 ? 4 : this.c4Timer < 25 ? 3 : 2;
                if (this.audio) this.audio.play3D(`sounds/weapons/c4_beep${idx}.wav`, this.c4Pos, listenerPos, listenerYaw, 45, 0.9);
            }
            if (this.c4Timer <= 0) {
                this.c4Planted = false;
                if (this.audio) this.audio.play3D("sounds/weapons/c4_explode1.wav", this.c4Pos, listenerPos, listenerYaw, 90, 1.0);
                if (onExplosion) onExplosion(this.c4Pos, 35.0, 480);
                this.endRound("T", "Target Successfully Bombed!", 3500);
                return;
            }
            if (aliveCT === 0 && this.actors.some(a => a.team === "CT")) {
                // C4 will explode or T wins
                this.endRound("T", "All Counter-Terrorists eliminated!", 3250);
                return;
            }
        } else {
            this.roundTime -= dt;
            if (aliveT === 0 && this.actors.some(a => a.team === "T")) {
                this.endRound("CT", "All Terrorists eliminated!", 3250);
                return;
            }
            if (aliveCT === 0 && this.actors.some(a => a.team === "CT")) {
                this.endRound("T", "All Counter-Terrorists eliminated!", 3250);
                return;
            }
            if (this.roundTime <= 0) {
                this.endRound("CT", "Target has been saved!", 3250);
            }
        }
    }
}
