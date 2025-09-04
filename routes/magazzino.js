const express = require('express');
const router = express.Router();
const db = require('../db'); // deve essere il pool usato ieri

// ---- meta dinamica tabella articoli ----
let _magMeta = null;
async function magFindMeta(db) {
  if (_magMeta) return _magMeta;

  const [trows] = await db.query(
    'SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE()'
  );
  const byName = new Map(trows.map(r => [String(r.TABLE_NAME).toLowerCase(), r.TABLE_NAME]));
  const table =
    byName.get('magazzino_articoli') ||
    byName.get('magazzino') ||
    byName.get('articoli') ||
    byName.get('prodotti');
  if (!table) throw new Error('Tabella articoli non trovata');

  const [crows] = await db.query(
    'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
    [table]
  );
  const cols = new Map(crows.map(r => [String(r.COLUMN_NAME).toLowerCase(), r.COLUMN_NAME]));
  const pick = (...names) => {
    for (const n of names) { const f = cols.get(String(n).toLowerCase()); if (f) return f; }
    return null;
  };

  _magMeta = {
    table,
    idCol:  pick('id', 'idarticolo', 'id_articolo'),
    nameCol: pick('nome_articolo','nome','descrizione','titolo','articolo'),
    qtyCol: pick('quantita','giacenza','qta','disponibile'),
    minCol: pick('soglia_minima','soglia','scortaminima')
  };
  return _magMeta;
}

async function ensureMovTable(db) {
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

// POST /magazzino/movimenti
router.post('/movimenti', async (req, res) => {
  try {
    const { tipo, quantita, articoloId, nome, cantiereId = null, costoUnitario = null, note = null } = req.body || {};
    if (!['carico','scarico','rettifica'].includes(tipo)) return res.status(400).json({ message: 'Tipo non valido' });
    const q = Number(quantita);
    if (!Number.isFinite(q) || q <= 0) return res.status(400).json({ message: 'Quantità deve essere > 0' });

    const meta = await magFindMeta(db);
    await ensureMovTable(db);

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
    await ensureMovTable(db);
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

router.get('/articoli', async (req, res) => {
  try {
    // ...query che usavi ieri...
  } catch (err) {
    console.error('GET /magazzino/articoli ->', err);
    res.status(500).json({ message: 'Errore articoli.' });
  }
});

module.exports = router;