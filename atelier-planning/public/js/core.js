/* Détails Agencement — utilitaires communs, routeur et coquille de l'application */
'use strict';

// ---------- HTML sûr ----------
class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
const raw = (s) => new Raw(String(s));
function esc(v) {
  if (v == null || v === false) return '';
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(esc).join('');
  return String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
function html(strings, ...vals) {
  let out = '';
  strings.forEach((s, i) => { out += s + (i < vals.length ? esc(vals[i]) : ''); });
  return raw(out);
}
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// ---------- API ----------
async function api(path, { method = 'GET', body, form } = {}) {
  const opts = { method, headers: {} };
  if (form) opts.body = form;
  else if (body !== undefined) { opts.body = JSON.stringify(body); opts.headers['Content-Type'] = 'application/json'; }
  const res = await fetch(`/api${path}`, opts);
  let data = null;
  try { data = await res.json(); } catch { /* réponse vide */ }
  if (res.status === 401 && !path.startsWith('/login') && !path.startsWith('/me')) { App.boot(); throw new Error('Session expirée, reconnectez-vous.'); }
  if (!res.ok) throw new Error(data?.error || `Le serveur a répondu ${res.status}. Réessayez.`);
  return data;
}

function toast(msg, type = '') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), type === 'error' ? 6000 : 3000);
}
async function run(fn, okMsg) {
  try { const r = await fn(); if (okMsg) toast(okMsg); return r; } catch (e) { toast(e.message, 'error'); return undefined; }
}

// ---------- Dates et formats ----------
const DAYS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const DAYS_LONG = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const pad = (n) => String(n).padStart(2, '0');
const toDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseDay = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); };
const today = () => toDay(new Date());
const addDays = (s, n) => { const d = parseDay(s); d.setDate(d.getDate() + n); return toDay(d); };
const diffDays = (a, b) => Math.round((parseDay(b) - parseDay(a)) / 86400000);
function fmtDate(s, { long = false, weekday = true } = {}) {
  if (!s) return '—';
  const d = parseDay(s.slice(0, 10));
  if (long) return `${DAYS_LONG[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  return `${weekday ? DAYS[d.getDay()] + ' ' : ''}${pad(d.getDate())}/${pad(d.getMonth() + 1)}${d.getFullYear() !== new Date().getFullYear() ? '/' + d.getFullYear() : ''}`;
}
function fmtDateTime(s) { if (!s) return '—'; const [d, t] = s.split('T'); return `${fmtDate(d)} ${t ? t.slice(0, 5).replace(':', 'h') : ''}`; }
function relDay(s) {
  if (!s) return '';
  const n = diffDays(today(), s.slice(0, 10));
  if (n === 0) return "aujourd'hui";
  if (n === 1) return 'demain';
  if (n === -1) return 'hier';
  return n > 0 ? `dans ${n} j` : `il y a ${-n} j`;
}
const money = (n) => (n == null || n === '' ? '—' : Number(n).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }));
const hours = (n) => (n == null || n === '' ? '—' : `${Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} h`);

const STATUS = {
  a_planifier: ['À planifier', 'warning'], planifie: ['Planifié', 'info'], en_fabrication: ['En fabrication', 'accent'],
  pret: ['Prêt à poser', 'ok'], pose: ['Posé', 'ok'], termine: ['Terminé', ''], annule: ['Annulé', ''],
};
const ORDER_STATUS = { a_commander: ['À commander', 'warning'], commande: ['Commandé', 'info'], recu: ['Reçu', 'ok'] };
const CONFIRM = { en_attente: ['Non confirmé', ''], confirme: ['Confirmé par le client', 'ok'], a_decaler: ['Client demande à décaler', 'danger'] };
const NOTIF = { planifie: ['Prévu', 'info'], envoye: ['Envoyé', 'ok'], simule: ['Simulé (test)', 'accent'], livre: ['Distribué', 'ok'], lu: ['Lu', 'ok'], erreur: ['Erreur', 'danger'], annule: ['Annulé', ''] };
const badge = (map, key) => { const [l, c] = map[key] || [key, '']; return html`<span class="badge ${c}">${l}</span>`; };

// ---------- Icônes (traits simples) ----------
const ICON_PATHS = {
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  upload: 'M12 16V4m0 0l-4 4m4-4l4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3',
  folder: 'M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  truck: 'M3 6h11v10H3zM14 10h4l3 3v3h-7M7 19a2 2 0 1 0 0-.01M17 19a2 2 0 1 0 0-.01',
  check: 'M4 12l5 5L20 6',
  chat: 'M4 5h16v11H8l-4 4z',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2-1.2L14.3 3h-4l-.4 2.5a7 7 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2 1.2l.4 2.5h4l.4-2.5a7 7 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z',
  tv: 'M3 5h18v12H3zM8 21h8M12 17v4',
  menu: 'M4 6h16M4 12h16M4 18h16',
  x: 'M6 6l12 12M18 6L6 18',
  plus: 'M12 5v14M5 12h14',
  left: 'M15 6l-6 6 6 6', right: 'M9 6l6 6-6 6',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  send: 'M4 12l16-8-6 16-2-7z',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
};
const icon = (n) => raw(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICON_PATHS[n]}"/></svg>`);

// ---------- Panneau latéral (édition rapide) ----------
function drawer({ title, body, onSave, saveLabel = 'Enregistrer', onDelete, deleteLabel, onClose }) {
  const prev = document.activeElement;
  const wrap = document.createElement('div');
  wrap.innerHTML = String(html`<div class="overlay" data-close></div>
    <div class="drawer" role="dialog" aria-modal="true" aria-label="${title}">
      <div class="drawer-head"><h2 style="margin:0">${title}</h2><span class="spacer"></span>
        <button class="btn icon ghost" data-close title="Fermer (Échap)" aria-label="Fermer">${icon('x')}</button></div>
      <form class="drawer-body" id="drawer-form">${body}</form>
      <div class="drawer-foot">
        ${onDelete ? html`<button class="btn danger" type="button" data-del>${deleteLabel || 'Supprimer'}</button><span class="spacer"></span>` : ''}
        <button class="btn" type="button" data-close>Annuler</button>
        ${onSave ? html`<button class="btn primary" type="button" data-save>${saveLabel}</button>` : ''}
      </div></div>`);
  document.body.appendChild(wrap);
  const form = $('#drawer-form', wrap);
  const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); prev?.focus?.(); onClose?.(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  $$('[data-close]', wrap).forEach((b) => b.addEventListener('click', close));
  const save = async () => {
    const btn = $('[data-save]', wrap);
    btn.disabled = true;
    try { if ((await onSave(formData(form), form)) !== false) close(); } catch (e) { toast(e.message, 'error'); }
    btn.disabled = false;
  };
  $('[data-save]', wrap)?.addEventListener('click', save);
  form.addEventListener('submit', (e) => { e.preventDefault(); if (onSave) save(); });
  $('[data-del]', wrap)?.addEventListener('click', async () => {
    try { if ((await onDelete()) !== false) close(); } catch (e) { toast(e.message, 'error'); }
  });
  setTimeout(() => $('input, select, textarea', form)?.focus(), 30);
  return { close, form };
}

function formData(form) {
  const o = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') {
      if (el.dataset.group) { (o[el.name] ||= []); if (el.checked) o[el.name].push(el.value); } else o[el.name] = el.checked;
    } else if (el.type === 'radio') { if (el.checked) o[el.name] = el.value; } else o[el.name] = el.value;
  }
  return o;
}

function confirmAction(text, actionLabel) {
  return new Promise((resolve) => {
    let ok = false;
    drawer({ title: 'Confirmer', body: html`<p>${text}</p>`, saveLabel: actionLabel,
      onSave: () => { ok = true; }, onClose: () => resolve(ok) });
  });
}

// Logotype texte : premier mot en capitales espacées (« DÉTAILS »), le reste en sous-titre
function wordmark(company) {
  const words = String(company || 'Détails Agencement').trim().split(/\s+/);
  return html`<span class="wordmark"><b>${words[0]}</b>${words.length > 1 ? html`<span>${words.slice(1).join(' ')}</span>` : ''}</span>`;
}

// ---------- Application ----------
const Views = {};
const App = {
  user: null, company: '',
  canEdit() { return ['admin', 'bureau'].includes(this.user?.role); },
  isAdmin() { return this.user?.role === 'admin'; },

  async boot() {
    let me;
    try { me = await api('/me'); } catch (e) { document.getElementById('app').textContent = `Serveur injoignable : ${e.message}`; return; }
    this.company = me.company || '';
    if (me.setupNeeded) return this.renderSetup();
    if (!me.user) return this.renderLogin();
    this.user = me.user;
    this.renderShell();
    window.onhashchange = () => this.route();
    this.route();
  },

  renderLogin() {
    document.getElementById('app').innerHTML = String(html`<div class="auth"><form class="card stack" id="login">
      <div class="row" style="gap:12px"><img class="brand-logo" src="img/logo.png" alt="" style="width:44px;height:44px">${wordmark(this.company)}</div><p class="muted" style="margin:4px 0 0">Connectez-vous pour accéder au planning.</p>
      <label class="field">E-mail<input name="email" type="email" autocomplete="username" required></label>
      <label class="field">Mot de passe<input name="password" type="password" autocomplete="current-password" required></label>
      <button class="btn primary" type="submit">Se connecter</button></form></div>`);
    $('#login').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (await run(() => api('/login', { method: 'POST', body: formData(e.target) }))) this.boot();
    });
  },

  renderSetup() {
    document.getElementById('app').innerHTML = String(html`<div class="auth"><form class="card stack" id="setup">
      <img class="auth-logo" src="img/logo.png" alt="">
      <div><h1>Bienvenue</h1><p class="muted" style="margin:0">Premier lancement : créez le compte administrateur.</p></div>
      <label class="field">Nom de l'entreprise<input name="company_name" required value="Détails Agencement"></label>
      <label class="field">Votre nom<input name="name" required autocomplete="name"></label>
      <label class="field">E-mail<input name="email" type="email" required autocomplete="username"></label>
      <label class="field">Mot de passe <span class="hint">8 caractères minimum</span><input name="password" type="password" minlength="8" required autocomplete="new-password"></label>
      <button class="btn primary" type="submit">Créer le compte</button></form></div>`);
    $('#setup').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (await run(() => api('/setup', { method: 'POST', body: formData(e.target) }))) this.boot();
    });
  },

  renderShell() {
    const links = [
      ['#/', 'home', 'Tableau de bord'],
      this.canEdit() && ['#/import', 'upload', 'Nouveau devis'],
      ['#/projets', 'folder', 'Projets'],
      ['#/planning', 'calendar', 'Planning'],
      ['#/commandes', 'truck', 'Commandes'],
      ['#/taches', 'check', 'Tâches & objectifs'],
      this.canEdit() && ['#/whatsapp', 'chat', 'WhatsApp'],
      this.canEdit() && ['#/reglages', 'gear', 'Réglages'],
    ].filter(Boolean);
    document.getElementById('app').innerHTML = String(html`<div class="mobile-bar">
        <button class="btn icon ghost" id="menu-btn" aria-label="Ouvrir le menu">${icon('menu')}</button>
        <img class="brand-logo" src="img/logo.png" alt="" style="width:28px;height:28px">${wordmark(this.company)}</div>
      <div class="layout">
        <aside class="sidebar" id="sidebar">
          <div class="brand"><img class="brand-logo" src="img/logo.png" alt="">${wordmark(this.company)}</div>
          <nav class="nav">${links.map(([href, ic, label]) => html`<a href="${href}" data-nav>${icon(ic)}<span>${label}</span></a>`)}
            <a href="/atelier" target="_blank" rel="noopener">${icon('tv')}<span>Écran atelier</span></a></nav>
          <div class="sidebar-foot"><div>${this.user.name}</div>
            <button class="btn small ghost" id="logout" style="padding-left:0">${icon('logout')} Se déconnecter</button></div>
        </aside>
        <main class="main" id="view"></main>
      </div>`);
    $('#menu-btn').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
    $('#logout').addEventListener('click', async () => { await api('/logout', { method: 'POST' }); this.user = null; this.boot(); });
  },

  async route() {
    const hash = location.hash.replace(/^#/, '') || '/';
    const parts = hash.split('?')[0].split('/').filter(Boolean);
    const query = Object.fromEntries(new URLSearchParams(hash.split('?')[1] || ''));
    $('#sidebar')?.classList.remove('open');
    $$('[data-nav]').forEach((a) => {
      const target = a.getAttribute('href').slice(1);
      a.classList.toggle('active', target === '/' ? hash === '/' : hash.startsWith(target));
    });
    const view = $('#view');
    const name = parts[0] || 'dashboard';
    const fn = Views[name];
    if (!fn) { view.innerHTML = String(html`<p>Page introuvable. <a href="#/">Retour au tableau de bord</a></p>`); return; }
    try {
      await fn(view, parts.slice(1), query);
      window.scrollTo(0, 0);
    } catch (e) {
      view.innerHTML = String(html`<div class="alert danger">Impossible de charger la page : ${e.message} <button class="btn small" onclick="App.route()">Réessayer</button></div>`);
    }
  },

  go(hash) { if (location.hash === hash) this.route(); else location.hash = hash; },
};

function debounce(fn, ms = 300) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

document.addEventListener('DOMContentLoaded', () => App.boot());
