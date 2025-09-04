# TODO e Roadmap (Sprint 1)

Stato attuale
- [x] Hook pre-commit: fix+check duplicati.
- [x] Magazzino: KPI e “sotto soglia” lato client da /magazzino/articoli.
- [x] Inventario corrente UI.
- [x] Fix bindFormMagazzino e normalizzazione chiavi articoli.
- [x] Docs: aggiornato docs/API.md con sezione Movimenti.

In corso
- [ ] Magazzino: movimenti base (carico/scarico/rettifica) con transazione e aggiornamento giacenza.

Prossimi task (Sprint 1)
- [ ] Magazzino UI: badge stato riga (OK/Sotto soglia/Critico) e drawer “Movimento rapido”.
- [ ] Pianificazione: API con date ISO + render dd/mm/yyyy; prevenzione conflitti base.
- [ ] Cantieri: completare /cantieri/nomi e scheda cantiere con mappa/meteo.
- [ ] Home: card KPI (lavori oggi, ore pianificate, articoli critici).
- [ ] Test end‑to‑end base sul flusso magazzino.
- [ ] Aggiungere .vscode/tasks.json e launch.json (debug).

Nice to have
- [ ] Ordinamento per rapporto Q.tà/Soglia.
- [ ] Formattazione prezzo in € e valore totale magazzino (se disponibile lato dati).

Sprint 2 — Foglio Ore + Home
- [ ] Foglio ore: vista settimanale per dipendente; filtri admin per cantiere/periodo.
- [ ] KPI Home + notifiche base (sotto soglia, meteo).
- [ ] Report consumi per cantiere.

Note
- Aggiorna questa lista a fine giornata (DONE/NEXT). Tag supportati da Todo Tree: TODO, NEXT, FIXME, SPRINT, ROADMAP.