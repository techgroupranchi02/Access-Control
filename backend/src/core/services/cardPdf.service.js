/**
 * Card PDFs: one PDF file per card of a print job, delivered as a ZIP.
 *
 * The browser builds the job exactly as it prints it (passRenderer.renderSheet with paper 'card':
 * one card per page, each with its own @page size) and fits the text. This service loads that
 * markup once in headless Chrome and writes each page to its own PDF (vector, true size).
 *
 * Images aren't uploaded (the artwork alone is ~2.7 MB, over the proxy's body limit): the markup
 * points at https://pp-img.invalid/bg/<templateId> and /asset/<assetId>, and this service answers
 * those from pass_templates / pass_template_assets, scoped to the event.
 *
 * Safety: the markup comes from staff, so the page can't reach anything else. JavaScript is off and
 * every request is aborted except those images, Google Fonts and the Freecomers media host
 * (festival logo). See ADR 0005 Amendment 5.
 */

const archiver = require('archiver');
const { query } = require('../../config/database');
const env = require('../../config/environment');

const MAX_CARDS = 500;
const MAX_HTML_CHARS = 30 * 1024 * 1024;
const MAX_CSS_CHARS = 1024 * 1024;
const IDLE_CLOSE_MS = 60 * 1000;
// The markup points at saved template images by this address (never a real host)
const IMAGE_BASE = 'https://pp-img.invalid/';
const IMAGE_PATH_RE = /^(bg|asset)\/(\d{1,10})$/;
const FONT_HOSTS = new Set(['fonts.googleapis.com', 'fonts.gstatic.com']);
const FONTS_URL_RE = /^https:\/\/fonts\.googleapis\.com\/css2\?[A-Za-z0-9_+:;,@&=.%-]+$/;
const DATA_URL_RE = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/s;

let browserPromise = null;
let idleTimer = null;
let queue = Promise.resolve();

class CardPdfError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

async function getBrowser() {
  clearTimeout(idleTimer);
  if (!browserPromise) {
    const puppeteer = require('puppeteer');
    browserPromise = puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    }).catch((err) => {
      browserPromise = null;
      throw err;
    });
  }
  return browserPromise;
}

function scheduleClose() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(async () => {
    const pending = browserPromise;
    browserPromise = null;
    try { (await pending)?.close(); } catch { /* already gone */ }
  }, IDLE_CLOSE_MS);
  idleTimer.unref?.();
}

/** A file name that is safe on every OS, keeping letters in any script. */
function safeFileName(name, index, used) {
  let base = String(name || '').normalize('NFC')
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 100);
  if (!base) base = `card-${String(index + 1).padStart(3, '0')}`;
  let candidate = base;
  for (let n = 2; used.has(candidate.toLowerCase()); n += 1) candidate = `${base}-${n}`;
  used.add(candidate.toLowerCase());
  return `${candidate}.pdf`;
}

/** Checks the request body; throws CardPdfError with a message staff can act on. */
function validateJob(body = {}) {
  const cards = Array.isArray(body.cards) ? body.cards : [];
  if (!cards.length) throw new CardPdfError('There are no cards to make PDFs from.');
  if (cards.length > MAX_CARDS) throw new CardPdfError(`Make PDFs for up to ${MAX_CARDS} cards at a time. Narrow the badge range.`);
  let htmlChars = 0;
  for (const c of cards) {
    if (!c || typeof c.html !== 'string' || !c.html) throw new CardPdfError('A card is missing its design.');
    htmlChars += c.html.length;
  }
  if (htmlChars > MAX_HTML_CHARS) throw new CardPdfError('This job is too large. Narrow the badge range and try again.');
  const css = typeof body.css === 'string' ? body.css : '';
  if (css.length > MAX_CSS_CHARS) throw new CardPdfError('This job is too large. Narrow the badge range and try again.');
  const fontsUrl = typeof body.fontsUrl === 'string' && FONTS_URL_RE.test(body.fontsUrl) ? body.fontsUrl : '';
  return { cards, css, fontsUrl };
}

function mediaHost() {
  try { return new URL(env.freecomersApiUrl).hostname; } catch { return ''; }
}

/** Loads a saved template image for this event: { contentType, body } or null. Cached per job. */
async function loadImage(eventId, path, cache) {
  if (cache.has(path)) return cache.get(path);
  const m = IMAGE_PATH_RE.exec(path);
  let image = null;
  if (m) {
    const rows = m[1] === 'bg'
      ? await query('SELECT background_image AS src FROM pass_templates WHERE id = ? AND event_id = ?', [Number(m[2]), eventId])
      : await query('SELECT data_url AS src FROM pass_template_assets WHERE id = ? AND event_id = ?', [Number(m[2]), eventId]);
    const d = rows[0]?.src ? DATA_URL_RE.exec(rows[0].src) : null;
    if (d) image = { contentType: d[1], body: Buffer.from(d[2], 'base64') };
  }
  cache.set(path, image);
  return image;
}

function escapeAttr(v) {
  return String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function jobDocument({ cards, css, fontsUrl }) {
  // Same root id as printInPage, so the CSS from renderSheet applies unchanged
  return `<!doctype html><html><head><meta charset="utf-8">
${fontsUrl ? `<link rel="stylesheet" href="${escapeAttr(fontsUrl)}">` : ''}
<style>html,body{margin:0;padding:0;background:#ffffff;}${css.replace(/<\/style/gi, '<\\/style')}</style>
</head><body><div id="fc-print-root">${cards.map((c) => c.html).join('')}</div></body></html>`;
}

/**
 * Renders the job and streams a ZIP of PDFs to `res`. Jobs run one at a time.
 * Validation errors throw before anything is written to the response.
 */
function streamCardPdfZip(body, res, { eventId, zipName = 'cards' } = {}) {
  const job = validateJob(body);
  const run = queue.then(() => renderJob(job, res, zipName, eventId));
  queue = run.catch(() => {});
  return run;
}

async function renderJob(job, res, zipName, eventId) {
  if (res.destroyed) return;
  const images = new Map();
  const media = mediaHost();
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const url = req.url();
      if (url.startsWith('data:')) return req.continue();
      if (url.startsWith(IMAGE_BASE)) {
        return loadImage(eventId, url.slice(IMAGE_BASE.length), images)
          .then((img) => (img ? req.respond({ status: 200, contentType: img.contentType, body: img.body }) : req.abort()))
          .catch(() => req.abort());
      }
      let host = '';
      try { host = new URL(url).hostname; } catch { /* not a URL */ }
      const imageFromMedia = host && host === media && req.resourceType() === 'image';
      if (url.startsWith('https://') && (FONT_HOSTS.has(host) || imageFromMedia)) return req.continue();
      return req.abort();
    });
    await page.setContent(jobDocument(job), { waitUntil: 'networkidle0', timeout: 60000 });

    const used = new Set();
    const archive = archiver('zip', { zlib: { level: 1 } });
    archive.on('warning', (err) => console.warn('[CardPdf] zip warning:', err.message));
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipName.replace(/[^A-Za-z0-9._-]+/g, '-')}.zip"`);
    res.setHeader('Cache-Control', 'no-store');
    archive.pipe(res);

    try {
      for (let i = 0; i < job.cards.length; i += 1) {
        if (res.destroyed) { archive.abort(); return; }
        const pdf = await page.pdf({ pageRanges: String(i + 1), preferCSSPageSize: true, printBackground: true, timeout: 60000 });
        archive.append(Buffer.from(pdf), { name: safeFileName(job.cards[i].name, i, used) });
      }
      await archive.finalize();
    } catch (err) {
      // Headers are already sent: cut the download so it can't be mistaken for a full ZIP
      console.error('[CardPdf] failed during the ZIP:', err.message);
      archive.abort();
      res.destroy(err);
    }
  } finally {
    try { await page.close(); } catch { /* browser gone */ }
    scheduleClose();
  }
}

module.exports = { streamCardPdfZip, CardPdfError, MAX_CARDS, IMAGE_BASE, safeFileName };
