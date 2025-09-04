document.addEventListener('DOMContentLoaded', () => {
  const pianificaForm = document.getElementById('pianificaForm');
  const cantiereSelect = document.getElementById('seleziona-cantiere');
  const dipendenteSelect = document.getElementById('seleziona-dipendente');
  const dataInput = document.getElementById('seleziona-data');
  const confermaMsg = document.getElementById('conferma-pianificazione');
  const tabellaDiv = document.getElementById('tabella-pianificazioni');

  const toIso = (s) => {
    if (!s) return s;
    const m = String(s).match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})$/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : s;
  };

  let dipendentiCache = [];

  async function caricaDipendenti() {
    try {
      const res = await fetch('/dashboard/api/dipendenti');
      if (!res.ok) throw new Error();
      dipendentiCache = await res.json();
    } catch {
      dipendentiCache = [];
    }
  }

  async function popolaSelect(select, url, valueKey, textKey, defaultText) {
    if (!select) return;
    select.innerHTML = `<option value="">${defaultText}</option>`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const items = await res.json();
      for (const it of items) {
        const opt = document.createElement('option');
        opt.value = it[valueKey];
        opt.textContent = it[textKey];
        select.appendChild(opt);
      }
    } catch (e) {
      console.error(e);
      select.innerHTML = `<option value="">Errore caricamento</option>`;
    }
  }

  function optionsDipHtml(excludeIds = []) {
    const ex = new Set(excludeIds.map(String));
    let html = `<option value="">Seleziona...</option>`;
    for (const d of dipendentiCache) {
      if (!ex.has(String(d.ID))) {
        html += `<option value="${d.ID}">${d.NomeCompleto}</option>`;
      }
    }
    return html;
  }

  function chipDip(d) {
    return `<span class="chip" data-dip="${d.ID}" style="display:inline-flex;align-items:center;border:1px solid #ddd;border-radius:12px;padding:2px 8px;margin-right:6px;margin-bottom:4px;">
      ${d.NomeCompleto}
      <button class="chip-x" data-dip="${d.ID}" title="Rimuovi" style="margin-left:6px;border:none;background:transparent;cursor:pointer;">×</button>
    </span>`;
  }

  async function caricaPianificazioni() {
    if (!tabellaDiv) return;
    tabellaDiv.innerHTML = '<p>Caricamento pianificazioni...</p>';
    try {
      const res = await fetch('/dashboard/api/pianificazioni');
      const body = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${body}`);
      const rows = JSON.parse(body);

      let html = `
        <table class="table">
          <thead><tr><th>Data</th><th>Cantiere</th><th>Dipendenti</th><th>Aggiungi</th></tr></thead>
          <tbody>`;
      for (const r of rows) {
        const assegnati = r.Dipendenti || [];
        const assegnatiHtml = assegnati.length
          ? assegnati.map(chipDip).join('')
          : '<span style="color:#888;">Nessuno</span>';

        html += `
          <tr data-id="${r.ID}">
            <td>${r.Data}</td>
            <td>${r.NomeCantiere}</td>
            <td class="td-dip">${assegnatiHtml}</td>
            <td>
              <select class="asgn-dip" style="min-width:180px;">
                ${optionsDipHtml(assegnati.map(x => x.ID))}
              </select>
              <button class="btn-assign btn btn-sm btn-secondary">Aggiungi</button>
            </td>
          </tr>`;
      }
      html += '</tbody></table>';
      tabellaDiv.innerHTML = html;
    } catch (e) {
      console.error(e);
      tabellaDiv.innerHTML = '<p>Impossibile caricare le pianificazioni.</p>';
    }
  }

  // Delegation: aggiungi/rimuovi
  if (tabellaDiv) {
    tabellaDiv.addEventListener('click', async (e) => {
      const tr = e.target.closest('tr[data-id]');
      if (!tr) return;
      const id = tr.getAttribute('data-id');

      if (e.target.classList.contains('btn-assign')) {
        const sel = tr.querySelector('select.asgn-dip');
        const idDipendente = sel && sel.value;
        if (!idDipendente) return;
        e.target.disabled = true;
        try {
          const res = await fetch(`/dashboard/api/pianificazioni/${id}/assegna`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idDipendente })
          });
          if (!res.ok) throw new Error('HTTP ' + res.status);
          await caricaPianificazioni();
        } catch (err) {
          console.error(err);
        } finally {
          e.target.disabled = false;
        }
      }

      if (e.target.classList.contains('chip-x')) {
        const dip = e.target.getAttribute('data-dip');
        e.target.disabled = true;
        try {
          const res = await fetch(`/dashboard/api/pianificazioni/${id}/assegna/${dip}`, { method: 'DELETE' });
          if (!res.ok) throw new Error('HTTP ' + res.status);
          await caricaPianificazioni();
        } catch (err) {
          console.error(err);
        } finally {
          e.target.disabled = false;
        }
      }
    });
  }

  // inizializzazione form e tabella
  popolaSelect(cantiereSelect, '/dashboard/api/cantieri', 'ID', 'NomeCantiere', 'Seleziona un cantiere');
  (async () => {
    await caricaDipendenti();
    await popolaSelect(dipendenteSelect, '/dashboard/api/dipendenti', 'ID', 'NomeCompleto', 'Seleziona un dipendente');
    await caricaPianificazioni();
  })();

  if (pianificaForm) {
    pianificaForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (confermaMsg) { confermaMsg.textContent = 'Salvataggio pianificazione...'; confermaMsg.className = 'feedback-info'; }

      const payload = {
        idCantiere: cantiereSelect.value,
        idDipendente: dipendenteSelect.value || undefined,
        data: toIso(dataInput.value),
      };

      try {
        const res = await fetch('/dashboard/api/pianifica', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const text = await res.text();
        const body = (() => { try { return JSON.parse(text); } catch { return { message: text }; }})();
        if (!res.ok) throw new Error(body.message || text || 'Errore pianificazione');

        if (confermaMsg) { confermaMsg.textContent = body.message || 'Ok'; confermaMsg.className = 'feedback-successo'; }
        pianificaForm.reset();
        await caricaPianificazioni();
      } catch (err) {
        if (confermaMsg) { confermaMsg.textContent = `Errore: ${err.message}`; confermaMsg.className = 'feedback-errore'; }
      }
    });
  }
});