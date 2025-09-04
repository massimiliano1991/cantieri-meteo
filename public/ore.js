/* eslint-env browser, es2021 */

// =============================================
//               VARIABILE GLOBALE
// =============================================
// Conserva i dati originali presi dal server per evitare chiamate multiple.
let datiOreOriginali = [];


// =============================================
//          FUNZIONI PER POPOLARE I MENU
// =============================================
// Carica i dipendenti nel menu a tendina del form.
async function caricaDipendenti() {
  const selectForm = document.getElementById("select-dipendente");
  if (!selectForm) return; // Sicurezza: esce se l'elemento non esiste

  const res = await fetch("/ore/dipendenti");
  const dipendenti = await res.json();

  selectForm.innerHTML = '<option value="">-- Seleziona dipendente --</option>';
  dipendenti.forEach(nome => {
    selectForm.appendChild(new Option(nome, nome));
  });
}

// Carica i cantieri nel menu a tendina del form.
async function caricaCantieri() {
  const selectForm = document.getElementById("select-cantiere");
  if (!selectForm) return; // Sicurezza: esce se l'elemento non esiste

  const res = await fetch("/cantieri/nomi");
  const cantieri = await res.json();
  
  selectForm.innerHTML = '<option value="">-- Seleziona cantiere --</option>';
  cantieri.forEach(nome => {
    selectForm.appendChild(new Option(nome, nome));
  });
}


// =============================================
//      FUNZIONI PER DASHBOARD E TABELLA
// =============================================

// Aggiorna la dashboard con le statistiche globali calcolate dai dati.
function aggiornaDashboard(dati) {
  const container = document.getElementById("dashboard");
  if (!container) return;
  
  const oggi = new Date();
  const meseCorrente = oggi.getMonth();
  const annoCorrente = oggi.getFullYear();

  const oreMeseCorrente = dati
    .filter(riga => {
      const dataRiga = new Date(riga.data);
      return dataRiga.getMonth() === meseCorrente && dataRiga.getFullYear() === annoCorrente;
    })
    .reduce((tot, riga) => tot + riga.oreTotali, 0);

  const oreTotali = dati.reduce((tot, riga) => tot + riga.oreTotali, 0);
  const cantieriAttivi = new Set(dati.map(riga => riga.cantiere)).size;

  // Layout a griglia per la dashboard
  container.innerHTML = `
    <div class="form-grid">
        <div class="stat-box">
            <h3>Ore Mese Corrente</h3>
            <p>${oreMeseCorrente.toFixed(2)}</p>
        </div>
        <div class="stat-box">
            <h3>Ore Totali Complessive</h3>
            <p>${oreTotali.toFixed(2)}</p>
        </div>
        <div class="stat-box">
            <h3>Cantieri Attivi</h3>
            <p>${cantieriAttivi}</p>
        </div>
    </div>
  `;
}

// Crea la tabella principale con tutte le ore inserite.
function creaTabellaOre(dati) {
  const container = document.getElementById("tabella-ore");
  if (!container) return;
  
  if (!dati.length) {
    container.innerHTML = "<p>Nessuna ora inserita.</p>";
    return;
  }
  
  let html = `
    <table>
      <thead>
        <tr>
          <th>Data</th>
          <th>Dipendente</th>
          <th>Cantiere</th>
          <th>Inizio</th>
          <th>Fine</th>
          <th>Ore Totali</th>
        </tr>
      </thead>
      <tbody>
  `;
  dati.forEach(riga => {
    html += `
      <tr>
        <td>${new Date(riga.data).toLocaleDateString('it-IT')}</td>
        <td>${riga.dipendente}</td>
        <td>${riga.cantiere}</td>
        <td>${riga.orainizio}</td>
        <td>${riga.orafine}</td>
        <td>${riga.oreTotali.toFixed(2)}</td>
      </tr>
    `;
  });
  html += `</tbody></table>`;
  container.innerHTML = html;
}


// =============================================
//      FUNZIONI DI UTILITÀ E FLUSSO PRINCIPALE
// =============================================

// Funzione di utilità per calcolare le ore.
function calcolaOre(inizio, fine) {
  if (!inizio || !fine) return 0;
  const [h1, m1] = inizio.split(":").map(Number);
  const [h2, m2] = fine.split(":").map(Number);
  const minutiTotali = (h2 * 60 + m2) - (h1 * 60 + m1);
  return minutiTotali / 60;
}

// Funzione principale: carica i dati, li processa e aggiorna le viste.
async function caricaDatiIniziali() {
  try {
    const response = await fetch("/ore/report");
    const datiJSON = await response.json();
    
    // Calcola le ore totali per ogni riga e ordina per data
    datiJSON.forEach(riga => {
      riga.oreTotali = calcolaOre(riga.orainizio, riga.orafine);
    });
    datiJSON.sort((a, b) => new Date(b.data) - new Date(a.data));

    datiOreOriginali = datiJSON;
    
    // Aggiorna la UI con i dati freschi
    aggiornaDashboard(datiOreOriginali);
    creaTabellaOre(datiOreOriginali);
    
  } catch (error) {
    console.error("Errore nel caricamento dei dati iniziali:", error);
    const dashboard = document.getElementById("dashboard");
    if(dashboard) dashboard.innerHTML = "<p>⚠️ Impossibile caricare i dati dal server.</p>";
  }
}

// =============================================
//              GESTIONE EVENTI
// =============================================

// Esegue il codice solo quando il DOM è completamente caricato.
document.addEventListener('DOMContentLoaded', () => {
  // prova più selettori per compatibilità con HTML esistente
  const q = (a) => document.querySelector(a);
  const form = document.getElementById('oreForm') || q('form#ore-form') || q('form[name="oreForm"]');
  const msg = document.getElementById('ore-feedback') || q('#feedback-ore');
  const selDip = document.getElementById('seleziona-dipendente') || q('select[name="dipendente"]');
  const selCant = document.getElementById('seleziona-cantiere') || q('select[name="cantiere"]');
  const dataInput = document.getElementById('seleziona-data') || q('input[name="data"]');
  const oraInizio = document.getElementById('ora-inizio') || q('input[name="oraInizio"]');
  const oraFine = document.getElementById('ora-fine') || q('input[name="oraFine"]');

  const toIso = (s) => {
    if (!s) return s;
    const m = String(s).match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})$/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : s;
  };

  async function popola(select, url, vk, tk, placeholder) {
    if (!select) return;
    select.innerHTML = `<option value="">${placeholder}</option>`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error();
      const items = await res.json();
      for (const it of items) {
        const o = document.createElement('option');
        o.value = it[vk];
        o.textContent = it[tk];
        select.appendChild(o);
      }
    } catch {
      select.innerHTML = `<option value="">Errore caricamento</option>`;
    }
  }

  popola(selDip, '/dashboard/api/dipendenti', 'ID', 'NomeCompleto', 'Seleziona un dipendente');
  popola(selCant, '/dashboard/api/cantieri', 'ID', 'NomeCantiere', 'Seleziona un cantiere');

  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (msg) { msg.textContent = 'Salvataggio in corso...'; msg.className = 'feedback-info'; }

    const payload = {
      idDipendente: selDip && selDip.value,
      idCantiere: selCant && selCant.value,
      data: toIso(dataInput && dataInput.value),
      oraInizio: oraInizio && oraInizio.value,
      oraFine: oraFine && oraFine.value
    };

    try {
      const res = await fetch('/dashboard/api/ore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const text = await res.text();
      const body = (() => { try { return JSON.parse(text); } catch { return { message: text }; }})();
      if (!res.ok) throw new Error(body.message || text || 'Errore salvataggio ore');

      if (msg) { msg.textContent = body.message || 'Ore salvate.'; msg.className = 'feedback-successo'; }
      form.reset();
    } catch (err) {
      if (msg) { msg.textContent = `Errore: ${err.message}`; msg.className = 'feedback-errore'; }
    }
  });
});