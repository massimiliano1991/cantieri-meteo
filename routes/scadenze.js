const express = require('express');
const router = express.Router();
const path = require('path');
const XLSX = require('xlsx');

const scadenzeFilePath = path.join(__dirname, '..', 'data', 'scadenze.xlsx');

function leggiScadenze() {
    try {
        const workbook = XLSX.readFile(scadenzeFilePath);
        return XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
    } catch (error) {
        if (error.code === 'ENOENT') return [];
        throw error;
    }
}

function scriviScadenze(data) {
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Scadenze');
    XLSX.writeFile(workbook, scadenzeFilePath);
}

router.get('/tutte', (req, res) => {
    res.json(leggiScadenze());
});

router.post('/aggiungi', (req, res) => {
    const scadenze = leggiScadenze();
    const nuovaScadenza = {
        ID_Scadenza: scadenze.length > 0 ? Math.max(...scadenze.map(s => s.ID_Scadenza || 0)) + 1 : 1,
        ...req.body,
        Stato: 'Da Pagare'
    };
    scadenze.push(nuovaScadenza);
    scriviScadenze(scadenze);
    res.status(201).json({ message: 'Scadenza aggiunta' });
});

// CORREZIONE: Assicura che la sintassi del parametro :id sia corretta.
router.post('/aggiorna-stato/:id', (req, res) => {
    const scadenze = leggiScadenze();
    const id = parseInt(req.params.id, 10);
    const scadenza = scadenze.find(s => s.ID_Scadenza === id);
    if (scadenza) {
        scadenza.Stato = 'Pagato';
        scriviScadenze(scadenze);
        res.status(200).json({ message: 'Stato aggiornato' });
    } else {
        res.status(404).json({ message: 'Scadenza non trovata' });
    }
});

module.exports = router;