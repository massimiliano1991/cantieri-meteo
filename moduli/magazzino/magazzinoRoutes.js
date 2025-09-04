const express = require('express');
const router = express.Router();
const db = require('../../db'); // adatta se differente

router.get('/ping', (req, res) => res.json({ ok: true, at: new Date().toISOString() }));

// GET /magazzino/articoli
router.get('/articoli', async (_req, res) => {
  try {
    const [rows] = await db.query('SELECT id, nome_articolo AS nome, categoria, quantita, soglia_minima FROM magazzino_articoli ORDER BY nome_articolo');
    res.json(rows);
  } catch (e) {
    console.error('GET /magazzino/articoli ->', e.message);
    res.json([]); // fallback per non rompere la UI
  }
});

// GET /magazzino/movimenti
router.get('/movimenti', async (req, res) => {
  try {
    const { articoloId, from, to } = req.query || {};
    const where = [];
    const args = [];
    if (articoloId) { where.push('articolo_id = ?'); args.push(Number(articoloId)); }
    if (from) { where.push('created_at >= ?'); args.push(from + ' 00:00:00'); }
    if (to) { where.push('created_at <= ?'); args.push(to + ' 23:59:59'); }
    const sql = `
      SELECT id, articolo_id, tipo, quantita, costo_unitario, cantiere_id, note, created_at
      FROM magazzino_movimenti
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY created_at DESC, id DESC
      LIMIT 500
    `;
    const [rows] = await db.query(sql, args);
    res.json(rows);
  } catch (e) {
    console.error('GET /magazzino/movimenti ->', e.message);
    res.json([]); // fallback
  }
});

// POST /magazzino/movimenti
router.post('/movimenti', async (req, res) => {
  try {
    const { articoloId, quantita, tipo, note, costoUnitario = null, cantiereId = null } = req.body || {};
    if (!articoloId || !Number.isFinite(+quantita) || +quantita <= 0 || !['carico','scarico','rettifica','entrata','uscita'].includes(String(tipo))) {
      return res.status(400).json({ message: 'Payload invalido' });
    }
    const normalizedTipo = tipo === 'entrata' ? 'carico' : (tipo === 'uscita' ? 'scarico' : tipo);
    const sql = `
      INSERT INTO magazzino_movimenti (articolo_id, tipo, quantita, costo_unitario, cantiere_id, note)
      VALUES (?,?,?,?,?,?)
    `;
    const params = [Number(articoloId), normalizedTipo, Math.abs(+quantita), costoUnitario, cantiereId, note || null];
    const [r] = await db.query(sql, params);
    res.status(201).json({ id: r.insertId, articoloId: Number(articoloId), quantita: Math.abs(+quantita), tipo: normalizedTipo, note: note || null });
  } catch (e) {
    console.error('POST /magazzino/movimenti ->', e.message);
    res.status(500).json({ message: 'Errore creazione movimento' });
  }
});

module.exports = router;