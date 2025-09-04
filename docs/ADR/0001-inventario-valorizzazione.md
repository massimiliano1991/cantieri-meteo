# ADR-0001 — Valorizzazione magazzino
Decisione: costo medio ponderato (V2). In V1 si registrano solo quantità; opzionale costo_unitario sui carichi.
Motivazione: semplice, comprensibile, compatibile con report basici; FIFO potrà essere considerato in futuro.
Impatto: aggiungere campo costo_unitario su magazzino_movimenti (NULL in V1), calcolo del valore su vista/report.