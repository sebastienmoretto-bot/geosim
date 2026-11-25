// Moteur de planning : calcule commandes, fabrication et pose d'un projet.
//
// Deux modes :
//  - 'asap'     : au plus tôt, à partir d'aujourd'hui (ou de la date de validation) ;
//  - 'backward' : à rebours, depuis une date de pose fixée avec le client.
//
// Le moteur ne touche pas à la base : on lui fournit
//  - isWorkday(day)  -> bool   (jour ouvré atelier : semaine, fériés, fermetures)
//  - capacity(day)   -> heures atelier encore disponibles ce jour-là (hors ce projet)
//
// Les délais de livraison sont en jours calendaires (comme les fournisseurs les
// annoncent) ; les marges (buffer) et la fabrication sont en jours ouvrés.

const D = require('./dates');

const MAX_SCAN_DAYS = 730;

function nextWorkday(day, isWorkday) { // day lui-même s'il est ouvré
  let d = day;
  for (let i = 0; i < MAX_SCAN_DAYS && !isWorkday(d); i++) d = D.addDays(d, 1);
  return d;
}

function prevWorkday(day, isWorkday) {
  let d = day;
  for (let i = 0; i < MAX_SCAN_DAYS && !isWorkday(d); i++) d = D.addDays(d, -1);
  return d;
}

function addWorkdays(day, n, isWorkday) { // n >= 0, part de day (non compté)
  let d = day;
  for (let i = 0; i < n; i++) d = nextWorkday(D.addDays(d, 1), isWorkday);
  return d;
}

function subWorkdays(day, n, isWorkday) {
  let d = day;
  for (let i = 0; i < n; i++) d = prevWorkday(D.addDays(d, -1), isWorkday);
  return d;
}

// Répartit `hours` sur les jours ouvrés à partir de `from` (vers l'avant).
function allocateForward(from, hours, isWorkday, capacity) {
  const out = [];
  let remaining = round(hours);
  let d = from;
  for (let i = 0; remaining > 0 && i < MAX_SCAN_DAYS; i++, d = D.addDays(d, 1)) {
    if (!isWorkday(d)) continue;
    const free = Math.max(0, capacity(d));
    if (free <= 0) continue;
    const h = round(Math.min(free, remaining));
    out.push({ day: d, hours: h });
    remaining = round(remaining - h);
  }
  return { allocations: out, unallocated: remaining };
}

// Répartit `hours` en remontant le temps depuis `to` (inclus), sans passer avant `notBefore`.
function allocateBackward(to, hours, isWorkday, capacity, notBefore) {
  const out = [];
  let remaining = round(hours);
  let d = to;
  for (let i = 0; remaining > 0 && i < MAX_SCAN_DAYS; i++, d = D.addDays(d, -1)) {
    if (notBefore && d < notBefore) break;
    if (!isWorkday(d)) continue;
    const free = Math.max(0, capacity(d));
    if (free <= 0) continue;
    const h = round(Math.min(free, remaining));
    out.unshift({ day: d, hours: h });
    remaining = round(remaining - h);
  }
  return { allocations: out, unallocated: remaining };
}

function round(n) { return Math.round(n * 100) / 100; }

// Date d'arrivée connue ou prévue d'une commande.
function orderArrival(o, orderDay) {
  if (o.received_at) return o.received_at;
  if (o.ordered_at) return o.expected_at || D.addDays(o.ordered_at, o.lead_days);
  return D.addDays(orderDay, o.lead_days);
}

/**
 * @param {object} p
 * @param {'asap'|'backward'} p.mode
 * @param {string} p.today
 * @param {string} [p.startDate]     date à partir de laquelle on peut commander (validation du devis)
 * @param {string} [p.installDate]   date de pose (obligatoire en mode backward)
 * @param {number} p.fabHours        heures de fabrication atelier
 * @param {number} p.installDays     durée de la pose en jours
 * @param {number} p.bufferDays      marge livraisons (jours ouvrés)
 * @param {number} p.fabMarginDays   marge entre fin de fabrication et pose (jours ouvrés)
 * @param {Array}  p.orders          [{id, label, lead_days, needed_for, ordered_at, expected_at, received_at}]
 */
function planProject(p) {
  const { isWorkday, capacity } = p;
  const warnings = [];
  const today = p.today;
  const earliestOrder = D.maxDay(today, p.startDate);
  const buffer = Math.max(0, p.bufferDays | 0);
  const fabMargin = Math.max(0, p.fabMarginDays | 0);
  const installDays = Math.max(1, p.installDays | 0);
  const fabHours = Math.max(0, Number(p.fabHours) || 0);
  const orders = (p.orders || []).map((o) => ({ ...o }));
  const fabOrders = orders.filter((o) => o.needed_for !== 'pose');
  const poseOrders = orders.filter((o) => o.needed_for === 'pose');

  let fabStart = null, fabEnd = null, installDate = null, allocations = [];

  if (p.mode === 'backward') {
    if (!p.installDate) throw new Error('Date de pose requise pour le calcul à rebours');
    installDate = p.installDate;
    if (!isWorkday(installDate)) warnings.push({ level: 'info', text: "La date de pose tombe un jour non ouvré pour l'atelier." });

    if (fabHours > 0) {
      const latestEnd = subWorkdays(installDate, Math.max(1, fabMargin), isWorkday);
      const r = allocateBackward(latestEnd, fabHours, isWorkday, capacity, today);
      allocations = r.allocations;
      if (r.unallocated > 0) {
        warnings.push({ level: 'danger', text: `Capacité atelier insuffisante : ${r.unallocated} h ne rentrent pas avant la pose. Décalez la pose ou ajoutez de la capacité.` });
      }
      fabStart = allocations[0]?.day || null;
      fabEnd = allocations[allocations.length - 1]?.day || null;
    }

    const fabNeed = fabStart || subWorkdays(installDate, Math.max(1, fabMargin), isWorkday);
    for (const o of fabOrders) setDeadline(o, subWorkdays(fabNeed, buffer, isWorkday), 'fabrication');
    for (const o of poseOrders) setDeadline(o, subWorkdays(installDate, buffer, isWorkday), 'pose');
  } else {
    // Au plus tôt : on commande tout ce qui n'est pas commandé dès que possible.
    for (const o of orders) {
      if (!o.ordered_at && !o.received_at) o.order_by = prevOrSame(earliestOrder);
      o.expected_at = orderArrival(o, earliestOrder);
    }
    const fabMaterials = D.maxDay(...fabOrders.map((o) => o.expected_at));
    let fabReady = nextWorkday(D.addDays(earliestOrder, 1), isWorkday);
    if (fabMaterials) fabReady = D.maxDay(fabReady, addWorkdays(nextWorkday(fabMaterials, isWorkday), buffer, isWorkday));

    if (fabHours > 0) {
      const r = allocateForward(fabReady, fabHours, isWorkday, capacity);
      allocations = r.allocations;
      if (r.unallocated > 0) warnings.push({ level: 'danger', text: `Impossible de placer ${r.unallocated} h de fabrication : aucune capacité atelier disponible.` });
      fabStart = allocations[0]?.day || null;
      fabEnd = allocations[allocations.length - 1]?.day || null;
    }

    let install = fabEnd ? addWorkdays(fabEnd, Math.max(1, fabMargin), isWorkday) : fabReady;
    const poseMaterials = D.maxDay(...poseOrders.map((o) => o.expected_at));
    if (poseMaterials) install = D.maxDay(install, addWorkdays(nextWorkday(poseMaterials, isWorkday), buffer, isWorkday));
    installDate = nextWorkday(install, isWorkday);
    for (const o of fabOrders) o.needed_by = fabStart ? subWorkdays(fabStart, buffer, isWorkday) : null;
    for (const o of poseOrders) o.needed_by = subWorkdays(installDate, buffer, isWorkday);
  }

  // Contrôles communs
  for (const o of orders) {
    if (!o.ordered_at && !o.received_at && o.order_by && o.order_by < today) {
      warnings.push({ level: 'danger', text: `« ${o.label} » aurait dû être commandé le ${fmt(o.order_by)} : la livraison risque d'arriver trop tard.` });
      o.late = true;
    } else if (o.needed_by && o.expected_at && o.expected_at > o.needed_by && !o.received_at) {
      warnings.push({ level: 'warning', text: `« ${o.label} » est attendu le ${fmt(o.expected_at)}, après la date de besoin (${fmt(o.needed_by)}).` });
      o.late = true;
    }
  }
  if (fabStart && fabStart < today) warnings.push({ level: 'warning', text: 'La fabrication devrait déjà avoir commencé.' });

  const installEnd = addWorkdays(installDate, installDays - 1, isWorkday);
  return { fabStart, fabEnd, installDate, installEnd, allocations, orders, warnings };

  function setDeadline(o, neededBy, kind) {
    o.needed_by = neededBy;
    if (o.ordered_at || o.received_at) {
      o.expected_at = orderArrival(o, today);
    } else {
      o.order_by = prevOrSame(D.addDays(neededBy, -o.lead_days));
      if (o.order_by < earliestOrder && o.order_by >= today) o.order_by = earliestOrder;
      o.expected_at = D.addDays(D.maxDay(o.order_by, today), o.lead_days);
    }
    o.kind = kind;
  }

  function prevOrSame(day) { return prevWorkday(day, isWorkday); }
}

function fmt(day) {
  if (!day) return '';
  const [y, m, d] = day.split('-');
  return `${d}/${m}/${y}`;
}

module.exports = {
  planProject, nextWorkday, prevWorkday, addWorkdays, subWorkdays,
  allocateForward, allocateBackward, fmt,
};
