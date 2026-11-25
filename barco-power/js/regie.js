/* Régie : envoie des commandes à l'écran principal et affiche son état. */
(function () {
  'use strict';
  const { data: D, bus: BUS } = window.BPS;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const nf0 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
  const fmtClock = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const fmtHM = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });
  const SEV = { info: 'Info', mineure: 'Mineure', majeure: 'Majeure', critique: 'Critique', ok: 'Résolu' };

  let state = null, lastSeen = 0;
  const cmd = (name, args) => BUS.send('cmd', { cmd: name, args: args || {} });

  // ---------------------------------------------------------------- listes
  const opts = (parks) => parks.map((p) => `<option value="${p.id}">${esc(p.name)} (${p.cc})</option>`).join('');
  const grouped = `<optgroup label="Solaire">${opts(D.SOLAR)}</optgroup><optgroup label="Éolien en mer">${opts(D.WIND)}</optgroup>`;
  $('#focusPark').innerHTML = grouped;
  $('#iPark').innerHTML = grouped;
  $('#selCable').innerHTML = opts(D.WIND.filter((p) => p.n > 5));
  $('#selSub').innerHTML = opts(D.SOLAR);
  function fillTypes() {
    const p = D.byId[$('#iPark').value];
    const types = Object.entries(D.INCIDENT_TYPES).filter(([, d]) => !d.auto && (d.tech === 'both' || d.tech === p.tech));
    const prev = $('#iType').value;
    $('#iType').innerHTML = types.map(([k, d]) => `<option value="${k}">${esc(d.label)}</option>`).join('');
    if (types.some(([k]) => k === prev)) $('#iType').value = prev;
    $('#iUnit').innerHTML = '<option value="">Automatique</option>' + p.units.map((u) => `<option value="${u.idx}">${u.id}</option>`).join('');
  }
  $('#iPark').addEventListener('change', fillTypes);
  $('#iPark').value = 'SNZ';
  fillTypes();

  // ---------------------------------------------------------------- commandes
  $('#tabBtns').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) cmd('tab', { tab: b.dataset.tab }); });
  $('#btnEurope').addEventListener('click', () => cmd('europe'));
  $('#btnFocus').addEventListener('click', () => cmd('focus', { parkId: $('#focusPark').value }));
  $('#tglTour').addEventListener('change', (e) => cmd('tour', { on: e.target.checked }));
  $('#tglFocus').addEventListener('change', (e) => cmd('autofocus', { on: e.target.checked }));
  $('#tglAuto').addEventListener('change', (e) => cmd('autopilot', { on: e.target.checked }));
  $('#btnPause').addEventListener('click', () => cmd('pause'));
  $('#speedBtns').addEventListener('click', (e) => { const b = e.target.closest('[data-speed]'); if (b) cmd('speed', { v: +b.dataset.speed }); });
  $('#todBtns').addEventListener('click', (e) => { const b = e.target.closest('[data-h]'); if (b) cmd('timeofday', { h: +b.dataset.h }); });
  $('#actSeg').addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (b) cmd('activity', { level: b.dataset.v }); });
  $('.scen').addEventListener('click', (e) => {
    const b = e.target.closest('.sc'); if (!b) return;
    flash(b);
    if (b.id === 'btnRandom') return cmd('incident', { random: true, show: $('#iShow').checked });
    const arg = b.dataset.sel ? $(b.dataset.sel).value : b.dataset.a != null ? (isNaN(+b.dataset.a) ? b.dataset.a : +b.dataset.a) : undefined;
    cmd('scenario', { name: b.dataset.s, arg });
  });
  function flash(b) { b.classList.add('flash'); setTimeout(() => b.classList.remove('flash'), 700); }
  $('#incForm').addEventListener('submit', (e) => {
    e.preventDefault();
    cmd('incident', { parkId: $('#iPark').value, type: $('#iType').value, unitIdx: $('#iUnit').value, sev: $('#iSev').value, desc: $('#iDesc').value.trim(), show: $('#iShow').checked });
    const btn = e.target.querySelector('[type=submit]');
    btn.textContent = 'Incident envoyé'; setTimeout(() => { btn.textContent = 'Déclencher l’incident'; }, 1400);
  });
  $('#rgIncs').addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (b) cmd(b.dataset.act, { id: b.dataset.id }); });
  $('#btnReset').addEventListener('click', () => { $('#resetConfirm').hidden = false; });
  $('#btnResetNo').addEventListener('click', () => { $('#resetConfirm').hidden = true; });
  $('#btnResetYes').addEventListener('click', () => { cmd('reset'); $('#resetConfirm').hidden = true; });
  $('#openMain').addEventListener('click', (e) => { e.preventDefault(); window.open('./', 'bps-main'); });

  // ---------------------------------------------------------------- état reçu
  BUS.on((msg) => {
    if (msg.type !== 'state') return;
    state = msg.payload; lastSeen = Date.now();
    render();
  });
  function render() {
    const s = state; if (!s) return;
    $('#rgClock').textContent = fmtClock.format(new Date(s.t)) + (s.paused ? ' · pause' : s.speed > 1 ? ` · ×${s.speed}` : '');
    $('#rgKpis').innerHTML = [
      ['Production', `${nf0.format(s.total)} MW`], ['Éolien', `${nf0.format(s.wind)} MW`], ['Solaire', `${nf0.format(s.solar)} MW`],
      ['Disponibilité', `${nf1.format(s.avail * 100)} %`], ['Alarmes', `${s.incidents.length}`],
      ['Météo', s.storms.length ? s.storms.map((x) => x.name).join(', ') : s.heat ? 'Chaleur' : 'Calme'],
    ].map(([l, v]) => `<div><span>${l}</span><b>${esc(v)}</b></div>`).join('');
    $$('#tabBtns .btn').forEach((b) => b.classList.toggle('on', b.dataset.tab === s.tab));
    $$('#speedBtns [data-speed]').forEach((b) => b.classList.toggle('on', +b.dataset.speed === s.speed && !s.paused));
    $('#btnPause').textContent = s.paused ? 'Lecture' : 'Pause';
    $('#btnPause').classList.toggle('on', s.paused);
    $$('#actSeg button').forEach((b) => b.classList.toggle('on', b.dataset.v === s.activity));
    if (document.activeElement !== $('#tglTour')) $('#tglTour').checked = s.tour;
    if (document.activeElement !== $('#tglFocus')) $('#tglFocus').checked = s.autofocus;
    if (document.activeElement !== $('#tglAuto')) $('#tglAuto').checked = s.autopilot;
    $('#incCnt').textContent = s.incidents.length;
    $('#rgIncs').innerHTML = s.incidents.length ? s.incidents.map((i) => `
      <div class="ri"><span class="sev-pill sev-${i.sev}">${SEV[i.sev]}</span>
        <div class="ri-t"><b>${esc(i.title)}</b><span>${i.code} · ${esc(i.where)} · ${esc(i.status)}</span></div>
        <div class="ri-a">
          <button class="btn sm" data-act="openIncident" data-id="${i.id}">Afficher</button>
          ${i.raw === 'nouveau' ? `<button class="btn sm" data-act="ack" data-id="${i.id}">Acquitter</button>` : ''}
          ${['nouveau', 'acquitté', 'en attente'].includes(i.raw) ? `<button class="btn sm" data-act="dispatch" data-id="${i.id}">Engager</button>` : ''}
          <button class="btn sm" data-act="resolve" data-id="${i.id}">Clôturer</button>
        </div></div>`).join('') : '<div class="empty">Aucun incident actif.</div>';
    $('#rgLog').innerHTML = s.log.map((e) => `<div><span class="mono">${fmtHM.format(new Date(e.t))}</span><span class="sev-pill sev-${e.sev}">${SEV[e.sev] || ''}</span><span>${esc(e.text)}</span></div>`).join('');
  }
  function conn() {
    const on = Date.now() - lastSeen < 3500;
    const el = $('#conn');
    el.classList.toggle('on', on); el.classList.toggle('off', !on && lastSeen > 0);
    $('#connText').textContent = on ? 'Écran principal connecté' : lastSeen ? 'Écran principal déconnecté' : 'Recherche de l’écran principal…';
  }
  setInterval(() => { conn(); if (Date.now() - lastSeen > 3000) cmd('hello'); }, 1000);
  cmd('hello');
})();
