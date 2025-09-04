/* eslint-env browser, es2021 */

// Mappa endpoint
const API = {
  articoli: '/magazzino/articoli',
  movimenti: '/magazzino/movimenti',
};

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${res.statusText} on ${url}\n${text}`);
  }
  return res.json();
}

function safe(v) {
  return v === undefined || v === null || v === '' ? '-' : v;
}

let _cacheArticoli = [];

async function fetchArticoli() {
  const res = await fetch(`${API.articoli}`);
  if (!res.ok) throw new Error('Errore caricamento articoli');
  const data = await res.json();
  _cacheArticoli = Array.isArray(data) ? data : [];
  return _cacheArticoli;
}

function statoBadge(a) {
  const q = Number(a.quantita ?? 0);
  const s = Number(a.soglia_minima ?? 0);
  if (q <= 0) return '<span class="badge crit">Critico</span>';
  if (q <= s) return '<span class="badge warn">Sotto soglia</span>';
  return '<span class="badge ok">OK</span>';
}

function renderTabella(container, articoli) {
  if (!container) return;
  if (!articoli || articoli.length === 0) {
    container.innerHTML = '<p>Nessun articolo presente.</p>';
    return;
  }
  let html = `<table class="table">
    <thead>
      <tr>
        <th>ID</th><th>Articolo</th><th>Categoria</th><th>Quantità</th>
        <th>Soglia Minima</th><th>Stato</th><th>Fornitore</th><th>Note</th><th>Azione</th>
      </tr>
    </thead><tbody>`;
  for (const a of articoli) {
    html += `<tr data-id="${a.id}">
      <td>${safe(a.id)}</td>
      <td>${safe(a.nome_articolo)}</td>
      <td>${safe(a.categoria)}</td>
      <td>${safe(a.quantita)}</td>
      <td>${safe(a.soglia_minima)}</td>
      <td>${statoBadge(a)}</td>
      <td>${safe(a.fornitore)}</td>
      <td>${safe(a.note)}</td>
      <td>
        <button class="btn-modifica">Modifica</button>
        <button class="btn-elimina">Elimina</button>
      </td>
    </tr>`;
  }
  html += '</tbody></table>';
  container.innerHTML = html;

  container.querySelectorAll('.btn-elimina').forEach(b => b.addEventListener('click', onElimina));
  container.querySelectorAll('.btn-modifica').forEach(b => b.addEventListener('click', onModifica));
}

async function carica(container) {
  try {
    const articoli = await fetchArticoli();
    renderTabella(container, articoli);
  } catch (e) {
    if (container) container.innerHTML = `<p style="color:red">${e.message}</p>`;
  }
}

async function onAggiungi(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const conferma = document.getElementById('conferma-magazzino');

  const payload = {
    nome_articolo: form.querySelector('#nome-articolo')?.value || '',
    categoria: form.querySelector('#categoria')?.value || '',
    quantita: Number(form.querySelector('#quantita')?.value || 0),
    soglia_minima: Number(form.querySelector('#soglia-minima')?.value || 0),
    fornitore: form.querySelector('#fornitore')?.value || '',
    note: form.querySelector('#note')?.value || ''
  };

  try {
    const res = await fetch(`${API.articoli}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(out.message || 'Errore creazione');

    if (conferma) {
      conferma.textContent = 'Articolo aggiunto.';
      conferma.style.color = 'green';
    }
    form.reset();
    await carica(document.getElementById('tabella-magazzino'));
  } catch (e2) {
    if (conferma) {
      conferma.textContent = `Errore: ${e2.message}`;
      conferma.style.color = 'red';
    }
  } finally {
    if (conferma) setTimeout(() => (conferma.textContent = ''), 4000);
  }
}

async function onElimina(ev) {
  const tr = ev.target.closest('tr');
  const id = tr?.dataset.id;
  if (!id) return;
  if (!confirm(`Eliminare l'articolo ID ${id}?`)) return;
  try {
    const res = await fetch(`${API.articoli}/${id}`, { method: 'DELETE' });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(out.message || 'Errore eliminazione');
    await carica(document.getElementById('tabella-magazzino'));
  } catch (e) {
    alert(e.message);
  }
}

async function onModifica(ev) {
  const tr = ev.target.closest('tr');
  const id = tr?.dataset.id;
  if (!id) return;
  const current = {
    nome_articolo: tr.children[1].textContent.trim(),
    categoria: tr.children[2].textContent.trim(),
    quantita: Number(tr.children[3].textContent.trim()) || 0,
    soglia_minima: Number(tr.children[4].textContent.trim()) || 0,
    fornitore: tr.children[5].textContent.trim(),
    note: tr.children[6].textContent.trim()
  };

  const nome = prompt('Nome articolo:', current.nome_articolo);
  if (nome === null) return;
  const categoria = prompt('Categoria:', current.categoria);
  if (categoria === null) return;
  const quantita = Number(prompt('Quantità:', current.quantita));
  if (Number.isNaN(quantita)) return alert('Quantità non valida');
  const soglia = Number(prompt('Soglia minima:', current.soglia_minima));
  if (Number.isNaN(soglia)) return alert('Soglia non valida');
  const fornitore = prompt('Fornitore:', current.fornitore);
  if (fornitore === null) return;
  const note = prompt('Note:', current.note);
  if (note === null) return;

  try {
    const res = await fetch(`${API.articoli}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome_articolo: nome, categoria, quantita, soglia_minima: soglia, fornitore, note })
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(out.message || 'Errore aggiornamento');
    await carica(document.getElementById('tabella-magazzino'));
  } catch (e) {
    alert(e.message);
  }
}

// UI Drawer
function ensureDrawerUI() {
  if (document.getElementById('btn-mov-rapido')) return;

  const btn = document.createElement('button');
  btn.id = 'btn-mov-rapido';
  btn.textContent = 'Movimento Rapido';
  btn.style.cssText = 'position:sticky;top:8px;margin:0 0 16px auto;display:block;padding:10px 14px;border:0;border-radius:8px;background:#0a84ff;color:#fff;cursor:pointer;';
  const tableWrap = document.getElementById('tabella-magazzino');
  (tableWrap?.parentElement || document.body).insertBefore(btn, tableWrap);

  const drawer = document.createElement('div');
  drawer.id = 'drawer-mov';
  drawer.innerHTML = `
    <div id="drawer-backdrop" style="position:fixed;inset:0;background:rgba(0,0,0,.28);opacity:0;pointer-events:none;transition:.2s;"></div>
    <div id="drawer-panel" style="position:fixed;top:0;right:-420px;width:360px;height:100vh;background:#fff;box-shadow:-8px 0 24px rgba(0,0,0,.08);padding:16px 16px 24px;transition:.25s;display:flex;flex-direction:column;gap:10px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <h3 style="margin:0;font:600 18px system-ui;">Movimento</h3>
        <button id="drawer-close" style="border:0;background:transparent;font-size:20px;cursor:pointer;">×</button>
      </div>
      <label>Articolo
        <select id="mov-articolo" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;"></select>
      </label>
      <label>Tipo
        <select id="mov-tipo" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;">
          <option value="carico">Carico</option>
          <option value="scarico">Scarico</option>
          <option value="rettifica">Rettifica</option>
        </select>
      </label>
      <label id="lbl-quantita">Quantità (Δ)
        <input id="mov-quantita" type="number" step="1" value="1" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px" />
      </label>
      <label id="lbl-nuova" style="display:none;">Quantità finale
        <input id="mov-nuova" type="number" step="1" min="0" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px" />
      </label>
      <label>Data
        <input id="mov-data" type="date" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px" />
      </label>
      <label>Note
        <textarea id="mov-note" rows="2" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px"></textarea>
      </label>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:auto;">
        <button id="mov-cancel" style="padding:10px 12px;border:1px solid #ddd;border-radius:8px;background:#fff;cursor:pointer;">Annulla</button>
        <button id="mov-save" style="padding:10px 14px;border:0;border-radius:8px;background:#0a84ff;color:#fff;cursor:pointer;">Registra</button>
      </div>
      <div id="mov-msg" style="min-height:18px;color:#a22;font-size:13px;"></div>
    </div>
  `;
  document.body.appendChild(drawer);

  const backdrop = drawer.querySelector('#drawer-backdrop');
  const panel = drawer.querySelector('#drawer-panel');
  const close = drawer.querySelector('#drawer-close');
  const tipo = drawer.querySelector('#mov-tipo');
  const qta = drawer.querySelector('#mov-quantita');
  const qtaFin = drawer.querySelector('#mov-nuova');
  const lblFin = drawer.querySelector('#lbl-nuova');
  const data = drawer.querySelector('#mov-data');
  const save = drawer.querySelector('#mov-save');
  const cancel = drawer.querySelector('#mov-cancel');
  const selArt = drawer.querySelector('#mov-articolo');
  const msg = drawer.querySelector('#mov-msg');

  function openDrawer() {
    populateArticoli(selArt, _cacheArticoli);
    data.value = new Date().toISOString().slice(0,10);
    msg.textContent = '';
    backdrop.style.opacity = '1';
    backdrop.style.pointerEvents = 'auto';
    panel.style.right = '0';
  }
  function closeDrawer() {
    backdrop.style.opacity = '0';
    backdrop.style.pointerEvents = 'none';
    panel.style.right = '-420px';
  }
  function populateArticoli(select, articoli) {
    const options = articoli.map(a => `<option value="${a.id}">${a.nome_articolo} (q=${a.quantita})</option>`).join('');
    select.innerHTML = options;
  }
  function onTipoChange() {
    const isRett = tipo.value === 'rettifica';
    lblFin.style.display = isRett ? '' : 'none';
  }

  btn.addEventListener('click', openDrawer);
  backdrop.addEventListener('click', closeDrawer);
  close.addEventListener('click', closeDrawer);
  cancel.addEventListener('click', closeDrawer);
  tipo.addEventListener('change', onTipoChange);

  save.addEventListener('click', async () => {
    msg.style.color = '#a22';
    msg.textContent = 'Invio...';
    const payload = {
      articolo_id: Number(selArt.value),
      tipo: tipo.value,
      quantita: Number(qta.value || 0),
      data: data.value,
      note: document.getElementById('mov-note').value || ''
    };
    const nv = qtaFin.value;
    if (tipo.value === 'rettifica' && nv !== '') {
      payload.nuova_quantita = Number(nv);
    }
    try {
      const res = await fetch(`${API.movimenti}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.message || 'Errore registrazione');
      msg.style.color = '#18794e';
      msg.textContent = 'Movimento registrato.';
      await carica(document.getElementById('tabella-magazzino'));
      setTimeout(closeDrawer, 600);
    } catch (e) {
      msg.style.color = '#a22';
      msg.textContent = e.message;
    }
  });
}

// Normalizza chiavi: case-insensitive, senza spazi/underscore/puntini
function _normKey(k) { return String(k).toLowerCase().replace(/[^a-z0-9]/g, ''); }
function _pickAny(obj, aliases) {
  if (!obj) return undefined;
  const dict = new Map(Object.keys(obj).map(k => [_normKey(k), k]));
  for (const a of aliases) {
    const key = dict.get(_normKey(a));
    if (key !== undefined) return obj[key];
  }
  return undefined;
}

function getNome(a) {
  // aggiunti sinonimi comuni: PRODOTTO, TITOLO, ARTICOLO, ecc.
  return _pickAny(a, ['NomeArticolo','ARTICOLO','Articolo','articolo','nome','Nome','descrizione','Descrizione','prodotto','titolo']) ?? '';
}
function getCategoria(a) {
  return _pickAny(a, ['Categoria','categoria','reparto','gruppo','tipo']) ?? '';
}
function getQta(a) {
  const v = _pickAny(a, ['Quantita','quantita','QTA','qta','Giacenza','disponibile','qty','quantity']);
  return Number(v ?? 0) || 0;
}
function getSoglia(a) {
  const v = _pickAny(a, ['SogliaMinima','soglia_minima','Soglia','soglia','ScortaMinima','minimo','threshold']);
  return v == null || v === '' ? null : (Number(v) || 0);
}
function getUM(a) {
  return _pickAny(a, ['UnitaMisura','UM','um','Unita','unita','misura']) ?? '';
}
function getPrezzo(a) {
  const v = _pickAny(a, ['PrezzoUnitario','prezzo_unitario','Prezzo','prezzo','CostoUnitario','costo','price','unitprice']);
  return v == null || v === '' ? null : Number(v);
}

// Sostituisce le chiamate “/api/…”: lavora solo con gli endpoint esistenti /magazzino/*
async function loadKpiMagazzino() {
  try {
    const articoli = await fetchArticoli(); // usa già API = '/magazzino'
    const tot = articoli.length;
    const sotto = articoli.filter(a => {
      const q = getQta(a);
      const s = getSoglia(a);
      return s != null && q <= s;
    }).length;

    const elS = document.getElementById('kpiSottoSoglia');
    if (elS) elS.textContent = String(sotto);

    const elV = document.getElementById('kpiValoreTotale');
    if (elV) {
      // valore totale se disponibile il prezzo
      const valore = articoli.reduce((acc, a) => {
        const p = getPrezzo(a);
        return acc + (p != null ? getQta(a) * p : 0);
      }, 0);
      elV.textContent = valore ? valore.toFixed(2) : '-';
    }
  } catch (e) {
    console.error('KPI Magazzino:', e);
  }
}

async function loadSottoSoglia() {
  try {
    const rows = (await fetchArticoli())
      .filter(a => {
        const q = getQta(a);
        const s = getSoglia(a);
        return s != null && q <= s;
      });

    const tbody = document.querySelector('#tblSottoSoglia tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    rows.forEach(a => {
      const tr = document.createElement('tr');
      const prezzo = getPrezzo(a);
      tr.innerHTML = `
        <td>${getNome(a)}</td>
        <td style="text-align:right">${getQta(a)}</td>
        <td style="text-align:right">${getSoglia(a) ?? '-'}</td>
        <td>${getUM(a)}</td>
        <td style="text-align:right">${prezzo != null ? prezzo.toFixed(2) : '-'}</td>
      `;
      tbody.appendChild(tr);
    });

    const el = document.getElementById('kpiSottoSoglia');
    if (el) el.textContent = String(rows.length);
  } catch (e) {
    console.error('Sotto soglia:', e);
  }
}

async function loadInventario() {
  const container = document.getElementById('tabella-magazzino');
  try {
    const rows = await fetchArticoli(); // stessa sorgente già usata dalla tabella principale
    if (!container) return;
    if (!rows.length) { container.innerHTML = '<p>Nessun articolo.</p>'; return; }

    const thead = '<tr><th>Articolo</th><th>Categoria</th><th>Q.tà</th><th>Soglia</th><th>UM</th><th>Prezzo</th></tr>';
    const tbody = rows.map(a => `
      <tr>
        <td>${getNome(a)}</td>
        <td>${getCategoria(a)}</td>
        <td style="text-align:right">${getQta(a)}</td>
        <td style="text-align:right">${getSoglia(a) ?? '-'}</td>
        <td>${getUM(a)}</td>
        <td style="text-align:right">${getPrezzo(a) != null ? getPrezzo(a).toFixed(2) : '-'}</td>
      </tr>
    `).join('');
    container.innerHTML = `<table class="table"><thead>${thead}</thead><tbody>${tbody}</tbody></table>`;
  } catch (e) {
    console.error('Inventario:', e);
    if (container) container.innerHTML = '<p>Errore nel caricamento inventario.</p>';
  }
}

// Inizializzazione: riusa il tuo flusso esistente
document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('tabella-magazzino');
  const form = document.getElementById('magazzinoForm');

  carica(container).then(() => ensureDrawerUI());
  if (form) form.addEventListener('submit', onAggiungi);
  loadKpiMagazzino();
  loadSottoSoglia();
  loadInventario();
  bindFormMagazzino();
  bindMovimentoRapidoButton();
});

function bindFormMagazzino() {
  const form = document.getElementById('magazzinoForm');
  const btn = document.getElementById('btnAggiungiArticolo'); // opzionale

  // valori default utili
  const qty = document.getElementById('quantita');
  const soglia = document.getElementById('soglia-minima');
  if (qty && !qty.value) qty.value = 1;
  if (soglia && !soglia.value) soglia.value = 1;

  const handler = async (e) => {
    e.preventDefault();
    try {
      // riusa la tua logica di aggiunta
      await onAggiungi(e);
      // aggiorna viste se presenti
      if (typeof carica === 'function') {
        const cont = document.getElementById('tabella-magazzino');
        await carica(cont);
      }
      if (typeof loadKpiMagazzino === 'function') await loadKpiMagazzino();
      if (typeof loadSottoSoglia === 'function') await loadSottoSoglia();

      if (form) form.reset();
      if (qty) qty.value = 1;
      if (soglia) soglia.value = 1;
    } catch (err) {
      console.error('bindFormMagazzino:', err);
    }
  };

  if (form) form.addEventListener('submit', handler);
  if (btn) btn.addEventListener('click', handler);
}

async function postJson(url, body) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify(body || {})
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// Movimento rapido via prompt (semplice e immediato)
async function doMovimentoRapido() {
  try {
    const nome = prompt('Articolo (nome esatto):');
    if (!nome) return;

    let tipo = prompt("Tipo movimento: 'carico', 'scarico' o 'rettifica'").trim().toLowerCase();
    if (!['carico','scarico','rettifica'].includes(tipo)) { alert('Tipo non valido'); return; }

    const q = Number(prompt('Quantità (numero > 0):'));
    if (!Number.isFinite(q) || q <= 0) { alert('Quantità non valida'); return; }

    const note = prompt('Note (opzionale):') || null;

    await postJson('/magazzino/movimenti', { nome, tipo, quantita: q, note });

    // refresh viste
    try { if (typeof fetchArticoli === 'function') await fetchArticoli(); } catch {}
    try { if (typeof carica === 'function') await carica(document.getElementById('tabella-magazzino')); } catch {}
    try { if (typeof loadKpiMagazzino === 'function') await loadKpiMagazzino(); } catch {}
    try { if (typeof loadSottoSoglia === 'function') await loadSottoSoglia(); } catch {}

    alert('Movimento registrato.');
  } catch (err) {
    console.error('doMovimentoRapido:', err);
    alert('Errore nel movimento.');
  }
}

// Cerca e collega il bottone “Movimento Rapido”
function bindMovimentoRapidoButton() {
  const tryBind = () => {
    // id esplicito, data-attr o match sul testo
    const byId = document.getElementById('movimento-rapido');
    const byData = document.querySelector('[data-action="movimento-rapido"]');
    const byText = Array.from(document.querySelectorAll('button'))
      .find(b => (b.textContent || '').trim().toLowerCase() === 'movimento rapido');

    const btn = byId || byData || byText;
    if (btn && !btn._movRapidBound) {
      btn.addEventListener('click', (e) => { e.preventDefault(); doMovimentoRapido(); });
      btn._movRapidBound = true;
    }
  };
  tryBind();
  // tenta di nuovo dopo eventuale rendering dinamico
  setTimeout(tryBind, 500);
}

// Trova il bottone “Movimento Rapido” anche se non ha id
(function wireMovimentoRapido() {
  const btn = document.querySelector('#btnMovimentoRapido') ||
              [...document.querySelectorAll('button,a')].find(el => /movimento\s*rapido/i.test(el.textContent || ''));
  if (!btn) return;

  const backdrop = document.getElementById('mr-backdrop');
  const form = document.getElementById('mr-form');
  const selArt = document.getElementById('mr-articolo');
  const qty = document.getElementById('mr-quantita');
  const note = document.getElementById('mr-note');
  const cancel = document.getElementById('mr-cancel');
  const submit = document.getElementById('mr-submit');

  const openModal = async () => {
    try {
      // carica articoli nel select
      selArt.innerHTML = '<option value="">Caricamento…</option>';
      const articoli = await fetchJson(API.articoli).catch(() => []);
      selArt.innerHTML = '<option value="" disabled selected>Seleziona…</option>' +
        articoli.map(a => `<option value="${a.id || a.articoloId || a.codice}">${a.nome || a.descrizione || a.codice}</option>`).join('');
      qty.value = '';
      note.value = '';
      backdrop.style.display = 'block';
    } catch (e) {
      console.error('Caricamento articoli fallito', e);
      alert('Impossibile caricare gli articoli.');
    }
  };

  const closeModal = () => (backdrop.style.display = 'none');

  btn.addEventListener('click', (e) => { e.preventDefault(); openModal(); });
  cancel?.addEventListener('click', closeModal);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModal(); });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const articoloId = selArt.value;
    const quantita = Number(qty.value);
    const tipo = (form.querySelector('input[name="mr-tipo"]:checked')?.value) || 'entrata';
    if (!articoloId || !Number.isFinite(quantita) || quantita <= 0) {
      alert('Seleziona un articolo e inserisci una quantità valida.');
      return;
    }
    submit.disabled = true;
    try {
      await fetchJson(API.movimenti, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articoloId, quantita, tipo, note: note.value?.trim() || null })
      });
      closeModal();
      alert('Movimento registrato.');
      // Se esistono, aggiorna i pannelli
      (window.loadInventario?.bind(window) || (()=>{}))();
      (window.loadKpiMagazzino?.bind(window) || (()=>{}))();
      (window.loadSottoSoglia?.bind(window) || (()=>{}))();
    } catch (err) {
      console.error('Errore creazione movimento', err);
      alert('Errore durante il salvataggio del movimento.');
    } finally {
      submit.disabled = false;
    }
  });
})();