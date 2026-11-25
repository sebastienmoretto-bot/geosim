const D = require('./dates');
const { getSetting, tx } = require('./db');
const { loadCalendar } = require('./calendar');
const { planProject } = require('./planning');

function num(v, def = null) {
  if (v === '' || v == null) return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

function getProject(db, id) {
  const p = db.prepare(`SELECT p.*, c.name client_name, c.phone client_phone, c.email client_email, c.address client_address
    FROM projects p LEFT JOIN clients c ON c.id = p.client_id WHERE p.id = ?`).get(id);
  if (!p) return null;
  p.warnings = p.warnings ? JSON.parse(p.warnings) : [];
  p.orders = db.prepare('SELECT * FROM project_orders WHERE project_id = ? ORDER BY needed_for DESC, order_by, id').all(id);
  p.allocations = db.prepare('SELECT day, hours FROM allocations WHERE project_id = ? ORDER BY day').all(id);
  p.notifications = db.prepare(`SELECT n.*, r.label rule_label FROM notifications n LEFT JOIN notification_rules r ON r.id = n.rule_id
    WHERE n.project_id = ? ORDER BY n.scheduled_at DESC`).all(id);
  p.tasks = db.prepare('SELECT * FROM tasks WHERE project_id = ? ORDER BY done_at IS NOT NULL, due_date').all(id);
  return p;
}

/**
 * Recalcule le planning d'un projet.
 * preview = true : ne sauvegarde rien, renvoie le résultat (pour l'aperçu dans le formulaire).
 * overrides : valeurs du formulaire non encore enregistrées (mode, date de pose, heures…).
 */
function replan(db, id, { preview = false, overrides = {} } = {}) {
  const p = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  if (!p) throw Object.assign(new Error('Projet introuvable'), { status: 404 });
  const today = D.today();
  const v = { ...p, ...overrides };
  const orders = overrides.orders || db.prepare('SELECT * FROM project_orders WHERE project_id = ?').all(id);

  // On garde les heures déjà réalisées (jours passés) et on ne planifie que le reste.
  const past = db.prepare('SELECT day, hours FROM allocations WHERE project_id = ? AND day < ? ORDER BY day').all(id, today);
  const pastHours = past.reduce((s, a) => s + a.hours, 0);
  const totalHours = num(v.fab_hours, 0);
  const remaining = Math.max(0, totalHours - pastHours);

  const cal = loadCalendar(db, { excludeProjectId: id });
  const result = planProject({
    mode: v.planning_mode === 'backward' ? 'backward' : 'asap',
    today,
    startDate: v.validated_at || null,
    installDate: v.install_date || null,
    fabHours: remaining,
    installDays: num(v.install_days, 1),
    bufferDays: num(v.buffer_days, num(getSetting(db, 'buffer_days'), 2)),
    fabMarginDays: num(v.fab_margin_days, num(getSetting(db, 'fab_margin_days'), 1)),
    orders,
    isWorkday: cal.isWorkday,
    capacity: cal.capacity,
  });
  result.allocations = [...past, ...result.allocations];
  if (past.length) result.fabStart = past[0].day;
  if (!result.fabEnd && past.length) result.fabEnd = past[past.length - 1].day;
  result.noStaff = cal.noStaff;
  if (cal.noStaff) result.warnings.unshift({ level: 'info', text: "Aucune personne n'est déclarée « atelier » dans Réglages › Équipe : capacité par défaut de 7 h/jour, du lundi au vendredi." });

  if (preview) return result;

  tx(db, () => {
    db.prepare('DELETE FROM allocations WHERE project_id = ? AND day >= ?').run(id, today);
    const ins = db.prepare('INSERT INTO allocations(project_id, day, hours) VALUES (?,?,?)');
    for (const a of result.allocations) if (a.day >= today) ins.run(id, a.day, a.hours);
    const updOrder = db.prepare('UPDATE project_orders SET order_by = ?, expected_at = ? WHERE id = ?');
    for (const o of result.orders) if (o.id) updOrder.run(o.order_by || null, o.expected_at || null, o.id);
    const status = p.status === 'a_planifier' ? 'planifie' : p.status;
    db.prepare(`UPDATE projects SET fab_start = ?, fab_end = ?, install_date = ?, warnings = ?, status = ?,
      updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(result.fabStart, result.fabEnd, result.installDate, JSON.stringify(result.warnings), status, id);
  });
  return result;
}

const PROJECT_FIELDS = ['title', 'quote_number', 'quote_date', 'validated_at', 'total_ht', 'labor_amount', 'pose_amount',
  'hourly_rate', 'fab_hours_estimated', 'fab_hours', 'pose_hours_estimated', 'pose_hours', 'planning_mode', 'buffer_days',
  'fab_margin_days', 'install_date', 'install_time', 'install_days', 'status', 'install_confirmed', 'notes', 'quote_file', 'client_id'];
const NUMERIC = new Set(['total_ht', 'labor_amount', 'pose_amount', 'hourly_rate', 'fab_hours_estimated', 'fab_hours',
  'pose_hours_estimated', 'pose_hours', 'buffer_days', 'fab_margin_days', 'install_days', 'client_id']);

function pickProject(body) {
  const out = {};
  for (const k of PROJECT_FIELDS) {
    if (!(k in body)) continue;
    let v = body[k];
    if (NUMERIC.has(k)) v = num(v);
    else if (v === '') v = null;
    out[k] = v;
  }
  if (out.install_days != null) out.install_days = Math.max(1, Math.round(out.install_days));
  return out;
}

function upsertClient(db, c) {
  if (!c) return null;
  if (c.id) {
    db.prepare('UPDATE clients SET name = COALESCE(?, name), phone = ?, email = ?, address = ? WHERE id = ?')
      .run(c.name || null, c.phone || null, c.email || null, c.address || null, c.id);
    return Number(c.id);
  }
  if (!c.name) return null;
  return Number(db.prepare('INSERT INTO clients(name, phone, email, address) VALUES (?,?,?,?)')
    .run(c.name, c.phone || null, c.email || null, c.address || null).lastInsertRowid);
}

function createProject(db, body) {
  const id = tx(db, () => {
    const data = pickProject(body);
    data.client_id = upsertClient(db, body.client) ?? data.client_id ?? null;
    if (!data.title) data.title = body.client?.name ? `Projet ${body.client.name}` : 'Nouveau projet';
    if (!data.validated_at) data.validated_at = D.today();
    if (!data.install_time) data.install_time = getSetting(db, 'install_time') || '08:00';
    const keys = Object.keys(data);
    const r = db.prepare(`INSERT INTO projects(${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`)
      .run(...keys.map((k) => data[k]));
    const pid = Number(r.lastInsertRowid);
    insertOrders(db, pid, body.orders || []);
    return pid;
  });
  const p = db.prepare('SELECT planning_mode, install_date FROM projects WHERE id = ?').get(id);
  if (p.planning_mode === 'asap' || p.install_date) replan(db, id);
  return id;
}

function insertOrders(db, projectId, orders) {
  const catQ = db.prepare('SELECT * FROM order_categories WHERE id = ?');
  const ins = db.prepare(`INSERT INTO project_orders(project_id, category_id, label, supplier, lead_days, needed_for, notes)
    VALUES (?,?,?,?,?,?,?)`);
  for (const o of orders) {
    const cat = o.category_id ? catQ.get(o.category_id) : null;
    ins.run(projectId, cat?.id ?? null, o.label || cat?.name || 'Commande', o.supplier ?? cat?.supplier ?? null,
      num(o.lead_days, cat?.lead_days ?? 7), o.needed_for || cat?.needed_for || 'fabrication', o.notes || null);
  }
}

function updateProject(db, id, body) {
  const data = pickProject(body);
  if (body.client) data.client_id = upsertClient(db, body.client) ?? data.client_id;
  const keys = Object.keys(data);
  if (keys.length) {
    db.prepare(`UPDATE projects SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(...keys.map((k) => data[k]), id);
  }
  if (data.status === 'annule') db.prepare('DELETE FROM allocations WHERE project_id = ? AND day >= ?').run(id, D.today());
  // Un changement qui touche au planning déclenche un recalcul
  const planningKeys = ['planning_mode', 'install_date', 'fab_hours', 'install_days', 'buffer_days', 'fab_margin_days', 'validated_at'];
  if (body.replan !== false && planningKeys.some((k) => k in data) && data.status !== 'annule') {
    const p = db.prepare('SELECT planning_mode, install_date, status FROM projects WHERE id = ?').get(id);
    if (!['termine', 'annule'].includes(p.status) && (p.planning_mode === 'asap' || p.install_date)) replan(db, id);
  }
}

module.exports = { getProject, replan, createProject, updateProject, insertOrders, num };
