const express = require('express');
const router = express.Router();
const db = require('../db'); // Importa la connessione al database dal percorso corretto

// GET per ottenere tutti i dipendenti
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT ID, NomeCompleto, Username, Mansione, Cellulare FROM Dipendenti ORDER BY NomeCompleto');
    res.json(rows);
  } catch (error) {
    console.error("Errore nel recuperare i dipendenti:", error);
    res.status(500).json({ message: 'Errore del server nel recuperare i dipendenti.' });
  }
});

// POST per creare un nuovo dipendente
router.post('/', async (req, res) => {
  const { nomeCompleto, username, password, mansione, cellulare } = req.body;

  if (!nomeCompleto || !username || !password) {
    return res.status(400).json({ message: 'Nome, username e password sono obbligatori.' });
  }

  try {
    // NOTA: In un'app reale, la password dovrebbe essere crittografata (hashed)!
    const query = `
      INSERT INTO Dipendenti (NomeCompleto, Username, Password, Mansione, Cellulare) 
      VALUES (?, ?, ?, ?, ?)
    `;
    await db.query(query, [nomeCompleto, username, password, mansione, cellulare]);
    res.status(201).json({ message: 'Dipendente aggiunto con successo!' });
  } catch (error) {
    console.error("Errore nell'aggiungere il dipendente:", error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Questo username è già stato preso.' });
    }
    res.status(500).json({ message: 'Errore del server durante l\'aggiunta del dipendente.' });
  }
});

module.exports = router;