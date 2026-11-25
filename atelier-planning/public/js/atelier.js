/* Écran atelier : affichage mural, rafraîchi automatiquement */
'use strict';
(function () {
  const params = new URLSearchParams(location.search);
  const key = params.get('cle') || params.get('key') || '';
  if (params.get('theme') === 'clair') document.documentElement.dataset.theme = 'light';

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const pad = (n) => String(n).padStart(2, '0');
  const parseDay = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); };
  const DAYS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
  const DAYS_LONG = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const shortDate = (s) => { const d = parseDay(s); return `${DAYS[d.getDay()]} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`; };
  const h = (n) => `${Math.round(n * 10) / 10} h`;
  let last = null;

  function clock() {
    const n = new Date();
    const el = document.getElementById('clock');
    if (el) el.textContent = `${pad(n.getHours())}:${pad(n.getMinutes())}`;
  }

  function group(list) {
    const m = new Map();
    for (const e of list || []) { if (!m.has(e.day)) m.set(e.day, []); m.get(e.day).push(e); }
    return m;
  }

  function render(d) {
    const fab = group(d.fabrication), pose = group(d.installs), deliv = group(d.deliveries);
    const t = d.today;
    const td = parseDay(t);
    // Samedi/dimanche affichés seulement s'ils sont travaillés ou ont un événement
    const showDay = (x) => x.weekday <= 5 || x.workday || pose.has(x.day) || fab.has(x.day) || deliv.has(x.day);
    const weeks = [d.days.slice(0, 7).filter(showDay), d.days.slice(7, 14).filter(showDay)];
    const fabToday = fab.get(t) || [], poseToday = pose.get(t) || [], delivToday = (deliv.get(t) || []);
    const upcoming = d.installs.filter((i) => i.day > t && i.part === 1).slice(0, 6);
    const list = (items, fn, empty) => (items.length ? items.map(fn).join('') : `<div class="none">${empty}</div>`);

    document.getElementById('root').innerHTML = `
      <header><img class="logo" src="img/logo.png" alt=""><h1>${esc(String(d.company || '').split(' ')[0])}<small>${esc(String(d.company || '').split(' ').slice(1).join(' '))}</small></h1>
        <span class="date">${DAYS_LONG[td.getDay()]} ${td.getDate()} ${MONTHS[td.getMonth()]}</span>
        <span class="clock" id="clock"></span></header>
      <div class="wrap">
        <div class="col">
          <section class="panel"><h2>Aujourd'hui</h2><div class="today-grid">
            <div><h3><span class="dot" style="background:var(--fab)"></span>Fabrication</h3>
              ${list(fabToday, (e) => `<div class="item big"><span class="t">${esc(e.title)}</span><span class="s">${h(e.hours)}</span></div>`, 'Pas de fabrication planifiée')}</div>
            <div><h3><span class="dot" style="background:var(--pose)"></span>Poses</h3>
              ${list(poseToday, (e) => `<div class="item big"><span class="t">${esc(e.title)}</span><span class="s">${e.part === 1 ? esc((e.install_time || '').replace(':', 'h')) : `jour ${e.part}/${e.install_days}`}</span></div>`, 'Aucune pose')}</div>
            <div><h3><span class="dot" style="background:var(--deliv)"></span>Livraisons attendues</h3>
              ${list(delivToday, (e) => `<div class="item big"><span class="t">${e.status === 'recu' ? '✓ ' : ''}${esc(e.label)}</span><span class="s">${esc(e.title)}</span></div>`, 'Aucune livraison')}</div>
          </div></section>
          <section class="weeks">${weeks.map((w, wi) => `
            <div class="week" style="grid-template-columns:repeat(${w.length}, minmax(0,1fr))">${w.map((x) => {
              const pct = x.capacity ? Math.min(100, Math.round((x.used / x.capacity) * 100)) : 0;
              return `<div class="day ${x.day === t ? 'today' : ''} ${x.day < t ? 'past' : ''} ${x.workday ? '' : 'off'}">
                <div class="day-head"><span class="dn">${shortDate(x.day)}</span>${x.holiday ? `<span style="font-weight:400">${esc(x.holiday)}</span>` : ''}
                  ${x.capacity ? `<span class="load ${x.used > x.capacity ? 'over' : ''}">${h(x.used)} / ${h(x.capacity)}</span>` : ''}</div>
                ${x.capacity ? `<div class="loadbar"><span style="width:${pct}%"></span></div>` : ''}
                ${(pose.get(x.day) || []).map((e) => `<div class="ev pose">Pose ${esc(e.title)}${e.install_days > 1 ? ` ${e.part}/${e.install_days}` : ''}</div>`).join('')}
                ${(fab.get(x.day) || []).map((e) => `<div class="ev fab">${h(e.hours)} · ${esc(e.title)}</div>`).join('')}
                ${(deliv.get(x.day) || []).map((e) => `<div class="ev deliv">${e.status === 'recu' ? '✓ ' : ''}${esc(e.label)}</div>`).join('')}
              </div>`;
            }).join('')}</div>${wi === 0 ? '' : ''}`).join('')}</section>
        </div>
        <div class="col">
          <section class="panel"><h2>À traiter</h2>
            <div class="item"><span class="t">Commandes en retard</span><span class="alert-n ${d.orders_late.length ? 'danger' : 'ok'}">${d.orders_late.length}</span></div>
            ${d.orders_late.slice(0, 4).map((o) => `<div class="item"><span class="t" style="font-weight:400">${esc(o.label)}</span><span class="s">${esc(o.project_title)}</span></div>`).join('')}
            <div class="item"><span class="t">Livraisons en retard</span><span class="alert-n ${d.deliveries_late.length ? 'warning' : 'ok'}">${d.deliveries_late.length}</span></div>
            ${d.deliveries_late.slice(0, 4).map((o) => `<div class="item"><span class="t" style="font-weight:400">${esc(o.label)}</span><span class="s">prévu ${shortDate(o.expected_at)}</span></div>`).join('')}
          </section>
          <section class="panel"><h2>Prochaines poses</h2>
            ${list(upcoming, (e) => `<div class="item"><span class="t">${esc(e.title)}</span><span class="s">${shortDate(e.day)} ${esc((e.install_time || '').replace(':', 'h'))}</span></div>`, 'Aucune pose dans les 2 semaines')}</section>
          <section class="panel" style="flex:1"><h2>Tâches du jour</h2>
            ${list(d.tasks_today, (k) => `<div class="item"><span class="t" style="font-weight:500">${esc(k.title)}</span>${k.due_date < t ? '<span class="s danger">en retard</span>' : ''}</div>`, 'Rien de prévu')}</section>
        </div>
      </div>`;
    clock();
  }

  async function load() {
    const st = document.getElementById('status');
    try {
      const res = await fetch(`/api/display?cle=${encodeURIComponent(key)}`, { cache: 'no-store' });
      if (res.status === 403) {
        document.getElementById('root').innerHTML = '<div class="error-screen"><div><h1>Clé d’affichage invalide</h1><p>Ouvrez l’adresse fournie dans Réglages › Écran atelier.</p></div></div>';
        return;
      }
      if (!res.ok) throw new Error(res.status);
      last = await res.json();
      render(last);
      const n = new Date();
      st.className = 'status';
      st.textContent = `Mis à jour à ${pad(n.getHours())}:${pad(n.getMinutes())}`;
    } catch {
      st.className = 'status lost';
      st.textContent = last ? 'Connexion au serveur perdue — nouvel essai dans 1 minute' : 'Serveur injoignable — nouvel essai dans 1 minute';
    }
  }

  load();
  setInterval(load, 60000);
  setInterval(clock, 10000);
  // Rechargement complet chaque nuit pour récupérer d'éventuelles mises à jour de la page
  setTimeout(() => location.reload(), (() => { const n = new Date(); const m = new Date(n); m.setHours(24, 5, 0, 0); return m - n; })());
}());
