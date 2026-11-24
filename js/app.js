/* GeoSim — simulateur de géolocalisation de flotte pour démos de salle de contrôle.
 * 100 % statique (GitHub Pages). Données : OpenStreetMap (Nominatim, Overpass), itinéraires OSRM.
 */
'use strict';

// ======================================================================
// Configuration
// ======================================================================
const CONFIG = {
  routers: ['https://router.project-osrm.org', 'https://routing.openstreetmap.de/routed-car'],
  routeIntervalMs: 350,           // espacement entre deux requêtes d'itinéraire (respect des serveurs publics)
  nominatim: 'https://nominatim.openstreetmap.org/search',
  cityChips: ['Paris', 'Lyon', 'Marseille', 'Toulouse', 'Lille', 'Bordeaux', 'Nantes', 'Strasbourg', 'Nice', 'Bruxelles', 'Genève', 'Montréal'],
  stopAlertSec: 240,              // arrêt prolongé
};

// Types de véhicules. behavior : standby (attend à la base), patrol (patrouille), line (ligne de bus), trips (courses)
const TYPES = {
  pompier:   { label: 'Pompiers',      icon: '🚒', color: '#e5484d', behavior: 'standby', speed: 40, emSpeed: 72, limit: 50, cons: 0.35, codes: ['FPT', 'VSAV', 'EPA', 'VSAV'], base: 'fire',     service: 'En service', def: 6 },
  police:    { label: 'Police',        icon: '🚓', color: '#3e63dd', behavior: 'patrol',  speed: 34, emSpeed: 78, limit: 50, cons: 0.22, codes: ['PS', 'BAC', 'PS'],           base: 'police',   service: 'En patrouille', def: 8 },
  ambulance: { label: 'SAMU / SMUR',   icon: '🚑', color: '#12a594', behavior: 'standby', speed: 40, emSpeed: 75, limit: 50, cons: 0.25, codes: ['SMUR', 'AMB'],               base: 'hospital', service: 'En service', def: 4 },
  bus:       { label: 'Bus',           icon: '🚌', color: '#f5a524', behavior: 'line',    speed: 30, emSpeed: 30, limit: 50, cons: 0.45, codes: ['Ligne'],                     base: 'depot',    service: 'En ligne', def: 6 },
  taxi:      { label: 'Taxis / VTC',   icon: '🚕', color: '#d6b400', behavior: 'trips',   speed: 36, emSpeed: 36, limit: 50, cons: 0.18, codes: ['TX'],                        base: null,       service: 'En course', def: 6 },
  livraison: { label: 'Livraisons',    icon: '🚚', color: '#a46ede', behavior: 'trips',   speed: 32, emSpeed: 32, limit: 50, cons: 0.30, codes: ['LIV'],                       base: 'depot',    service: 'En tournée', def: 4 },
  depannage: { label: 'Dépanneuses',   icon: '🛻', color: '#f76b15', behavior: 'patrol',  speed: 34, emSpeed: 60, limit: 50, cons: 0.30, codes: ['DEP'],                       base: null,       service: 'En patrouille', def: 2 },
};

const STATUS = {
  dispo:   { label: 'Disponible',      color: '#46a758' },
  service: { label: 'En service',      color: '#3b9eff' },
  route:   { label: 'En intervention', color: '#ffb224' },
  place:   { label: 'Sur place',       color: '#ff5d5d' },
  retour:  { label: 'Retour base',     color: '#b18cff' },
  hs:      { label: 'Hors service',    color: '#7c8594' },
};

// Incidents : besoins en moyens et durée sur place (minutes)
const INCIDENTS = {
  incendie:   { label: 'Incendie',                 icon: '🔥', needs: { pompier: 2 },                          dur: [20, 40], weight: 3 },
  accident:   { label: 'Accident de la route',     icon: '💥', needs: { pompier: 1, police: 1, ambulance: 1 }, dur: [15, 30], weight: 3 },
  malaise:    { label: 'Secours à personne',       icon: '❤️', needs: { ambulance: 1, pompier: 1 },            dur: [10, 25], weight: 4 },
  agression:  { label: 'Agression / rixe',         icon: '⚠️', needs: { police: 2 },                           dur: [10, 25], weight: 3 },
  cambriolage:{ label: 'Cambriolage',              icon: '🔓', needs: { police: 1 },                           dur: [15, 30], weight: 2 },
  panne:      { label: 'Véhicule en panne',        icon: '🔧', needs: { depannage: 1 },                        dur: [15, 25], weight: 1 },
};

// ======================================================================
// Utilitaires
// ======================================================================
const $ = (s) => document.querySelector(s);
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const pad = (n, w = 2) => String(n).padStart(w, '0');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const R_EARTH = 6371000;
const toRad = (d) => d * Math.PI / 180;
function dist(a, b) {
  const dLat = toRad(b[0] - a[0]), dLng = toRad(b[1] - a[1]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.sqrt(s));
}
function bearing(a, b) {
  const y = Math.sin(toRad(b[1] - a[1])) * Math.cos(toRad(b[0]));
  const x = Math.cos(toRad(a[0])) * Math.sin(toRad(b[0])) - Math.sin(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.cos(toRad(b[1] - a[1]));
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}
function lerpAngle(a, b, t) { const d = ((b - a + 540) % 360) - 180; return (a + d * t + 360) % 360; }
const CARD = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
const cardinal = (h) => CARD[Math.round(h / 45) % 8];

const store = {
  get(k, d) { try { const v = localStorage.getItem('geosim.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('geosim.' + k, JSON.stringify(v)); } catch { /* stockage indisponible */ } },
};

// ======================================================================
// État global
// ======================================================================
const sim = {
  epoch: 0,
  running: false,
  paused: false,
  speed: 5,
  time: Date.now(),
  city: null,
  bases: { fire: [], police: [], hospital: [], depot: [] },
  vehicles: [],
  byId: new Map(),
  incidents: new Map(),
  incSeq: 0,
  alerts: [],
  unread: 0,
  selected: null,
  follow: false,
  autoInc: true,
  events: true,
  nextAutoInc: 120,
  retryTimer: 0,
  typeFilter: null,
  statusFilter: null,
};

// ======================================================================
// Carte
// ======================================================================
const map = L.map('map', { zoomControl: true, attributionControl: true }).setView([46.6, 2.4], 6);
const OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const ROUTE_ATTR = ' · Itinéraires <a href="https://project-osrm.org">OSRM</a>';
const baseLayers = {
  'Sombre': L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, className: 'tiles-dark', attribution: OSM_ATTR + ROUTE_ATTR }),
  'Clair': L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: OSM_ATTR + ROUTE_ATTR }),
  'Gris (Esri)': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', { maxZoom: 16, attribution: 'Tiles &copy; Esri' + ROUTE_ATTR }),
};
baseLayers['Sombre'].addTo(map);
const layers = {
  lines: L.layerGroup().addTo(map),
  bases: L.layerGroup().addTo(map),
  incidents: L.layerGroup().addTo(map),
  route: L.layerGroup().addTo(map),
  vehicles: L.layerGroup().addTo(map),
};
L.control.layers(baseLayers, { 'Lignes de bus': layers.lines, 'Bases': layers.bases, 'Incidents': layers.incidents }, { position: 'topright' }).addTo(map);
L.control.scale({ imperial: false, position: 'bottomright' }).addTo(map);

// ======================================================================
// Itinéraires (file d'attente OSRM avec repli en ligne droite)
// ======================================================================
const routeQueue = [];
let routeTimer = null, routerIdx = 0, inflight = 0;

function requestRoute(points) {
  return new Promise((resolve) => {
    routeQueue.push({ points, resolve, tries: 0, epoch: sim.epoch });
    pumpQueue();
  });
}
function pumpQueue() {
  if (routeTimer) return;
  routeTimer = setInterval(() => {
    const job = routeQueue.shift();
    if (!job) { clearInterval(routeTimer); routeTimer = null; return; }
    runJob(job);
  }, CONFIG.routeIntervalMs);
}
async function runJob(job) {
  if (job.epoch !== sim.epoch) return job.resolve(null);
  const base = CONFIG.routers[routerIdx++ % CONFIG.routers.length];
  const coords = job.points.map((p) => `${p[1].toFixed(6)},${p[0].toFixed(6)}`).join(';');
  const url = `${base}/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=false`;
  inflight++;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 9000);
    const r = await fetch(url, { signal: ctl.signal });
    clearTimeout(t);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    if (j.code !== 'Ok' || !j.routes || !j.routes.length) throw new Error(j.code);
    const line = j.routes[0].geometry.coordinates.map((c) => [c[1], c[0]]);
    if (line.length < 2) throw new Error('itinéraire vide');
    job.resolve(job.epoch === sim.epoch ? buildRoute(line, false) : null);
  } catch (e) {
    job.tries++;
    if (job.tries < 3 && job.epoch === sim.epoch) { routeQueue.push(job); pumpQueue(); }
    else job.resolve(job.epoch === sim.epoch ? buildRoute(straightLine(job.points), true) : null);
  } finally { inflight--; }
}
function buildRoute(line, approx) {
  const coords = [line[0]];
  for (let i = 1; i < line.length; i++) if (dist(coords[coords.length - 1], line[i]) > 0.5) coords.push(line[i]);
  if (coords.length < 2) coords.push([coords[0][0] + 0.0001, coords[0][1]]);
  const cum = [0];
  for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + dist(coords[i - 1], coords[i]));
  return { coords, cum, total: cum[cum.length - 1], approx };
}
function straightLine(points) {
  const out = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1], n = Math.max(1, Math.ceil(dist(a, b) / 50));
    for (let k = 0; k < n; k++) out.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
  }
  out.push(points[points.length - 1]);
  return out;
}
const pendingRoutes = () => routeQueue.length + inflight;

// ======================================================================
// Ville et bases
// ======================================================================
function randomPoint(scale = 0.9) {
  const c = sim.city, ang = Math.random() * Math.PI * 2, r = c.R * scale * Math.sqrt(Math.random());
  const lat = c.lat + (r * Math.cos(ang)) / 111320;
  const lng = c.lng + (r * Math.sin(ang)) / (111320 * Math.cos(toRad(c.lat)));
  return [lat, lng];
}

async function geocode(q) {
  const url = `${CONFIG.nominatim}?format=json&limit=6&addressdetails=0&accept-language=fr&q=${encodeURIComponent(q)}`;
  const r = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!r.ok) throw new Error('Nominatim ' + r.status);
  return r.json();
}

// Casernes, commissariats et hôpitaux réels via Nominatim (recherche par équipement dans l'emprise de la ville).
// Une requête par seconde maximum (règle d'usage Nominatim). Repli : bases simulées.
async function fetchBases(city) {
  const res = { fire: [], police: [], hospital: [], depot: [] };
  const dLat = city.R / 111320, dLng = city.R / (111320 * Math.cos(toRad(city.lat)));
  const vb = [city.lng - dLng, city.lat + dLat, city.lng + dLng, city.lat - dLat].map((x) => x.toFixed(5)).join(',');
  const kinds = [['fire_station', 'fire'], ['police', 'police'], ['hospital', 'hospital']];
  for (let i = 0; i < kinds.length; i++) {
    const [amenity, key] = kinds[i];
    if (i) await new Promise((r) => setTimeout(r, 1100));
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 8000);
      const url = `${CONFIG.nominatim}?format=json&amenity=${amenity}&viewbox=${vb}&bounded=1&limit=40&accept-language=fr`;
      const r = await fetch(url, { signal: ctl.signal, headers: { 'Accept': 'application/json' } });
      clearTimeout(t);
      if (!r.ok) throw new Error('Nominatim ' + r.status);
      for (const el of await r.json()) res[key].push({ lat: Number(el.lat), lng: Number(el.lon), name: el.name || '' });
    } catch (e) {
      console.warn(`Bases « ${amenity} » indisponibles, repli simulé`, e);
    }
  }
  return res;
}

function chooseBases(raw) {
  const c = [sim.city.lat, sim.city.lng];
  const nearest = (arr, n) => arr.map((b) => ({ ...b, d: dist(c, [b.lat, b.lng]) })).sort((a, b) => a.d - b.d).slice(0, n);
  const fleet = readFleet();
  const ensure = (arr, n, label) => {
    const out = arr.slice();
    while (out.length < n) { const p = randomPoint(0.6); out.push({ lat: p[0], lng: p[1], name: `${label} (simulé)` }); }
    return out;
  };
  const b = {
    fire: ensure(nearest(raw.fire, Math.max(3, Math.ceil(fleet.pompier / 2))), Math.min(3, Math.max(1, fleet.pompier)), 'Centre de secours'),
    police: ensure(nearest(raw.police, 4), Math.min(2, Math.max(1, fleet.police)), 'Commissariat'),
    hospital: ensure(nearest(raw.hospital.filter((h) => h.name), 4), Math.min(2, Math.max(1, fleet.ambulance)), 'Hôpital'),
    depot: [],
  };
  b.fire.forEach((x, i) => { if (!x.name) x.name = `Centre de secours ${i + 1}`; });
  b.police.forEach((x, i) => { if (!x.name) x.name = `Commissariat ${i + 1}`; });
  const p1 = randomPoint(0.7), p2 = randomPoint(0.7);
  b.depot.push({ lat: p1[0], lng: p1[1], name: 'Dépôt bus' }, { lat: p2[0], lng: p2[1], name: 'Entrepôt logistique' });
  return b;
}

function drawBases() {
  layers.bases.clearLayers();
  const style = { fire: ['CS', '#b42318'], police: ['CP', '#2d4ab8'], hospital: ['H', '#0e7c6f'], depot: ['D', '#6b5a2e'] };
  for (const [k, arr] of Object.entries(sim.bases)) {
    for (const b of arr) {
      const [txt, col] = style[k];
      L.marker([b.lat, b.lng], {
        icon: L.divIcon({ className: '', html: `<div class="base-icon" style="background:${col}">${txt}</div>`, iconSize: [22, 22], iconAnchor: [11, 11] }),
        keyboard: false, zIndexOffset: -500,
      }).bindTooltip(esc(b.name)).addTo(layers.bases);
    }
  }
}

async function loadCity(place) {
  const epoch = ++sim.epoch;
  resetSim();
  $('#welcome').hidden = true;
  const bb = place.boundingbox.map(Number); // [s, n, w, e]
  const lat = Number(place.lat), lng = Number(place.lon);
  const halfH = (bb[1] - bb[0]) / 2 * 111320;
  const halfW = (bb[3] - bb[2]) / 2 * 111320 * Math.cos(toRad(lat));
  const R = clamp(Math.min(halfH, halfW) * 0.85, 2500, 9000);
  const name = (place.display_name || place.name || '').split(',')[0];
  sim.city = { name, lat, lng, R, place: { display_name: place.display_name, lat: place.lat, lon: place.lon, boundingbox: place.boundingbox } };
  store.set('city', sim.city.place);
  $('#cityName').textContent = name;
  document.title = `GeoSim · ${name}`;
  fitCity();
  setLoading('Recherche des casernes, commissariats et hôpitaux…');
  const raw = await fetchBases(sim.city);
  if (epoch !== sim.epoch) return;
  sim.bases = chooseBases(raw);
  drawBases();
  spawnFleet();
  sim.running = true;
  sim.nextAutoInc = rand(60, 150);
  pushAlert('info', null, `Simulation démarrée sur ${name} : ${sim.vehicles.length} véhicules.`);
}
function fitCity() {
  if (!sim.city) return;
  const c = sim.city, dLat = c.R / 111320, dLng = c.R / (111320 * Math.cos(toRad(c.lat)));
  map.fitBounds([[c.lat - dLat, c.lng - dLng], [c.lat + dLat, c.lng + dLng]], { padding: [10, 10] });
}

function resetSim() {
  sim.running = false;
  routeQueue.length = 0;
  for (const v of sim.vehicles) v.token++;
  sim.vehicles = []; sim.byId.clear(); sim.incidents.clear();
  sim.alerts = []; sim.unread = 0; sim.selected = null; sim.follow = false;
  Object.values(layers).forEach((l) => l.clearLayers());
  $('#alertList').innerHTML = ''; $('#incList').innerHTML = ''; $('#vehList').innerHTML = '';
  $('#detail').hidden = true;
  sim.time = Date.now();
}

// ======================================================================
// Flotte
// ======================================================================
function readFleet() {
  const f = {};
  for (const k of Object.keys(TYPES)) {
    const el = document.getElementById('fleet-' + k);
    f[k] = clamp(parseInt(el?.value, 10) || 0, 0, 40);
  }
  return f;
}

function makeCallsign(type, i) {
  const T = TYPES[type];
  if (type === 'bus') return `Ligne ${i + 1}`;
  const code = T.codes[i % T.codes.length];
  return `${code} ${pad(i + 1)}`;
}

function newVehicle(type, i) {
  const v = {
    id: `${type}-${i}`, type, idx: i, callsign: makeCallsign(type, i),
    lat: 0, lng: 0, heading: rand(0, 360), speed: 0,
    cruise: rand(0.88, 1.06), jitter: 1, jitterT: 0,
    status: 'service', prevStatus: null, phase: 'normal',
    route: null, prog: 0, seg: 0, dwell: 0, afterDwell: null, token: 0,
    stops: null, nextStop: 0,
    fuel: rand(45, 100), odo: rand(8000, 160000),
    stopTimer: 0, stopAlerted: false, overspeed: 0, overTarget: 0, overAlerted: false, lowFuelAlerted: false,
    hsLeft: 0, incident: null, base: null, visible: false, marker: null, el: null, lineLayer: null,
    lastSt: null, lastHead: null,
  };
  sim.vehicles.push(v); sim.byId.set(v.id, v);
  return v;
}

function spawnFleet() {
  const fleet = readFleet();
  store.set('fleet', fleet);
  for (const [type, n] of Object.entries(fleet)) {
    const T = TYPES[type];
    for (let i = 0; i < n; i++) {
      const v = newVehicle(type, i);
      if (T.base && sim.bases[T.base]?.length) {
        const arr = T.base === 'depot' ? [sim.bases.depot[type === 'bus' ? 0 : 1]] : sim.bases[T.base];
        v.base = arr[i % arr.length];
      }
      if (T.behavior === 'standby') {
        v.lat = v.base.lat; v.lng = v.base.lng; v.status = 'dispo'; v.phase = 'idle'; v.fuel = rand(70, 100);
        showVehicle(v);
      } else if (T.behavior === 'line') {
        buildBusLine(v);
      } else {
        const start = v.base && type === 'police' ? [v.base.lat, v.base.lng] : randomPoint();
        v.lat = start[0]; v.lng = start[1];
        normalRoute(v, start);
      }
    }
  }
  buildVehicleList();
}

function buildBusLine(v) {
  const c = sim.city, ang0 = rand(0, Math.PI * 2), pts = [];
  const n = randInt(3, 4);
  for (let k = 0; k < n; k++) {
    const ang = ang0 + (k / n) * Math.PI * 2 + rand(-0.3, 0.3), r = c.R * rand(0.25, 0.85);
    pts.push([c.lat + (r * Math.cos(ang)) / 111320, c.lng + (r * Math.sin(ang)) / (111320 * Math.cos(toRad(c.lat)))]);
  }
  pts.push(pts[0]);
  v.phase = 'normal'; v.status = 'service';
  const tok = ++v.token;
  requestRoute(pts).then((r) => {
    if (!r || tok !== v.token) return;
    setRoute(v, r);
    v.prog = rand(0, r.total * 0.9); // les bus démarrent répartis sur leur ligne
    v.seg = 0;
    v.stops = []; for (let d = rand(150, 350); d < r.total - 100; d += rand(320, 480)) v.stops.push(d);
    v.nextStop = v.stops.findIndex((d) => d > v.prog); if (v.nextStop < 0) v.nextStop = v.stops.length;
    placeOnRoute(v);
    v.lineLayer = L.polyline(r.coords, { color: TYPES.bus.color, weight: 3, opacity: 0.28, dashArray: '6 6', interactive: false }).addTo(layers.lines);
  });
}

function normalRoute(v, from) {
  const T = TYPES[v.type];
  const start = from || [v.lat, v.lng];
  const pts = T.behavior === 'patrol' ? [start, randomPoint(), randomPoint()] : [start, randomPoint()];
  v.phase = 'normal';
  assignRoute(v, pts, 'normal');
}

function assignRoute(v, pts, phase, onReady) {
  const tok = ++v.token;
  v.route = null; v.dwell = 0; v.afterDwell = null;
  requestRoute(pts).then((r) => {
    if (!r || tok !== v.token || !sim.byId.has(v.id)) return;
    setRoute(v, r);
    v.phase = phase;
    onReady && onReady(r);
  });
}

function setRoute(v, r) {
  v.route = r; v.prog = 0; v.seg = 0;
  if (!v.visible) { v.lat = r.coords[0][0]; v.lng = r.coords[0][1]; showVehicle(v); }
  if (sim.selected === v.id) drawSelectedRoute();
}

function showVehicle(v) {
  v.visible = true;
  if (v.marker) return;
  const T = TYPES[v.type];
  const icon = L.divIcon({
    className: 'veh-wrap', iconSize: [34, 34], iconAnchor: [17, 17],
    html: `<div class="veh" style="--c:${T.color}" data-st="${v.status}"><div class="veh-arrow"></div><div class="veh-body">${T.icon}</div><div class="veh-st"></div><div class="veh-lbl">${esc(v.callsign)}</div></div>`,
  });
  v.marker = L.marker([v.lat, v.lng], { icon, keyboard: false, riseOnHover: true }).addTo(layers.vehicles);
  v.marker.on('click', () => selectVehicle(v.id));
  v.el = v.marker.getElement().querySelector('.veh');
  v.arrowEl = v.el.querySelector('.veh-arrow');
}

function setStatus(v, st) {
  v.status = st;
  if (st !== 'service') { v.stopTimer = 0; v.stopAlerted = false; }
}
const statusLabel = (v) => (v.status === 'service' ? TYPES[v.type].service : STATUS[v.status].label);

// ======================================================================
// Moteur de simulation
// ======================================================================
function startDwell(v, sec, after) { v.dwell = sec; v.afterDwell = after || null; }

function placeOnRoute(v) {
  const r = v.route, c = r.cum;
  if (v.prog < c[v.seg]) v.seg = 0;
  while (v.seg < c.length - 2 && c[v.seg + 1] < v.prog) v.seg++;
  const a = r.coords[v.seg], b = r.coords[v.seg + 1];
  const len = c[v.seg + 1] - c[v.seg];
  const t = len > 0 ? clamp((v.prog - c[v.seg]) / len, 0, 1) : 0;
  v.lat = a[0] + (b[0] - a[0]) * t;
  v.lng = a[1] + (b[1] - a[1]) * t;
  if (len > 1) v.heading = lerpAngle(v.heading, bearing(a, b), 0.35);
}

function trackStop(v, h) {
  if (v.status !== 'service') return;
  v.stopTimer += h;
  if (v.stopTimer > CONFIG.stopAlertSec && !v.stopAlerted) {
    v.stopAlerted = true;
    pushAlert('warn', v, `Arrêt prolongé (${Math.round(v.stopTimer / 60)} min)`);
  }
}

function updateVehicle(v, h) {
  const T = TYPES[v.type];
  if (v.status === 'hs') {
    v.speed = 0;
    if (v.hsLeft > 0) { v.hsLeft -= h; if (v.hsLeft <= 0) recoverVehicle(v); }
    return;
  }
  if (v.dwell > 0) {
    v.speed = Math.max(0, v.speed - 6 * h);
    v.dwell -= h; trackStop(v, h);
    if (v.dwell <= 0) { v.dwell = 0; const f = v.afterDwell; v.afterDwell = null; f && f(); }
    return;
  }
  if (!v.route) { v.speed = Math.max(0, v.speed - 6 * h); trackStop(v, h); return; }

  // --- vitesse cible
  const emergency = v.status === 'route';
  let target = ((emergency ? T.emSpeed : T.speed) / 3.6) * v.cruise;
  v.jitterT -= h;
  if (v.jitterT <= 0) { v.jitter = rand(0.7, 1.15); v.jitterT = rand(4, 14); }
  target *= v.jitter;
  if (v.overspeed > 0) { v.overspeed -= h; if (!emergency) target = v.overTarget / 3.6; }
  const remaining = v.route.total - v.prog;
  const toStop = v.stops && v.nextStop < v.stops.length ? v.stops[v.nextStop] - v.prog : Infinity;
  const brake = Math.sqrt(2 * 2.2 * Math.max(0, Math.min(remaining, toStop))) + 1.5;
  target = Math.min(target, brake);
  v.speed = v.speed < target ? Math.min(target, v.speed + 2.2 * h) : Math.max(target, v.speed - 4 * h);

  // --- avance
  const d = v.speed * h;
  v.prog += d; v.odo += d / 1000; v.fuel -= (d / 1000) * T.cons;
  placeOnRoute(v);
  if (v.speed > 0.6) { v.stopTimer = 0; v.stopAlerted = false; } else trackStop(v, h);

  // --- télémétrie / alertes
  const kmh = v.speed * 3.6;
  if (!emergency && kmh > T.limit + 10) {
    if (!v.overAlerted) { v.overAlerted = true; pushAlert('warn', v, `Excès de vitesse : ${Math.round(kmh)} km/h (limite ${T.limit})`); }
  } else if (kmh < T.limit) v.overAlerted = false;
  if (v.fuel < 12 && !v.lowFuelAlerted) { v.lowFuelAlerted = true; pushAlert('warn', v, `Carburant bas (${Math.round(v.fuel)} %)`); }
  if (v.fuel < 3) { v.fuel = 100; v.lowFuelAlerted = false; pushAlert('info', v, 'Ravitaillement effectué'); }

  // --- arrêts de bus
  if (v.stops && v.nextStop < v.stops.length && v.prog >= v.stops[v.nextStop]) {
    v.nextStop++; v.speed = 0; startDwell(v, rand(12, 35));
  }
  // --- arrivée
  if (v.prog >= v.route.total) { v.prog = v.route.total; placeOnRoute(v); v.speed = 0; onArrive(v); }

  // --- aléas
  if (sim.events && v.status === 'service') {
    if (v.overspeed <= 0 && Math.random() < h / 2700) { v.overspeed = rand(15, 35); v.overTarget = rand(T.limit + 15, T.limit + 32); }
    if (Math.random() < h / (14 * 3600)) breakdown(v);
  }
}

function onArrive(v) {
  const T = TYPES[v.type];
  if (v.phase === 'toIncident') {
    v.route = null; setStatus(v, 'place');
    const inc = sim.incidents.get(v.incident);
    if (inc && inc.status === 'attente') inc.status = 'cours';
    if (inc) inc.onScene = (inc.onScene || 0) + 1;
    pushAlert('info', v, `Arrivé sur les lieux — incident #${v.incident}`);
    startDwell(v, inc ? inc.duration * rand(0.85, 1.15) : 600, () => leaveScene(v));
    return;
  }
  if (v.phase === 'return') {
    v.route = null; v.phase = 'idle'; setStatus(v, 'dispo'); v.fuel = Math.max(v.fuel, rand(85, 100)); v.lowFuelAlerted = false;
    return;
  }
  // phase normale
  if (T.behavior === 'line') {
    v.prog = 0; v.seg = 0; v.nextStop = 0;
    startDwell(v, rand(60, 150)); // terminus
  } else if (T.behavior === 'patrol') {
    v.route = null; startDwell(v, rand(10, 90), () => normalRoute(v));
  } else {
    v.route = null;
    const long = sim.events && Math.random() < 0.06;
    startDwell(v, long ? rand(300, 480) : rand(30, 150), () => normalRoute(v));
  }
}

function leaveScene(v) {
  const inc = sim.incidents.get(v.incident);
  v.incident = null;
  if (inc) { inc.released++; if (inc.released >= inc.assigned.length) resolveIncident(inc); }
  if (TYPES[v.type].behavior === 'standby') {
    setStatus(v, 'retour');
    assignRoute(v, [[v.lat, v.lng], [v.base.lat, v.base.lng]], 'return');
  } else {
    setStatus(v, 'service');
    normalRoute(v);
  }
}

function breakdown(v) {
  if (v.incident) return;
  v.prevStatus = v.status; setStatus(v, 'hs'); v.speed = 0;
  pushAlert('crit', v, 'Panne moteur — véhicule immobilisé');
  const hasTow = sim.vehicles.some((x) => x.type === 'depannage' && x !== v);
  if (hasTow && v.type !== 'depannage') {
    v.hsLeft = 0;
    createIncident('panne', v.lat, v.lng, { vehicleId: v.id, silent: true });
  } else v.hsLeft = rand(600, 1200);
}

function recoverVehicle(v) {
  if (v.status !== 'hs') return;
  setStatus(v, v.prevStatus && v.prevStatus !== 'hs' ? v.prevStatus : 'service');
  v.hsLeft = 0;
  pushAlert('info', v, 'Remis en service');
  if (v.status === 'service' && !v.route && v.dwell <= 0 && TYPES[v.type].behavior !== 'line') normalRoute(v);
}

function toggleHS(v) {
  if (v.status === 'hs') { recoverVehicle(v); return; }
  if (v.incident) { toast('Véhicule engagé sur un incident : impossible de le mettre hors service.', 'warn'); return; }
  v.prevStatus = v.status; setStatus(v, 'hs'); v.hsLeft = 0; v.speed = 0;
  pushAlert('warn', v, 'Mis hors service par l\'opérateur');
}

// ======================================================================
// Incidents
// ======================================================================
function createIncident(type, lat, lng, extra = {}) {
  if (!sim.running) return;
  const IT = INCIDENTS[type];
  const inc = {
    id: ++sim.incSeq, type, lat, lng, created: sim.time, needs: { ...IT.needs },
    assigned: [], released: 0, duration: rand(IT.dur[0], IT.dur[1]) * 60, status: 'attente', warned: {}, ...extra,
  };
  sim.incidents.set(inc.id, inc);
  inc.marker = L.marker([lat, lng], {
    icon: L.divIcon({ className: '', html: `<div class="inc-icon"><span>${IT.icon}</span></div>`, iconSize: [36, 36], iconAnchor: [18, 18] }),
    zIndexOffset: 500,
  }).addTo(layers.incidents);
  inc.marker.bindTooltip(() => incTooltip(inc));
  inc.marker.on('click', () => { switchTab('incidents'); });
  if (!extra.silent) { pushAlert('crit', null, `Nouvel incident #${inc.id} : ${IT.label}`); toast(`${IT.icon} Incident #${inc.id} — ${IT.label}`, 'crit'); }
  else pushAlert('info', null, `Incident #${inc.id} : ${IT.label}`);
  tryDispatch(inc);
  renderIncidents();
  return inc;
}
function incTooltip(inc) {
  const IT = INCIDENTS[inc.type];
  const names = inc.assigned.map((id) => sim.byId.get(id)?.callsign).filter(Boolean).join(', ') || 'aucun moyen';
  return `<b>#${inc.id} ${esc(IT.label)}</b><br>${esc(names)}`;
}

function tryDispatch(inc) {
  if (inc.status === 'resolu') return;
  for (const [type, n] of Object.entries(inc.needs)) {
    let have = inc.assigned.filter((id) => sim.byId.get(id)?.type === type).length;
    while (have < n) {
      const v = nearestAvailable(type, inc);
      if (!v) {
        if (!inc.warned[type]) { inc.warned[type] = true; pushAlert('warn', null, `Aucun moyen ${TYPES[type].label} disponible pour l'incident #${inc.id}`); }
        break;
      }
      dispatch(v, inc); have++;
    }
  }
  updateIncMarker(inc);
}

function nearestAvailable(type, inc) {
  let best = null, bd = Infinity;
  for (const v of sim.vehicles) {
    if (v.type !== type || v.incident || !v.visible) continue;
    if (!['dispo', 'service', 'retour'].includes(v.status)) continue;
    const d = dist([v.lat, v.lng], [inc.lat, inc.lng]);
    if (d < bd) { bd = d; best = v; }
  }
  return best;
}

function dispatch(v, inc) {
  v.incident = inc.id; inc.assigned.push(v.id);
  v.stops = null;
  setStatus(v, 'route');
  pushAlert('info', v, `Engagé sur l'incident #${inc.id} (${INCIDENTS[inc.type].label})`);
  assignRoute(v, [[v.lat, v.lng], [inc.lat, inc.lng]], 'toIncident');
  v.phase = 'toIncident';
}

function resolveIncident(inc) {
  inc.status = 'resolu'; inc.resolved = sim.time;
  pushAlert('info', null, `Incident #${inc.id} clôturé (${INCIDENTS[inc.type].label})`);
  if (inc.vehicleId) { const v = sim.byId.get(inc.vehicleId); if (v) recoverVehicle(v); }
  const m = inc.marker;
  setTimeout(() => layers.incidents.removeLayer(m), 1500);
  renderIncidents();
}

function updateIncMarker(inc) {
  const el = inc.marker?.getElement()?.querySelector('.inc-icon');
  if (el) el.classList.toggle('cours', inc.assigned.length > 0);
}

function randomIncident() {
  if (!sim.running) return;
  const fleet = new Set(sim.vehicles.map((v) => v.type));
  const types = Object.entries(INCIDENTS).filter(([k, it]) => k !== 'panne' && Object.keys(it.needs).some((t) => fleet.has(t)));
  if (!types.length) return;
  let total = types.reduce((s, [, it]) => s + it.weight, 0), r = Math.random() * total, chosen = types[0][0];
  for (const [k, it] of types) { r -= it.weight; if (r <= 0) { chosen = k; break; } }
  // lieu : point d'un itinéraire existant (donc sur la route), sinon point aléatoire
  const withRoute = sim.vehicles.filter((v) => v.route);
  let p = randomPoint(0.8);
  if (withRoute.length) { const v = pick(withRoute); p = pick(v.route.coords); }
  createIncident(chosen, p[0], p[1]);
}

// ======================================================================
// Boucle principale
// ======================================================================
let lastFrame = performance.now(), lastUi = 0;
function step(h) {
  sim.time += h * 1000;
  for (const v of sim.vehicles) updateVehicle(v, h);
  if (sim.autoInc) { sim.nextAutoInc -= h; if (sim.nextAutoInc <= 0) { sim.nextAutoInc = rand(180, 480); randomIncident(); } }
  sim.retryTimer -= h;
  if (sim.retryTimer <= 0) {
    sim.retryTimer = 15;
    for (const inc of sim.incidents.values()) if (inc.status !== 'resolu') tryDispatch(inc);
  }
}
function frame(now) {
  const dtReal = Math.min((now - lastFrame) / 1000, 0.25);
  lastFrame = now;
  if (sim.running && !sim.paused) {
    const dt = dtReal * sim.speed, n = Math.max(1, Math.ceil(dt / 1));
    for (let i = 0; i < n; i++) step(dt / n);
  } else if (!sim.paused && !sim.running) sim.time += dtReal * 1000;
  renderMarkers();
  if (now - lastUi > 400) { lastUi = now; renderUi(); }
  requestAnimationFrame(frame);
}

function renderMarkers() {
  for (const v of sim.vehicles) {
    if (!v.marker) continue;
    v.marker.setLatLng([v.lat, v.lng]);
    const hd = Math.round(v.heading);
    if (hd !== v.lastHead) { v.arrowEl.style.transform = `rotate(${hd}deg)`; v.lastHead = hd; }
    if (v.status !== v.lastSt) { v.el.dataset.st = v.status; v.lastSt = v.status; }
  }
}

// ======================================================================
// Interface
// ======================================================================
function fmtTime(t, sec = true) {
  const d = new Date(t);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}${sec ? ':' + pad(d.getSeconds()) : ''}`;
}

function setLoading(text) {
  const el = $('#loading');
  if (!text) { el.hidden = true; return; }
  el.hidden = false; $('#loadingText').textContent = text;
}

function renderUi() {
  $('#clock').textContent = fmtTime(sim.time);
  $('#clockState').textContent = sim.paused ? 'PAUSE' : (sim.running ? `×${sim.speed}` : '');
  const p = pendingRoutes();
  if (sim.running) setLoading(p > 0 ? `Calcul des itinéraires : ${p} en attente` : '');

  // KPI
  const counts = {}; Object.keys(STATUS).forEach((k) => (counts[k] = 0));
  for (const v of sim.vehicles) counts[v.status]++;
  const active = [...sim.incidents.values()].filter((i) => i.status !== 'resolu').length;
  $('#kpis').innerHTML = Object.entries(STATUS).map(([k, s]) =>
    `<button class="kpi${sim.statusFilter === k ? ' on' : ''}" data-st="${k}" title="Filtrer : ${s.label}"><i style="background:${s.color}"></i><b>${counts[k]}</b><span>${s.label}</span></button>`).join('') +
    `<span class="kpi" title="Incidents actifs"><b>${active}</b><span>incidents</span></span>`;
  $('#cntVeh').textContent = sim.vehicles.length;
  $('#cntInc').textContent = active;
  const badge = $('#cntAlerts'); badge.textContent = sim.unread; badge.classList.toggle('has', sim.unread > 0);

  updateVehicleList();
  if (sim.selected) updateDetail();
  if (sim.follow && sim.selected) { const v = sim.byId.get(sim.selected); if (v?.visible) map.panTo([v.lat, v.lng], { animate: true, duration: 0.4 }); }
  if (sim.selected) drawSelectedRoute();
  if (!$('#tab-incidents').hidden) renderIncidents();
}

// --- Liste des véhicules
function buildVehicleList() {
  const ul = $('#vehList'); ul.innerHTML = '';
  const order = Object.keys(TYPES);
  const list = sim.vehicles.slice().sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type) || a.idx - b.idx);
  for (const v of list) {
    const T = TYPES[v.type];
    const li = document.createElement('li');
    li.className = 'veh-row'; li.dataset.id = v.id;
    li.innerHTML = `<span class="ico">${T.icon}</span><div><div class="cs">${esc(v.callsign)}</div><div class="sub">${T.label}</div></div><div class="right"><div class="spd"></div><span class="st-badge"><i></i><span></span></span></div>`;
    li.addEventListener('click', () => selectVehicle(v.id, true));
    v.row = li; v.rowSpd = li.querySelector('.spd'); v.rowDot = li.querySelector('.st-badge i'); v.rowSt = li.querySelector('.st-badge span');
    ul.appendChild(li);
  }
  renderTypeFilter();
  updateVehicleList();
}
function updateVehicleList() {
  const q = $('#vehFilter').value.trim().toLowerCase();
  for (const v of sim.vehicles) {
    if (!v.row) continue;
    const label = statusLabel(v);
    v.rowSpd.textContent = v.visible ? `${Math.round(v.speed * 3.6)} km/h` : '…';
    v.rowDot.style.background = STATUS[v.status].color;
    v.rowSt.textContent = label;
    const hay = `${v.callsign} ${TYPES[v.type].label} ${label}`.toLowerCase();
    const show = (!q || hay.includes(q)) && (!sim.typeFilter || v.type === sim.typeFilter) && (!sim.statusFilter || v.status === sim.statusFilter);
    v.row.hidden = !show;
    v.row.classList.toggle('sel', sim.selected === v.id);
  }
}
function renderTypeFilter() {
  const present = Object.keys(TYPES).filter((t) => sim.vehicles.some((v) => v.type === t));
  $('#typeFilter').innerHTML = `<button class="chip${!sim.typeFilter ? ' on' : ''}" data-type="">Tous</button>` +
    present.map((t) => `<button class="chip${sim.typeFilter === t ? ' on' : ''}" data-type="${t}">${TYPES[t].icon} ${TYPES[t].label}</button>`).join('');
}

// --- Détail véhicule
function selectVehicle(id, pan) {
  const prev = sim.byId.get(sim.selected);
  if (prev?.el) prev.el.classList.remove('sel');
  sim.selected = id;
  const v = sim.byId.get(id);
  if (!v) { $('#detail').hidden = true; layers.route.clearLayers(); sim.follow = false; return; }
  if (v.el) v.el.classList.add('sel');
  $('#detail').hidden = false;
  if (pan && v.visible) map.setView([v.lat, v.lng], Math.max(map.getZoom(), 15));
  updateDetail(); drawSelectedRoute(); updateVehicleList();
}
function updateDetail() {
  const v = sim.byId.get(sim.selected); if (!v) return;
  const T = TYPES[v.type], S = STATUS[v.status];
  $('#dIcon').textContent = T.icon;
  $('#dTitle').textContent = v.callsign;
  $('#dSub').textContent = T.label + (v.base ? ` · ${v.base.name}` : '');
  const st = $('#dStatus'); st.textContent = statusLabel(v); st.style.borderLeftColor = S.color;
  const kmh = Math.round(v.speed * 3.6);
  $('#dSpeed').textContent = `${kmh} km/h`;
  $('#dSpeed').style.color = kmh > T.limit + 10 && v.status !== 'route' ? 'var(--crit)' : '';
  $('#dHeading').textContent = `${Math.round(v.heading)}° ${cardinal(v.heading)}`;
  $('#dFuel').textContent = `${Math.round(v.fuel)} %`;
  const fb = $('#dFuelBar'); fb.style.width = `${clamp(v.fuel, 0, 100)}%`; fb.style.background = v.fuel < 12 ? 'var(--crit)' : v.fuel < 30 ? 'var(--warn)' : 'var(--ok)';
  $('#dOdo').textContent = `${Math.round(v.odo).toLocaleString('fr-FR')} km`;
  $('#dPos').textContent = v.visible ? `${v.lat.toFixed(5)}, ${v.lng.toFixed(5)}` : 'positionnement…';
  let mission = '—';
  if (v.incident) { const inc = sim.incidents.get(v.incident); mission = inc ? `Incident #${inc.id} · ${INCIDENTS[inc.type].label}` : '—'; }
  else if (v.status === 'hs') mission = 'Immobilisé';
  else if (v.status === 'retour') mission = `Retour vers ${v.base?.name || 'base'}`;
  else if (v.status === 'dispo') mission = `En attente à ${v.base?.name || 'la base'}`;
  else if (v.dwell > 0) mission = T.behavior === 'line' ? 'Arrêt voyageurs' : T.behavior === 'trips' ? 'Arrêt client / livraison' : 'Stationné';
  else if (v.route) mission = `${T.service} · ${(Math.max(0, v.route.total - v.prog) / 1000).toFixed(1)} km restants${v.route.approx ? ' (trajet approximatif)' : ''}`;
  const m = $('#dMission'); m.textContent = mission; m.className = 'txt';
  $('#dFollow').classList.toggle('on', sim.follow);
  $('#dHS').textContent = v.status === 'hs' ? 'Remettre en service' : 'Mettre hors service';
}
function drawSelectedRoute() {
  layers.route.clearLayers();
  const v = sim.byId.get(sim.selected);
  if (!v || !v.route) return;
  const rest = [[v.lat, v.lng], ...v.route.coords.slice(v.seg + 1)];
  const col = v.status === 'route' ? STATUS.route.color : TYPES[v.type].color;
  L.polyline(rest, { color: col, weight: 4, opacity: 0.85, interactive: false }).addTo(layers.route);
  L.circleMarker(rest[rest.length - 1], { radius: 5, color: '#fff', weight: 2, fillColor: col, fillOpacity: 1, interactive: false }).addTo(layers.route);
}

// --- Incidents
function renderIncidents() {
  const list = [...sim.incidents.values()].sort((a, b) => (a.status === 'resolu') - (b.status === 'resolu') || b.id - a.id).slice(0, 40);
  $('#incEmpty').hidden = list.length > 0;
  $('#incList').innerHTML = list.map((inc) => {
    const IT = INCIDENTS[inc.type];
    const pill = inc.status === 'resolu' ? ['resolu', 'Clôturé'] : inc.assigned.length ? ['cours', 'En cours'] : ['attente', 'En attente'];
    const names = inc.assigned.map((id) => { const v = sim.byId.get(id); return v ? `${TYPES[v.type].icon} ${esc(v.callsign)}` : ''; }).join(' · ') || 'Aucun moyen engagé';
    const needs = Object.entries(inc.needs).map(([t, n]) => `${n} ${TYPES[t].label}`).join(', ');
    return `<li class="inc-item${inc.status === 'resolu' ? ' resolved' : ''}" data-inc="${inc.id}">
      <div class="t"><span>${IT.icon} #${inc.id} ${esc(IT.label)}</span><span class="inc-pill ${pill[0]}">${pill[1]}</span></div>
      <div class="s">${fmtTime(inc.created, false)} · besoin : ${esc(needs)}</div>
      <div class="s">${names}</div></li>`;
  }).join('');
}

// --- Alertes
const ALERT_ICON = { info: 'ℹ️', warn: '⚠️', crit: '🚨' };
function pushAlert(level, v, msg) {
  const a = { t: sim.time, level, vid: v?.id || null, msg };
  sim.alerts.unshift(a);
  if (sim.alerts.length > 200) sim.alerts.pop();
  const li = document.createElement('li');
  li.className = `alert-item ${level}`;
  li.innerHTML = `<time>${fmtTime(a.t)}</time><div>${v ? `<b>${esc(v.callsign)}</b> · ` : ''}${esc(msg)}</div>`;
  if (v) li.addEventListener('click', () => selectVehicle(v.id, true));
  const ul = $('#alertList'); ul.prepend(li);
  while (ul.children.length > 150) ul.lastChild.remove();
  $('#alertEmpty').hidden = true;
  if (level !== 'info' && $('#tab-alerts').hidden) sim.unread++;
  if (level === 'crit' && v) toast(`🚨 ${v.callsign} : ${msg}`, 'crit');
}
function toast(text, level = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${level}`; el.textContent = text;
  const box = $('#toasts'); box.appendChild(el);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => el.remove(), 4500);
}

function switchTab(name) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
  ['vehicles', 'incidents', 'alerts'].forEach((k) => ($('#tab-' + k).hidden = k !== name));
  if (name === 'alerts') sim.unread = 0;
  if (name === 'incidents') renderIncidents();
}

function setSpeed(s) {
  sim.speed = s; sim.paused = false; store.set('speed', s);
  document.querySelectorAll('.tbtn.speed').forEach((b) => b.classList.toggle('active', Number(b.dataset.speed) === s));
  $('#btnPause').classList.remove('paused'); $('#btnPause').textContent = '❚❚';
}
function togglePause() {
  sim.paused = !sim.paused;
  const b = $('#btnPause'); b.classList.toggle('paused', sim.paused); b.textContent = sim.paused ? '▶' : '❚❚';
}

// --- Recherche de ville
async function searchCity(q) {
  const ul = $('#cityResults');
  ul.innerHTML = '<li>Recherche…</li>';
  try {
    const res = (await geocode(q)).filter((r) => r.boundingbox);
    if (!res.length) { ul.innerHTML = '<li>Aucun résultat. Essayez un autre nom.</li>'; return null; }
    return res;
  } catch (e) {
    ul.innerHTML = '<li>Service de recherche indisponible. Réessayez dans un instant.</li>';
    return null;
  }
}
async function searchAndShow(q) {
  const res = await searchCity(q); if (!res) return;
  const ul = $('#cityResults'); ul.innerHTML = '';
  res.forEach((r) => {
    const li = document.createElement('li');
    const parts = r.display_name.split(',');
    li.innerHTML = `<b>${esc(parts[0])}</b>${esc(parts.slice(1, 4).join(','))}`;
    li.addEventListener('click', () => { ul.innerHTML = ''; loadCity(r); });
    ul.appendChild(li);
  });
}
async function quickCity(name) {
  const res = await searchCity(name); if (!res) return;
  $('#cityResults').innerHTML = '';
  loadCity(res[0]);
}

// ======================================================================
// Initialisation
// ======================================================================
function initUi() {
  // Flotte
  const saved = store.get('fleet', {});
  $('#fleetForm').innerHTML = Object.entries(TYPES).map(([k, T]) =>
    `<label class="fleet-row" for="fleet-${k}"><span class="ico">${T.icon}</span><span><span class="dot" style="background:${T.color}"></span>${T.label}</span><input id="fleet-${k}" type="number" min="0" max="40" value="${saved[k] ?? T.def}"></label>`).join('');

  const chipsHtml = CONFIG.cityChips.map((c) => `<button class="chip" data-city="${esc(c)}">${esc(c)}</button>`).join('');
  $('#cityChips').innerHTML = chipsHtml; $('#welcomeChips').innerHTML = chipsHtml;
  document.querySelectorAll('[data-city]').forEach((b) => b.addEventListener('click', () => quickCity(b.dataset.city)));

  $('#citySearch').addEventListener('submit', (e) => { e.preventDefault(); const q = $('#cityInput').value.trim(); if (q) searchAndShow(q); });
  $('#btnApplyFleet').addEventListener('click', () => { if (sim.city) loadCity(sim.city.place); else toast('Choisissez d\'abord une ville.', 'warn'); });
  $('#btnRandomInc').addEventListener('click', randomIncident);
  $('#btnFit').addEventListener('click', fitCity);

  const opt = store.get('opts', {});
  const bindOpt = (id, key, apply) => {
    const el = $(id); if (opt[key] != null) el.checked = opt[key];
    const run = () => { apply(el.checked); opt[key] = el.checked; store.set('opts', opt); };
    el.addEventListener('change', run); run();
  };
  bindOpt('#optAutoInc', 'autoInc', (on) => (sim.autoInc = on));
  bindOpt('#optEvents', 'events', (on) => (sim.events = on));
  bindOpt('#optLabels', 'labels', (on) => map.getContainer().classList.toggle('hide-labels', !on));
  bindOpt('#optLines', 'lines', (on) => (on ? map.addLayer(layers.lines) : map.removeLayer(layers.lines)));
  bindOpt('#optBases', 'bases', (on) => (on ? map.addLayer(layers.bases) : map.removeLayer(layers.bases)));

  // Temps
  document.querySelectorAll('.tbtn.speed').forEach((b) => b.addEventListener('click', () => setSpeed(Number(b.dataset.speed))));
  $('#btnPause').addEventListener('click', togglePause);

  // Panneaux
  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => switchTab(t.dataset.tab)));
  $('#vehFilter').addEventListener('input', updateVehicleList);
  $('#typeFilter').addEventListener('click', (e) => { const b = e.target.closest('[data-type]'); if (!b) return; sim.typeFilter = b.dataset.type || null; renderTypeFilter(); updateVehicleList(); });
  $('#kpis').addEventListener('click', (e) => { const b = e.target.closest('[data-st]'); if (!b) return; sim.statusFilter = sim.statusFilter === b.dataset.st ? null : b.dataset.st; switchTab('vehicles'); renderUi(); });
  $('#incList').addEventListener('click', (e) => { const li = e.target.closest('[data-inc]'); if (!li) return; const inc = sim.incidents.get(Number(li.dataset.inc)); if (inc) map.setView([inc.lat, inc.lng], Math.max(map.getZoom(), 15)); });

  // Détail
  $('#dClose').addEventListener('click', () => selectVehicle(null));
  $('#dFollow').addEventListener('click', () => { sim.follow = !sim.follow; updateDetail(); });
  $('#dHS').addEventListener('click', () => { const v = sim.byId.get(sim.selected); if (v) { toggleHS(v); updateDetail(); } });
  map.on('dragstart', () => { if (sim.follow) { sim.follow = false; updateDetail(); } });

  // Création d'incident au clic
  map.on('click', (e) => {
    if (!sim.running) return;
    const html = `<div class="inc-menu"><div class="inc-menu-title">Créer un incident ici</div>${Object.entries(INCIDENTS).map(([k, it]) => `<button data-inc="${k}">${it.icon} ${esc(it.label)}</button>`).join('')}</div>`;
    L.popup({ closeButton: true }).setLatLng(e.latlng).setContent(html).openOn(map);
  });
  map.on('popupopen', (e) => {
    const ll = e.popup.getLatLng();
    e.popup.getElement().querySelectorAll('[data-inc]').forEach((b) => b.addEventListener('click', () => { map.closePopup(); createIncident(b.dataset.inc, ll.lat, ll.lng); }));
  });

  // Clavier
  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea')) return;
    if (e.code === 'Space') { e.preventDefault(); togglePause(); }
    else if (['1', '2', '3', '4', '5'].includes(e.key)) setSpeed([1, 2, 5, 10, 30][Number(e.key) - 1]);
    else if (e.key === 'i' || e.key === 'I') randomIncident();
    else if ((e.key === 'f' || e.key === 'F') && sim.selected) { sim.follow = !sim.follow; updateDetail(); }
    else if (e.key === 'Escape') { selectVehicle(null); map.closePopup(); }
  });

  setSpeed(store.get('speed', 5));
}

async function boot() {
  initUi();
  requestAnimationFrame(frame);
  const params = new URLSearchParams(location.search);
  const speed = Number(params.get('vitesse'));
  if ([1, 2, 5, 10, 30].includes(speed)) setSpeed(speed);
  const q = params.get('ville');
  if (q) { $('#cityInput').value = q; quickCity(q); return; }
  const last = store.get('city', null);
  if (last && last.boundingbox) loadCity(last);
}
boot();
