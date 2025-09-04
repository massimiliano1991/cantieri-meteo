# Roadmap operativa

Sprint 1 — Stabilizzazione (Pianificazione + Magazzino V1)
- [ ] Fix date pianificazioni: backend espone ISO + DataIt (dd/mm/yyyy) per tabella.
- [ ] Cantieri: GET /nomi (completato), verifica montaggio route.
- [ ] Magazzino Articoli: CRUD (GET/POST/PUT/DELETE) — completato file route e JS base.
- [ ] Magazzino UI: tabella con badge stato (OK/Sotto soglia/Critico), form aggiunta.
- [ ] Endpoint KPI magazzino: count sotto soglia, valore totale (stub).
- [ ] Documentare API correnti in docs/API.md.
- [ ] Aggiungere .vscode/tasks.json e launch.json (debug).

Sprint 2 — Foglio Ore + Home
- [ ] Foglio ore: vista settimanale per dipendente, filtri admin per cantiere/periodo.
- [ ] Home: card KPI (lavori oggi, articoli critici, scadenze), programma giorno/settimana/mese.
- [ ] Report “consumi per cantiere” (scarichi aggregati per cantiere e periodo).

Sprint 3 — Magazzino V2
- [ ] Aggiungere costo_unitario nei movimenti + valore magazzino (costo medio).
- [ ] Fornitori (tabella e UI) e integrazione acquisti base.
- [ ] Alert sotto soglia (in‑app).

Sprint 4 — Mobile + Meteo
- [ ] Layout responsive, mappa cantieri + layer meteo in Home.
- [ ] Notifiche WS/email opzionali.

Note
- Tenere UI pulita, azioni rapide in evidenza, feedback immediati.