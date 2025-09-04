#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const SEP = path.sep;

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.isFile() && p.endsWith('.js')) out.push(p);
  }
  return out;
}
function read(p) { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } }
function rel(p) { return p.replace(ROOT + SEP, ''); }

function parseMounts(files) {
  const mounts = [];
  const reqDecl = /(?:const|let|var)\s+([a-zA-Z_$][\w$]*)\s*=\s*require\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
  const appUseVar = /app\.use\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*([a-zA-Z_$][\w$]*)\s*\)/g;
  const appUseInline = /app\.use\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)\s*\)/g;

  for (const f of files) {
    const src = read(f);
    const vars = new Map();
    let m;
    while ((m = reqDecl.exec(src))) {
      const v = m[1], p = m[2];
      const resolved = path.resolve(path.dirname(f), p + (p.endsWith('.js') ? '' : '.js'));
      vars.set(v, resolved);
    }
    while ((m = appUseInline.exec(src))) {
      const prefix = m[1], p = m[2];
      const resolved = path.resolve(path.dirname(f), p + (p.endsWith('.js') ? '' : '.js'));
      mounts.push({ file: f, prefix, resolved, exists: fs.existsSync(resolved) });
    }
    while ((m = appUseVar.exec(src))) {
      const prefix = m[1], v = m[2];
      const resolved = vars.get(v);
      if (resolved) mounts.push({ file: f, prefix, resolved, exists: fs.existsSync(resolved) });
    }
  }
  return mounts;
}

function parseRouter(file) {
  const src = read(file);
  const out = [];
  const rre = /router\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/g;
  let m;
  while ((m = rre.exec(src))) out.push({ method: m[1].toUpperCase(), path: m[2], file });
  return out;
}

(function main() {
  const files = walk(ROOT);
  const mounts = parseMounts(files).filter(m => m.exists);
  const routerFiles = Array.from(new Set(mounts.map(m => m.resolved)));
  const endpoints = [];

  for (const rf of routerFiles) {
    const routes = parseRouter(rf);
    const mountsFor = mounts.filter(m => m.resolved === rf);
    for (const r of routes) {
      for (const m of mountsFor) {
        const full = (m.prefix.replace(/\/+$/,'') + '/' + r.path.replace(/^\/+/, '')).replace(/\/{2,}/g,'/');
        endpoints.push({ method: r.method, path: full, file: rf, mountFrom: m.file });
      }
    }
  }

  const dupMap = new Map();
  for (const e of endpoints) {
    const k = `${e.method} ${e.path}`;
    const arr = dupMap.get(k) || [];
    arr.push(e);
    dupMap.set(k, arr);
  }
  const dups = Array.from(dupMap.values()).filter(a => a.length > 1);

  if (dups.length) {
    console.log('ERROR: Duplicate routes');
    for (const group of dups) {
      const k = `${group[0].method} ${group[0].path}`;
      console.log(`  ${k}`);
      group.forEach(e => console.log(`    - ${rel(e.file)} (mounted from ${rel(e.mountFrom)})`));
    }
    process.exit(1);
  } else {
    console.log('Duplicate check: PASS');
    process.exit(0);
  }
})();