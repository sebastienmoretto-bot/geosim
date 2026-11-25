// Utilitaires de dates. Toutes les dates « jour » sont des chaînes 'YYYY-MM-DD'
// en heure locale (le serveur tourne avec TZ=Europe/Paris).

function pad(n) { return String(n).padStart(2, '0'); }

function toDay(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseDay(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0); // midi : évite les soucis d'heure d'été
}

function today() { return toDay(new Date()); }

function addDays(day, n) {
  const d = parseDay(day);
  d.setDate(d.getDate() + n);
  return toDay(d);
}

function weekday(day) { // 1 = lundi … 7 = dimanche
  const w = parseDay(day).getDay();
  return w === 0 ? 7 : w;
}

function maxDay(...days) {
  return days.filter(Boolean).sort().pop() || null;
}

function minDay(...days) {
  return days.filter(Boolean).sort().shift() || null;
}

function diffDays(a, b) { // b - a en jours
  return Math.round((parseDay(b) - parseDay(a)) / 86400000);
}

// Date/heure locale 'YYYY-MM-DDTHH:MM'
function toLocalDateTime(d) {
  return `${toDay(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parseLocalDateTime(s) {
  const [day, time = '00:00'] = s.split('T');
  const [y, m, d] = day.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, 0);
}

function nowLocal() { return toLocalDateTime(new Date()); }

// Jours fériés français (métropole)
function easter(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${pad(month)}-${pad(day)}`;
}

const holidayCache = new Map();
function frenchHolidays(year) {
  if (holidayCache.has(year)) return holidayCache.get(year);
  const e = easter(year);
  const map = new Map([
    [`${year}-01-01`, "Jour de l'an"],
    [addDays(e, 1), 'Lundi de Pâques'],
    [`${year}-05-01`, 'Fête du travail'],
    [`${year}-05-08`, 'Victoire 1945'],
    [addDays(e, 39), 'Ascension'],
    [addDays(e, 50), 'Lundi de Pentecôte'],
    [`${year}-07-14`, 'Fête nationale'],
    [`${year}-08-15`, 'Assomption'],
    [`${year}-11-01`, 'Toussaint'],
    [`${year}-11-11`, 'Armistice'],
    [`${year}-12-25`, 'Noël'],
  ]);
  holidayCache.set(year, map);
  return map;
}

function holidayName(day) {
  return frenchHolidays(Number(day.slice(0, 4))).get(day) || null;
}

module.exports = {
  pad, toDay, parseDay, today, addDays, weekday, maxDay, minDay, diffDays,
  toLocalDateTime, parseLocalDateTime, nowLocal, frenchHolidays, holidayName,
};
