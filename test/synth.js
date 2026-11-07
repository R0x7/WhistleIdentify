// Synthesises a realistic-ish whistle for a note list, for testing.
'use strict';

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
function gauss(r) { return Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r()); }

/**
 * notes: [{pitch (MIDI), dur (beats)}]
 * opts: { sr, secPerBeat, detune (st sd), noise (amplitude), slurProb, seed }
 */
function whistle(notes, opts) {
  const o = Object.assign({ sr: 48000, secPerBeat: 0.4, detune: 0.25, noise: 0.01, slurProb: 0.3, seed: 1, drift: 0.5 }, opts);
  const r = rng(o.seed);
  const total = notes.reduce((a, n) => a + n.dur * o.secPerBeat, 0) + 0.6;
  const out = new Float32Array(Math.ceil(total * o.sr));
  let t = 0.3, phase = 0;
  let prevF = null;
  for (let i = 0; i < notes.length; i++) {
    const n = notes[i];
    const len = n.dur * o.secPerBeat * (1 + 0.12 * gauss(r));
    const drift = o.drift * (t / total); // slow pitch drift over the take
    const f = 440 * Math.pow(2, (n.pitch + drift + o.detune * gauss(r) - 69) / 12);
    const repeat = i > 0 && notes[i - 1].pitch === n.pitch;
    const slur = !repeat && r() < o.slurProb;          // glide in from previous note
    const gap = slur ? 0 : 0.04 + 0.04 * r();           // articulation silence
    const s0 = Math.floor((t + gap) * o.sr), s1 = Math.floor((t + Math.max(len, gap + 0.07)) * o.sr);
    const glide = slur && prevF ? 0.04 : 0;
    for (let k = s0; k < s1 && k < out.length; k++) {
      const tt = (k - s0) / o.sr;
      let ff = f * Math.pow(2, (0.12 * Math.sin(2 * Math.PI * 5.5 * tt)) / 12);
      if (glide && tt < glide) ff = prevF + (ff - prevF) * (tt / glide);
      phase += (2 * Math.PI * ff) / o.sr;
      const env = Math.min(1, tt / 0.015, (s1 - k) / o.sr / 0.015);
      out[k] += 0.3 * env * Math.sin(phase) + 0.02 * env * Math.sin(2 * phase);
    }
    prevF = f;
    t += len;
  }
  for (let k = 0; k < out.length; k++) out[k] += o.noise * gauss(r);
  return out;
}

module.exports = { whistle, rng, gauss };
