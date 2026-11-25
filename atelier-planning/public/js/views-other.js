/* Commandes, tâches & objectifs, WhatsApp, réglages */
'use strict';

// ================= Commandes =================
Views.commandes = async (view, _p, query) => {
  const rows = await api(`/orders${query.tout ? '?all=1' : ''}`);
  const t = today();
  const groups = [
    ['Commandes en retard', rows.filter((o) => o.status === 'a_commander' && o.order_by && o.order_by < t), 'danger'],
    ['À commander', rows.filter((o) => o.status === 'a_commander' && !(o.order_by && o.order_by < t)), 'warning'],
    ['Commandées, en attente de livraison', rows.filter((o) => o.status === 'commande'), 'info'],
    [query.tout ? 'Reçues' : 'Reçues (14 derniers jours)', rows.filter((o) => o.status === 'recu'), 'ok'],
  ];
  view.innerHTML = String(html`
    <div class="page-head"><h1>Commandes</h1><div class="actions">
      <a class="btn" href="#/commandes${query.tout ? '' : '?tout=1'}">${query.tout ? 'Masquer l’historique' : 'Afficher tout l’historique'}</a></div></div>
    ${groups.map(([title, list, cls]) => html`<div class="card"><h2>${title} <span class="badge ${cls}">${list.length}</span></h2>
      ${list.length ? html`<div class="table-wrap"><table><thead><tr><th>Poste</th><th>Projet</th><th>Pour</th><th>Commander avant</th><th>Livraison</th><th>Pose</th><th></th></tr></thead><tbody>
        ${list.map((o) => html`<tr><td><strong>${o.label}</strong><div class="muted small">${o.supplier || ''}</div></td>
          <td><a href="#/projets/${o.project_id}">${o.project_title}</a><div class="muted small">${o.client_name || ''}</div></td>
          <td class="small">${o.needed_for === 'pose' ? 'Pose' : 'Fabrication'}</td>
          <td>${o.status === 'a_commander' ? html`<span class="badge ${cls}">${fmtDate(o.order_by)}</span> <span class="muted small">${relDay(o.order_by)}</span>` : html`<span class="muted small">${fmtDate(o.ordered_at)}</span>`}</td>
          <td class="small">${o.received_at ? `reçu ${fmtDate(o.received_at)}` : html`<span style="${o.status === 'commande' && o.expected_at < t ? 'color:var(--danger);font-weight:600' : ''}">${fmtDate(o.expected_at)}</span>`}</td>
          <td class="small">${fmtDate(o.install_date)}</td>
          <td style="white-space:nowrap">${o.status === 'a_commander' ? html`<button class="btn small" data-oid="${o.id}" data-s="commande">Commandé</button>` : ''}
            ${o.status === 'commande' ? html`<button class="btn small" data-oid="${o.id}" data-s="recu">Reçu</button>` : ''}</td></tr>`)}
      </tbody></table></div>` : html`<p class="empty">Rien dans cette catégorie.</p>`}</div>`)}`);
  $$('[data-oid]', view).forEach((b) => b.addEventListener('click', () => orderStatusDrawer(b.dataset.oid, b.dataset.s, rows, () => Views.commandes(view, _p, query))));
};

// ================= Tâches et objectifs =================
const METRICS = { ca_signe: 'Chiffre d’affaires signé (HT)', mo_signee: 'Main-d’œuvre signée', heures_planifiees: 'Heures atelier planifiées', poses: 'Nombre de poses', manuel: 'Suivi manuel' };

Views.taches = async (view, _p, query) => {
  const [tasks, objectives, projects] = await Promise.all([api(`/tasks${query.faites ? '?done=1' : ''}`), api('/objectives'), api('/projects?status=actifs')]);
  const t = today();
  view.innerHTML = String(html`
    <div class="page-head"><h1>Tâches et objectifs</h1></div>
    <div class="grid grid-2" style="align-items:start">
      <div class="card"><h2>Tâches et rappels</h2>
        <form class="stack" id="task-form" style="margin-bottom:12px">
          <input name="title" required placeholder="ex. Rappeler le fournisseur de façades" aria-label="Intitulé de la tâche">
          <div class="row"><input name="due_date" type="date" style="flex:1;min-width:140px" aria-label="Échéance">
            <select name="project_id" style="flex:2;min-width:160px" aria-label="Projet lié"><option value="">Sans projet</option>${projects.map((p) => html`<option value="${p.id}">${p.title}</option>`)}</select>
            <button class="btn primary" type="submit">Ajouter la tâche</button></div></form>
        ${tasks.length ? html`<ul class="list">${tasks.map((tk) => html`<li><label class="check grow"><input type="checkbox" data-task="${tk.id}" ${tk.done_at ? 'checked' : ''}>
          <span style="${tk.done_at ? 'text-decoration:line-through;color:var(--muted)' : ''}">${tk.title}</span>
          ${tk.project_title ? html`<a class="small" href="#/projets/${tk.project_id}">${tk.project_title}</a>` : ''}</label>
          ${tk.due_date ? html`<span class="badge ${!tk.done_at && tk.due_date < t ? 'danger' : ''}">${fmtDate(tk.due_date)}</span>` : ''}
          <button class="btn small ghost icon" data-tdel="${tk.id}" aria-label="Supprimer la tâche" title="Supprimer">${icon('trash')}</button></li>`)}</ul>`
          : html`<p class="empty">Aucune tâche en cours. Ajoutez un rappel ci-dessus.</p>`}
        <a class="small" href="#/taches${query.faites ? '' : '?faites=1'}">${query.faites ? 'Masquer les tâches faites' : 'Afficher les tâches faites'}</a>
      </div>
      <div class="card"><div class="row" style="margin-bottom:12px"><h2 style="margin:0">Objectifs</h2><span class="spacer"></span>
        ${App.canEdit() ? html`<button class="btn" id="add-obj">${icon('plus')} Nouvel objectif</button>` : ''}</div>
        ${objectives.length ? objectives.map((o) => html`<div class="row" style="align-items:flex-start"><div class="grow">${objectiveBlock(o)}</div>
          ${App.canEdit() ? html`<button class="btn small ghost" data-obj="${o.id}">Modifier</button>` : ''}</div>`)
          : html`<p class="empty">Aucun objectif. Exemple : 40 000 € de chiffre d’affaires signé ce trimestre, ou 12 poses ce mois-ci.</p>`}
      </div>
    </div>`);
  const reload = () => Views.taches(view, _p, query);
  $('#task-form').addEventListener('submit', async (e) => { e.preventDefault(); if (await run(() => api('/tasks', { method: 'POST', body: formData(e.target) }), 'Tâche ajoutée')) reload(); });
  $$('[data-task]', view).forEach((c) => c.addEventListener('change', async () => { await run(() => api(`/tasks/${c.dataset.task}`, { method: 'PUT', body: { done: c.checked } })); reload(); }));
  $$('[data-tdel]', view).forEach((b) => b.addEventListener('click', async () => { if (await run(() => api(`/tasks/${b.dataset.tdel}`, { method: 'DELETE' }))) reload(); }));
  const objDrawer = (o = {}) => {
    const mStart = `${t.slice(0, 7)}-01`;
    const mEnd = addDays(`${addDays(mStart, 32).slice(0, 7)}-01`, -1);
    drawer({
      title: o.id ? 'Modifier l’objectif' : 'Nouvel objectif',
      body: html`<div class="stack"><label class="field">Intitulé<input name="title" required value="${o.title || ''}" placeholder="ex. CA signé du mois"></label>
        <label class="field">Indicateur<select name="metric">${Object.entries(METRICS).map(([k, l]) => html`<option value="${k}" ${o.metric === k ? 'selected' : ''}>${l}</option>`)}</select>
          <span class="hint">Les indicateurs automatiques se calculent à partir des projets ; « suivi manuel » se met à jour à la main.</span></label>
        <div class="form-grid"><label class="field">Cible<input name="target" type="number" step="any" required value="${o.target ?? ''}"></label>
          <label class="field">Valeur actuelle <span class="hint">suivi manuel</span><input name="manual_value" type="number" step="any" value="${o.manual_value ?? 0}"></label>
          <label class="field">Du<input name="period_start" type="date" required value="${o.period_start || mStart}"></label>
          <label class="field">Au<input name="period_end" type="date" required value="${o.period_end || mEnd}"></label></div></div>`,
      onSave: async (v) => { await api(o.id ? `/objectives/${o.id}` : '/objectives', { method: o.id ? 'PUT' : 'POST', body: v }); toast('Objectif enregistré'); reload(); },
      onDelete: o.id ? async () => { await api(`/objectives/${o.id}`, { method: 'DELETE' }); toast('Objectif supprimé'); reload(); } : null,
      deleteLabel: 'Supprimer l’objectif',
    });
  };
  $('#add-obj')?.addEventListener('click', () => objDrawer());
  $$('[data-obj]', view).forEach((b) => b.addEventListener('click', () => objDrawer(objectives.find((o) => o.id === Number(b.dataset.obj)))));
};

// ================= WhatsApp =================
Views.whatsapp = async (view) => {
  const [{ notifications, inbound }, { whatsapp: cfg }] = await Promise.all([api('/notifications'), api('/settings')]);
  view.innerHTML = String(html`
    <div class="page-head"><h1>Rappels WhatsApp</h1><div class="actions"><a class="btn" href="#/reglages?onglet=whatsapp">Régler les rappels</a></div></div>
    ${cfg.dryRun ? html`<div class="alert warning" style="margin-bottom:16px"><strong>Mode test :</strong> les messages sont simulés et n'arrivent pas chez les clients.
      ${cfg.configured ? 'Désactivez le mode test dans Réglages › WhatsApp pour envoyer réellement.' : "Renseignez les identifiants de l'API WhatsApp Business (voir README) puis désactivez le mode test."}</div>`
      : html`<div class="alert ok" style="margin-bottom:16px">Envoi réel activé via l'API WhatsApp Business.</div>`}
    <div class="card"><h2>Messages</h2>
      ${notifications.length ? html`<div class="table-wrap"><table><thead><tr><th>Projet</th><th>Rappel</th><th>Envoi prévu</th><th>État</th><th>Téléphone</th><th></th></tr></thead><tbody>
        ${notifications.map((n) => html`<tr><td><a href="#/projets/${n.project_id}">${n.project_title}</a><div class="muted small">${n.client_name || ''} · pose ${fmtDateTime(n.install_ref)}</div></td>
          <td>${n.rule_label || '—'}</td><td class="small">${fmtDateTime(n.scheduled_at)}${n.sent_at ? html`<div class="muted">parti ${fmtDateTime(n.sent_at)}</div>` : ''}</td>
          <td>${badge(NOTIF, n.status)}${n.error ? html`<div class="small" style="color:var(--danger)">${n.error}</div>` : ''}</td>
          <td class="small">${n.client_phone || html`<span style="color:var(--danger)">manquant</span>`}</td>
          <td style="white-space:nowrap">${n.status === 'planifie' || n.status === 'erreur' ? html`<button class="btn small" data-send="${n.id}">Envoyer maintenant</button>` : ''}
            ${n.status === 'planifie' ? html`<button class="btn small ghost" data-cancel="${n.id}">Annuler</button>` : ''}</td></tr>`)}
      </tbody></table></div>` : html`<p class="empty">Aucun message. Les rappels sont créés dès qu'une pose est planifiée.</p>`}</div>
    <div class="card"><h2>Réponses des clients</h2>
      ${inbound.length ? html`<ul class="list">${inbound.map((m) => html`<li><span class="grow">« ${m.body} »</span>
        ${m.project_id ? html`<a href="#/projets/${m.project_id}">${m.project_title}</a>` : html`<span class="muted small">projet non identifié</span>`}
        <span class="muted small">${m.from_phone} · ${m.received_at}</span></li>`)}</ul>`
        : html`<p class="empty">Les réponses arrivent ici une fois le webhook configuré (voir README). « Je confirme » ou « Je souhaite décaler » mettent à jour le rendez-vous automatiquement.</p>`}</div>`);
  $$('[data-send]', view).forEach((b) => b.addEventListener('click', async () => {
    b.disabled = true;
    const r = await run(() => api(`/notifications/${b.dataset.send}/send`, { method: 'POST' }));
    if (r) toast(r.ok ? (r.simulated ? 'Message simulé (mode test)' : 'Message envoyé') : r.error, r.ok ? '' : 'error');
    Views.whatsapp(view);
  }));
  $$('[data-cancel]', view).forEach((b) => b.addEventListener('click', async () => { if (await run(() => api(`/notifications/${b.dataset.cancel}/cancel`, { method: 'POST' }), 'Message annulé')) Views.whatsapp(view); }));
};

// ================= Réglages =================
const ROLES = { admin: 'Administrateur', bureau: 'Bureau (devis, planning)', atelier: 'Atelier', poseur: 'Poseur' };
const WD = ['', 'L', 'M', 'M', 'J', 'V', 'S', 'D'];

Views.reglages = async (view, _p, query) => {
  const tab = query.onglet || 'general';
  const tabs = [['general', 'Général'], ['postes', 'Postes de commande'], ['equipe', 'Équipe et capacité'], ['fermetures', 'Congés et fermetures'], ['whatsapp', 'WhatsApp'], ['ecran', 'Écran atelier'], ['compte', 'Mon compte']];
  view.innerHTML = String(html`<div class="page-head"><h1>Réglages</h1></div>
    <div class="tabs" role="tablist">${tabs.map(([k, l]) => html`<button role="tab" class="${tab === k ? 'on' : ''}" aria-selected="${tab === k}" data-tab="${k}">${l}</button>`)}</div>
    <div id="tab"></div>`);
  $$('[data-tab]', view).forEach((b) => b.addEventListener('click', () => App.go(`#/reglages?onglet=${b.dataset.tab}`)));
  const box = $('#tab');
  const reload = () => Views.reglages(view, _p, query);
  const ro = !App.isAdmin();
  const roNote = ro ? html`<div class="alert info" style="margin-bottom:12px">Lecture seule : seul un administrateur peut modifier ces réglages.</div>` : '';

  if (tab === 'general') {
    const { settings: s } = await api('/settings');
    box.innerHTML = String(html`${roNote}<form class="card" id="f"><h2>Valeurs par défaut</h2><div class="form-grid">
      <label class="field span-2">Nom de l'entreprise <span class="hint">apparaît dans les messages WhatsApp</span><input name="company_name" value="${s.company_name}"></label>
      <label class="field">Taux horaire (€/h) <span class="hint">pour estimer les heures</span><input name="hourly_rate" type="number" step="any" value="${s.hourly_rate}"></label>
      <label class="field">Heures de pose par jour <span class="hint">pour estimer la durée</span><input name="pose_hours_per_day" type="number" step="any" value="${s.pose_hours_per_day}"></label>
      <label class="field">Marge livraisons <span class="hint">jours ouvrés entre réception et besoin</span><input name="buffer_days" type="number" min="0" value="${s.buffer_days}"></label>
      <label class="field">Marge avant pose <span class="hint">jours ouvrés entre fin de fabrication et pose</span><input name="fab_margin_days" type="number" min="0" value="${s.fab_margin_days}"></label>
      <label class="field">Heure de pose par défaut<input name="install_time" type="time" value="${s.install_time}"></label>
      <label class="field">Indicatif pays par défaut <span class="hint">33 = France</span><input name="default_country_code" value="${s.default_country_code}"></label>
      </div>
      <h2 style="margin-top:20px">Lecture des devis</h2>
      <p class="muted small" style="margin-top:-6px">Mots-clés séparés par « | » repérant les lignes de main-d'œuvre dans les PDF. Une ligne « pose » est comptée en temps de pose, une ligne « fabrication » en temps atelier.</p>
      <div class="stack"><label class="field">Main-d'œuvre atelier (fabrication)<textarea name="labor_fab_keywords">${s.labor_fab_keywords}</textarea></label>
      <label class="field">Main-d'œuvre pose<textarea name="labor_pose_keywords">${s.labor_pose_keywords}</textarea></label></div>
      ${ro ? '' : html`<button class="btn primary" type="submit" style="margin-top:12px">Enregistrer les réglages</button>`}</form>`);
    $('#f').addEventListener('submit', async (e) => { e.preventDefault(); if (await run(() => api('/settings', { method: 'PUT', body: formData(e.target) }), 'Réglages enregistrés')) { App.company = formData(e.target).company_name; } });
  }

  if (tab === 'postes') {
    const cats = await api('/categories');
    box.innerHTML = String(html`${roNote}<div class="card"><div class="row" style="margin-bottom:8px"><h2 style="margin:0">Postes de commande et délais par défaut</h2><span class="spacer"></span>
      ${ro ? '' : html`<button class="btn primary" id="add">${icon('plus')} Ajouter un poste</button>`}</div>
      <p class="muted small">Le délai est en jours calendaires (comme annoncé par les fournisseurs). « Nécessaire pour » indique si la marchandise doit être là pour lancer la fabrication ou seulement pour la pose.</p>
      <div class="table-wrap"><table><thead><tr><th>Poste</th><th>Délai</th><th>Nécessaire pour</th><th>Fournisseur habituel</th><th>Mots-clés (détection dans le devis)</th><th></th></tr></thead><tbody>
      ${cats.map((c) => html`<tr style="${c.active ? '' : 'opacity:.55'}"><td><strong>${c.name}</strong>${c.active ? '' : html` <span class="badge">désactivé</span>`}</td><td>${c.lead_days} j</td>
        <td>${c.needed_for === 'pose' ? 'Pose' : 'Fabrication'}</td><td>${c.supplier || '—'}</td><td class="small muted" style="max-width:320px">${c.keywords}</td>
        <td>${ro ? '' : html`<button class="btn small" data-edit="${c.id}">Modifier</button>`}</td></tr>`)}</tbody></table></div></div>`);
    const edit = (c = { lead_days: 7, needed_for: 'fabrication', active: 1 }) => drawer({
      title: c.id ? `Poste : ${c.name}` : 'Nouveau poste de commande',
      body: html`<div class="stack"><label class="field">Nom<input name="name" required value="${c.name || ''}"></label>
        <div class="form-grid"><label class="field">Délai de livraison (jours)<input name="lead_days" type="number" min="0" value="${c.lead_days}"></label>
        <label class="field">Nécessaire pour<select name="needed_for"><option value="fabrication" ${c.needed_for !== 'pose' ? 'selected' : ''}>Fabrication</option><option value="pose" ${c.needed_for === 'pose' ? 'selected' : ''}>Pose</option></select></label></div>
        <label class="field">Fournisseur habituel<input name="supplier" value="${c.supplier || ''}"></label>
        <label class="field">Mots-clés <span class="hint">séparés par « | », pour cocher ce poste automatiquement à l'import d'un devis</span><textarea name="keywords">${c.keywords || ''}</textarea></label>
        <label class="check"><input type="checkbox" name="active" ${c.active ? 'checked' : ''}> Poste actif</label></div>`,
      onSave: async (v) => { if (!v.name) throw new Error('Le nom est requis'); await api(c.id ? `/categories/${c.id}` : '/categories', { method: c.id ? 'PUT' : 'POST', body: v }); toast('Poste enregistré'); reload(); },
      onDelete: c.id ? async () => { await api(`/categories/${c.id}`, { method: 'DELETE' }); toast('Poste supprimé'); reload(); } : null,
      deleteLabel: 'Supprimer le poste',
    });
    $('#add')?.addEventListener('click', () => edit());
    $$('[data-edit]', box).forEach((b) => b.addEventListener('click', () => edit(cats.find((c) => c.id === Number(b.dataset.edit)))));
  }

  if (tab === 'equipe') {
    const users = await api('/users');
    const cap = users.filter((u) => u.active && u.workshop).reduce((s, u) => s + u.hours_per_day * u.workdays.split(',').length, 0);
    box.innerHTML = String(html`${roNote}<div class="card"><div class="row" style="margin-bottom:8px"><h2 style="margin:0">Équipe</h2><span class="spacer"></span>
      ${ro ? '' : html`<button class="btn primary" id="add">${icon('plus')} Ajouter une personne</button>`}</div>
      <p class="muted small">Capacité atelier : <strong>${hours(cap)} par semaine</strong>. Seules les personnes « compte dans la capacité atelier » sont utilisées pour placer la fabrication.</p>
      <div class="table-wrap"><table><thead><tr><th>Nom</th><th>Rôle</th><th>Atelier</th><th>Heures/jour</th><th>Jours travaillés</th><th></th></tr></thead><tbody>
      ${users.map((u) => html`<tr style="${u.active ? '' : 'opacity:.55'}"><td><strong>${u.name}</strong><div class="muted small">${u.email}</div></td><td>${ROLES[u.role]}</td>
        <td>${u.workshop ? html`<span class="badge ok">oui</span>` : html`<span class="badge">non</span>`}</td><td>${hours(u.hours_per_day)}</td>
        <td class="num">${u.workdays.split(',').map((d) => WD[d]).join(' ')}</td><td>${ro ? '' : html`<button class="btn small" data-edit="${u.id}">Modifier</button>`}</td></tr>`)}
      </tbody></table></div></div>`);
    const edit = (u = { role: 'atelier', workshop: 1, hours_per_day: 7, workdays: '1,2,3,4,5', active: 1 }) => {
      const days = new Set(u.workdays.split(','));
      drawer({
        title: u.id ? u.name : 'Nouvelle personne',
        body: html`<div class="stack"><label class="field">Nom<input name="name" required value="${u.name || ''}"></label>
          <label class="field">E-mail (identifiant)<input name="email" type="email" required value="${u.email || ''}"></label>
          <label class="field">${u.id ? 'Nouveau mot de passe' : 'Mot de passe'} <span class="hint">${u.id ? 'laisser vide pour ne pas changer' : '8 caractères minimum'}</span><input name="password" type="password" autocomplete="new-password" ${u.id ? '' : 'required'}></label>
          <label class="field">Rôle<select name="role">${Object.entries(ROLES).map(([k, l]) => html`<option value="${k}" ${u.role === k ? 'selected' : ''}>${l}</option>`)}</select>
            <span class="hint">Atelier et poseur : consultation et suivi des commandes. Bureau : devis et planning. Administrateur : tout, y compris les réglages.</span></label>
          <label class="check"><input type="checkbox" name="workshop" ${u.workshop ? 'checked' : ''}> Compte dans la capacité atelier</label>
          <div class="form-grid"><label class="field">Heures par jour<input name="hours_per_day" type="number" step="any" min="0" value="${u.hours_per_day}"></label></div>
          <fieldset style="border:0;padding:0;margin:0"><legend class="small" style="font-weight:550;margin-bottom:4px">Jours travaillés</legend><div class="row">
            ${['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((l, i) => html`<label class="check"><input type="checkbox" name="wd" data-group="1" value="${i + 1}" ${days.has(String(i + 1)) ? 'checked' : ''}>${l}</label>`)}</div></fieldset>
          ${u.id ? html`<label class="check"><input type="checkbox" name="active" ${u.active ? 'checked' : ''}> Compte actif</label>` : ''}</div>`,
        onSave: async (v) => {
          const body = { ...v, workdays: (v.wd || []).join(','), active: u.id ? v.active : true };
          await api(u.id ? `/users/${u.id}` : '/users', { method: u.id ? 'PUT' : 'POST', body });
          toast('Personne enregistrée');
          reload();
        },
        onDelete: u.id && u.id !== App.user.id ? async () => { await api(`/users/${u.id}`, { method: 'DELETE' }); toast('Compte supprimé'); reload(); } : null,
        deleteLabel: 'Supprimer le compte',
      });
    };
    $('#add')?.addEventListener('click', () => edit());
    $$('[data-edit]', box).forEach((b) => b.addEventListener('click', () => edit(users.find((u) => u.id === Number(b.dataset.edit)))));
  }

  if (tab === 'fermetures') {
    const [closures, users] = await Promise.all([api('/closures'), api('/users')]);
    box.innerHTML = String(html`<div class="card"><h2>Congés et fermetures</h2>
      <p class="muted small">Les jours fériés français sont pris en compte automatiquement. Ajoutez ici les fermetures de l'atelier et les congés de chacun : la capacité est réduite d'autant.</p>
      <form class="row" id="f" style="margin-bottom:12px">
        <label class="field" style="flex:1;min-width:130px">Du<input name="start_date" type="date" required></label>
        <label class="field" style="flex:1;min-width:130px">Au<input name="end_date" type="date" required></label>
        <label class="field" style="flex:2;min-width:160px">Qui<select name="user_id"><option value="">Tout l'atelier (fermeture)</option>${users.filter((u) => u.workshop).map((u) => html`<option value="${u.id}">${u.name}</option>`)}</select></label>
        <label class="field" style="flex:2;min-width:160px">Motif<input name="label" placeholder="ex. Congés d'été"></label>
        <button class="btn primary" type="submit" style="align-self:flex-end">Ajouter</button></form>
      ${closures.length ? html`<ul class="list">${closures.map((c) => html`<li><span class="grow"><strong>${fmtDate(c.start_date)} → ${fmtDate(c.end_date)}</strong> · ${c.user_name || 'Tout l’atelier'} ${c.label ? `· ${c.label}` : ''}</span>
        <button class="btn small ghost icon" data-del="${c.id}" aria-label="Supprimer" title="Supprimer">${icon('trash')}</button></li>`)}</ul>` : html`<p class="empty">Aucune fermeture enregistrée.</p>`}
      <p class="small muted">Les plannings déjà calculés ne bougent pas tout seuls : recalculez les projets concernés depuis leur fiche.</p></div>`);
    $('#f').addEventListener('submit', async (e) => { e.preventDefault(); if (await run(() => api('/closures', { method: 'POST', body: formData(e.target) }), 'Fermeture ajoutée')) reload(); });
    $$('[data-del]', box).forEach((b) => b.addEventListener('click', async () => { if (await run(() => api(`/closures/${b.dataset.del}`, { method: 'DELETE' }))) reload(); }));
  }

  if (tab === 'whatsapp') {
    const [{ settings: s, whatsapp: cfg }, rules] = await Promise.all([api('/settings'), api('/rules')]);
    box.innerHTML = String(html`${roNote}<div class="grid grid-2" style="align-items:start">
      <form class="card" id="f"><h2>Envoi</h2>
        <dl class="kv" style="margin-bottom:12px"><dt>API WhatsApp</dt><dd>${cfg.configured ? html`<span class="badge ok">identifiants présents</span>` : html`<span class="badge warning">non configurée</span>`}</dd>
          <dt>Webhook (réponses)</dt><dd>${cfg.webhookVerifyConfigured ? html`<span class="badge ok">jeton présent</span>` : html`<span class="badge">non configuré</span>`}</dd>
          <dt>Signature Meta</dt><dd>${cfg.signatureCheck ? html`<span class="badge ok">vérifiée</span>` : html`<span class="badge warning">non vérifiée</span>`}</dd></dl>
        <label class="check"><input type="checkbox" id="dry" ${s.wa_dry_run !== '0' ? 'checked' : ''}> Mode test : simuler les envois sans rien envoyer aux clients</label>
        <div class="form-grid" style="margin-top:12px">
          <label class="field">Envois autorisés à partir de<input name="wa_send_window_start" type="time" value="${s.wa_send_window_start}"></label>
          <label class="field">et jusqu'à<input name="wa_send_window_end" type="time" value="${s.wa_send_window_end}"></label>
          <label class="field">Version de l'API<input name="wa_api_version" value="${s.wa_api_version}"></label></div>
        <p class="small muted">Si l'heure calculée tombe hors de cette plage, le message part plus tôt (la veille au soir) plutôt que la nuit.</p>
        <p class="small muted">Les identifiants (jeton, ID du numéro) ne sont pas saisis ici : ils se mettent dans le fichier <code class="k">.env</code> du serveur, voir le README.</p>
        ${ro ? '' : html`<button class="btn primary" type="submit">Enregistrer</button>`}</form>
      <div class="card"><div class="row" style="margin-bottom:8px"><h2 style="margin:0">Rappels avant la pose</h2><span class="spacer"></span>
        ${ro ? '' : html`<button class="btn" id="add">${icon('plus')} Ajouter un rappel</button>`}</div>
        <ul class="list">${rules.map((r) => html`<li style="${r.active ? '' : 'opacity:.55'}"><span class="grow"><strong>${r.label}</strong> · ${r.offset_hours >= 24 && r.offset_hours % 24 === 0 ? `${r.offset_hours / 24} j` : `${r.offset_hours} h`} avant
          <div class="muted small">modèle Meta : <code class="k">${r.template_name}</code> (${r.template_lang})</div></span>${r.active ? '' : html`<span class="badge">désactivé</span>`}
          ${ro ? '' : html`<button class="btn small" data-edit="${r.id}">Modifier</button>`}</li>`)}</ul>
        <details style="margin-top:12px"><summary class="small">Texte du modèle à faire valider par Meta</summary>
          <p class="small">Créez un modèle par rappel (catégorie « Utilitaire », langue français) dans le gestionnaire WhatsApp, avec 4 variables :</p>
          <pre class="small" style="white-space:pre-wrap;background:var(--surface-2);padding:10px;border-radius:6px;border:1px solid var(--border)">Bonjour {{1}}, nous vous rappelons l'installation prévue le {{2}} à {{3}} par {{4}}. Merci de confirmer votre disponibilité.</pre>
          <p class="small">Ajoutez deux boutons de réponse rapide : « Je confirme » et « Je souhaite décaler ». La réponse du client met à jour le rendez-vous automatiquement.</p></details>
      </div></div>`);
    $('#f').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (await run(() => api('/settings', { method: 'PUT', body: { ...formData(e.target), wa_dry_run: $('#dry').checked ? '1' : '0' } }), 'Réglages WhatsApp enregistrés')) reload();
    });
    const edit = (r = { offset_hours: 24, template_lang: 'fr', active: 1 }) => drawer({
      title: r.id ? r.label : 'Nouveau rappel',
      body: html`<div class="stack"><label class="field">Libellé<input name="label" required value="${r.label || ''}" placeholder="ex. Rappel J-3"></label>
        <div class="form-grid"><label class="field">Heures avant la pose <span class="hint">168 = 7 jours</span><input name="offset_hours" type="number" min="1" required value="${r.offset_hours}"></label>
        <label class="field">Langue du modèle<input name="template_lang" value="${r.template_lang}"></label></div>
        <label class="field">Nom du modèle Meta<input name="template_name" required value="${r.template_name || ''}" placeholder="ex. rappel_pose_j3"></label>
        <label class="check"><input type="checkbox" name="active" ${r.active ? 'checked' : ''}> Rappel actif</label></div>`,
      onSave: async (v) => { await api(r.id ? `/rules/${r.id}` : '/rules', { method: r.id ? 'PUT' : 'POST', body: v }); toast('Rappel enregistré'); reload(); },
      onDelete: r.id ? async () => { await api(`/rules/${r.id}`, { method: 'DELETE' }); toast('Rappel supprimé'); reload(); } : null,
      deleteLabel: 'Supprimer le rappel',
    });
    $('#add')?.addEventListener('click', () => edit());
    $$('[data-edit]', box).forEach((b) => b.addEventListener('click', () => edit(rules.find((x) => x.id === Number(b.dataset.edit)))));
  }

  if (tab === 'ecran') {
    const { settings: s } = await api('/settings');
    const url = `${location.origin}/atelier?cle=${s.display_token}`;
    box.innerHTML = String(html`<div class="card"><h2>Écran atelier</h2>
      <p>Page plein écran à afficher sur une TV ou une tablette dans l'atelier : fabrication du jour et de la semaine, poses, livraisons attendues, commandes en retard. Elle se met à jour toute seule chaque minute et ne demande pas de connexion.</p>
      <label class="field">Adresse à ouvrir sur l'écran<input readonly value="${url}" id="url"></label>
      <div class="row" style="margin-top:12px"><button class="btn primary" id="copy">Copier l'adresse</button><a class="btn" href="${url}" target="_blank" rel="noopener">Ouvrir l'écran</a>
        ${ro ? '' : html`<button class="btn danger" id="regen">Changer la clé</button>`}</div>
      <p class="small muted" style="margin-top:12px">Gardez cette adresse dans l'atelier : toute personne qui la connaît voit le planning (sans pouvoir rien modifier). « Changer la clé » invalide l'ancienne adresse.</p></div>`);
    $('#copy').addEventListener('click', async () => { try { await navigator.clipboard.writeText(url); toast('Adresse copiée'); } catch { $('#url').select(); } });
    $('#regen')?.addEventListener('click', async () => {
      if (await confirmAction("L'écran actuel de l'atelier cessera de fonctionner jusqu'à ce que vous y ouvriez la nouvelle adresse.", 'Changer la clé')) {
        if (await run(() => api('/settings/display-token', { method: 'POST' }), 'Nouvelle clé générée')) reload();
      }
    });
  }

  if (tab === 'compte') {
    box.innerHTML = String(html`<form class="card" id="f" style="max-width:420px"><h2>Changer mon mot de passe</h2><div class="stack">
      <label class="field">Mot de passe actuel<input name="current" type="password" required autocomplete="current-password"></label>
      <label class="field">Nouveau mot de passe <span class="hint">8 caractères minimum</span><input name="password" type="password" minlength="8" required autocomplete="new-password"></label>
      <button class="btn primary" type="submit">Changer le mot de passe</button></div></form>`);
    $('#f').addEventListener('submit', async (e) => { e.preventDefault(); if (await run(() => api('/me/password', { method: 'PUT', body: formData(e.target) }), 'Mot de passe changé')) e.target.reset(); });
  }
};
