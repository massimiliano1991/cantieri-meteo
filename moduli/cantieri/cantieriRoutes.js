const express = require('express');
const router = express.Router();

// Connessione MySQL dal file db.js nella root del progetto
const db = require('../../db');

// GET /cantieri/tutti
// Restituisce l'elenco cantieri dal DB MySQL come array di oggetti JSON
router.get('/tutti', async (_req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT ID, NomeCantiere, Indirizzo, Stato, Lat, Lon
       FROM cantieri`
    );
    res.json(rows);
  } catch (err) {
    console.error('GET /cantieri/tutti ->', err);
    res.status(500).json({ message: 'Errore nel caricamento dei cantieri.' });
  }
});

// GET /cantieri/nomi
// Restituisce solo i nomi dei cantieri come array di stringhe
router.get('/nomi', async (_req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT DISTINCT NomeCantiere
       FROM cantieri
       ORDER BY NomeCantiere ASC`
    );
    const nomi = rows
      .map(r => r.NomeCantiere)
      .filter(n => n !== null && n !== undefined && String(n).trim() !== '');
    res.json(nomi);
  } catch (err) {
    console.error('GET /cantieri/nomi ->', err);
    res.status(500).json({ message: 'Errore nel caricamento dei nomi dei cantieri.' });
  }
});

module.exports = router;