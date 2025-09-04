document.addEventListener('DOMContentLoaded', () => {
  const el = document.getElementById('calendar');
  if (!el || !window.FullCalendar) return;

  const dateInput = document.getElementById('seleziona-data');

  // mini overlay per cambio cantiere
  let cantiereList = [];
  async function loadCantieri() {
    if (cantiereList.length) return cantiereList;
    const r = await fetch('/dashboard/api/cantieri'); 
    cantiereList = await r.json();
    return cantiereList;
  }
  function openCantiereDialog(currentId) {
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:#0006;display:flex;align-items:center;justify-content:center;z-index:9999;';
    const box = document.createElement('div');
    box.style.cssText = 'background:#fff;padding:16px;border-radius:8px;min-width:320px;';
    box.innerHTML = `
      <h4 style="margin-top:0;">Cambia cantiere</h4>
      <select id="dlg-cantiere" style="width:100%;margin:8px 0;"></select>
      <div style="text-align:right;margin-top:8px;">
        <button id="dlg-cancel" class="btn btn-sm">Annulla</button>
        <button id="dlg-ok" class="btn btn-sm btn-primary">Aggiorna</button>
      </div>`;
    ov.appendChild(box);
    document.body.appendChild(ov);

    const sel = box.querySelector('#dlg-cantiere');
    sel.innerHTML = '';
    for (const c of cantiereList) {
      const opt = document.createElement('option');
      opt.value = c.ID;
      opt.textContent = c.NomeCantiere;
      if (String(c.ID) === String(currentId)) opt.selected = true;
      sel.appendChild(opt);
    }

    return new Promise((resolve) => {
      box.querySelector('#dlg-cancel').onclick = () => { ov.remove(); resolve(null); };
      box.querySelector('#dlg-ok').onclick = () => { const v = sel.value; ov.remove(); resolve(v); };
    });
  }

  const calendar = new FullCalendar.Calendar(el, {
    initialView: 'dayGridMonth',
    locale: 'it',
    height: 'auto',
    firstDay: 1,
    headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,listWeek' },
    editable: true,
    eventStartEditable: true,
    eventDurationEditable: false,
    eventAllow: (dropInfo, draggedEvent) => {
      const today = new Date(); today.setHours(0,0,0,0);
      return dropInfo.start >= today; // vieta spostamenti nel passato
    },
    events: async (info, success, failure) => {
      try {
        const url = `/dashboard/api/pianificazioni/calendar?start=${info.startStr}&end=${info.endStr}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const events = await res.json();
        success(events);
      } catch (e) {
        console.error(e);
        failure(e);
      }
    },
    dateClick: (arg) => {
      if (dateInput) {
        const iso = arg.date.toISOString().slice(0, 10);
        const [y,m,d] = iso.split('-');
        dateInput.value = `${d}/${m}/${y}`;
        dateInput.dispatchEvent(new Event('change'));
      }
      const form = document.getElementById('pianificaForm');
      if (form) form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    // Drag & drop per cambiare data
    eventDrop: async (info) => {
      try {
        const res = await fetch(`/dashboard/api/pianificazioni/${info.event.id}/move`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: info.event.startStr })
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
      } catch (e) {
        console.error(e);
        info.revert();
        alert('Errore nello spostamento.');
      } finally {
        calendar.refetchEvents();
      }
    },
    // Click per cambiare cantiere
    eventClick: async (arg) => {
      try {
        await loadCantieri();
        const currentCant = arg.event.extendedProps?.idCantiere;
        const newCant = await openCantiereDialog(currentCant);
        if (!newCant || String(newCant) === String(currentCant)) return;

        const res = await fetch(`/dashboard/api/pianificazioni/${arg.event.id}/move`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idCantiere: newCant })
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        calendar.refetchEvents();
      } catch (e) {
        console.error(e);
        alert('Errore aggiornamento cantiere.');
      }
    }
  });

  calendar.render();
});