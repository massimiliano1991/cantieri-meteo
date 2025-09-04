const express = require('express');
const router = express.Router();
const db = require('../db');

let pianifColsCache = null; // { dateCol, cantCol, dipCol? (legacy) }

// Utils date: normalizza in ISO (YYYY-MM-DD) da 'YYYY-MM-DD' o 'DD/MM/YYYY'
function normalizeIsoDate(input) {
  if (!input) return null;
  const s = String(input).trim();
  // già ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // dd/mm/yyyy o dd-mm-yyyy
  const m = s.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  // fallback: Date parse
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    const iso = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString().slice(0, 10);
    return iso;
  }
  return null;
}
// Alias per retrocompatibilità/usabilità
function toIsoDate(input) {
  return normalizeIsoDate(input);
}

async function getTableColumns(table) {
  const [rows] = await db.query(
    'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
    [table]
  );
  return rows.map(r => r.COLUMN_NAME);
}

function pickCandidate(candidates, cols) {
  const lowerMap = new Map(cols.map(n => [n.toLowerCase(), n]));
  for (const c of candidates) {
    const found = lowerMap.get(c.toLowerCase());
    if (found) return found;
  }
  return null;
}

async function ensureUniqueIndex(table, indexName, columns) {
  const [idx] = await db.query(
    'SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1',
    [table, indexName]
  );
  if (!idx.length) {
    const colsSql = columns.map(c => '`' + c + '`').join(', ');
    await db.query(`ALTER TABLE \`${table}\` ADD UNIQUE KEY \`${indexName}\` (${colsSql})`);
  }
}

// Crea/migra schema
async function ensureCoreTables() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS \`Pianificazioni\` (
      \`ID\` int(11) NOT NULL AUTO_INCREMENT,
      \`IDCantiere\` int(11) NOT NULL,
      \`Data\` date NOT NULL,
      \`TimestampCreazione\` timestamp NOT NULL DEFAULT current_timestamp(),
      PRIMARY KEY (\`ID\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS \`PianificazioneDipendenti\` (
      \`ID\` int(11) NOT NULL AUTO_INCREMENT,
      \`PianificazioneID\` int(11) NOT NULL,
      \`DipendenteID\` int(11) NOT NULL,
      \`TimestampCreazione\` timestamp NOT NULL DEFAULT current_timestamp(),
      PRIMARY KEY (\`ID\`),
      UNIQUE KEY \`uniq_piano_dip\` (\`PianificazioneID\`, \`DipendenteID\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // Rileva colonne attuali di Pianificazioni (supporto legacy)
  const cols = await getTableColumns('Pianificazioni');
  let dateCol = pickCandidate(['Data', 'DataLavoro', 'DataPianificazione'], cols) || 'Data';
  let cantCol = pickCandidate(['IDCantiere', 'idCantiere', 'CantiereID', 'Cantiere'], cols) || 'IDCantiere';
  let dipCol  = pickCandidate(['IDDipendente', 'idDipendente', 'DipendenteID', 'Dipendente'], cols) || null;

  // Se mancano le colonne base, aggiungile
  if (!cols.includes(dateCol)) {
    await db.query('ALTER TABLE `Pianificazioni` ADD COLUMN `Data` date NOT NULL');
    dateCol = 'Data';
  }
  if (!cols.includes(cantCol)) {
    await db.query('ALTER TABLE `Pianificazioni` ADD COLUMN `IDCantiere` int(11) NOT NULL');
    cantCol = 'IDCantiere';
  }

  // Backfill legacy: se Pianificazioni aveva IDDipendente, trasferisci su tabella di associazione
  if (dipCol) {
    await db.query(`
      INSERT IGNORE INTO \`PianificazioneDipendenti\` (PianificazioneID, DipendenteID)
      SELECT p.ID, p.\`${dipCol}\`
      FROM \`Pianificazioni\` p
      WHERE p.\`${dipCol}\` IS NOT NULL
    `);
  }

  // Evita duplicati (cantiere, data)
  await ensureUniqueIndex('Pianificazioni', 'uniq_pianif_cant_data', [cantCol, dateCol]);

  pianifColsCache = { dateCol, cantCol, dipCol };
  return pianifColsCache;
}

async function getPianifCols() {
  if (pianifColsCache) return pianifColsCache;
  return ensureCoreTables();
}

// Trova o crea pianificazione per (cantiere, data) in modo idempotente
async function findOrCreatePiano(idCantiere, isoDate) {
  const { dateCol, cantCol } = await getPianifCols();
  const [rows] = await db.query(
    `SELECT ID FROM \`Pianificazioni\` WHERE \`${cantCol}\` = ? AND \`${dateCol}\` = ? LIMIT 1`,
    [idCantiere, isoDate]
  );
  if (rows.length) return rows[0].ID;

  const [ins] = await db.query(
    `INSERT INTO \`Pianificazioni\` (\`${cantCol}\`, \`${dateCol}\`) VALUES (?, ?)`,
    [idCantiere, isoDate]
  );
  return ins.insertId;
}

// API di supporto per le select
router.get('/api/cantieri', async (_req, res) => {
  try {
    const [rows] = await db.query('SELECT ID, NomeCantiere, Indirizzo, Lat, Lon FROM `Cantieri` ORDER BY NomeCantiere');
    res.json(rows);
  } catch (err) {
    console.error('GET /dashboard/api/cantieri ->', err);
    res.status(500).json({ message: 'Errore nel recupero dei cantieri.' });
  }
});

// Nomi cantieri (solo ID e NomeCantiere) - non duplica /api/cantieri
router.get('/api/cantieri/nomi', async (_req, res) => {
  try {
    const [rows] = await db.query('SELECT ID, NomeCantiere FROM `Cantieri` ORDER BY NomeCantiere');
    res.json(rows);
  } catch (err) {
    console.error('GET /dashboard/api/cantieri/nomi ->', err);
    res.status(500).json({ message: 'Errore nel recupero dei nomi cantieri.' });
  }
});

router.get('/api/dipendenti', async (_req, res) => {
  try {
    const [rows] = await db.query('SELECT ID, NomeCompleto FROM `Dipendenti` ORDER BY NomeCompleto');
    res.json(rows);
  } catch (err) {
    console.error('GET /dashboard/api/dipendenti ->', err);
    res.status(500).json({ message: 'Errore nel recupero dei dipendenti.' });
  }
});

// CREA/AGGIORNA pianificazione: accetta 1 o N dipendenti, evita duplicati e conflitti
router.post('/api/pianifica', async (req, res) => {
  try {
    const { dateCol, cantCol } = await getPianifCols();
    const { cantiereId, data, dipendenti } = req.body || {};
    const idCantiere = Number(cantiereId);
    const isoDate = normalizeIsoDate(data);
    const list = Array.isArray(dipendenti) ? dipendenti.map(Number).filter(Boolean) : [];

    if (!idCantiere || !isoDate) {
      return res.status(400).json({ message: 'Parametri mancanti o non validi (cantiereId, data).' });
    }

    // Crea o recupera la pianificazione target
    const pianificazioneId = await findOrCreatePiano(idCantiere, isoDate);

    // Risultati operazione
    const assigned = [];
    const duplicates = [];
    const conflicts = [];

    // Per ogni dipendente: blocca conflitti (stesso giorno, altro cantiere) e ignora duplicati
    for (const dipId of list) {
      // Conflitto: stesso dipendente già su un altro cantiere nella stessa data
      const [confRows] = await db.query(
        `
          SELECT p.ID as PianificazioneID, p.\`${cantCol}\` as CantiereID
          FROM \`Pianificazioni\` p
          JOIN \`PianificazioneDipendenti\` pd ON pd.PianificazioneID = p.ID
          WHERE pd.DipendenteID = ? AND p.\`${dateCol}\` = ? AND p.\`${cantCol}\` <> ?
          LIMIT 1
        `,
        [dipId, isoDate, idCantiere]
      );
      if (confRows.length) {
        conflicts.push({ DipendenteID: dipId, PianificazioneID: confRows[0].PianificazioneID, CantiereID: confRows[0].CantiereID });
        continue; // blocca
      }

      // Inserimento idempotente (evita dup) grazie a UNIQUE (PianificazioneID, DipendenteID)
      const [ins] = await db.query(
        `INSERT IGNORE INTO \`PianificazioneDipendenti\` (PianificazioneID, DipendenteID) VALUES (?, ?)`,
        [pianificazioneId, dipId]
      );
      if (ins.affectedRows === 0) {
        duplicates.push({ DipendenteID: dipId });
      } else {
        assigned.push({ DipendenteID: dipId });
      }
    }

    return res.json({ PianificazioneID: pianificazioneId, CantiereID: idCantiere, DataIso: isoDate, assigned, duplicates, conflicts });
  } catch (err) {
    console.error('POST /dashboard/api/pianifica ->', err);
    res.status(500).json({ message: 'Errore nella pianificazione.' });
  }
});

// LISTA pianificazioni (aggregata con dipendenti[], include DataIso e DataIt)
router.get('/api/pianificazioni', async (_req, res) => {
  try {
    const { dateCol, cantCol } = await getPianifCols();
    const sql = `
      SELECT 
        p.ID,
        p.\`${cantCol}\` AS CantiereID,
        DATE_FORMAT(p.\`${dateCol}\`, '%Y-%m-%d') AS DataIso,
        DATE_FORMAT(p.\`${dateCol}\`, '%d/%m/%Y') AS DataIt,
        c.NomeCantiere,
        pd.DipendenteID,
        d.NomeCompleto
      FROM \`Pianificazioni\` p
      JOIN \`Cantieri\` c ON c.ID = p.\`${cantCol}\`
      LEFT JOIN \`PianificazioneDipendenti\` pd ON pd.PianificazioneID = p.ID
      LEFT JOIN \`Dipendenti\` d ON d.ID = pd.DipendenteID
      ORDER BY p.\`${dateCol}\` DESC, p.ID DESC
    `;
    const [rows] = await db.query(sql);

    const map = new Map();
    for (const r of rows) {
      if (!map.has(r.ID)) {
        map.set(r.ID, {
          ID: r.ID,
          CantiereID: r.CantiereID,
          DataIso: r.DataIso,
          DataIt: r.DataIt,
          NomeCantiere: r.NomeCantiere,
          Dipendenti: []
        });
      }
      if (r.DipendenteID) {
        map.get(r.ID).Dipendenti.push({ ID: r.DipendenteID, NomeCompleto: r.NomeCompleto });
      }
    }
    res.json(Array.from(map.values()));
  } catch (err) {
    console.error('GET /dashboard/api/pianificazioni ->', err);
    res.status(500).json({ message: 'Errore nel recupero delle pianificazioni.' });
  }
});

// AGGIUNGI uno o più dipendenti a una pianificazione, con guardie duplicati e conflitti
router.patch('/api/pianificazioni/:id/assegna', async (req, res) => {
  try {
    const pianificazioneId = Number(req.params.id);
    const { dateCol, cantCol } = await getPianifCols();
    const { dipendenti } = req.body || {};
    const list = Array.isArray(dipendenti) ? dipendenti.map(Number).filter(Boolean) : [];

    if (!pianificazioneId || list.length === 0) {
      return res.status(400).json({ message: 'Parametri mancanti o non validi.' });
    }

    // Recupera data e cantiere della pianificazione target
    const [[piano]] = await db.query(
      `SELECT \`${cantCol}\` AS CantiereID, \`${dateCol}\` AS Data FROM \`Pianificazioni\` WHERE ID = ? LIMIT 1`,
      [pianificazioneId]
    );
    if (!piano) return res.status(404).json({ message: 'Pianificazione non trovata.' });

    const isoDate = normalizeIsoDate(piano.Data);
    const idCantiere = Number(piano.CantiereID);

    const assigned = [];
    const duplicates = [];
    const conflicts = [];

    for (const dipId of list) {
      // Conflitto stesso giorno, altro cantiere
      const [confRows] = await db.query(
        `
          SELECT p.ID as PianificazioneID, p.\`${cantCol}\` as CantiereID
          FROM \`Pianificazioni\` p
          JOIN \`PianificazioneDipendenti\` pd ON pd.PianificazioneID = p.ID
          WHERE pd.DipendenteID = ? AND p.\`${dateCol}\` = ? AND p.\`${cantCol}\` <> ?
          LIMIT 1
        `,
        [dipId, isoDate, idCantiere]
      );
      if (confRows.length) {
        conflicts.push({ DipendenteID: dipId, PianificazioneID: confRows[0].PianificazioneID, CantiereID: confRows[0].CantiereID });
        continue;
      }

      const [ins] = await db.query(
        `INSERT IGNORE INTO \`PianificazioneDipendenti\` (PianificazioneID, DipendenteID) VALUES (?, ?)`,
        [pianificazioneId, dipId]
      );
      if (ins.affectedRows === 0) {
        duplicates.push({ DipendenteID: dipId });
      } else {
        assigned.push({ DipendenteID: dipId });
      }
    }

    res.json({ PianificazioneID: pianificazioneId, assigned, duplicates, conflicts });
  } catch (err) {
    console.error('PATCH /dashboard/api/pianificazioni/:id/assegna ->', err);
    res.status(500).json({ message: 'Errore nell’assegnazione.' });
  }
});

// RIMUOVI dipendente da una pianificazione
router.delete('/api/pianificazioni/:id/assegna/:dipendenteId', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const d = Number(req.params.dipendenteId);
    await db.query(
      'DELETE FROM `PianificazioneDipendenti` WHERE PianificazioneID = ? AND DipendenteID = ?',
      [id, d]
    );
    res.json({ message: 'Dipendente rimosso.' });
  } catch (err) {
    console.error('DELETE /dashboard/api/pianificazioni/:id/assegna/:dipendenteId ->', err);
    res.status(500).json({ message: 'Errore rimozione dipendente.' });
  }
});

// Sposta/aggiorna pianificazione (data e/o cantiere) con merge e guardie idempotenti
router.patch('/api/pianificazioni/:id/move', async (req, res) => {
  try {
    const { dateCol, cantCol } = await getPianifCols();
    const pianificazioneId = Number(req.params.id);
    const { cantiereId: newCantiereIdRaw, data: newDateRaw } = req.body || {};
    if (!pianificazioneId) return res.status(400).json({ message: 'ID non valido.' });

    // Recupera pianificazione corrente
    const [[cur]] = await db.query(
      `SELECT ID, \`${cantCol}\` AS CantiereID, \`${dateCol}\` AS Data
       FROM \`Pianificazioni\` WHERE ID = ? LIMIT 1`,
      [pianificazioneId]
    );
    if (!cur) return res.status(404).json({ message: 'Pianificazione non trovata.' });

    const targetCantiereId = Number(newCantiereIdRaw) || Number(cur.CantiereID);
    const targetIsoDate = normalizeIsoDate(newDateRaw) || normalizeIsoDate(cur.Data);

    // Se target uguale al corrente, non fare nulla
    if (targetCantiereId === Number(cur.CantiereID) && targetIsoDate === normalizeIsoDate(cur.Data)) {
      return res.json({ PianificazioneID: cur.ID, message: 'Nessuna modifica.' });
    }

    // Trova/crea target e poi fai merge dipendenti in modo idempotente
    const targetId = await findOrCreatePiano(targetCantiereId, targetIsoDate);

    // Sposta dipendenti (INSERT IGNORE per evitare doppioni)
    const [dipRows] = await db.query(
      `SELECT DipendenteID FROM \`PianificazioneDipendenti\` WHERE PianificazioneID = ?`,
      [cur.ID]
    );
    const moved = [];
    const skipped = [];
    for (const r of dipRows) {
      const [ins] = await db.query(
        `INSERT IGNORE INTO \`PianificazioneDipendenti\` (PianificazioneID, DipendenteID) VALUES (?, ?)`,
        [targetId, r.DipendenteID]
      );
      if (ins.affectedRows === 0) skipped.push(r.DipendenteID);
      else moved.push(r.DipendenteID);
    }

    // Se abbiamo creato un nuovo target e sono stati trasferiti tutti, cancella la vecchia se rimane vuota
    await db.query(
      `DELETE FROM \`Pianificazioni\` 
       WHERE ID = ? 
         AND NOT EXISTS (SELECT 1 FROM \`PianificazioneDipendenti\` WHERE PianificazioneID = ?)`,
      [cur.ID, cur.ID]
    );

    res.json({ From: cur.ID, To: targetId, moved, skipped });
  } catch (err) {
    console.error('PATCH /dashboard/api/pianificazioni/:id/move ->', err);
    res.status(500).json({ message: 'Errore nello spostamento pianificazione.' });
  }
});

// Feed per calendario (aggiunge id cantiere negli extendedProps)
router.get('/api/pianificazioni/calendar', async (req, res) => {
  try {
    const { start, end } = req.query;
    const { dateCol, cantCol } = await getPianifCols();

    const params = [];
    let where = '1=1';
    if (start) { where += ` AND p.\`${dateCol}\` >= ?`; params.push(toIsoDate(start)); }
    if (end)   { where += ` AND p.\`${dateCol}\` <= ?`; params.push(toIsoDate(end)); }

    const [rows] = await db.query(
      `
      SELECT 
        p.ID,
        p.\`${cantCol}\` AS CantiereID,
        DATE_FORMAT(p.\`${dateCol}\`, '%Y-%m-%d') AS Data,
        c.NomeCantiere,
        d.NomeCompleto
      FROM \`Pianificazioni\` p
      JOIN \`Cantieri\` c ON c.ID = p.\`${cantCol}\`
      LEFT JOIN \`PianificazioneDipendenti\` pd ON pd.PianificazioneID = p.ID
      LEFT JOIN \`Dipendenti\` d ON d.ID = pd.DipendenteID
      WHERE ${where}
      ORDER BY p.\`${dateCol}\`, p.ID
      `,
      params
    );

    const map = new Map();
    for (const r of rows) {
      if (!map.has(r.ID)) map.set(r.ID, { ID: r.ID, Data: r.Data, CantiereID: r.CantiereID, NomeCantiere: r.NomeCantiere, Dip: [] });
      if (r.NomeCompleto) map.get(r.ID).Dip.push(r.NomeCompleto);
    }

    const events = Array.from(map.values()).map(ev => ({
      id: ev.ID,
      title: ev.NomeCantiere + (ev.Dip.length ? ' - ' + ev.Dip.join(', ') : ''),
      start: ev.Data,
      allDay: true,
      editable: true,
      extendedProps: { idCantiere: ev.CantiereID }
    }));
    res.json(events);
  } catch (err) {
    console.error('GET /dashboard/api/pianificazioni/calendar ->', err);
    res.status(500).json({ message: 'Errore calendario.' });
  }
});

// ORE
router.post('/api/ore', async (req, res) => {
  try {
    const { idDipendente, idCantiere, oraInizio, oraFine } = req.body || {};
    let { data } = req.body || {};
    if (!idDipendente || !idCantiere || !data || !oraInizio || !oraFine) {
      return res.status(400).json({ message: 'Dipendente, cantiere, data, ora inizio e ora fine sono obbligatori.' });
    }
    data = toIsoDate(data);
    await db.query(
      'INSERT INTO `OreLavorate` (IDDipendente, IDCantiere, Data, OraInizio, OraFine) VALUES (?, ?, ?, ?, ?)',
      [idDipendente, idCantiere, data, oraInizio, oraFine]
    );
    res.status(201).json({ message: 'Ore salvate con successo.' });
  } catch (err) {
    console.error('POST /dashboard/api/ore ->', err);
    res.status(500).json({ message: 'Errore nel salvataggio delle ore.' });
  }
});

// OVERVIEW (conteggia le pianificazioni del giorno)
router.get('/api/overview', async (_req, res) => {
  try {
    const { dateCol } = await getPianifCols();
    const [[{ cntCantieri }]] = await db.query('SELECT COUNT(*) AS cntCantieri FROM `Cantieri`');
    const [[{ cntDip }]]      = await db.query('SELECT COUNT(*) AS cntDip FROM `Dipendenti`');
    const [[{ cntToday }]]    = await db.query(`SELECT COUNT(*) AS cntToday FROM \`Pianificazioni\` WHERE \`${dateCol}\` = CURDATE()`);
    res.json({ cantieri: cntCantieri, dipendenti: cntDip, pianificazioniOggi: cntToday });
  } catch (err) {
    console.error('GET /dashboard/api/overview ->', err);
    res.status(500).json({ message: 'Errore nel recupero dei dati dashboard.' });
  }
});

// ---- MAGAZZINO: meta dinamica (tabella e colonne) ----
let magMetaCache = null;
async function getExistingTable(candidates) {
  const [rows] = await db.query(
    'SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE()'
  );
  const names = rows.map(r => r.TABLE_NAME.toLowerCase());
  for (const c of candidates) {
    const i = names.indexOf(c.toLowerCase());
    if (i >= 0) return rows[i].TABLE_NAME || c;
  }
  return null;
}
async function ensureMagazzinoSchema() {
  if (magMetaCache) return magMetaCache;

  // Trova tabella esistente o crea "Magazzino" base
  let table = await getExistingTable(['Magazzino', 'Articoli', 'Prodotti']);
  if (!table) {
    await db.query(`
      CREATE TABLE IF NOT EXISTS \`Magazzino\` (
        \`ID\` int(11) NOT NULL AUTO_INCREMENT,
        \`NomeArticolo\` varchar(255) NOT NULL,
        \`Quantita\` decimal(18,3) NOT NULL DEFAULT 0,
        \`SogliaMinima\` decimal(18,3) NOT NULL DEFAULT 0,
        \`PrezzoUnitario\` decimal(18,2) NOT NULL DEFAULT 0,
        \`UnitaMisura\` varchar(16) DEFAULT 'pz',
        \`TimestampCreazione\` timestamp NOT NULL DEFAULT current_timestamp(),
        PRIMARY KEY (\`ID\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    table = 'Magazzino';
  }

  // Colonne presenti
  const [colsRows] = await db.query(
    'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
    [table]
  );
  const cols = colsRows.map(c => c.COLUMN_NAME);
  const has = name => cols.some(c => c.toLowerCase() === name.toLowerCase());
  // Aggiunge colonne opzionali se mancano
  const toAdd = [];
  if (!has('Categoria'))     toAdd.push('ADD COLUMN `Categoria` varchar(100) DEFAULT NULL');
  if (!has('Fornitore'))     toAdd.push('ADD COLUMN `Fornitore` varchar(255) DEFAULT NULL');
  if (!has('Note'))          toAdd.push('ADD COLUMN `Note` varchar(255) DEFAULT NULL');
  if (toAdd.length) await db.query(`ALTER TABLE \`${table}\` ${toAdd.join(', ')}`);

  const pick = (cands) => {
    const m = new Map(colsRows.map(r => [r.COLUMN_NAME.toLowerCase(), r.COLUMN_NAME]));
    for (const c of cands) { const f = m.get(c.toLowerCase()); if (f) return f; }
    return null;
  };

  const idCol    = pick(['ID', 'IdArticolo', 'Id']);
  const nameCol  = pick(['NomeArticolo', 'Nome', 'Descrizione', 'Titolo']);
  const qtyCol   = pick(['Quantita', 'Giacenza', 'Qta', 'Disponibile']);
  const minCol   = pick(['SogliaMinima', 'ScortaMinima', 'Minimo', 'Soglia']);
  const priceCol = pick(['PrezzoUnitario', 'CostoUnitario', 'Prezzo', 'Costo']);
  const umCol    = pick(['UnitaMisura', 'UM', 'Unita']);
  const catCol   = pick(['Categoria']);
  const fornCol  = pick(['Fornitore']);
  const noteCol  = pick(['Note']);

  magMetaCache = { table, idCol, nameCol, qtyCol, minCol, priceCol, umCol, catCol, fornCol, noteCol };
  return magMetaCache;
}

// GET KPI Magazzino (sotto soglia + totale)
router.get('/api/magazzino/kpi', async (_req, res) => {
  try {
    const m = await ensureMagazzinoSchema();
    if (!m.qtyCol || !m.minCol) {
      return res.json({ articoli: 0, sottoSoglia: 0, valoreTotale: null });
    }
    const [[{ tot }]] = await db.query(`SELECT COUNT(*) AS tot FROM \`${m.table}\``);
    const [[{ ss }]]  = await db.query(
      `SELECT COUNT(*) AS ss FROM \`${m.table}\` WHERE \`${m.qtyCol}\` <= \`${m.minCol}\` AND \`${m.minCol}\` IS NOT NULL`
    );

    let valore = null;
    if (m.priceCol) {
      const [[{ v }]] = await db.query(
        `SELECT SUM(\`${m.qtyCol}\` * \`${m.priceCol}\`) AS v FROM \`${m.table}\``
      );
      valore = v !== null ? Number(v) : null;
    }
    res.json({ articoli: tot, sottoSoglia: ss, valoreTotale: valore });
  } catch (err) {
    console.error('GET /dashboard/api/magazzino/kpi ->', err);
    res.status(500).json({ message: 'Errore KPI magazzino.' });
  }
});

// GET elenco sotto soglia
router.get('/api/magazzino/sotto-soglia', async (_req, res) => {
  try {
    const m = await ensureMagazzinoSchema();
    if (!m.qtyCol || !m.minCol) return res.json([]);
    const sql = `
      SELECT 
        ${m.idCol ? '`' + m.idCol + '` AS ID,' : ''} 
        ${m.nameCol ? '`' + m.nameCol + '` AS Nome,' : 'NULL AS Nome,'}
        \`${m.qtyCol}\` AS Quantita,
        \`${m.minCol}\` AS SogliaMinima
        ${m.umCol ? ', `' + m.umCol + '` AS Unita' : ''}
        ${m.priceCol ? ', `' + m.priceCol + '` AS PrezzoUnitario' : ''}
      FROM \`${m.table}\`
      WHERE \`${m.qtyCol}\` <= \`${m.minCol}\` AND \`${m.minCol}\` IS NOT NULL
      ORDER BY (\`${m.qtyCol}\` / NULLIF(\`${m.minCol}\`,0)) ASC
    `;
    const [rows] = await db.query(sql);
    res.json(rows);
  } catch (err) {
    console.error('GET /dashboard/api/magazzino/sotto-soglia ->', err);
    res.status(500).json({ message: 'Errore elenco sotto soglia.' });
  }
});

// Inserisci/aggiorna articolo (idempotente per NomeArticolo)
router.post('/api/magazzino', async (req, res) => {
  try {
    const m = await ensureMagazzinoSchema();
    if (!m.nameCol || !m.qtyCol || !m.minCol) {
      return res.status(400).json({ message: 'Schema magazzino non valido.' });
    }
    const nome = String(req.body?.nome ?? '').trim();
    if (!nome) return res.status(400).json({ message: 'Nome articolo obbligatorio.' });

    const qta = Number(req.body?.quantita ?? 0) || 0;
    const soglia = Number(req.body?.sogliaMinima ?? 0) || 0;
    const categoria = req.body?.categoria ?? null;
    const fornitore = req.body?.fornitore ?? null;
    const note = req.body?.note ?? null;

    // cerca per nome (case-insensitive)
    const [found] = await db.query(
      `SELECT \`${m.idCol}\` AS ID, \`${m.qtyCol}\` AS Quantita, \`${m.minCol}\` AS SogliaMinima 
       FROM \`${m.table}\` WHERE LOWER(\`${m.nameCol}\`) = LOWER(?) LIMIT 1`,
      [nome]
    );

    if (found.length) {
      const row = found[0];
      await db.query(
        `UPDATE \`${m.table}\` 
         SET \`${m.qtyCol}\` = \`${m.qtyCol}\` + ?, \`${m.minCol}\` = GREATEST(\`${m.minCol}\`, ?)
             ${m.catCol ? `, \`${m.catCol}\` = COALESCE(?, \`${m.catCol}\`)` : ''}
             ${m.fornCol ? `, \`${m.fornCol}\` = COALESCE(?, \`${m.fornCol}\`)` : ''}
             ${m.noteCol ? `, \`${m.noteCol}\` = COALESCE(?, \`${m.noteCol}\`)` : ''}
         WHERE \`${m.idCol}\` = ?`,
        m.catCol && m.fornCol && m.noteCol
          ? [qta, soglia, categoria, fornitore, note, row.ID]
          : m.catCol && m.fornCol
          ? [qta, soglia, categoria, fornitore, row.ID]
          : m.catCol
          ? [qta, soglia, categoria, row.ID]
          : [qta, soglia, row.ID]
      );
      return res.json({ action: 'updated', id: row.ID });
    } else {
      const cols = [m.nameCol, m.qtyCol, m.minCol];
      const vals = [nome, qta, soglia];
      if (m.catCol)   { cols.push(m.catCol);   vals.push(categoria); }
      if (m.fornCol)  { cols.push(m.fornCol);  vals.push(fornitore); }
      if (m.noteCol)  { cols.push(m.noteCol);  vals.push(note); }
      if (m.umCol)    { cols.push(m.umCol);    vals.push('pz'); }
      if (m.priceCol) { cols.push(m.priceCol); vals.push(0); }

      const placeholders = cols.map(() => '?').join(', ');
      const [ins] = await db.query(
        `INSERT INTO \`${m.table}\` (${cols.map(c => `\`${c}\``).join(', ')}) VALUES (${placeholders})`,
        vals
      );
      return res.json({ action: 'inserted', id: ins.insertId });
    }
  } catch (err) {
    console.error('POST /dashboard/api/magazzino ->', err);
    res.status(500).json({ message: 'Errore inserimento magazzino.' });
  }
});

// Inventario completo
router.get('/api/magazzino/inventario', async (_req, res) => {
  try {
    const m = await ensureMagazzinoSchema();
    const cols = [
      m.idCol ? `\`${m.idCol}\` AS ID` : 'NULL AS ID',
      m.nameCol ? `\`${m.nameCol}\` AS NomeArticolo` : 'NULL AS NomeArticolo',
      m.catCol ? `\`${m.catCol}\` AS Categoria` : 'NULL AS Categoria',
      m.qtyCol ? `\`${m.qtyCol}\` AS Quantita` : 'NULL AS Quantita',
      m.minCol ? `\`${m.minCol}\` AS SogliaMinima` : 'NULL AS SogliaMinima',
      m.umCol ? `\`${m.umCol}\` AS UnitaMisura` : 'NULL AS UnitaMisura',
      m.priceCol ? `\`${m.priceCol}\` AS PrezzoUnitario` : 'NULL AS PrezzoUnitario',
      m.fornCol ? `\`${m.fornCol}\` AS Fornitore` : 'NULL AS Fornitore',
      m.noteCol ? `\`${m.noteCol}\` AS Note` : 'NULL AS Note'
    ].join(', ');
    const [rows] = await db.query(`SELECT ${cols} FROM \`${m.table}\` ORDER BY ${m.nameCol ? `\`${m.nameCol}\`` : '1'} ASC`);
    res.json(rows);
  } catch (err) {
    console.error('GET /dashboard/api/magazzino/inventario ->', err);
    res.status(500).json({ message: 'Errore inventario magazzino.' });
  }
});

module.exports = router;
