#!/usr/bin/env node
/* Scansione duplicati: rotte Express e funzioni con stesso nome (per file).
   Opzione --fix: rinomina le funzioni duplicate successive alla prima (name__dup1, dup2, …) */
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const targets = ['routes', 'public', 'moduli'];
const DO_FIX = process.argv.includes('--fix');

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (entry.isFile() && p.endsWith('.js')) out.push(p);
  }
  return out;
}

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function indexToLineCol(text, idx) {
  const pre = text.slice(0, idx);
  const lines = pre.split('\n');
  const line = lines.length;
  const col = lines[lines.length - 1].length + 1;
  return { line, col };
}

function checkFile(filePath) {
  const srcRaw = fs.readFileSync(filePath, 'utf8');
  const src = stripComments(srcRaw);
  const issues = [];
  const fixes = [];

  // Rotte duplicate
  const routeRe = /router\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/g;
  const routes = new Map();
  let m;
  while ((m = routeRe.exec(src)) !== null) {
    const key = `${m[1].toUpperCase()} ${m[2]}`;
    const pos = indexToLineCol(srcRaw, m.index);
    if (!routes.has(key)) routes.set(key, []);
    routes.get(key).push(pos);
  }
  for (const [key, locs] of routes.entries()) {
    if (locs.length > 1) {
      locs.forEach(loc => {
        issues.push(`${filePath}:${loc.line}:${loc.col}: [DUP_ROUTE] Definizione rotta duplicata nello stesso file: ${key}`);
      });
    }
  }

  // Funzioni duplicate
  const fnRe = /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(|\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(/g;
  const fnMatches = []; // {name, index, fullMatch}
  while ((m = fnRe.exec(src)) !== null) {
    const name = m[1] || m[2];
    fnMatches.push({ name, index: m.index, full: m[0] });
  }
  const byName = new Map();
  fnMatches.forEach(x => {
    if (!byName.has(x.name)) byName.set(x.name, []);
    byName.get(x.name).push(x);
  });

  for (const [name, arr] of byName.entries()) {
    if (arr.length > 1) {
      // Segnala tutte
      arr.forEach(x => {
        const pos = indexToLineCol(srcRaw, x.index);
        issues.push(`${filePath}:${pos.line}:${pos.col}: [DUP_FUNC] Funzione con nome duplicato nello stesso file: ${name}`);
      });

      // Opzionale: fix rinominando dalla seconda in poi
      if (DO_FIX) {
        // Ordina per index e rinomina successive
        const sorted = arr.slice().sort((a, b) => a.index - b.index);
        for (let i = 1; i < sorted.length; i++) {
          const occ = sorted[i];
          const newName = `${name}__dup${i}`;
          // Trova nel file originale il token della funzione a quell'indice (ri-usa regex localizzata)
          // Sostituiamo solo il nome immediatamente dopo "function " oppure dopo "const "
          const patchRe = new RegExp(`(function\\s+)${name}(\\s*\\()|(const\\s+)${name}(\\s*=\\s*(?:async\\s*)?\\()`, 'g');
          let replacedOnce = false;
          const before = srcRaw.slice(0, occ.index);
          const after = srcRaw.slice(occ.index);
          const patchedAfter = after.replace(patchRe, (match, g1, g2, g3, g4) => {
            if (replacedOnce) return match;
            replacedOnce = true;
            if (g1) return `${g1}${newName}${g2}`;
            if (g3) return `${g3}${newName}${g4}`;
            return match;
          });
          if (replacedOnce) {
            fixes.push({ filePath, content: before + patchedAfter });
          }
        }
      }
    }
  }

  // Applica ultimo fix calcolato (se più fix sullo stesso file, tieni l’ultimo stato)
  if (DO_FIX && fixes.length) {
    // Lavoriamo sull’ultimo contenuto risultante
    let content = srcRaw;
    // Per sicurezza, ricalcola in modo cumulativo
    const renamePlan = [];
    for (const [name, arr] of byName.entries()) {
      if (arr.length > 1) {
        const sorted = arr.slice().sort((a, b) => a.index - b.index);
        for (let i = 1; i < sorted.length; i++) {
          const occ = sorted[i];
          renamePlan.push({ index: occ.index, name, i });
        }
      }
    }
    // Ordina decrescente per non invalidare gli indici
    renamePlan.sort((a, b) => b.index - a.index);
    for (const r of renamePlan) {
      const newName = `${r.name}__dup${r.i}`;
      const after = content.slice(r.index);
      const patchRe = new RegExp(`(function\\s+)${r.name}(\\s*\\()|(const\\s+)${r.name}(\\s*=\\s*(?:async\\s*)?\\()`);
      const patchedAfter = after.replace(patchRe, (match, g1, g2, g3, g4) => {
        if (g1) return `${g1}${newName}${g2}`;
        if (g3) return `${g3}${newName}${g4}`;
        return match;
      });
      content = content.slice(0, r.index) + patchedAfter;
    }
    fs.writeFileSync(filePath, content, 'utf8');
  }

  return issues;
}

function main() {
  const files = targets.flatMap(t => walk(path.join(repoRoot, t)));
  let all = [];
  files.forEach(f => { all = all.concat(checkFile(f)); });

  if (all.length) {
    console.error('Trovati duplicati:');
    all.forEach(l => console.error(l));
    process.exit(DO_FIX ? 0 : 2);
  } else {
    console.log('OK: nessun duplicato rilevato in rotte e funzioni (per file).');
  }
}

main();