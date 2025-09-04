const express = require('express');
const router = express.Router();
const db = require('../../db'); // pool MySQL

// Helpers
const toInt = (v, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : d;
};

// Utils
const TIPI_MOV = new Set(['carico', 'scarico', 'rettifica']);
const todayIso = () => new Date().toISOString().slice(0, 10);

// GET /magazzino/articoli
router.get('/articoli', async (_req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT id, nome_articolo, categoria, quantita, soglia_minima, fornitore, note, updated_at
      FROM magazzino_articoli
      ORDER BY nome_articolo ASC
    `);
    res.json(rows);
  } catch (err) {
    console.error('GET /magazzino/articoli ->', err);
    res.status(500).json({ message: 'Errore nel caricamento articoli.' });
  }
});

// GET /magazzino/kpi
router.get('/kpi', async (_req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        COUNT(*)                                 AS tot_articoli,
        COALESCE(SUM(CASE WHEN quantita <= soglia_minima THEN 1 ELSE 0 END),0) AS sotto_soglia,
        COALESCE(SUM(CASE WHEN quantita <= 0 THEN 1 ELSE 0 END),0)             AS critici
      FROM magazzino_articoli
    `);
    res.json(rows[0]);
  } catch (err) {
    console.error('GET /magazzino/kpi ->', err);
    res.status(500).json({ message: 'Errore KPI magazzino.' });
  }
});

// POST /magazzino/articoli
router.post('/articoli', async (req, res) => {
  try {
    const { nome_articolo, categoria, quantita, soglia_minima, fornitore, note } = req.body || {};
    if (!nome_articolo || !String(nome_articolo).trim()) {
      return res.status(400).json({ message: 'nome_articolo è obbligatorio.' });
    }
    const q = Math.max(0, toInt(quantita, 0));
    const s = Math.max(0, toInt(soglia_minima, 0));
    await db.query(
      `INSERT INTO magazzino_articoli (nome_articolo, categoria, quantita, soglia_minima, fornitore, note)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [String(nome_articolo).trim(), categoria || null, q, s, fornitore || null, note || null]
    );
    res.status(201).json({ message: 'Articolo creato.' });
  } catch (err) {
    console.error('POST /magazzino/articoli ->', err);
    res.status(500).json({ message: 'Errore creazione articolo.' });
  }
});

// PUT /magazzino/articoli/:id
// Update completo o parziale dei campi consentiti
router.put('/articoli/:id', async (req, res) => {
  try {
    const id = toInt(req.params.id);
    if (!id) return res.status(400).json({ message: 'ID non valido.' });

    const updatable = ['nome_articolo', 'categoria', 'quantita', 'soglia_minima', 'fornitore', 'note'];
    const fields = [];
    const values = [];
    for (const k of updatable) {
      if (req.body[k] !== undefined) {
        fields.push(`${k} = ?`);
        if (k === 'quantita' || k === 'soglia_minima') values.push(Math.max(0, toInt(req.body[k], 0)));
        else values.push(req.body[k] === '' ? null : req.body[k]);
      }
    }
    if (!fields.length) return res.status(400).json({ message: 'Nessun campo da aggiornare.' });

    const sql = `UPDATE magazzino_articoli SET ${fields.join(', ')} WHERE id = ?`;
    values.push(id);
    const [ret] = await db.query(sql, values);
    if (ret.affectedRows === 0) return res.status(404).json({ message: 'Articolo non trovato.' });

    res.json({ message: 'Articolo aggiornato.' });
  } catch (err) {
    console.error('PUT /magazzino/articoli/:id ->', err);
    res.status(500).json({ message: 'Errore aggiornamento articolo.' });
  }
});

// DELETE /magazzino/articoli/:id
router.delete('/articoli/:id', async (req, res) => {
  try {
    const id = toInt(req.params.id);
    const [ret] = await db.query('DELETE FROM magazzino_articoli WHERE id = ?', [id]);
    if (ret.affectedRows === 0) return res.status(404).json({ message: 'Articolo non trovato.' });
    res.json({ message: 'Articolo eliminato.' });
  } catch (err) {
    console.error('DELETE /magazzino/articoli/:id ->', err);
    res.status(500).json({ message: 'Errore eliminazione articolo.' });
  }
});

// GET /magazzino/movimenti?articolo_id=&limit=
router.get('/movimenti', async (req, res) => {
  try {
    const articoloId = req.query.articolo_id ? Number(req.query.articolo_id) : null;
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const params = [];
    let where = '';
    if (articoloId) {
      where = 'WHERE m.articolo_id = ?';
      params.push(articoloId);
    }
    params.push(limit);
    const [rows] = await db.query(
      `
      SELECT m.id, m.articolo_id, a.nome_articolo, m.tipo, m.quantita, m.data, m.note, m.created_at
      FROM magazzino_movimenti m
      JOIN magazzino_articoli a ON a.id = m.articolo_id
      ${where}
      ORDER BY m.created_at DESC
      LIMIT ?
      `,
      params
    );
    res.json(rows);
  } catch (err) {
    console.error('GET /magazzino/movimenti ->', err);
    res.status(500).json({ message: 'Errore nel recupero movimenti.' });
  }
});

// POST /magazzino/movimenti
// Body: { articolo_id, tipo: 'carico'|'scarico'|'rettifica', quantita?, nuova_quantita?, data?, note?, cantiere_id?, costo_unitario? }
router.post('/movimenti', async (req, res) => {
  const body = req.body || {};
  console.log('POST /magazzino/movimenti payload:', body); // LOG
  const articoloId = Number(body.articolo_id);
  const tipo = String(body.tipo || '').toLowerCase();
  const dataMov = body.data && /^\d{4}-\d{2}-\d{2}$/.test(body.data) ? body.data : todayIso();
  const note = body.note || null;

  if (!Number.isFinite(articoloId) || articoloId <= 0) {
    return res.status(400).json({ message: 'articolo_id non valido.' });
  }
  if (!TIPI_MOV.has(tipo)) {
    return res.status(400).json({ message: "tipo deve essere 'carico', 'scarico' o 'rettifica'." });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [artRows] = await conn.query('SELECT id, quantita FROM magazzino_articoli WHERE id = ? FOR UPDATE', [articoloId]);
    if (!artRows.length) {
      await conn.rollback();
      return res.status(404).json({ message: 'Articolo non trovato.' });
    }
    const attuale = Number(artRows[0].quantita || 0);

    let delta = 0;
    let nuovaQta = attuale;

    if (tipo === 'carico') {
      const q = Math.trunc(Math.abs(Number(body.quantita || 0)));
      if (q <= 0) throw new Error('Quantità non valida per carico.');
      delta = q;
      nuovaQta = attuale + q;
    } else if (tipo === 'scarico') {
      const q = Math.trunc(Math.abs(Number(body.quantita || 0)));
      if (q <= 0) throw new Error('Quantità non valida per scarico.');
      if (attuale - q < 0) throw new Error('Scarico non consentito: giacenza insufficiente.');
      delta = -q;
      nuovaQta = attuale - q;
    } else {
      if (body.nuova_quantita !== undefined && body.nuova_quantita !== null && body.nuova_quantita !== '') {
        const tgt = Math.trunc(Math.max(0, Number(body.nuova_quantita)));
        delta = tgt - attuale;
        nuovaQta = tgt;
      } else {
        const q = Math.trunc(Number(body.quantita || 0));
        if (!Number.isFinite(q) || q === 0) throw new Error('Quantità/nuova_quantita non valida per rettifica.');
        if (attuale + q < 0) throw new Error('Rettifica non valida: quantità finale negativa.');
        delta = q;
        nuovaQta = attuale + q;
      }
    }

    const [ins] = await conn.query(
      `INSERT INTO magazzino_movimenti (articolo_id, tipo, quantita, data, note)
       VALUES (?, ?, ?, ?, ?)`,
      [articoloId, tipo, delta, dataMov, note]
    );

    await conn.query(
      'UPDATE magazzino_articoli SET quantita = ?, updated_at = NOW() WHERE id = ?',
      [nuovaQta, articoloId]
    );

    await conn.commit();
    console.log('Movimento OK:', { movimento_id: ins.insertId, articolo_id: articoloId, delta, nuovaQta }); // LOG
    res.status(201).json({
      message: 'Movimento registrato.',
      movimento_id: ins.insertId,
      articolo_id: articoloId,
      quantita_finale: nuovaQta
    });
  } catch (err) {
    try { await conn.rollback(); } catch (_) {}
    console.error('POST /magazzino/movimenti ERR:', err); // LOG
    const msg = err.sqlMessage || err.message || 'Errore registrazione movimento.';
    const code = msg.includes('giacenza') || msg.includes('Quantità') ? 400 : 500;
    res.status(code).json({ message: msg });
  } finally {
    conn.release();
  }
});

module.exports = router;