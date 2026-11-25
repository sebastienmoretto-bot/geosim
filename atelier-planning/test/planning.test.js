const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../server/dates');
const { planProject } = require('../server/planning');

// Semaine lun-ven, 7 h/jour, fériés français
const isWorkday = (d) => D.weekday(d) <= 5 && !D.holidayName(d);
const cap7 = (d) => (isWorkday(d) ? 7 : 0);

test('jours fériés : Pâques 2027 et Ascension', () => {
  assert.equal(D.holidayName('2027-03-29'), 'Lundi de Pâques');
  assert.equal(D.holidayName('2027-05-06'), 'Ascension');
  assert.equal(D.holidayName('2027-05-07'), null);
});

test('au plus tôt : livraison panneaux, fabrication, puis pose', () => {
  const r = planProject({
    mode: 'asap', today: '2027-01-04', // lundi
    fabHours: 21, installDays: 1, bufferDays: 1, fabMarginDays: 1, isWorkday, capacity: cap7,
    orders: [
      { id: 1, label: 'Panneaux', lead_days: 5, needed_for: 'fabrication' },
      { id: 2, label: 'Façades', lead_days: 21, needed_for: 'pose' },
    ],
  });
  // Panneaux commandés le 04, livrés le 09 (sam.) -> lundi 11 + 1 j de marge = mardi 12
  assert.equal(r.orders[0].expected_at, '2027-01-09');
  assert.equal(r.fabStart, '2027-01-12');
  assert.equal(r.fabEnd, '2027-01-14'); // 3 jours x 7 h
  // Façades livrées le 25 (lun.) + 1 j = 26 > fin de fab + 1 = 15
  assert.equal(r.installDate, '2027-01-26');
  assert.equal(r.allocations.reduce((s, a) => s + a.hours, 0), 21);
  assert.equal(r.warnings.filter((w) => w.level !== 'info').length, 0);
});

test('à rebours : date de pose fixée, calcul des dates de commande', () => {
  const r = planProject({
    mode: 'backward', today: '2027-01-04', installDate: '2027-02-15', // lundi
    fabHours: 14, installDays: 2, bufferDays: 2, fabMarginDays: 1, isWorkday, capacity: cap7,
    orders: [
      { id: 1, label: 'Panneaux', lead_days: 5, needed_for: 'fabrication' },
      { id: 2, label: 'Plan quartz', lead_days: 28, needed_for: 'pose' },
    ],
  });
  assert.equal(r.fabEnd, '2027-02-12'); // vendredi avant la pose
  assert.equal(r.fabStart, '2027-02-11');
  // Panneaux nécessaires 2 jours ouvrés avant le 11 -> 09, commandés 5 j avant -> 04
  assert.equal(r.orders[0].needed_by, '2027-02-09');
  assert.equal(r.orders[0].order_by, '2027-02-04');
  // Quartz nécessaire le 11 (2 j ouvrés avant le 15), commandé 28 j avant -> 14/01
  assert.equal(r.orders[1].needed_by, '2027-02-11');
  assert.equal(r.orders[1].order_by, '2027-01-14');
  assert.equal(r.installEnd, '2027-02-16');
});

test('à rebours : alerte si une commande aurait déjà dû partir', () => {
  const r = planProject({
    mode: 'backward', today: '2027-01-04', installDate: '2027-01-20',
    fabHours: 7, installDays: 1, bufferDays: 2, fabMarginDays: 1, isWorkday, capacity: cap7,
    orders: [{ id: 1, label: 'Plan quartz', lead_days: 28, needed_for: 'pose' }],
  });
  assert.ok(r.orders[0].late);
  assert.ok(r.warnings.some((w) => w.level === 'danger' && /Plan quartz/.test(w.text)));
});

test('capacité partagée : la fabrication saute les jours déjà pleins', () => {
  const full = new Set(['2027-01-05', '2027-01-06']);
  const r = planProject({
    mode: 'asap', today: '2027-01-04', fabHours: 10, installDays: 1, bufferDays: 0, fabMarginDays: 1,
    isWorkday, capacity: (d) => (full.has(d) ? 0 : cap7(d)), orders: [],
  });
  assert.deepEqual(r.allocations, [{ day: '2027-01-07', hours: 7 }, { day: '2027-01-08', hours: 3 }]);
  assert.equal(r.installDate, '2027-01-11');
});

test('à rebours : capacité insuffisante signalée', () => {
  const r = planProject({
    mode: 'backward', today: '2027-01-04', installDate: '2027-01-07',
    fabHours: 40, installDays: 1, bufferDays: 0, fabMarginDays: 1, isWorkday, capacity: cap7, orders: [],
  });
  assert.ok(r.warnings.some((w) => /Capacité atelier insuffisante/.test(w.text)));
});

test('commande déjà passée : on utilise la date de livraison annoncée', () => {
  const r = planProject({
    mode: 'asap', today: '2027-01-04', fabHours: 7, installDays: 1, bufferDays: 0, fabMarginDays: 1, isWorkday, capacity: cap7,
    orders: [{ id: 1, label: 'Panneaux', lead_days: 5, needed_for: 'fabrication', ordered_at: '2026-12-28', expected_at: '2027-01-12' }],
  });
  assert.equal(r.fabStart, '2027-01-12');
});
