/* eslint-env browser, es2021 */
/* global L */

document.addEventListener('DOMContentLoaded', () => {
  const mapEl = document.getElementById('map');
  if (!mapEl || typeof L === 'undefined') {
    return; // niente Leaflet su questa pagina
  }

  const map = L.map('map').setView([41.902782, 12.496366], 6); // Centro sull'Italia
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);

  const formCantiere = document.getElementById('formCantiere');
  const conferma = document.getElementById('conferma');
  const listaCantieriDiv = document.getElementById('listaCantieri');
  const hamburger = document.querySelector('.hamburger');
  const closeBtn = document.querySelector('.close-btn');
  const nav = document.querySelector('.menu-nav');

  hamburger.addEventListener('click', () => nav.classList.add('open'));
  closeBtn.addEventListener('click', () => nav.classList.remove('open'));

  let markers = {}; // Oggetto per tenere traccia dei marker sulla mappa

  // Funzione per aggiungere un cantiere alla UI (mappa e tabella)
  function aggiungiCantiereAllaUI(cantiere) {
      // Aggiungi alla tabella
      const row = document.createElement('div');
      row.className = 'table-row';
      row.innerHTML = `
          <div>${cantiere.ID || cantiere.id}</div>
          <div>${cantiere.NomeCantiere || cantiere.nome}</div>
          <div>${cantiere.Indirizzo || cantiere.indirizzo}</div>
      `;
      listaCantieriDiv.appendChild(row);

      // Aggiungi alla mappa (solo se ha coordinate valide)
      const lat = parseFloat(cantiere.Lat || cantiere.lat);
      const lon = parseFloat(cantiere.Lon || cantiere.lon);

      if (!isNaN(lat) && !isNaN(lon)) {
          const marker = L.marker([lat, lon]).addTo(map)
              .bindPopup(`<b>${cantiere.NomeCantiere || cantiere.nome}</b><br>${cantiere.Indirizzo || cantiere.indirizzo}`);
          markers[cantiere.ID || cantiere.id] = marker;
      }
  }

  // Funzione per caricare i cantieri dal server
  async function caricaCantieri() {
      try {
          const response = await fetch('/dashboard/api/cantieri');
          if (!response.ok) throw new Error('Errore nel caricamento dei cantieri');
          
          const cantieri = await response.json();
          
          listaCantieriDiv.innerHTML = `
              <div class="table-header">
                  <div>ID</div>
                  <div>Nome</div>
                  <div>Indirizzo</div>
              </div>
          `; // Pulisce la lista e aggiunge l'header

          if (cantieri.length === 0) {
              listaCantieriDiv.innerHTML += '<p>Nessun cantiere trovato.</p>';
          } else {
              cantieri.forEach(aggiungiCantiereAllaUI);
          }
      } catch (error) {
          console.error('Errore:', error);
          listaCantieriDiv.innerHTML = '<p>Impossibile caricare la lista dei cantieri.</p>';
      }
  }

  // Gestione del form di aggiunta cantiere
  formCantiere.addEventListener('submit', async (e) => {
      e.preventDefault();
      conferma.textContent = 'Ricerca coordinate in corso...';
      conferma.className = 'feedback-info';

      const nome = document.getElementById('nome').value;
      const città = document.getElementById('città').value;

      try {
          // FASE 1: Geocoding con OpenCage
          const geoResponse = await fetch(`/admin/geocode?city=${encodeURIComponent(città)}`);
          const geoData = await geoResponse.json();

          if (!geoResponse.ok || !geoData.lat || !geoData.lon) {
              throw new Error(geoData.message || 'Città non trovata o errore di geocoding.');
          }
          
          conferma.textContent = 'Coordinate trovate. Salvataggio cantiere...';
          
          // FASE 2: Salvataggio nel nostro database
          const saveResponse = await fetch('/api/add', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ nome, indirizzo: città, lat: geoData.lat, lon: geoData.lon }),
          });
          const result = await saveResponse.json();

          if (!saveResponse.ok) {
              throw new Error(result.message || 'Errore nel salvataggio del cantiere.');
          }
          
          // FASE 3: Aggiornamento UI
          conferma.textContent = result.message;
          conferma.className = 'feedback-successo';
          formCantiere.reset();
          
          // Aggiunge il nuovo cantiere alla UI senza ricaricare la pagina
          aggiungiCantiereAllaUI(result); 

      } catch (error) {
          console.error('Errore nel processo di aggiunta:', error);
          conferma.textContent = `Errore: ${error.message}`;
          conferma.className = 'feedback-errore';
      }
  });

  // Caricamento iniziale
  caricaCantieri();
});