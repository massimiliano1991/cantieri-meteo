# Schema (snake_case essenziale)

cantieri (esistente)
- ID, NomeCantiere, Indirizzo, Stato, Lat, Lon (legacy)

magazzino_articoli (rinominata)
- id, nome_articolo, categoria, quantita, soglia_minima, fornitore, note, updated_at
- opz.: scorta_sicurezza, codice, unita_misura (V2)

magazzino_movimenti (rinominata)
- id, articolo_id (FK), tipo ENUM('carico','scarico','rettifica'), quantita, data, note, created_at
- opz.: costo_unitario, cantiere_id (V2)