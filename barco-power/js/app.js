/* Interface de la salle de contrôle Barco Power Solutions. */
(function () {
  'use strict';
  const { data: D, sim: S, charts: C, bus: BUS } = window.BPS;
  const { nf0, nf1, esc } = C;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  // ------------------------------------------------------------ Couleurs et formats
  const COL = {
    wind: '#3ea8ff', solar: '#f5b528', forecast: '#c9d4e3', price: '#b694ff',
    prod: '#2fbf71', low: '#5d6b7e', night: '#5d6b7e', storm: '#9b87ff', curt: '#2cc5c0', ice: '#a8dcff', maint: '#7b8cff', fault: '#ff4d5e', offline: '#e0527f',
    info: '#7d93ad', mineure: '#e6c547', majeure: '#ff8a3d', critique: '#ff4d5e', ok: '#2fbf71',
  };
  const SEV_LABEL = { info: 'Info', mineure: 'Mineure', majeure: 'Majeure', critique: 'Critique', ok: 'Résolu' };
  const fmtClock = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const fmtHM = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });
  const fmtDate = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long' });
  const mw = (v) => (v >= 100 ? nf0.format(v) : nf1.format(v));
  const pct = (v, d = 1) => `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: d, minimumFractionDigits: d }).format(v * 100)} %`;
  const eur = (v) => (v >= 1e6 ? `${nf1.format(v / 1e6)} M€` : `${nf0.format(v / 1e3)} k€`);
  const dur = (ms) => { const m = Math.max(0, Math.floor(ms / 60e3)); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`; };
  const dirArrow = (deg) => ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'][Math.round(deg / 45) % 8];
  const niceCap = (v) => { const st = v > 200 ? 100 : v > 50 ? 25 : 5; return Math.ceil((v * 1.04) / st) * st; };
  const sevRank = (s) => D.SEVERITIES[s] ? D.SEVERITIES[s].rank : -1;

  const UI = { tab: 'map', park: null, unit: null, incSel: null, tour: false, autofocus: true, holdUntil: 0, fStatus: 'active' };

  // ------------------------------------------------------------ Carte
  const map = L.map('map', { zoomControl: false, zoomSnap: 0.25, zoomDelta: 0.5, minZoom: 4, maxZoom: 15, worldCopyJump: false, preferCanvas: false });
  // Fonds de carte sans clé d'API : Esri gris foncé (par défaut) et OSM assombri en secours.
  const SIM_ATTR = ' · Données d’exploitation simulées';
  const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/';
  const esriBase = L.tileLayer(ESRI + 'World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', { maxZoom: 16, maxNativeZoom: 16, attribution: 'Fond &copy; Esri, HERE, Garmin, &copy; OpenStreetMap' + SIM_ATTR });
  const esriLabels = L.tileLayer(ESRI + 'World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', { maxZoom: 16, maxNativeZoom: 16, pane: 'shadowPane', opacity: 0.85 });
  const osmDark = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, className: 'tiles-dark', attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' + SIM_ATTR });
  const esri = L.layerGroup([esriBase, esriLabels]).addTo(map);
  L.control.layers({ 'Gris foncé (Esri)': esri, 'OpenStreetMap sombre': osmDark }, null, { position: 'bottomright' }).addTo(map);
  // bascule automatique si le fond Esri ne répond pas
  let esriErr = 0, esriOk = 0;
  esriBase.on('tileload', () => { esriOk++; });
  esriBase.on('tileerror', () => {
    if (++esriErr >= 6 && esriOk === 0 && map.hasLayer(esri)) { map.removeLayer(esri); osmDark.addTo(map); }
  });
  L.control.zoom({ position: 'topright' }).addTo(map);
  L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);
  const allBounds = L.latLngBounds(D.PARKS.map((p) => [p.lat, p.lng]));
  const EUROPE_PAD = { paddingTopLeft: [40, 60], paddingBottomRight: [60, 170] };
  map.fitBounds(allBounds, EUROPE_PAD);

  const L_over = L.layerGroup().addTo(map);
  const L_weather = L.layerGroup().addTo(map);
  const L_inc = L.layerGroup().addTo(map);
  const L_assets = L.layerGroup().addTo(map);
  const DETAIL_Z = 9.5;

  function setZoomClasses() {
    const z = map.getZoom(), el = map.getContainer();
    el.classList.toggle('lt6', z < 6);
    el.classList.toggle('lt7', z < 7);
    el.classList.toggle('lt9', z < 9);
    el.classList.toggle('detail', z >= DETAIL_Z);
    el.classList.toggle('gte12', z >= 12);
  }

  // --- marqueurs de synthèse (vue Europe)
  const GLYPH = {
    wind: '<g class="g-wind"><circle r="5" cx="50" cy="50"/><path d="M50 50 L46 22 Q50 16 54 22 Z"/><path d="M50 50 L46 22 Q50 16 54 22 Z" transform="rotate(120 50 50)"/><path d="M50 50 L46 22 Q50 16 54 22 Z" transform="rotate(240 50 50)"/></g>',
    solar: '<g class="g-sun"><circle r="11" cx="50" cy="50"/>' + [0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<rect x="48" y="24" width="4" height="9" rx="2" transform="rotate(${a} 50 50)"/>`).join('') + '</g>',
  };
  const R = 40, CIRC = 2 * Math.PI * R;
  D.PARKS.forEach((p) => {
    const size = Math.round(30 + Math.sqrt(p.capMW) * 1.1);
    const html = `<div class="pk pk-${p.tech}" style="--s:${size}px"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="47" class="pk-bg"/><circle cx="50" cy="50" r="${R}" class="pk-track"/><circle cx="50" cy="50" r="${R}" class="pk-arc" stroke-dasharray="0 ${CIRC}" transform="rotate(-90 50 50)"/>${GLYPH[p.tech]}</svg><span class="pk-badge" hidden></span><div class="pk-label"><b>${esc(p.name)}</b><span class="pk-mw">—</span></div></div>`;
    p._over = L.marker([p.lat, p.lng], { icon: L.divIcon({ className: 'pk-ic', html, iconSize: [size, size], iconAnchor: [size / 2, size / 2] }), riseOnHover: true, keyboard: false })
      .on('click', () => focusPark(p.id)).addTo(L_over);
  });
  function updateOverview() {
    D.PARKS.forEach((p) => {
      const el = p._over.getElement(); if (!el) return;
      if (!p._ov) p._ov = { arc: el.querySelector('.pk-arc'), mw: el.querySelector('.pk-mw'), badge: el.querySelector('.pk-badge'), root: el.querySelector('.pk') };
      const o = p._ov;
      o.arc.setAttribute('stroke-dasharray', `${(CIRC * Math.min(1, p.lf)).toFixed(1)} ${CIRC}`);
      o.mw.textContent = `${mw(p.mw)} MW`;
      const n = p.incCount;
      o.badge.hidden = !n; o.badge.textContent = n; o.badge.className = `pk-badge sev-${p.maxSev || 'info'}`;
      o.root.classList.toggle('alarm', p.maxSev === 'critique' || p.maxSev === 'majeure');
      o.root.classList.toggle('sel', UI.park === p.id);
    });
  }

  // --- couches de détail (éoliennes, onduleurs, câbles)
  function iconSize() { const z = map.getZoom(); return z < 11 ? 16 : z < 12 ? 22 : z < 13 ? 30 : 40; }
  const BLADE = '<path d="M0,-2 L-1.5,-17 Q0,-19 1.5,-17 Z"/>';
  function turbineIcon(u, size) {
    const html = `<div class="wt"><svg viewBox="-20 -20 40 40"><circle r="18.5" class="wt-ring"/><g class="wt-rot">${BLADE}<g transform="rotate(120)">${BLADE}</g><g transform="rotate(240)">${BLADE}</g></g><circle r="2.8" class="wt-hub"/></svg><span class="wt-lbl">${u.id.split('-')[1]}</span></div>`;
    return L.divIcon({ className: 'wt-ic', html, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
  }
  function smallIcon(cls, label) {
    return L.divIcon({ className: 'poi-ic', html: `<div class="poi ${cls}"><i></i>${label ? `<span>${esc(label)}</span>` : ''}</div>`, iconSize: [12, 12], iconAnchor: [6, 6] });
  }
  function buildDetail(p) {
    const g = L.layerGroup();
    L.polygon(p.zone, { color: COL[p.tech], weight: 1, dashArray: '4 5', fillColor: COL[p.tech], fillOpacity: 0.035, interactive: false }).addTo(g);
    const size = iconSize();
    p._um = [];
    if (p.tech === 'wind') {
      const head = p.substation || [p.units[0].lat, p.units[0].lng];
      for (let r = 0; r < p.rows; r++) {
        const row = p.units.filter((u) => u.row === r).sort((a, b) => a.col - b.col);
        const pts = [head, ...row.map((u) => [u.lat, u.lng])];
        L.polyline(pts, { color: COL.wind, weight: 1, opacity: 0.32, interactive: false }).addTo(g);
      }
      L.polyline([head, [p.landfall.lat, p.landfall.lng]], { color: '#7fc4ff', weight: 2, opacity: 0.55, dashArray: '7 6', interactive: false }).addTo(g);
      L.marker([p.landfall.lat, p.landfall.lng], { icon: smallIcon('land', p.landfall.name), interactive: false }).addTo(g);
      if (p.substation) L.marker(p.substation, { icon: smallIcon('oss', 'Poste en mer'), interactive: false }).addTo(g);
      L.marker([p.port.lat, p.port.lng], { icon: smallIcon('port', p.port.name), interactive: false }).addTo(g);
      p.units.forEach((u) => {
        const m = L.marker([u.lat, u.lng], { icon: turbineIcon(u, size), keyboard: false })
          .bindTooltip(() => unitTip(p, u), { direction: 'top', offset: [0, -size / 2], className: 'utip' })
          .on('click', () => selectUnit(p.id, u.idx)).addTo(g);
        m._vk = '';
        p._um.push(m);
      });
    } else {
      L.marker(p.substation, { icon: smallIcon('oss', 'Poste de livraison'), interactive: false }).addTo(g);
      L.marker([p.port.lat, p.port.lng], { icon: smallIcon('port', p.port.name), interactive: false }).addTo(g);
      p.units.forEach((u) => {
        const r = L.rectangle(u.bounds, { color: COL.prod, weight: 1, opacity: 0.9, fillColor: COL.prod, fillOpacity: 0.45 })
          .bindTooltip(() => unitTip(p, u), { direction: 'top', className: 'utip' })
          .on('click', () => selectUnit(p.id, u.idx)).addTo(g);
        r._vk = '';
        p._um.push(r);
      });
    }
    p._layer = g;
  }
  function unitTip(p, u) {
    return `<b>${u.id}</b> · ${esc(D.STATUS[u.status].label)}<br>${mw(u.mw)} MW${p.tech === 'wind' ? ` · ${nf1.format(u.v)} m/s` : ` · ${nf0.format(u.irr)} W/m²`}`;
  }
  const flaggedSev = (u) => {
    let best = null;
    Object.keys(u.flags).forEach((id) => { const inc = S.incidents.find((i) => i.id === id); if (inc && sevRank(inc.sev) > sevRank(best)) best = inc.sev; });
    return best;
  };
  function updateDetail(force) {
    D.PARKS.forEach((p) => {
      if (!p._layer || !map.hasLayer(p._layer)) return;
      p.units.forEach((u, i) => {
        const m = p._um[i];
        const sel = UI.park === p.id && UI.unit === i;
        const sev = flaggedSev(u);
        if (p.tech === 'wind') {
          const spin = u.rpm > 0.3 ? (u.rpm > 9 ? 2.2 : u.rpm > 6 ? 3 : u.rpm > 3 ? 4.2 : 7) : 0;
          const key = `${u.status}|${spin}|${sel}|${sev}`;
          if (key === m._vk && !force) return;
          const el = m.getElement(); if (!el) return;
          m._vk = key;
          const wt = el.firstChild;
          wt.className = `wt st-${u.status}${sel ? ' sel' : ''}${sev ? ' al sev-' + sev : ''}`;
          const rot = wt.querySelector('.wt-rot');
          if (spin) { rot.style.animationDuration = `${spin}s`; rot.classList.add('spin'); } else rot.classList.remove('spin');
        } else {
          const key = `${u.status}|${sel}|${sev}`;
          if (key === m._vk && !force) return;
          m._vk = key;
          const c = COL[u.status];
          m.setStyle({ color: sel ? '#ffffff' : sev ? COL[sev] : c, weight: sel ? 2.5 : sev ? 2 : 1, fillColor: c, fillOpacity: u.status === 'night' ? 0.18 : 0.45 });
        }
      });
    });
  }
  function refreshDetail() {
    const z = map.getZoom();
    const show = z >= DETAIL_Z;
    const b = map.getBounds().pad(0.4);
    let changed = false;
    D.PARKS.forEach((p) => {
      const want = show && (b.contains([p.lat, p.lng]) || UI.park === p.id);
      if (want && !p._layer) buildDetail(p);
      if (want && !map.hasLayer(p._layer)) { p._layer.addTo(map); changed = true; }
      if (!want && p._layer && map.hasLayer(p._layer)) { map.removeLayer(p._layer); changed = true; }
      if (map.hasLayer(p._over) === show) { if (show) L_over.removeLayer(p._over); else L_over.addLayer(p._over); p._ov = null; }
    });
    if (changed) updateDetail(true);
  }
  let lastSize = iconSize();
  map.on('zoomend', () => {
    setZoomClasses();
    const s = iconSize();
    if (s !== lastSize) {
      lastSize = s;
      D.WIND.forEach((p) => { if (!p._layer) return; p._um.forEach((m, i) => { m.setIcon(turbineIcon(p.units[i], s)); m._vk = ''; }); });
    }
    refreshDetail(); updateDetail(true); updateOverview();
  });
  map.on('moveend', refreshDetail);
  setZoomClasses();

  // --- météo (tempêtes, nuages)
  const stormLayers = {};
  function updateWeather() {
    const ids = new Set(S.storms.map((s) => s.id));
    Object.keys(stormLayers).forEach((id) => { if (!ids.has(id)) { stormLayers[id].forEach((l) => L_weather.removeLayer(l)); delete stormLayers[id]; } });
    S.storms.forEach((st) => {
      const env = Math.sin(Math.PI * Math.min(1, st.progress));
      if (!stormLayers[st.id]) {
        const cls = st.kind === 'storm' ? 'storm' : 'cloud';
        const outer = L.circle([st.lat, st.lng], { radius: st.radius * 1000, className: `wx ${cls}-o`, interactive: false });
        const inner = L.circle([st.lat, st.lng], { radius: st.radius * 450, className: `wx ${cls}-i`, interactive: false });
        const lab = L.marker([st.lat, st.lng], { interactive: false, icon: L.divIcon({ className: 'wx-ic', iconSize: [0, 0], html: `<div class="wx-lbl ${cls}"><svg viewBox="0 0 24 24" class="wx-svg"><path d="M12 3a9 9 0 0 1 9 9M12 21a9 9 0 0 1-9-9M6 6.5A8 8 0 0 1 18 7M18 17.5A8 8 0 0 1 6 17" /></svg><b>${esc(st.name)}</b><span></span></div>` }) });
        stormLayers[st.id] = [outer, inner, lab];
        stormLayers[st.id].forEach((l) => l.addTo(L_weather));
      }
      const [o, i, lab] = stormLayers[st.id];
      o.setLatLng([st.lat, st.lng]); i.setLatLng([st.lat, st.lng]); lab.setLatLng([st.lat, st.lng]);
      o.setRadius(st.radius * 1000 * (0.75 + 0.25 * env));
      i.setRadius(st.radius * 450 * (0.6 + 0.4 * env));
      const el = lab.getElement();
      if (el) {
        const sp = el.querySelector('span');
        sp.textContent = st.kind === 'storm' ? `${st.region} · rafales ${nf0.format((9 + st.boost * env) * 3.6 * 1.35)} km/h` : st.region;
      }
    });
  }

  // --- équipes et navires
  function assetIcon(a) {
    const shape = a.kind === 'ctv'
      ? '<svg viewBox="-12 -12 24 24"><path d="M0,-10 L5,-2 L5,9 L-5,9 L-5,-2 Z" class="as-hull"/><rect x="-3" y="-1" width="6" height="5" class="as-cab"/></svg>'
      : '<svg viewBox="-12 -12 24 24"><rect x="-5" y="-9" width="10" height="18" rx="2.5" class="as-hull"/><rect x="-4" y="-6" width="8" height="4" class="as-cab"/></svg>';
    return L.divIcon({ className: 'as-ic', iconSize: [24, 24], iconAnchor: [12, 12], html: `<div class="as as-${a.kind}"><div class="as-rot">${shape}</div><span class="as-lbl">${esc(a.name)}</span></div>` });
  }
  const trails = {};
  function buildAssetMarkers() {
    L_assets.clearLayers();
    Object.keys(trails).forEach((k) => delete trails[k]);
    S.assets.forEach((a) => { a._m = L.marker([a.lat, a.lng], { icon: assetIcon(a), keyboard: false, zIndexOffset: 500 }).bindTooltip(() => assetTip(a), { direction: 'top', className: 'utip' }).addTo(L_assets); });
  }
  buildAssetMarkers();
  function assetTip(a) {
    const inc = S.incidents.find((i) => i.id === a.inc);
    const st = { base: 'À quai / en base', transit: 'En route', site: 'Sur site', return: 'Retour base' }[a.state];
    return `<b>${esc(a.name)}</b> · ${a.kind === 'ctv' ? 'Navire de transfert' : 'Équipe terrain'}<br>${st}${inc ? ` — ${inc.code}` : ''}`;
  }
  function updateAssets() {
    S.assets.forEach((a) => {
      if (!a._m) return;
      a._m.setLatLng([a.lat, a.lng]);
      const el = a._m.getElement();
      if (el) {
        const r = el.querySelector('.as-rot'); if (r) r.style.transform = `rotate(${a.heading}deg)`;
        el.firstChild.classList.toggle('moving', a.state === 'transit' || a.state === 'return');
        el.firstChild.classList.toggle('busy', !!a.inc);
      }
      const moving = a.state === 'transit' && a.target;
      if (moving) {
        if (!trails[a.id]) trails[a.id] = L.polyline([[a.lat, a.lng], a.target], { className: 'trail', interactive: false }).addTo(L_assets);
        else trails[a.id].setLatLngs([[a.lat, a.lng], a.target]);
      } else if (trails[a.id]) { L_assets.removeLayer(trails[a.id]); delete trails[a.id]; }
    });
  }

  // --- repères d'incident
  const incMarkers = {};
  function updateIncMarkers() {
    const act = S.incidents.filter(S.isActive);
    const ids = new Set(act.map((i) => i.id));
    Object.keys(incMarkers).forEach((id) => { if (!ids.has(id)) { L_inc.removeLayer(incMarkers[id]); delete incMarkers[id]; } });
    act.forEach((inc) => {
      if (inc.type === 'storm_stop') return;
      const cls = `inc-pin sev-${inc.sev}${inc.def.scope === 'zone' ? ' zone' : ''}`;
      if (!incMarkers[inc.id]) {
        incMarkers[inc.id] = L.marker(inc.loc, { zIndexOffset: 800, keyboard: false, icon: L.divIcon({ className: 'inc-ic', iconSize: [28, 28], iconAnchor: [14, 14], html: `<div class="${cls}"><span>!</span></div>` }) })
          .bindTooltip(() => `<b>${inc.code}</b> · ${esc(inc.title)}<br>${esc(inc.where)} · ${S.STATUS_LABEL[inc.status]}`, { direction: 'top', offset: [0, -12], className: 'utip' })
          .on('click', () => openIncident(inc.id)).addTo(L_inc);
      }
    });
  }

  // ------------------------------------------------------------ Panneaux latéraux
  function buildLists() {
    [['solar', D.SOLAR, '#solarList'], ['wind', D.WIND, '#windList']].forEach(([tech, parks, sel]) => {
      const box = $(sel);
      box.innerHTML = parks.map((p) => `
        <button class="pi" data-id="${p.id}">
          <div class="pi-top"><span class="pi-dot"></span><span class="pi-name">${esc(p.name)}</span><span class="pi-cc">${p.cc}</span><span class="pi-al" hidden></span></div>
          <div class="pi-mid"><span class="pi-mw">—</span><small>/ ${mw(p.capMW)} MW</small><span class="pi-env"></span></div>
          <div class="pi-bar"><div></div></div>
          <div class="pi-foot"><span class="pi-av"></span><span class="pi-lf"></span></div>
        </button>`).join('');
      parks.forEach((p) => {
        const el = box.querySelector(`[data-id="${p.id}"]`);
        p._li = { el, dot: $('.pi-dot', el), mw: $('.pi-mw', el), env: $('.pi-env', el), bar: $('.pi-bar div', el), av: $('.pi-av', el), lf: $('.pi-lf', el), al: $('.pi-al', el) };
        el.addEventListener('click', () => focusPark(p.id));
      });
      void tech;
    });
    $('#solarCap').textContent = `${nf0.format(D.SOLAR.reduce((s, p) => s + p.capMW, 0))} MWc installés`;
    $('#windCap').textContent = `${nf0.format(D.WIND.reduce((s, p) => s + p.capMW, 0))} MW installés`;
  }
  function parkHealth(p) {
    if (p.maxSev === 'critique') return 'critique';
    if (p.maxSev === 'majeure') return 'majeure';
    if (p.maxSev === 'mineure') return 'mineure';
    return 'ok';
  }
  function updateLists(ag) {
    D.PARKS.forEach((p) => {
      const l = p._li; if (!l) return;
      l.mw.textContent = mw(p.mw);
      l.bar.style.width = `${Math.min(100, p.lf * 100).toFixed(1)}%`;
      l.env.textContent = p.tech === 'wind' ? `${nf1.format(p.vMean)} m/s ${dirArrow(p.dir)}` : p.irr < 8 ? 'Nuit' : `${nf0.format(p.irr)} W/m²`;
      l.av.textContent = `Dispo ${pct(p.avail)}`;
      l.lf.textContent = `FC ${pct(p.lf, 0)}`;
      l.dot.className = `pi-dot h-${parkHealth(p)}`;
      l.al.hidden = !p.incCount; l.al.textContent = p.incCount; l.al.className = `pi-al sev-${p.maxSev || 'info'}`;
      l.el.classList.toggle('sel', UI.park === p.id);
      l.el.classList.toggle('storm', p.tech === 'wind' && (p.counts.storm || 0) > 0);
    });
    $('#solarMW').textContent = nf0.format(ag.solar);
    $('#windMW').textContent = nf0.format(ag.wind);
    $('#solarBar').style.width = `${(ag.solar / ag.capSolar) * 100}%`;
    $('#windBar').style.width = `${(ag.wind / ag.capWind) * 100}%`;
    $('#solarMeta').innerHTML = `<span>Charge <b>${pct(ag.solar / ag.capSolar, 0)}</b></span><span>Dispo <b>${pct(ag.solarAvail / ag.solarUnits)}</b></span><span>Jour <b>${nf0.format(S.energy.solar)} MWh</b></span>`;
    $('#windMeta').innerHTML = `<span>Charge <b>${pct(ag.wind / ag.capWind, 0)}</b></span><span>Dispo <b>${pct(ag.windAvail / ag.windUnits)}</b></span><span>Jour <b>${nf0.format(S.energy.wind)} MWh</b></span>`;
  }
  function updateSparks() {
    const H = S.hist, n = H.t.length, from = Math.max(0, n - 288);
    $('#solarSpark').innerHTML = C.spark(H.solar.slice(from), COL.solar, $('#solarSpark').clientWidth || 280, 34);
    $('#windSpark').innerHTML = C.spark(H.wind.slice(from), COL.wind, $('#windSpark').clientWidth || 300, 34);
  }

  // ------------------------------------------------------------ Barre du haut
  function updateTop(ag) {
    $('#clock').textContent = fmtClock.format(new Date(S.t));
    const d = fmtDate.format(new Date(S.t));
    $('#clockDate').textContent = d.charAt(0).toUpperCase() + d.slice(1) + (S.paused ? ' · en pause' : S.speed > 1 ? ` · ×${S.speed}` : '');
    const crit = ag.active.filter((i) => i.sev === 'critique').length;
    const k = [
      ['Production', `${nf0.format(ag.total)}<small>MW</small>`, `${pct(ag.total / ag.cap, 0)} de la capacité`],
      ['Disponibilité', `${nf1.format(ag.avail * 100)}<small>%</small>`, `${ag.availUnits} / ${ag.units} unités`],
      ['Alarmes actives', `${ag.active.length}`, crit ? `<span class="crit-t">${crit} critique${crit > 1 ? 's' : ''}</span>` : 'aucune critique', crit ? 'k-crit' : ag.active.some((i) => i.sev === 'majeure') ? 'k-warn' : ''],
      ['Fréquence réseau', `${S.freq.toFixed(3).replace('.', ',')}<small>Hz</small>`, 'zone synchrone'],
      ['Prix spot', `${nf0.format(S.price)}<small>€/MWh</small>`, 'marché J'],
      ['CO₂ évité', `${nf0.format(ag.co2)}<small>t</small>`, 'depuis minuit'],
    ];
    $('#kpis').innerHTML = k.map(([l, v, s, cls]) => `<div class="kpi ${cls || ''}"><span class="kpi-l">${l}</span><span class="kpi-v">${v}</span><span class="kpi-s">${s}</span></div>`).join('');
    const b = $('#tabBadge'); b.textContent = ag.active.length; b.className = `tab-badge${crit ? ' crit' : ag.active.length ? ' warn' : ''}`;
    $('#btnPause').textContent = S.paused ? '▶' : '❚❚';
    $$('.tbtn.speed').forEach((x) => x.classList.toggle('on', +x.dataset.speed === S.speed && !S.paused));
  }

  // ------------------------------------------------------------ Indicateurs d'incident par parc
  function computeParkIncidents() {
    D.PARKS.forEach((p) => { p.incCount = 0; p.maxSev = null; });
    S.incidents.filter(S.isActive).forEach((inc) => {
      inc.parkIds.forEach((id) => { const p = D.byId[id]; p.incCount++; if (sevRank(inc.sev) > sevRank(p.maxSev)) p.maxSev = inc.sev; });
    });
  }

  // ------------------------------------------------------------ Fiche parc
  function focusPark(id, opts = {}) {
    const p = D.byId[id]; if (!p) return;
    if (UI.tab !== 'map') setTab('map');
    if (UI.park !== id) UI.unit = null;
    UI.park = id;
    const b = L.latLngBounds(p.zone).pad(p.tech === 'wind' ? 0.18 : 0.5);
    map.flyToBounds(b, { duration: opts.instant ? 0 : 1.4, maxZoom: p.n <= 5 ? 13 : p.tech === 'wind' ? 12.5 : 14, paddingTopLeft: [400, 20], paddingBottomRight: [20, 130] });
    renderParkCard(); renderUnitCard(); updateOverview();
  }
  function closePark() { UI.park = null; UI.unit = null; renderParkCard(); renderUnitCard(); updateDetail(true); updateOverview(); }
  function europe() {
    if (UI.tab !== 'map') setTab('map');
    UI.park = null; UI.unit = null; renderParkCard(); renderUnitCard();
    map.flyToBounds(allBounds, { ...EUROPE_PAD, duration: 1.4 });
  }
  function renderParkCard() {
    const box = $('#parkCard');
    const p = D.byId[UI.park];
    if (!p) { box.hidden = true; return; }
    box.hidden = false;
    if (box.dataset.id !== p.id) {
      box.dataset.id = p.id;
      box.innerHTML = `
        <header class="pc-h ${p.tech}"><div><div class="pc-kicker">${esc(p.kind)} · ${esc(p.country)}</div><h3>${esc(p.name)}</h3><div class="pc-sub">${esc(p.full)} · ${esc(p.model)} · mise en service ${p.year}</div></div><button class="x" data-act="close" title="Fermer">×</button></header>
        <div class="pc-kpis"></div>
        <div class="pc-sec"><div class="pc-sec-h"><span>Production 24 h</span><span class="lg-inline"><i style="background:${COL[p.tech]}"></i>Réel <i class="dash"></i>Prévision</span></div><div class="chart-box pc-chart"></div></div>
        <div class="pc-sec"><div class="pc-sec-h"><span>${p.tech === 'wind' ? 'Éoliennes' : 'Postes onduleurs'} (${p.n})</span><span class="pc-counts"></span></div><div class="pc-grid ${p.n > 40 ? 'dense' : ''}"></div></div>
        <div class="pc-sec pc-incs"></div>
        <div class="pc-actions"><button class="btn" data-act="inc">Créer un incident</button><button class="btn ghost" data-act="list">Incidents du site</button></div>`;
      box.querySelector('.pc-grid').innerHTML = p.units.map((u) => `<button class="cell" data-i="${u.idx}" title="${u.id}"></button>`).join('');
      box.onclick = (e) => {
        const a = e.target.closest('[data-act]');
        const cell = e.target.closest('.cell');
        const ir = e.target.closest('[data-inc]');
        if (cell) selectUnit(p.id, +cell.dataset.i);
        else if (ir) openIncident(ir.dataset.inc);
        else if (a && a.dataset.act === 'close') closePark();
        else if (a && a.dataset.act === 'inc') openDialog({ parkId: p.id });
        else if (a && a.dataset.act === 'list') { $('#fPark').value = p.id; setTab('inc'); }
      };
      box._chartAt = 0;
    }
    updateParkCard(true);
  }
  function updateParkCard(forceChart) {
    const box = $('#parkCard'), p = D.byId[UI.park];
    if (!p || box.hidden) return;
    const env = p.tech === 'wind'
      ? ['Vent moyen', `${nf1.format(p.vMean)}<small>m/s</small>`, `${dirArrow(p.dir)} · ${nf0.format(p.dir)}°`]
      : ['Ensoleillement', `${nf0.format(p.irr)}<small>W/m²</small>`, `${nf0.format(p.amb)} °C ambiant`];
    const k = [
      ['Production', `${mw(p.mw)}<small>MW</small>`, `sur ${mw(p.capMW)} MW`],
      ['Facteur de charge', `${nf0.format(p.lf * 100)}<small>%</small>`, 'instantané'],
      env,
      ['Disponibilité', `${nf1.format(p.avail * 100)}<small>%</small>`, `${Math.round(p.avail * p.n)} / ${p.n} unités`],
      ['Énergie du jour', `${nf0.format(p.energy)}<small>MWh</small>`, `${nf0.format(p.energy * D.CO2_T_PER_MWH)} t CO₂ évitées`],
      ['Revenu du jour', eur(p.revenue), `${nf0.format(S.price)} €/MWh`],
    ];
    $('.pc-kpis', box).innerHTML = k.map(([l, v, s]) => `<div class="pk-k"><span>${l}</span><b>${v}</b><em>${s}</em></div>`).join('');
    $$('.cell', box).forEach((c, i) => { const u = p.units[i]; const sev = flaggedSev(u); c.className = `cell st-${u.status}${sev ? ' al' : ''}${UI.unit === i ? ' sel' : ''}`; });
    const counts = Object.entries(p.counts).sort((a, b) => b[1] - a[1]).map(([st, n]) => `<span><i style="background:${COL[st]}"></i>${n} ${D.STATUS[st].label.toLowerCase()}</span>`).join('');
    $('.pc-counts', box).innerHTML = counts;
    const incs = S.incidents.filter((i) => S.isActive(i) && i.parkIds.includes(p.id));
    $('.pc-incs', box).innerHTML = incs.length
      ? `<div class="pc-sec-h"><span>Incidents actifs (${incs.length})</span></div>` + incs.slice(0, 4).map((i) => `<button class="mini-inc" data-inc="${i.id}"><span class="sev-pill sev-${i.sev}">${SEV_LABEL[i.sev]}</span><span class="mi-t">${esc(i.title)}</span><span class="mi-s">${S.STATUS_LABEL[i.status]}</span></button>`).join('')
      : '<div class="pc-ok">Aucun incident actif sur ce site.</div>';
    const now = performance.now();
    if (forceChart || now - box._chartAt > 5000) {
      box._chartAt = now;
      const H = S.hist, n = H.t.length, from = Math.max(0, n - 288);
      const t = H.t.slice(from).concat([S.t]);
      const vals = H.parks[p.id].slice(from).concat([p.mw]);
      const ft = []; const fv = [];
      for (let tt = t[0]; tt <= S.t + 6 * 3600e3; tt += 10 * 60e3) { ft.push(tt); fv.push(S.forecastMW(p, tt)); }
      C.timeChart($('.pc-chart', box), { t, tMax: S.t + 6 * 3600e3, nowT: S.t, unit: 'MW', padLeft: 38, yMax: niceCap(p.capMW),
        series: [{ label: 'Réel', color: COL[p.tech], values: vals, stack: true }, { label: 'Prévision', color: COL.forecast, values: fv, t: ft, dash: true, width: 1.2 }] });
    }
  }

  // ------------------------------------------------------------ Fiche unité
  function selectUnit(parkId, idx) {
    const p = D.byId[parkId];
    if (UI.park !== parkId) { UI.park = parkId; renderParkCard(); }
    UI.unit = idx;
    const u = p.units[idx];
    if (map.getZoom() < 11.5) map.flyTo([u.lat, u.lng], p.tech === 'wind' ? 12.5 : 14, { duration: 1 });
    renderUnitCard(); updateDetail(true); updateParkCard();
  }
  function renderUnitCard() {
    const box = $('#unitCard');
    const p = D.byId[UI.park];
    if (!p || UI.unit == null) { box.hidden = true; return; }
    box.hidden = false;
    const u = p.units[UI.unit];
    box.dataset.key = `${p.id}-${u.idx}`;
    box.innerHTML = `<header class="uc-h"><div><div class="pc-kicker">${esc(p.name)} · ${p.tech === 'wind' ? 'Éolienne' : 'Poste onduleur'}</div><h3>${u.id}</h3></div><span class="st-pill"></span><button class="x" data-act="close" title="Fermer">×</button></header>
      <div class="uc-rows"></div>
      <div class="uc-trend"><div class="pc-sec-h"><span>Puissance — dernières minutes</span><span class="uc-now"></span></div><div class="uc-spark"></div></div>
      <div class="uc-flags"></div>
      <div class="pc-actions"><button class="btn" data-act="inc">Créer un incident</button><button class="btn ghost" data-act="maint">Maintenance</button><button class="btn ghost" data-act="reset">Réarmer</button></div>`;
    box.onclick = (e) => {
      const a = e.target.closest('[data-act]'); const ir = e.target.closest('[data-inc]');
      if (ir) return openIncident(ir.dataset.inc);
      if (!a) return;
      if (a.dataset.act === 'close') { UI.unit = null; renderUnitCard(); updateDetail(true); updateParkCard(); }
      if (a.dataset.act === 'inc') openDialog({ parkId: p.id, unitIdx: u.idx });
      if (a.dataset.act === 'maint') S.createIncident({ type: 'maintenance', parkId: p.id, unitIdx: u.idx, source: 'Opérateur', manual: true });
      if (a.dataset.act === 'reset') S.resolveUnit(p.id, u.idx);
      refreshAll();
    };
    updateUnitCard();
  }
  function updateUnitCard() {
    const box = $('#unitCard'), p = D.byId[UI.park];
    if (!p || UI.unit == null || box.hidden) return;
    const u = p.units[UI.unit];
    const pill = $('.st-pill', box); pill.textContent = D.STATUS[u.status].label; pill.style.setProperty('--c', COL[u.status]);
    const rows = p.tech === 'wind' ? [
      ['Puissance', `${nf1.format(u.mw)} MW`, u.mw / p.unitMW],
      ['Vent nacelle', `${nf1.format(u.v)} m/s`, u.v / 25],
      ['Rotor', `${nf1.format(u.rpm)} tr/min`, u.rpm / 12],
      ['Angle de pas', `${nf1.format(u.pitch)}°`, u.pitch / 90],
      ['Orientation nacelle', `${nf0.format(u.yaw)}° ${dirArrow(u.yaw)}`, null],
      ['Temp. générateur', `${nf0.format(u.tGen)} °C`, u.tGen / 110, u.tGen > 85],
      ['Temp. roulement principal', `${nf0.format(u.tBear)} °C`, u.tBear / 90],
      ['Vibrations', `${nf1.format(u.vib)} mm/s`, u.vib / 10, u.vib > 6],
    ] : [
      ['Puissance AC', `${nf1.format(u.mw)} MW`, u.mw / p.unitMW],
      ['Puissance DC', `${nf1.format(u.dc)} MW`, u.dc / p.unitMW],
      ['Irradiance', `${nf0.format(u.irr)} W/m²`, u.irr / 1100],
      ['Rendement onduleur', u.eff ? pct(u.eff) : '—', u.eff],
      ['Temp. modules', `${nf0.format(u.tMod)} °C`, u.tMod / 80, u.tMod > 65],
      ['Temp. onduleur', `${nf0.format(u.tInv)} °C`, u.tInv / 80, u.tInv > 60],
      ['Propreté des modules', pct(u.soil, 0), u.soil],
      ['Capacité', `${nf1.format(p.unitMW)} MWc`, null],
    ];
    $('.uc-rows', box).innerHTML = rows.map(([l, v, r, warn]) => `<div class="uc-r${warn ? ' warn' : ''}"><span>${l}</span><b>${v}</b>${r != null ? `<i><em style="width:${Math.max(0, Math.min(1, r)) * 100}%"></em></i>` : '<i class="none"></i>'}</div>`).join('');
    $('.uc-now', box).textContent = `${nf1.format(u.mw)} MW`;
    $('.uc-spark', box).innerHTML = C.spark(u.trend, COL[p.tech], 300, 40, p.unitMW);
    const incs = Object.keys(u.flags).map((id) => S.incidents.find((i) => i.id === id)).filter(Boolean);
    $('.uc-flags', box).innerHTML = incs.map((i) => `<button class="mini-inc" data-inc="${i.id}"><span class="sev-pill sev-${i.sev}">${SEV_LABEL[i.sev]}</span><span class="mi-t">${i.code} · ${esc(i.title)}</span><span class="mi-s">${S.STATUS_LABEL[i.status]}</span></button>`).join('');
    $('[data-act="reset"]', box).disabled = !incs.length;
  }

  // ------------------------------------------------------------ Journal et notifications
  function renderJournal() {
    $('#journal').innerHTML = `<div class="j-h">Journal d’exploitation</div>` + S.log.slice(0, 5).map((e) => `<div class="j-r" ${e.incId ? `data-inc="${e.incId}"` : ''}><span class="j-t">${fmtHM.format(new Date(e.t))}</span><span class="sev-pill sev-${e.sev}">${SEV_LABEL[e.sev] || ''}</span><span class="j-x">${esc(e.text)}</span></div>`).join('');
  }
  $('#journal').addEventListener('click', (e) => { const r = e.target.closest('[data-inc]'); if (r) openIncident(r.dataset.inc); });
  function toast(inc) {
    const box = $('#toasts');
    const el = document.createElement('div');
    el.className = `toast sev-${inc.sev}`;
    el.innerHTML = `<div class="to-k"><span class="sev-pill sev-${inc.sev}">${SEV_LABEL[inc.sev]}</span><span>${inc.code}</span><span>${fmtHM.format(new Date(inc.createdAt))}</span></div><div class="to-t">${esc(inc.title)}</div><div class="to-w">${esc(inc.where)}</div><button class="btn sm">Voir l’incident</button>`;
    el.querySelector('button').onclick = () => { openIncident(inc.id); el.remove(); };
    box.prepend(el);
    while (box.children.length > 3) box.lastChild.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, 8000);
  }

  // ------------------------------------------------------------ Onglets
  function setTab(tab) {
    UI.tab = tab;
    $('#app').dataset.tab = tab;
    $$('.tab').forEach((t) => t.classList.toggle('on', t.dataset.tab === tab));
    if (tab === 'map') setTimeout(() => map.invalidateSize(), 30);
    if (tab === 'dash') renderDash();
    if (tab === 'inc') renderIncidents();
  }
  $$('.tab').forEach((t) => t.addEventListener('click', () => { hold(); setTab(t.dataset.tab); }));

  // ------------------------------------------------------------ Tableaux de bord
  function renderDash() {
    if (UI.tab !== 'dash') return;
    const ag = S.aggregates();
    const H = S.hist, n = H.t.length, from = Math.max(0, n - 288);
    const tiles = [
      ['Production instantanée', `${nf0.format(ag.total)} <small>MW</small>`, `${pct(ag.total / ag.cap, 0)} de ${nf0.format(ag.cap)} MW installés`, C.spark(H.wind.slice(from).map((v, i) => v + H.solar[from + i]), '#8fd0ff', 150, 30)],
      ['Énergie produite aujourd’hui', `${nf0.format(ag.energy)} <small>MWh</small>`, `éolien ${nf0.format(S.energy.wind)} · solaire ${nf0.format(S.energy.solar)}`],
      ['Facteur de charge', `${nf0.format((ag.total / ag.cap) * 100)} <small>%</small>`, `éolien ${pct(ag.wind / ag.capWind, 0)} · solaire ${pct(ag.solar / ag.capSolar, 0)}`],
      ['Disponibilité technique', `${nf1.format(ag.avail * 100)} <small>%</small>`, `objectif contractuel 97,0 %`, null, ag.avail < 0.97 ? 'warn' : 'good'],
      ['CO₂ évité aujourd’hui', `${nf0.format(ag.co2)} <small>t</small>`, `≈ ${nf0.format(ag.homes)} foyers alimentés en ce moment`],
      ['Revenus estimés du jour', eur(ag.revenue), `prix moyen ${nf0.format(ag.revenue / Math.max(1, ag.energy))} €/MWh`],
    ];
    $('#dashTiles').innerHTML = tiles.map(([l, v, s, sp, cls]) => `<div class="tile ${cls || ''}"><span class="tile-l">${l}</span><span class="tile-v">${v}</span><span class="tile-s">${s}</span>${sp ? `<span class="tile-sp">${sp}</span>` : ''}</div>`).join('');

    // production 24 h + prévision 6 h
    const t = H.t.slice(from).concat([S.t]);
    const ft = [], fw = [], fs = [];
    for (let tt = t[0]; tt <= S.t + 6 * 3600e3; tt += 10 * 60e3) {
      ft.push(tt);
      let w = 0, s = 0; D.PARKS.forEach((p) => { const v = S.forecastMW(p, tt); if (p.tech === 'wind') w += v; else s += v; });
      fw.push(w + s); fs.push(s);
    }
    C.timeChart($('#chProd'), { t, tMax: S.t + 6 * 3600e3, nowT: S.t, unit: 'MW', series: [
      { label: 'Solaire', color: COL.solar, values: H.solar.slice(from).concat([ag.solar]), stack: true },
      { label: 'Éolien', color: COL.wind, values: H.wind.slice(from).concat([ag.wind]), stack: true },
      { label: 'Prévision totale', color: COL.forecast, values: fw, t: ft, dash: true },
    ] });
    $('#lgProd').innerHTML = `<span><i style="background:${COL.wind}"></i>Éolien</span><span><i style="background:${COL.solar}"></i>Solaire</span><span><i class="dash"></i>Prévision</span>`;

    // mix
    const mixEl = $('#chMix');
    if (!mixEl.querySelector('.mix-d')) mixEl.innerHTML = '<div class="mix-d"></div><div class="mix-l"></div>';
    C.donut(mixEl.querySelector('.mix-d'), [{ label: 'Éolien', value: ag.wind, color: COL.wind }, { label: 'Solaire', value: ag.solar, color: COL.solar }], `${nf0.format(ag.total)} MW`, 'en ce moment');
    mixEl.querySelector('.mix-l').innerHTML = [
      ['Éolien en mer', ag.wind, COL.wind, ag.capWind], ['Solaire au sol', ag.solar, COL.solar, ag.capSolar],
    ].map(([l, v, c, cap]) => `<div class="ml"><i style="background:${c}"></i><span>${l}</span><b>${pct(v / Math.max(1, ag.total), 0)}</b><em>${nf0.format(v)} / ${nf0.format(cap)} MW</em></div>`).join('') + `<div class="ml sub"><span>Sites raccordés</span><b>20</b></div><div class="ml sub"><span>Unités en production</span><b>${D.PARKS.reduce((s, p) => s + (p.counts.prod || 0) + (p.counts.curt || 0), 0)}</b></div>`;

    // par pays
    const byC = {};
    D.PARKS.forEach((p) => { byC[p.country] = byC[p.country] || { w: 0, s: 0 }; byC[p.country][p.tech === 'wind' ? 'w' : 's'] += p.energy; });
    const arr = Object.entries(byC).sort((a, b) => b[1].w + b[1].s - (a[1].w + a[1].s));
    const maxC = Math.max(...arr.map(([, v]) => v.w + v.s));
    $('#chCountry').innerHTML = arr.map(([c, v]) => `<div class="hb"><div class="hb-l">${c}</div><div class="hb-track"><div class="hb-fill" style="width:${(v.w / maxC) * 100}%;background:${COL.wind}"></div><div class="hb-fill" style="width:${(v.s / maxC) * 100}%;background:${COL.solar}"></div></div><div class="hb-v">${nf0.format(v.w + v.s)}</div></div>`).join('');

    // prix
    C.timeChart($('#chPrice'), { t: H.t.slice(from).concat([S.t]), unit: '€/MWh', padLeft: 36, series: [{ label: 'Prix spot', color: COL.price, values: H.price.slice(from).concat([S.price]), area: true }] });
    $('#priceNow').textContent = `${nf0.format(S.price)} €/MWh maintenant`;

    // classement
    const rank = [...D.PARKS].sort((a, b) => b.lf - a.lf);
    $('#chRank').innerHTML = `<div class="rk rk-h"><span>#</span><span>Site</span><span>Facteur de charge</span><span>MW</span><span>Dispo</span></div>` + rank.map((p, i) => `<button class="rk" data-id="${p.id}"><span class="rk-n">${i + 1}</span><span class="rk-s"><i class="tdot ${p.tech}"></i>${esc(p.name)} <em>${p.cc}</em></span><span class="rk-b"><i style="width:${Math.min(100, p.lf * 100)}%;background:${COL[p.tech]}"></i><b>${nf0.format(p.lf * 100)} %</b></span><span class="rk-v">${mw(p.mw)}</span><span class="rk-v ${p.avail < 0.95 ? 'bad' : ''}">${nf1.format(p.avail * 100)} %</span></button>`).join('');

    // disponibilité
    C.hbars($('#chAvail'), [...D.PARKS].sort((a, b) => a.avail - b.avail).map((p) => ({ label: p.name, value: p.avail * 100, max: 100, mark: 97, color: p.avail < 0.95 ? COL.fault : p.avail < 0.97 ? COL.majeure : COL.ok, right: `${nf1.format(p.avail * 100)} %` })));

    // incidents 7 jours
    const today = { label: 'auj.', info: 0, mineure: 0, majeure: 0, critique: 0 };
    Object.entries(S.stats.bySev).forEach(([k, v]) => { today[k] = v; });
    const days = [...S.past7, today];
    C.columns($('#chInc7'), days.map((d) => d.label), ['info', 'mineure', 'majeure', 'critique'].map((k) => ({ label: SEV_LABEL[k], color: COL[k], values: days.map((d) => d[k]) })), { highlightLast: true });
    $('#lgInc').innerHTML = ['critique', 'majeure', 'mineure', 'info'].map((k) => `<span><i style="background:${COL[k]}"></i>${SEV_LABEL[k]}</span>`).join('');

    // types
    const types = Object.entries(S.stats.byType).sort((a, b) => b[1] - a[1]).slice(0, 8);
    if (types.length) C.hbars($('#chTypes'), types.map(([k, v]) => ({ label: D.INCIDENT_TYPES[k].label, value: v, color: D.INCIDENT_TYPES[k].tech === 'solar' ? COL.solar : D.INCIDENT_TYPES[k].tech === 'wind' ? COL.wind : COL.forecast })));
    else $('#chTypes').innerHTML = '<div class="empty">Aucun incident aujourd’hui.</div>';

    // exploitation
    const busy = S.assets.filter((a) => a.inc).length;
    const atSea = S.assets.filter((a) => a.kind === 'ctv' && a.state !== 'base').length;
    const durs = S.stats.durations;
    const mttr = durs.length ? durs.reduce((s, x) => s + x, 0) / durs.length : null;
    const ops = [
      ['Incidents actifs', ag.active.length, ag.active.filter((i) => i.sev === 'critique').length ? `${ag.active.filter((i) => i.sev === 'critique').length} critique(s)` : 'aucun critique'],
      ['Résolus aujourd’hui', S.stats.resolved, `${S.stats.created} ouverts depuis minuit`],
      ['Temps moyen de résolution', mttr == null ? '—' : `${nf0.format(mttr)} min`, 'MTTR, horloge de simulation'],
      ['Équipes mobilisées', `${busy} / ${S.assets.length}`, `${atSea} navire${atSea > 1 ? 's' : ''} en mer`],
      ['Unités indisponibles', ag.units - ag.availUnits, `sur ${ag.units}`],
      ['Événements météo', S.storms.length, S.storms.filter((s) => s.kind === 'storm').map((s) => s.name).join(', ') || 'aucune tempête'],
    ];
    $('#chOps').innerHTML = ops.map(([l, v, s]) => `<div class="op"><span>${l}</span><b>${v}</b><em>${esc(s)}</em></div>`).join('');
  }
  $('#chRank').addEventListener('click', (e) => { const r = e.target.closest('[data-id]'); if (r) focusPark(r.dataset.id); });

  // ------------------------------------------------------------ Vue incidents
  const parkSel = $('#fPark');
  parkSel.innerHTML += `<optgroup label="Solaire">${D.SOLAR.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</optgroup><optgroup label="Éolien">${D.WIND.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</optgroup>`;
  $('#fStatus').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; UI.fStatus = b.dataset.v; $$('#fStatus button').forEach((x) => x.classList.toggle('on', x === b)); renderIncidents(); });
  ['#fSev', '#fTech', '#fPark'].forEach((s) => $(s).addEventListener('change', renderIncidents));
  function filteredIncidents() {
    const sev = $('#fSev').value, tech = $('#fTech').value, park = $('#fPark').value;
    return S.incidents.filter((i) => {
      if (UI.fStatus === 'active' && !S.isActive(i)) return false;
      if (UI.fStatus === 'closed' && S.isActive(i)) return false;
      if (sev && i.sev !== sev) return false;
      if (park && !i.parkIds.includes(park)) return false;
      if (tech && !i.parkIds.some((id) => D.byId[id].tech === tech)) return false;
      return true;
    }).sort((a, b) => (S.isActive(b) - S.isActive(a)) || sevRank(b.sev) - sevRank(a.sev) || b.createdAt - a.createdAt);
  }
  function renderIncidents() {
    if (UI.tab !== 'inc') return;
    const ag = S.aggregates();
    const today = S.stats;
    const durs = today.durations;
    const enroute = ag.active.filter((i) => i.status === 'en route').length;
    const onsite = ag.active.filter((i) => i.status === 'sur site' || i.status === 'en cours').length;
    const sum = [
      ['Actifs', ag.active.length, ''], ['Critiques', ag.active.filter((i) => i.sev === 'critique').length, 'crit'], ['Majeurs', ag.active.filter((i) => i.sev === 'majeure').length, 'warn'],
      ['Équipes en route', enroute, ''], ['En intervention', onsite, ''], ['Résolus aujourd’hui', today.resolved, 'good'],
      ['MTTR', durs.length ? `${nf0.format(durs.reduce((s, x) => s + x, 0) / durs.length)} min` : '—', ''],
      ['Puissance indisponible', `${nf0.format(ag.active.reduce((s, i) => s + lostMW(i), 0))} MW`, ''],
    ];
    $('#incSum').innerHTML = sum.map(([l, v, c]) => `<div class="is ${c}"><span>${l}</span><b>${v}</b></div>`).join('');
    const list = filteredIncidents();
    $('#incEmpty').hidden = list.length > 0;
    $('#incRows').innerHTML = list.slice(0, 120).map((i) => {
      const a = S.assets.find((x) => x.id === i.asset);
      return `<tr data-id="${i.id}" class="${UI.incSel === i.id ? 'sel' : ''} ${S.isActive(i) ? '' : 'done'}">
        <td class="mono">${i.code}</td><td class="mono">${fmtHM.format(new Date(i.createdAt))}</td>
        <td><span class="sev-pill sev-${i.sev}">${SEV_LABEL[i.sev]}</span></td>
        <td><b>${esc(i.title)}</b></td><td>${esc(i.where)}</td>
        <td><span class="stt stt-${i.status.replace(/[^a-z]/g, '')}">${S.STATUS_LABEL[i.status]}</span></td>
        <td>${a ? esc(a.name) : '—'}</td><td class="mono">${dur((i.resolvedAt || S.t) - i.createdAt)}</td></tr>`;
    }).join('');
    if (!UI.incSel && list.length) UI.incSel = list[0].id;
    renderIncDetail();
  }
  $('#incRows').addEventListener('click', (e) => { const r = e.target.closest('tr'); if (!r) return; UI.incSel = r.dataset.id; renderIncidents(); });
  function lostMW(inc) {
    if (!S.isActive(inc)) return 0;
    let lost = 0;
    inc.targets.forEach((tg) => {
      const p = D.byId[tg.parkId];
      tg.units.forEach((idx) => {
        const u = p.units[idx];
        const pot = p.tech === 'wind' ? (u.env === 'prod' ? p.unitMW * S.powerCurve(u.v) : 0) : Math.min((u.dc || 0) * 0.98, p.unitMW * 0.94);
        lost += Math.max(0, pot - u.mw);
      });
    });
    return lost;
  }
  const STEPS = ['nouveau', 'acquitté', 'en route', 'sur site', 'en cours', 'résolu'];
  function renderIncDetail() {
    const box = $('#incDetail');
    const inc = S.incidents.find((i) => i.id === UI.incSel);
    if (!inc) { box.innerHTML = '<div class="empty">Sélectionnez un incident dans la liste.</div>'; return; }
    const a = S.assets.find((x) => x.id === inc.asset);
    const steps = inc.def.travel ? STEPS : ['nouveau', 'acquitté', 'en cours', 'résolu'];
    const cur = inc.status === 'clôturé' ? steps.length - 1 : inc.status === 'en attente' ? 1 : steps.indexOf(inc.status);
    const act = S.isActive(inc);
    box.innerHTML = `
      <header class="id-h sev-${inc.sev}"><div class="id-k"><span class="sev-pill sev-${inc.sev}">${SEV_LABEL[inc.sev]}</span><span class="mono">${inc.code}</span><span>${esc(inc.source)}</span></div><h3>${esc(inc.title)}</h3><div class="id-w">${esc(inc.where)}</div></header>
      <ol class="stepper">${steps.map((s, k) => `<li class="${k < cur ? 'done' : k === cur ? 'cur' : ''}"><i></i><span>${S.STATUS_LABEL[s].replace('Intervention en cours', 'Intervention')}</span></li>`).join('')}</ol>
      <p class="id-d">${esc(inc.desc)}</p>
      <div class="id-facts">
        <div><span>Ouvert à</span><b>${fmtClock.format(new Date(inc.createdAt))}</b></div>
        <div><span>Durée</span><b>${dur((inc.resolvedAt || S.t) - inc.createdAt)}</b></div>
        <div><span>Unités touchées</span><b>${inc.nUnits || '—'}</b></div>
        <div><span>Puissance indisponible</span><b>${act ? `${nf1.format(lostMW(inc))} MW` : '—'}</b></div>
        <div><span>Équipe</span><b>${a ? esc(a.name) : inc.def.travel ? 'Non engagée' : 'Sans déplacement'}</b></div>
        <div><span>Statut</span><b>${S.STATUS_LABEL[inc.status]}</b></div>
      </div>
      <div class="id-actions">
        <button class="btn" data-act="ack" ${inc.status === 'nouveau' ? '' : 'disabled'}>Acquitter</button>
        <button class="btn" data-act="dispatch" ${act && inc.def.travel && !inc.asset ? '' : 'disabled'}>Engager une équipe</button>
        <button class="btn primary" data-act="resolve" ${act ? '' : 'disabled'}>Clôturer</button>
        <button class="btn ghost" data-act="map">Voir sur la carte</button>
      </div>
      <div class="pc-sec-h"><span>Main courante</span></div>
      <ul class="timeline">${[...inc.timeline].reverse().map((e) => `<li><span class="mono">${fmtClock.format(new Date(e.t))}</span><span>${esc(e.text)}</span></li>`).join('')}</ul>`;
    box.onclick = (e) => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      if (b.dataset.act === 'ack') S.ack(inc.id);
      if (b.dataset.act === 'dispatch') S.dispatch(inc.id);
      if (b.dataset.act === 'resolve') S.resolve(inc.id, 'Clôture manuelle par l’opérateur.');
      if (b.dataset.act === 'map') showIncidentOnMap(inc);
      refreshAll();
    };
  }
  function openIncident(id) {
    UI.incSel = id;
    $('#fPark').value = ''; $('#fSev').value = ''; $('#fTech').value = '';
    const inc = S.incidents.find((i) => i.id === id);
    if (inc && !S.isActive(inc)) { UI.fStatus = 'all'; $$('#fStatus button').forEach((x) => x.classList.toggle('on', x.dataset.v === 'all')); }
    setTab('inc');
  }
  function showIncidentOnMap(inc) {
    const tg = inc.targets[0];
    focusPark(tg.parkId);
    if (tg.units.length && inc.def.scope !== 'park') setTimeout(() => selectUnit(tg.parkId, tg.units[0]), 1500);
  }

  // ------------------------------------------------------------ Création d'incident
  const dlg = $('#incDialog');
  const niPark = $('#niPark'), niType = $('#niType'), niUnit = $('#niUnit');
  niPark.innerHTML = `<optgroup label="Solaire">${D.SOLAR.map((p) => `<option value="${p.id}">${esc(p.name)} (${p.cc})</option>`).join('')}</optgroup><optgroup label="Éolien en mer">${D.WIND.map((p) => `<option value="${p.id}">${esc(p.name)} (${p.cc})</option>`).join('')}</optgroup>`;
  function fillDialog(unitIdx) {
    const p = D.byId[niPark.value];
    const types = Object.entries(D.INCIDENT_TYPES).filter(([, d]) => !d.auto && (d.tech === 'both' || d.tech === p.tech));
    const prev = niType.value;
    niType.innerHTML = types.map(([k, d]) => `<option value="${k}">${esc(d.label)}</option>`).join('');
    if (types.some(([k]) => k === prev)) niType.value = prev;
    niUnit.innerHTML = '<option value="">Automatique</option>' + p.units.map((u) => `<option value="${u.idx}">${u.id} — ${D.STATUS[u.status].label}</option>`).join('');
    if (unitIdx != null) niUnit.value = unitIdx;
  }
  niPark.addEventListener('change', () => fillDialog());
  function openDialog(o = {}) {
    hold();
    niPark.value = o.parkId || UI.park || D.WIND[0].id;
    fillDialog(o.unitIdx);
    $('#niSev').value = ''; $('#niDesc').value = '';
    dlg.showModal();
  }
  $('#niCancel').addEventListener('click', () => dlg.close());
  $('#incForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const inc = S.createIncident({ type: niType.value, parkId: niPark.value, unitIdx: niUnit.value === '' ? null : +niUnit.value, sev: $('#niSev').value || undefined, desc: $('#niDesc').value.trim() || undefined, source: 'Opérateur', manual: true });
    dlg.close();
    if (inc) { UI.incSel = inc.id; refreshAll(); }
  });
  $('#btnNewInc').addEventListener('click', () => openDialog());
  $('#btnNewInc2').addEventListener('click', () => openDialog({ parkId: $('#fPark').value || undefined }));
  $('#btnEurope').addEventListener('click', () => { hold(); europe(); });

  // ------------------------------------------------------------ Légende
  $('#legend').innerHTML = ['prod', 'curt', 'storm', 'maint', 'fault', 'offline', 'low'].map((s) => `<span><i style="background:${COL[s]}"></i>${s === 'low' ? 'À l’arrêt (vent / nuit)' : D.STATUS[s].label}</span>`).join('');

  // ------------------------------------------------------------ Visite automatique
  let tourTimer = null, tourIdx = 0, tourPlan = [];
  function hold() { if (UI.tour) { UI.holdUntil = Date.now() + 90e3; } }
  function buildTourPlan() {
    const act = S.incidents.filter(S.isActive);
    const hot = act.filter((i) => i.type !== 'storm_stop').sort((a, b) => sevRank(b.sev) - sevRank(a.sev))[0];
    const wind = [...D.WIND].sort((a, b) => b.mw - a.mw);
    const solar = [...D.SOLAR].sort((a, b) => b.mw - a.mw);
    const pickW = wind[Math.floor(Math.random() * Math.min(4, wind.length))];
    const pickS = solar[0].mw > 1 ? solar[Math.floor(Math.random() * 3)] : null;
    const plan = [
      { label: 'Vue Europe', dur: 24, run: () => europe() },
      { label: `Parc éolien de ${pickW.name}`, dur: 22, run: () => focusPark(pickW.id) },
      { label: 'Tableaux de bord', dur: 26, run: () => setTab('dash') },
    ];
    if (hot) plan.push({ label: `Incident ${hot.code}`, dur: 22, run: () => { if (S.isActive(hot)) showIncidentOnMap(hot); } });
    if (pickS) plan.push({ label: `Centrale solaire de ${pickS.name}`, dur: 20, run: () => focusPark(pickS.id) });
    plan.push({ label: 'Suivi des incidents', dur: 18, run: () => { UI.incSel = null; UI.fStatus = 'active'; $$('#fStatus button').forEach((x) => x.classList.toggle('on', x.dataset.v === 'active')); setTab('inc'); } });
    return plan;
  }
  function tourStep() {
    clearTimeout(tourTimer);
    if (!UI.tour) return;
    if (Date.now() < UI.holdUntil) {
      $('#tourText').textContent = `Visite automatique en pause — reprise dans ${Math.ceil((UI.holdUntil - Date.now()) / 1000)} s`;
      tourTimer = setTimeout(tourStep, 1000); return;
    }
    if (tourIdx >= tourPlan.length) { tourPlan = buildTourPlan(); tourIdx = 0; }
    const st = tourPlan[tourIdx++];
    $('#tourText').textContent = `Visite automatique · ${st.label}`;
    try { st.run(); } catch (e) { console.error(e); }
    tourTimer = setTimeout(tourStep, st.dur * 1000);
  }
  function setTour(on) {
    UI.tour = !!on; UI.holdUntil = 0;
    $('#tourChip').hidden = !UI.tour;
    if (UI.tour) { tourPlan = buildTourPlan(); tourIdx = 0; tourStep(); } else clearTimeout(tourTimer);
  }
  ['mousedown', 'wheel', 'keydown', 'touchstart'].forEach((ev) => document.addEventListener(ev, (e) => { if (e.isTrusted) hold(); }, { passive: true }));

  // ------------------------------------------------------------ Événements du moteur
  S.on('incident:new', (inc) => {
    computeParkIncidents();
    if (inc.sev === 'critique' || inc.sev === 'majeure') toast(inc);
    if (inc.sev === 'critique' && UI.autofocus && !inc.manual) {
      UI.holdUntil = Date.now() + 25e3;
      if (inc.type === 'storm_stop') focusPark(inc.parkId); else showIncidentOnMap(inc);
    }
    refreshAll();
  });
  S.on('incident:update', () => { computeParkIncidents(); });
  S.on('log', () => renderJournal());
  S.on('storm', () => updateWeather());
  S.on('jump', () => refreshAll(true));
  S.on('reset', () => {
    UI.incSel = null; UI.park = null; UI.unit = null;
    buildAssetMarkers();
    L_inc.clearLayers(); Object.keys(incMarkers).forEach((k) => delete incMarkers[k]);
    computeParkIncidents(); refreshAll(true);
  });

  let tickN = 0;
  S.on('tick', (ag) => {
    tickN++;
    computeParkIncidents();
    updateTop(ag);
    if (UI.tab === 'map') {
      updateLists(ag); updateOverview(); updateDetail(); updateWeather(); updateIncMarkers();
      if (tickN % 2 === 0) { updateParkCard(); updateUnitCard(); }
      if (tickN % 20 === 1) updateSparks();
    } else if (UI.tab === 'dash') { if (tickN % 6 === 0) renderDash(); }
    else if (UI.tab === 'inc') { if (tickN % 2 === 0) renderIncidents(); }
    if (tickN % 2 === 0) broadcastState(ag);
  });
  function refreshAll(full) {
    const ag = S.aggregates();
    computeParkIncidents();
    updateTop(ag); updateLists(ag); updateOverview(); updateDetail(true); updateWeather(); updateIncMarkers(); renderJournal();
    if (full) { updateSparks(); renderParkCard(); }
    updateParkCard(true); updateUnitCard();
    if (UI.tab === 'dash') renderDash();
    if (UI.tab === 'inc') renderIncidents();
    broadcastState(ag);
  }

  // ------------------------------------------------------------ Régie (commandes à distance)
  function broadcastState(ag) {
    ag = ag || S.aggregates();
    BUS.send('state', {
      t: S.t, speed: S.speed, paused: S.paused, activity: S.activity, autopilot: S.autopilot, tour: UI.tour, autofocus: UI.autofocus, tab: UI.tab, park: UI.park,
      total: ag.total, wind: ag.wind, solar: ag.solar, cap: ag.cap, avail: ag.avail, price: S.price, freq: S.freq, co2: ag.co2,
      storms: S.storms.map((s) => ({ name: s.name, region: s.region, kind: s.kind, progress: s.progress })), heat: !!S.heat,
      incidents: ag.active.slice(0, 30).map((i) => ({ id: i.id, code: i.code, sev: i.sev, title: i.title, where: i.where, status: S.STATUS_LABEL[i.status], raw: i.status })),
      log: S.log.slice(0, 8).map((e) => ({ t: e.t, sev: e.sev, text: e.text })),
    });
  }
  function command(c) {
    const a = c.args || {};
    switch (c.cmd) {
      case 'hello': break;
      case 'tab': setTab(a.tab); break;
      case 'europe': europe(); break;
      case 'focus': focusPark(a.parkId); break;
      case 'focusUnit': focusPark(a.parkId); setTimeout(() => selectUnit(a.parkId, +a.unitIdx), 1500); break;
      case 'tour': setTour(a.on); break;
      case 'autofocus': UI.autofocus = !!a.on; break;
      case 'speed': S.speed = +a.v; S.paused = false; break;
      case 'pause': S.paused = a.on != null ? !!a.on : !S.paused; break;
      case 'timeofday': S.setTimeOfDay(+a.h); break;
      case 'activity': S.activity = a.level; break;
      case 'autopilot': S.autopilot = !!a.on; break;
      case 'scenario': S.scenario(a.name, a.arg); break;
      case 'incident': {
        const inc = a.random ? S.randomIncident('Régie') : S.createIncident({ type: a.type, parkId: a.parkId, unitIdx: a.unitIdx === '' || a.unitIdx == null ? null : +a.unitIdx, sev: a.sev || undefined, desc: a.desc || undefined, source: 'Régie' });
        if (inc && a.show) showIncidentOnMap(inc);
        break;
      }
      case 'ack': S.ack(a.id); break;
      case 'dispatch': S.dispatch(a.id); break;
      case 'resolve': S.resolve(a.id, 'Clôture demandée par la régie.'); break;
      case 'openIncident': openIncident(a.id); break;
      case 'reset': S.reset(); europe(); break;
      default: return;
    }
    refreshAll();
  }
  BUS.on((msg) => { if (msg.type === 'cmd') command(msg.payload); });

  // ------------------------------------------------------------ Commandes locales
  $('#btnPause').addEventListener('click', () => { S.paused = !S.paused; refreshAll(); });
  $$('.tbtn.speed').forEach((b) => b.addEventListener('click', () => { S.speed = +b.dataset.speed; S.paused = false; refreshAll(); }));
  $('.regie-link').addEventListener('click', (e) => { e.preventDefault(); window.open('regie.html', 'bps-regie', 'width=1280,height=880'); });
  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, select, textarea, dialog[open]')) return;
    const k = e.key.toLowerCase();
    if (e.code === 'Space') { e.preventDefault(); S.paused = !S.paused; }
    else if (['1', '2', '3', '4'].includes(k)) { S.speed = [1, 10, 60, 300][+k - 1]; S.paused = false; }
    else if (k === 'e') europe();
    else if (k === 'n') openDialog();
    else if (k === 'i') S.randomIncident('Opérateur');
    else if (k === 't') setTour(!UI.tour);
    else if (k === 'c') setTab('map');
    else if (k === 'd') setTab('dash');
    else if (k === 'a') setTab('inc');
    else if (k === 'r') window.open('regie.html', 'bps-regie', 'width=1280,height=880');
    else if (k === 'escape') { if (UI.unit != null) { UI.unit = null; renderUnitCard(); updateDetail(true); } else closePark(); }
    else return;
    refreshAll();
  });

  // ------------------------------------------------------------ Paramètres d'URL
  const q = new URLSearchParams(location.search);
  if (q.has('vitesse')) S.speed = Math.max(1, +q.get('vitesse') || 1);
  if (q.has('activite')) S.activity = q.get('activite');
  if (q.has('heure')) S.setTimeOfDay(+q.get('heure'));

  // ------------------------------------------------------------ Démarrage
  buildLists();
  setTab(q.get('onglet') || 'map');
  computeParkIncidents();
  refreshAll(true);
  if (q.get('visite') === '1') setTour(true);
  function frame() { S.step(); updateAssets(); requestAnimationFrame(frame); }
  requestAnimationFrame(frame);
  // continue de tourner si l'onglet passe en arrière-plan
  setInterval(() => { if (document.hidden) { S.step(); } }, 1000);
  window.addEventListener('resize', () => { if (UI.tab === 'dash') renderDash(); updateParkCard(true); });
  window.BPS.ui = { focusPark, europe, setTab, setTour, openIncident, UI };
})();
