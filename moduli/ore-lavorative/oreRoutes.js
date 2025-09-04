const express = require('express');
const router = express.Router();
const path = require('path');
const XLSX = require('xlsx');

// Unica fonte di dati per le ore
const oreFilePath = path.join(__dirname, '..', '..', 'data', 'ore.xlsx');
const dipendentiFilePath = path.join(__dirname, '..', '..', 'data', 'dipendenti.xlsx');

// --- FUNZIONI HELPER PER EXCEL ---

function leggiFile(filePath) {
    try {
        const workbook = XLSX.readFile(filePath);
        return XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
    } catch (error) {
        if (error.code === 'ENOENT') return [];
        throw error;
    }
}

function scriviFile(filePath, data, sheetName = 'Dati') {
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    XLSX.writeFile(workbook, filePath);
}

// --- ROTTE UNIFICATE ---

// GET /ore/tutte - Restituisce tutte le registrazioni di ore
router.get('/tutte', (req, res) => {
    try {
        res.json(leggiFile(oreFilePath));
    } catch (error) {
        res.status(500).json({ message: 'Errore nel leggere i dati delle ore.' });
    }
});

// POST /ore/aggiungi - Aggiunge una nuova registrazione di ore
router.post('/aggiungi', (req, res) => {
    try {
        const ore = leggiFile(oreFilePath);
        const nuovaRegistrazione = {
            id: ore.length > 0 ? Math.max(...ore.map(o => o.id || 0)) + 1 : 1,
            ...req.body
        };
        ore.push(nuovaRegistrazione);
        scriviFile(oreFilePath, ore, 'Ore');
        res.status(201).json({ message: 'Ore registrate con successo' });
    } catch (error) {
        res.status(500).json({ message: 'Errore del server durante la registrazione.' });
    }
});

// GET /ore/dipendenti - Restituisce l'elenco dei dipendenti da dipendenti.xlsx
router.get('/dipendenti', (req, res) => {
    try {
        const dipendenti = leggiFile(dipendentiFilePath);
        // Restituiamo solo gli username, che è quello che serve al frontend
        res.json(dipendenti.map(d => d.username));
    } catch (error) {
        res.status(500).json({ message: 'Errore nel leggere i dati dei dipendenti.' });
    }
});

// GET /ore/riepilogo-dipendenti - Fornisce il report basato su ore.xlsx
router.get('/riepilogo-dipendenti', (req, res) => {
    try {
        const datiOre = leggiFile(oreFilePath);
        const riepilogo = {};

        datiOre.forEach((d) => {
            // Assumiamo che il file ore.xlsx contenga i campi: dipendente, cantiere, data, ore
            if (!d.dipendente || !d.ore) return;

            if (!riepilogo[d.dipendente]) {
                riepilogo[d.dipendente] = {
                    registrazioni: [],
                    oreTotali: 0
                };
            }
            
            const oreLavorate = parseFloat(d.ore) || 0;

            riepilogo[d.dipendente].registrazioni.push({
                cantiere: d.cantiere,
                data: d.data,
                ore: oreLavorate
            });
            riepilogo[d.dipendente].oreTotali += oreLavorate;
        });

        res.json(riepilogo);
    } catch (error) {
        console.error("Errore nel generare il riepilogo:", error);
        res.status(500).json({ message: 'Errore del server durante la generazione del riepilogo.' });
    }
});

module.exports = router;