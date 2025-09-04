const express = require('express');
const router = express.Router();
// opzionale: const db = require('../db'); // se hai il pool MySQL

// rotta di test
router.get('/ping', (req, res) => res.json({ ok: true, at: new Date().toISOString() }));

// GET movimenti: fallback per non bloccare la UI se la query fallisce
router.get('/movimenti', async (req, res) => {
  try {
    // ...existing code...
    // Esempio con DB (adatta a tabelle/colonne reali)
    // const [rows] = await db.query('SELECT id,data,articoloId,quantita,tipo,note FROM movimenti ORDER BY data DESC LIMIT 200');
    // return res.json(rows);

    // Fallback se DB/tabelle non pronte:
    return res.json([]);
  } catch (err) {
    console.error('[GET /magazzino/movimenti]', err);
    return res.json([]); // non rompere la pagina
  }
});

// POST movimento rapido
router.post('/movimenti', async (req, res) => {
  try {
    const { articoloId, quantita, tipo, note, data } = req.body || {};
    if (!articoloId || !Number.isFinite(+quantita) || +quantita <= 0 || !['entrata', 'uscita'].includes(String(tipo))) {
      return res.status(400).json({ message: 'Payload invalido' });
    }
    const qta = Math.abs(+quantita);
    const when = data ? new Date(data) : new Date();

    // Esempio con DB (scommenta e adatta a schema reale)
    // const sql = 'INSERT INTO movimenti (data, articoloId, quantita, tipo, note) VALUES (?,?,?,?,?)';
    // const params = [when, articoloId, qta, tipo, note || null];
    // const [result] = await db.query(sql, params);
    // return res.status(201).json({ id: result.insertId, articoloId, quantita: qta, tipo, note: note || null, data: when });

    // Fallback: rispondi 201 così la UI continua a funzionare
    return res.status(201).json({ id: Date.now(), articoloId, quantita: qta, tipo, note: note || null, data: when });
  } catch (err) {
    console.error('[POST /magazzino/movimenti]', err);
    return res.status(500).json({ message: 'Errore creazione movimento' });
  }
});

module.exports = router;