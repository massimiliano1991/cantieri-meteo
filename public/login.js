/* eslint-env browser */

// Selezioniamo gli elementi HTML con cui dobbiamo interagire
const formLogin = document.getElementById('formLogin');
const messaggioErroreDiv = document.getElementById('messaggio-errore');

// Aggiungiamo un "ascoltatore" che si attiva quando il form viene inviato
formLogin.addEventListener('submit', async (event) => {
  // Preveniamo il ricaricamento automatico della pagina
  event.preventDefault();

  // Puliamo eventuali messaggi di errore precedenti
  messaggioErroreDiv.textContent = '';

  // Prendiamo i valori inseriti dall'utente
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;

  try {
    // Usiamo fetch per inviare i dati al nostro backend (all'API che abbiamo creato prima)
    const response = await fetch('/dipendenti/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, password }),
    });

    // Aspettiamo la risposta del server e la convertiamo in JSON
    const data = await response.json();

    if (data.success) {
      // Se il server risponde "success: true", il login è corretto!
      
      // Salviamo le informazioni dell'utente nel browser per usarle nella prossima pagina
      localStorage.setItem('utente', JSON.stringify(data.utente));
      
      // Reindirizziamo l'utente alla sua pagina personale (che creeremo dopo)
      window.location.href = 'dipendente.html';
      
    } else {
      // Se il server risponde "success: false", mostriamo l'errore
      messaggioErroreDiv.textContent = `Errore: ${data.message}`;
    }
  } catch (error) {
    // In caso di errore di rete o altri problemi
    messaggioErroreDiv.textContent = 'Si è verificato un problema di connessione con il server.';
    console.error('Errore nel processo di login:', error);
  }
});