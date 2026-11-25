/* Moteur de simulation : météo, production, unités, incidents, équipes et historique. */
(function () {
  'use strict';
  const BPS = (window.BPS = window.BPS || {});
  const D = BPS.data;
  const T = D.INCIDENT_TYPES;

  const HOUR = 3600e3, STEP = 5 * 60e3, HIST_MAX = 576; // 48 h à 5 min
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const toRad = (d) => (d * Math.PI) / 180;
  function distKm(a, b) {
    const dLat = toRad(b[0] - a[0]), dLng = toRad(b[1] - a[1]);
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
    return 12742 * Math.asin(Math.sqrt(s));
  }
  function weightedPick(items, wf) {
    const tot = items.reduce((s, x) => s + wf(x), 0);
    let r = Math.random() * tot;
    for (const x of items) { r -= wf(x); if (r <= 0) return x; }
    return items[items.length - 1];
  }

  // ------------------------------------------------------------ Heure de Paris
  const fmtParts = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  function paris(t) {
    const o = {};
    fmtParts.formatToParts(new Date(t)).forEach((p) => { o[p.type] = p.value; });
    const h = +o.hour + +o.minute / 60;
    return { h, day: `${o.year}-${o.month}-${o.day}` };
  }

  // ------------------------------------------------------------ Modèles physiques
  function seed(p) { return p.lat * 0.37 + p.lng * 0.21; }
  function baseWind(p, t) {
    const h = t / HOUR, s = seed(p);
    const bias = p.sea === 'Mer du Nord' ? 0.9 : p.sea === 'Méditerranée' ? -0.4 : 0;
    return clamp(9.4 + bias + 3.3 * Math.sin(h / 9.1 + s) + 2.2 * Math.sin(h / 3.7 + 2.3 * s) + 1.2 * Math.sin(h / 1.3 + 5.1 * s) + 0.5 * Math.sin(h * 1.9 + 7 * s), 0.4, 40);
  }
  function windDir(p, t) { const h = t / HOUR, s = seed(p); return (250 + 45 * Math.sin(h / 11 + s) + 15 * Math.sin(h / 2.9 + s) + 360) % 360; }
  function powerCurve(v) {
    if (v < 3 || v >= 25) return 0;
    if (v >= 12.5) return 1;
    return (v ** 3 - 27) / (12.5 ** 3 - 27);
  }
  function sunFactor(lat, lng, t) {
    const d = new Date(t);
    const start = Date.UTC(d.getUTCFullYear(), 0, 0);
    const doy = (t - start) / 86400e3;
    const dec = toRad(-23.44 * Math.cos(((2 * Math.PI) / 365) * (doy + 10)));
    const utcH = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
    const ha = toRad((utcH + lng / 15 - 12) * 15);
    const sinE = Math.sin(toRad(lat)) * Math.sin(dec) + Math.cos(toRad(lat)) * Math.cos(dec) * Math.cos(ha);
    return sinE <= 0 ? 0 : Math.pow(sinE, 0.92);
  }
  function baseCloud(p, t) {
    const h = t / HOUR, s = seed(p);
    return clamp(0.74 + (46 - p.lat) * 0.012 + 0.17 * Math.sin(h / 5.3 + s) + 0.1 * Math.sin(h / 1.7 + 3 * s) + 0.05 * Math.sin(h * 2.3 + s), 0.15, 1);
  }
  function ambient(p, t) {
    const ph = paris(t).h;
    return 9 + (47 - p.lat) * 0.65 + 4.5 * Math.sin(((ph - 9) / 24) * 2 * Math.PI) + 1.2 * Math.sin(t / HOUR / 7 + seed(p));
  }
  function parkModelMW(p, t) {
    if (p.tech === 'wind') return p.capMW * powerCurve(baseWind(p, t)) * 0.955;
    return p.capMW * sunFactor(p.lat, p.lng, t) * baseCloud(p, t) * 0.86;
  }
  function forecastMW(p, t) {
    const h = t / HOUR, s = seed(p);
    const err = p.tech === 'wind' ? 0.1 * Math.sin(h / 6.3 + 3 * s) + 0.05 * Math.sin(h / 2.1 + s) : 0.06 * Math.sin(h / 4.4 + 2 * s);
    return Math.max(0, parkModelMW(p, t - 25 * 60e3) * (1 + err));
  }
  function spotPrice(t) {
    const h = paris(t).h, x = t / HOUR;
    const v = 72 + 34 * Math.exp(-(((h - 8.5) / 1.8) ** 2)) + 48 * Math.exp(-(((h - 19) / 2) ** 2)) - 26 * Math.exp(-(((h - 13.5) / 2.6) ** 2)) - 18 * Math.exp(-(((h - 3.5) / 2.5) ** 2)) + 7 * Math.sin(x / 3.1) + 4 * Math.sin(x * 1.7);
    return clamp(v, 4, 260);
  }

  // ------------------------------------------------------------ État
  const S = (BPS.sim = {
    t: Date.now(), speed: 1, paused: false, activity: 'normal', autopilot: true,
    storms: [], heat: null, incidents: [], log: [], assets: [], incSeq: 0, stormSeq: 0,
    hist: null, energy: null, stats: null, past7: [], price: 0, freq: 50, listeners: {},
    timers: { inc: 25, storm: 600, cloud: 300, maint: 200 },
    OPS_SCALE: 20,
    paris, distKm, powerCurve, parkModelMW, forecastMW, spotPrice, sunFactor,
  });
  S.on = (ev, fn) => { (S.listeners[ev] = S.listeners[ev] || []).push(fn); };
  S.emit = (ev, data) => { (S.listeners[ev] || []).forEach((fn) => { try { fn(data); } catch (e) { console.error(e); } }); };

  function initUnits() {
    D.PARKS.forEach((p) => {
      p.units.forEach((u) => {
        Object.assign(u, { flags: {}, status: 'prod', mw: 0, wf: rnd(0.9, 1.04), latch: false, trend: [],
          tGen: 40, tBear: 35, vib: 1, tInv: 30, tMod: 20, eff: 0.98, noise: rnd(0, 100), soil: rnd(0.97, 1) });
      });
      Object.assign(p, { mw: 0, avail: 1, counts: {}, energy: 0, revenue: 0, incCount: 0, maxSev: null });
    });
  }

  function initAssets() {
    S.assets = [];
    let vi = 0;
    D.WIND.forEach((p) => {
      const k = p.n >= 40 ? 2 : 1;
      for (let i = 0; i < k; i++) {
        const base = D.offset(p.port.lat, p.port.lng, (i - (k - 1) / 2) * 0.5, -0.25);
        S.assets.push({ id: `CTV-${p.id}-${i + 1}`, name: `BPS ${D.VESSEL_NAMES[vi++ % D.VESSEL_NAMES.length]}`, kind: 'ctv', home: p.id, base, lat: base[0], lng: base[1], state: 'base', heading: 0, inc: null, speed: (46 / 3600) * S.OPS_SCALE });
      }
    });
    D.SOLAR.forEach((p) => {
      const base = [p.port.lat, p.port.lng];
      const k = p.n >= 25 ? 2 : 1;
      for (let i = 0; i < k; i++) {
        const b = D.offset(base[0], base[1], i * 0.3, 0);
        S.assets.push({ id: `VAN-${p.id}-${i + 1}`, name: `Équipe ${p.town}${k > 1 ? ' ' + (i + 1) : ''}`, kind: 'van', home: p.id, base: b, lat: b[0], lng: b[1], state: 'base', heading: 0, inc: null, speed: (65 / 3600) * S.OPS_SCALE });
      }
    });
  }

  function initHistory() {
    const now = S.t, start = Math.floor((now - 24 * HOUR) / STEP) * STEP;
    S.hist = { t: [], wind: [], solar: [], price: [], fcWind: [], fcSolar: [], parks: {} };
    D.PARKS.forEach((p) => { S.hist.parks[p.id] = []; });
    for (let t = start; t <= now; t += STEP) pushSample(t, true);
    S.lastSample = S.hist.t[S.hist.t.length - 1];
    // énergie depuis minuit (heure de Paris)
    const day = paris(now).day;
    S.energy = { day, wind: 0, solar: 0, revenue: 0 };
    D.PARKS.forEach((p) => { p.energy = 0; p.revenue = 0; });
    for (let t = now - 24 * HOUR; t < now; t += STEP) {
      if (paris(t).day !== day) continue;
      const pr = spotPrice(t);
      D.PARKS.forEach((p) => {
        const e = (parkModelMW(p, t) * 0.97 * STEP) / HOUR;
        p.energy += e; p.revenue += e * pr; S.energy[p.tech] += e; S.energy.revenue += e * pr;
      });
    }
  }
  function pushSample(t, model) {
    let w = 0, s = 0, fw = 0, fs = 0;
    D.PARKS.forEach((p) => {
      const mw = model ? parkModelMW(p, t) * rnd(0.95, 0.99) : p.mw;
      const arr = S.hist.parks[p.id];
      arr.push(mw); if (arr.length > HIST_MAX) arr.shift();
      if (p.tech === 'wind') { w += mw; fw += forecastMW(p, t); } else { s += mw; fs += forecastMW(p, t); }
    });
    const H = S.hist;
    H.t.push(t); H.wind.push(w); H.solar.push(s); H.price.push(spotPrice(t)); H.fcWind.push(fw); H.fcSolar.push(fs);
    if (H.t.length > HIST_MAX) ['t', 'wind', 'solar', 'price', 'fcWind', 'fcSolar'].forEach((k) => H[k].shift());
  }

  function initStats() {
    S.stats = { created: 0, byType: {}, bySev: { info: 0, mineure: 0, majeure: 0, critique: 0 }, byPark: {}, durations: [], resolved: 0 };
    // historique synthétique des 7 derniers jours
    S.past7 = [];
    for (let d = 7; d >= 1; d--) {
      const day = new Date(S.t - d * 24 * HOUR);
      S.past7.push({ label: day.toLocaleDateString('fr-FR', { weekday: 'short', timeZone: 'Europe/Paris' }).replace('.', ''),
        info: Math.round(rnd(3, 9)), mineure: Math.round(rnd(6, 16)), majeure: Math.round(rnd(2, 8)), critique: Math.round(rnd(0, 2.4)), avail: rnd(96.2, 99.1) });
    }
  }

  // ------------------------------------------------------------ Tempêtes et événements météo
  function stormEnvelope(st) { return Math.pow(Math.sin(Math.PI * clamp(st.progress, 0, 1)), 0.7); }
  function stormAt(st) { const k = st.progress; return [st.from[0] + (st.to[0] - st.from[0]) * k, st.from[1] + (st.to[1] - st.from[1]) * k]; }
  function stormEffect(p) {
    let boost = 0, cloudCut = 0;
    S.storms.forEach((st) => {
      const d = distKm([p.lat, p.lng], [st.lat, st.lng]);
      const g = Math.exp(-((d / st.radius) ** 2)) * stormEnvelope(st);
      boost += st.boost * g; cloudCut = Math.max(cloudCut, st.cloudCut * g);
    });
    return { boost, cloudCut };
  }
  S.addStorm = function (pathKey, opts = {}) {
    const keys = Object.keys(D.STORM_PATHS);
    const path = D.STORM_PATHS[pathKey] || D.STORM_PATHS[pick(keys)];
    const name = D.STORM_NAMES[S.stormSeq++ % D.STORM_NAMES.length];
    const jitter = () => rnd(-0.6, 0.6);
    const st = { id: 'ST' + S.stormSeq, kind: 'storm', name: `Tempête ${name}`, region: path.label,
      from: [path.from[0] + jitter(), path.from[1] + jitter()], to: [path.to[0] + jitter(), path.to[1] + jitter()],
      radius: path.radius, boost: path.boost * rnd(0.95, 1.12), cloudCut: 0.75, progress: 0, duration: opts.duration || rnd(480, 720) };
    Object.assign(st, { lat: st.from[0], lng: st.from[1] });
    S.storms.push(st);
    const gust = Math.round((9 + st.boost) * 3.6 * 1.35);
    log('majeure', `Avis de ${st.name.toLowerCase()} — ${path.label}, rafales jusqu’à ${gust} km/h attendues.`);
    S.emit('storm', st);
    return st;
  };
  S.addCloud = function (region) {
    const paths = { iberia: { from: [36.2, -10], to: [41.5, -0.5], label: 'péninsule Ibérique' }, france: { from: [43.5, -3], to: [49.5, 8], label: 'France' }, east: { from: [37.5, 9], to: [44, 24], label: 'Méditerranée orientale' } };
    const path = paths[region] || paths.iberia;
    const st = { id: 'CL' + ++S.stormSeq, kind: 'cloud', name: 'Passage nuageux', region: path.label, from: path.from, to: path.to, radius: 260, boost: 0, cloudCut: 0.82, progress: 0, duration: rnd(420, 600) };
    Object.assign(st, { lat: st.from[0], lng: st.from[1] });
    S.storms.push(st);
    log('info', `Passage nuageux prévu sur ${path.label} — baisse de production solaire attendue.`);
    S.emit('storm', st);
  };
  S.startHeat = function () {
    const ccs = ['ES', 'PT', 'IT', 'GR'];
    S.heat = { left: 360, ccs };
    log('mineure', 'Épisode de forte chaleur sur le sud de l’Europe — surveillance des températures onduleurs.');
    D.SOLAR.filter((p) => ccs.includes(p.cc)).forEach((p, i) => setTimeout(() => S.createIncident({ type: 'thermal', parkId: p.id, source: 'Supervision' }), 1500 * i));
  };

  // ------------------------------------------------------------ Calcul des unités
  function unitFlag(u) {
    let st = null, factor = 1, prio = 0;
    for (const k in u.flags) {
      const f = u.flags[k];
      factor = Math.min(factor, f.factor);
      const pr = D.STATUS_PRIO[f.status] || 0;
      if (pr > prio) { prio = pr; st = f.status; }
    }
    return { st, factor };
  }
  function updateParks(dtSim) {
    const t = S.t;
    D.PARKS.forEach((p) => {
      const eff = stormEffect(p);
      const amb = ambient(p, t) + (S.heat && S.heat.ccs.includes(p.cc) ? 11 : 0);
      p.amb = amb;
      let mw = 0, availN = 0, sumV = 0;
      const counts = {};
      if (p.tech === 'wind') {
        const vBase = baseWind(p, t) + eff.boost;
        p.dir = windDir(p, t);
        p.v = vBase;
        p.units.forEach((u) => {
          const gust = 0.5 * Math.sin(t / 37e3 + u.noise) + 0.3 * Math.sin(t / 11e3 + u.noise * 2);
          const v = Math.max(0, vBase * u.wf + gust);
          u.v = v; sumV += v;
          if (v > 25) u.latch = true; else if (u.latch && v < 21) u.latch = false;
          const env = u.latch ? 'storm' : v < 3 ? 'low' : 'prod';
          const f = unitFlag(u);
          u.env = env;
          u.status = f.st || env;
          let out = env === 'prod' ? p.unitMW * powerCurve(v) : 0;
          out *= f.factor;
          if (f.st && f.st !== 'curt') out = 0;
          u.mw = out;
          const load = out / p.unitMW;
          const running = out > 0.01;
          u.rpm = running ? Math.min(11.8, 2.6 + 0.72 * v) * (f.st === 'curt' ? 0.88 : 1) : env === 'low' && !f.st ? 0.6 : 0;
          u.pitch = !running ? 88 : v > 12.5 ? Math.min(28, (v - 12.5) * 1.9) : 0;
          u.yaw = (p.dir + (u.noise % 6) - 3 + 360) % 360;
          const genTarget = amb + 16 + 44 * load + (u.flags && Object.values(u.flags).some((x) => x.type === 'gen_temp') ? 38 : 0);
          u.tGen += (genTarget - u.tGen) * 0.06;
          u.tBear += (amb + 12 + 22 * load - u.tBear) * 0.04;
          const overs = Object.values(u.flags).some((x) => x.type === 'overspeed');
          u.vib = overs ? 7.5 + Math.random() * 1.5 : 0.5 + 2.1 * load + 0.25 * Math.random();
          mw += out;
          if (D.STATUS[u.status].avail) availN++;
          counts[u.status] = (counts[u.status] || 0) + 1;
        });
        p.vMean = sumV / p.n;
      } else {
        const sun = sunFactor(p.lat, p.lng, t);
        const cloud = baseCloud(p, t) * (1 - eff.cloudCut);
        const irrBase = 1000 * sun * cloud;
        p.irr = irrBase;
        p.units.forEach((u) => {
          const irr = Math.max(0, irrBase * (1 + 0.03 * Math.sin(t / 23e3 + u.noise)));
          u.irr = irr;
          const env = irrBase < 8 ? 'night' : 'prod';
          const f = unitFlag(u);
          u.env = env; u.status = f.st || env;
          u.tMod = amb + irr * 0.029;
          const dc = env === 'prod' ? p.unitMW * (irr / 1000) * 0.9 * u.soil * (1 - 0.0037 * (u.tMod - 25)) : 0;
          const lr = dc / p.unitMW;
          u.eff = dc > 0 ? 0.984 - 0.03 * Math.exp(-lr * 12) : 0;
          let ac = Math.min(dc * u.eff, p.unitMW * 0.94);
          u.dc = dc;
          ac *= f.factor;
          if (f.st && f.st !== 'curt') ac = 0;
          u.mw = ac;
          u.tInv += (amb + 8 + 28 * (ac / p.unitMW) - u.tInv) * 0.05;
          mw += ac;
          if (D.STATUS[u.status].avail) availN++;
          counts[u.status] = (counts[u.status] || 0) + 1;
        });
      }
      p.mw = mw; p.avail = availN / p.n; p.counts = counts; p.lf = mw / p.capMW;
      const e = (mw * dtSim) / HOUR;
      p.energy += e; p.revenue += e * S.price;
    });
  }

  function aggregates() {
    const a = { wind: 0, solar: 0, capWind: 0, capSolar: 0, availUnits: 0, units: 0, windAvail: 0, windUnits: 0, solarAvail: 0, solarUnits: 0 };
    D.PARKS.forEach((p) => {
      a[p.tech] += p.mw;
      if (p.tech === 'wind') a.capWind += p.capMW; else a.capSolar += p.capMW;
      const av = Math.round(p.avail * p.n);
      a.availUnits += av; a.units += p.n;
      if (p.tech === 'wind') { a.windAvail += av; a.windUnits += p.n; } else { a.solarAvail += av; a.solarUnits += p.n; }
    });
    a.total = a.wind + a.solar; a.cap = a.capWind + a.capSolar;
    a.avail = a.availUnits / a.units;
    a.active = S.incidents.filter((i) => i.status !== 'résolu' && i.status !== 'clôturé');
    a.energy = S.energy.wind + S.energy.solar;
    a.co2 = a.energy * D.CO2_T_PER_MWH;
    a.revenue = S.energy.revenue;
    a.homes = (a.total * 1000) / D.HOUSEHOLD_KW;
    return a;
  }
  S.aggregates = aggregates;

  // ------------------------------------------------------------ Journal
  function log(sev, text, extra = {}) {
    const e = { t: S.t, sev, text, ...extra };
    S.log.unshift(e);
    if (S.log.length > 400) S.log.pop();
    S.emit('log', e);
    return e;
  }
  S.logEvent = log;

  // ------------------------------------------------------------ Incidents
  const STATUS_LABEL = { nouveau: 'Nouveau', 'acquitté': 'Acquitté', 'en attente': 'Équipe en attente', 'en route': 'Équipe en route', 'sur site': 'Équipe sur site', 'en cours': 'Intervention en cours', 'résolu': 'Résolu', 'clôturé': 'Clôturé' };
  S.STATUS_LABEL = STATUS_LABEL;
  const isActive = (i) => i.status !== 'résolu' && i.status !== 'clôturé';
  S.isActive = isActive;

  function chooseUnits(p, scope, unitIdx) {
    const avail = p.units.filter((u) => !Object.keys(u.flags).length);
    const pool = avail.length ? avail : p.units;
    if (scope === 'park') return p.units.map((u) => u.idx);
    if (scope === 'zone') return [];
    const anchor = unitIdx != null ? p.units[unitIdx] : pick(pool.filter((u) => u.status === 'prod').length ? pool.filter((u) => u.status === 'prod') : pool);
    if (scope === 'unit') return [anchor.idx];
    if (scope === 'string') return p.units.filter((u) => u.row === anchor.row).map((u) => u.idx);
    // grappe : unités voisines
    const k = Math.min(p.n, Math.round(rnd(3, 7)));
    return [...p.units].sort((a, b) => Math.hypot(a.row - anchor.row, a.col - anchor.col) - Math.hypot(b.row - anchor.row, b.col - anchor.col)).slice(0, k).map((u) => u.idx);
  }

  S.createIncident = function (o) {
    const def = T[o.type];
    if (!def) return null;
    let targets = o.targets;
    if (!targets) {
      const p = D.byId[o.parkId];
      if (!p) return null;
      targets = [{ parkId: p.id, units: o.units || chooseUnits(p, def.scope, o.unitIdx != null && o.unitIdx !== '' ? +o.unitIdx : null) }];
    }
    const p0 = D.byId[targets[0].parkId];
    const firstUnit = targets[0].units.length ? p0.units[targets[0].units[0]] : null;
    let loc = firstUnit ? [firstUnit.lat, firstUnit.lng] : p0.substation || [p0.lat, p0.lng];
    if (def.scope === 'zone' && o.type === 'intrusion_sea') {
      const z = p0.zone; loc = [(z[0][0] + z[1][0]) / 2 + rnd(-0.01, 0.01), (z[0][1] + z[1][1]) / 2 + rnd(-0.02, 0.02)];
    }
    if (def.scope === 'park') loc = p0.substation || [p0.lat, p0.lng];
    const nUnits = targets.reduce((s, x) => s + x.units.length, 0);
    const year = new Date(S.t).getFullYear();
    const inc = {
      id: 'I' + ++S.incSeq, code: `INC-${year}-${String(S.incSeq + 1200).padStart(5, '0')}`, type: o.type, def,
      sev: o.sev || pick(def.sev), title: o.title || def.label, desc: o.desc || def.desc, targets, loc,
      parkId: targets.length === 1 ? p0.id : null, parkIds: targets.map((x) => x.parkId), nUnits,
      status: 'nouveau', left: rnd(6, 16), createdAt: S.t, timeline: [], asset: null, source: o.source || 'SCADA', manual: !!o.manual,
    };
    const where = targets.length > 1 ? o.where || `${targets.length} sites` : `${p0.name}${def.scope === 'unit' && firstUnit ? ' · ' + firstUnit.id : nUnits > 1 && def.scope !== 'park' ? ` · ${nUnits} unités` : ''}`;
    inc.where = where;
    tl(inc, `Alarme reçue (${inc.source}) : ${inc.desc}`);
    if (def.effect && o.type !== 'maintenance') applyEffect(inc);
    if (o.type === 'maintenance') { inc.status = 'acquitté'; inc.left = rnd(4, 8); tl(inc, 'Intervention planifiée — préparation de l’équipe.'); }
    S.incidents.unshift(inc);
    if (S.incidents.length > 300) S.incidents = S.incidents.filter((i, k) => k < 200 || isActive(i));
    S.stats.created++; S.stats.byType[o.type] = (S.stats.byType[o.type] || 0) + 1; S.stats.bySev[inc.sev]++;
    inc.parkIds.forEach((id) => { S.stats.byPark[id] = (S.stats.byPark[id] || 0) + 1; });
    log(inc.sev, `${inc.title} — ${where}`, { incId: inc.id, parkId: inc.parkId });
    S.emit('incident:new', inc);
    return inc;
  };
  function tl(inc, text) { inc.timeline.push({ t: S.t, text }); }
  function applyEffect(inc) {
    if (!inc.def.effect || inc.applied) return;
    inc.applied = true;
    inc.targets.forEach((tg) => {
      const p = D.byId[tg.parkId];
      tg.units.forEach((i) => { p.units[i].flags[inc.id] = { status: inc.def.effect.status, factor: inc.def.effect.factor, type: inc.type }; });
    });
  }
  function clearEffect(inc) {
    inc.targets.forEach((tg) => { const p = D.byId[tg.parkId]; tg.units.forEach((i) => { delete p.units[i].flags[inc.id]; }); });
    inc.applied = false;
  }

  S.ack = function (id, who = 'opérateur') {
    const inc = S.incidents.find((i) => i.id === id);
    if (!inc || inc.status !== 'nouveau') return;
    inc.status = 'acquitté'; inc.left = rnd(4, 9);
    tl(inc, `Alarme acquittée par l’${who}.`);
    S.emit('incident:update', inc);
  };
  S.dispatch = function (id) {
    const inc = S.incidents.find((i) => i.id === id);
    if (!inc || !isActive(inc)) return false;
    if (inc.status === 'nouveau') S.ack(id);
    if (!inc.def.travel) { startWork(inc, inc.def.duration); return true; }
    if (inc.asset) return true;
    const p = D.byId[inc.parkIds[0]];
    const kind = p.tech === 'wind' ? 'ctv' : 'van';
    const free = S.assets.filter((a) => a.kind === kind && !a.inc && (a.state === 'base' || a.state === 'return'));
    let a = free.filter((x) => x.home === p.id).sort((x, y) => distKm([x.lat, x.lng], inc.loc) - distKm([y.lat, y.lng], inc.loc))[0];
    if (!a) a = free.filter((x) => distKm([x.lat, x.lng], inc.loc) < 400).sort((x, y) => distKm([x.lat, x.lng], inc.loc) - distKm([y.lat, y.lng], inc.loc))[0];
    if (!a) {
      if (inc.status !== 'en attente') { inc.status = 'en attente'; tl(inc, 'Aucune équipe disponible — mise en file d’attente.'); S.emit('incident:update', inc); }
      return false;
    }
    a.inc = inc.id; a.state = 'transit';
    a.target = kind === 'ctv' ? D.offset(inc.loc[0], inc.loc[1], -0.18, -0.12) : D.offset(inc.loc[0], inc.loc[1], 0.06, -0.08);
    inc.asset = a.id; inc.status = 'en route';
    const km = distKm([a.lat, a.lng], a.target);
    const eta = Math.round(((km / (a.speed / S.OPS_SCALE)) / 60));
    tl(inc, `${a.kind === 'ctv' ? `Navire de transfert ${a.name} engagé` : `${a.name} engagée`} — ${km.toFixed(1).replace('.', ',')} km, arrivée estimée ${eta} min.`);
    S.emit('incident:update', inc);
    return true;
  };
  function startWork(inc, range) {
    inc.status = 'en cours'; inc.left = rnd(range[0], range[1]);
    if (inc.type === 'maintenance') applyEffect(inc);
    tl(inc, inc.def.travel ? 'Intervention démarrée.' : inc.type === 'grid_curtail' ? 'Consigne appliquée, puissance limitée.' : 'Mesures automatiques en cours.');
    S.emit('incident:update', inc);
  }
  S.resolve = function (id, text) {
    const inc = S.incidents.find((i) => i.id === id);
    if (!inc || !isActive(inc)) return;
    clearEffect(inc);
    inc.status = 'résolu'; inc.left = 50; inc.resolvedAt = S.t;
    const durMin = (inc.resolvedAt - inc.createdAt) / 60e3;
    S.stats.durations.push(durMin); if (S.stats.durations.length > 200) S.stats.durations.shift();
    S.stats.resolved++;
    tl(inc, text || (inc.def.travel ? 'Défaut levé, unités remises en service.' : 'Fin de l’événement, retour à la normale.'));
    const a = S.assets.find((x) => x.id === inc.asset);
    if (a) { a.inc = null; a.state = 'return'; a.target = a.base; }
    log('ok', `Résolu : ${inc.title} — ${inc.where}`, { incId: inc.id, parkId: inc.parkId });
    S.emit('incident:update', inc);
  };
  S.resolveUnit = function (parkId, idx) {
    const u = D.byId[parkId].units[idx];
    Object.keys(u.flags).forEach((id) => S.resolve(id, 'Réarmement à distance depuis la salle de contrôle.'));
  };

  function tickIncidents(dt) {
    S.incidents.forEach((inc) => {
      if (inc.status === 'clôturé') return;
      if (inc.type === 'storm_stop' && isActive(inc)) {
        const p = D.byId[inc.parkId];
        const n = p.units.filter((u) => u.status === 'storm').length;
        inc.nUnits = Math.max(inc.nUnits, n);
        if (n === 0) { inc.calm = (inc.calm || 0) + dt; if (inc.calm > 15) S.resolve(inc.id, 'Vent repassé sous le seuil de redémarrage, éoliennes relancées.'); }
        else inc.calm = 0;
        if (inc.status === 'nouveau') { inc.left -= dt; if (inc.left <= 0) { inc.status = 'en cours'; tl(inc, 'Arrêt confirmé, surveillance météo renforcée.'); S.emit('incident:update', inc); } }
        return;
      }
      switch (inc.status) {
        case 'nouveau':
          if (S.autopilot) { inc.left -= dt; if (inc.left <= 0) S.ack(inc.id, 'opérateur de quart'); }
          break;
        case 'acquitté':
          if (S.autopilot || inc.type === 'maintenance') { inc.left -= dt; if (inc.left <= 0) S.dispatch(inc.id); }
          break;
        case 'en attente':
          S.dispatch(inc.id);
          break;
        case 'sur site':
          inc.left -= dt; if (inc.left <= 0) startWork(inc, inc.def.work);
          break;
        case 'en cours':
          inc.left -= dt; if (inc.left <= 0) S.resolve(inc.id);
          break;
        case 'résolu':
          inc.left -= dt; if (inc.left <= 0) { inc.status = 'clôturé'; S.emit('incident:update', inc); }
          break;
        default:
      }
    });
  }

  function tickAssets(dt) {
    S.assets.forEach((a) => {
      if (a.state !== 'transit' && a.state !== 'return') return;
      const pos = [a.lat, a.lng];
      const d = distKm(pos, a.target);
      const step = a.speed * dt;
      if (d <= step || d < 0.02) {
        a.lat = a.target[0]; a.lng = a.target[1];
        if (a.state === 'transit') {
          a.state = 'site';
          const inc = S.incidents.find((i) => i.id === a.inc);
          if (inc && isActive(inc)) {
            inc.status = 'sur site'; inc.left = rnd(8, 15);
            tl(inc, `${a.name} sur site, ${inc.def.scope === 'zone' ? 'levée de doute en cours' : 'diagnostic en cours'}.`);
            S.emit('incident:update', inc);
          }
        } else a.state = 'base';
        return;
      }
      const k = step / d;
      const nl = a.lat + (a.target[0] - a.lat) * k, ng = a.lng + (a.target[1] - a.lng) * k;
      a.heading = (Math.atan2((ng - a.lng) * Math.cos(toRad(a.lat)), nl - a.lat) * 180) / Math.PI;
      a.lat = nl; a.lng = ng;
    });
  }

  function tickWeather(dt) {
    S.storms.forEach((st) => {
      st.progress += dt / st.duration;
      const [la, ln] = stormAt(st); st.lat = la; st.lng = ln;
    });
    const ended = S.storms.filter((st) => st.progress >= 1);
    if (ended.length) {
      S.storms = S.storms.filter((st) => st.progress < 1);
      ended.forEach((st) => { if (st.kind === 'storm') log('info', `Fin de la ${st.name.toLowerCase()} — conditions en amélioration.`); S.emit('storm', st); });
    }
    if (S.heat) { S.heat.left -= dt; if (S.heat.left <= 0) { S.heat = null; log('info', 'Fin de l’épisode de chaleur.'); } }
    // arrêts tempête automatiques
    D.WIND.forEach((p) => {
      const n = p.units.filter((u) => u.status === 'storm').length;
      if (n > 0 && !S.incidents.some((i) => i.type === 'storm_stop' && i.parkId === p.id && isActive(i))) {
        S.createIncident({ type: 'storm_stop', parkId: p.id, units: [], sev: n > p.n * 0.5 ? 'critique' : 'majeure', source: 'Automate parc', title: 'Arrêt sécurité tempête' });
      }
    });
  }

  // ------------------------------------------------------------ Événements aléatoires
  const ACT = {
    off: null,
    calme: { inc: [110, 220], storm: [2400, 3600], cloud: [900, 1500], max: 4 },
    normal: { inc: [45, 100], storm: [1100, 1900], cloud: [500, 900], max: 8 },
    intense: { inc: [16, 38], storm: [380, 700], cloud: [260, 480], max: 14 },
  };
  S.randomIncident = function (source = 'SCADA') {
    const types = Object.entries(T).filter(([, d]) => d.w > 0);
    const [type, def] = weightedPick(types, ([, d]) => d.w);
    const parks = D.PARKS.filter((p) => def.tech === 'both' || p.tech === def.tech);
    const p = weightedPick(parks, (x) => Math.sqrt(x.n));
    if (def.scope === 'park' && S.incidents.some((i) => isActive(i) && i.parkIds.includes(p.id) && i.def.scope === 'park')) return null;
    return S.createIncident({ type, parkId: p.id, source });
  };
  function tickRandom(dtReal) {
    const a = ACT[S.activity];
    if (!a) return;
    const tm = S.timers;
    tm.inc -= dtReal; tm.storm -= dtReal; tm.cloud -= dtReal;
    if (tm.inc <= 0) {
      tm.inc = rnd(a.inc[0], a.inc[1]);
      const active = S.incidents.filter((i) => isActive(i) && i.type !== 'storm_stop').length;
      if (active < a.max) S.randomIncident();
    }
    if (tm.storm <= 0) { tm.storm = rnd(a.storm[0], a.storm[1]); if (!S.storms.some((s) => s.kind === 'storm')) S.addStorm(); }
    if (tm.cloud <= 0) { tm.cloud = rnd(a.cloud[0], a.cloud[1]); if (S.storms.length < 3) S.addCloud(pick(['iberia', 'france', 'east'])); }
  }

  // ------------------------------------------------------------ Scénarios
  S.scenario = function (name, arg) {
    switch (name) {
      case 'storm': return S.addStorm(arg, { duration: rnd(330, 420) });
      case 'cloud': return S.addCloud(arg);
      case 'heat': return S.startHeat();
      case 'export_cable': return S.createIncident({ type: 'export_cable', parkId: arg || pick(D.WIND.filter((p) => p.n > 20)).id, source: 'Protection réseau' });
      case 'substation': return S.createIncident({ type: 'substation', parkId: arg || pick(D.SOLAR).id, source: 'Protection réseau' });
      case 'grid_fr': {
        const parks = D.PARKS.filter((p) => p.cc === (arg || 'FR'));
        return S.createIncident({ type: 'grid_curtail', targets: parks.map((p) => ({ parkId: p.id, units: p.units.map((u) => u.idx) })), source: 'Gestionnaire de réseau', where: `${parks[0].country} · ${parks.length} sites`, sev: 'mineure' });
      }
      case 'wave': {
        const n = arg || 4;
        for (let i = 0; i < n; i++) setTimeout(() => S.randomIncident(), i * 1800);
        return null;
      }
      case 'calm': {
        S.incidents.filter(isActive).forEach((i) => S.resolve(i.id, 'Clôture générale demandée par la régie.'));
        S.storms = []; S.heat = null;
        D.PARKS.forEach((p) => p.units.forEach((u) => { u.latch = false; }));
        S.emit('storm', null);
        log('ok', 'Retour à la normale sur l’ensemble du parc.');
        return null;
      }
      default: return null;
    }
  };

  S.setTimeOfDay = function (hour) {
    const cur = paris(S.t).h;
    let delta = hour - cur; if (delta < 0) delta += 24;
    S.t += delta * HOUR;
    rebuildForJump();
    log('info', `Horloge de simulation déplacée à ${String(Math.floor(hour)).padStart(2, '0')} h 00.`);
  };
  function rebuildForJump() {
    initHistory();
    S.emit('jump');
  }

  // ------------------------------------------------------------ Boucle
  let acc = 0, lastReal = performance.now();
  S.step = function () {
    const now = performance.now();
    let dtReal = Math.min(2, (now - lastReal) / 1000);
    lastReal = now;
    if (S.paused) return;
    const dtSim = dtReal * 1000 * S.speed;
    const opsDt = dtReal * Math.min(S.speed, 30);
    S.t += dtSim;
    tickAssets(opsDt);
    acc += dtReal;
    if (acc >= 0.5) {
      const dt = acc; acc = 0;
      const simDt = dt * 1000 * S.speed, ops = dt * Math.min(S.speed, 30);
      const pd = paris(S.t);
      if (pd.day !== S.energy.day) { S.energy = { day: pd.day, wind: 0, solar: 0, revenue: 0 }; D.PARKS.forEach((p) => { p.energy = 0; p.revenue = 0; }); }
      S.price = spotPrice(S.t);
      S.freq = 50 + 0.018 * Math.sin(S.t / 41e3) + 0.012 * Math.sin(S.t / 7e3) + (Math.random() - 0.5) * 0.006;
      tickWeather(ops);
      updateParks(simDt);
      const ag = aggregates();
      S.energy.wind += (ag.wind * simDt) / HOUR; S.energy.solar += (ag.solar * simDt) / HOUR; S.energy.revenue += ((ag.total * simDt) / HOUR) * S.price;
      tickIncidents(ops);
      tickRandom(dt);
      // échantillonnage historique
      let k = 0;
      while (S.t - S.lastSample >= STEP && k++ < HIST_MAX) { S.lastSample += STEP; pushSample(S.lastSample, S.t - S.lastSample > STEP); }
      D.PARKS.forEach((p) => p.units.forEach((u) => { u.trend.push(u.mw); if (u.trend.length > 90) u.trend.shift(); }));
      S.emit('tick', ag);
    }
  };

  S.reset = function () {
    S.t = Date.now(); S.storms = []; S.heat = null; S.incidents = []; S.log = []; S.incSeq = 0;
    initUnits(); initAssets(); initStats(); initHistory();
    S.price = spotPrice(S.t);
    updateParks(0);
    // situation de départ réaliste
    ['maintenance', 'inverter_fault', 'turbine_fault', 'gen_temp'].forEach((type) => {
      const def = T[type];
      const parks = D.PARKS.filter((p) => def.tech === 'both' || p.tech === def.tech);
      S.createIncident({ type, parkId: pick(parks.filter((p) => p.n > 10)).id });
    });
    S.timers = { inc: 30, storm: rnd(300, 600), cloud: rnd(120, 300) };
    log('info', 'Supervision démarrée — 20 sites connectés.');
    S.emit('reset');
  };
  S.reset();
})();
