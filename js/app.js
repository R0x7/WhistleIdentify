/* UI: microphone capture, live pitch display, results, playback, teaching. */
(function () {
  'use strict';
  const { Tracker, segmentNotes, isVoicedLive, freqToMidi, midiToFreq, median } = WI.pitch;
  const $ = (id) => document.getElementById(id);
  const recBtn = $('recBtn'), recLabel = $('recLabel'), statusEl = $('status'), level = $('level');
  const canvas = $('roll'), ctx2d = canvas.getContext('2d');
  const MAX_SECONDS = 25;
  const STORE_KEY = 'whistleidentify.custom.v1';

  let audioCtx = null, stream = null, source = null, proc = null, sink = null;
  let tracker = null, recording = false, startedAt = 0, timer = null;
  let lastNotes = [], lastFrames = [];
  let playing = [];

  // ---------- library ----------
  function loadCustom() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || '[]'); } catch (e) { return []; }
  }
  function saveCustom(list) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(list)); return true; } catch (e) { return false; }
  }
  let custom = loadCustom();
  const library = () => custom.concat(WI.songs.BUILTIN);

  function renderLibrary() {
    const all = library();
    $('libCount').textContent = all.length;
    const ul = $('libList');
    ul.innerHTML = '';
    for (const s of all) {
      const li = document.createElement('li');
      li.innerHTML = '<div class="name"></div>';
      li.querySelector('.name').append(s.title, Object.assign(document.createElement('small'), { textContent: s.artist || '' }));
      if (!s.builtin) li.append(Object.assign(document.createElement('span'), { className: 'tag', textContent: 'yours' }));
      const play = Object.assign(document.createElement('button'), { className: 'lib-btn', textContent: '▶' });
      play.setAttribute('aria-label', 'Play ' + s.title);
      play.onclick = () => playSong(s, 0, s.notes.length, null, null);
      li.append(play);
      if (!s.builtin) {
        const del = Object.assign(document.createElement('button'), { className: 'lib-btn', textContent: 'Delete' });
        del.onclick = () => { custom = custom.filter((c) => c.id !== s.id); saveCustom(custom); renderLibrary(); };
        li.append(del);
      }
      ul.append(li);
    }
  }

  // ---------- audio ----------
  function ensureCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  function setStatus(msg, err) { statusEl.textContent = msg; statusEl.classList.toggle('err', !!err); }

  async function startRecording() {
    stopPlayback();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setStatus('Microphone access needs a secure page (https:// or localhost).', true);
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        // Browser voice processing treats whistles as noise, so turn it off.
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
      });
    } catch (e) {
      setStatus('I need microphone permission to hear you. (' + (e.message || e.name) + ')', true);
      return;
    }
    const ac = ensureCtx();
    tracker = new Tracker(ac.sampleRate);
    source = ac.createMediaStreamSource(stream);
    proc = ac.createScriptProcessor(2048, 1, 1);
    sink = ac.createGain(); sink.gain.value = 0;
    proc.onaudioprocess = (e) => {
      if (!recording) return;
      const data = new Float32Array(e.inputBuffer.getChannelData(0));
      const frames = tracker.push(data);
      if (frames.length) {
        const r = frames[frames.length - 1].rms;
        level.style.width = Math.min(100, r * 400) + '%';
      }
    };
    source.connect(proc); proc.connect(sink); sink.connect(ac.destination);

    recording = true;
    startedAt = performance.now();
    recBtn.classList.add('on');
    recBtn.setAttribute('aria-label', 'Stop and identify');
    recLabel.textContent = 'Listening… tap to stop';
    setStatus('Whistle now.');
    $('resultsBox').hidden = true;
    timer = setInterval(() => {
      const s = (performance.now() - startedAt) / 1000;
      if (s >= MAX_SECONDS) stopRecording();
      else {
        const heard = tracker ? segmentNotes(tracker.frames, { hop: tracker.hopSec }).length : 0;
        setStatus(`Listening ${s.toFixed(0)}s, ${heard} note${heard === 1 ? '' : 's'} so far`);
      }
    }, 500);
    requestAnimationFrame(drawLive);
  }

  function teardown() {
    recording = false;
    clearInterval(timer);
    try { source && source.disconnect(); proc && proc.disconnect(); sink && sink.disconnect(); } catch (e) { /* ignore */ }
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = source = proc = sink = null;
    level.style.width = '0';
    recBtn.classList.remove('on');
    recBtn.setAttribute('aria-label', 'Start listening');
    recLabel.textContent = 'Tap to whistle';
  }

  function stopRecording() {
    if (!recording) return;
    teardown();
    analyse(tracker.frames, tracker.hopSec);
  }

  // ---------- analysis ----------
  function analyse(frames, hop) {
    lastFrames = frames;
    lastNotes = segmentNotes(frames, { hop });
    drawFinal();
    $('playMine').disabled = lastNotes.length === 0;
    if (lastNotes.length < 4) {
      setStatus(lastNotes.length === 0
        ? "I didn't hear any whistling. Try again closer to the mic."
        : `I only caught ${lastNotes.length} note${lastNotes.length === 1 ? '' : 's'}. Whistle a bit longer, with a clear gap between notes.`, true);
      $('resultsBox').hidden = true;
      return;
    }
    const results = WI.matcher.match(lastNotes, library()).slice(0, 5);
    renderResults(results);
    const top = results[0];
    setStatus(top.score >= 0.6
      ? `I heard ${lastNotes.length} notes. I think it's “${top.song.title}”.`
      : `I heard ${lastNotes.length} notes, but nothing matches well. Try a different part of the song, or teach it below.`);
  }

  function renderResults(results) {
    const ol = $('results');
    ol.innerHTML = '';
    results.forEach((r, i) => {
      const li = document.createElement('li');
      li.className = 'res' + (i === 0 && r.score >= 0.6 ? ' top' : '');
      const pct = Math.round(r.score * 100);
      const col = r.score >= 0.75 ? 'var(--good)' : r.score >= 0.6 ? 'var(--mid)' : 'var(--low)';
      const info = document.createElement('div');
      info.append(
        Object.assign(document.createElement('div'), { className: 't', textContent: r.song.title }),
        Object.assign(document.createElement('div'), { className: 'a', textContent: r.song.artist || '' }));
      const btn = Object.assign(document.createElement('button'), { textContent: '▶ Hear it in your key' });
      btn.onclick = () => playSong(r.song, r.songStart, Math.min(r.song.notes.length, r.songEnd + 4), r.keyOffset, r.secondsPerBeat);
      const bar = document.createElement('div'); bar.className = 'bar';
      bar.innerHTML = `<i style="width:${pct}%;background:${col}"></i>`;
      const v = Object.assign(document.createElement('div'), { className: 'v', textContent: `${WI.matcher.verdict(r.score)} · ${pct}%` });
      li.append(info, btn, bar, v);
      ol.append(li);
    });
    $('resultsBox').hidden = false;
  }

  // ---------- playback ----------
  function stopPlayback() {
    for (const o of playing) { try { o.stop(); } catch (e) { /* already stopped */ } }
    playing = [];
  }

  function playSequence(seq /* [{midi, start, dur}] in seconds */) {
    stopPlayback();
    const ac = ensureCtx();
    const t0 = ac.currentTime + 0.08;
    const out = ac.createGain(); out.gain.value = 0.18; out.connect(ac.destination);
    for (const n of seq) {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = 'sine';
      o.frequency.value = midiToFreq(n.midi);
      const a = t0 + n.start, len = Math.max(0.06, n.dur * 0.9);
      g.gain.setValueAtTime(0, a);
      g.gain.linearRampToValueAtTime(1, a + 0.02);
      g.gain.setValueAtTime(1, a + len - 0.04);
      g.gain.linearRampToValueAtTime(0, a + len);
      o.connect(g); g.connect(out);
      o.start(a); o.stop(a + len + 0.02);
      playing.push(o);
    }
  }

  function playSong(song, from, to, keyOffset, secPerBeat) {
    const notes = song.notes.slice(from, to);
    if (!notes.length) return;
    let shift = keyOffset;
    if (shift == null) { // default: move into a comfortable whistle register
      const med = median(notes.map((n) => n.pitch));
      shift = Math.round((79 - med) / 12) * 12;
    }
    let spb = secPerBeat;
    if (!spb || !isFinite(spb)) spb = song.builtin ? 0.42 : 1;
    spb = Math.min(1.5, Math.max(0.15, spb));
    let t = 0;
    playSequence(notes.map((n) => { const e = { midi: n.pitch + shift, start: t, dur: n.dur * spb }; t += n.dur * spb; return e; }));
  }

  // ---------- drawing ----------
  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

  function fitCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w, h };
  }

  function drawRoll(frames, notes, tStart, tEnd, live) {
    const { w, h } = fitCanvas();
    ctx2d.clearRect(0, 0, w, h);
    const pts = frames.filter((f) => f.t >= tStart && (live ? isVoicedLive(f) : f.freq > 0 && f.aper < 0.3));
    const mids = pts.map((f) => freqToMidi(f.freq)).concat(notes.map((n) => n.pitch));
    let lo = 72, hi = 96;
    if (mids.length) { lo = Math.min(...mids) - 3; hi = Math.max(...mids) + 3; if (hi - lo < 14) { const c = (hi + lo) / 2; lo = c - 7; hi = c + 7; } }
    const X = (t) => ((t - tStart) / (tEnd - tStart)) * w;
    const Y = (m) => h - ((m - lo) / (hi - lo)) * h;

    ctx2d.strokeStyle = css('--line'); ctx2d.lineWidth = 1;
    for (let m = Math.ceil(lo); m <= hi; m++) {
      if (m % 12 !== 0) continue;
      ctx2d.beginPath(); ctx2d.moveTo(0, Y(m)); ctx2d.lineTo(w, Y(m)); ctx2d.stroke();
    }
    ctx2d.fillStyle = css('--trace');
    ctx2d.globalAlpha = notes.length ? 0.5 : 1;
    for (const f of pts) ctx2d.fillRect(X(f.t) - 1, Y(freqToMidi(f.freq)) - 1, 2, 2);
    ctx2d.globalAlpha = 1;
    ctx2d.fillStyle = css('--note');
    for (const n of notes) {
      const x = X(n.start), x2 = X(n.end), y = Y(n.pitch);
      roundRect(x, y - 5, Math.max(4, x2 - x), 10, 5);
    }
    if (!frames.length && !live) {
      ctx2d.fillStyle = css('--muted'); ctx2d.font = '14px system-ui'; ctx2d.textAlign = 'center';
      ctx2d.fillText('Your melody will appear here', w / 2, h / 2);
    }
  }
  function roundRect(x, y, w, h, r) {
    ctx2d.beginPath();
    if (ctx2d.roundRect) ctx2d.roundRect(x, y, w, h, r); else ctx2d.rect(x, y, w, h);
    ctx2d.fill();
  }

  function drawLive() {
    if (!recording) return;
    const fr = tracker.frames;
    const now = fr.length ? fr[fr.length - 1].t : 0;
    const span = 8;
    drawRoll(fr.length > 1500 ? fr.slice(-1500) : fr, [], Math.max(0, now - span), Math.max(span, now), true);
    requestAnimationFrame(drawLive);
  }

  function drawFinal() {
    if (!lastFrames.length) { drawRoll([], [], 0, 1, false); return; }
    const t0 = lastNotes.length ? lastNotes[0].start - 0.3 : lastFrames[0].t;
    const t1 = lastNotes.length ? lastNotes[lastNotes.length - 1].end + 0.3 : lastFrames[lastFrames.length - 1].t;
    drawRoll(lastFrames, lastNotes, t0, t1, false);
  }

  // ---------- events ----------
  recBtn.addEventListener('click', () => { recording ? stopRecording() : startRecording(); });

  $('playMine').addEventListener('click', () => {
    if (!lastNotes.length) return;
    const t0 = lastNotes[0].start;
    playSequence(lastNotes.map((n) => ({ midi: Math.round(n.pitch), start: n.start - t0, dur: n.end - n.start })));
  });

  $('fileIn').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (recording) teardown();
    setStatus('Analysing ' + file.name + '…');
    recBtn.classList.add('busy');
    try {
      const ac = ensureCtx();
      const buf = await ac.decodeAudioData(await file.arrayBuffer());
      const ch = buf.getChannelData(0);
      const tr = new Tracker(buf.sampleRate);
      for (let i = 0; i < ch.length; i += 8192) tr.push(ch.subarray(i, Math.min(ch.length, i + 8192)));
      analyse(tr.frames, tr.hopSec);
    } catch (err) {
      setStatus("Couldn't read that audio file (" + (err.message || err) + ').', true);
    } finally {
      recBtn.classList.remove('busy');
      e.target.value = '';
    }
  });

  $('teachForm').addEventListener('submit', (e) => {
    e.preventDefault();
    if (lastNotes.length < 4) return;
    const title = $('teachTitle').value.trim();
    if (!title) return;
    custom.unshift({
      id: 'custom-' + Date.now(), title, artist: $('teachArtist').value.trim() || 'Taught by you',
      notes: lastNotes.map((n) => ({ pitch: Math.round(n.pitch * 10) / 10, dur: Math.round(n.dur * 1000) / 1000 })),
    });
    const ok = saveCustom(custom);
    renderLibrary();
    $('teachForm').reset();
    e.target.closest('details').open = false;
    setStatus(ok ? `Saved “${title}”. Whistle it again any time.` : `Added “${title}” for this visit. This browser won't keep it after you close the page.`);
  });

  window.addEventListener('resize', () => { if (!recording) drawFinal(); });
  renderLibrary();
  drawFinal();

  // Hook for automated testing.
  window.WI.app = { analyse, get notes() { return lastNotes; } };
})();
