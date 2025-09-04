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