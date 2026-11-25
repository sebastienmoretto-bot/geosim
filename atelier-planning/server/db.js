const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'atelier',          -- admin | bureau | atelier | poseur
  workshop INTEGER NOT NULL DEFAULT 0,           -- compte dans la capacité atelier
  hours_per_day REAL NOT NULL DEFAULT 7,
  workdays TEXT NOT NULL DEFAULT '1,2,3,4,5',    -- 1 = lundi … 7 = dimanche
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT, email TEXT, address TEXT, notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY,
  client_id INTEGER REFERENCES clients(id),
  title TEXT NOT NULL,
  quote_number TEXT, quote_date TEXT, validated_at TEXT,
  total_ht REAL, labor_amount REAL, pose_amount REAL, hourly_rate REAL,
  fab_hours_estimated REAL, fab_hours REAL,       -- estimé par l'outil / ajusté par l'opérateur
  pose_hours_estimated REAL, pose_hours REAL,
  planning_mode TEXT NOT NULL DEFAULT 'asap',     -- asap | backward
  buffer_days INTEGER, fab_margin_days INTEGER,
  install_date TEXT, install_time TEXT, install_days INTEGER NOT NULL DEFAULT 1,
  fab_start TEXT, fab_end TEXT,
  status TEXT NOT NULL DEFAULT 'a_planifier',     -- a_planifier | planifie | en_fabrication | pret | pose | termine | annule
  install_confirmed TEXT NOT NULL DEFAULT 'en_attente', -- en_attente | confirme | a_decaler
  warnings TEXT,
  notes TEXT, quote_file TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS order_categories (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  lead_days INTEGER NOT NULL DEFAULT 7,
  needed_for TEXT NOT NULL DEFAULT 'fabrication', -- fabrication | pose
  keywords TEXT,
  supplier TEXT,
  sort INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS project_orders (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  category_id INTEGER REFERENCES order_categories(id),
  label TEXT NOT NULL,
  supplier TEXT,
  lead_days INTEGER NOT NULL,
  needed_for TEXT NOT NULL DEFAULT 'fabrication',
  order_by TEXT, expected_at TEXT,
  ordered_at TEXT, received_at TEXT,
  status TEXT NOT NULL DEFAULT 'a_commander',     -- a_commander | commande | recu
  notes TEXT
);
CREATE TABLE IF NOT EXISTS allocations (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  hours REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_alloc_day ON allocations(day);
CREATE TABLE IF NOT EXISTS closures (
  id INTEGER PRIMARY KEY,
  start_date TEXT NOT NULL, end_date TEXT NOT NULL,
  label TEXT,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE  -- NULL = tout l'atelier
);
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  due_date TEXT,
  done_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS objectives (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  metric TEXT NOT NULL DEFAULT 'manuel',          -- ca_signe | mo_signee | heures_planifiees | poses | manuel
  target REAL NOT NULL,
  period_start TEXT NOT NULL, period_end TEXT NOT NULL,
  manual_value REAL NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS notification_rules (
  id INTEGER PRIMARY KEY,
  label TEXT NOT NULL,
  offset_hours INTEGER NOT NULL,
  template_name TEXT NOT NULL,
  template_lang TEXT NOT NULL DEFAULT 'fr',
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  rule_id INTEGER REFERENCES notification_rules(id) ON DELETE SET NULL,
  install_ref TEXT NOT NULL,          -- date/heure de pose visée par ce message
  scheduled_at TEXT NOT NULL,
  sent_at TEXT,
  status TEXT NOT NULL DEFAULT 'planifie',  -- planifie | envoye | simule | livre | lu | erreur | annule
  wa_message_id TEXT,
  error TEXT,
  UNIQUE(project_id, rule_id, install_ref)
);
CREATE TABLE IF NOT EXISTS wa_inbound (
  id INTEGER PRIMARY KEY,
  from_phone TEXT, body TEXT, project_id INTEGER,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`;

const DEFAULT_SETTINGS = {
  company_name: 'Mon atelier',
  hourly_rate: '45',
  buffer_days: '2',           // marge (jours ouvrés) entre livraison et besoin
  fab_margin_days: '1',       // marge (jours ouvrés) entre fin de fabrication et pose
  install_time: '08:00',
  pose_hours_per_day: '8',    // pour estimer le nombre de jours de pose
  default_country_code: '33',
  labor_fab_keywords: "main d'oeuvre|main d'œuvre|main-d'oeuvre|main-d'œuvre|m.o.|fabrication|façonnage|usinage|atelier",
  labor_pose_keywords: 'pose|installation|montage sur site|montage|livraison et pose',
  wa_dry_run: '1',
  wa_api_version: 'v21.0',
  wa_send_window_start: '08:00',
  wa_send_window_end: '20:00',
  display_token: '',
};

const DEFAULT_CATEGORIES = [
  ['Panneaux / bois', 5, 'fabrication', 'panneau|caisson|mélaminé|melamine|contreplaqué|mdf|stratifié compact|bois massif|chêne|hêtre|noyer|placage'],
  ['Quincaillerie', 7, 'fabrication', 'quincaillerie|charnière|charniere|coulisse|poignée|poignee|blum|hettich|vérin|pied réglable'],
  ['Façades', 21, 'pose', 'façade|facade|porte de meuble|face de tiroir|laqué|laque'],
  ['Plan de travail stratifié', 10, 'pose', 'plan de travail stratifié|pdt stratifié|stratifié'],
  ['Plan de travail quartz / céramique', 28, 'pose', 'quartz|céramique|ceramique|granit|dekton|silestone|marbre|compact'],
  ['Électroménager', 14, 'pose', 'électroménager|electromenager|four|plaque|induction|hotte|lave-vaisselle|réfrigérateur|refrigerateur|congélateur|micro-ondes'],
  ['Évier / robinetterie', 7, 'pose', 'évier|evier|robinet|mitigeur|vidage'],
  ['Vitrerie / miroiterie', 14, 'pose', 'verre|vitre|vitrage|miroir|crédence verre'],
];

const DEFAULT_RULES = [
  ['Rappel J-7', 168, 'rappel_pose_j7'],
  ['Rappel 48 h', 48, 'rappel_pose_48h'],
  ['Rappel 24 h', 24, 'rappel_pose_24h'],
];

function open(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  seed(db);
  return db;
}

function seed(db) {
  const insSetting = db.prepare('INSERT OR IGNORE INTO settings(key, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) insSetting.run(k, v);
  if (!getSetting(db, 'display_token')) {
    setSetting(db, 'display_token', crypto.randomBytes(12).toString('hex'));
  }
  if (db.prepare('SELECT COUNT(*) n FROM order_categories').get().n === 0) {
    const ins = db.prepare('INSERT INTO order_categories(name, lead_days, needed_for, keywords, sort) VALUES (?,?,?,?,?)');
    DEFAULT_CATEGORIES.forEach((c, i) => ins.run(c[0], c[1], c[2], c[3], i));
  }
  if (db.prepare('SELECT COUNT(*) n FROM notification_rules').get().n === 0) {
    const ins = db.prepare('INSERT INTO notification_rules(label, offset_hours, template_name) VALUES (?,?,?)');
    DEFAULT_RULES.forEach((r) => ins.run(...r));
  }
}

function getSetting(db, key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setSetting(db, key, value) {
  db.prepare('INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, value == null ? '' : String(value));
}

function allSettings(db) {
  const out = {};
  for (const r of db.prepare('SELECT key, value FROM settings').all()) out[r.key] = r.value;
  return out;
}

// Petite aide pour les transactions
function tx(db, fn) {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

module.exports = { open, getSetting, setSetting, allSettings, tx, DEFAULT_SETTINGS };
