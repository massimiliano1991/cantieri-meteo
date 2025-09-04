const db = require('../db');

(async () => {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS magazzino_articoli (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nome_articolo VARCHAR(120) NOT NULL,
        categoria VARCHAR(80) NULL,
        quantita DECIMAL(18,3) NOT NULL DEFAULT 0,
        soglia_minima DECIMAL(18,3) NULL,
        fornitore VARCHAR(120) NULL,
        note VARCHAR(255) NULL,
        updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS magazzino_movimenti (
        id INT AUTO_INCREMENT PRIMARY KEY,
        articolo_id INT NOT NULL,
        tipo ENUM('carico','scarico','rettifica') NOT NULL,
        quantita DECIMAL(18,3) NOT NULL,
        costo_unitario DECIMAL(18,4) NULL,
        cantiere_id INT NULL,
        note VARCHAR(255) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_mov_articolo (articolo_id),
        KEY idx_mov_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    console.log('Tabelle magazzino OK');
    process.exit(0);
  } catch (e) {
    console.error('Init magazzino ERROR:', e.message);
    process.exit(1);
  }
})();