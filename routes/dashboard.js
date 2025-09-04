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

module.exports = router;
