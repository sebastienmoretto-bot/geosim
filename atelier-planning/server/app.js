const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const express = require('express');
const multer = require('multer');

const D = require('./dates');
const { getSetting, setSetting, allSettings, DEFAULT_SETTINGS } = require('./db');
const auth = require('./auth');
const { parseQuotePdf } = require('./quoteParser');
const { loadCalendar } = require('./calendar');
const P = require('./projects');
const wa = require('./whatsapp');
const scheduler = require('./scheduler');

function createApp(db, { dataDir }) {
  const app = express();
  const quotesDir = path.join(dataDir, 'devis');
  fs.mkdirSync(quotesDir, { recursive: true });
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => cb(null, /pdf$/i.test(file.mimetype) || /\.pdf$/i.test(file.originalname)),
  });

  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');
  // Le webhook WhatsApp a besoin du corps brut pour vérifier la signature
  app.use('/webhook/whatsapp', express.raw({ type: '*/*', limit: '1mb' }));
  app.use(express.json({ limit: '2mb' }));
  app.use(auth.middleware(db));
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    next();
  });

  const bureau = auth.requireRole('bureau');
  const admin = auth.requireRole('admin');
  const logged = auth.requireRole('atelier');
  const wrap = (fn) => (req, res, next) => {
    try {
      const r = fn(req, res);
      if (r && typeof r.then === 'function') r.catch(next);
    } catch (e) { next(e); }
  };
  const id = (req) => Number(req.params.id);

  // ---------- Authentification ----------
  const userCount = () => db.prepare('SELECT COUNT(*) n FROM users').get().n;

  app.get('/api/me', (req, res) => {
    res.json({ user: req.user, setupNeeded: userCount() === 0, company: getSetting(db, 'company_name') });
  });

  app.post('/api/setup', wrap((req, res) => {
    if (userCount() > 0) return res.status(409).json({ error: 'Le compte administrateur existe déjà' });
    const { name, email, password } = req.body || {};
    if (!name || !email || !password || password.length < 8) {
      return res.status(400).json({ error: 'Nom, e-mail et mot de passe (8 caractères minimum) sont requis' });
    }
    const r = db.prepare(`INSERT INTO users(name, email, password_hash, role, workshop) VALUES (?,?,?,'admin',1)`)
      .run(name, email, auth.hashPassword(password));
    if (req.body.company_name) setSetting(db, 'company_name', req.body.company_name);
    const token = auth.createSession(db, Number(r.lastInsertRowid));
    res.setHeader('Set-Cookie', auth.sessionCookie(token, req));
    res.json({ ok: true });
  }));

  const loginAttempts = new Map();
  app.post('/api/login', wrap((req, res) => {
    const ip = req.ip;
    const a = loginAttempts.get(ip) || { n: 0, until: 0 };
    if (a.until > Date.now()) return res.status(429).json({ error: 'Trop de tentatives. Réessayez dans une minute.' });
    const { email, password } = req.body || {};
    const u = db.prepare('SELECT * FROM users WHERE email = ? AND active = 1').get(String(email || ''));
    if (!u || !auth.verifyPassword(String(password || ''), u.password_hash)) {
      a.n += 1;
      if (a.n >= 5) { a.until = Date.now() + 60000; a.n = 0; }
      loginAttempts.set(ip, a);
      return res.status(401).json({ error: 'E-mail ou mot de passe incorrect' });
    }
    loginAttempts.delete(ip);
    const token = auth.createSession(db, u.id);
    res.setHeader('Set-Cookie', auth.sessionCookie(token, req));
    res.json({ ok: true });
  }));

  app.post('/api/logout', (req, res) => {
    if (req.sessionToken) db.prepare('DELETE FROM sessions WHERE token = ?').run(req.sessionToken);
    res.setHeader('Set-Cookie', auth.clearCookie());
    res.json({ ok: true });
  });

  app.put('/api/me/password', logged, wrap((req, res) => {
    const { current, password } = req.body || {};
    const u = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
    if (!auth.verifyPassword(String(current || ''), u.password_hash)) return res.status(400).json({ error: 'Mot de passe actuel incorrect' });
    if (!password || password.length < 8) return res.status(400).json({ error: 'Le nouveau mot de passe doit faire 8 caractères minimum' });
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(auth.hashPassword(password), req.user.id);
    res.json({ ok: true });
  }));

  // ---------- Réglages ----------
  app.get('/api/settings', bureau, (_req, res) => {
    const s = allSettings(db);
    const cfg = wa.config(db);
    res.json({
      settings: s,
      whatsapp: { configured: cfg.configured, dryRun: cfg.dryRun, webhookVerifyConfigured: Boolean(cfg.verifyToken), signatureCheck: Boolean(cfg.appSecret) },
    });
  });

  app.put('/api/settings', admin, wrap((req, res) => {
    for (const [k, v] of Object.entries(req.body || {})) {
      if (k in DEFAULT_SETTINGS && k !== 'display_token') setSetting(db, k, v);
    }
    res.json({ ok: true });
  }));

  app.post('/api/settings/display-token', admin, (_req, res) => {
    const t = crypto.randomBytes(12).toString('hex');
    setSetting(db, 'display_token', t);
    res.json({ display_token: t });
  });

  // Postes de commande
  app.get('/api/categories', logged, (_req, res) => {
    res.json(db.prepare('SELECT * FROM order_categories ORDER BY sort, name').all());
  });
  app.post('/api/categories', admin, wrap((req, res) => {
    const b = req.body || {};
    if (!b.name) return res.status(400).json({ error: 'Nom requis' });
    const sort = db.prepare('SELECT COALESCE(MAX(sort), 0) + 1 s FROM order_categories').get().s;
    const r = db.prepare('INSERT INTO order_categories(name, lead_days, needed_for, keywords, supplier, sort) VALUES (?,?,?,?,?,?)')
      .run(b.name, P.num(b.lead_days, 7), b.needed_for === 'pose' ? 'pose' : 'fabrication', b.keywords || '', b.supplier || null, sort);
    res.json({ id: Number(r.lastInsertRowid) });
  }));
  app.put('/api/categories/:id', admin, wrap((req, res) => {
    const b = req.body || {};
    db.prepare(`UPDATE order_categories SET name = ?, lead_days = ?, needed_for = ?, keywords = ?, supplier = ?, active = ? WHERE id = ?`)
      .run(b.name, P.num(b.lead_days, 7), b.needed_for === 'pose' ? 'pose' : 'fabrication', b.keywords || '', b.supplier || null, b.active === false || b.active === 0 ? 0 : 1, id(req));
    res.json({ ok: true });
  }));
  app.delete('/api/categories/:id', admin, (req, res) => {
    db.prepare('UPDATE project_orders SET category_id = NULL WHERE category_id = ?').run(id(req));
    db.prepare('DELETE FROM order_categories WHERE id = ?').run(id(req));
    res.json({ ok: true });
  });

  // Équipe
  const USER_COLS = 'id, name, email, role, workshop, hours_per_day, workdays, active';
  app.get('/api/users', bureau, (_req, res) => res.json(db.prepare(`SELECT ${USER_COLS} FROM users ORDER BY name`).all()));
  app.post('/api/users', admin, wrap((req, res) => {
    const b = req.body || {};
    if (!b.name || !b.email || !b.password || b.password.length < 8) {
      return res.status(400).json({ error: 'Nom, e-mail et mot de passe (8 caractères minimum) sont requis' });
    }
    const role = ['admin', 'bureau', 'atelier', 'poseur'].includes(b.role) ? b.role : 'atelier';
    try {
      const r = db.prepare('INSERT INTO users(name, email, password_hash, role, workshop, hours_per_day, workdays) VALUES (?,?,?,?,?,?,?)')
        .run(b.name, b.email, auth.hashPassword(b.password), role, b.workshop ? 1 : 0, P.num(b.hours_per_day, 7), b.workdays || '1,2,3,4,5');
      res.json({ id: Number(r.lastInsertRowid) });
    } catch (e) {
      if (/UNIQUE/.test(e.message)) return res.status(409).json({ error: 'Cet e-mail est déjà utilisé' });
      throw e;
    }
  }));
  app.put('/api/users/:id', admin, wrap((req, res) => {
    const b = req.body || {};
    const role = ['admin', 'bureau', 'atelier', 'poseur'].includes(b.role) ? b.role : 'atelier';
    if (id(req) === req.user.id && role !== 'admin') return res.status(400).json({ error: 'Vous ne pouvez pas retirer vos propres droits administrateur' });
    db.prepare('UPDATE users SET name = ?, email = ?, role = ?, workshop = ?, hours_per_day = ?, workdays = ?, active = ? WHERE id = ?')
      .run(b.name, b.email, role, b.workshop ? 1 : 0, P.num(b.hours_per_day, 7), b.workdays || '1,2,3,4,5', b.active === false || b.active === 0 ? 0 : 1, id(req));
    if (b.password) {
      if (b.password.length < 8) return res.status(400).json({ error: 'Mot de passe : 8 caractères minimum' });
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(auth.hashPassword(b.password), id(req));
    }
    res.json({ ok: true });
  }));
  app.delete('/api/users/:id', admin, (req, res) => {
    if (id(req) === req.user.id) return res.status(400).json({ error: 'Vous ne pouvez pas supprimer votre propre compte' });
    db.prepare('DELETE FROM users WHERE id = ?').run(id(req));
    res.json({ ok: true });
  });

  // Fermetures / congés
  app.get('/api/closures', logged, (_req, res) => {
    res.json(db.prepare('SELECT c.*, u.name user_name FROM closures c LEFT JOIN users u ON u.id = c.user_id ORDER BY start_date DESC').all());
  });
  app.post('/api/closures', bureau, wrap((req, res) => {
    const b = req.body || {};
    if (!b.start_date || !b.end_date || b.end_date < b.start_date) return res.status(400).json({ error: 'Dates de début et de fin invalides' });
    const r = db.prepare('INSERT INTO closures(start_date, end_date, label, user_id) VALUES (?,?,?,?)')
      .run(b.start_date, b.end_date, b.label || null, b.user_id ? Number(b.user_id) : null);
    res.json({ id: Number(r.lastInsertRowid) });
  }));
  app.delete('/api/closures/:id', bureau, (req, res) => {
    db.prepare('DELETE FROM closures WHERE id = ?').run(id(req));
    res.json({ ok: true });
  });

  // Règles de rappel WhatsApp
  app.get('/api/rules', bureau, (_req, res) => res.json(db.prepare('SELECT * FROM notification_rules ORDER BY offset_hours DESC').all()));
  app.post('/api/rules', admin, wrap((req, res) => {
    const b = req.body || {};
    const h = P.num(b.offset_hours);
    if (!b.label || !h || h <= 0 || !b.template_name) return res.status(400).json({ error: 'Libellé, délai (heures) et nom du modèle requis' });
    const r = db.prepare('INSERT INTO notification_rules(label, offset_hours, template_name, template_lang) VALUES (?,?,?,?)')
      .run(b.label, Math.round(h), b.template_name, b.template_lang || 'fr');
    res.json({ id: Number(r.lastInsertRowid) });
  }));
  app.put('/api/rules/:id', admin, wrap((req, res) => {
    const b = req.body || {};
    db.prepare('UPDATE notification_rules SET label = ?, offset_hours = ?, template_name = ?, template_lang = ?, active = ? WHERE id = ?')
      .run(b.label, Math.round(P.num(b.offset_hours, 24)), b.template_name, b.template_lang || 'fr', b.active === false || b.active === 0 ? 0 : 1, id(req));
    db.prepare(`DELETE FROM notifications WHERE rule_id = ? AND status = 'planifie'`).run(id(req));
    scheduler.syncNotifications(db);
    res.json({ ok: true });
  }));
  app.delete('/api/rules/:id', admin, (req, res) => {
    db.prepare(`DELETE FROM notifications WHERE rule_id = ? AND status = 'planifie'`).run(id(req));
    db.prepare('DELETE FROM notification_rules WHERE id = ?').run(id(req));
    res.json({ ok: true });
  });

  // ---------- Devis ----------
  app.post('/api/quotes/parse', bureau, upload.single('file'), wrap(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Déposez un fichier PDF' });
    const categories = db.prepare('SELECT id, name, keywords FROM order_categories WHERE active = 1').all();
    let parsed;
    try {
      parsed = await parseQuotePdf(req.file.buffer, {
        fabKeywords: getSetting(db, 'labor_fab_keywords'),
        poseKeywords: getSetting(db, 'labor_pose_keywords'),
        hourlyRate: getSetting(db, 'hourly_rate'),
        categories,
      });
    } catch (e) {
      return res.status(422).json({ error: "Impossible de lire ce PDF. S'il s'agit d'un scan (image), saisissez les valeurs à la main." });
    }
    const name = `${D.today()}-${crypto.randomBytes(6).toString('hex')}.pdf`;
    fs.writeFileSync(path.join(quotesDir, name), req.file.buffer);
    const existing = parsed.client_phone || parsed.client_email
      ? db.prepare('SELECT * FROM clients WHERE (phone IS NOT NULL AND phone = ?) OR (email IS NOT NULL AND email = ?) LIMIT 1')
        .get(parsed.client_phone || '', parsed.client_email || '')
      : null;
    res.json({ ...parsed, quote_file: name, original_name: req.file.originalname, existing_client: existing || null,
      text_empty: !String(parsed.raw_text || '').trim() });
  }));

  app.get('/api/quotes/:file', logged, (req, res) => {
    const f = path.basename(req.params.file);
    const full = path.join(quotesDir, f);
    if (!/^[\w-]+\.pdf$/.test(f) || !fs.existsSync(full)) return res.status(404).json({ error: 'Fichier introuvable' });
    res.sendFile(full);
  });

  // ---------- Clients ----------
  app.get('/api/clients', logged, (req, res) => {
    const q = `%${req.query.q || ''}%`;
    res.json(db.prepare('SELECT * FROM clients WHERE name LIKE ? OR phone LIKE ? OR email LIKE ? ORDER BY name LIMIT 50').all(q, q, q));
  });
  app.put('/api/clients/:id', bureau, wrap((req, res) => {
    const b = req.body || {};
    db.prepare('UPDATE clients SET name = ?, phone = ?, email = ?, address = ?, notes = ? WHERE id = ?')
      .run(b.name, b.phone || null, b.email || null, b.address || null, b.notes || null, id(req));
    res.json({ ok: true });
  }));

  // ---------- Projets ----------
  app.get('/api/projects', logged, (req, res) => {
    const where = [];
    const params = [];
    if (req.query.status === 'actifs') where.push("p.status NOT IN ('termine','annule')");
    else if (req.query.status) { where.push('p.status = ?'); params.push(req.query.status); }
    if (req.query.q) {
      where.push('(p.title LIKE ? OR c.name LIKE ? OR p.quote_number LIKE ?)');
      params.push(...Array(3).fill(`%${req.query.q}%`));
    }
    const rows = db.prepare(`SELECT p.id, p.title, p.status, p.quote_number, p.total_ht, p.fab_hours, p.fab_start, p.fab_end,
        p.install_date, p.install_time, p.install_confirmed, p.planning_mode, p.warnings, c.name client_name,
        (SELECT COUNT(*) FROM project_orders o WHERE o.project_id = p.id AND o.status = 'a_commander') orders_todo,
        (SELECT COUNT(*) FROM project_orders o WHERE o.project_id = p.id AND o.status = 'a_commander' AND o.order_by < date('now','localtime')) orders_late
      FROM projects p LEFT JOIN clients c ON c.id = p.client_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY CASE WHEN p.install_date IS NULL THEN 1 ELSE 0 END, p.install_date, p.id DESC`).all(...params);
    for (const r of rows) r.warnings = r.warnings ? JSON.parse(r.warnings) : [];
    res.json(rows);
  });

  app.get('/api/projects/:id', logged, (req, res) => {
    const p = P.getProject(db, id(req));
    if (!p) return res.status(404).json({ error: 'Projet introuvable' });
    res.json(p);
  });

  app.post('/api/projects', bureau, wrap((req, res) => {
    const newId = P.createProject(db, req.body || {});
    scheduler.syncNotifications(db);
    res.json({ id: newId });
  }));

  app.put('/api/projects/:id', bureau, wrap((req, res) => {
    P.updateProject(db, id(req), req.body || {});
    scheduler.syncNotifications(db);
    res.json(P.getProject(db, id(req)));
  }));

  app.delete('/api/projects/:id', admin, (req, res) => {
    db.prepare('DELETE FROM projects WHERE id = ?').run(id(req));
    res.json({ ok: true });
  });

  app.post('/api/projects/:id/plan', bureau, wrap((req, res) => {
    const b = req.body || {};
    const result = P.replan(db, id(req), { preview: Boolean(b.preview), overrides: b.overrides || {} });
    if (!b.preview) scheduler.syncNotifications(db);
    res.json(result);
  }));

  // Aperçu de planning avant création (formulaire d'import)
  app.post('/api/plan-preview', bureau, wrap((req, res) => {
    const b = req.body || {};
    const cal = loadCalendar(db);
    const { planProject } = require('./planning');
    const catQ = db.prepare('SELECT * FROM order_categories WHERE id = ?');
    const orders = (b.orders || []).map((o) => {
      const c = o.category_id ? catQ.get(o.category_id) : null;
      return { label: o.label || c?.name, lead_days: P.num(o.lead_days, c?.lead_days ?? 7), needed_for: o.needed_for || c?.needed_for || 'fabrication' };
    });
    const r = planProject({
      mode: b.planning_mode === 'backward' ? 'backward' : 'asap',
      today: D.today(),
      startDate: b.validated_at || null,
      installDate: b.install_date || null,
      fabHours: P.num(b.fab_hours, 0),
      installDays: P.num(b.install_days, 1),
      bufferDays: P.num(b.buffer_days, P.num(getSetting(db, 'buffer_days'), 2)),
      fabMarginDays: P.num(b.fab_margin_days, P.num(getSetting(db, 'fab_margin_days'), 1)),
      orders,
      isWorkday: cal.isWorkday,
      capacity: cal.capacity,
    });
    res.json(r);
  }));

  // ---------- Commandes ----------
  app.get('/api/orders', logged, (req, res) => {
    const rows = db.prepare(`SELECT o.*, p.title project_title, p.install_date, p.status project_status, c.name client_name
      FROM project_orders o JOIN projects p ON p.id = o.project_id LEFT JOIN clients c ON c.id = p.client_id
      WHERE p.status NOT IN ('annule') ${req.query.all ? '' : "AND (o.status != 'recu' OR o.received_at >= date('now','localtime','-14 days'))"}
      ORDER BY CASE o.status WHEN 'a_commander' THEN 0 WHEN 'commande' THEN 1 ELSE 2 END, COALESCE(o.order_by, o.expected_at)`).all();
    res.json(rows);
  });

  app.post('/api/projects/:id/orders', bureau, wrap((req, res) => {
    P.insertOrders(db, id(req), [req.body || {}]);
    P.replan(db, id(req));
    res.json(P.getProject(db, id(req)));
  }));

  app.put('/api/orders/:id', logged, wrap((req, res) => {
    const o = db.prepare('SELECT * FROM project_orders WHERE id = ?').get(id(req));
    if (!o) return res.status(404).json({ error: 'Commande introuvable' });
    const b = req.body || {};
    const isBureau = ['admin', 'bureau'].includes(req.user.role);
    const next = { ...o };
    // L'atelier peut uniquement changer l'état (commandé / reçu) ; le bureau peut tout modifier
    if (isBureau) {
      for (const k of ['label', 'supplier', 'notes', 'needed_for']) if (k in b) next[k] = b[k] || null;
      if ('lead_days' in b) next.lead_days = P.num(b.lead_days, o.lead_days);
      if ('expected_at' in b) next.expected_at = b.expected_at || null;
    }
    if ('status' in b) {
      next.status = ['a_commander', 'commande', 'recu'].includes(b.status) ? b.status : o.status;
      if (next.status === 'a_commander') { next.ordered_at = null; next.received_at = null; }
      if (next.status === 'commande') {
        next.ordered_at = b.ordered_at || o.ordered_at || D.today();
        next.received_at = null;
        if (!('expected_at' in b) || !b.expected_at) next.expected_at = D.addDays(next.ordered_at, next.lead_days);
      }
      if (next.status === 'recu') {
        next.ordered_at = o.ordered_at || b.ordered_at || D.today();
        next.received_at = b.received_at || D.today();
      }
    }
    db.prepare(`UPDATE project_orders SET label = ?, supplier = ?, notes = ?, needed_for = ?, lead_days = ?, expected_at = ?,
      status = ?, ordered_at = ?, received_at = ? WHERE id = ?`)
      .run(next.label, next.supplier, next.notes, next.needed_for, next.lead_days, next.expected_at, next.status, next.ordered_at, next.received_at, o.id);
    const proj = db.prepare('SELECT planning_mode, install_date, status FROM projects WHERE id = ?').get(o.project_id);
    // En mode « date de pose fixée », on recalcule pour mettre à jour les alertes ;
    // en mode « au plus tôt », on ne déplace pas la pose sans action explicite.
    if (proj.planning_mode === 'backward' && proj.install_date && !['termine', 'annule'].includes(proj.status)) P.replan(db, o.project_id);
    res.json(db.prepare('SELECT * FROM project_orders WHERE id = ?').get(o.id));
  }));

  app.delete('/api/orders/:id', bureau, (req, res) => {
    const o = db.prepare('SELECT project_id FROM project_orders WHERE id = ?').get(id(req));
    db.prepare('DELETE FROM project_orders WHERE id = ?').run(id(req));
    if (o) P.replan(db, o.project_id);
    res.json({ ok: true });
  });

  // ---------- Notifications WhatsApp ----------
  app.get('/api/notifications', bureau, (_req, res) => {
    res.json({
      notifications: db.prepare(`SELECT n.*, r.label rule_label, p.title project_title, c.name client_name, c.phone client_phone
        FROM notifications n JOIN projects p ON p.id = n.project_id LEFT JOIN clients c ON c.id = p.client_id
        LEFT JOIN notification_rules r ON r.id = n.rule_id
        ORDER BY CASE WHEN n.status = 'planifie' THEN 0 ELSE 1 END, n.scheduled_at DESC LIMIT 300`).all(),
      inbound: db.prepare(`SELECT w.*, p.title project_title FROM wa_inbound w LEFT JOIN projects p ON p.id = w.project_id
        ORDER BY w.id DESC LIMIT 100`).all(),
    });
  });

  app.post('/api/notifications/:id/send', bureau, wrap(async (req, res) => {
    res.json(await scheduler.sendNotification(db, id(req)));
  }));

  app.post('/api/notifications/:id/cancel', bureau, (req, res) => {
    db.prepare(`UPDATE notifications SET status = 'annule', error = 'Annulé manuellement' WHERE id = ? AND status = 'planifie'`).run(id(req));
    res.json({ ok: true });
  });

  // Webhook Meta : vérification (GET) et réception des statuts / réponses (POST)
  app.get('/webhook/whatsapp', (req, res) => {
    const cfg = wa.config(db);
    if (req.query['hub.mode'] === 'subscribe' && cfg.verifyToken && req.query['hub.verify_token'] === cfg.verifyToken) {
      return res.status(200).send(String(req.query['hub.challenge'] || ''));
    }
    res.sendStatus(403);
  });

  app.post('/webhook/whatsapp', (req, res) => {
    const cfg = wa.config(db);
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
    if (!wa.verifySignature(cfg.appSecret, raw, req.headers['x-hub-signature-256'])) return res.sendStatus(401);
    let payload;
    try { payload = JSON.parse(raw.toString('utf8') || '{}'); } catch { return res.sendStatus(400); }
    res.sendStatus(200);
    try { handleWebhook(db, payload); } catch (e) { console.error('[webhook]', e); }
  });

  // ---------- Tâches et objectifs ----------
  app.get('/api/tasks', logged, (req, res) => {
    res.json(db.prepare(`SELECT t.*, p.title project_title FROM tasks t LEFT JOIN projects p ON p.id = t.project_id
      ${req.query.done ? '' : 'WHERE t.done_at IS NULL'} ORDER BY t.done_at IS NOT NULL, t.due_date IS NULL, t.due_date LIMIT 500`).all());
  });
  app.post('/api/tasks', logged, wrap((req, res) => {
    const b = req.body || {};
    if (!b.title) return res.status(400).json({ error: 'Intitulé requis' });
    const r = db.prepare('INSERT INTO tasks(project_id, title, due_date) VALUES (?,?,?)').run(b.project_id ? Number(b.project_id) : null, b.title, b.due_date || null);
    res.json({ id: Number(r.lastInsertRowid) });
  }));
  app.put('/api/tasks/:id', logged, wrap((req, res) => {
    const b = req.body || {};
    const t = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id(req));
    if (!t) return res.status(404).json({ error: 'Tâche introuvable' });
    db.prepare('UPDATE tasks SET title = ?, due_date = ?, done_at = ? WHERE id = ?').run(
      b.title ?? t.title, 'due_date' in b ? b.due_date || null : t.due_date,
      'done' in b ? (b.done ? D.nowLocal() : null) : t.done_at, t.id);
    res.json({ ok: true });
  }));
  app.delete('/api/tasks/:id', logged, (req, res) => {
    db.prepare('DELETE FROM tasks WHERE id = ?').run(id(req));
    res.json({ ok: true });
  });

  app.get('/api/objectives', logged, (_req, res) => res.json(objectivesWithProgress(db)));
  app.post('/api/objectives', bureau, wrap((req, res) => {
    const b = req.body || {};
    if (!b.title || !P.num(b.target) || !b.period_start || !b.period_end) return res.status(400).json({ error: 'Intitulé, cible et période requis' });
    const r = db.prepare('INSERT INTO objectives(title, metric, target, period_start, period_end, manual_value) VALUES (?,?,?,?,?,?)')
      .run(b.title, b.metric || 'manuel', P.num(b.target), b.period_start, b.period_end, P.num(b.manual_value, 0));
    res.json({ id: Number(r.lastInsertRowid) });
  }));
  app.put('/api/objectives/:id', bureau, wrap((req, res) => {
    const b = req.body || {};
    db.prepare('UPDATE objectives SET title = ?, metric = ?, target = ?, period_start = ?, period_end = ?, manual_value = ? WHERE id = ?')
      .run(b.title, b.metric || 'manuel', P.num(b.target, 0), b.period_start, b.period_end, P.num(b.manual_value, 0), id(req));
    res.json({ ok: true });
  }));
  app.delete('/api/objectives/:id', bureau, (req, res) => {
    db.prepare('DELETE FROM objectives WHERE id = ?').run(id(req));
    res.json({ ok: true });
  });

  // ---------- Tableau de bord ----------
  app.get('/api/dashboard', logged, (_req, res) => {
    const t = D.today();
    const in7 = D.addDays(t, 7);
    const orderQ = (where) => db.prepare(`SELECT o.*, p.title project_title, c.name client_name FROM project_orders o
      JOIN projects p ON p.id = o.project_id LEFT JOIN clients c ON c.id = p.client_id
      WHERE p.status NOT IN ('termine','annule') AND ${where} ORDER BY COALESCE(o.order_by, o.expected_at)`);
    res.json({
      today: t,
      orders_late: orderQ("o.status = 'a_commander' AND o.order_by < ?").all(t),
      orders_soon: orderQ("o.status = 'a_commander' AND (o.order_by IS NULL OR o.order_by BETWEEN ? AND ?)").all(t, in7),
      deliveries: orderQ("o.status = 'commande' AND o.expected_at <= ?").all(in7),
      installs: db.prepare(`SELECT p.id, p.title, p.install_date, p.install_time, p.install_days, p.install_confirmed, p.status, c.name client_name
        FROM projects p LEFT JOIN clients c ON c.id = p.client_id
        WHERE p.install_date BETWEEN ? AND ? AND p.status NOT IN ('annule','termine') ORDER BY p.install_date`).all(t, D.addDays(t, 21)),
      fabrication: db.prepare(`SELECT p.id, p.title, c.name client_name, SUM(a.hours) hours, MIN(a.day) first_day, MAX(a.day) last_day
        FROM allocations a JOIN projects p ON p.id = a.project_id LEFT JOIN clients c ON c.id = p.client_id
        WHERE a.day BETWEEN ? AND ? AND p.status NOT IN ('annule') GROUP BY p.id ORDER BY first_day`).all(t, in7),
      to_plan: db.prepare(`SELECT p.id, p.title, c.name client_name, p.created_at FROM projects p LEFT JOIN clients c ON c.id = p.client_id
        WHERE p.status = 'a_planifier' ORDER BY p.id DESC`).all(),
      warnings: db.prepare(`SELECT p.id, p.title, p.warnings FROM projects p WHERE p.status NOT IN ('termine','annule','pose')
        AND p.warnings IS NOT NULL AND p.warnings != '[]'`).all().map((r) => ({ ...r, warnings: JSON.parse(r.warnings) }))
        .filter((r) => r.warnings.some((w) => w.level !== 'info')),
      tasks: db.prepare(`SELECT t.*, p.title project_title FROM tasks t LEFT JOIN projects p ON p.id = t.project_id
        WHERE t.done_at IS NULL AND (t.due_date IS NULL OR t.due_date <= ?) ORDER BY t.due_date IS NULL, t.due_date`).all(in7),
      notifications: db.prepare(`SELECT n.*, r.label rule_label, p.title project_title, c.name client_name FROM notifications n
        JOIN projects p ON p.id = n.project_id LEFT JOIN clients c ON c.id = p.client_id LEFT JOIN notification_rules r ON r.id = n.rule_id
        WHERE (n.status = 'planifie' AND n.scheduled_at <= ?) OR (n.status = 'erreur' AND n.sent_at >= ?)
        ORDER BY n.scheduled_at`).all(`${D.addDays(t, 3)}T23:59`, D.addDays(t, -7)),
      objectives: objectivesWithProgress(db).filter((o) => o.period_end >= t && o.period_start <= t),
      load: workshopLoad(db, t, 10),
    });
  });

  // ---------- Calendrier ----------
  app.get('/api/calendar', logged, (req, res) => {
    const from = /^\d{4}-\d{2}-\d{2}$/.test(req.query.from || '') ? req.query.from : D.addDays(D.today(), -7);
    let to = /^\d{4}-\d{2}-\d{2}$/.test(req.query.to || '') ? req.query.to : D.addDays(from, 41);
    if (D.diffDays(from, to) > 120) to = D.addDays(from, 120);
    res.json(calendarData(db, from, to, { withClosures: true }));
  });

  // ---------- Écran atelier (sans connexion, par clé) ----------
  app.get('/api/display', (req, res) => {
    const key = String(req.query.cle || req.query.key || '');
    const expected = getSetting(db, 'display_token') || '';
    const ok = key && expected && key.length === expected.length && crypto.timingSafeEqual(Buffer.from(key), Buffer.from(expected));
    if (!ok && !req.user) return res.status(403).json({ error: 'Clé d’affichage invalide' });
    const t = D.today();
    const wd = D.weekday(t);
    const monday = D.addDays(t, 1 - wd);
    const to = D.addDays(monday, 13);
    const data = calendarData(db, monday, to, { forDisplay: true });
    res.json({
      company: getSetting(db, 'company_name'),
      today: t,
      now: D.nowLocal(),
      ...data,
      orders_late: db.prepare(`SELECT o.label, o.order_by, p.title project_title FROM project_orders o JOIN projects p ON p.id = o.project_id
        WHERE o.status = 'a_commander' AND o.order_by < ? AND p.status NOT IN ('termine','annule') ORDER BY o.order_by`).all(t),
      deliveries_late: db.prepare(`SELECT o.label, o.expected_at, p.title project_title FROM project_orders o JOIN projects p ON p.id = o.project_id
        WHERE o.status = 'commande' AND o.expected_at < ? AND p.status NOT IN ('termine','annule') ORDER BY o.expected_at`).all(t),
      tasks_today: db.prepare(`SELECT t.title, t.due_date, p.title project_title FROM tasks t LEFT JOIN projects p ON p.id = t.project_id
        WHERE t.done_at IS NULL AND t.due_date <= ? ORDER BY t.due_date`).all(t),
    });
  });

  // ---------- Fichiers statiques ----------
  const pub = path.join(__dirname, '..', 'public');
  app.get('/atelier', (_req, res) => res.sendFile(path.join(pub, 'atelier.html')));
  app.use(express.static(pub, { index: 'index.html', maxAge: '5m' }));

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Route inconnue' }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(err.status || 500).json({ error: err.status ? err.message : 'Erreur interne du serveur. Réessayez ; si le problème persiste, consultez les journaux du serveur.' });
  });

  return app;
}

function workshopLoad(db, from, days) {
  const cal = loadCalendar(db);
  const out = [];
  for (let i = 0; i < days; i++) {
    const d = D.addDays(from, i);
    if (!cal.isWorkday(d)) continue;
    out.push({ day: d, capacity: cal.capacityTotal(d), used: cal.used(d) });
  }
  return out;
}

function calendarData(db, from, to, { withClosures = false, forDisplay = false } = {}) {
  const cal = loadCalendar(db);
  const days = [];
  for (let d = from; d <= to; d = D.addDays(d, 1)) {
    days.push({ day: d, weekday: D.weekday(d), workday: cal.isWorkday(d), holiday: D.holidayName(d), capacity: cal.capacityTotal(d), used: cal.used(d) });
  }
  const clientCol = 'c.name client_name';
  const fabrication = db.prepare(`SELECT a.day, a.hours, p.id project_id, p.title, ${clientCol} FROM allocations a
    JOIN projects p ON p.id = a.project_id LEFT JOIN clients c ON c.id = p.client_id
    WHERE a.day BETWEEN ? AND ? AND p.status != 'annule' ORDER BY a.day, p.install_date`).all(from, to);
  const installs = db.prepare(`SELECT p.id project_id, p.title, p.install_date, p.install_time, p.install_days, p.install_confirmed, p.status, ${clientCol}
    FROM projects p LEFT JOIN clients c ON c.id = p.client_id
    WHERE p.install_date IS NOT NULL AND p.install_date <= ? AND p.install_date >= ? AND p.status != 'annule'`).all(to, D.addDays(from, -14));
  // Une pose sur plusieurs jours : on l'étend sur les jours ouvrés
  const installDays = [];
  for (const i of installs) {
    let d = i.install_date;
    for (let n = 0; n < (i.install_days || 1); ) {
      if (d > to) break;
      if (cal.isWorkday(d) || n === 0) {
        if (d >= from) installDays.push({ ...i, day: d, part: n + 1 });
        n++;
      }
      d = D.addDays(d, 1);
    }
  }
  const deliveries = db.prepare(`SELECT o.id, o.label, o.status, o.supplier, COALESCE(o.received_at, o.expected_at) day, p.id project_id, p.title
    FROM project_orders o JOIN projects p ON p.id = o.project_id
    WHERE o.status IN ('commande','recu') AND COALESCE(o.received_at, o.expected_at) BETWEEN ? AND ? AND p.status != 'annule'`).all(from, to);
  const out = { from, to, days, fabrication, installs: installDays, deliveries };
  if (!forDisplay) {
    out.order_deadlines = db.prepare(`SELECT o.id, o.label, o.order_by day, p.id project_id, p.title FROM project_orders o
      JOIN projects p ON p.id = o.project_id
      WHERE o.status = 'a_commander' AND o.order_by BETWEEN ? AND ? AND p.status NOT IN ('termine','annule')`).all(from, to);
    out.tasks = db.prepare(`SELECT id, title, due_date day, done_at FROM tasks WHERE due_date BETWEEN ? AND ?`).all(from, to);
  }
  if (withClosures) out.closures = db.prepare(`SELECT c.*, u.name user_name FROM closures c LEFT JOIN users u ON u.id = c.user_id
    WHERE c.end_date >= ? AND c.start_date <= ?`).all(from, to);
  return out;
}

function objectivesWithProgress(db) {
  const rows = db.prepare('SELECT * FROM objectives ORDER BY period_end DESC').all();
  for (const o of rows) {
    let v = 0;
    const a = o.period_start, b = o.period_end;
    if (o.metric === 'ca_signe') v = db.prepare(`SELECT COALESCE(SUM(total_ht),0) v FROM projects WHERE status != 'annule' AND validated_at BETWEEN ? AND ?`).get(a, b).v;
    else if (o.metric === 'mo_signee') v = db.prepare(`SELECT COALESCE(SUM(COALESCE(labor_amount,0) + COALESCE(pose_amount,0)),0) v FROM projects WHERE status != 'annule' AND validated_at BETWEEN ? AND ?`).get(a, b).v;
    else if (o.metric === 'heures_planifiees') v = db.prepare(`SELECT COALESCE(SUM(a.hours),0) v FROM allocations a JOIN projects p ON p.id = a.project_id WHERE p.status != 'annule' AND a.day BETWEEN ? AND ?`).get(a, b).v;
    else if (o.metric === 'poses') v = db.prepare(`SELECT COUNT(*) v FROM projects WHERE status != 'annule' AND install_date BETWEEN ? AND ?`).get(a, b).v;
    else v = o.manual_value;
    o.value = Math.round(v * 100) / 100;
    o.progress = o.target ? Math.min(1, o.value / o.target) : 0;
  }
  return rows;
}

// Réponses des clients (boutons « Je confirme » / « Je souhaite décaler ») et statuts de livraison
function handleWebhook(db, payload) {
  const cc = getSetting(db, 'default_country_code') || '33';
  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      const v = change.value || {};
      for (const s of v.statuses || []) {
        const map = { delivered: 'livre', read: 'lu', failed: 'erreur', sent: 'envoye' };
        if (map[s.status]) {
          const err = s.status === 'failed' ? (s.errors?.[0]?.title || 'Échec de livraison') : null;
          db.prepare(`UPDATE notifications SET status = ?, error = COALESCE(?, error) WHERE wa_message_id = ?
            AND status NOT IN ('lu')`).run(map[s.status], err, s.id);
        }
      }
      for (const m of v.messages || []) {
        const from = m.from;
        const body = m.button?.text || m.interactive?.button_reply?.title || m.text?.body || `[${m.type}]`;
        // Retrouver le projet : réponse à un message connu, sinon client par numéro
        let projectId = null;
        if (m.context?.id) {
          projectId = db.prepare('SELECT project_id FROM notifications WHERE wa_message_id = ?').get(m.context.id)?.project_id || null;
        }
        if (!projectId) {
          const clients = db.prepare('SELECT id, phone FROM clients WHERE phone IS NOT NULL').all()
            .filter((c) => wa.normalizePhone(c.phone, cc) === from).map((c) => c.id);
          if (clients.length) {
            projectId = db.prepare(`SELECT id FROM projects WHERE client_id IN (${clients.map(() => '?').join(',')})
              AND install_date >= ? AND status NOT IN ('annule','termine') ORDER BY install_date LIMIT 1`).get(...clients, D.today())?.id || null;
          }
        }
        db.prepare('INSERT INTO wa_inbound(from_phone, body, project_id) VALUES (?,?,?)').run(from, body, projectId);
        if (projectId) {
          const txt = body.toLowerCase();
          let state = null;
          if (/confirm|ok\b|oui|d'accord|parfait/.test(txt)) state = 'confirme';
          if (/d[ée]cal|report|changer|impossible|pas dispo|annul/.test(txt)) state = 'a_decaler';
          if (state) db.prepare('UPDATE projects SET install_confirmed = ? WHERE id = ?').run(state, projectId);
        }
      }
    }
  }
}

module.exports = { createApp, handleWebhook, calendarData };
