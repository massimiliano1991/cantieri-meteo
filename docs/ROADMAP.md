# Roadmap

Visione
- Un gestionale unico per cantieri, pianificazione, ore e magazzino.
- Interazioni veloci, feedback chiari, zero frizioni.

Ruoli
- Admin, Coordinatore, Dipendente.

Principi UI
- Gerarchia chiara, pochi colori funzionali, tipografia consistente.

Milestones
- Sprint 1 (Now)
  - Pianificazione: date ISO (API) → dd/mm/yyyy (UI); prevenzione conflitti base.
  - Cantieri: completare /cantieri/nomi + scheda con mappa/meteo.
  - Magazzino V1: CRUD articoli + movimenti base; badge stato; KPI sotto soglia; tabella inventario.
- Sprint 2
  - Foglio ore settimanale; riepilogo admin per cantiere/periodo.
  - KPI Home + notifiche base (sotto soglia, meteo).
  - Report consumi per cantiere.
- Sprint 3
  - Valore magazzino (costo medio), scorta_sicurezza, alert programmati.
  - Scadenze integrate (reminder).
- Sprint 4
  - Mobile-friendly, mappa live + meteo in Home, notifiche push.

Quality gates
- <2s risposta UI principali, 0 errori console.
- Hook pre-commit attivo, lint/format ok.
- Query indicizzate su date/FK, transazioni su movimenti.

Metriche di avanzamento
- % task completati per Sprint.
- Errori 5xx/settimana, TTFB medio, Lighthouse statici.