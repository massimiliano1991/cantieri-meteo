#!/usr/bin/env node
/* Watcher: al cambio file .js in routes/public/moduli esegue auto-fix duplicati */
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const root = path.resolve(__dirname, '..');
const targets = ['routes', 'public', 'moduli']
  .map(d => path.join(root, d))
  .filter(p => fs.existsSync(p));

if (!targets.length) {
  console.log('dup-watch: nessuna cartella da monitorare.');
  process.exit(0);
}

let timer = null;
let running = false;

function runFix() {
  if (running) return;
  running = true;
  exec('node scripts/check-duplicates.js --fix', { cwd: root }, (err, stdout, stderr) => {
    if (stdout && stdout.trim()) console.log(stdout.trim());
    if (stderr && stderr.trim()) console.error(stderr.trim());
    if (err) console.error('dup-watch: errore auto-fix ->', err.message);
    running = false;
  });
}

function onChange(_evt, filename) {
  if (!filename || !filename.endsWith('.js')) return;
  clearTimeout(timer);
  timer = setTimeout(runFix, 250);
}

function watchRec(dir) {
  try {
    fs.watch(dir, { recursive: true }, onChange);
  } catch {
    // fallback: non-recursive, scansiona sottocartelle
    fs.watch(dir, onChange);
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) watchRec(path.join(dir, entry.name));
    }
  }
}

console.log('dup-watch: attivo su', targets.join(', '));
targets.forEach(watchRec);
// primo giro
runFix();