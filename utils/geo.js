const fetch = require("node-fetch");

/**
 * Converte un nome di città in coordinate geografiche (latitudine, longitudine)
 * utilizzando l'API di Open-Meteo.
 * @param {string} citta - Il nome della città da cercare.
 * @returns {Promise<{latitudine: number, longitudine: number}>} Un oggetto con latitudine e longitudine.
 */
async function getCoordinateDaCitta(citta) {
  if (!citta) {
    console.warn("Tentativo di geocodifica senza nome città.");
    return { latitudine: 0, longitudine: 0 };
  }
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(citta)}&count=1&language=it&format=json`;
  try {
    const response = await fetch(url);
    const data = await response.json();
    if (data.results && data.results.length > 0) {
      const { latitude, longitude } = data.results[0];
      return { latitudine: latitude, longitudine: longitude };
    }
    console.warn(`Nessuna coordinata trovata per la città: ${citta}`);
    return { latitudine: 0, longitudine: 0 };
  } catch (error) {
    console.error(`Errore durante la geocodifica per ${citta}:`, error);
    return { latitudine: 0, longitudine: 0 };
  }
}

module.exports = { getCoordinateDaCitta };