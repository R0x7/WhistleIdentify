/*
 * Built-in melody library (public-domain / traditional tunes).
 *
 * Notation: space-separated notes like "C4", "F#4", "Bb3", with an optional
 * duration in beats after a colon ("G4:2", "E4:0.5"). Default is 1 beat.
 * "r:1" is a rest (it lengthens the previous note's inter-onset time).
 * Key doesn't matter – matching is transposition-invariant.
 */
(function (root) {
  'use strict';
  const WI = (root.WI = root.WI || {});

  const RAW = [
    ['Twinkle Twinkle Little Star', 'Traditional',
      'C4 C4 G4 G4 A4 A4 G4:2 F4 F4 E4 E4 D4 D4 C4:2 G4 G4 F4 F4 E4 E4 D4:2 G4 G4 F4 F4 E4 E4 D4:2 C4 C4 G4 G4 A4 A4 G4:2 F4 F4 E4 E4 D4 D4 C4:2'],
    ['Happy Birthday', 'Mildred & Patty Hill',
      'G4:0.75 G4:0.25 A4 G4 C5 B4:2 G4:0.75 G4:0.25 A4 G4 D5 C5:2 G4:0.75 G4:0.25 G5 E5 C5 B4 A4:2 F5:0.75 F5:0.25 E5 C5 D5 C5:2'],
    ['Ode to Joy', 'Ludwig van Beethoven',
      'E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 E4:1.5 D4:0.5 D4:2 E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 D4:1.5 C4:0.5 C4:2 D4 D4 E4 C4 D4 E4:0.5 F4:0.5 E4 C4 D4 E4:0.5 F4:0.5 E4 D4 C4 D4 G3:2'],
    ['Mary Had a Little Lamb', 'Traditional',
      'E4 D4 C4 D4 E4 E4 E4:2 D4 D4 D4:2 E4 G4 G4:2 E4 D4 C4 D4 E4 E4 E4 E4 D4 D4 E4 D4 C4:4'],
    ['Jingle Bells', 'James Lord Pierpont',
      'E4 E4 E4:2 E4 E4 E4:2 E4 G4 C4:1.5 D4:0.5 E4:4 F4 F4 F4:1.5 F4:0.5 F4 E4 E4 E4:0.5 E4:0.5 E4 D4 D4 E4 D4:2 G4:2 E4 E4 E4:2 E4 E4 E4:2 E4 G4 C4:1.5 D4:0.5 E4:4 F4 F4 F4:1.5 F4:0.5 F4 E4 E4 E4:0.5 E4:0.5 G4 G4 F4 D4 C4:4'],
    ['Row, Row, Row Your Boat', 'Traditional',
      'C4:1.5 C4:1.5 C4 D4:0.5 E4:1.5 E4 D4:0.5 E4 F4:0.5 G4:3 C5:0.5 C5:0.5 C5:0.5 G4:0.5 G4:0.5 G4:0.5 E4:0.5 E4:0.5 E4:0.5 C4:0.5 C4:0.5 C4:0.5 G4 F4:0.5 E4 D4:0.5 C4:3'],
    ['Frère Jacques', 'Traditional',
      'C4 D4 E4 C4 C4 D4 E4 C4 E4 F4 G4:2 E4 F4 G4:2 G4:0.5 A4:0.5 G4:0.5 F4:0.5 E4 C4 G4:0.5 A4:0.5 G4:0.5 F4:0.5 E4 C4 C4 G3 C4:2 C4 G3 C4:2'],
    ['London Bridge Is Falling Down', 'Traditional',
      'G4:1.5 A4:0.5 G4 F4 E4 F4 G4:2 D4 E4 F4:2 E4 F4 G4:2 G4:1.5 A4:0.5 G4 F4 E4 F4 G4:2 D4:2 G4:2 E4 C4:2'],
    ['Amazing Grace', 'John Newton (trad. melody)',
      'C4 F4:2 A4:0.5 F4:0.5 A4:2 G4 F4:2 D4 C4:2 C4 F4:2 A4:0.5 F4:0.5 A4:2 G4 C5:5 A4 C5:1.5 A4:0.5 C5:0.5 A4:0.5 F4:2 C4 D4:1.5 F4:0.5 F4:0.5 D4:0.5 C4:2 C4 F4:2 A4:0.5 F4:0.5 A4:2 G4 F4:5'],
    ['Yankee Doodle', 'Traditional',
      'C4 C4 D4 E4 C4 E4 D4 G3 C4 C4 D4 E4 C4:2 B3:2 C4 C4 D4 E4 F4 E4 D4 C4 B3 G3 A3 B3 C4:2 C4:2'],
    ['Old MacDonald Had a Farm', 'Traditional',
      'G4 G4 G4 D4 E4 E4 D4:2 B4 B4 A4 A4 G4:3 D4 G4 G4 G4 D4 E4 E4 D4:2 B4 B4 A4 A4 G4:3'],
    ['Brahms\' Lullaby', 'Johannes Brahms',
      'E4:0.5 E4:0.5 G4:2 E4:0.5 E4:0.5 G4:2 E4:0.5 G4:0.5 C5 B4:1.5 A4:0.5 A4 G4 D4:0.5 E4:0.5 F4 D4 D4:0.5 E4:0.5 F4:2 D4:0.5 F4:0.5 B4:0.5 A4:0.5 G4 B4 C5:2'],
    ['Für Elise', 'Ludwig van Beethoven',
      'E5:0.5 D#5:0.5 E5:0.5 D#5:0.5 E5:0.5 B4:0.5 D5:0.5 C5:0.5 A4:1.5 C4:0.5 E4:0.5 A4:0.5 B4:1.5 E4:0.5 G#4:0.5 B4:0.5 C5:1.5 E4:0.5 E5:0.5 D#5:0.5 E5:0.5 D#5:0.5 E5:0.5 B4:0.5 D5:0.5 C5:0.5 A4:1.5 C4:0.5 E4:0.5 A4:0.5 B4:1.5 E4:0.5 C5:0.5 B4:0.5 A4:2'],
    ['Symphony No. 5 (opening)', 'Ludwig van Beethoven',
      'G4:0.5 G4:0.5 G4:0.5 Eb4:4 F4:0.5 F4:0.5 F4:0.5 D4:4'],
    ['Greensleeves', 'Traditional',
      'A4 C5:2 D5 E5:1.5 F5:0.5 E5 D5:2 B4 G4:1.5 A4:0.5 B4 C5:2 A4 A4:1.5 G#4:0.5 A4 B4:2 G#4 E4:2 A4 C5:2 D5 E5:1.5 F5:0.5 E5 D5:2 B4 G4:1.5 A4:0.5 B4 C5:1.5 B4:0.5 A4 G#4:1.5 F#4:0.5 G#4 A4:3'],
    ['Auld Lang Syne', 'Traditional',
      'C4 F4:1.5 F4:0.5 F4 A4 G4:1.5 F4:0.5 G4 A4 F4:1.5 F4:0.5 A4 C5 D5:3 D5 C5:1.5 A4:0.5 A4 F4 G4:1.5 F4:0.5 G4 A4 F4:1.5 D4:0.5 D4 C4 F4:3'],
    ['Deck the Halls', 'Traditional',
      'G4:1.5 F4:0.5 E4 D4 C4 D4 E4 C4 D4:0.5 E4:0.5 F4:0.5 D4:0.5 E4:1.5 D4:0.5 C4 B3 C4:2 G4:1.5 F4:0.5 E4 D4 C4 D4 E4 C4 D4:0.5 E4:0.5 F4:0.5 D4:0.5 E4:1.5 D4:0.5 C4 B3 C4:2'],
    ['We Wish You a Merry Christmas', 'Traditional',
      'D4 G4 G4:0.5 A4:0.5 G4:0.5 F#4:0.5 E4 E4 E4 A4 A4:0.5 B4:0.5 A4:0.5 G4:0.5 F#4 D4 D4 B4 B4:0.5 C5:0.5 B4:0.5 A4:0.5 G4 E4 D4:0.5 D4:0.5 E4 A4 F#4 G4:2'],
    ['Silent Night', 'Franz Xaver Gruber',
      'G4:1.5 A4:0.5 G4 E4:3 G4:1.5 A4:0.5 G4 E4:3 D5:2 D5 B4:3 C5:2 C5 G4:3 A4:2 A4 C5:1.5 B4:0.5 A4 G4:1.5 A4:0.5 G4 E4:3 A4:2 A4 C5:1.5 B4:0.5 A4 G4:1.5 A4:0.5 G4 E4:3 D5:2 D5 F5:1.5 D5:0.5 B4 C5:3 E5:3 C5 G4 E4 G4:1.5 F4:0.5 D4 C4:6'],
    ['Itsy Bitsy Spider', 'Traditional',
      'G3:0.5 C4 C4:0.5 C4 D4:0.5 E4:1.5 E4 E4:0.5 D4 C4:0.5 D4 E4:0.5 C4:3 E4:1.5 E4 F4:0.5 G4:1.5 G4:1.5 F4 E4:0.5 F4 G4:0.5 E4:3'],
    ['The Wheels on the Bus', 'Traditional',
      'C4 F4:0.5 F4:0.5 F4 F4 A4 C5 A4 F4:2 G4 E4 C4:2 C5 A4 F4:2 C4 F4:0.5 F4:0.5 F4 F4 A4 C5 A4 F4:2 G4:2 C4:2 F4:2'],
    ['Hot Cross Buns', 'Traditional',
      'E4 D4 C4:2 E4 D4 C4:2 C4:0.5 C4:0.5 C4:0.5 C4:0.5 D4:0.5 D4:0.5 D4:0.5 D4:0.5 E4 D4 C4:2'],
    ['Camptown Races', 'Stephen Foster',
      'G4:0.5 G4:0.5 E4:0.5 G4:0.5 A4:0.5 G4:0.5 E4 E4:0.5 D4:1.5 E4:0.5 D4:1.5 G4:0.5 G4:0.5 E4:0.5 G4:0.5 A4:0.5 G4:0.5 E4 D4:0.5 D4:0.5 E4:0.5 D4:0.5 C4:2'],
    ['Oh! Susanna', 'Stephen Foster',
      'C4:0.5 D4:0.5 E4 G4 G4:1.5 A4:0.5 G4 E4 C4:1.5 D4:0.5 E4 E4 D4 C4 D4:3 C4:0.5 D4:0.5 E4 G4 G4:1.5 A4:0.5 G4 E4 C4:1.5 D4:0.5 E4 E4 D4 D4 C4:3'],
    ['When the Saints Go Marching In', 'Traditional',
      'C4 E4 F4 G4:4 C4 E4 F4 G4:4 C4 E4 F4 G4:2 E4:2 C4:2 E4:2 D4:4 E4 E4 D4 C4:3 C4 E4 G4:2 G4 F4:3 E4 F4 G4:2 E4:2 C4:2 D4:2 C4:4'],
    ['The Star-Spangled Banner', 'John Stafford Smith',
      'G4:0.75 E4:0.25 C4 E4 G4 C5:2 E5:0.75 D5:0.25 C5 E4 F#4 G4:2 G4:0.5 G4:0.5 E5:1.5 D5:0.5 C5 B4:2 A4:0.5 B4:0.5 C5 C5 G4 E4 C4'],
    ['La Cucaracha', 'Traditional',
      'C4:0.5 C4:0.5 C4:0.5 F4:1.5 A4 C4:0.5 C4:0.5 C4:0.5 F4:1.5 A4:2 F4 F4:0.5 E4:0.5 E4:0.5 D4:0.5 D4:0.5 C4:2'],
    ['In the Hall of the Mountain King', 'Edvard Grieg',
      'A3:0.5 B3:0.5 C4:0.5 D4:0.5 E4:0.5 C4:0.5 E4 D#4:0.5 B3:0.5 D#4 D4:0.5 Bb3:0.5 D4 A3:0.5 B3:0.5 C4:0.5 D4:0.5 E4:0.5 C4:0.5 E4:0.5 A4:0.5 G4:0.5 E4:0.5 C4:0.5 E4:0.5 G4:2'],
    ['Eine kleine Nachtmusik', 'Wolfgang Amadeus Mozart',
      'G4 D4:0.5 G4 D4:0.5 G4:0.5 D4:0.5 G4:0.5 B4:0.5 D5:2 C5 A4:0.5 C5 A4:0.5 C5:0.5 A4:0.5 F#4:0.5 A4:0.5 D4:2'],
    ['The Entertainer', 'Scott Joplin',
      'D4:0.5 D#4:0.5 E4:0.5 C5 E4:0.5 C5 E4:0.5 C5:3 C5:0.5 D5:0.5 D#5:0.5 E5:0.5 C5:0.5 D5:0.5 E5 B4:0.5 D5 C5:3'],
    ['Take Me Out to the Ball Game', 'Albert Von Tilzer',
      'C5:2 A4 G4 E4 G4:3 D4:3 C5:2 A4 G4 E4 G4:6 A4 G#4 A4 E4 F4 G4 A4:2 F4 D4:3'],
    ['Can-Can (Galop Infernal)', 'Jacques Offenbach',
      'C4 C4 D4:0.5 F4:0.5 E4:0.5 D4:0.5 G4 G4 G4:0.5 A4:0.5 E4:0.5 F4:0.5 D4 D4 D4:0.5 F4:0.5 E4:0.5 D4:0.5 C4:0.5 C5:0.5 B4:0.5 A4:0.5 G4:0.5 F4:0.5 E4:0.5 D4:0.5'],
    ['Minuet in G', 'Christian Petzold (attr. J.S. Bach)',
      'D5 G4:0.5 A4:0.5 B4:0.5 C5:0.5 D5 G4 G4 E5 C5:0.5 D5:0.5 E5:0.5 F#5:0.5 G5 G4 G4 C5 D5:0.5 C5:0.5 B4:0.5 A4:0.5 B4 C5:0.5 B4:0.5 A4:0.5 G4:0.5 F#4 G4:0.5 A4:0.5 B4:0.5 G4:0.5 A4:3'],
    ['This Old Man', 'Traditional',
      'G4 E4 G4:2 G4 E4 G4:2 A4 G4 F4 E4 D4 E4 F4:2 E4 F4 G4 C4 C4 C4:0.5 C4:0.5 C4 D4 E4 F4 G4:2 G4 D4 D4 F4 E4 D4 C4:2'],
    ['Scarborough Fair', 'Traditional',
      'D4:2 D4 A4:2 A4 E4:1.5 F4:0.5 E4 D4:3 A4 C5:2 D5 C5:2 A4 B4 G4 A4:3'],
  ];

  const NOTE_RE = /^([A-Ga-g])(#|b)?(-?\d)(?::(\d*\.?\d+))?$/;
  const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

  function parseMelody(str) {
    const notes = [];
    for (const tok of str.trim().split(/\s+/)) {
      const rest = /^r(?::(\d*\.?\d+))?$/i.exec(tok);
      if (rest) {
        if (notes.length) notes[notes.length - 1].dur += parseFloat(rest[1] || '1');
        continue;
      }
      const m = NOTE_RE.exec(tok);
      if (!m) throw new Error('Bad note token: ' + tok);
      let pitch = 12 * (parseInt(m[3], 10) + 1) + SEMI[m[1].toUpperCase()];
      if (m[2] === '#') pitch++;
      if (m[2] === 'b') pitch--;
      notes.push({ pitch, dur: parseFloat(m[4] || '1') });
    }
    return notes;
  }

  const BUILTIN = RAW.map(([title, artist, melody], i) => ({
    id: 'builtin-' + i, title, artist, builtin: true, notes: parseMelody(melody),
  }));

  WI.songs = { BUILTIN, parseMelody };
  if (typeof module !== 'undefined' && module.exports) module.exports = WI.songs;
})(typeof window !== 'undefined' ? window : globalThis);
