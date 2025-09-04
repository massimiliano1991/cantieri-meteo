require('dotenv').config();
const mysql = require('mysql2/promise');

// Creiamo un "pool" di connessioni. È il modo più efficiente e robusto
// per gestire le connessioni al database in un'applicazione web.
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    waitForConnections: true,
    connectionLimit: 10, // Numero massimo di connessioni nel pool
    queueLimit: 0
});

// Esportiamo il pool in modo che altri file (come dashboard.js, admin.js, etc.)
// possano usarlo per eseguire le query sul database.
module.exports = pool;