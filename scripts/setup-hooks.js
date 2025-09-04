#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const root = path.resolve(__dirname, '..');
const hooksDir = path.join(root, '.githooks');
if (!fs.existsSync(hooksDir)) fs.mkdirSync(hooksDir, { recursive: true });

const batPath = path.join(hooksDir, 'pre-commit.bat');
const shPath = path.join(hooksDir, 'pre-commit');

// .bat (Windows) – auto-fix + check
if (!fs.existsSync(batPath)) {
  fs.writeFileSync(batPath, `@echo off
echo Running duplicate auto-fix...
node scripts\\check-duplicates.js --fix
echo Verifica duplicati...
node scripts\\check-duplicates.js
if %ERRORLEVEL% NEQ 0 exit /b %ERRORLEVEL%
`, 'utf8');
}

// wrapper senza estensione (richiamato da Git) che invoca il .bat
if (!fs.existsSync(shPath)) {
  // usa CRLF? meglio LF per compatibilità bash
  fs.writeFileSync(shPath, `#!/usr/bin/env sh
set -e
exec cmd //c ".githooks\\pre-commit.bat"
`, 'utf8');
  try {
    fs.chmodSync(shPath, 0o755);
  } catch {}
}

// Configura core.hooksPath (ignora errori se git non c'è)
try {
  cp.execSync('git config core.hooksPath .githooks', { cwd: root, stdio: 'ignore' });
} catch {}
console.log('Hook pre-commit pronto.');