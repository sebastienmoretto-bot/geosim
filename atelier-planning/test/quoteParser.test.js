const test = require('node:test');
const assert = require('node:assert/strict');
const { parseQuoteText, parseAmount } = require('../server/quoteParser');
const { DEFAULT_SETTINGS } = require('../server/db');

const opts = {
  fabKeywords: DEFAULT_SETTINGS.labor_fab_keywords,
  poseKeywords: DEFAULT_SETTINGS.labor_pose_keywords,
  hourlyRate: 45,
  categories: [
    { id: 1, name: 'Panneaux / bois', keywords: 'panneau|caisson|mélaminé' },
    { id: 3, name: 'Façades', keywords: 'façade|facade' },
    { id: 5, name: 'Plan quartz', keywords: 'quartz|céramique' },
    { id: 6, name: 'Électroménager', keywords: 'four|plaque|hotte' },
  ],
};

test('montants au format français', () => {
  assert.equal(parseAmount('1 440,00'), 1440);
  assert.equal(parseAmount('12.500,50'), 12500.5);
  assert.equal(parseAmount('980.00'), 980);
  assert.equal(parseAmount('2 300,00'), 2300);
});

test('devis type cuisine', () => {
  const text = `
MENUISERIE EXEMPLE
SIRET 123 456 789 00012 - Tél 01 23 45 67 89
DEVIS N° D-2026-0142
Date : 18/11/2026
Client :
M. et Mme Martin
12 rue des Lilas 69003 Lyon
Tél : 06 12 34 56 78
martin@example.com

Désignation Qté PU HT Total HT
Caissons mélaminé blanc 18 mm 12 85,00 € 1 020,00 €
Façades laquées mat 14 120,00 € 1 680,00 €
Plan de travail quartz 3 ml 1 2 400,00 € 2 400,00 €
Four encastrable 1 650,00 € 650,00 €
Main d'œuvre fabrication atelier 32 h 45,00 € 1 440,00 €
Pose et installation sur site 1 980,00 € 980,00 €
Total HT 8 170,00 €
TVA 20 % 1 634,00 €
Total TTC 9 804,00 €
`;
  const r = parseQuoteText(text, opts);
  assert.equal(r.quote_number, 'D-2026-0142');
  assert.equal(r.quote_date, '2026-11-18');
  assert.equal(r.client_name, 'M. et Mme Martin');
  assert.equal(r.client_phone, '0612345678');
  assert.equal(r.client_email, 'martin@example.com');
  assert.equal(r.total_ht, 8170);
  assert.equal(r.total_ttc, 9804);
  assert.equal(r.labor_amount, 1440);
  assert.equal(r.fab_hours, 32);
  assert.equal(r.fab_hours_from_quote, true);
  assert.equal(r.pose_amount, 980);
  assert.equal(r.pose_hours, 21.78); // 980 / 45, estimé
  assert.deepEqual(r.suggested_categories.map((c) => c.id).sort(), [1, 3, 5, 6]);
});

test('sans heures : estimation depuis le taux horaire', () => {
  const r = parseQuoteText("Main-d'oeuvre 900,00 €\nTotal HT 900,00 €", opts);
  assert.equal(r.labor_amount, 900);
  assert.equal(r.fab_hours, 20);
  assert.equal(r.fab_hours_from_quote, false);
});
