const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');

// Rotta per il geocoding
router.get('/geocode', async (req, res) => {
    const city = req.query.city;
    const apiKey = process.env.OPENCAGE_KEY;

    if (!city) {
        return res.status(400).json({ message: 'Il parametro "city" è obbligatorio.' });
    }
    if (!apiKey) {
        console.error('Chiave API OpenCage non trovata nel file .env');
        return res.status(500).json({ message: 'Chiave API OpenCage non configurata sul server.' });
    }

    const url = `https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(city)}&key=${apiKey}&limit=1&language=it`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (data.results && data.results.length > 0) {
            const { lat, lng } = data.results[0].geometry;
            res.json({ lat: lat, lon: lng });
        } else {
            res.status(404).json({ message: 'Città non trovata.' });
        }
    } catch (error) {
        console.error('Errore durante il geocoding:', error);
        res.status(500).json({ message: 'Errore interno del server durante il geocoding.' });
    }
});

module.exports = router;