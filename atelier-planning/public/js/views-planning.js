/* Planning : 40 jours ouvrés glissants (par défaut) ou vue mensuelle */
'use strict';

function isoWeek(day) {
  const d = parseDay(day);
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const n = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - n);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t - y0) / 86400000 + 1) / 7);
}

function localStorageGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function localStorageSet(k, v) { try { localStorage.setItem(k, v); } catch { /* stockage indisponible */ } }

const MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

Views.planning = async (view, _params, query) => {
  const t = today();
  const mode = query.vue === 'mois' ? 'mois' : '40j';
  const show = JSON.parse(localStorageGet('planning.show') || '{"fab":true,"pose":true,"deliv":true,"order":true,"task":true}');
  let gridStart, gridEnd, subtitle, nav, month = null;

  if (mode === 'mois') {
    month = /^\d{4}-\d{2}$/.test(query.mois || '') ? query.mois : t.slice(0, 7);
    const first = `${month}-01`;
    gridStart = addDays(first, -((parseDay(first).getDay() + 6) % 7));
    gridEnd = addDays(gridStart, 41);
    const [y, m] = month.split('-').map(Number);
    const prev = `${m === 1 ? y - 1 : y}-${pad(m === 1 ? 12 : m - 1)}`;
    const next = `${m === 12 ? y + 1 : y}-${pad(m === 12 ? 1 : m + 1)}`;
    subtitle = `${MONTHS[m - 1]} ${y}`;
    nav = { prev: `#/planning?vue=mois&mois=${prev}`, next: `#/planning?vue=mois&mois=${next}`, today: '#/planning?vue=mois', prevLabel: 'Mois précédent', nextLabel: 'Mois suivant' };
  } else {
    // 8 semaines du lundi au vendredi = 40 jours ouvrés, à partir du lundi de la semaine en cours
    const shift = Number.parseInt(query.decalage || '0', 10) || 0;
    const monday = addDays(t, -((parseDay(t).getDay() + 6) % 7));
    gridStart = addDays(monday, shift * 7);
    gridEnd = addDays(gridStart, 55);
    subtitle = `40 jours ouvrés · du ${fmtDate(gridStart)} au ${fmtDate(addDays(gridEnd, -2))}`;
    nav = { prev: `#/planning?decalage=${shift - 1}`, next: `#/planning?decalage=${shift + 1}`, today: '#/planning', prevLabel: 'Semaine précédente', nextLabel: 'Semaine suivante' };
  }

  const cal = await api(`/calendar?from=${gridStart}&to=${gridEnd}`);
  const closures = cal.closures || [];

  // Commandes à passer : une ligne par projet et par jour
  const ordGrouped = [];
  for (const o of cal.order_deadlines || []) {
    const g = ordGrouped.find((x) => x.day === o.day && x.project_id === o.project_id);
    if (g) g.labels.push(o.label); else ordGrouped.push({ day: o.day, project_id: o.project_id, title: o.title, labels: [o.label] });
  }
  // Vue 40 jours : ce qui tombe un samedi ou un dimanche est affiché le lundi suivant
  const target = (day) => {
    const wd = parseDay(day).getDay();
    if (mode === 'mois' || (wd !== 0 && wd !== 6)) return { day, from: '' };
    return { day: addDays(day, wd === 6 ? 2 : 1), from: wd === 6 ? '(sam.) ' : '(dim.) ' };
  };
  const by = (list) => {
    const map = new Map();
    for (const e of list || []) {
      const tg = target(e.day);
      if (!map.has(tg.day)) map.set(tg.day, []);
      map.get(tg.day).push({ ...e, from: tg.from });
    }
    return map;
  };
  const fab = by(cal.fabrication), pose = by(cal.installs), deliv = by(cal.deliveries), ord = by(ordGrouped), tasks = by(cal.tasks);
  const days = mode === 'mois' ? cal.days : cal.days.filter((d) => d.weekday <= 5);
  const cols = mode === 'mois' ? ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'] : ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven'];

  const dateLabel = (day) => {
    const dn = parseDay(day);
    return mode === 'mois' ? String(dn.getDate()) : `${dn.getDate()} ${MONTHS_SHORT[dn.getMonth()]}`;
  };

  view.innerHTML = String(html`
    <div class="page-head"><div><h1>Planning</h1><div class="muted">${subtitle}</div></div>
      <div class="actions">
        <div class="segmented" role="group" aria-label="Affichage">
          <button type="button" data-vue="40j" class="${mode === '40j' ? 'on' : ''}">40 jours</button>
          <button type="button" data-vue="mois" class="${mode === 'mois' ? 'on' : ''}">Mois</button></div>
        <a class="btn icon" href="${nav.prev}" aria-label="${nav.prevLabel}" title="${nav.prevLabel}">${icon('left')}</a>
        <a class="btn" href="${nav.today}">Aujourd'hui</a>
        <a class="btn icon" href="${nav.next}" aria-label="${nav.nextLabel}" title="${nav.nextLabel}">${icon('right')}</a></div></div>
    <div class="row" style="margin-bottom:12px">
      <div class="legend" id="filters">
        ${[['fab', 'Fabrication', 'var(--fab)'], ['pose', 'Pose', 'var(--pose)'], ['deliv', 'Livraisons', 'var(--deliv)'], ['order', 'Commandes à passer', 'var(--order)'], ['task', 'Tâches', 'var(--muted)']]
          .map(([k, l, c]) => html`<label class="check"><input type="checkbox" data-k="${k}" ${show[k] ? 'checked' : ''}><i style="background:${c}"></i>${l}</label>`)}
      </div><span class="spacer"></span><span class="muted small">En haut à droite de chaque jour : heures atelier planifiées / capacité</span></div>
    <div class="cal ${mode === '40j' ? 'cal-5' : ''}">
      ${cols.map((d) => html`<div class="cal-head">${d}</div>`)}
      ${days.map((d) => {
        const dayClos = closures.filter((c) => d.day >= c.start_date && d.day <= c.end_date);
        const cls = [d.workday ? '' : 'off', month && d.day.slice(0, 7) !== month ? 'other' : '', d.day === t ? 'today' : '', mode === '40j' && d.day < t ? 'past' : ''].join(' ');
        return html`<div class="cal-day ${cls}">
          <div class="cal-date"><span>${dateLabel(d.day)}</span>
            ${d.weekday === 1 ? html`<span class="badge" title="Semaine ${isoWeek(d.day)}">S${isoWeek(d.day)}</span>` : ''}
            <span class="muted small" style="font-weight:400">${d.holiday || ''}</span>
            ${d.capacity ? html`<span class="cal-load ${d.used > d.capacity ? 'over' : ''}">${Math.round(d.used * 10) / 10}/${d.capacity} h</span>` : ''}</div>
          ${dayClos.map((c) => html`<span class="ev closed">${c.user_name ? `${c.user_name} absent` : 'Atelier fermé'}${c.label ? ` · ${c.label}` : ''}</span>`)}
          ${show.pose ? (pose.get(d.day) || []).map((e) => html`<a class="ev pose" href="#/projets/${e.project_id}" title="Pose ${e.title}${e.client_name ? ' · ' + e.client_name : ''}">${e.from}${e.part === 1 ? (e.install_time || '').replace(':', 'h') + ' ' : ''}Pose ${e.title}${e.install_days > 1 ? ` (${e.part}/${e.install_days})` : ''}</a>`) : ''}
          ${show.fab ? (fab.get(d.day) || []).map((e) => html`<a class="ev fab" href="#/projets/${e.project_id}" title="${e.title} · ${hours(e.hours)}">${e.from}${hours(e.hours)} ${e.title}</a>`) : ''}
          ${show.deliv ? (deliv.get(d.day) || []).map((e) => html`<a class="ev deliv" href="#/projets/${e.project_id}" title="${e.status === 'recu' ? 'Reçu' : 'Livraison prévue'} : ${e.label} (${e.title})">${e.from}${e.status === 'recu' ? '✓ ' : ''}${e.label}</a>`) : ''}
          ${show.order ? (ord.get(d.day) || []).map((e) => html`<a class="ev order" href="#/projets/${e.project_id}" title="Commander : ${e.labels.join(', ')} (${e.title})">${e.from}Commander ${e.labels.length > 1 ? `${e.labels.length} postes` : e.labels[0]} · ${e.title}</a>`) : ''}
          ${show.task ? (tasks.get(d.day) || []).map((e) => html`<a class="ev" href="#/taches" style="border-color:var(--muted);${e.done_at ? 'text-decoration:line-through' : ''}">${e.from}${e.title}</a>`) : ''}
        </div>`;
      })}
    </div>
    ${mode === '40j' ? html`<p class="muted small" style="margin-top:8px">Samedis et dimanches masqués : un élément prévu le week-end est affiché le lundi suivant, précédé de « (sam.) » ou « (dim.) ».</p>` : ''}`);

  $$('#filters input', view).forEach((c) => c.addEventListener('change', () => {
    show[c.dataset.k] = c.checked;
    localStorageSet('planning.show', JSON.stringify(show));
    Views.planning(view, _params, query);
  }));
  $$('[data-vue]', view).forEach((b) => b.addEventListener('click', () => {
    App.go(b.dataset.vue === 'mois' ? '#/planning?vue=mois' : '#/planning');
  }));
};
