// Copies the static web app into www/ (the folder Capacitor packages into the APK).
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'www');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const item of ['index.html', 'styles.css', 'js']) {
  fs.cpSync(path.join(root, item), path.join(out, item), { recursive: true });
}
console.log('Web app copied to www/');
