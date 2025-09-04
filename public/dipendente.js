/* eslint-env browser */

window.addEventListener('DOMContentLoaded', () => {
  const utenteString = localStorage.getItem('utente');
  if (!utenteString) {
    window.location.href = 'login.html';
    return;
  }

  const utente = JSON.parse(utenteString);
  document.getElementById('nome-dipendente').textContent = utente.nome;
  document.getElementById('logout-btn').addEventListener('click', () => {
    localStorage.removeItem('utente');
    window.location.href = 'login.html';
  });

  caricaCalendario(utente.username);
});

async function caricaCalendario(username) {
  const container = document.getElementById('calendario-settimanale');
  try {
    const response = await fetch(`/dipendenti/mio-calendario/${username}`);
    const data = await response.json();

    if (data.success && data.assegnazioni.length > 0) {
      container.innerHTML = '<h3>Assegnazioni Programmate:</h3>';
      data.assegnazioni.sort((a, b) => new Date(a.data) - new Date(b.data));
      
      data.assegnazioni.forEach(assegnazione => {
        const divAssegnazione = document.createElement('div');
        divAssegnazione.className = 'card';
        divAssegnazione.style.borderLeft = '5px solid #3498db';
        
        // Corretto per usare solo chiavi in minuscolo
        const dataFormattata = new Date(assegnazione.data).toLocaleDateString('it-IT');
        
        divAssegnazione.innerHTML = `
          <p><strong>Data:</strong> ${dataFormattata}</p>
          <p><strong>Cantiere:</strong> ${assegnazione.nomecantiere}</p>
          <label for="ore-${assegnazione.data}">Ore Svolte:</label>
          <input type="number" step="0.5" id="ore-${assegnazione.data}" placeholder="Es. 8.5">
          <button class="save-btn">Salva Ore</button>
          <p class="feedback" style="color: green;"></p>
        `;
        
        divAssegnazione.querySelector('.save-btn').addEventListener('click', () => {
          const oreSvolte = document.getElementById(`ore-${assegnazione.data}`).value;
          if (oreSvolte) {
            salvaOreLavorate(username, assegnazione, oreSvolte, divAssegnazione.querySelector('.feedback'));
          }
        });
        container.appendChild(divAssegnazione);
      });
    } else {
      container.innerHTML = '<p>Nessuna assegnazione trovata per te al momento.</p>';
    }
  } catch (error) {
    console.error('Errore nel caricamento del calendario:', error);
    container.innerHTML = '<p>Errore nel caricamento del calendario.</p>';
  }
}

async function salvaOreLavorate(username, assegnazione, oreSvolte, feedbackElement) {
  // Corretto per inviare solo chiavi in minuscolo
  const datiDaSalvare = {
    data: assegnazione.data,
    usernamedipendente: username,
    nomecantiere: assegnazione.nomecantiere,
    oresvolte: parseFloat(oreSvolte)
  };

  const response = await fetch('/dipendenti/salva-ore', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(datiDaSalvare),
  });

  const risultato = await response.json();
  if (risultato.success) {
    feedbackElement.textContent = '✅ Ore salvate!';
    setTimeout(() => { feedbackElement.textContent = ''; }, 3000);
  } else {
    feedbackElement.style.color = 'red';
    feedbackElement.textContent = '❌ Errore nel salvataggio.';
  }
}