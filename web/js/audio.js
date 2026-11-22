// ============================================================================
//  audio.js — Motor WebAudio CS 1.5 con cache de WAVs reales, atenuacion 3D,
//  paneo estereo y zumbido de Flashbang.
// ============================================================================
export class AudioEngine {
    constructor() {
        this.ctx = null;
        this.master = null;
        this.buffers = new Map();
        this.pending = new Map();
        this.muted = false;
        this.volume = 0.7;
    }

    unlock() {
        if (!this.ctx) {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return;
            this.ctx = new AC();
            this.master = this.ctx.createGain();
            this.master.gain.value = this.volume;
            this.master.connect(this.ctx.destination);
        }
        if (this.ctx.state === "suspended") {
            this.ctx.resume().catch(() => {});
        }
    }

    async _getBuffer(relPath) {
        if (!this.ctx) return null;
        if (this.buffers.has(relPath)) return this.buffers.get(relPath);
        if (this.pending.has(relPath)) return this.pending.get(relPath);

        const p = (async () => {
            try {
                const resp = await fetch(`assets/${relPath}`);
                if (!resp.ok) return null;
                const ab = await resp.arrayBuffer();
                const buf = await this.ctx.decodeAudioData(ab);
                this.buffers.set(relPath, buf);
                return buf;
            } catch {
                return null;
            } finally {
                this.pending.delete(relPath);
            }
        })();
        this.pending.set(relPath, p);
        return p;
    }

    preload(paths) {
        if (!this.ctx) return;
        for (const p of paths) this._getBuffer(p);
    }

    play(relPath, vol = 0.7, rate = 1.0) {
        if (this.muted || !this.ctx || !relPath) return;
        this._getBuffer(relPath).then(buf => {
            if (!buf || !this.ctx) return;
            const src = this.ctx.createBufferSource();
            src.buffer = buf;
            src.playbackRate.value = rate;
            const g = this.ctx.createGain();
            g.gain.value = vol;
            src.connect(g);
            g.connect(this.master);
            src.start();
        });
    }

    play3D(relPath, srcPos, listenerPos, listenerYawDeg, maxDist = 42.0, vol = 0.85) {
        if (this.muted || !this.ctx || !relPath) return;
        const dx = srcPos[0] - listenerPos[0];
        const dy = srcPos[1] - listenerPos[1];
        const dz = srcPos[2] - listenerPos[2];
        const dist = Math.hypot(dx, dy, dz);
        if (dist > maxDist) return;
        const atten = Math.max(0.0, 1.0 - dist / maxDist);
        const gainVal = vol * atten * atten;
        if (gainVal < 0.015) return;

        // Stereo pan relative to listener right vector
        const yr = (listenerYawDeg * Math.PI) / 180.0;
        const rx = Math.sin(yr), rz = Math.cos(yr);
        const panVal = dist > 0.2 ? Math.max(-1, Math.min(1, (dx * rx + dz * rz) / dist)) : 0;

        this._getBuffer(relPath).then(buf => {
            if (!buf || !this.ctx) return;
            const src = this.ctx.createBufferSource();
            src.buffer = buf;
            const g = this.ctx.createGain();
            g.gain.value = gainVal;
            if (this.ctx.createStereoPanner) {
                const pan = this.ctx.createStereoPanner();
                pan.pan.value = panVal;
                src.connect(g);
                g.connect(pan);
                pan.connect(this.master);
            } else {
                src.connect(g);
                g.connect(this.master);
            }
            src.start();
        });
    }

    playFlashRing(intensity = 1.0) {
        if (this.muted || !this.ctx) return;
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = 3450;
        const now = this.ctx.currentTime;
        g.gain.setValueAtTime(0.18 * intensity, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 2.8 * intensity);
        osc.connect(g);
        g.connect(this.master);
        osc.start(now);
        osc.stop(now + 2.8 * intensity);
    }
}
