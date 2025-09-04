# Cantieri Meteo — Progetto

Obiettivo
- Gestionale per cantieri, pianificazione, ore e magazzino. UI semplice, chiara, veloce.

Stack
- Node.js + Express, MySQL (mysql2), frontend HTML/CSS/JS, librerie: FullCalendar, Leaflet, Chart.js.

Setup rapido
1) Copia .env.example in .env e imposta DB.
2) npm i
3) Avvia: npm run dev (con nodemon) o npm start
4) API base:
   - /cantieri/tutti, /cantieri/nomi
   - /dashboard/api/pianificazioni (pianificazione)
   - /magazzino/articoli (inventario)

Struttura
- routes/, moduli/, public/, docs/, scripts/, .vscode/

Qualità
- Date ISO nelle API; logging errori lato server; query indicizzate; UI con feedback chiari.