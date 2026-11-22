// ============================================================================
//  hud.js — HUD autentico Counter-Strike 1.5 (Radar, Mira Dinamica, Scope,
//  Killfeed, Buy Menu, Team Menu, Scoreboard, Consola ~).
// ============================================================================
import { BUY_MENU, WEAPONS } from "./weapons.js";

export class CSHud {
    constructor() {
        this.canvas = document.getElementById("hudCanvas");
        this.ctx = this.canvas.getContext("2d");
        this.killfeed = [];
        this.bannerText = "";
        this.bannerTimer = 0;
        this.damageFlash = 0;

        this.elBuy = document.getElementById("buyMenu");
        this.elScore = document.getElementById("scoreboard");
        this.elConsole = document.getElementById("consolePanel");
        this.buyPage = 0;
        this.buyOpen = false;
        this.consoleOpen = false;
    }

    addKillfeed(att, attTeam, vic, vicTeam, wep, hs) {
        this.killfeed.unshift({ att, attTeam, vic, vicTeam, wep, hs, ttl: 5.5 });
        if (this.killfeed.length > 6) this.killfeed.pop();
    }

    showBanner(text, dur = 3.0) {
        this.bannerText = text;
        this.bannerTimer = dur;
    }

    openBuyMenu(page = 0) {
        this.buyOpen = true;
        this.buyPage = page;
        this.elBuy.classList.remove("hidden");
    }

    closeBuyMenu() {
        this.buyOpen = false;
        this.elBuy.classList.add("hidden");
    }

    renderBuyMenu(actor, onBuyAction) {
        if (!this.buyOpen) return;
        const page = BUY_MENU[this.buyPage] || BUY_MENU[0];
        let html = `<div class="buy-title">CS 1.5 — ${page.title} <span class="buy-money">$${actor.money}</span></div>`;
        html += `<div class="buy-list">`;
        for (const it of page.items) {
            if (it.team && it.team !== actor.team) continue;
            let label = it.label;
            let price = it.price;
            let owned = false;
            if (it.id) {
                const w = WEAPONS[it.id];
                if (w.team !== "BOTH" && w.team !== actor.team) continue;
                label = `${it.key}. ${w.name}`;
                price = w.price;
            } else if (it.action) {
                label = `${it.key}. ${it.label}`;
            }
            const canAfford = price === undefined || actor.money >= price;
            html += `<button class="buy-item ${canAfford ? "" : "disabled"}" data-key="${it.key}">
                <span>${label}</span>
                ${price !== undefined ? `<span class="buy-price">$${price}</span>` : `<span class="buy-price">&gt;</span>`}
            </button>`;
        }
        html += `</div><div class="buy-foot">[0] ${this.buyPage === 0 ? "Exit" : "Back"} &nbsp;|&nbsp; [F1] Autobuy</div>`;
        this.elBuy.innerHTML = html;
        this.elBuy.querySelectorAll(".buy-item").forEach(btn => {
            btn.onclick = () => onBuyAction(btn.dataset.key);
        });
    }

    renderScoreboard(visible, game, actors, mapName) {
        if (!visible) { this.elScore.classList.add("hidden"); return; }
        this.elScore.classList.remove("hidden");
        const cts = actors.filter(a => a.team === "CT").sort((a,b) => b.kills - a.kills);
        const ts  = actors.filter(a => a.team === "T").sort((a,b) => b.kills - a.kills);
        const rows = (list, cls) => list.map(a => `
            <tr class="${cls} ${a.alive ? "" : "dead"}">
                <td>${a.name}${!a.isBot ? " (YOU)" : ""}</td>
                <td>${a.alive ? (a.hasC4 ? "BOMB" : a.defuser ? "KIT" : "") : "DEAD"}</td>
                <td>$${a.money}</td>
                <td>${a.kills}</td>
                <td>${a.deaths}</td>
            </tr>`).join("");

        this.elScore.innerHTML = `
            <div class="sb-head">COUNTER-STRIKE 1.5 — ${mapName.toUpperCase()} &nbsp;|&nbsp; Round ${game.roundNum}</div>
            <div class="sb-cols">
                <div>
                    <div class="sb-team ct">Counter-Terrorists — ${game.ctScore}</div>
                    <table><tr><th>Player</th><th>Status</th><th>$</th><th>K</th><th>D</th></tr>${rows(cts, "ct")}</table>
                </div>
                <div>
                    <div class="sb-team t">Terrorists — ${game.tScore}</div>
                    <table><tr><th>Player</th><th>Status</th><th>$</th><th>K</th><th>D</th></tr>${rows(ts, "t")}</table>
                </div>
            </div>`;
    }

    draw2D(dt, state) {
        const c = this.canvas;
        const w = c.width = c.clientWidth;
        const h = c.height = c.clientHeight;
        const ctx = this.ctx;
        ctx.clearRect(0, 0, w, h);

        if (this.bannerTimer > 0) this.bannerTimer -= dt;
        if (this.damageFlash > 0) this.damageFlash = Math.max(0, this.damageFlash - dt * 2.5);
        for (let i = this.killfeed.length - 1; i >= 0; i--) {
            this.killfeed[i].ttl -= dt;
            if (this.killfeed[i].ttl <= 0) this.killfeed.splice(i, 1);
        }

        const { player, wep, game, speedUnits, spread, scopeLevel, nvg, progressBar, radarActors, mapMeta } = state;

        // 1. Flashbang whiteout
        if (player.flashBlind > 0.01) {
            ctx.fillStyle = `rgba(255,255,255,${Math.min(0.98, player.flashBlind)})`;
            ctx.fillRect(0, 0, w, h);
        }

        // 2. Damage vignette
        if (this.damageFlash > 0.01) {
            ctx.fillStyle = `rgba(210,15,15,${this.damageFlash * 0.35})`;
            ctx.fillRect(0, 0, w, h);
        }

        // 3. Sniper Scope Overlay
        const cx = w * 0.5, cy = h * 0.5;
        if (player.alive && scopeLevel > 0 && wep && wep.def.sniper) {
            const rad = Math.min(w, h) * 0.41;
            ctx.fillStyle = "#000";
            ctx.beginPath();
            ctx.rect(0, 0, w, h);
            ctx.arc(cx, cy, rad, 0, Math.PI * 2, true);
            ctx.fill();

            ctx.strokeStyle = "rgba(0,0,0,0.92)";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(cx - rad, cy); ctx.lineTo(cx + rad, cy);
            ctx.moveTo(cx, cy - rad); ctx.lineTo(cx, cy + rad);
            ctx.stroke();

            ctx.fillStyle = "#e01b1b";
            ctx.beginPath();
            ctx.arc(cx, cy, 2.2, 0, Math.PI * 2);
            ctx.fill();
        } else if (player.alive && !this.buyOpen) {
            // Classic CS 1.5 Dynamic Green Crosshair
            const gap = Math.max(4, Math.min(28, 4 + spread * 460 + (state.dynamicCrosshair ? speedUnits * 0.032 : 0)));
            const len = 8;
            ctx.strokeStyle = "rgba(80, 255, 80, 0.88)";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(cx - gap - len, cy); ctx.lineTo(cx - gap, cy);
            ctx.moveTo(cx + gap, cy);       ctx.lineTo(cx + gap + len, cy);
            ctx.moveTo(cx, cy - gap - len); ctx.lineTo(cx, cy - gap);
            ctx.moveTo(cx, cy + gap);       ctx.lineTo(cx, cy + gap + len);
            ctx.stroke();
        }

        // 4. CS 1.5 Radar (top-left)
        const rX = 76, rY = 76, rR = 60;
        ctx.save();
        ctx.beginPath();
        ctx.arc(rX, rY, rR, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(18, 44, 24, 0.56)";
        ctx.fill();
        ctx.strokeStyle = "rgba(130, 210, 140, 0.65)";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.clip();

        // Cross lines
        ctx.strokeStyle = "rgba(130,210,140,0.22)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(rX - rR, rY); ctx.lineTo(rX + rR, rY);
        ctx.moveTo(rX, rY - rR); ctx.lineTo(rX, rY + rR);
        ctx.stroke();

        const yr = (player.yaw * Math.PI) / 180;
        const fx = Math.cos(yr), fz = -Math.sin(yr);
        const rx = Math.sin(yr), rz = Math.cos(yr);
        const radarScale = 1.45;

        const plotDot = (worldPos, color, sz = 3.5, label = "") => {
            const dx = worldPos[0] - player.feetPos[0];
            const dz = worldPos[2] - player.feetPos[2];
            const px = (dx * rx + dz * rz) * radarScale;
            const py = -(dx * fx + dz * fz) * radarScale;
            const d = Math.hypot(px, py);
            const clamp = d > rR - 6 ? (rR - 6) / d : 1;
            const sx = rX + px * clamp, sy = rY + py * clamp;
            ctx.fillStyle = color;
            ctx.fillRect(sx - sz * 0.5, sy - sz * 0.5, sz, sz);
            if (label) {
                ctx.font = "bold 10px monospace";
                ctx.fillText(label, sx + 4, sy + 3);
            }
        };

        for (const site of (mapMeta.bombsites || [])) {
            const cpos = site.center || [(site.min[0]+site.max[0])*0.5, site.min[1], (site.min[2]+site.max[2])*0.5];
            plotDot(cpos, "#ffb820", 4, site.id || site.name || "B");
        }
        for (const a of radarActors) {
            if (!a.alive || a === player || a.team !== player.team) continue;
            plotDot(a.feetPos, a.team === "CT" ? "#4eb8ff" : "#ff9b30", 4.5);
        }
        if (game.c4Planted) {
            if (Math.floor(performance.now() / 220) % 2 === 0) plotDot(game.c4Pos, "#ff2222", 6, "C4");
        } else if (game.c4DroppedPos && player.team === "T") {
            plotDot(game.c4DroppedPos, "#ff4040", 5, "C4");
        }
        ctx.restore();

        // 5. Killfeed (top-right)
        ctx.font = "bold 13px 'Trebuchet MS', sans-serif";
        ctx.textAlign = "right";
        let ky = 26;
        for (const k of this.killfeed) {
            const ac = k.attTeam === "CT" ? "#7ec8ff" : k.attTeam === "T" ? "#ff7755" : "#ddd";
            const vc = k.vicTeam === "CT" ? "#7ec8ff" : "#ff7755";
            const msg = `${k.att}  [${k.wep}${k.hs ? " HS" : ""}]  ${k.vic}`;
            const tw = ctx.measureText(msg).width;
            ctx.fillStyle = "rgba(0,0,0,0.52)";
            ctx.fillRect(w - tw - 24, ky - 14, tw + 14, 19);
            ctx.fillStyle = "#f2c14e";
            ctx.fillText(msg, w - 16, ky);
            // Tiny team indicator bars
            ctx.fillStyle = ac; ctx.fillRect(w - tw - 24, ky - 14, 3, 19);
            ctx.fillStyle = vc; ctx.fillRect(w - 10, ky - 14, 3, 19);
            ky += 22;
        }

        // 6. Center Banner & Plant/Defuse Progress Bar
        ctx.textAlign = "center";
        if (this.bannerTimer > 0 && this.bannerText) {
            ctx.font = "bold 20px 'Trebuchet MS', sans-serif";
            const bw = ctx.measureText(this.bannerText).width + 36;
            ctx.fillStyle = "rgba(0,0,0,0.68)";
            ctx.fillRect(cx - bw*0.5, h * 0.24 - 22, bw, 34);
            ctx.fillStyle = "#ffbb33";
            ctx.fillText(this.bannerText, cx, h * 0.24 + 2);
        }
        if (progressBar > 0) {
            const pw = 240, ph = 14;
            ctx.fillStyle = "rgba(0,0,0,0.72)";
            ctx.fillRect(cx - pw*0.5, h * 0.65, pw, ph);
            ctx.fillStyle = "#ffaa22";
            ctx.fillRect(cx - pw*0.5 + 2, h * 0.65 + 2, (pw - 4) * Math.min(1, progressBar), ph - 4);
            ctx.font = "bold 12px monospace";
            ctx.fillStyle = "#fff";
            ctx.fillText(state.progressLabel || "WORKING...", cx, h * 0.65 - 6);
        }

        // 7. Bottom CS 1.5 Amber HUD
        const amber = "#ffb822";
        const hudY = h - 22;
        ctx.font = "bold 28px 'Courier New', monospace";
        ctx.textAlign = "left";
        const hpCol = player.hp <= 25 ? "#ff3838" : amber;
        ctx.fillStyle = hpCol;
        ctx.fillText(`+ ${Math.max(0, Math.ceil(player.hp))}`, 24, hudY);
        ctx.fillStyle = amber;
        ctx.fillText(`🛡 ${Math.ceil(player.armor)}${player.helmet ? "H" : ""}`, 152, hudY);

        // Status icons (Buyzone / C4 / Defuser / NVG)
        ctx.font = "bold 13px monospace";
        let iy = h - 72;
        if (state.inBuyzone) {
            ctx.fillStyle = "#66ff66";
            ctx.fillText("[B] BUYZONE", 24, iy); iy -= 18;
        }
        if (player.hasC4) {
            ctx.fillStyle = "#ff5544";
            ctx.fillText("[5] C4 BOMB", 24, iy); iy -= 18;
        }
        if (player.defuser) {
            ctx.fillStyle = "#66ccff";
            ctx.fillText("DEFUSAL KIT", 24, iy); iy -= 18;
        }
        if (nvg) {
            ctx.fillStyle = "#44ff44";
            ctx.fillText("NVG ON [N]", 24, iy);
        }

        // Round Timer (bottom-center)
        ctx.textAlign = "center";
        ctx.font = "bold 24px 'Courier New', monospace";
        const sec = game.c4Planted ? Math.ceil(game.c4Timer) : Math.ceil(game.freezeTime > 0 ? game.freezeTime : game.roundTime);
        const mm = Math.floor(sec / 60), ss = String(sec % 60).padStart(2, "0");
        ctx.fillStyle = game.c4Planted ? (Math.floor(performance.now() / 250) % 2 === 0 ? "#ff3333" : "#ffaa22") : amber;
        ctx.fillText(game.c4Planted ? `C4  ${mm}:${ss}` : `${mm}:${ss}`, cx, hudY);

        // Money & Ammo (bottom-right)
        ctx.textAlign = "right";
        ctx.font = "bold 22px 'Courier New', monospace";
        ctx.fillStyle = "#69e869";
        ctx.fillText(`$${player.money}`, w - 24, hudY - 32);

        if (wep) {
            ctx.font = "bold 28px 'Courier New', monospace";
            ctx.fillStyle = amber;
            const ammoText = wep.def.clip > 0 ? `${wep.clip} | ${wep.reserve}` : (wep.def.grenade ? `${player.grenades[wep.def.grenade]}` : wep.def.name);
            ctx.fillText(ammoText, w - 24, hudY);
            ctx.font = "bold 12px sans-serif";
            ctx.fillStyle = "rgba(255,200,100,0.85)";
            const modeTag = wep.silenced ? " [SILENCED]" : (wep.burst ? " [BURST]" : "");
            ctx.fillText(wep.def.name + modeTag, w - 24, hudY + 14);
        }
    }
}
