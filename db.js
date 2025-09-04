require('dotenv').config();
const mysql = require('mysql2/promise');

// Creiamo un "pool" di connessioni. È il modo più efficiente e robusto
// per gestire le connessioni al database in un'applicazione web.
const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_DATABASE || process.env.DB_NAME || 'cantieri',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Esportiamo il pool in modo che altri file (come dashboard.js, admin.js, etc.)
// possano usarlo per eseguire le query sul database.
module.exports = pool;