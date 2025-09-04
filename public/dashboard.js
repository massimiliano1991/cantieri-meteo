/* eslint-env browser, es2021 */
/* global Chart */

// --- FUNZIONI DI VISUALIZZAZIONE ---

function popolaNotifiche(notifiche) {
    const container = document.getElementById('notifiche-widget');
    if (!container) return;

    let html = '<h2>🔔 Notifiche</h2><div class="notifiche-grid">';
    
    if (notifiche.scadenzeScadute > 0) {
        html += `<div class="notifica-item urgenza-alta">
            <h3>${notifiche.scadenzeScadute}</h3>
            <p>Scadenze Superate</p>
        </div>`;
    }
    
    if (notifiche.scadenzeImminenti > 0) {
        html += `<div class="notifica-item urgenza-media">
            <h3>${notifiche.scadenzeImminenti}</h3>
            <p>Scadenze in Arrivo</p>
        </div>`;
    }

    if (html.endsWith('<div class="notifiche-grid">')) {
        container.innerHTML = '<h2>🔔 Notifiche</h2><p>Nessuna notifica importante al momento. Ottimo lavoro!</p>';
    } else {
        html += '</div>';
        container.innerHTML = html;
    }
}

function popolaStatistiche(statistiche) {
    const container = document.getElementById('dashboard-stats-container');
    if (!container) return;
    container.innerHTML = `
        <div class="stat-box"><h3>Ore Mese Corrente</h3><p>${statistiche.oreMese}</p></div>
        <div class="stat-box"><h3>Dipendenti Attivi</h3><p>${statistiche.numDipendenti}</p></div>
        <div class="stat-box"><h3>Scadenze da Pagare</h3><p>${statistiche.scadenzeAperte}</p></div>
        <div class="stat-box"><h3>Ore Totali</h3><p>${statistiche.oreTotali}</p></div>
    `;
}

function creaGraficoOre(datiGrafico) {
    const ctx = document.getElementById('grafico-ore');
    if (!ctx || ctx.chart) return;
    const labels = Array.from({ length: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate() }, (_, i) => i + 1);
    ctx.chart = new Chart(ctx, {
        type: 'bar',
        data: { labels, datasets: [{ label: 'Ore Lavorate', data: datiGrafico, backgroundColor: 'rgba(0, 123, 255, 0.5)', borderColor: 'rgba(0, 123, 255, 1)', borderWidth: 1 }] },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
    });
}

function popolaAttivitaRecenti(attivita) {
    const container = document.getElementById('tabella-attivita-recenti');
    if (!container) return;
    if (!attivita || attivita.length === 0) {
        container.innerHTML = '<p>Nessuna attività recente.</p>';
        return;
    }
    let html = `<table><thead><tr><th>Data</th><th>Dipendente</th><th>Cantiere</th><th>Ore</th></tr></thead><tbody>`;
    attivita.forEach(r => {
        const ore = ((new Date(`1970-01-01T${r.orafine}:00`) - new Date(`1970-01-01T${r.orainizio}:00`)) / 3600000).toFixed(2);
        html += `<tr><td>${new Date(r.data).toLocaleDateString('it-IT')}</td><td>${r.usernamedipendente}</td><td>${r.nomecantiere}</td><td>${ore}</td></tr>`;
    });
    html += '</tbody></table>';
    container.innerHTML = html;
}

function popolaTabellaScadenze(scadenze) {
    const container = document.getElementById('tabella-scadenze');
    if (!container) return;
    if (!scadenze || scadenze.length === 0) {
        container.innerHTML = '<p>Nessuna scadenza presente.</p>';
        return;
    }

    const oggi = new Date();
    oggi.setHours(0, 0, 0, 0);

    let html = `<table><thead><tr><th>Descrizione</th><th>Data</th><th>Importo</th><th>Stato</th><th>ID Fattura</th><th>Azione</th></tr></thead><tbody>`;
    
    scadenze.sort((a, b) => new Date(a.DataScadenza) - new Date(b.DataScadenza)).forEach(s => {
        const dataScadenza = new Date(s.DataScadenza);
        const diffGiorni = (dataScadenza - oggi) / (1000 * 60 * 60 * 24);
        let classeUrgenza = '';

        if (s.Stato === 'Pagato') {
            classeUrgenza = 'stato-pagato';
        } else if (diffGiorni < 0) {
            classeUrgenza = 'stato-scaduta';
        } else if (diffGiorni <= 7) {
            classeUrgenza = 'stato-imminente';
        }

        html += `<tr class="${classeUrgenza}">
            <td>${s.Descrizione}</td>
            <td>${dataScadenza.toLocaleDateString('it-IT')}</td>
            <td>€ ${parseFloat(s.Importo || 0).toFixed(2)}</td>
            <td>${s.Stato}</td>
            <td>${s.ID_Fattura || ''}</td>
            <td>${s.Stato !== 'Pagato' ? `<button class="btn-paga" data-descrizione="${s.Descrizione}">Segna come Pagato</button>` : '✔'}</td>
        </tr>`;
    });

    html += '</tbody></table>';
    container.innerHTML = html;

    document.querySelectorAll('.btn-paga').forEach(button => {
        button.addEventListener('click', async (e) => {
            const descrizione = e.target.dataset.descrizione;
            await aggiornaStatoScadenza(descrizione, 'Pagato');
        });
    });
}

// --- FUNZIONI DI INTERAZIONE CON IL BACKEND ---

async function aggiungiNuovaScadenza(e) {
    e.preventDefault();
    const feedbackDiv = document.getElementById('feedback-scadenze');
    const dati = {
        descrizione: document.getElementById('scadenza-descrizione').value,
        dataScadenza: document.getElementById('scadenza-data').value,
        importo: document.getElementById('scadenza-importo').value,
        idFattura: document.getElementById('scadenza-id').value,
    };

    try {
        const response = await fetch('/scadenze/aggiungi', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dati),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message);
        
        feedbackDiv.textContent = 'Scadenza aggiunta con successo!';
        feedbackDiv.style.color = 'green';
        document.getElementById('form-nuova-scadenza').reset();
        caricaDatiDashboard();
    } catch (error) {
        feedbackDiv.textContent = `Errore: ${error.message}`;
        feedbackDiv.style.color = 'red';
    }
    setTimeout(() => { feedbackDiv.textContent = ''; }, 5000);
}

async function aggiornaStatoScadenza(descrizione, nuovoStato) {
    try {
        const response = await fetch('/scadenze/aggiorna-stato', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ descrizione, nuovoStato }),
        });
        if (!response.ok) throw new Error('Impossibile aggiornare lo stato.');
        caricaDatiDashboard();
    } catch (error) {
        console.error('Errore aggiornamento stato:', error);
    }
}

// --- FUNZIONE PRINCIPALE ---

async function caricaDatiDashboard() {
    try {
        const response = await fetch('/dashboard/dati');
        if (!response.ok) throw new Error(`Errore del server: ${response.status}`);
        const dati = await response.json();

        popolaNotifiche(dati.notifiche);
        popolaStatistiche(dati.statistiche);
        creaGraficoOre(dati.datiGrafico);
        popolaAttivitaRecenti(dati.attivitaRecenti);
        popolaTabellaScadenze(dati.scadenze);

    } catch (error) {
        console.error('Impossibile caricare i dati della dashboard:', error);
        document.body.innerHTML = '<p style="color: red; text-align: center; margin-top: 50px;">⚠️ Errore critico nel caricamento dei dati della dashboard.</p>';
    }
}

// --- EVENT LISTENER PRINCIPALI ---

document.addEventListener('DOMContentLoaded', async () => {
  const errBox = document.getElementById('dashboard-error');

  function showError(msg) {
    if (errBox) { errBox.textContent = msg; errBox.style.display = 'block'; }
  }

  try {
    const res = await fetch('/dashboard/api/overview');
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text.slice(0,120)}`);
    }
    const data = await res.json();
    const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    setText('cards-cantieri', data.cantieri);
    setText('cards-dipendenti', data.dipendenti);
    setText('cards-pianificazioni', data.pianificazioniOggi);
  } catch (e) {
    console.error('Dashboard load error:', e);
    showError('Errore critico nel caricamento dei dati della dashboard.');
  }

  // Programma Lavoro (toggle giorno/settimana/mese) — inizializzazione idempotente
  (function ensureProgrammaUI() {
    if (window._programmaInit) return; // evita duplicazioni
    window._programmaInit = true;

    const root = document.getElementById('programmaWidget');
    if (!root) return; // la sezione potrebbe non essere presente su tutte le pagine

    const toggle = document.getElementById('programmaToggle');
    const tbl = document.getElementById('tblProgramma');
    const tbody = tbl ? tbl.querySelector('tbody') : null;
    const empty = document.getElementById('programmaEmpty');

    let allRows = [];
    let mode = 'day';

    // Utils date
    const parseIso = s => {
      // s è 'YYYY-MM-DD'
      const [y, m, d] = s.split('-').map(Number);
      return new Date(y, m - 1, d);
    };
    const fmtIt = s => s; // DataIt già formattata dal backend
    const ymd = d => d.toISOString().slice(0, 10);

    const startOfWeek = (d) => {
      const dt = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const day = (dt.getDay() + 6) % 7; // lun=0
      dt.setDate(dt.getDate() - day);
      return dt;
    };
    const endOfWeek = (d) => {
      const s = startOfWeek(d);
      const e = new Date(s);
      e.setDate(s.getDate() + 6);
      return e;
    };
    const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
    const endOfMonth = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0);

    function getRange(now, m) {
      if (m === 'week') return { from: startOfWeek(now), to: endOfWeek(now) };
      if (m === 'month') return { from: startOfMonth(now), to: endOfMonth(now) };
      // default giorno
      const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const to = new Date(from);
      return { from, to };
    }

    function render() {
      if (!tbody) return;
      const now = new Date();
      const { from, to } = getRange(now, mode);
      const fromY = ymd(from), toY = ymd(to);

      const filtered = allRows.filter(r => r.DataIso >= fromY && r.DataIso <= toY);

      // sort: data asc, cantiere asc
      filtered.sort((a, b) => (a.DataIso.localeCompare(b.DataIso)) || (a.NomeCantiere || '').localeCompare(b.NomeCantiere || ''));

      if (!filtered.length) {
        tbody.innerHTML = '';
        if (empty) empty.style.display = 'block';
        return;
      }
      if (empty) empty.style.display = 'none';

      const rowsHtml = filtered.map(r => {
        const dip = (r.Dipendenti || []).map(x => x.NomeCompleto).join(', ');
        return `
          <tr>
            <td>${fmtIt(r.DataIt)}</td>
            <td>${r.NomeCantiere || ''}</td>
            <td>${dip}</td>
          </tr>`;
      }).join('');

      tbody.innerHTML = rowsHtml;
    }

    async function load() {
      try {
        const res = await fetch('/dashboard/api/pianificazioni', { headers: { 'Accept': 'application/json' } });
        const data = await res.json();
        if (!Array.isArray(data)) throw new Error('Formato risposta inatteso');
        allRows = data.map(r => ({
          ID: r.ID,
          CantiereID: r.CantiereID,
          NomeCantiere: r.NomeCantiere,
          DataIso: r.DataIso, // per filtri
          DataIt: r.DataIt,   // per display
          Dipendenti: Array.isArray(r.Dipendenti) ? r.Dipendenti : []
        }));
        render();
      } catch (e) {
        console.error('Caricamento pianificazioni fallito:', e);
        if (tbody) tbody.innerHTML = `<tr><td colspan="3" style="color:#b00;">Errore nel caricamento pianificazioni</td></tr>`;
      }
    }

    // Listener toggle — evita registrazioni multiple
    if (toggle && !toggle.dataset.bound) {
      toggle.dataset.bound = '1';
      toggle.addEventListener('click', (ev) => {
        const btn = ev.target.closest('button[data-mode]');
        if (!btn) return;
        const newMode = btn.getAttribute('data-mode');
        if (newMode && newMode !== mode) {
          mode = newMode;
          Array.from(toggle.querySelectorAll('button[data-mode]')).forEach(b => b.classList.toggle('active', b === btn));
          render();
        }
      });
    }

    // Avvio
    load();
  })();
});