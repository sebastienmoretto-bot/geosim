const path = require('node:path');
const { open } = require('./db');
const { createApp } = require('./app');
const scheduler = require('./scheduler');

const dataDir = path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';

const db = open(path.join(dataDir, 'atelier.db'));
const app = createApp(db, { dataDir });

app.listen(port, host, () => {
  console.log(`Atelier Planning démarré sur http://localhost:${port}`);
  console.log(`Données : ${dataDir}`);
  if (!process.env.TZ) console.log('Astuce : définissez TZ=Europe/Paris pour que les rappels partent à la bonne heure.');
});

if (process.env.DISABLE_SCHEDULER !== '1') scheduler.start(db);

function shutdown() {
  try { db.close(); } catch { /* déjà fermée */ }
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
