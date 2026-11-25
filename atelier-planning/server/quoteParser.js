// Extraction des informations d'un devis PDF.
// Approche générique, par mots-clés réglables : on repère la main-d'œuvre
// (fabrication / pose), les heures, les totaux, le client et les postes à commander.
// Tout est proposé à l'opérateur, qui valide et ajuste dans le formulaire.

const AMOUNT_RE = /(?<![\d,.])(\d{1,3}(?:[ \u00a0\u202f.]\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(?:€|eur\b|euros?\b)?/gi;
const HOURS_RE = /(\d+(?:[.,]\d+)?)\s*(?:h\b|hrs?\b|heures?\b)/i;

function parseAmount(s) {
  let t = String(s).replace(/[ \u00a0\u202f]/g, '');
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/\.\d{3}(?:\.|$)/.test(t)) t = t.replace(/\./g, '');
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

// Montants « monétaires » d'une ligne (on ignore les petits entiers isolés type quantités
// quand la ligne contient des montants à décimales ou suivis de €).
function amountsInLine(line) {
  const out = [];
  for (const m of line.matchAll(AMOUNT_RE)) {
    const raw = m[0];
    const money = /€|eur/i.test(raw) || /,\d{2}\b/.test(raw) || /\d[ \u00a0\u202f.]\d{3}/.test(raw);
    const v = parseAmount(m[1]);
    if (v != null) out.push({ value: v, money, index: m.index });
  }
  const money = out.filter((a) => a.money);
  return money.length ? money : out;
}

function lastAmount(line) {
  const a = amountsInLine(line);
  return a.length ? a[a.length - 1].value : null;
}

function keywordRegex(list) {
  const parts = String(list || '').split('|').map((s) => s.trim()).filter(Boolean)
    .map((s) => s.replace(/[.*+?^${}()[\]\\]/g, '\\$&').replace(/['’]/g, "['’]?\\s*").replace(/[-\s]+/g, '[\\s-]*'));
  return parts.length ? new RegExp(`(?:^|[^a-zà-ÿ])(?:${parts.join('|')})`, 'i') : null;
}

function normalizeText(text) {
  return String(text || '').replace(/\r/g, '').replace(/[ \t]+/g, ' ')
    .split('\n').map((l) => l.trim()).filter(Boolean);
}

/**
 * @param {string} text  texte brut du PDF
 * @param {object} opts  { fabKeywords, poseKeywords, hourlyRate, categories:[{id,name,keywords}] }
 */
function parseQuoteText(text, opts = {}) {
  const lines = normalizeText(text);
  const fabRe = keywordRegex(opts.fabKeywords);
  const poseRe = keywordRegex(opts.poseKeywords);
  const hourlyRate = Number(opts.hourlyRate) || 0;
  const res = {
    quote_number: null, quote_date: null,
    client_name: null, client_phone: null, client_email: null, client_address: null,
    total_ht: null, total_ttc: null,
    labor_amount: 0, pose_amount: 0,
    fab_hours: 0, pose_hours: 0,
    fab_hours_from_quote: false, pose_hours_from_quote: false,
    labor_lines: [], suggested_categories: [],
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lower = line.toLowerCase();

    if (!res.quote_number) {
      const m = line.match(/devis\s*(?:n[°ºo]\.?|num[ée]ro|#|ref\.?|réf\.?)\s*:?\s*([A-Z0-9][A-Z0-9\-_/.]*\d[A-Z0-9\-_/.]*)/i);
      if (m) res.quote_number = m[1].replace(/[.]$/, '');
    }
    if (!res.quote_date) {
      const m = line.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b/);
      if (m) {
        const y = m[3].length === 2 ? `20${m[3]}` : m[3];
        res.quote_date = `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
      }
    }
    if (!res.client_phone) {
      const m = line.match(/(?:\+33\s?|0033\s?|\b0)[1-9](?:[\s.-]?\d{2}){4}\b/);
      if (m && !/siret|siren|tva|fax/i.test(line)) res.client_phone = m[0].replace(/[\s.-]/g, '');
    }
    if (!res.client_email) {
      const m = line.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
      if (m) res.client_email = m[0];
    }
    if (!res.client_name) {
      const m = line.match(/^(?:client|destinataire|adressé à|à l'attention de)\s*:?\s*(.*)$/i);
      if (m) {
        res.client_name = (m[1] || lines[i + 1] || '').trim() || null;
        const addr = lines.slice(m[1] ? i + 1 : i + 2, (m[1] ? i + 1 : i + 2) + 2).filter((l) => /\d/.test(l) && !/@|tél|tel/i.test(l));
        if (addr.length) res.client_address = addr.join(', ');
      } else {
        const m2 = line.match(/^(M\.|Mme|Mlle|Monsieur|Madame|M et Mme|M\. et Mme)\s+[A-ZÀ-ÿ].*/);
        if (m2) res.client_name = m2[0].trim();
      }
    }

    if (/total\s*(?:g[ée]n[ée]ral\s*)?h\.?\s?t\.?/i.test(lower) && !/remise/i.test(lower)) {
      const v = lastAmount(line.replace(/h\.?\s?t\.?/i, ' '));
      if (v != null) res.total_ht = v;
    } else if (/total\s*t\.?\s?t\.?\s?c\.?|net\s+à\s+payer/i.test(lower)) {
      const v = lastAmount(line.replace(/t\.?\s?t\.?\s?c\.?/i, ' '));
      if (v != null) res.total_ttc = v;
    }

    if (/^total|sous[- ]total|tva|acompte/i.test(lower)) continue;
    const isPose = poseRe && poseRe.test(line);
    const isFab = !isPose && fabRe && fabRe.test(line);
    if (isPose || isFab) {
      const lineNoHours = line.replace(HOURS_RE, ' ');
      const amount = lastAmount(lineNoHours);
      const h = line.match(HOURS_RE);
      const hours = h ? parseAmount(h[1]) : null;
      res.labor_lines.push({ text: line, kind: isPose ? 'pose' : 'fabrication', amount, hours });
      if (isPose) {
        if (amount) res.pose_amount += amount;
        if (hours) { res.pose_hours += hours; res.pose_hours_from_quote = true; }
      } else {
        if (amount) res.labor_amount += amount;
        if (hours) { res.fab_hours += hours; res.fab_hours_from_quote = true; }
      }
    }
  }

  // Postes à commander détectés
  for (const c of opts.categories || []) {
    const re = keywordRegex(c.keywords);
    if (!re) continue;
    const hit = lines.find((l) => re.test(l));
    if (hit) res.suggested_categories.push({ id: c.id, name: c.name, match: hit });
  }
  res.labor_amount = round(res.labor_amount);
  res.pose_amount = round(res.pose_amount);

  if (!res.fab_hours_from_quote && hourlyRate > 0 && res.labor_amount > 0) res.fab_hours = round(res.labor_amount / hourlyRate);
  if (!res.pose_hours_from_quote && hourlyRate > 0 && res.pose_amount > 0) res.pose_hours = round(res.pose_amount / hourlyRate);
  res.fab_hours = round(res.fab_hours);
  res.pose_hours = round(res.pose_hours);
  return res;
}

function round(n) { return Math.round(n * 100) / 100; }

async function parseQuotePdf(buffer, opts) {
  const { PDFParse } = require('pdf-parse');
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const data = await parser.getText();
    const text = String(data.text || '').replace(/^-- \d+ of \d+ --$/gm, '');
    return { ...parseQuoteText(text, opts), raw_text: text };
  } finally {
    await parser.destroy();
  }
}

module.exports = { parseQuoteText, parseQuotePdf, parseAmount, amountsInLine };
