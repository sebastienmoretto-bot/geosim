/* Tableau de bord, import de devis, liste et fiche projet */
'use strict';

// ================= Tableau de bord =================
Views.dashboard = async (view) => {
  const d = await api('/dashboard');
  const projLink = (id, title) => html`<a href="#/projets/${id}">${title}</a>`;
  const orderLi = (o, late) => html`<li><span class="grow">${o.label} <span class="muted small">· ${projLink(o.project_id, o.project_title)}</span></span>
    <span class="badge ${late ? 'danger' : 'warning'}">${late ? 'retard · ' : ''}avant le ${fmtDate(o.order_by)}</span>
    <button class="btn small" data-order="${o.id}" data-status="commande">Marquer commandé</button></li>`;
  const maxLoad = Math.max(1, ...d.load.map((l) => Math.max(l.capacity, l.used)));

  view.innerHTML = String(html`
    <div class="page-head"><div><h1>Tableau de bord</h1><div class="muted">${fmtDate(d.today, { long: true })}</div></div>
      <div class="actions">${App.canEdit() ? html`<a class="btn primary" href="#/import">${icon('upload')} Importer un devis validé</a>` : ''}</div></div>

    <div class="grid grid-4">
      <div class="card stat ${d.orders_late.length ? 'danger' : ''}"><span class="value">${d.orders_late.length}</span><span class="label">Commandes en retard</span></div>
      <div class="card stat ${d.orders_soon.length ? 'warning' : ''}"><span class="value">${d.orders_soon.length}</span><span class="label">À commander sous 7 jours</span></div>
      <div class="card stat"><span class="value">${d.deliveries.length}</span><span class="label">Livraisons attendues sous 7 jours</span></div>
      <div class="card stat"><span class="value">${d.installs.length}</span><span class="label">Poses dans les 3 semaines</span></div>
    </div>

    ${d.warnings.length ? html`<div class="card" style="margin-top:16px"><h2>Alertes planning</h2>
      ${d.warnings.map((p) => p.warnings.filter((w) => w.level !== 'info').map((w) => html`<div class="alert ${w.level}"><strong>${projLink(p.id, p.title)}</strong> — ${w.text}</div>`))}</div>` : ''}

    ${d.to_plan.length ? html`<div class="card" style="margin-top:16px"><h2>Projets à planifier</h2><ul class="list">
      ${d.to_plan.map((p) => html`<li><span class="grow">${projLink(p.id, p.title)} <span class="muted small">${p.client_name || ''}</span></span>
        <a class="btn small" href="#/projets/${p.id}">Planifier</a></li>`)}</ul></div>` : ''}

    <div class="grid grid-2" style="margin-top:16px">
      <div class="card"><h2>Commandes à passer</h2>
        ${d.orders_late.length + d.orders_soon.length === 0 ? html`<p class="empty">Rien à commander cette semaine.</p>` : ''}
        <ul class="list">${d.orders_late.map((o) => orderLi(o, true))}${d.orders_soon.map((o) => orderLi(o, false))}</ul>
        <a class="small" href="#/commandes">Toutes les commandes →</a></div>

      <div class="card"><h2>Prochaines poses</h2>
        ${d.installs.length ? html`<ul class="list">${d.installs.map((p) => html`<li><span class="grow">${projLink(p.id, p.title)}
          <span class="muted small">${p.client_name || ''}</span></span>
          ${badge(CONFIRM, p.install_confirmed)}
          <span class="badge info">${fmtDate(p.install_date)} ${(p.install_time || '').replace(':', 'h')}${p.install_days > 1 ? ` · ${p.install_days} j` : ''}</span></li>`)}</ul>`
          : html`<p class="empty">Aucune pose prévue dans les 3 semaines.</p>`}</div>

      <div class="card"><h2>Fabrication cette semaine</h2>
        ${d.fabrication.length ? html`<ul class="list">${d.fabrication.map((f) => html`<li><span class="grow">${projLink(f.id, f.title)}
          <span class="muted small">${f.client_name || ''}</span></span><span class="muted small">${fmtDate(f.first_day)} → ${fmtDate(f.last_day)}</span>
          <span class="badge accent">${hours(f.hours)}</span></li>`)}</ul>` : html`<p class="empty">Pas de fabrication planifiée cette semaine.</p>`}
        <h3 style="margin-top:16px">Charge atelier (10 prochains jours)</h3>
        <div class="load-bars">${d.load.map((l) => html`<div class="load-bar" title="${fmtDate(l.day)} : ${hours(l.used)} sur ${hours(l.capacity)}">
          <div class="b ${l.used > l.capacity ? 'over' : ''}"><span style="height:${Math.round(Math.min(1, l.used / maxLoad) * 100)}%"></span></div>
          <span>${fmtDate(l.day).slice(0, 7)}</span></div>`)}</div></div>

      <div class="card"><h2>Livraisons attendues</h2>
        ${d.deliveries.length ? html`<ul class="list">${d.deliveries.map((o) => html`<li><span class="grow">${o.label}
          <span class="muted small">· ${projLink(o.project_id, o.project_title)}</span></span>
          <span class="badge ${o.expected_at < d.today ? 'danger' : 'info'}">${o.expected_at < d.today ? 'en retard · ' : ''}${fmtDate(o.expected_at)}</span>
          <button class="btn small" data-order="${o.id}" data-status="recu">Marquer reçu</button></li>`)}</ul>` : html`<p class="empty">Aucune livraison attendue.</p>`}</div>

      <div class="card"><h2>Tâches et rappels</h2>
        ${d.tasks.length ? html`<ul class="list">${d.tasks.map((t) => html`<li><label class="check grow"><input type="checkbox" data-task="${t.id}"> ${t.title}
          ${t.project_title ? html`<span class="muted small">· ${projLink(t.project_id, t.project_title)}</span>` : ''}</label>
          ${t.due_date ? html`<span class="badge ${t.due_date < d.today ? 'danger' : ''}">${fmtDate(t.due_date)}</span>` : ''}</li>`)}</ul>`
          : html`<p class="empty">Aucune tâche à échéance.</p>`}
        <a class="small" href="#/taches">Gérer les tâches →</a></div>

      <div class="card"><h2>Objectifs en cours</h2>
        ${d.objectives.length ? d.objectives.map(objectiveBlock) : html`<p class="empty">Aucun objectif sur la période. <a href="#/taches">Définir un objectif</a></p>`}</div>

      ${App.canEdit() ? html`<div class="card"><h2>Messages WhatsApp (3 prochains jours)</h2>
        ${d.notifications.length ? html`<ul class="list">${d.notifications.map((n) => html`<li><span class="grow">${n.rule_label || 'Rappel'} · ${projLink(n.project_id, n.project_title)}</span>
          ${badge(NOTIF, n.status)}<span class="muted small">${fmtDateTime(n.scheduled_at)}</span>
          ${n.error ? html`<span class="small" style="color:var(--danger);flex-basis:100%">${n.error}</span>` : ''}</li>`)}</ul>`
          : html`<p class="empty">Aucun message prévu.</p>`}</div>` : ''}
    </div>`);

  $$('[data-order]', view).forEach((b) => b.addEventListener('click', async () => {
    b.disabled = true;
    if (await run(() => api(`/orders/${b.dataset.order}`, { method: 'PUT', body: { status: b.dataset.status } }), 'Commande mise à jour')) Views.dashboard(view);
    else b.disabled = false;
  }));
  $$('[data-task]', view).forEach((c) => c.addEventListener('change', async () => {
    if (await run(() => api(`/tasks/${c.dataset.task}`, { method: 'PUT', body: { done: c.checked } }), 'Tâche terminée')) Views.dashboard(view);
  }));
};

function objectiveBlock(o) {
  const unit = ['ca_signe', 'mo_signee'].includes(o.metric) ? money : o.metric === 'heures_planifiees' ? hours : (n) => Number(n).toLocaleString('fr-FR');
  return html`<div style="margin-bottom:12px"><div class="row"><strong class="grow">${o.title}</strong>
    <span class="small num">${unit(o.value)} / ${unit(o.target)}</span></div>
    <div class="progress" role="progressbar" aria-valuenow="${Math.round(o.progress * 100)}" aria-valuemin="0" aria-valuemax="100"><span style="width:${Math.round(o.progress * 100)}%"></span></div>
    <div class="muted small">${fmtDate(o.period_start, { weekday: false })} → ${fmtDate(o.period_end, { weekday: false })} · ${Math.round(o.progress * 100)} %</div></div>`;
}

// ================= Import d'un devis =================
Views.import = async (view) => {
  const [cats, { settings }] = await Promise.all([api('/categories'), api('/settings')]);
  const active = cats.filter((c) => c.active);
  view.innerHTML = String(html`
    <div class="page-head"><div><h1>Nouveau devis validé</h1>
      <div class="muted">Déposez le PDF : les montants de main-d'œuvre et les heures sont repérés automatiquement, vous ajustez avant de planifier.</div></div></div>
    <div class="card" id="drop-card">
      <label class="dropzone" id="dropzone"><input type="file" accept="application/pdf,.pdf" id="file" hidden>
        <strong>Déposez le devis PDF ici</strong><span class="muted">ou cliquez pour choisir un fichier</span></label>
      <div class="row" style="margin-top:12px"><span class="muted small">Pas de PDF ?</span>
        <button class="btn small" id="manual">Saisir le projet à la main</button></div>
    </div>
    <div id="form-zone"></div>`);

  const dz = $('#dropzone');
  const fileInput = $('#file');
  const handle = async (file) => {
    if (!file) return;
    dz.innerHTML = String(html`<strong>Lecture de « ${file.name} »…</strong><span class="muted">Extraction du texte et des montants</span>`);
    const fd = new FormData();
    fd.append('file', file);
    const parsed = await run(() => api('/quotes/parse', { method: 'POST', form: fd }));
    if (!parsed) { Views.import(view); return; }
    $('#drop-card').hidden = true;
    renderQuoteForm($('#form-zone'), parsed, active, settings);
  };
  fileInput.addEventListener('change', () => handle(fileInput.files[0]));
  dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('drag'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
  dz.addEventListener('drop', (e) => { e.preventDefault(); dz.classList.remove('drag'); handle(e.dataTransfer.files[0]); });
  $('#manual').addEventListener('click', () => { $('#drop-card').hidden = true; renderQuoteForm($('#form-zone'), { manual: true, suggested_categories: [] }, active, settings); });
};

function renderQuoteForm(zone, q, cats, settings) {
  const rate = Number(settings.hourly_rate) || 45;
  const poseHPerDay = Number(settings.pose_hours_per_day) || 8;
  const suggested = new Set((q.suggested_categories || []).map((c) => c.id));
  const c = q.existing_client;
  const installDays = Math.max(1, Math.ceil((q.pose_hours || 0) / poseHPerDay));

  zone.innerHTML = String(html`<form id="qform" class="grid" style="grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);align-items:start">
    <div class="stack" style="min-width:0">
      ${q.manual ? '' : html`<div class="alert ${q.text_empty ? 'warning' : 'info'}">
        ${q.text_empty ? "Ce PDF ne contient pas de texte (probablement un scan) : saisissez les valeurs à la main."
          : html`Devis « ${q.original_name} » analysé. Vérifiez les valeurs proposées, en particulier les heures. <a href="/api/quotes/${q.quote_file}" target="_blank" rel="noopener">Ouvrir le PDF</a>`}</div>`}
      <div class="card"><h2>Client</h2>
        ${c ? html`<div class="alert ok" style="margin-bottom:12px">Client déjà connu : <strong>${c.name}</strong>. Le projet lui sera rattaché.
          <input type="hidden" name="client_id" value="${c.id}"></div>` : ''}
        <div class="form-grid">
          <label class="field span-2">Nom du client<input name="client_name" required value="${c?.name || q.client_name || ''}"></label>
          <label class="field">Téléphone (WhatsApp)<input name="client_phone" type="tel" value="${c?.phone || q.client_phone || ''}" placeholder="06 12 34 56 78"></label>
          <label class="field">E-mail<input name="client_email" type="email" value="${c?.email || q.client_email || ''}"></label>
          <label class="field span-all">Adresse du chantier<input name="client_address" value="${c?.address || q.client_address || ''}"></label>
        </div></div>

      <div class="card"><h2>Devis</h2><div class="form-grid">
        <label class="field span-2">Intitulé du projet<input name="title" required value="${q.client_name ? `Cuisine ${q.client_name}` : ''}" placeholder="ex. Cuisine Martin"></label>
        <label class="field">N° de devis<input name="quote_number" value="${q.quote_number || ''}"></label>
        <label class="field">Date du devis<input name="quote_date" type="date" value="${q.quote_date || ''}"></label>
        <label class="field">Validé le<input name="validated_at" type="date" value="${today()}"></label>
        <label class="field">Total HT (€)<input name="total_ht" type="number" step="any" value="${q.total_ht ?? ''}"></label>
      </div></div>

      <div class="card"><h2>Main-d'œuvre et temps</h2>
        <div class="form-grid">
          <label class="field">Main-d'œuvre fabrication (€)<input name="labor_amount" type="number" step="any" value="${q.labor_amount || ''}"></label>
          <label class="field">Taux horaire (€/h)<input name="hourly_rate" type="number" step="any" value="${rate}"></label>
          <label class="field">Heures atelier retenues <span class="hint" id="fab-est"></span>
            <input name="fab_hours" type="number" step="any" min="0" required value="${q.fab_hours || ''}"></label>
          <label class="field">Main-d'œuvre pose (€)<input name="pose_amount" type="number" step="any" value="${q.pose_amount || ''}"></label>
          <label class="field">Heures de pose <span class="hint" id="pose-est"></span>
            <input name="pose_hours" type="number" step="any" min="0" value="${q.pose_hours || ''}"></label>
          <label class="field">Durée de pose (jours)<input name="install_days" type="number" min="1" value="${installDays}"></label>
        </div>
        <input type="hidden" name="fab_hours_estimated" value="${q.fab_hours || ''}">
        <input type="hidden" name="pose_hours_estimated" value="${q.pose_hours || ''}">
        ${(q.labor_lines || []).length ? html`<details style="margin-top:12px"><summary class="small">Lignes repérées dans le devis (${q.labor_lines.length})</summary>
          <ul class="list small">${q.labor_lines.map((l) => html`<li><span class="badge ${l.kind === 'pose' ? 'info' : 'accent'}">${l.kind}</span>
          <span class="grow">${l.text}</span>${l.hours ? html`<span>${hours(l.hours)}</span>` : ''}<span class="num">${money(l.amount)}</span></li>`)}</ul></details>`
          : q.manual ? '' : html`<p class="small muted" style="margin-top:12px">Aucune ligne de main-d'œuvre trouvée automatiquement. Les mots-clés se règlent dans Réglages › Général.</p>`}
      </div>

      <div class="card"><h2>Commandes à prévoir</h2>
        <p class="muted small" style="margin-top:-6px">Cochées automatiquement d'après le devis. Le délai est pré-rempli avec la valeur par défaut du poste, modifiable pour ce projet.</p>
        <div class="table-wrap"><table><thead><tr><th></th><th>Poste</th><th>Nécessaire pour</th><th>Délai (jours)</th></tr></thead><tbody>
        ${cats.map((cat) => html`<tr><td><input type="checkbox" name="cat_${cat.id}" ${suggested.has(cat.id) ? 'checked' : ''} aria-label="Commander ${cat.name}"></td>
          <td>${cat.name}${suggested.has(cat.id) ? html` <span class="badge accent" title="${(q.suggested_categories.find((s) => s.id === cat.id) || {}).match || ''}">détecté</span>` : ''}</td>
          <td><select name="need_${cat.id}"><option value="fabrication" ${cat.needed_for !== 'pose' ? 'selected' : ''}>Fabrication</option><option value="pose" ${cat.needed_for === 'pose' ? 'selected' : ''}>Pose</option></select></td>
          <td style="width:110px"><input name="lead_${cat.id}" type="number" min="0" value="${cat.lead_days}"></td></tr>`)}
        </tbody></table></div></div>
    </div>

    <div class="stack" style="position:sticky;top:16px;min-width:0">
      <div class="card"><h2>Planification</h2>
        <div class="segmented" role="radiogroup" aria-label="Mode de calcul" style="margin-bottom:12px">
          <button type="button" class="on" data-mode="asap">Au plus tôt</button><button type="button" data-mode="backward">Date de pose fixée</button></div>
        <input type="hidden" name="planning_mode" value="asap">
        <div class="form-grid">
          <label class="field" id="install-date-field" hidden>Date de pose<input name="install_date" type="date"></label>
          <label class="field">Heure d'arrivée<input name="install_time" type="time" value="${settings.install_time || '08:00'}"></label>
          <label class="field">Marge livraisons <span class="hint">jours ouvrés</span><input name="buffer_days" type="number" min="0" value="${settings.buffer_days}"></label>
          <label class="field">Marge avant pose <span class="hint">jours ouvrés</span><input name="fab_margin_days" type="number" min="0" value="${settings.fab_margin_days}"></label>
        </div>
        <div id="preview" style="margin-top:16px"></div>
      </div>
      <label class="field">Notes internes<textarea name="notes"></textarea></label>
      <button class="btn primary" type="submit" style="width:100%">Créer le projet et l'ajouter au planning</button>
    </div>
  </form>`);

  const form = $('#qform');
  if (window.matchMedia('(max-width: 1000px)').matches) form.style.gridTemplateColumns = '1fr';

  const orderList = () => cats.filter((cat) => form[`cat_${cat.id}`].checked).map((cat) => ({
    category_id: cat.id, label: cat.name, lead_days: Number(form[`lead_${cat.id}`].value || cat.lead_days), needed_for: form[`need_${cat.id}`].value,
  }));
  const updateEstimates = () => {
    const r = Number(form.hourly_rate.value) || 0;
    const fe = r ? Number(form.labor_amount.value || 0) / r : 0;
    const pe = r ? Number(form.pose_amount.value || 0) / r : 0;
    $('#fab-est').textContent = fe ? `estimé ${hours(fe)}` : '';
    $('#pose-est').textContent = pe ? `estimé ${hours(pe)}` : '';
  };
  const preview = debounce(async () => {
    const v = formData(form);
    const box = $('#preview');
    if (v.planning_mode === 'backward' && !v.install_date) { box.innerHTML = String(html`<p class="muted small">Choisissez la date de pose convenue avec le client.</p>`); return; }
    try {
      const r = await api('/plan-preview', { method: 'POST', body: { ...v, orders: orderList() } });
      box.innerHTML = String(planSummary(r));
    } catch (e) { box.innerHTML = String(html`<div class="alert danger">${e.message}</div>`); }
  }, 350);

  $$('[data-mode]', form).forEach((b) => b.addEventListener('click', () => {
    $$('[data-mode]', form).forEach((x) => x.classList.toggle('on', x === b));
    form.planning_mode.value = b.dataset.mode;
    $('#install-date-field').hidden = b.dataset.mode !== 'backward';
    form.install_date.required = b.dataset.mode === 'backward';
    preview();
  }));
  form.addEventListener('input', (e) => {
    if (['labor_amount', 'hourly_rate', 'pose_amount'].includes(e.target.name)) updateEstimates();
    if (e.target.name === 'pose_hours') form.install_days.value = Math.max(1, Math.ceil(Number(e.target.value || 0) / poseHPerDay));
    preview();
  });
  form.addEventListener('change', preview);
  updateEstimates();
  preview();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = formData(form);
    const body = {
      client: { id: v.client_id || undefined, name: v.client_name, phone: v.client_phone, email: v.client_email, address: v.client_address },
      title: v.title, quote_number: v.quote_number, quote_date: v.quote_date, validated_at: v.validated_at, total_ht: v.total_ht,
      labor_amount: v.labor_amount, pose_amount: v.pose_amount, hourly_rate: v.hourly_rate,
      fab_hours_estimated: v.fab_hours_estimated, fab_hours: v.fab_hours, pose_hours_estimated: v.pose_hours_estimated, pose_hours: v.pose_hours,
      install_days: v.install_days, planning_mode: v.planning_mode, install_date: v.planning_mode === 'backward' ? v.install_date : null,
      install_time: v.install_time, buffer_days: v.buffer_days, fab_margin_days: v.fab_margin_days, notes: v.notes,
      quote_file: q.quote_file || null, orders: orderList(),
    };
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    const r = await run(() => api('/projects', { method: 'POST', body }), 'Projet créé et planifié');
    btn.disabled = false;
    if (r) App.go(`#/projets/${r.id}`);
  });
}

// Résumé d'un calcul de planning (aperçu ou fiche projet)
function planSummary(r) {
  const fabH = r.allocations.reduce((s, a) => s + a.hours, 0);
  const firstOrder = (r.orders || []).filter((o) => o.order_by && !o.ordered_at && !o.received_at).map((o) => o.order_by).sort()[0];
  return html`
    <dl class="kv">
      ${firstOrder ? html`<dt>1ʳᵉ commande</dt><dd>${fmtDate(firstOrder)} <span class="muted small">${relDay(firstOrder)}</span></dd>` : ''}
      <dt>Fabrication</dt><dd>${r.fabStart ? html`${fmtDate(r.fabStart)} → ${fmtDate(r.fabEnd)} <span class="muted small">(${hours(fabH)}, ${r.allocations.length} j)</span>` : '—'}</dd>
      <dt>Pose</dt><dd><strong>${fmtDate(r.installDate, { long: true })}</strong>${r.installEnd && r.installEnd !== r.installDate ? html` → ${fmtDate(r.installEnd)}` : ''}</dd>
    </dl>
    ${(r.orders || []).length ? html`<table style="margin-top:12px" class="small"><thead><tr><th>Commande</th><th>Commander avant</th><th>Livraison</th></tr></thead><tbody>
      ${r.orders.map((o) => html`<tr><td>${o.label}</td><td>${o.ordered_at || o.received_at ? html`<span class="muted">déjà passée</span>` : html`<span style="${o.late ? 'color:var(--danger);font-weight:600' : ''}">${fmtDate(o.order_by)}</span>`}</td><td>${fmtDate(o.expected_at)}</td></tr>`)}
    </tbody></table>` : ''}
    <div style="margin-top:12px">${r.warnings.map((w) => html`<div class="alert ${w.level}">${w.text}</div>`)}</div>`;
}

// ================= Liste des projets =================
Views.projets = async (view, params, query) => {
  if (params[0]) return Views.projet(view, params);
  const status = query.statut ?? 'actifs';
  const rows = await api(`/projects?status=${encodeURIComponent(status)}${query.q ? `&q=${encodeURIComponent(query.q)}` : ''}`);
  view.innerHTML = String(html`
    <div class="page-head"><h1>Projets</h1><div class="actions">
      ${App.canEdit() ? html`<a class="btn primary" href="#/import">${icon('plus')} Nouveau devis</a>` : ''}</div></div>
    <div class="card">
      <form class="row" id="filters" style="margin-bottom:12px">
        <input name="q" type="search" placeholder="Rechercher un client, un projet, un n° de devis" value="${query.q || ''}" style="max-width:340px" aria-label="Rechercher">
        <select name="statut" style="max-width:200px" aria-label="Statut">
          <option value="actifs" ${status === 'actifs' ? 'selected' : ''}>Projets actifs</option>
          <option value="" ${status === '' ? 'selected' : ''}>Tous</option>
          ${Object.entries(STATUS).map(([k, [l]]) => html`<option value="${k}" ${status === k ? 'selected' : ''}>${l}</option>`)}
        </select></form>
      ${rows.length ? html`<div class="table-wrap"><table><thead><tr><th>Projet</th><th>Client</th><th>Statut</th><th>Fabrication</th><th>Pose</th><th>Commandes</th><th>Montant HT</th></tr></thead><tbody>
        ${rows.map((p) => html`<tr class="clickable" data-href="#/projets/${p.id}">
          <td><a href="#/projets/${p.id}">${p.title}</a>${p.quote_number ? html`<div class="muted small">${p.quote_number}</div>` : ''}</td>
          <td>${p.client_name || '—'}</td><td>${badge(STATUS, p.status)}</td>
          <td class="small">${p.fab_start ? `${fmtDate(p.fab_start)} → ${fmtDate(p.fab_end)}` : '—'}<div class="muted">${hours(p.fab_hours)}</div></td>
          <td class="small">${p.install_date ? html`<strong>${fmtDate(p.install_date)}</strong> ${p.planning_mode === 'backward' ? html`<span class="badge" title="Date fixée avec le client">fixée</span>` : ''}<div>${badge(CONFIRM, p.install_confirmed)}</div>` : '—'}</td>
          <td>${p.orders_late ? html`<span class="badge danger">${p.orders_late} en retard</span>` : p.orders_todo ? html`<span class="badge warning">${p.orders_todo} à passer</span>` : html`<span class="badge ok">à jour</span>`}</td>
          <td class="num">${money(p.total_ht)}</td></tr>`)}
      </tbody></table></div>` : html`<p class="empty">Aucun projet${query.q ? ' ne correspond à cette recherche' : ''}. ${App.canEdit() ? html`<a href="#/import">Importer un devis validé</a> pour commencer.` : ''}</p>`}
    </div>`);
  const f = $('#filters');
  const apply = () => { const v = formData(f); App.go(`#/projets?statut=${encodeURIComponent(v.statut)}&q=${encodeURIComponent(v.q)}`); };
  f.addEventListener('submit', (e) => { e.preventDefault(); apply(); });
  f.statut.addEventListener('change', apply);
  $$('tr[data-href]', view).forEach((tr) => tr.addEventListener('click', (e) => { if (!e.target.closest('a')) location.hash = tr.dataset.href; }));
};

// ================= Fiche projet =================
Views.projet = async (view, params) => {
  const pid = Number(params[0]);
  const [p, cats] = await Promise.all([api(`/projects/${pid}`), api('/categories')]);
  const edit = App.canEdit();
  const t = today();

  view.innerHTML = String(html`
    <div class="page-head"><div><div class="small"><a href="#/projets">← Projets</a></div><h1>${p.title}</h1>
      <div class="row muted small">${p.client_name || 'Client non renseigné'} ${p.quote_number ? `· Devis ${p.quote_number}` : ''} · ${badge(STATUS, p.status)}</div></div>
      <div class="actions">
        ${edit ? html`<select id="status" aria-label="Changer le statut" style="width:auto">${Object.entries(STATUS).map(([k, [l]]) => html`<option value="${k}" ${p.status === k ? 'selected' : ''}>${l}</option>`)}</select>` : ''}
        ${p.quote_file ? html`<a class="btn" href="/api/quotes/${p.quote_file}" target="_blank" rel="noopener">Voir le devis</a>` : ''}
      </div></div>

    ${p.warnings.length ? html`<div style="margin-bottom:16px">${p.warnings.map((w) => html`<div class="alert ${w.level}">${w.text}</div>`)}</div>` : ''}

    <div class="grid" style="grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);align-items:start" id="pgrid">
      <div class="stack" style="min-width:0">
        <div class="card"><h2>Frise du projet</h2>${timeline(p, t)}</div>

        <div class="card"><div class="row" style="margin-bottom:8px"><h2 style="margin:0">Commandes</h2><span class="spacer"></span>
          ${edit ? html`<select id="add-order" style="width:auto" aria-label="Ajouter une commande"><option value="">+ Ajouter un poste…</option>
            ${cats.filter((c) => c.active).map((c) => html`<option value="${c.id}">${c.name} (${c.lead_days} j)</option>`)}<option value="libre">Autre (libre)…</option></select>` : ''}</div>
          ${p.orders.length ? html`<div class="table-wrap"><table><thead><tr><th>Poste</th><th>Pour</th><th>Commander avant</th><th>Livraison</th><th></th></tr></thead><tbody>
            ${p.orders.map((o) => {
              const late = o.status === 'a_commander' && o.order_by && o.order_by < t;
              const lateDeliv = o.status === 'commande' && o.expected_at && o.expected_at < t;
              return html`<tr><td><strong>${o.label}</strong><div class="muted small">${o.supplier || ''} ${o.lead_days} j</div></td>
                <td class="small">${o.needed_for === 'pose' ? 'Pose' : 'Fabrication'}</td>
                <td>${o.status === 'a_commander' ? html`<span class="badge ${late ? 'danger' : 'warning'}">${fmtDate(o.order_by)}</span>` : html`<span class="muted small">passée le ${fmtDate(o.ordered_at)}</span>`}</td>
                <td class="small">${o.received_at ? html`reçue le ${fmtDate(o.received_at)}` : html`<span style="${lateDeliv ? 'color:var(--danger);font-weight:600' : ''}">${fmtDate(o.expected_at)}</span>`}</td>
                <td style="text-align:right">
                  ${o.status === 'a_commander' ? html`<button class="btn small" data-ostatus="commande" data-oid="${o.id}">Commandé</button>` : ''}
                  ${o.status === 'commande' ? html`<button class="btn small" data-ostatus="recu" data-oid="${o.id}">Reçu</button>` : ''}
                  ${edit ? html`<button class="btn small ghost" data-oedit="${o.id}">Modifier</button>` : ''}</td></tr>`;
            })}</tbody></table></div>` : html`<p class="empty">Aucune commande prévue pour ce projet.</p>`}
        </div>

        <div class="card"><div class="row" style="margin-bottom:8px"><h2 style="margin:0">Tâches et rappels</h2></div>
          <ul class="list">${p.tasks.map((tk) => html`<li><label class="check grow"><input type="checkbox" data-task="${tk.id}" ${tk.done_at ? 'checked' : ''}>
            <span style="${tk.done_at ? 'text-decoration:line-through;color:var(--muted)' : ''}">${tk.title}</span></label>
            ${tk.due_date ? html`<span class="badge ${!tk.done_at && tk.due_date < t ? 'danger' : ''}">${fmtDate(tk.due_date)}</span>` : ''}
            <button class="btn small ghost icon" data-tdel="${tk.id}" aria-label="Supprimer la tâche" title="Supprimer">${icon('trash')}</button></li>`)}</ul>
          <form class="row" id="task-form" style="margin-top:8px"><input name="title" placeholder="ex. Relever les cotes définitives" required style="flex:2;min-width:180px" aria-label="Nouvelle tâche">
            <input name="due_date" type="date" style="flex:1;min-width:140px" aria-label="Échéance"><button class="btn" type="submit">Ajouter la tâche</button></form>
        </div>
      </div>

      <div class="stack" style="min-width:0">
        <form class="card" id="plan-form"><h2>Planning</h2>
          <div class="segmented" style="margin-bottom:12px" role="radiogroup" aria-label="Mode de calcul">
            <button type="button" data-mode="asap" class="${p.planning_mode !== 'backward' ? 'on' : ''}" ${edit ? '' : 'disabled'}>Au plus tôt</button>
            <button type="button" data-mode="backward" class="${p.planning_mode === 'backward' ? 'on' : ''}" ${edit ? '' : 'disabled'}>Date de pose fixée</button></div>
          <input type="hidden" name="planning_mode" value="${p.planning_mode}">
          <div class="form-grid" style="grid-template-columns:repeat(auto-fill,minmax(140px,1fr))">
            <label class="field">Date de pose<input name="install_date" type="date" value="${p.install_date || ''}" ${p.planning_mode !== 'backward' ? 'readonly' : ''}></label>
            <label class="field">Heure<input name="install_time" type="time" value="${p.install_time || ''}"></label>
            <label class="field">Durée pose (j)<input name="install_days" type="number" min="1" value="${p.install_days}"></label>
            <label class="field">Heures atelier <span class="hint">${p.fab_hours_estimated ? `estimé ${hours(p.fab_hours_estimated)}` : ''}</span><input name="fab_hours" type="number" step="any" min="0" value="${p.fab_hours ?? ''}"></label>
            <label class="field">Marge livraisons (j)<input name="buffer_days" type="number" min="0" value="${p.buffer_days ?? ''}" placeholder="défaut"></label>
            <label class="field">Marge avant pose (j)<input name="fab_margin_days" type="number" min="0" value="${p.fab_margin_days ?? ''}" placeholder="défaut"></label>
          </div>
          <p class="small muted" id="mode-hint">${p.planning_mode === 'backward' ? 'La date de pose est fixe : les dates de commande et de fabrication sont calculées à rebours.' : 'La date de pose est calculée automatiquement. Une fois validée avec le client, passez en « Date de pose fixée ».'}</p>
          ${edit ? html`<div class="row"><button class="btn primary" type="submit">Enregistrer et recalculer</button>
            ${p.planning_mode !== 'backward' && p.install_date ? html`<button class="btn" type="button" id="fix-date">Fixer cette date avec le client</button>` : ''}</div>` : ''}
        </form>

        <div class="card"><h2>Client et rendez-vous</h2>
          <dl class="kv"><dt>Client</dt><dd>${p.client_name || '—'}</dd><dt>Téléphone</dt><dd>${p.client_phone ? html`<a href="tel:${p.client_phone}">${p.client_phone}</a>` : html`<span style="color:var(--danger)">manquant : pas de rappel WhatsApp possible</span>`}</dd>
            <dt>E-mail</dt><dd>${p.client_email || '—'}</dd><dt>Adresse</dt><dd>${p.client_address || '—'}</dd>
            <dt>Rendez-vous</dt><dd>${badge(CONFIRM, p.install_confirmed)}</dd></dl>
          ${edit ? html`<div class="row" style="margin-top:12px"><button class="btn small" id="edit-client">Modifier le client</button>
            <select id="confirm" style="width:auto" aria-label="État de confirmation">${Object.entries(CONFIRM).map(([k, [l]]) => html`<option value="${k}" ${p.install_confirmed === k ? 'selected' : ''}>${l}</option>`)}</select></div>` : ''}
          <h3 style="margin-top:16px">Rappels WhatsApp</h3>
          ${p.notifications.length ? html`<ul class="list small">${p.notifications.map((n) => html`<li><span class="grow">${n.rule_label || 'Rappel'} · ${fmtDateTime(n.scheduled_at)}</span>${badge(NOTIF, n.status)}
            ${edit && n.status === 'planifie' ? html`<button class="btn small" data-send="${n.id}">${icon('send')} Envoyer maintenant</button>` : ''}
            ${n.error ? html`<span style="flex-basis:100%;color:var(--danger)">${n.error}</span>` : ''}</li>`)}</ul>`
            : html`<p class="empty">Les rappels sont créés automatiquement dès qu'une date de pose est planifiée.</p>`}
        </div>

        <div class="card"><h2>Devis</h2>
          <dl class="kv"><dt>Total HT</dt><dd class="num">${money(p.total_ht)}</dd><dt>M.-d'œuvre fab.</dt><dd class="num">${money(p.labor_amount)}</dd>
            <dt>M.-d'œuvre pose</dt><dd class="num">${money(p.pose_amount)}</dd><dt>Taux horaire</dt><dd>${p.hourly_rate ? `${p.hourly_rate} €/h` : '—'}</dd>
            <dt>Heures pose</dt><dd>${hours(p.pose_hours)}</dd><dt>Validé le</dt><dd>${fmtDate(p.validated_at)}</dd></dl>
          ${p.notes ? html`<p style="white-space:pre-wrap;margin-bottom:0">${p.notes}</p>` : ''}
          ${edit ? html`<div class="row" style="margin-top:12px"><button class="btn small" id="edit-quote">Modifier</button>
            ${App.isAdmin() ? html`<button class="btn small danger" id="delete">Supprimer le projet</button>` : ''}</div>` : ''}
        </div>
      </div>
    </div>`);

  if (window.matchMedia('(max-width: 1000px)').matches) $('#pgrid').style.gridTemplateColumns = '1fr';
  const reload = () => Views.projet(view, params);
  const put = (body, msg) => run(() => api(`/projects/${pid}`, { method: 'PUT', body }), msg);

  $('#status')?.addEventListener('change', async (e) => { if (await put({ status: e.target.value }, 'Statut mis à jour')) reload(); });
  $('#confirm')?.addEventListener('change', async (e) => { if (await put({ install_confirmed: e.target.value, replan: false }, 'Confirmation mise à jour')) reload(); });

  const pf = $('#plan-form');
  $$('[data-mode]', pf).forEach((b) => b.addEventListener('click', () => {
    $$('[data-mode]', pf).forEach((x) => x.classList.toggle('on', x === b));
    pf.planning_mode.value = b.dataset.mode;
    pf.install_date.readOnly = b.dataset.mode !== 'backward';
    $('#mode-hint').textContent = b.dataset.mode === 'backward'
      ? 'Choisissez la date convenue avec le client, puis enregistrez : commandes et fabrication seront recalculées à rebours.'
      : 'La date de pose sera recalculée au plus tôt à l’enregistrement.';
  }));
  pf.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = formData(pf);
    if (v.planning_mode === 'backward' && !v.install_date) return toast('Choisissez une date de pose', 'error');
    if (await put(v, 'Planning recalculé')) reload();
  });
  $('#fix-date')?.addEventListener('click', async () => { if (await put({ planning_mode: 'backward', install_date: p.install_date }, 'Date de pose fixée')) reload(); });

  view.querySelectorAll('[data-ostatus]').forEach((b) => b.addEventListener('click', () => orderStatusDrawer(b.dataset.oid, b.dataset.ostatus, p.orders, reload)));
  view.querySelectorAll('[data-oedit]').forEach((b) => b.addEventListener('click', () => orderEditDrawer(p.orders.find((o) => o.id === Number(b.dataset.oedit)), reload)));
  $('#add-order')?.addEventListener('change', async (e) => {
    const v = e.target.value;
    if (!v) return;
    if (v === 'libre') { e.target.value = ''; return orderEditDrawer({ project_id: pid, label: '', lead_days: 7, needed_for: 'fabrication' }, reload); }
    if (await run(() => api(`/projects/${pid}/orders`, { method: 'POST', body: { category_id: Number(v) } }), 'Commande ajoutée')) reload();
  });

  $('#task-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (await run(() => api('/tasks', { method: 'POST', body: { ...formData(e.target), project_id: pid } }), 'Tâche ajoutée')) reload();
  });
  view.querySelectorAll('[data-task]').forEach((c) => c.addEventListener('change', async () => { await run(() => api(`/tasks/${c.dataset.task}`, { method: 'PUT', body: { done: c.checked } })); reload(); }));
  view.querySelectorAll('[data-tdel]').forEach((b) => b.addEventListener('click', async () => { if (await run(() => api(`/tasks/${b.dataset.tdel}`, { method: 'DELETE' }))) reload(); }));
  view.querySelectorAll('[data-send]').forEach((b) => b.addEventListener('click', async () => {
    b.disabled = true;
    const r = await run(() => api(`/notifications/${b.dataset.send}/send`, { method: 'POST' }));
    if (r) toast(r.ok ? (r.simulated ? 'Message simulé (mode test) : rien n’a été envoyé au client' : 'Message envoyé') : r.error, r.ok ? '' : 'error');
    reload();
  }));

  $('#edit-client')?.addEventListener('click', () => drawer({
    title: 'Client',
    body: html`<div class="stack"><label class="field">Nom<input name="name" required value="${p.client_name || ''}"></label>
      <label class="field">Téléphone (WhatsApp)<input name="phone" type="tel" value="${p.client_phone || ''}"></label>
      <label class="field">E-mail<input name="email" type="email" value="${p.client_email || ''}"></label>
      <label class="field">Adresse<input name="address" value="${p.client_address || ''}"></label></div>`,
    onSave: async (v) => {
      if (!v.name) throw new Error('Le nom du client est requis');
      await put({ client: { id: p.client_id || undefined, ...v }, replan: false }, 'Client enregistré');
      reload();
    },
  }));
  $('#edit-quote')?.addEventListener('click', () => drawer({
    title: 'Projet et devis',
    body: html`<div class="stack"><label class="field">Intitulé<input name="title" required value="${p.title}"></label>
      <div class="form-grid"><label class="field">N° de devis<input name="quote_number" value="${p.quote_number || ''}"></label>
      <label class="field">Validé le<input name="validated_at" type="date" value="${p.validated_at || ''}"></label>
      <label class="field">Total HT (€)<input name="total_ht" type="number" step="any" value="${p.total_ht ?? ''}"></label>
      <label class="field">M.-d'œuvre fab. (€)<input name="labor_amount" type="number" step="any" value="${p.labor_amount ?? ''}"></label>
      <label class="field">M.-d'œuvre pose (€)<input name="pose_amount" type="number" step="any" value="${p.pose_amount ?? ''}"></label>
      <label class="field">Heures pose<input name="pose_hours" type="number" step="any" value="${p.pose_hours ?? ''}"></label>
      <label class="field">Taux horaire<input name="hourly_rate" type="number" step="any" value="${p.hourly_rate ?? ''}"></label></div>
      <label class="field">Notes internes<textarea name="notes">${p.notes || ''}</textarea></label></div>`,
    onSave: async (v) => { await put(v, 'Projet enregistré'); reload(); },
  }));
  $('#delete')?.addEventListener('click', async () => {
    if (await confirmAction(`Supprimer définitivement le projet « ${p.title} », ses commandes et son planning ?`, 'Supprimer le projet')) {
      if (await run(() => api(`/projects/${pid}`, { method: 'DELETE' }), 'Projet supprimé')) App.go('#/projets');
    }
  });
};

function orderStatusDrawer(oid, status, orders, reload) {
  const o = orders.find((x) => String(x.id) === String(oid));
  const isOrder = status === 'commande';
  drawer({
    title: isOrder ? `Commande passée : ${o.label}` : `Réception : ${o.label}`,
    body: isOrder
      ? html`<div class="stack"><label class="field">Commandé le<input name="ordered_at" type="date" value="${today()}"></label>
          <label class="field">Livraison annoncée par le fournisseur <span class="hint">laisser vide = délai par défaut (${o.lead_days} j)</span><input name="expected_at" type="date"></label></div>`
      : html`<label class="field">Reçu le<input name="received_at" type="date" value="${today()}"></label>`,
    saveLabel: isOrder ? 'Marquer commandé' : 'Marquer reçu',
    onSave: async (v) => { await api(`/orders/${oid}`, { method: 'PUT', body: { status, ...v } }); toast('Commande mise à jour'); reload(); },
  });
}

function orderEditDrawer(o, reload) {
  const isNew = !o.id;
  drawer({
    title: isNew ? 'Nouvelle commande' : `Modifier : ${o.label}`,
    body: html`<div class="stack"><label class="field">Libellé<input name="label" required value="${o.label || ''}"></label>
      <label class="field">Fournisseur<input name="supplier" value="${o.supplier || ''}"></label>
      <div class="form-grid"><label class="field">Délai (jours)<input name="lead_days" type="number" min="0" value="${o.lead_days}"></label>
      <label class="field">Nécessaire pour<select name="needed_for"><option value="fabrication" ${o.needed_for !== 'pose' ? 'selected' : ''}>Fabrication</option><option value="pose" ${o.needed_for === 'pose' ? 'selected' : ''}>Pose</option></select></label>
      ${!isNew && o.status === 'commande' ? html`<label class="field">Livraison prévue<input name="expected_at" type="date" value="${o.expected_at || ''}"></label>` : ''}</div>
      ${!isNew ? html`<label class="field">État<select name="status">${Object.entries(ORDER_STATUS).map(([k, [l]]) => html`<option value="${k}" ${o.status === k ? 'selected' : ''}>${l}</option>`)}</select></label>` : ''}
      <label class="field">Notes<textarea name="notes">${o.notes || ''}</textarea></label></div>`,
    onSave: async (v) => {
      if (!v.label) throw new Error('Le libellé est requis');
      if (isNew) await api(`/projects/${o.project_id}/orders`, { method: 'POST', body: v });
      else await api(`/orders/${o.id}`, { method: 'PUT', body: v });
      toast('Commande enregistrée');
      reload();
    },
    onDelete: isNew ? null : async () => {
      await api(`/orders/${o.id}`, { method: 'DELETE' });
      toast('Commande supprimée');
      reload();
    },
    deleteLabel: 'Supprimer la commande',
  });
}

// Frise : commandes, livraisons, fabrication, pose, sur une échelle commune
function timeline(p, t) {
  const dates = [t, p.fab_start, p.fab_end, p.install_date, ...p.orders.flatMap((o) => [o.order_by, o.ordered_at, o.expected_at, o.received_at])].filter(Boolean).sort();
  if (!p.install_date && !p.fab_start) return html`<p class="empty">Pas encore planifié. Renseignez le planning à droite puis enregistrez.</p>`;
  const start = addDays(dates[0], -1);
  const installEnd = addDays(p.install_date || t, Math.max(0, (p.install_days || 1) - 1));
  const end = addDays([dates[dates.length - 1], installEnd].sort().pop(), 2);
  const span = Math.max(1, diffDays(start, end));
  const pos = (d) => `${(diffDays(start, d) / span) * 100}%`;
  const width = (a, b) => `${Math.max(0.8, ((diffDays(a, b) + 1) / span) * 100)}%`;
  const todayMark = t >= start && t <= end ? html`<span class="tl-today" style="left:${pos(t)}" title="Aujourd'hui"></span>` : '';
  const row = (label, bars) => html`<div class="tl-row"><span class="small">${label}</span><div class="tl-track">${bars}${todayMark}</div></div>`;
  return html`<div class="timeline">
    ${p.orders.map((o) => {
      const from = o.ordered_at || o.order_by;
      const to = o.received_at || o.expected_at;
      if (!from || !to) return '';
      return row(o.label, html`<span class="tl-bar ${o.received_at ? 'deliv' : 'order'}" style="left:${pos(from)};width:${width(from, to)}" title="${o.label} : ${fmtDate(from)} → ${fmtDate(to)}"></span>`);
    })}
    ${p.fab_start ? row('Fabrication atelier', p.allocations.map((a) => html`<span class="tl-bar fab" style="left:${pos(a.day)};width:${width(a.day, a.day)}" title="${fmtDate(a.day)} : ${hours(a.hours)}"></span>`)) : ''}
    ${p.install_date ? row('Pose chez le client', html`<span class="tl-bar pose" style="left:${pos(p.install_date)};width:${width(p.install_date, installEnd)}" title="Pose ${fmtDate(p.install_date)}"></span>`) : ''}
    </div>
    <div class="tl-scale" style="margin-top:6px"><span>${fmtDate(start)}</span><span>${fmtDate(end)}</span></div>
    <div class="legend" style="margin-top:10px"><span><i style="background:var(--order)"></i>Commande → livraison prévue</span><span><i style="background:var(--deliv)"></i>Reçu</span>
      <span><i style="background:var(--fab)"></i>Fabrication</span><span><i style="background:var(--pose)"></i>Pose</span><span><i style="background:var(--danger)"></i>Aujourd'hui</span></div>`;
}
