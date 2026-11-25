// Calendrier atelier : jours ouvrés et capacité, à partir de la base.
const D = require('./dates');

function loadCalendar(db, { excludeProjectId = null } = {}) {
  const staff = db.prepare('SELECT id, name, hours_per_day, workdays FROM users WHERE active = 1 AND workshop = 1').all()
    .map((u) => ({ ...u, days: new Set(String(u.workdays).split(',').map(Number)) }));
  const closures = db.prepare('SELECT start_date, end_date, user_id FROM closures').all();
  const used = new Map();
  const rows = excludeProjectId
    ? db.prepare(`SELECT a.day, SUM(a.hours) h FROM allocations a JOIN projects p ON p.id = a.project_id
                  WHERE a.project_id != ? AND p.status != 'annule' GROUP BY a.day`).all(excludeProjectId)
    : db.prepare(`SELECT a.day, SUM(a.hours) h FROM allocations a JOIN projects p ON p.id = a.project_id
                  WHERE p.status != 'annule' GROUP BY a.day`).all();
  for (const r of rows) used.set(r.day, r.h);

  const closedFor = (day, userId) => closures.some((c) =>
    day >= c.start_date && day <= c.end_date && (c.user_id == null || c.user_id === userId));

  function grossCapacity(day) {
    if (D.holidayName(day)) return 0;
    const wd = D.weekday(day);
    let total = 0;
    for (const u of staff) if (u.days.has(wd) && !closedFor(day, u.id)) total += u.hours_per_day;
    return total;
  }

  // Si personne n'est déclaré « atelier », on considère une semaine type lun-ven
  // (sinon aucun planning ne serait possible au premier lancement).
  const noStaff = staff.length === 0;
  function isWorkday(day) {
    if (D.holidayName(day)) return false;
    if (noStaff) return D.weekday(day) <= 5 && !closedFor(day, null);
    return grossCapacity(day) > 0;
  }
  function capacityTotal(day) {
    if (noStaff) return isWorkday(day) ? 7 : 0;
    return grossCapacity(day);
  }
  function capacity(day) {
    return Math.max(0, capacityTotal(day) - (used.get(day) || 0));
  }

  return { isWorkday, capacity, capacityTotal, used: (day) => used.get(day) || 0, noStaff };
}

module.exports = { loadCalendar };
