// Web Audio engine: a gliding "theremin" voice for terrain, a filtered-noise
// "wash" for water, and short sonar pings for earthquakes.

export class MapAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  /** Must be called from a user gesture (browsers block audio until then). */
  async start() {
    if (this.ctx) { await this.ctx.resume(); return; }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx();
    const c = this.ctx;

    this.master = c.createGain();
    this.master.gain.value = 0.8;
    // Gentle limiter so overlapping pings never clip.
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -12; comp.ratio.value = 6;
    this.master.connect(comp).connect(c.destination);

    // Terrain voice: triangle + quiet sine an octave up, through a panner.
    this.terrainPan = c.createStereoPanner();
    this.terrainGain = c.createGain();
    this.terrainGain.gain.value = 0;
    this.osc = c.createOscillator(); this.osc.type = "triangle";
    this.osc2 = c.createOscillator(); this.osc2.type = "sine";
    const o2g = c.createGain(); o2g.gain.value = 0.25;
    this.osc.connect(this.terrainGain);
    this.osc2.connect(o2g).connect(this.terrainGain);
    this.terrainGain.connect(this.terrainPan).connect(this.master);
    this.osc.start(); this.osc2.start();

    // Water voice: looped noise through a slow-moving lowpass filter.
    const len = c.sampleRate * 2;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; } // brown noise
    this.noise = c.createBufferSource(); this.noise.buffer = buf; this.noise.loop = true;
    this.waterFilter = c.createBiquadFilter(); this.waterFilter.type = "lowpass"; this.waterFilter.frequency.value = 500;
    const lfo = c.createOscillator(); lfo.frequency.value = 0.18;
    const lfoGain = c.createGain(); lfoGain.gain.value = 260;
    lfo.connect(lfoGain).connect(this.waterFilter.frequency); lfo.start();
    this.waterGain = c.createGain(); this.waterGain.gain.value = 0;
    this.noise.connect(this.waterFilter).connect(this.waterGain).connect(this.terrainPan);
    this.noise.start();
  }

  get ready() { return !!this.ctx; }

  setMuted(m) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05);
  }

  /** Glide the terrain voice to a new pitch, or cross-fade to water. */
  terrain({ freq, pan, water }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.terrainPan.pan.setTargetAtTime(pan, t, 0.05);
    if (water) {
      this.terrainGain.gain.setTargetAtTime(0, t, 0.06);
      this.waterGain.gain.setTargetAtTime(0.35, t, 0.08);
    } else {
      this.osc.frequency.setTargetAtTime(freq, t, 0.06);
      this.osc2.frequency.setTargetAtTime(freq * 2, t, 0.06);
      this.waterGain.gain.setTargetAtTime(0, t, 0.06);
      this.terrainGain.gain.setTargetAtTime(0.22, t, 0.04);
    }
  }

  /** Fade the continuous voices out (pointer left the map, etc.). */
  silence() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.terrainGain.gain.setTargetAtTime(0, t, 0.08);
    this.waterGain.gain.setTargetAtTime(0, t, 0.08);
  }

  /** One short percussive note, scheduled `delayS` seconds from now. */
  ping({ freq, pan, gain, delayS = 0, dur = 0.35, type = "sine" }) {
    if (!this.ctx) return;
    const c = this.ctx, t0 = c.currentTime + delayS;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t0);
    o.frequency.exponentialRampToValueAtTime(freq * 0.92, t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    const p = c.createStereoPanner(); p.pan.setValueAtTime(pan, t0);
    o.connect(g).connect(p).connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  /** Soft click used as the sonar "send" before the echoes come back. */
  sonarSend() { this.ping({ freq: 2400, pan: 0, gain: 0.12, dur: 0.12, type: "square" }); }

  /** Water sample inside a profile sweep: a short burst of filtered noise. */
  splash({ pan, delayS }) {
    if (!this.ctx) return;
    const c = this.ctx, t0 = c.currentTime + delayS;
    const src = c.createBufferSource(); src.buffer = this.noise.buffer;
    const f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 700;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.3, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.12);
    const p = c.createStereoPanner(); p.pan.value = pan;
    src.connect(f).connect(g).connect(p).connect(this.master);
    src.start(t0, Math.random()); src.stop(t0 + 0.15);
  }
}
