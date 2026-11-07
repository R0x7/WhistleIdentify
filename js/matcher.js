/*
 * Melody matcher.
 *
 * Whistlers pick their own key and tempo, so we compare *intervals* (the jump
 * in semitones from one note to the next) rather than absolute pitches, using
 * a local alignment (Smith–Waterman style) so you can start anywhere in the
 * song. The alignment tolerates:
 *   - out-of-tune intervals (graded score instead of exact match),
 *   - repeated notes you slurred together (cheap to skip a repeated song note),
 *   - stray extra notes picked up from glides (skip a query note, with penalty).
 * Rhythm is then checked on the aligned notes as a tempo-free tie-breaker.
 */
(function (root) {
  'use strict';
  const WI = (root.WI = root.WI || {});

  const QUERY_SKIP = 0.7;       // penalty for ignoring a whistled note
  const SONG_SKIP = 0.7;        // penalty for skipping a song note
  const SONG_SKIP_REPEAT = 0.2; // ...if it just repeats its neighbour's pitch

  function intervalScore(a, b) {
    const e = Math.abs(a - b);
    if (e <= 0.6) return 1;
    return Math.max(-1.2, 1 - (e - 0.6));
  }

  function medianOf(arr) {
    const s = arr.slice().sort((x, y) => x - y);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  function onsets(durs) {
    const o = new Array(durs.length);
    let t = 0;
    for (let i = 0; i < durs.length; i++) { o[i] = t; t += durs[i]; }
    return o;
  }

  /** Align a query (qp pitches, qd durations) with one song (sp, sd). */
  function alignOne(qp, qd, sp, sd) {
    const nq = qp.length, ns = sp.length;
    const H = new Float64Array(nq * ns);
    const B = new Int8Array(nq * ns); // backpointer: di*4 + dj, 0 = start

    // Cost of skipping song notes strictly between a and b.
    const skipCost = (a, b) => {
      let c = 0;
      for (let k = a + 1; k < b; k++) {
        const rep = sp[k] === sp[k - 1] || (k + 1 < ns && sp[k] === sp[k + 1]);
        c += rep ? SONG_SKIP_REPEAT : SONG_SKIP;
      }
      return c;
    };

    let best = 0, bi = -1, bj = -1;
    for (let i = 0; i < nq; i++) {
      for (let j = 0; j < ns; j++) {
        let h = 0, bk = 0;
        for (let di = 1; di <= 2 && i - di >= 0; di++) {
          const qi = i - di;
          const qint = qp[i] - qp[qi];
          for (let dj = 1; dj <= 3 && j - dj >= 0; dj++) {
            const sj = j - dj;
            const v = H[qi * ns + sj] + intervalScore(qint, sp[j] - sp[sj]) -
              (di - 1) * QUERY_SKIP - (dj > 1 ? skipCost(sj, j) : 0);
            if (v > h) { h = v; bk = di * 4 + dj; }
          }
        }
        H[i * ns + j] = h;
        B[i * ns + j] = bk;
        if (h > best) { best = h; bi = i; bj = j; }
      }
    }
    if (bi < 0) return { score: 0, pitchScore: 0, rhythm: 0, pairs: [] };

    // Backtrace the aligned note pairs.
    const pairs = [];
    let i = bi, j = bj;
    for (;;) {
      pairs.push([i, j]);
      const bk = B[i * ns + j];
      if (!bk || H[i * ns + j] <= 0) break;
      i -= bk >> 2; j -= bk & 3;
    }
    pairs.reverse();

    // Rhythm consistency: after removing the global tempo, how much do the
    // aligned inter-onset spans disagree (in octaves of duration)?
    const qo = onsets(qd), so = onsets(sd);
    const diffs = [];
    for (let k = 1; k < pairs.length; k++) {
      const [q1, s1] = pairs[k - 1], [q2, s2] = pairs[k];
      const qs = qo[q2] - qo[q1], ss = so[s2] - so[s1];
      if (qs > 0 && ss > 0) diffs.push(Math.log2(qs / ss));
    }
    let rhythm = 0.5, tempo = 0;
    if (diffs.length >= 2) {
      tempo = medianOf(diffs);
      const err = diffs.reduce((a, d) => a + Math.abs(d - tempo), 0) / diffs.length;
      rhythm = Math.max(0, 1 - err / 0.6);
    }

    const pitchScore = Math.max(0, best / Math.max(1, nq - 1));
    const score = pitchScore * (0.75 + 0.25 * rhythm);
    // Key offset (query - song) so we can play the song back in your key.
    const keyOffset = medianOf(pairs.map(([q, s]) => qp[q] - sp[s]));
    return {
      score, pitchScore, rhythm, pairs,
      songStart: pairs[0][1], songEnd: pairs[pairs.length - 1][1],
      keyOffset, secondsPerBeat: Math.pow(2, tempo),
    };
  }

  /**
   * notes: [{pitch, dur}] from WI.pitch.segmentNotes
   * songs: [{title, artist, notes: [{pitch, dur}]}]
   * Returns songs sorted by match score (0..1).
   */
  function match(notes, songs) {
    const qp = notes.map((n) => n.pitch);
    const qd = notes.map((n) => n.dur);
    const out = songs.map((song) => {
      const r = alignOne(qp, qd, song.notes.map((n) => n.pitch), song.notes.map((n) => n.dur));
      return Object.assign({ song }, r);
    });
    out.sort((a, b) => b.score - a.score);
    return out;
  }

  function verdict(score) {
    if (score >= 0.75) return 'Strong match';
    if (score >= 0.6) return 'Possible match';
    return 'Long shot';
  }

  WI.matcher = { match, alignOne, verdict };
  if (typeof module !== 'undefined' && module.exports) module.exports = WI.matcher;
})(typeof window !== 'undefined' ? window : globalThis);
