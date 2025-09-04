const db = require('./db');

(async () => {
  try {
    const [rows] = await db.query(`
      SELECT TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME IN ('magazzino_articoli','magazzino_movimenti','MagazzinoArticoli','MagazzinoMovimenti');
    `);
    console.log('Tabelle trovate:', rows.map(r => r.TABLE_NAME));
  } catch (e) {
    console.error('Errore verifica:', e.message);
  } finally {
    process.exit(0);
  }
})();