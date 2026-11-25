// Planificateur des rappels WhatsApp de rendez-vous de pose.
// Toutes les minutes : (1) synchronise les messages prévus avec les dates de pose,
// (2) envoie ceux dont l'heure est arrivée.
const D = require('./dates');
const { getSetting } = require('./db');
const wa = require('./whatsapp');

const ACTIVE_STATUSES = "('planifie','en_fabrication','pret')";

// Avance l'heure d'envoi dans la plage autorisée (on préfère prévenir un peu plus tôt que réveiller le client).
function fitWindow(dt, start = '08:00', end = '20:00') {
  const d = new Date(dt);
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const mins = d.getHours() * 60 + d.getMinutes();
  if (mins > eh * 60 + em) d.setHours(eh, em, 0, 0);
  else if (mins < sh * 60 + sm) { d.setDate(d.getDate() - 1); d.setHours(eh, em, 0, 0); }
  return d;
}

function syncNotifications(db) {
  const rules = db.prepare('SELECT * FROM notification_rules WHERE active = 1').all();
  const start = getSetting(db, 'wa_send_window_start') || '08:00';
  const end = getSetting(db, 'wa_send_window_end') || '20:00';
  const defTime = getSetting(db, 'install_time') || '08:00';
  const projects = db.prepare(`SELECT id, install_date, install_time FROM projects
    WHERE install_date IS NOT NULL AND install_date >= ? AND status IN ${ACTIVE_STATUSES}`).all(D.today());

  const ins = db.prepare(`INSERT OR IGNORE INTO notifications(project_id, rule_id, install_ref, scheduled_at, status, error) VALUES (?,?,?,?,?,?)`);
  const lateLimit = D.toLocalDateTime(new Date(Date.now() - 3600000));
  const upd = db.prepare(`UPDATE notifications SET scheduled_at = ? WHERE project_id = ? AND rule_id = ? AND install_ref = ? AND status = 'planifie'`);
  const cancelOld = db.prepare(`UPDATE notifications SET status = 'annule', error = 'Date de pose modifiée'
    WHERE project_id = ? AND install_ref != ? AND status = 'planifie'`);
  const activeIds = new Set();

  for (const p of projects) {
    activeIds.add(p.id);
    const ref = `${p.install_date}T${p.install_time || defTime}`;
    cancelOld.run(p.id, ref);
    const installAt = D.parseLocalDateTime(ref);
    for (const r of rules) {
      const at = fitWindow(new Date(installAt.getTime() - r.offset_hours * 3600000), start, end);
      const s = D.toLocalDateTime(at);
      // Échéance déjà dépassée au moment où la pose est planifiée : on ne l'envoie pas en retard.
      if (s < lateLimit) ins.run(p.id, r.id, ref, s, 'annule', 'Échéance déjà passée lors de la planification');
      else ins.run(p.id, r.id, ref, s, 'planifie', null);
      upd.run(s, p.id, r.id, ref);
    }
  }
  // Règles désactivées / projets annulés : on annule ce qui n'est pas parti
  db.exec(`UPDATE notifications SET status = 'annule', error = 'Règle désactivée'
    WHERE status = 'planifie' AND rule_id IN (SELECT id FROM notification_rules WHERE active = 0)`);
  for (const n of db.prepare(`SELECT DISTINCT project_id FROM notifications WHERE status = 'planifie'`).all()) {
    if (!activeIds.has(n.project_id)) {
      db.prepare(`UPDATE notifications SET status = 'annule', error = 'Projet non actif ou pose passée' WHERE project_id = ? AND status = 'planifie'`).run(n.project_id);
    }
  }
}

async function sendNotification(db, notifId) {
  const n = db.prepare(`SELECT n.*, r.template_name, r.template_lang, p.install_date, p.install_time, c.name client_name, c.phone
    FROM notifications n
    JOIN projects p ON p.id = n.project_id
    LEFT JOIN clients c ON c.id = p.client_id
    LEFT JOIN notification_rules r ON r.id = n.rule_id
    WHERE n.id = ?`).get(notifId);
  if (!n) throw new Error('Notification introuvable');
  const to = wa.normalizePhone(n.phone, getSetting(db, 'default_country_code') || '33');
  const setStatus = db.prepare('UPDATE notifications SET status = ?, sent_at = ?, wa_message_id = ?, error = ? WHERE id = ?');
  if (!to) {
    setStatus.run('erreur', null, null, 'Pas de numéro de téléphone client valide', n.id);
    return { ok: false, error: 'Pas de numéro de téléphone client valide' };
  }
  const [date, time] = n.install_ref.split('T');
  const params = wa.templateParams({
    clientName: n.client_name, installDate: date, installTime: time,
    companyName: getSetting(db, 'company_name'),
  });
  try {
    const r = await wa.sendTemplate(db, { to, templateName: n.template_name || 'rappel_pose', lang: n.template_lang || 'fr', params });
    setStatus.run(r.simulated ? 'simule' : 'envoye', D.nowLocal(), r.id, null, n.id);
    return { ok: true, simulated: r.simulated, preview: wa.previewText(params) };
  } catch (e) {
    setStatus.run('erreur', D.nowLocal(), null, e.message, n.id);
    return { ok: false, error: e.message };
  }
}

let running = false;
async function tick(db) {
  if (running) return;
  running = true;
  try {
    syncNotifications(db);
    const now = D.nowLocal();
    const due = db.prepare(`SELECT id FROM notifications WHERE status = 'planifie' AND scheduled_at <= ? AND install_ref > ?`).all(now, now);
    for (const n of due) await sendNotification(db, n.id);
  } catch (e) {
    console.error('[rappels]', e);
  } finally {
    running = false;
  }
}

function start(db, intervalMs = 60000) {
  tick(db);
  return setInterval(() => tick(db), intervalMs);
}

module.exports = { start, tick, syncNotifications, sendNotification, fitWindow };
