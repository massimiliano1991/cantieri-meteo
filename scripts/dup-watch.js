#!/usr/bin/env node
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

let timer;
function run() {
  const p = spawn(process.execPath, [path.join(process.cwd(), 'scripts', 'check-duplicates.js')], { stdio: 'inherit' });
  p.on('close', () => {});
}
run();

const ignore = ['node_modules', '.git', '.vscode'];
fs.watch(process.cwd(), { recursive: true }, (evt, filename) => {
  if (!filename) return;
  if (ignore.some(d => filename.startsWith(d))) return;
  clearTimeout(timer);
  timer = setTimeout(run, 400);
});