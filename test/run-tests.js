// End-to-end test: synth whistle -> pitch tracking -> segmentation -> matching.
'use strict';
const path = require('path');
const pitch = require(path.join(__dirname, '../js/pitch.js'));
const matcher = require(path.join(__dirname, '../js/matcher.js'));
const { BUILTIN, parseMelody } = require(path.join(__dirname, '../js/songs.js'));
const { whistle, rng } = require('./synth.js');

let failed = 0;
function check(name, cond, detail) {
  console.log((cond ? '  ok   ' : '  FAIL ') + name + (detail ? '  (' + detail + ')' : ''));
  if (!cond) failed++;
}

// 1. Pitch tracker accuracy on a clean tone.
{
  const sr = 48000;
  for (const f of [600, 1000, 1500, 2500, 3500]) {
    const x = new Float32Array(sr / 2);
    for (let k = 0; k < x.length; k++) x[k] = 0.3 * Math.sin((2 * Math.PI * f * k) / sr);
    const { frames } = pitch.analyzeBuffer(x, sr);
    const est = pitch.median(frames.filter((fr) => fr.freq).map((fr) => fr.freq));
    check(`YIN ${f} Hz`, Math.abs(est - f) / f < 0.005, est.toFixed(1) + ' Hz');
  }
}

// 2. Segmentation recovers the right note count/intervals for a known tune.
{
  const notes = parseMelody('C4 D4 E4 C4 C4 D4 E4 C4 E4 F4 G4:2').map((n) => ({ pitch: n.pitch + 24, dur: n.dur }));
  const audio = whistle(notes, { seed: 7, slurProb: 0, detune: 0.05, drift: 0 });
  const seg = pitch.analyzeBuffer(audio, 48000).notes;
  check('segmentation note count', seg.length === notes.length, `${seg.length} vs ${notes.length}`);
  const ints = seg.slice(1).map((n, i) => Math.round(n.pitch - seg[i].pitch)).join(',');
  check('segmentation intervals', ints === '2,2,-4,0,2,2,-4,4,1,2', ints);
}

// 3. Identification accuracy over many random excerpts.
{
  const r = rng(12345);
  let top1 = 0, top3 = 0, total = 0;
  const misses = [];
  for (const song of BUILTIN) {
    for (let trial = 0; trial < 6; trial++) {
      const len = Math.min(song.notes.length, 8 + Math.floor(r() * 7));
      const start = Math.floor(r() * (song.notes.length - len + 1));
      const key = 70 + Math.floor(r() * 12) - song.notes[0].pitch + 12; // whistle register
      const excerpt = song.notes.slice(start, start + len).map((n) => ({ pitch: n.pitch + key, dur: n.dur }));
      const audio = whistle(excerpt, {
        seed: 1000 + total, secPerBeat: 0.28 + r() * 0.3, detune: 0.3, noise: 0.015, slurProb: 0.35,
      });
      const q = pitch.analyzeBuffer(audio, 48000).notes;
      const res = matcher.match(q, BUILTIN);
      const rank = res.findIndex((x) => x.song === song);
      total++;
      if (rank === 0) top1++;
      if (rank >= 0 && rank < 3) top3++;
      else misses.push(`${song.title} [${start}+${len}] -> ${res[0].song.title} (${res[0].score.toFixed(2)})`);
    }
  }
  const p1 = top1 / total, p3 = top3 / total;
  console.log(`  identification: top-1 ${(p1 * 100).toFixed(1)}%, top-3 ${(p3 * 100).toFixed(1)}% over ${total} whistles`);
  misses.slice(0, 15).forEach((m) => console.log('     miss: ' + m));
  check('top-1 accuracy >= 85%', p1 >= 0.85);
  check('top-3 accuracy >= 95%', p3 >= 0.95);
}

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
