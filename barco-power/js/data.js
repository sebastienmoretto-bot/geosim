/* Barco Power Solutions — référentiel des sites (parcs réels, données d'exploitation simulées). */
(function () {
  'use strict';
  const BPS = (window.BPS = window.BPS || {});

  // ---------------------------------------------------------------- Parcs éoliens en mer
  const WIND = [
    { id: 'SNZ', name: 'Saint-Nazaire', full: 'Parc du Banc de Guérande', country: 'France', cc: 'FR', kind: 'Éolien en mer posé',
      lat: 47.150, lng: -2.625, n: 80, unitMW: 6, model: 'Haliade 150 — 6 MW', year: 2022, cols: 10, spacing: 1.0, rot: 18,
      port: { name: 'Port de La Turballe', lat: 47.346, lng: -2.512 }, landfall: { name: 'Atterrage La Baule', lat: 47.272, lng: -2.392 }, sea: 'Atlantique' },
    { id: 'YNO', name: 'Yeu-Noirmoutier', full: 'Parc des îles d’Yeu et de Noirmoutier', country: 'France', cc: 'FR', kind: 'Éolien en mer posé',
      lat: 46.880, lng: -2.470, n: 61, unitMW: 8, model: 'SG 8.0-167 DD — 8 MW', year: 2025, cols: 8, spacing: 1.2, rot: 30,
      port: { name: 'Port-Joinville', lat: 46.728, lng: -2.348 }, landfall: { name: 'Atterrage La Barre-de-Monts', lat: 46.887, lng: -2.150 }, sea: 'Atlantique' },
    { id: 'SBR', name: 'Saint-Brieuc', full: 'Parc de la baie de Saint-Brieuc', country: 'France', cc: 'FR', kind: 'Éolien en mer posé',
      lat: 48.855, lng: -2.540, n: 62, unitMW: 8, model: 'SG 8.0-167 DD — 8 MW', year: 2023, cols: 8, spacing: 1.2, rot: -10,
      port: { name: 'Port de Saint-Quay-Portrieux', lat: 48.650, lng: -2.818 }, landfall: { name: 'Atterrage Caroual', lat: 48.620, lng: -2.475 }, sea: 'Manche' },
    { id: 'COU', name: 'Courseulles-sur-Mer', full: 'Parc du Calvados', country: 'France', cc: 'FR', kind: 'Éolien en mer posé',
      lat: 49.455, lng: -0.525, n: 64, unitMW: 7, model: 'SG 7.0-154 DD — 7 MW', year: 2025, cols: 8, spacing: 1.1, rot: 12,
      port: { name: 'Port de Ouistreham', lat: 49.283, lng: -0.247 }, landfall: { name: 'Atterrage Bernières', lat: 49.336, lng: -0.420 }, sea: 'Manche' },
    { id: 'FEC', name: 'Fécamp', full: 'Parc de Fécamp', country: 'France', cc: 'FR', kind: 'Éolien en mer posé',
      lat: 49.885, lng: 0.215, n: 71, unitMW: 7, model: 'SG 7.0-154 DD — 7 MW', year: 2024, cols: 9, spacing: 1.1, rot: 25,
      port: { name: 'Port de Fécamp', lat: 49.762, lng: 0.372 }, landfall: { name: 'Atterrage Senneville', lat: 49.775, lng: 0.405 }, sea: 'Manche' },
    { id: 'DLT', name: 'Dieppe-Le Tréport', full: 'Parc de Dieppe-Le Tréport', country: 'France', cc: 'FR', kind: 'Éolien en mer posé',
      lat: 50.080, lng: 1.200, n: 62, unitMW: 8, model: 'SG 8.0-167 DD — 8 MW', year: 2026, cols: 8, spacing: 1.2, rot: 35,
      port: { name: 'Port du Tréport', lat: 50.062, lng: 1.372 }, landfall: { name: 'Atterrage Penly', lat: 49.978, lng: 1.212 }, sea: 'Manche' },
    { id: 'PGL', name: 'Provence Grand Large', full: 'Ferme pilote flottante Provence Grand Large', country: 'France', cc: 'FR', kind: 'Éolien en mer flottant',
      lat: 43.255, lng: 4.855, n: 3, unitMW: 8.4, model: 'SG 8.0-167 DD — 8,4 MW', year: 2024, cols: 3, spacing: 1.0, rot: 0,
      port: { name: 'Port-Saint-Louis-du-Rhône', lat: 43.385, lng: 4.805 }, landfall: { name: 'Atterrage plage Napoléon', lat: 43.360, lng: 4.860 }, sea: 'Méditerranée' },
    { id: 'NNG', name: 'Neart na Gaoithe', full: 'Neart na Gaoithe Offshore Wind Farm', country: 'Royaume-Uni', cc: 'UK', kind: 'Éolien en mer posé',
      lat: 56.270, lng: -2.310, n: 54, unitMW: 8, model: 'SG 8.0-167 DD — 8 MW', year: 2025, cols: 9, spacing: 1.3, rot: 40,
      port: { name: 'Port d’Eyemouth', lat: 55.873, lng: -2.090 }, landfall: { name: 'Atterrage Thorntonloch', lat: 55.955, lng: -2.420 }, sea: 'Mer du Nord' },
    { id: 'BLY', name: 'Blyth', full: 'Blyth Offshore Demonstrator', country: 'Royaume-Uni', cc: 'UK', kind: 'Éolien en mer posé',
      lat: 55.140, lng: -1.400, n: 5, unitMW: 8.3, model: 'MHI Vestas V164 — 8,3 MW', year: 2017, cols: 5, spacing: 0.9, rot: 60,
      port: { name: 'Port de Blyth', lat: 55.127, lng: -1.498 }, landfall: { name: 'Atterrage Cambois', lat: 55.150, lng: -1.520 }, sea: 'Mer du Nord' },
    { id: 'TEE', name: 'Teesside', full: 'Teesside Offshore Wind Farm', country: 'Royaume-Uni', cc: 'UK', kind: 'Éolien en mer posé',
      lat: 54.650, lng: -1.120, n: 27, unitMW: 2.3, model: 'Siemens SWT-2.3-93 — 2,3 MW', year: 2013, cols: 9, spacing: 0.45, rot: 55,
      port: { name: 'Port de Hartlepool', lat: 54.692, lng: -1.198 }, landfall: { name: 'Atterrage Redcar', lat: 54.618, lng: -1.090 }, sea: 'Mer du Nord' },
  ];

  // ---------------------------------------------------------------- Centrales solaires au sol
  const SOLAR = [
    { id: 'CES', name: 'Cestas', full: 'Centrale solaire de Cestas', country: 'France', cc: 'FR', lat: 44.735, lng: -0.795, cap: 300, n: 25, town: 'Cestas', year: 2015 },
    { id: 'TOU', name: 'Toul-Rosières', full: 'Centrale solaire de Toul-Rosières', country: 'France', cc: 'FR', lat: 48.780, lng: 5.975, cap: 115, n: 14, town: 'Toul', year: 2012 },
    { id: 'MEE', name: 'Les Mées', full: 'Parc solaire des Mées', country: 'France', cc: 'FR', lat: 44.035, lng: 5.955, cap: 100, n: 12, town: 'Les Mées', year: 2011 },
    { id: 'NDB', name: 'Núñez de Balboa', full: 'Planta fotovoltaica Núñez de Balboa', country: 'Espagne', cc: 'ES', lat: 38.680, lng: -6.290, cap: 500, n: 30, town: 'Usagre', year: 2020 },
    { id: 'FPZ', name: 'Francisco Pizarro', full: 'Planta fotovoltaica Francisco Pizarro', country: 'Espagne', cc: 'ES', lat: 39.500, lng: -5.840, cap: 590, n: 32, town: 'Torrecillas de la Tiesa', year: 2022 },
    { id: 'MUL', name: 'Mula', full: 'Planta fotovoltaica de Mula', country: 'Espagne', cc: 'ES', lat: 38.080, lng: -1.500, cap: 494, n: 30, town: 'Mula', year: 2019 },
    { id: 'AMA', name: 'Amareleja', full: 'Central fotovoltaica de Amareleja', country: 'Portugal', cc: 'PT', lat: 38.210, lng: -7.220, cap: 46, n: 8, town: 'Moura', year: 2008 },
    { id: 'MDC', name: 'Montalto di Castro', full: 'Impianto fotovoltaico di Montalto di Castro', country: 'Italie', cc: 'IT', lat: 42.370, lng: 11.580, cap: 84, n: 10, town: 'Montalto di Castro', year: 2010 },
    { id: 'KOZ', name: 'Kozani', full: 'Φωτοβολταϊκό πάρκο Κοζάνης', country: 'Grèce', cc: 'GR', lat: 40.330, lng: 21.830, cap: 204, n: 18, town: 'Kozani', year: 2022 },
    { id: 'WIT', name: 'Witznitz', full: 'Solarpark Witznitz', country: 'Allemagne', cc: 'DE', lat: 51.155, lng: 12.460, cap: 605, n: 32, town: 'Borna', year: 2024 },
  ];

  // ---------------------------------------------------------------- Types d'incident
  // scope : unit | units (grappe) | string (rangée) | park | zone (pas d'effet sur la production)
  // effect : statut appliqué aux unités touchées (factor = part de puissance conservée)
  const INCIDENT_TYPES = {
    turbine_fault: { label: 'Défaut convertisseur', tech: 'wind', scope: 'unit', sev: ['majeure', 'mineure'], effect: { status: 'fault', factor: 0 }, travel: true, work: [70, 150], w: 10,
      desc: 'Déclenchement du convertisseur de puissance, éolienne arrêtée.' },
    overspeed: { label: 'Survitesse rotor', tech: 'wind', scope: 'unit', sev: ['critique'], effect: { status: 'fault', factor: 0 }, travel: true, work: [90, 160], w: 2,
      desc: 'Survitesse détectée, freinage d’urgence et mise en drapeau des pales.' },
    gen_temp: { label: 'Surchauffe générateur', tech: 'wind', scope: 'unit', sev: ['mineure'], effect: { status: 'curt', factor: 0.55 }, travel: true, work: [50, 100], w: 6,
      desc: 'Température du générateur au-dessus du seuil, puissance réduite automatiquement.' },
    lightning: { label: 'Impact de foudre', tech: 'wind', scope: 'unit', sev: ['majeure'], effect: { status: 'fault', factor: 0 }, travel: true, work: [100, 180], w: 2,
      desc: 'Impact de foudre détecté sur une pale. Inspection obligatoire avant redémarrage.' },
    icing: { label: 'Givrage des pales', tech: 'wind', scope: 'units', sev: ['mineure'], effect: { status: 'ice', factor: 0 }, travel: false, duration: [90, 200], w: 2,
      desc: 'Détection de glace sur les pales, arrêt préventif des éoliennes concernées.' },
    array_cable: { label: 'Défaut câble inter-éoliennes', tech: 'wind', scope: 'string', sev: ['majeure'], effect: { status: 'offline', factor: 0 }, travel: true, work: [140, 240], w: 2,
      desc: 'Perte d’isolement sur un câble inter-éoliennes, rangée déconnectée.' },
    export_cable: { label: 'Coupure câble d’export', tech: 'wind', scope: 'park', sev: ['critique'], effect: { status: 'offline', factor: 0 }, travel: true, work: [180, 300], w: 0.6,
      desc: 'Déclenchement de la protection du câble d’export. Parc entièrement déconnecté du réseau.' },
    intrusion_sea: { label: 'Navire non autorisé dans la zone', tech: 'wind', scope: 'zone', sev: ['mineure'], effect: null, travel: true, work: [40, 80], w: 3,
      desc: 'Un navire non identifié est entré dans la zone d’exclusion du parc (AIS).' },
    inverter_fault: { label: 'Défaut onduleur', tech: 'solar', scope: 'unit', sev: ['majeure', 'mineure'], effect: { status: 'fault', factor: 0 }, travel: true, work: [60, 130], w: 10,
      desc: 'Onduleur central en défaut d’isolement, poste de conversion arrêté.' },
    fire: { label: 'Départ de feu', tech: 'solar', scope: 'units', sev: ['critique'], effect: { status: 'offline', factor: 0 }, travel: true, work: [120, 220], w: 0.8,
      desc: 'Détection de fumée près d’un poste de conversion. Coupure et levée de doute.' },
    intrusion_site: { label: 'Intrusion sur site', tech: 'solar', scope: 'unit', sev: ['majeure'], effect: null, travel: true, work: [40, 90], w: 2,
      desc: 'Détection périmétrique déclenchée : franchissement de clôture.' },
    soiling: { label: 'Encrassement des panneaux', tech: 'solar', scope: 'units', sev: ['info'], effect: { status: 'curt', factor: 0.82 }, travel: true, work: [80, 160], w: 3,
      desc: 'Perte de rendement liée aux poussières, nettoyage à programmer.' },
    hail: { label: 'Épisode de grêle', tech: 'solar', scope: 'units', sev: ['majeure'], effect: { status: 'fault', factor: 0 }, travel: true, work: [140, 240], w: 0.8,
      desc: 'Grêle signalée, modules potentiellement endommagés. Inspection visuelle requise.' },
    substation: { label: 'Défaut poste de livraison', tech: 'solar', scope: 'park', sev: ['critique'], effect: { status: 'offline', factor: 0 }, travel: true, work: [150, 260], w: 0.5,
      desc: 'Ouverture du disjoncteur au poste de livraison. Centrale découplée du réseau.' },
    thermal: { label: 'Déclassement thermique', tech: 'solar', scope: 'park', sev: ['mineure'], effect: { status: 'curt', factor: 0.8 }, travel: false, duration: [150, 280], w: 0,
      desc: 'Températures élevées, puissance des onduleurs réduite pour les protéger.' },
    maintenance: { label: 'Maintenance planifiée', tech: 'both', scope: 'unit', sev: ['info'], effect: { status: 'maint', factor: 0 }, travel: true, work: [90, 180], w: 4,
      desc: 'Intervention préventive programmée.' },
    grid_curtail: { label: 'Bridage gestionnaire de réseau', tech: 'both', scope: 'park', sev: ['info'], effect: { status: 'curt', factor: 0.6 }, travel: false, duration: [120, 260], w: 1.5,
      desc: 'Consigne de limitation de puissance reçue du gestionnaire de réseau.' },
    storm_stop: { label: 'Arrêt sécurité tempête', tech: 'wind', scope: 'zone', sev: ['majeure'], effect: null, travel: false, w: 0, auto: true,
      desc: 'Vent au-dessus du seuil de coupure (25 m/s), éoliennes arrêtées en sécurité.' },
  };

  const SEVERITIES = {
    info: { label: 'Info', rank: 0 },
    mineure: { label: 'Mineure', rank: 1 },
    majeure: { label: 'Majeure', rank: 2 },
    critique: { label: 'Critique', rank: 3 },
  };

  const STATUS = {
    prod: { label: 'En production', avail: true },
    low: { label: 'Vent faible', avail: true },
    night: { label: 'Nuit', avail: true },
    storm: { label: 'Arrêt tempête', avail: true },
    curt: { label: 'Bridée', avail: true },
    ice: { label: 'Givrage', avail: false },
    maint: { label: 'Maintenance', avail: false },
    fault: { label: 'En défaut', avail: false },
    offline: { label: 'Déconnectée', avail: false },
  };
  const STATUS_PRIO = { offline: 6, fault: 5, maint: 4, ice: 3, curt: 2 };

  const STORM_NAMES = ['Aurore', 'Bérénice', 'Céleste', 'Dorian', 'Elouan', 'Faustine', 'Gaspard', 'Hortense', 'Isaure', 'Jasper', 'Léonie', 'Maël', 'Nolwenn', 'Oscar', 'Perrine', 'Quentin', 'Romane', 'Soren', 'Tiphaine', 'Ulysse'];

  const STORM_PATHS = {
    north: { label: 'Mer du Nord', from: [57.7, -5.6], to: [53.6, 4.5], radius: 190, boost: 19 },
    channel: { label: 'Manche', from: [48.4, -6.6], to: [51.4, 4.5], radius: 170, boost: 18 },
    atlantic: { label: 'Atlantique', from: [45.9, -6.8], to: [49.5, 1.5], radius: 180, boost: 18 },
    med: { label: 'Golfe du Lion', from: [44.6, 3.6], to: [41.5, 7.5], radius: 140, boost: 19 },
  };

  const VESSEL_NAMES = ['Iroise', 'Glénan', 'Chausey', 'Sein', 'Bréhat', 'Houat', 'Hoëdic', 'Molène', 'Tatihou', 'Aurigny', 'Farne', 'Bass Rock', 'Isle of May', 'Coquet', 'Frioul', 'Pomègues', 'Pilier', 'Ré', 'Groix', 'Batz'];

  // ---------------------------------------------------------------- Géométrie
  const KM_LAT = 1 / 110.574;
  const kmLng = (lat) => 1 / (111.32 * Math.cos((lat * Math.PI) / 180));
  function offset(lat, lng, dxKm, dyKm) { return [lat + dyKm * KM_LAT, lng + dxKm * kmLng(lat)]; }
  function rotate(x, y, deg) {
    const a = (deg * Math.PI) / 180;
    return [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
  }

  function buildWind(p) {
    p.tech = 'wind';
    p.capMW = +(p.n * p.unitMW).toFixed(1);
    const rows = Math.ceil(p.n / p.cols);
    p.units = [];
    for (let i = 0; i < p.n; i++) {
      const r = Math.floor(i / p.cols), c = i % p.cols;
      // quinconce léger pour un rendu plus naturel
      const x = (c - (p.cols - 1) / 2) * p.spacing + (r % 2 ? p.spacing * 0.18 : 0);
      const y = ((rows - 1) / 2 - r) * p.spacing;
      const [rx, ry] = rotate(x, y, p.rot);
      const [lat, lng] = offset(p.lat, p.lng, rx, ry);
      p.units.push({ idx: i, id: `${p.id}-E${String(i + 1).padStart(2, '0')}`, row: r, col: c, lat, lng });
    }
    p.rows = rows;
    const half = ((p.cols - 1) / 2) * p.spacing + p.spacing * 0.7, halfY = ((rows - 1) / 2) * p.spacing + p.spacing * 0.7;
    p.zone = [[-half, -halfY], [half, -halfY], [half, halfY], [-half, halfY]].map(([x, y]) => { const [rx, ry] = rotate(x, y, p.rot); return offset(p.lat, p.lng, rx, ry); });
    // poste en mer : côté terre de la grappe
    const [sx, sy] = rotate(0, -halfY + p.spacing * 0.3, p.rot);
    p.substation = offset(p.lat, p.lng, sx, sy);
    if (p.n <= 5) p.substation = null;
  }

  function buildSolar(p) {
    p.tech = 'solar';
    p.kind = 'Centrale solaire au sol';
    p.capMW = p.cap;
    p.unitMW = +(p.cap / p.n).toFixed(1);
    p.model = `${p.n} postes onduleurs de ${p.unitMW.toLocaleString('fr-FR')} MWc`;
    p.cols = Math.ceil(Math.sqrt(p.n * 1.6));
    const rows = Math.ceil(p.n / p.cols);
    p.rows = rows;
    const side = Math.sqrt(p.unitMW * 0.016); // ≈ 1,6 ha par MWc
    p.blockKm = side;
    p.units = [];
    for (let i = 0; i < p.n; i++) {
      const r = Math.floor(i / p.cols), c = i % p.cols;
      const x = (c - (p.cols - 1) / 2) * side, y = ((rows - 1) / 2 - r) * side;
      const [lat, lng] = offset(p.lat, p.lng, x, y);
      const g = side * 0.46;
      const sw = offset(p.lat, p.lng, x - g, y - g), ne = offset(p.lat, p.lng, x + g, y + g);
      p.units.push({ idx: i, id: `${p.id}-OND${String(i + 1).padStart(2, '0')}`, row: r, col: c, lat, lng, bounds: [sw, ne] });
    }
    const hx = (p.cols / 2) * side + 0.15, hy = (rows / 2) * side + 0.15;
    p.zone = [offset(p.lat, p.lng, -hx, -hy), offset(p.lat, p.lng, hx, -hy), offset(p.lat, p.lng, hx, hy), offset(p.lat, p.lng, -hx, hy)];
    const b = offset(p.lat, p.lng, 6.5, 4.5);
    p.port = { name: `Base maintenance ${p.town}`, lat: b[0], lng: b[1] };
    p.substation = offset(p.lat, p.lng, hx + 0.2, 0);
  }

  WIND.forEach(buildWind);
  SOLAR.forEach(buildSolar);

  BPS.data = {
    WIND, SOLAR, PARKS: [...SOLAR, ...WIND], INCIDENT_TYPES, SEVERITIES, STATUS, STATUS_PRIO,
    STORM_NAMES, STORM_PATHS, VESSEL_NAMES, offset, KM_LAT, kmLng,
    CO2_T_PER_MWH: 0.3, // facteur d'émission moyen évité (mix européen)
    HOUSEHOLD_KW: 0.55, // consommation moyenne d'un foyer
  };
  BPS.data.byId = Object.fromEntries(BPS.data.PARKS.map((p) => [p.id, p]));
})();
