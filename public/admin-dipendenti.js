/* eslint-env browser, es2021 */

/**
 * Funzione per caricare i dati dei dipendenti e creare la tabella.
 */
async function caricaDipendenti() {
    const container = document.getElementById('tabella-dipendenti');
    if (!container) return;

    try {
        const response = await fetch('/dipendenti/tutti');
        if (!response.ok) throw new Error('Errore nel caricamento dei dipendenti');
        const dipendenti = await response.json();

        if (!dipendenti || dipendenti.length === 0) {
            container.innerHTML = '<p>Nessun dipendente trovato.</p>';
            return;
        }

        let html = `
            <table>
                <thead>
                    <tr>
                        <th>Nome</th>
                        <th>Username</th>
                        <th>Password (PIN)</th>
                        <th>Mansione</th>
                        <th>Cellulare</th>
                    </tr>
                </thead>
                <tbody>
        `;
        dipendenti.forEach(dip => {
            html += `
                <tr>
                    <td>${dip.Nome || ''}</td>
                    <td>${dip.username || ''}</td>
                    <td>${dip.password || ''}</td>
                    <td>${dip.Mansione || 'N/D'}</td>
                    <td>${dip.Cellulare || 'N/D'}</td>
                </tr>
            `;
        });
        html += `</tbody></table>`;
        container.innerHTML = html;

    } catch (error) {
        container.innerHTML = `<p style="color: red;">${error.message}</p>`;
    }
}

/**
 * Funzione per aggiungere un nuovo dipendente.
 */
async function aggiungiDipendente(event) {
    event.preventDefault();
    const confermaDiv = document.getElementById('conferma-dipendente');
    const dati = {
        Nome: document.getElementById('nome').value,
        username: document.getElementById('username').value,
        password: document.getElementById('password').value,
        Mansione: document.getElementById('mansione').value,
        Cellulare: document.getElementById('cellulare').value,
    };

    try {
        const response = await fetch('/dipendenti/aggiungi', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dati),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || 'Errore sconosciuto');

        confermaDiv.textContent = 'Dipendente aggiunto con successo!';
        confermaDiv.style.color = 'green';
        document.getElementById('dipendentiForm').reset();
        caricaDipendenti(); // Ricarica la tabella

    } catch (error) {
        confermaDiv.textContent = `Errore: ${error.message}`;
        confermaDiv.style.color = 'red';
    }
    setTimeout(() => { confermaDiv.textContent = ''; }, 5000);
}

document.addEventListener('DOMContentLoaded', () => {
  const dipendenteForm = document.getElementById('dipendenteForm');
  const confermaMsg = document.getElementById('conferma-dipendente');
  const listaDiv = document.getElementById('lista-dipendenti');

  async function caricaDipendenti__dup1() {
    if (!listaDiv) return;
    listaDiv.innerHTML = '<p>Caricamento dipendenti...</p>';
    try {
      const res = await fetch('/dipendenti');
      if (!res.ok) throw new Error('Errore nel caricamento dei dipendenti');
      const rows = await res.json();
      if (!rows.length) {
        listaDiv.innerHTML = '<p>Nessun dipendente presente.</p>';
        return;
      }
      let html = `
        <table class="table">
          <thead>
            <tr><th>Nome</th><th>Username</th><th>Mansione</th><th>Cellulare</th></tr>
          </thead>
          <tbody>
      `;
      for (const r of rows) {
        html += `<tr>
          <td>${r.NomeCompleto}</td>
          <td>${r.Username || ''}</td>
          <td>${r.Mansione || ''}</td>
          <td>${r.Cellulare || ''}</td>
        </tr>`;
      }
      html += '</tbody></table>';
      listaDiv.innerHTML = html;
    } catch (e) {
      console.error(e);
      listaDiv.innerHTML = '<p>Impossibile caricare i dipendenti.</p>';
    }
  }

  if (dipendenteForm) {
    dipendenteForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      confermaMsg.textContent = 'Salvataggio dipendente in corso...';
      confermaMsg.className = 'feedback-info';

      const payload = {
        nomeCompleto: document.getElementById('nomeCompleto').value,
        username: document.getElementById('username').value,
        password: document.getElementById('password').value,
        mansione: document.getElementById('mansione').value,
        cellulare: document.getElementById('cellulare').value,
      };

      try {
        const res = await fetch('/dipendenti', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.message || 'Errore inserimento');

        confermaMsg.textContent = result.message;
        confermaMsg.className = 'feedback-successo';
        dipendenteForm.reset();
        caricaDipendenti(); // aggiorna lista
      } catch (err) {
        console.error(err);
        confermaMsg.textContent = `Errore: ${err.message}`;
        confermaMsg.className = 'feedback-errore';
      }
    });
  }

  // primo caricamento lista
  caricaDipendenti();
});