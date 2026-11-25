// Envoi WhatsApp via l'API Cloud officielle de Meta.
// Les secrets viennent des variables d'environnement (jamais de la base) :
//   WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_VERIFY_TOKEN, WHATSAPP_APP_SECRET
const crypto = require('node:crypto');
const { getSetting } = require('./db');

function config(db) {
  const token = process.env.WHATSAPP_TOKEN || '';
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
  const dryRunSetting = getSetting(db, 'wa_dry_run') !== '0';
  return {
    token, phoneNumberId,
    apiVersion: getSetting(db, 'wa_api_version') || 'v21.0',
    configured: Boolean(token && phoneNumberId),
    dryRun: dryRunSetting || !(token && phoneNumberId),
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || '',
    appSecret: process.env.WHATSAPP_APP_SECRET || '',
  };
}

// '06 12 34 56 78' -> '33612345678' (format international sans +)
function normalizePhone(phone, countryCode = '33') {
  if (!phone) return null;
  let p = String(phone).replace(/[^\d+]/g, '');
  if (p.startsWith('+')) p = p.slice(1);
  else if (p.startsWith('00')) p = p.slice(2);
  else if (p.startsWith('0')) p = countryCode + p.slice(1);
  return p.length >= 8 ? p : null;
}

const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
function longDate(day) {
  const [y, m, d] = day.split('-').map(Number);
  const dt = new Date(y, m - 1, d, 12);
  return `${DAYS[dt.getDay()]} ${d} ${MONTHS[m - 1]}`;
}

// Paramètres du modèle : {{1}} client, {{2}} date, {{3}} heure, {{4}} entreprise
function templateParams({ clientName, installDate, installTime, companyName }) {
  return [clientName || 'Madame, Monsieur', longDate(installDate), (installTime || '08:00').replace(':', 'h'), companyName || ''];
}

function previewText(params) {
  return `Bonjour ${params[0]}, nous vous confirmons l'installation prévue le ${params[1]} à ${params[2]} par ${params[3]}. Merci de confirmer votre disponibilité.`;
}

async function sendTemplate(db, { to, templateName, lang = 'fr', params }) {
  const cfg = config(db);
  if (cfg.dryRun) {
    return { simulated: true, id: `simulation-${Date.now()}` };
  }
  const url = `https://graph.facebook.com/${cfg.apiVersion}/${cfg.phoneNumberId}/messages`;
  const body = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: lang },
      components: [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text: String(text) })) }],
    },
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.error?.message || `HTTP ${res.status}`;
    throw new Error(`WhatsApp : ${msg}`);
  }
  return { simulated: false, id: json?.messages?.[0]?.id || null };
}

function verifySignature(appSecret, rawBody, header) {
  if (!appSecret) return true; // signature non vérifiée si le secret n'est pas fourni
  if (!header || !rawBody) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const a = Buffer.from(expected), b = Buffer.from(String(header));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { config, normalizePhone, templateParams, previewText, sendTemplate, verifySignature, longDate };
