/*
 * Pitch tracking + note segmentation for whistled melodies.
 *
 * Whistling is close to a pure sine wave (roughly 500–4000 Hz), which makes it
 * a great fit for the YIN fundamental-frequency estimator. We run YIN on short
 * overlapping frames, then group stable runs of pitch into discrete notes.
 */
(function (root) {
  'use strict';
  const WI = (root.WI = root.WI || {});

  const MIN_FREQ = 350;   // Hz – lowest pitch we consider a whistle
  const MAX_FREQ = 4500;  // Hz – highest

  function freqToMidi(f) { return 69 + 12 * Math.log2(f / 440); }
  function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  function median(arr) {
    if (!arr.length) return NaN;
    const s = Array.from(arr).sort((a, b) => a - b);
    const mid = s.length >> 1;
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }

  function percentile(arr, q) {
    if (!arr.length) return 0;
    const s = Array.from(arr).sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.floor(q * s.length))];
  }

  /**
   * YIN pitch estimate for x[offset .. offset + W + tauMax].
   * Returns { freq, aper } (aper = aperiodicity, 0 = perfectly periodic) or null.
   */
  function yin(x, offset, W, tauMin, tauMax, sr, d) {
    d[0] = 1;
    let running = 0;
    for (let tau = 1; tau <= tauMax; tau++) {
      let s = 0;
      const o2 = offset + tau;
      for (let j = 0; j < W; j++) {
        const diff = x[offset + j] - x[o2 + j];
        s += diff * diff;
      }
      running += s;
      d[tau] = running > 0 ? (s * tau) / running : 1;
    }
    const THRESH = 0.15;
    let tau = -1;
    for (let t = tauMin; t < tauMax; t++) {
      if (d[t] < THRESH) {
        while (t + 1 < tauMax && d[t + 1] < d[t]) t++;
        tau = t;
        break;
      }
    }
    if (tau < 0) {
      let mi = tauMin;
      for (let t = tauMin + 1; t < tauMax; t++) if (d[t] < d[mi]) mi = t;
      if (d[mi] > 0.4) return null;
      tau = mi;
    }
    let shift = 0;
    if (tau > 1 && tau < tauMax) {
      const a = d[tau - 1], b = d[tau], c = d[tau + 1];
      const den = a - 2 * b + c;
      if (den > 0) shift = Math.max(-1, Math.min(1, (a - c) / (2 * den)));
    }
    return { freq: sr / (tau + shift), aper: d[tau] };
  }

  /**
   * Incremental pitch tracker. Push audio chunks in; frames come out every
   * `hop` seconds: { t, freq (Hz or 0), aper, rms }.
   */
  class Tracker {
    constructor(sampleRate) {
      this.sr = sampleRate;
      this.hopSec = 0.01;
      this.hop = Math.round(sampleRate * this.hopSec);
      this.W = Math.round(sampleRate * 0.012);
      this.tauMin = Math.max(2, Math.floor(sampleRate / MAX_FREQ));
      this.tauMax = Math.ceil(sampleRate / MIN_FREQ);
      this.need = this.W + this.tauMax + 2;
      this.buf = new Float32Array(Math.max(this.need * 4, 16384));
      this.len = 0;          // valid samples in buf
      this.consumed = 0;     // absolute sample index of buf[0]
      this.d = new Float32Array(this.tauMax + 2);
      this.frames = [];
    }

    push(chunk) {
      if (this.len + chunk.length > this.buf.length) {
        const nb = new Float32Array(Math.max(this.buf.length * 2, this.len + chunk.length));
        nb.set(this.buf.subarray(0, this.len));
        this.buf = nb;
      }
      this.buf.set(chunk, this.len);
      this.len += chunk.length;

      const out = [];
      let pos = 0;
      while (pos + this.need <= this.len) {
        let e = 0;
        for (let j = 0; j < this.W; j++) { const v = this.buf[pos + j]; e += v * v; }
        const rms = Math.sqrt(e / this.W);
        let freq = 0, aper = 1;
        if (rms > 1e-4) {
          const r = yin(this.buf, pos, this.W, this.tauMin, this.tauMax, this.sr, this.d);
          if (r && r.freq >= MIN_FREQ && r.freq <= MAX_FREQ) { freq = r.freq; aper = r.aper; }
        }
        const frame = { t: (this.consumed + pos + this.W / 2) / this.sr, freq, aper, rms };
        this.frames.push(frame);
        out.push(frame);
        pos += this.hop;
      }
      if (pos > 0) {
        this.buf.copyWithin(0, pos, this.len);
        this.len -= pos;
        this.consumed += pos;
      }
      return out;
    }
  }

  /** Quick per-frame voicing used for the live display. */
  function isVoicedLive(f) { return f.freq > 0 && f.aper < 0.25 && f.rms > 0.004; }

  /**
   * Turn pitch frames into notes: [{ pitch (MIDI float), start, end, dur }]
   * `dur` is the inter-onset interval (time until the next note starts),
   * which is what carries rhythm.
   */
  function segmentNotes(frames, opts) {
    opts = opts || {};
    const hop = opts.hop || 0.01;
    const minNote = opts.minNote || 0.06;
    const n = frames.length;
    if (!n) return [];

    // Loudness gate relative to the loudest part of the recording.
    const loud = percentile(frames.map((f) => f.rms), 0.95);
    const gate = Math.max(0.002, loud * 0.1);

    let midi = new Float64Array(n);
    for (let k = 0; k < n; k++) {
      const f = frames[k];
      midi[k] = f.freq > 0 && f.aper < 0.3 && f.rms > gate ? freqToMidi(f.freq) : NaN;
    }

    // Bridge 1–2 frame dropouts when the pitch on both sides agrees.
    for (let k = 1; k < n - 1; k++) {
      if (!isNaN(midi[k])) continue;
      let r = k;
      while (r < n && isNaN(midi[r]) && r - k < 3) r++;
      if (r - k <= 2 && r < n && !isNaN(midi[k - 1]) && !isNaN(midi[r]) &&
          Math.abs(midi[k - 1] - midi[r]) < 1) {
        for (let q = k; q < r; q++) midi[q] = (midi[k - 1] + midi[r]) / 2;
      }
    }

    // Median filter (5 frames) within voiced regions removes octave blips.
    const sm = new Float64Array(n);
    for (let k = 0; k < n; k++) {
      if (isNaN(midi[k])) { sm[k] = NaN; continue; }
      const w = [];
      for (let q = k - 2; q <= k + 2; q++) if (q >= 0 && q < n && !isNaN(midi[q])) w.push(midi[q]);
      sm[k] = median(w);
    }
    midi = sm;

    // Split into raw segments on silence or pitch jumps.
    const raw = [];
    let cur = null;
    const close = (k, silence) => {
      if (!cur) return;
      raw.push({ startK: cur.startK, endK: k, pitch: median(cur.vals), silenceAfter: silence });
      cur = null;
    };
    for (let k = 0; k < n; k++) {
      const m = midi[k];
      if (isNaN(m)) { close(k, true); continue; }
      if (!cur) { cur = { startK: k, vals: [m] }; continue; }
      const ref = median(cur.vals);
      if (Math.abs(m - ref) > 0.8) { close(k, false); cur = { startK: k, vals: [m] }; }
      else cur.vals.push(m);
    }
    close(n, true);

    // Drop short transients (glides between notes), carrying silence flags.
    const kept = [];
    for (const s of raw) {
      if ((s.endK - s.startK) * hop >= minNote) kept.push(s);
      else if (kept.length && s.silenceAfter) kept[kept.length - 1].silenceAfter = true;
    }

    // Merge neighbours split by a wobble (same pitch, no silence between).
    const merged = [];
    for (const s of kept) {
      const p = merged[merged.length - 1];
      if (p && !p.silenceAfter && Math.abs(p.pitch - s.pitch) < 0.6 && (s.startK - p.endK) * hop < 0.1) {
        const lp = p.endK - p.startK, ls = s.endK - s.startK;
        p.pitch = (p.pitch * lp + s.pitch * ls) / (lp + ls);
        p.endK = s.endK;
        p.silenceAfter = s.silenceAfter;
      } else merged.push(Object.assign({}, s));
    }

    const t0 = frames[0].t;
    const notes = merged.map((s) => ({
      pitch: s.pitch,
      start: t0 + s.startK * hop,
      end: t0 + s.endK * hop,
    }));
    for (let i = 0; i < notes.length; i++) {
      notes[i].dur = i + 1 < notes.length ? notes[i + 1].start - notes[i].start : notes[i].end - notes[i].start;
    }
    return notes;
  }

  /** Analyse a whole buffer at once (used for uploaded files and tests). */
  function analyzeBuffer(samples, sampleRate) {
    const tr = new Tracker(sampleRate);
    const CH = 4096;
    for (let i = 0; i < samples.length; i += CH) tr.push(samples.subarray(i, Math.min(samples.length, i + CH)));
    return { frames: tr.frames, notes: segmentNotes(tr.frames, { hop: tr.hopSec }) };
  }

  WI.pitch = { Tracker, segmentNotes, analyzeBuffer, isVoicedLive, freqToMidi, midiToFreq, median };
  if (typeof module !== 'undefined' && module.exports) module.exports = WI.pitch;
})(typeof window !== 'undefined' ? window : globalThis);
