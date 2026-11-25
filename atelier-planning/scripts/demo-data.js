// Remplit une base de démonstration : npm run demo
// Compte créé : demo@atelier.local / demo1234 (administrateur)
const path = require('node:path');
const D = require('../server/dates');
const { open, setSetting } = require('../server/db');
const auth = require('../server/auth');
const P = require('../server/projects');
const scheduler = require('../server/scheduler');

const dataDir = path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));
const db = open(path.join(dataDir, 'atelier.db'));

if (db.prepare('SELECT COUNT(*) n FROM projects').get().n > 0) {
  console.log('La base contient déjà des projets : rien n’a été ajouté.');
  process.exit(0);
}

setSetting(db, 'company_name', 'Menuiserie Démo');
const addUser = (name, email, role, workshop, hpd) => {
  const u = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (u) return u.id;
  return Number(db.prepare('INSERT INTO users(name, email, password_hash, role, workshop, hours_per_day) VALUES (?,?,?,?,?,?)')
    .run(name, email, auth.hashPassword('demo1234'), role, workshop, hpd).lastInsertRowid);
};
addUser('Compte démo', 'demo@atelier.local', 'admin', 1, 7);
const lucas = addUser('Lucas (atelier)', 'lucas@atelier.local', 'atelier', 1, 7);
addUser('Inès (pose)', 'ines@atelier.local', 'poseur', 0, 7);

const t = D.today();
// Jour ouvré (lun.-ven., hors férié) à partir de t + n
const wk = (n) => { let d = D.addDays(t, n); while (D.weekday(d) > 5 || D.holidayName(d)) d = D.addDays(d, 1); return d; };
db.prepare('INSERT INTO closures(start_date, end_date, label, user_id) VALUES (?,?,?,?)').run(D.addDays(t, 16), D.addDays(t, 18), 'Congés', lucas);

const cat = Object.fromEntries(db.prepare('SELECT id, name FROM order_categories').all().map((c) => [c.name, c.id]));
const projects = [
  {
    client: { name: 'M. et Mme Martin', phone: '06 12 34 56 78', email: 'martin@example.com', address: '12 rue des Lilas, Lyon' },
    title: 'Cuisine Martin', quote_number: 'D-2026-0142', total_ht: 9830, labor_amount: 1440, pose_amount: 980, hourly_rate: 45,
    fab_hours_estimated: 32, fab_hours: 32, pose_hours: 16, install_days: 2, planning_mode: 'asap',
    orders: ['Panneaux / bois', 'Quincaillerie', 'Façades', 'Plan de travail quartz / céramique', 'Électroménager', 'Évier / robinetterie'],
  },
  {
    client: { name: 'Mme Leroy', phone: '07 98 76 54 32', address: '3 place du Marché, Villeurbanne' },
    title: 'Dressing Leroy', quote_number: 'D-2026-0139', total_ht: 4200, labor_amount: 1260, pose_amount: 450, hourly_rate: 45,
    fab_hours_estimated: 28, fab_hours: 24, pose_hours: 8, install_days: 1, planning_mode: 'backward', install_date: wk(12),
    orders: ['Panneaux / bois', 'Quincaillerie', 'Vitrerie / miroiterie'],
  },
  {
    client: { name: 'Cabinet Dubois avocats', phone: '04 72 11 22 33', address: '45 cours Lafayette, Lyon' },
    title: 'Agencement accueil Dubois', quote_number: 'D-2026-0131', total_ht: 15600, labor_amount: 3600, pose_amount: 1800, hourly_rate: 45,
    fab_hours_estimated: 80, fab_hours: 80, pose_hours: 40, install_days: 3, planning_mode: 'backward', install_date: wk(30),
    orders: ['Panneaux / bois', 'Quincaillerie', 'Plan de travail stratifié'],
  },
  {
    client: { name: 'M. Bernard', phone: '06 55 44 33 22' },
    title: 'Bibliothèque Bernard', quote_number: 'D-2026-0120', total_ht: 3100, labor_amount: 990, pose_amount: 270, hourly_rate: 45,
    fab_hours_estimated: 22, fab_hours: 22, pose_hours: 6, install_days: 1, planning_mode: 'backward', install_date: wk(5),
    orders: ['Panneaux / bois'],
  },
];
for (const p of projects) {
  const id = P.createProject(db, {
    ...p, validated_at: D.addDays(t, -10),
    orders: p.orders.map((n) => ({ category_id: cat[n] })),
  });
  if (p.title === 'Bibliothèque Bernard') {
    // Bois déjà reçu, fabrication démarrée
    db.prepare(`UPDATE project_orders SET status = 'recu', ordered_at = ?, received_at = ? WHERE project_id = ?`).run(D.addDays(t, -9), D.addDays(t, -3), id);
    db.prepare(`UPDATE projects SET status = 'en_fabrication', install_confirmed = 'confirme' WHERE id = ?`).run(id);
    P.replan(db, id);
  }
  if (p.title === 'Dressing Leroy') {
    const o = db.prepare('SELECT id, lead_days FROM project_orders WHERE project_id = ? AND label = ?').get(id, 'Panneaux / bois');
    db.prepare(`UPDATE project_orders SET status = 'commande', ordered_at = ?, expected_at = ? WHERE id = ?`).run(D.addDays(t, -3), D.addDays(t, 2), o.id);
    P.replan(db, id);
  }
}
const firstId = db.prepare('SELECT id FROM projects ORDER BY id LIMIT 1').get().id;
db.prepare('INSERT INTO tasks(project_id, title, due_date) VALUES (?,?,?)').run(firstId, 'Relever les cotes définitives chez le client', D.addDays(t, 1));
db.prepare('INSERT INTO tasks(title, due_date) VALUES (?,?)').run('Commander les consommables (colle, vis, chants)', t);
const mStart = `${t.slice(0, 7)}-01`;
const mEnd = D.addDays(`${D.addDays(mStart, 32).slice(0, 7)}-01`, -1);
db.prepare('INSERT INTO objectives(title, metric, target, period_start, period_end) VALUES (?,?,?,?,?)').run('CA signé du mois', 'ca_signe', 40000, D.addDays(t, -20), D.addDays(t, 10));
db.prepare('INSERT INTO objectives(title, metric, target, period_start, period_end) VALUES (?,?,?,?,?)').run('Poses du mois', 'poses', 6, mStart, mEnd);
scheduler.syncNotifications(db);
console.log('Données de démonstration créées. Connexion : demo@atelier.local / demo1234');
