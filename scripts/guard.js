#!/usr/bin/env node
/* Guard pre-change: Express routes + frontend refs + DB health */
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const SEP = path.sep;

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name.startsWith('.husky')) continue;
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
    // mappa variabile -> file
    const vars = new Map();
    let m;
    while ((m = reqDecl.exec(src))) {
      const v = m[1], p = m[2];
      const resolved = path.resolve(path.dirname(f), p + (p.endsWith('.js') ? '' : '.js'));
      vars.set(v, resolved);
    }
    // inline require
    while ((m = appUseInline.exec(src))) {
      const prefix = m[1], p = m[2];
      const resolved = path.resolve(path.dirname(f), p + (p.endsWith('.js') ? '' : '.js'));
      mounts.push({ file: f, prefix, reqPath: p, resolved, exists: fs.existsSync(resolved) });
    }
    // variabile
    while ((m = appUseVar.exec(src))) {
      const prefix = m[1], v = m[2];
      const resolved = vars.get(v);
      mounts.push({ file: f, prefix, reqPath: v, resolved, exists: !!resolved && fs.existsSync(resolved) });
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
function scanFrontendRefs(files) {
  const refs = new Set();
  const re = /['"`](\/magazzino\/[a-z0-9\-/_]+)['"`]/gi;
  for (const f of files) {
    if (!f.includes(`${SEP}public${SEP}`)) continue;
    const src = read(f);
    let m;
    while ((m = re.exec(src))) refs.add(m[1].replace(/\/+$/,''));
  }
  return Array.from(refs).sort();
}
async function pingDb() {
  try {
    const db = require(path.join(ROOT, 'db.js'));
    if (!db?.query) return { ok: false, error: 'db.js senza pool.query' };
    const [rows] = await db.query('SELECT 1');
    return { ok: true, rows: rows?.length ?? 0 };
  } catch (e) {
    return { ok: false, error: `${e.code || e.name}: ${e.message}` };
  }
}

(async function main() {
  const files = walk(ROOT);
  const mounts = parseMounts(files);
  const routerFiles = Array.from(new Set(mounts.filter(m => m.exists).map(m => m.resolved)));
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

  const dup = new Map();
  for (const e of endpoints) {
    const k = `${e.method} ${e.path}`;
    const arr = dup.get(k) || [];
    arr.push(e);
    dup.set(k, arr);
  }
  const duplicates = Array.from(dup.values()).filter(a => a.length > 1);

  const feRefs = scanFrontendRefs(files);
  const exposed = new Set(endpoints.map(e => e.path));
  const missing = feRefs.filter(p => !exposed.has(p));

  const dbHealth = await pingDb();

  let hasError = false;
  console.log('— Guard report —');
  console.log('Mounted routers:');
  for (const m of mounts) {
    console.log(`  ${m.prefix} -> ${rel(m.resolved)} ${m.exists ? '' : '(MISSING FILE)'}  (from ${rel(m.file)})`);
    if (!m.exists) hasError = true;
  }
  console.log('\nEndpoints:');
  endpoints.slice().sort((a,b) => (a.path+' '+a.method).localeCompare(b.path+' '+b.method))
    .forEach(e => console.log(`  ${e.method.padEnd(6)} ${e.path}  (${rel(e.file)})`));

  if (duplicates.length) {
    hasError = true;
    console.log('\nERROR: Duplicate routes');
    for (const group of duplicates) {
      const k = `${group[0].method} ${group[0].path}`;
      console.log(`  ${k}`);
      group.forEach(e => console.log(`    - ${rel(e.file)} (mounted from ${rel(e.mountFrom)})`));
    }
  }

  if (missing.length) {
    hasError = true;
    console.log('\nERROR: Frontend references without matching route');
    missing.forEach(p => console.log('  ' + p));
  }

  console.log('\nDB health:', dbHealth.ok ? 'OK' : `ERROR ${dbHealth.error || ''}`);
  if (!dbHealth.ok) hasError = true;

  console.log('\nGuard result:', hasError ? 'FAIL' : 'PASS');
  process.exit(hasError ? 1 : 0);
})();