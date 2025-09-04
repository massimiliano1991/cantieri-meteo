const express = require("express");
const router = express.Router();
const XLSX = require("xlsx");
const { leggiCantieriDaExcel, scriviCantieriSuExcel } = require("../utils/excel");
const { getMeteoOWM, getMeteoWeatherbit } = require("../utils/meteo");
const { getCoordinateDaCitta } = require("../index.js");

// Funzione helper locale
function aggiungiUnGiorno(dataStr) {
  const d = new Date(dataStr);
  d.setDate(d.getDate() + 1);
  return d.toLocaleDateString("sv-SE");
}

// --- DEFINIZIONE DI TUTTE LE ROTTE ---

// GET /cantieri/tutti - Recupera tutti i cantieri
router.get("/tutti", async (req, res) => {
  try {
    const cantieri = await leggiCantieriDaExcel();
    res.json(cantieri);
  } catch (err) {
    console.error("❌ Errore lettura cantieri:", err);
    res.status(500).json({ messaggio: "Errore nel recupero dei cantieri" });
  }
});

// GET /cantieri/domani - Recupera solo i cantieri di domani
router.get("/domani", async (req, res) => {
  try {
    const cantieri = await leggiCantieriDaExcel();
    const oggi = new Date();
    const domani = new Date(oggi.getTime() + 24 * 60 * 60 * 1000);
    const dataDomani = domani.toLocaleDateString("sv-SE");
    const cantieriDomani = cantieri.filter(c => c.data.trim() === dataDomani);
    res.json(cantieriDomani);
  } catch (err) {
    console.error("❌ Errore:", err);
    res.status(500).json({ errore: "Errore nel recupero dei cantieri" });
  }
});

// POST /cantieri/aggiungi - Aggiunge un nuovo cantiere
router.post("/aggiungi", async (req, res) => {
  try {
    const { nome, città, data } = req.body;
    if (!nome || !città || !data) {
        return res.status(400).json({ messaggio: "Nome, città e data sono obbligatori." });
    }
    const coords = await getCoordinateDaCitta(città);
    const [anno, mese, giorno] = data.split("-");
    const dataFormattata = `${anno}-${mese.padStart(2, "0")}-${giorno.padStart(2, "0")}`;

    const nuovoCantiere = {
      nome,
      città,
      latitudine: coords.latitudine,
      longitudine: coords.longitudine,
      data: dataFormattata
    };

    const cantieriEsistenti = await leggiCantieriDaExcel();
    cantieriEsistenti.push(nuovoCantiere);
    await scriviCantieriSuExcel(cantieriEsistenti);

    res.status(201).json({ messaggio: "✅ Cantiere aggiunto correttamente!" });
  } catch (err) {
    console.error("❌ Errore aggiunta cantiere:", err);
    res.status(500).json({ messaggio: "Errore durante l'aggiunta del cantiere" });
  }
});

// POST /cantieri/elimina - Elimina un cantiere
router.post("/elimina", async (req, res) => {
  try {
    const { nome, città } = req.body;
    let cantieri = await leggiCantieriDaExcel();
    cantieri = cantieri.filter(c => !(c.nome === nome && c.città === città));
    await scriviCantieriSuExcel(cantieri);
    res.json({ messaggio: "✅ Cantiere eliminato" });
  } catch (err) {
    console.error("❌ Errore eliminazione cantiere:", err);
    res.status(500).json({ messaggio: "Errore durante l'eliminazione del cantiere" });
  }
});

// POST /cantieri/modifica-data - Modifica la data di un cantiere
router.post("/modifica-data", async (req, res) => {
  try {
    const { nome, città, nuovaData } = req.body;
    let cantieri = await leggiCantieriDaExcel();
    cantieri = cantieri.map(c => {
      if (c.nome === nome && c.città === città) {
        c.data = nuovaData;
      }
      return c;
    });
    await scriviCantieriSuExcel(cantieri);
    res.json({ messaggio: "✅ Data aggiornata" });
  } catch (err) {
    console.error("❌ Errore modifica data:", err);
    res.status(500).json({ messaggio: "Errore durante la modifica della data" });
  }
});

// POST /cantieri/aggiorna - Aggiorna lo stato in base al meteo (con modifiche)
router.post("/aggiorna", async (req, res) => {
  try {
    const cantieri = await leggiCantieriDaExcel();
    const oggi = new Date();
    const domani = new Date(oggi.getTime() + 24 * 60 * 60 * 1000);
    const dataDomani = domani.toLocaleDateString("sv-SE");
    const cantieriDomani = cantieri.filter(c => c.data.trim() === dataDomani);
    const risultati = [];

    for (const cantiere of cantieriDomani) {
      const eventi = [...await getMeteoOWM(cantiere.latitudine, cantiere.longitudine, cantiere.data), ...await getMeteoWeatherbit(cantiere.latitudine, cantiere.longitudine, cantiere.data)];
      let stato = "Confermato";
      let motivo = "";

      if (eventi.length > 0) {
        stato = "Spostato";
        motivo = eventi.map(e => `${e.tipo === "rain" ? "pioggia" : e.tipo === "snow" ? "neve" : "pioggia leggera"} alle ${e.ora} (${e.mm} mm) da ${e.fonte}`).join(", ");
        cantiere.data = aggiungiUnGiorno(cantiere.data);
      }
      risultati.push({ nome: cantiere.nome, città: cantiere.città, stato, motivo, nuovaData: cantiere.data });
    }
    await scriviCantieriSuExcel(cantieri);
    res.json({ aggiornati: risultati });
  } catch (err) {
    console.error("❌ Errore:", err);
    res.status(500).json({ errore: "Errore durante l'aggiornamento dei cantieri" });
  }
});

// POST /cantieri/simulazione - Simula lo stato (senza modifiche)
router.post("/simulazione", async (req, res) => {
  try {
    const cantieriOriginali = await leggiCantieriDaExcel();
    const cantieri = JSON.parse(JSON.stringify(cantieriOriginali));
    const oggi = new Date();
    const domani = new Date(oggi.getTime() + 24 * 60 * 60 * 1000);
    const dataDomani = domani.toLocaleDateString("sv-SE");
    const cantieriDomani = cantieri.filter(c => c.data.trim() === dataDomani);
    const risultati = [];

    for (const cantiere of cantieriDomani) {
      const eventi = [...await getMeteoOWM(cantiere.latitudine, cantiere.longitudine, cantiere.data), ...await getMeteoWeatherbit(cantiere.latitudine, cantiere.longitudine, cantiere.data)];
      const oreTarget = ["06:00","07:00","08:00","09:00","10:00","11:00","12:00","13:00","14:00","15:00"];
      const oreMeteo = {};

      for (const ora of oreTarget) {
        const evento = eventi.find(e => e.ora === ora);
        oreMeteo[ora] = !evento ? "☀️" : evento.tipo === "rain" ? "🌧️" : evento.tipo === "snow" ? "❄️" : "🌦️";
      }

      let stato = "Confermato";
      if (eventi.length > 0) stato = "Spostato";
      
      risultati.push({
        nome: cantiere.nome,
        città: cantiere.città,
        stato,
        oreMeteo
      });
    }
    res.json({ simulazione: risultati });
  } catch (err) {
    console.error("❌ Errore simulazione:", err);
    res.status(500).json({ errore: "Errore durante la simulazione" });
  }
});


// --- ESPORTAZIONE DEL ROUTER ---
// Deve essere l'ultima istruzione del file
module.exports = router;