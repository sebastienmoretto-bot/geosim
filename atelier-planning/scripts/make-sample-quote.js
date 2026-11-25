// Génère un devis PDF fictif pour tester l'import : node scripts/make-sample-quote.js [sortie.pdf]
const fs = require('node:fs');
const path = require('node:path');
const PDFDocument = require('pdfkit');

const out = process.argv[2] || path.join(__dirname, '..', 'exemples', 'devis-exemple.pdf');
fs.mkdirSync(path.dirname(out), { recursive: true });
const doc = new PDFDocument({ size: 'A4', margin: 50 });
doc.pipe(fs.createWriteStream(out));

doc.fontSize(16).text('MENUISERIE EXEMPLE', { continued: false });
doc.fontSize(9).text('12 avenue du Bois - 69000 Lyon - SIRET 123 456 789 00012 - Tél 04 78 00 00 00');
doc.moveDown();
doc.fontSize(14).text('DEVIS N° D-2026-0142');
doc.fontSize(10).text('Date : 18/11/2026');
doc.moveDown();
doc.text('Client :');
doc.text('M. et Mme Martin');
doc.text('12 rue des Lilas 69003 Lyon');
doc.text('Tél : 06 12 34 56 78');
doc.text('martin@example.com');
doc.moveDown();
doc.fontSize(11).text('Objet : cuisine sur mesure');
doc.moveDown(0.5);

const lines = [
  ['Désignation', 'Qté', 'PU HT', 'Total HT'],
  ['Caissons mélaminé blanc 18 mm', '12', '85,00 €', '1 020,00 €'],
  ['Quincaillerie Blum (charnières, coulisses)', '1', '640,00 €', '640,00 €'],
  ['Façades laquées mat', '14', '120,00 €', '1 680,00 €'],
  ['Plan de travail quartz 3 ml', '1', '2 400,00 €', '2 400,00 €'],
  ['Four encastrable + plaque induction', '1', '1 250,00 €', '1 250,00 €'],
  ['Évier inox + mitigeur', '1', '420,00 €', '420,00 €'],
  ["Main d'œuvre fabrication atelier 32 h", '32', '45,00 €', '1 440,00 €'],
  ['Pose et installation sur site', '1', '980,00 €', '980,00 €'],
];
doc.fontSize(10);
for (const l of lines) {
  doc.text(l.join('    '));
}
doc.moveDown();
doc.text('Total HT 9 830,00 €');
doc.text('TVA 20 % 1 966,00 €');
doc.text('Total TTC 11 796,00 €');
doc.moveDown();
doc.fontSize(9).text('Bon pour accord - devis valable 3 mois.');
doc.end();
console.log(`Devis exemple écrit dans ${out}`);
