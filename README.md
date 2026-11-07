# Whistle Identify

Whistle a tune into your microphone and the app tells you which song it is.
It runs entirely in the browser: no server, no account, and no audio leaves your device.

## How to use it

1. Open the app (see **Running it** below) and tap **Tap to whistle**.
2. Whistle about 8 or more notes of a melody, in any key and at any speed. A short
   gap between notes helps, especially when the same note repeats.
3. Tap again to stop. You get the top 5 matches with a confidence score.
4. Press **▶ Hear it in your key** to hear the matched melody at your pitch and tempo.
5. If your song isn't there, open **Teach it this song** and save what you just whistled.
   Next time you whistle it, it will be recognised. Taught songs are saved in your browser's localStorage.

You can also upload an audio file (a voice memo, for example) instead of using the live mic.

## Running it

Browsers only allow microphone access on `https://` or `localhost`.

- **Locally:** `npm start` (or `python3 -m http.server 8000`), then open <http://localhost:8000>.
- **On your phone:** the included GitHub Actions workflow tests the app and deploys it to GitHub Pages
  on every push to `main`. Turn it on once in **Settings → Pages → Source: GitHub Actions**,
  then open `https://<user>.github.io/<repo>/`.

## Android app

Every commit to `main` builds an Android APK in GitHub Actions (`.github/workflows/android.yml`).
The app is the same web app wrapped with [Capacitor](https://capacitorjs.com/).

- **Download:** the newest APK is always at
  `https://github.com/<user>/<repo>/releases/download/android-latest/whistle-identify.apk`.
  Each workflow run also keeps a copy as a run artifact.
- **Install:** open the APK on your phone. Allow installs from your browser if Android asks.
  New builds install over the old one, because they're all signed with the same key (`ci/debug.keystore`).
  That is a debug key, not a secret. Before publishing to the Play Store, switch to a private release key.
- **Build it yourself:** you need Node 22+, JDK 21 and the Android SDK (`ANDROID_HOME` set).
  Run `npm ci && ./scripts/build-android.sh`. The output is `build/whistle-identify.apk`.

## How it works

| Step | File | What happens |
| --- | --- | --- |
| Pitch tracking | `js/pitch.js` | The [YIN](http://audition.ens.fr/adc/pdf/2002_JASA_YIN.pdf) estimator runs on 12 ms frames every 10 ms, between 350 and 4500 Hz. Whistling is nearly a pure sine wave, so YIN tracks it accurately. Browser noise suppression is turned off because it tends to treat whistles as noise. |
| Note segmentation | `js/pitch.js` | Frames are gated by loudness relative to the recording, short dropouts are bridged, and the pitch is median-filtered. The result is split into notes at silences and at pitch jumps over 0.8 semitones. Glide transients shorter than 60 ms are dropped. |
| Matching | `js/matcher.js` | Compares **intervals** (semitone jumps between notes), which ignore key, using local alignment, so you can start anywhere in a song. Out-of-tune intervals get partial credit. Skipping a song note costs little when it's a repeated note you slurred together. Stray extra notes can be skipped at a cost. |
| Rhythm check | `js/matcher.js` | After alignment, note-onset spacing is compared after removing the overall tempo. Rhythm is used as a tie-breaker. |
| Library | `js/songs.js` | 35 public-domain or traditional melodies in a compact text notation (`"E4 E4 F4 G4:2"`). |

## Adding songs

Add a line to the `RAW` list in `js/songs.js`:

```js
['Song title', 'Composer', 'C4 D4 E4:0.5 F4:0.5 G4:2 r:1 A4 ...'],
```

Notes are `<letter><#|b><octave>`, with an optional `:beats` duration (default 1). `r` is a rest.
The key doesn't matter. A distinctive opening phrase or chorus of about 15 to 40 notes is plenty.

## Tests

```sh
npm test
```

The test suite synthesises whistles for random excerpts of every song. It varies key, tempo,
intonation (±0.3 semitone per note), vibrato, glides, slurred notes and background noise, then runs
the full pipeline. It currently identifies 100% of 210 test whistles. In harder stress runs with
±0.45 semitone intonation and only 6–9 notes per clip, the right song is the top guess about 93% of
the time.

## Limitations

- The app only knows the songs in its library plus the ones you teach it. To identify any commercial
  song you would need a large melody database, such as a hum-to-search service.
- It handles one melody line at a time. Whistle the tune, not the chords.
