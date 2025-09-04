# API Dashboard (V1)

Base: /dashboard

## GET /api/cantieri
- Ritorna: [{ ID, NomeCantiere, Indirizzo, Lat, Lon }]

## GET /api/cantieri/nomi
- Ritorna: [{ ID, NomeCantiere }]

## GET /api/dipendenti
- Ritorna: [{ ID, NomeCompleto }]

## POST /api/pianifica
- Body: { cantiereId:number, data:string(YYYY-MM-DD|DD/MM/YYYY), dipendenti:number[] }
- Ritorna: { PianificazioneID, CantiereID, DataIso, assigned:[], duplicates:[], conflicts:[] }

## GET /api/pianificazioni
- Ritorna: [{ ID, CantiereID, NomeCantiere, DataIso, DataIt, Dipendenti:[{ID,NomeCompleto}] }]

## PATCH /api/pianificazioni/:id/assegna
- Body: { dipendenti:number[] }
- Ritorna: { PianificazioneID, assigned:[], duplicates:[], conflicts:[] }

## DELETE /api/pianificazioni/:id/assegna/:dipendenteId
- Ritorna: { message }

## PATCH /api/pianificazioni/:id/move
- Body: { cantiereId?:number, data?:string }
- Ritorna: { From, To, moved:number[], skipped:number[] }

## GET /api/pianificazioni/calendar?start=YYYY-MM-DD&end=YYYY-MM-DD
- Ritorna: [{ id, title, start, allDay:true, editable:true, extendedProps:{ idCantiere } }]

## POST /api/ore
- Body: { idDipendente, idCantiere, data, oraInizio, oraFine }
- Ritorna: { message }

## GET /api/overview
- Ritorna: { cantieri:number, dipendenti:number, pianificazioniOggi:number }

## GET /api/magazzino/inventario
- Ritorna inventario completo (campi dinamici).

## POST /api/magazzino
- Body: { nome, categoria?, quantita, sogliaMinima, fornitore?, note? }
- Se esiste per nome: incrementa Quantita e aggiorna SogliaMinima al massimo.

# API (snapshot)

Base pubblica: /

Cantieri
- GET /cantieri/tutti -> [{ id, nome_cantiere, indirizzo, lat, lon }]
- GET /cantieri/nomi -> [{ id, nome_cantiere }]

Pianificazione (prefisso /dashboard)
- GET  /dashboard/api/pianificazioni
- POST /dashboard/api/pianifica
- PATCH /dashboard/api/pianificazioni/:id/move
- PATCH/DELETE assegnazioni (tbd)

Magazzino
- GET  /magazzino/articoli
- POST /magazzino/articoli
- PUT  /magazzino/articoli/:id
- DELETE /magazzino/articoli/:id
- POST /magazzino/movimenti  (carico|scarico|rettifica)
- GET  /magazzino/movimenti   (filtri: articolo, cantiere, data)
- GET  /magazzino/kpi         -> { tot_articoli, sotto_soglia, critici }

Magazzino – Movimenti
- POST /magazzino/movimenti  
  Body: { articoloId?:number, nome?:string, tipo:'carico'|'scarico'|'rettifica', quantita:number>0, cantiereId?:number, costoUnitario?:number, note?:string }  
  Logica: transazione; carico += q; scarico -= q (no sotto zero); rettifica = imposta giacenza a q.  
  Response: { movimentoId, articoloId, tipo, quantita, giacenza }

- GET /magazzino/movimenti?articoloId=&from=YYYY-MM-DD&to=YYYY-MM-DD  
  Response: ultimi movimenti (max 500), ordinati desc.

Ore (tbd)
- GET /ore
- POST /ore

Scadenze (tbd)
- GET /scadenze
- POST /scadenze
- PATCH /scadenze/:id