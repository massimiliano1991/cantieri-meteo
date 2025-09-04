const express = require('express');
const router = express.Router();
const db = require('../../db'); // pool

// --- helpers meta dinamica + tabella movimenti ---
let _magMeta = null;
async function magFindMeta() {
  if (_magMeta) return _magMeta;
  const [trows] = await db.query(
    'SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE()'
  );
  const tables = new Map(trows.map(r => [String(r.TABLE_NAME).toLowerCase(), r.TABLE_NAME]));
  const table =
    tables.get('magazzino_articoli') ||
    tables.get('magazzino') ||
    tables.get('articoli') ||
    tables.get('prodotti');
  if (!table) throw new Error('Tabella articoli non trovata');

  const [crows] = await db.query(
    'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
    [table]
  );
  const cols = new Map(crows.map(r => [String(r.COLUMN_NAME).toLowerCase(), r.COLUMN_NAME]));
  const pick = (...names) => {
    for (const n of names) {
      const f = cols.get(String(n).toLowerCase());
      if (f) return f;
    }
    return null;
  };

  _magMeta = {
    table,
    idCol: pick('id', 'idarticolo', 'id_articolo'),
    nameCol: pick('nome_articolo', 'nome', 'descrizione', 'titolo', 'articolo'),
    qtyCol: pick('quantita', 'giacenza', 'qta', 'disponibile'),
    minCol: pick('soglia_minima', 'soglia', 'scortaminima')
  };
  return _magMeta;
}

async function ensureMovTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS magazzino_movimenti (
      id INT NOT NULL AUTO_INCREMENT,
      articolo_id INT NOT NULL,
      tipo ENUM('carico','scarico','rettifica') NOT NULL,
      quantita DECIMAL(18,3) NOT NULL,
      costo_unitario DECIMAL(18,4) NULL,
      cantiere_id INT NULL,
      note VARCHAR(255) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_mov_articolo (articolo_id),
      KEY idx_mov_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
}

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
  try {
    const { tipo, quantita, articoloId, nome, cantiereId = null, costoUnitario = null, note = null } = req.body || {};
    if (!['carico','scarico','rettifica'].includes(tipo)) return res.status(400).json({ message: 'Tipo non valido' });
    const q = Number(quantita);
    if (!Number.isFinite(q) || q <= 0) return res.status(400).json({ message: 'Quantità deve essere > 0' });

    const meta = await magFindMeta();
    await ensureMovTable();

    let artId = Number(articoloId) || null;
    if (!artId && nome) {
      const [r] = await db.query(
        `SELECT \`${meta.idCol}\` AS id FROM \`${meta.table}\` WHERE LOWER(\`${meta.nameCol}\`) = LOWER(?) LIMIT 1`,
        [String(nome).trim()]
      );
      artId = r[0]?.id || null;
    }
    if (!artId) return res.status(400).json({ message: 'articoloId o nome obbligatorio' });

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const [rows] = await conn.query(
        `SELECT \`${meta.qtyCol}\` AS qty FROM \`${meta.table}\` WHERE \`${meta.idCol}\` = ? FOR UPDATE`,
        [artId]
      );
      if (!rows.length) throw new Error('Articolo non trovato');
      const curr = Number(rows[0].qty || 0);

      let nextQty = curr;
      if (tipo === 'carico') nextQty = curr + q;
      if (tipo === 'scarico') {
        if (curr - q < 0) { await conn.rollback(); conn.release(); return res.status(400).json({ message: 'Giacenza insufficiente' }); }
        nextQty = curr - q;
      }
      if (tipo === 'rettifica') nextQty = q;

      await conn.query(
        `UPDATE \`${meta.table}\` SET \`${meta.qtyCol}\` = ? WHERE \`${meta.idCol}\` = ?`,
        [nextQty, artId]
      );
      const [ins] = await conn.query(
        `INSERT INTO magazzino_movimenti (articolo_id, tipo, quantita, costo_unitario, cantiere_id, note)
         VALUES (?,?,?,?,?,?)`,
        [artId, tipo, q, costoUnitario ?? null, cantiereId ?? null, note ?? null]
      );
      await conn.commit(); conn.release();
      res.json({ movimentoId: ins.insertId, articoloId: artId, tipo, quantita: q, giacenza: nextQty });
    } catch (e) { try { await conn.rollback(); conn.release(); } catch {} throw e; }
  } catch (err) {
    console.error('POST /magazzino/movimenti ->', err.message);
    res.status(500).json({ message: 'Errore registrazione movimento' });
  }
});

// GET /magazzino/movimenti
router.get('/movimenti', async (req, res) => {
  try {
    await ensureMovTable();
    const { articoloId, from, to } = req.query || {};
    const where = [];
    const args = [];
    if (articoloId) { where.push('articolo_id = ?'); args.push(Number(articoloId)); }
    if (from) { where.push('created_at >= ?'); args.push(from + ' 00:00:00'); }
    if (to) { where.push('created_at <= ?'); args.push(to + ' 23:59:59'); }
    const sql = `SELECT id, articolo_id, tipo, quantita, costo_unitario, cantiere_id, note, created_at
                 FROM magazzino_movimenti
                 ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                 ORDER BY created_at DESC, id DESC
                 LIMIT 500`;
    const [rows] = await db.query(sql, args);
    res.json(rows);
  } catch (err) {
    console.error('GET /magazzino/movimenti ->', err.message);
    res.status(500).json({ message: 'Errore lettura movimenti' });
  }
});

module.exports = router;