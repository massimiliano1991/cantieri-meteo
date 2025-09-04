require("dotenv").config();
const express = require("express");
const path = require("path");
const cors = require("cors");
const { MODULO_ORE_ATTIVO } = require('./config');
const db = require('./db'); // <-- CORREZIONE: Rimosso './config/'

// --- 1. IMPORTAZIONE ROTTE ---
const adminRoutes = require('./routes/admin.js');
const cantieriRoutes = require("./moduli/cantieri/cantieriRoutes.js");
const dipendentiRoutes = require('./routes/dipendenti.js');
const dashboardRoutes = require('./routes/dashboard.js');
const scadenzeRoutes = require('./routes/scadenze.js');
const magazzinoRoutes = require('./moduli/magazzino/magazzinoRoutes.js'); 
const oreRoutes = require('./moduli/ore-lavorative/oreRoutes.js');

// --- 2. CREAZIONE E CONFIGURAZIONE APP EXPRESS ---
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- 3. GESTIONE FILE STATICI ---
// PRIMA DI TUTTO: Servi i file statici (html, css, js) dalla cartella 'public'.
// Questa è la parte più importante.
app.use(express.static(path.join(__dirname, "public")));

// --- 4. DEFINIZIONE DELLE ROTTE API ---
// Se la richiesta non era per un file statico, controlla le API.
app.use('/admin', adminRoutes);
app.use("/cantieri", cantieriRoutes);
app.use('/dipendenti', dipendentiRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/scadenze', scadenzeRoutes);
app.use('/magazzino', magazzinoRoutes);
if (MODULO_ORE_ATTIVO) {
  app.use('/ore', oreRoutes);
}

// API per aggiungere un nuovo cantiere
app.post('/api/add', async (req, res) => {
    // Adesso riceviamo anche lat e lon
    const { nome, indirizzo, lat, lon } = req.body; 
    if (!nome || !indirizzo) {
        return res.status(400).json({ message: 'Nome e indirizzo sono obbligatori.' });
    }
    try {
        // La query ora include le coordinate
        const query = 'INSERT INTO Cantieri (NomeCantiere, Indirizzo, Stato, Lat, Lon) VALUES (?, ?, ?, ?, ?)';
        const [result] = await db.query(query, [nome, indirizzo, 'In Corso', lat, lon]);
        
        // Invia indietro tutti i dati, incluse le coordinate
        res.status(201).json({ 
            message: 'Cantiere aggiunto con successo!',
            id: result.insertId,
            nome,
            indirizzo,
            lat,
            lon
        });
    } catch (error) {
        console.error("Errore nell'aggiungere il cantiere:", error);
        res.status(500).json({ message: 'Errore del server durante l\'aggiunta del cantiere.' });
    }
});

// healthcheck
app.get('/health', (_req, res) => res.json({ ok: true }));

// --- 6. AVVIO DEL SERVER ---
app.listen(PORT, () => {
  console.log(`✅ Server avviato e in ascolto su http://localhost:${PORT}`);
});