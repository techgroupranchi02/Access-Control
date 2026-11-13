/**
 * passRenderer: turns a pass template + delegate/badge data into HTML (docs/adr/0005-pass-templates.md).
 *
 * The same markup is used for the live preview in Settings › Badges & Passes, the print dialog
 * preview and the printed page, so what staff see is what prints. Sizes are in mm.
 *
 * Modes:
 *   full    Pass + QR
 *   no-qr   Pass without the QR (an outlined box instead); not offered in the print dialog
 *   qr-only QR sticker (the festival's QR Settings, ctx.qrSettings)
 *
 * Paper:
 *   card    one pass per page, page size = pass size (card / label printers)
 *   a4      A4 portrait or landscape, columns × rows chosen in the print dialog (sheetLayout),
 *           pieces at true size with light cut lines
 *
 * Every value is escaped; nothing festival-specific is written here. Empty values are left out.
 */
import { qrSvgMarkup } from '../components/common/QrCode';

export const PASS_MODES = [
  { key: 'full', label: 'Pass + QR', hint: 'The full pass with the QR printed on it' },
  { key: 'qr-only', label: 'QR only', hint: 'QR stickers with the badge number' }
];

export const PAPER_OPTIONS = [
  { key: 'card', label: 'Card printer', hint: 'One pass per page, page size = pass size' },
  { key: 'a4', label: 'A4 sheet', hint: 'A4 pages, with cut lines; choose the layout below' }
];

export const SIZE_PRESETS = [
  { key: 'cr80', label: 'ID card (CR80)', w: 85.6, h: 54 },
  { key: 'a6', label: 'Lanyard (A6)', w: 105, h: 148 },
  { key: '4x6', label: 'Large lanyard (4 × 6 in)', w: 101.6, h: 152.4 },
  { key: 'sticker50', label: 'Square sticker (50 mm)', w: 50, h: 50 }
];

/** Bleed of an artwork template: extra artwork on each side beyond the pass size, in mm (ADR 0005, Amendment 4). */
export const MAX_BLEED_MM = 12.7;
export function bleedOf(template) {
  if (!template || template.design_mode !== 'artwork') return 0;
  const b = Number(template.config?.bleedMm);
  return Number.isFinite(b) ? Math.min(MAX_BLEED_MM, Math.max(0, b)) : 0;
}

/** "4 × 6 in" when both sides are whole eighths of an inch (within 0.05 mm), else ''. */
export function inchLabel(wMm, hMm) {
  const inch = (v) => {
    const eighths = Math.round((Number(v) / 25.4) * 8);
    return Math.abs(eighths * 3.175 - Number(v)) < 0.05 && eighths > 0 ? String(Math.round((eighths / 8) * 1000) / 1000) : null;
  };
  const w = inch(wMm);
  const h = inch(hMm);
  return w && h ? `${w} × ${h} in` : '';
}

/** "#045": a badge's permanent running number within the festival (ADR 0001, Amendment 3). */
export const formatSequence = (n) => (n === null || n === undefined || n === '' ? '' : `#${String(n).padStart(3, '0')}`);

/** The 7 fonts text elements can use (Google Fonts; loaded only where passes are shown). */
export const FONTS = [
  { key: 'inter', label: 'Inter', family: "'Inter', sans-serif", g: 'Inter:ital,wght@0,400;0,600;0,800;1,400;1,600;1,800' },
  { key: 'poppins', label: 'Poppins', family: "'Poppins', sans-serif", g: 'Poppins:ital,wght@0,400;0,600;0,800;1,400;1,600;1,800' },
  { key: 'montserrat', label: 'Montserrat', family: "'Montserrat', sans-serif", g: 'Montserrat:ital,wght@0,400;0,600;0,800;1,400;1,600;1,800' },
  { key: 'oswald', label: 'Oswald', family: "'Oswald', sans-serif", g: 'Oswald:wght@400;600;700' },
  { key: 'playfair', label: 'Playfair Display', family: "'Playfair Display', serif", g: 'Playfair+Display:ital,wght@0,400;0,600;0,800;1,400;1,600;1,800' },
  { key: 'roboto_slab', label: 'Roboto Slab', family: "'Roboto Slab', serif", g: 'Roboto+Slab:wght@400;600;800' },
  { key: 'dancing_script', label: 'Dancing Script', family: "'Dancing Script', cursive", g: 'Dancing+Script:wght@400;600;700' }
];
const fontFamily = (key) => (FONTS.find((f) => f.key === key) || FONTS[0]).family;

/** Adds the pass fonts stylesheet to the page once. */
/** The Google Fonts stylesheet for every pass font (also used by the server-made card PDFs). */
export const passFontsUrl = () => `https://fonts.googleapis.com/css2?${FONTS.map((f) => `family=${f.g}`).join('&')}&display=swap`;

export function ensurePassFonts() {
  if (typeof document === 'undefined' || document.getElementById('fc-pass-fonts')) return;
  const link = document.createElement('link');
  link.id = 'fc-pass-fonts';
  link.rel = 'stylesheet';
  link.href = passFontsUrl();
  document.head.appendChild(link);
}

/** Merge fields a text element can contain, as {{key}}. Registration answers are {{custom.<field>}}. */
export const MERGE_FIELDS = [
  { key: 'name', label: 'Holder name' },
  { key: 'festival_name', label: 'Festival name' },
  { key: 'category', label: 'Category' },
  { key: 'pass_type', label: 'Pass type' },
  { key: 'valid_dates', label: 'Valid dates' },
  { key: 'venue', label: 'Venue' },
  { key: 'serial', label: 'Delegate serial' },
  { key: 'badge_no', label: 'Badge no.' },
  { key: 'sequence', label: 'Badge sequence no.' }
];
const MERGE_TOKEN = /\{\{\s*([a-z_]+(?:\.[a-z0-9_]{1,60})?)\s*\}\}/gi;

const MM_TO_PX = 96 / 25.4;
const HEX = /^#[0-9a-f]{3}([0-9a-f]{3})?$/i;

export const escapeHtml = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const color = (c, fallback) => (typeof c === 'string' && HEX.test(c) ? c : fallback);
const mm = (n) => `${Math.round(Number(n) * 100) / 100}mm`;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const isImageSrc = (src) => typeof src === 'string' && (/^data:image\/(png|jpeg|webp);base64,/.test(src) || /^https:\/\//.test(src));

function displayValue(v) {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.filter((x) => x !== null && x !== '').join(', ');
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'object') return '';
  return String(v).trim();
}

/** The value of one merge field for one pass, or '' when there is nothing to show. */
export function fieldValue(key, data, festival) {
  const f = festival || {};
  switch (key) {
    case 'festival_name': return displayValue(f.name);
    case 'name': return displayValue(data.name);
    case 'category': return displayValue(data.category);
    case 'pass_type': return displayValue(data.pass_type);
    case 'valid_dates': return displayValue(data.valid_dates) || displayValue(f.dates);
    case 'venue': return displayValue(f.venue);
    case 'serial': return displayValue(data.serial);
    case 'badge_no': return displayValue(data.badge_no);
    case 'sequence': return formatSequence(data.sequence_no);
    default:
      if (key.startsWith('custom.')) return displayValue(data.custom?.[key.slice(7)]);
      return '';
  }
}

/** Replaces {{fields}} in a text element's content. */
export function resolveMerge(content, data, festival) {
  let hasTokens = false;
  let anyValue = false;
  const text = String(content || '').replace(MERGE_TOKEN, (_, key) => {
    hasTokens = true;
    const v = fieldValue(key.toLowerCase(), data, festival);
    if (v) anyValue = true;
    return v;
  });
  return { text, hasTokens, allEmpty: hasTokens && !anyValue };
}

const qrMarkup = (value) => (value ? qrSvgMarkup(value, 240) : '');

/** Resolves an element colour: '#hex', 'accent' or 'category'. */
function colorResolver(config, data) {
  const base = color(config?.accent, '#a82f2f');
  const category = color(data.category_color, '');
  const accent = config?.useCategoryColor && category ? category : base;
  return (v, fallback = '#0f172a') => {
    if (v === 'accent') return accent;
    if (v === 'category') return category || accent;
    return color(v, fallback);
  };
}

// ── Elements ──────────────────────────────────────────────────────────────────

const V_JUSTIFY = { top: 'flex-start', middle: 'center', bottom: 'flex-end' };

export const ROTATIONS = [0, 45, 90, 135, 180, 225, 270, 315];

/**
 * Positions an element. 90° / 270°: the content turns inside the box, so the box stays the area
 * it fills. 45° steps (45, 135, 225, 315): the whole box turns around its centre.
 */
function elementBox(el, inner, extraClass = '') {
  const p = el.position || {};
  const rot = ROTATIONS.includes(Number(p.rotation)) ? Number(p.rotation) : 0;
  const box = `left:${mm(p.x)};top:${mm(p.y)};width:${mm(p.w)};height:${mm(p.h)}`;
  const attrs = `class="ppc-el ppc-el-${el.type} ${extraClass}" data-el="${escapeHtml(el.name || '')}"`;
  if (rot % 90 !== 0) {
    return `<div ${attrs} style="${box};overflow:visible;transform:rotate(${rot}deg);transform-origin:center"><div class="ppc-el-body" style="width:100%;height:100%">${inner}</div></div>`;
  }
  const swap = rot === 90 || rot === 270;
  const bw = swap ? p.h : p.w;
  const bh = swap ? p.w : p.h;
  const body = rot
    ? `<div class="ppc-el-body ppc-rot" style="width:${mm(bw)};height:${mm(bh)};transform:translate(-50%,-50%) rotate(${rot}deg)">${inner}</div>`
    : `<div class="ppc-el-body" style="width:100%;height:100%">${inner}</div>`;
  return `<div ${attrs} style="${box}">${body}</div>`;
}

function renderText(el, data, ctx, col) {
  const m = el.metadata || {};
  const { text, allEmpty } = resolveMerge(m.content, data, ctx.festival);
  if (m.hideWhenEmpty !== false && allEmpty) return '';
  const bg = m.background && m.background !== 'none' ? col(m.background, 'transparent') : 'transparent';
  const size = clamp(Number(m.sizePt) || 10, 4, 96);
  const style = [
    `font-family:${fontFamily(m.font)}`,
    `font-size:${size}pt`,
    `font-weight:${[400, 600, 800].includes(Number(m.weight)) ? Number(m.weight) : 600}`,
    `font-style:${m.italic ? 'italic' : 'normal'}`,
    `color:${col(m.color)}`,
    `text-align:${['left', 'center', 'right'].includes(m.align) ? m.align : 'left'}`,
    `justify-content:${V_JUSTIFY[m.vAlign] || 'center'}`,
    `text-transform:${m.uppercase ? 'uppercase' : 'none'}`,
    `letter-spacing:${clamp(Number(m.letterSpacing) || 0, -0.1, 0.5)}em`,
    `line-height:${clamp(Number(m.lineHeight) || 1.15, 0.8, 2.5)}`,
    `background:${bg}`,
    `border-radius:${mm(clamp(Number(m.radius) || 0, 0, 50))}`,
    `padding:${mm(clamp(Number(m.padding) || 0, 0, 20))}`
  ].join(';');
  const fit = m.autoShrink !== false ? ` ppc-fit" data-size="${size}` : '';
  return elementBox(el, `<div class="ppc-text${fit}" style="${style}"><span>${escapeHtml(text)}</span></div>`);
}

function renderImage(el, data, mode, ctx, template) {
  const m = el.metadata || {};
  const p = el.position || {};
  const radius = mm(clamp(Number(m.radius) || 0, 0, 50));
  if (m.source === 'badge_qr') {
    const line = m.showBadgeNo ? Math.min(4.5, p.h * 0.14) : 0;
    const size = Math.max(4, Math.min(p.w, p.h - line));
    if (mode === 'full' && data.qr_value) {
      const badge = m.showBadgeNo && data.badge_no
        ? `<div class="ppc-qr-no" style="font-size:${clamp(line * 2, 4, 12)}pt">${escapeHtml(data.badge_no)}</div>` : '';
      return elementBox(el, `<div class="ppc-qr-wrap"><div class="ppc-qr-box" style="width:${mm(size)};height:${mm(size)}">${qrMarkup(data.qr_value)}</div>${badge}</div>`);
    }
    // Pass only, or a delegate without a QR yet: keep the space for a sticker
    return elementBox(el, `<div class="ppc-qr-wrap"><div class="ppc-qr-empty" style="width:${mm(size)};height:${mm(size)}"><span>QR</span></div></div>`);
  }
  const src = m.source === 'festival_logo' ? ctx.festival?.logo_url : template.assets?.[m.asset_id];
  if (!isImageSrc(src)) {
    return ctx.editing ? elementBox(el, `<div class="ppc-img-missing">${m.source === 'festival_logo' ? 'No festival logo' : 'Image'}</div>`) : '';
  }
  const fit = m.fit === 'cover' ? 'cover' : 'contain';
  const opacity = clamp(Number(m.opacity) || 1, 0.05, 1);
  return elementBox(el, `<img class="ppc-img" src="${escapeHtml(src)}" alt="" style="object-fit:${fit};opacity:${opacity};border-radius:${radius}" />`);
}

function checklistItems(m, ctx) {
  if (m.source === 'field') {
    const field = (ctx.choiceFields || []).find((f) => f.key === m.field);
    return field?.options?.length ? field.options : (m.items || []);
  }
  return m.items || [];
}

function renderChecklist(el, data, ctx, col) {
  const m = el.metadata || {};
  const items = checklistItems(m, ctx);
  const raw = m.source === 'field' ? data.custom?.[m.field] : null;
  const chosen = new Set((Array.isArray(raw) ? raw : raw ? [raw] : []).map((v) => String(v).trim().toLowerCase()));
  const rows = items
    .map((label) => ({ label, on: chosen.has(String(label).trim().toLowerCase()) }))
    .filter((i) => m.showUnticked !== false || i.on);
  if (!rows.length) return '';
  const c = col(m.color);
  const size = clamp(Number(m.sizePt) || 8, 4, 48);
  const tick = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.2 6.4l2.4 2.4 5.2-5.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const html = rows.map((r) => `<div class="ppc-check"><span class="ppc-check-box${m.box === 'circle' ? ' is-circle' : ''}${r.on ? ' is-on' : ''}" style="border-color:${c};color:${c}">${r.on ? tick : ''}</span><span>${escapeHtml(r.label)}</span></div>`).join('');
  return elementBox(el, `<div class="ppc-checklist ppc-fit" data-size="${size}" style="font-family:${fontFamily(m.font)};font-size:${size}pt;color:${c};grid-template-columns:repeat(${clamp(Number(m.columns) || 1, 1, 4)},minmax(0,1fr))">${html}</div>`);
}

function renderElements(template, data, mode, ctx) {
  const c = template.config || {};
  const W = Number(template.width_mm);
  const H = Number(template.height_mm);
  const col = colorResolver(c, data);
  const bgImg = template.background_image && isImageSrc(template.background_image) ? template.background_image : null;
  const artwork = template.design_mode === 'artwork';
  let background = '';
  if (artwork) {
    // With bleed the artwork is larger than the pass: centre it and let the pass edge crop it
    const b = bleedOf(template);
    const bleedStyle = b > 0 ? ` style="inset:auto;left:${mm(-b)};top:${mm(-b)};width:${mm(W + 2 * b)};height:${mm(H + 2 * b)}"` : '';
    background = bgImg ? `<img class="ppc-bg ppc-bg-fill" src="${bgImg}" alt=""${bleedStyle} />` : '<div class="ppc-art-missing">Upload the artwork</div>';
  } else if (bgImg) {
    background = `<img class="ppc-bg" src="${bgImg}" alt="" />`;
  }
  const els = (template.elements || []).map((el) => {
    if (el.type === 'text') return renderText(el, data, ctx, col);
    if (el.type === 'image') return renderImage(el, data, mode, ctx, template);
    if (el.type === 'checklist') return renderChecklist(el, data, ctx, col);
    return '';
  }).join('');
  return `<div class="ppc" style="width:${mm(W)};height:${mm(H)};background:${artwork ? '#f1f5f9' : color(c.background, '#ffffff')}">${background}${els}</div>`;
}

/**
 * Shrinks text in elements marked "shrink to fit" until it fits its box. Runs on rendered DOM
 * (preview or print root); needs layout, so the container must be displayed.
 */
export function fitPassText(container) {
  if (!container) return;
  container.querySelectorAll('.ppc-fit').forEach((el) => {
    const max = Number(el.dataset.size) || 10;
    let size = max;
    el.style.fontSize = `${size}pt`;
    const over = () => el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1;
    for (let i = 0; i < 80 && size > 4 && over(); i += 1) {
      size = Math.max(4, size - (size > 14 ? 1 : 0.5));
      el.style.fontSize = `${size}pt`;
    }
  });
}

/** Loads the fonts used inside a container, then fits its text. Returns a promise. */
export async function fitWhenReady(container) {
  if (!container) return;
  ensurePassFonts();
  fitPassText(container);
  if (typeof document === 'undefined' || !document.fonts) return;
  const wanted = new Set();
  container.querySelectorAll('.ppc-text, .ppc-checklist').forEach((el) => {
    const cs = el.style;
    wanted.add(`${cs.fontStyle === 'italic' ? 'italic ' : ''}${cs.fontWeight || 400} 12pt ${cs.fontFamily}`);
  });
  try {
    await Promise.race([
      Promise.all([...wanted].map((f) => document.fonts.load(f))),
      new Promise((resolve) => setTimeout(resolve, 3000))
    ]);
  } catch { /* fall back to whatever is loaded */ }
  fitPassText(container);
}

// ── QR sticker ────────────────────────────────────────────────────────────────

export const DEFAULT_QR_SETTINGS = { sizeMm: 58, showFestivalName: true, title: 'DELEGATE PASS BADGE', showBadgeNo: true, showIndex: true };

export function stickerSize(qrSettings) {
  const S = clamp(Number(qrSettings?.sizeMm) || 58, 20, 150);
  return { w: S, h: Math.round(S * 1.08 * 100) / 100 };
}

function renderSticker(template, data, ctx) {
  const st = { ...DEFAULT_QR_SETTINGS, ...(ctx.qrSettings || {}) };
  const { w, h } = stickerSize(st);
  const k = w / 58;
  const accent = color(template.config?.accent, '#a82f2f');
  const festival = escapeHtml(displayValue(ctx.festival?.name).toUpperCase());
  const code = data.badge_no ? `BADGE NO: ${escapeHtml(data.badge_no)}` : escapeHtml(data.qr_value || '');
  return `<div class="pps" style="width:${mm(w)};height:${mm(h)};padding:${mm(3 * k)} ${mm(2.5 * k)}">
    ${st.showFestivalName && festival ? `<div class="pps-festival" style="color:${accent};font-size:${7.5 * k}pt">${festival}</div>` : ''}
    ${st.title ? `<div class="pps-title" style="font-size:${6 * k}pt">${escapeHtml(st.title)}</div>` : ''}
    <div class="pps-qr"><div class="pps-qr-wrap" style="width:${mm(33 * k)};height:${mm(33 * k)}">${qrMarkup(data.qr_value)}${st.showIndex && data.sequence_no ? `<span class="pps-index" style="font-size:${5.5 * k}pt">${formatSequence(data.sequence_no)}</span>` : ''}</div></div>
    ${st.showBadgeNo && code ? `<div class="pps-code" style="font-size:${9.5 * k}pt">${code}</div>` : ''}
  </div>`;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * HTML for one pass.
 * @param {object} template  { design_mode, width_mm, height_mm, config, elements, background_image, assets }
 * @param {object} data      see passDataFromAttendee / passDataFromBadge
 * @param {'full'|'no-qr'|'qr-only'} mode
 * @param {object} ctx       { festival: { name, logo_url, venue, dates }, choiceFields, editing }
 */
export function renderPass(template, data, mode = 'full', ctx = {}) {
  if (!template) return '';
  if (mode === 'qr-only') return renderSticker(template, data || {}, ctx);
  return renderElements(template, data || {}, mode, ctx);
}

/** Size in mm of one printed piece for this template and mode. */
export function pieceSize(template, mode, ctx = {}) {
  if (mode === 'qr-only') return stickerSize(ctx.qrSettings);
  return { w: Number(template.width_mm), h: Number(template.height_mm) };
}

/** Scale factor to fit a piece into a box of the given pixel width/height (for previews). */
export function previewScale(template, mode, maxWidthPx, maxHeightPx = Infinity, ctx = {}) {
  const { w, h } = pieceSize(template, mode, ctx);
  return Math.min(2.5, maxWidthPx / (w * MM_TO_PX), maxHeightPx / (h * MM_TO_PX));
}

export const MM_PX = MM_TO_PX;

/** Styles for passes inside `scope` (a CSS selector). */
export function passCss(scope) {
  const S = scope;
  return `
    ${S} .ppc, ${S} .pps { box-sizing: border-box; position: relative; overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; line-height: 1.2; }
    ${S} .ppc *, ${S} .pps * { box-sizing: border-box; }
    ${S} .ppc-bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: 0; }
    ${S} .ppc-bg-fill { object-fit: fill; }
    ${S} .ppc-el { position: absolute; z-index: 1; overflow: hidden; }
    ${S} .ppc-el-body { position: relative; }
    ${S} .ppc-rot { position: absolute; left: 50%; top: 50%; transform-origin: center; }
    ${S} .ppc-text { display: flex; flex-direction: column; width: 100%; height: 100%; overflow: hidden; white-space: pre-wrap; overflow-wrap: anywhere; }
    ${S} .ppc-text > span { display: block; }
    ${S} .ppc-img { display: block; width: 100%; height: 100%; }
    ${S} .ppc-img-missing { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; border: 0.3mm dashed #94a3b8; color: #64748b; font-size: 7pt; font-weight: 700; }
    ${S} .ppc-qr-wrap { width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.6mm; }
    ${S} .ppc-qr-box { background: #ffffff; flex: 0 0 auto; }
    ${S} .ppc-qr-box svg, ${S} .pps-qr-wrap svg { display: block; width: 100%; height: 100%; }
    ${S} .ppc-qr-no { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-weight: 800; letter-spacing: 0.12em; color: #0f172a; line-height: 1; }
    ${S} .ppc-qr-empty { border: 0.25mm dashed #94a3b8; border-radius: 1mm; display: flex; align-items: center; justify-content: center; color: #94a3b8; font-size: 6pt; font-weight: 700; letter-spacing: 0.06em; flex: 0 0 auto; }
    ${S} .ppc-checklist { display: grid; gap: 0.35em 0.8em; align-content: center; width: 100%; height: 100%; overflow: hidden; line-height: 1.2; }
    ${S} .ppc-check { display: flex; align-items: center; gap: 0.4em; min-width: 0; }
    ${S} .ppc-check > span:last-child { overflow-wrap: anywhere; }
    ${S} .ppc-check-box { flex: 0 0 auto; width: 1.05em; height: 1.05em; border: 0.11em solid; border-radius: 0.15em; display: inline-flex; align-items: center; justify-content: center; }
    ${S} .ppc-check-box.is-circle { border-radius: 50%; }
    ${S} .ppc-check-box svg { width: 0.85em; height: 0.85em; }
    ${S} .ppc-art-missing { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: #64748b; font-size: 9pt; font-weight: 700; border: 0.3mm dashed #94a3b8; }
    ${S} .pps { background: #ffffff; color: #0f172a; text-align: center; border: 0.4mm dashed #cbd5e1; border-radius: 2mm; display: flex; flex-direction: column; align-items: center; }
    ${S} .pps-festival { font-weight: 800; letter-spacing: 0.05em; margin-bottom: 0.5mm; }
    ${S} .pps-title { font-weight: 700; color: #64748b; letter-spacing: 0.02em; margin-bottom: 2mm; }
    ${S} .pps-qr { display: flex; justify-content: center; margin-bottom: 2mm; }
    ${S} .pps-qr-wrap { position: relative; }
    ${S} .pps-index { position: absolute; left: 100%; top: 50%; transform: translateY(-50%) rotate(180deg); margin-left: 1mm; writing-mode: vertical-rl; /* reads bottom to top */ font-weight: 700; color: #64748b; letter-spacing: 0.08em; white-space: nowrap; }
    ${S} .pps-code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-weight: 800; background: #f1f5f9; padding: 1mm 1.5mm; border-radius: 1mm; letter-spacing: 0.12em; max-width: 100%; overflow-wrap: anywhere; }
  `;
}

// ── A4 sheet layout ───────────────────────────────────────────────────────────

export const PAGE_MARGIN_MM = 8;
export const CUT_GAP_MM = 4;
export const MAX_GRID = { cols: 6, rows: 8 };

/**
 * Grid for pieces of pieceW × pieceH mm on A4.
 * opts: { orientation, cols, rows, margins: 'standard' (8 mm margin, 4 mm gaps) | 'none' (edge to edge), shrink }
 *   - cols/rows default to the most that fit at true size; any grid up to MAX_GRID can be chosen.
 *   - If the grid doesn't fit at true size: scale = the fit factor when `shrink` is on, otherwise null
 *     (not printable as chosen). fitScale is always the factor that would make it fit.
 * Pieces are spread evenly (inner gaps at least the cut gap) and centred in the printable area.
 */
export function sheetLayout(pieceW, pieceH, opts = {}) {
  const landscape = opts.orientation === 'landscape';
  const noMargins = opts.margins === 'none';
  const margin = noMargins ? 0 : PAGE_MARGIN_MM;
  const gap = noMargins ? 0 : CUT_GAP_MM;
  const pageW = landscape ? 297 : 210;
  const pageH = landscape ? 210 : 297;
  const usableW = pageW - 2 * margin;
  const usableH = pageH - 2 * margin;
  // Most that fit at true size (0 when even one doesn't fit)
  const maxCols = Math.max(0, Math.floor((usableW + gap + 0.01) / (pieceW + gap)));
  const maxRows = Math.max(0, Math.floor((usableH + gap + 0.01) / (pieceH + gap)));
  const c = clamp(Math.round(Number(opts.cols) || Math.max(1, maxCols)), 1, MAX_GRID.cols);
  const r = clamp(Math.round(Number(opts.rows) || Math.max(1, maxRows)), 1, MAX_GRID.rows);

  const fitScale = Math.min(1, (usableW - (c - 1) * gap) / (c * pieceW), (usableH - (r - 1) * gap) / (r * pieceH));
  const fitsTrueSize = fitScale >= 0.9999;
  const scale = fitsTrueSize ? 1 : (opts.shrink ? Math.round(fitScale * 1000) / 1000 : null);
  const k = scale ?? Math.round(fitScale * 1000) / 1000; // positions (and the preview) use the fit factor
  // Would turning margins off make this grid fit at 100%?
  const noMarginsFits = c * pieceW <= pageW + 0.01 && r * pieceH <= pageH + 0.01;

  const w = pieceW * k;
  const h = pieceH * k;
  const spread = (usable, n, size) => {
    const free = usable - n * size;
    if (n === 1) return { inner: 0, outer: Math.max(0, free / 2) };
    const inner = Math.min(Math.max(gap, free / (n + 1)), Math.max(0, free / (n - 1)));
    return { inner, outer: Math.max(0, (usable - n * size - (n - 1) * inner) / 2) };
  };
  const sx = spread(usableW, c, w);
  const sy = spread(usableH, r, h);
  const cells = [];
  for (let row = 0; row < r; row += 1) {
    for (let col = 0; col < c; col += 1) {
      cells.push({
        x: Math.round((margin + sx.outer + col * (w + sx.inner)) * 100) / 100,
        y: Math.round((margin + sy.outer + row * (h + sy.inner)) * 100) / 100
      });
    }
  }
  return {
    orientation: landscape ? 'landscape' : 'portrait',
    margins: noMargins ? 'none' : 'standard',
    pageW, pageH, pieceW, pieceH, maxCols, maxRows, cols: c, rows: r, perPage: c * r, cells,
    scale, fitScale: Math.round(fitScale * 1000) / 1000, drawScale: k, fitsTrueSize, noMarginsFits,
    printable: scale !== null
  };
}

/** Largest piece in a job: the A4 grid is based on it, so mixed template sizes still line up. */
export function jobPieceSize(items, mode, ctx) {
  return items.reduce((acc, { template }) => {
    const { w, h } = pieceSize(template, mode, ctx);
    return { w: Math.max(acc.w, w), h: Math.max(acc.h, h) };
  }, { w: 0, h: 0 });
}

function sheetPageHtml(pageItems, layout, mode, ctx) {
  const pieces = pageItems.map(({ template, data }, i) => {
    const cell = layout.cells[i];
    const { w, h } = pieceSize(template, mode, ctx);
    const k = layout.drawScale;
    // Smaller pieces are centred in their cell; shrink-to-fit scales every piece by the same factor
    const x = cell.x + ((layout.pieceW - w) * k) / 2;
    const y = cell.y + ((layout.pieceH - h) * k) / 2;
    const transform = k < 1 ? `;transform:scale(${k});transform-origin:top left` : '';
    return `<div class="pp-cell" style="left:${mm(x)};top:${mm(y)}${transform}">${renderPass(template, data, mode, ctx)}</div>`;
  }).join('');
  return `<div class="pp-sheet-page" style="width:${mm(layout.pageW)};height:${mm(layout.pageH)}">${pieces}</div>`;
}

function sheetCss(scope) {
  return `
    ${scope} .pp-sheet-page { position: relative; overflow: hidden; background: #ffffff; break-after: page; page-break-after: always; }
    ${scope} .pp-sheet-page:last-child { break-after: auto; page-break-after: auto; }
    ${scope} .pp-cell { position: absolute; }
    ${scope} .pp-cell .ppc { outline: 0.2mm dashed #cbd5e1; }
  `;
}

/**
 * HTML of the first A4 page of a job, for the print dialog preview (same markup as the print).
 * @returns {{ html: string, css: string, layout, pages: number }}
 */
export function renderPagePreview(items, mode, ctx, layoutOpts = {}, scope = '.fc-pp-page-preview') {
  const piece = jobPieceSize(items, mode, ctx);
  const layout = sheetLayout(piece.w || 1, piece.h || 1, layoutOpts);
  return {
    html: sheetPageHtml(items.slice(0, layout.perPage), layout, mode, ctx),
    css: sheetCss(scope),
    layout,
    pages: Math.max(1, Math.ceil(items.length / layout.perPage))
  };
}

/**
 * Print markup for many passes.
 * @param {Array<{template, data}>} items  each item can use a different template
 * @param {'full'|'no-qr'|'qr-only'} mode
 * @param {'card'|'a4'} paper
 * @param {object} ctx  as renderPass (+ qrSettings for QR only)
 * @param {object} [layoutOpts]  A4: { orientation, cols, rows, margins, shrink }
 * @returns {{ html: string, css: string }}  for printInPage()
 */
export function renderSheet(items, mode, paper, ctx, layoutOpts = {}) {
  const root = '#fc-print-root';
  if (paper === 'card') {
    // One piece per page; named @page rules allow different template sizes in one job
    const pages = new Map();
    const html = items.map(({ template, data }) => {
      const { w, h } = pieceSize(template, mode, ctx);
      const name = `pp-${String(w).replace('.', '_')}x${String(h).replace('.', '_')}`;
      pages.set(name, { w, h });
      return `<div class="pp-page" style="page:${name};width:${mm(w)};height:${mm(h)}">${renderPass(template, data, mode, ctx)}</div>`;
    }).join('');
    const pageRules = [...pages.entries()].map(([name, { w, h }]) => `@page ${name} { size: ${mm(w)} ${mm(h)}; margin: 0; }`).join('\n');
    const first = [...pages.values()][0] || { w: 85.6, h: 54 };
    return {
      html,
      css: `
        @page { size: ${mm(first.w)} ${mm(first.h)}; margin: 0; }
        ${pageRules}
        ${root} { margin: 0; padding: 0; background: #ffffff; }
        ${root} .pp-page { break-after: page; page-break-after: always; overflow: hidden; }
        ${root} .pp-page:last-child { break-after: auto; page-break-after: auto; }
        ${root} .pps { border: none; border-radius: 0; }
        ${passCss(root)}
      `
    };
  }

  const piece = jobPieceSize(items, mode, ctx);
  const layout = sheetLayout(piece.w || 1, piece.h || 1, layoutOpts);
  if (!layout.printable) throw new Error('This grid doesn\'t fit on the page at true size. Turn on "Shrink to fit" or turn "Margins" off.');
  const pages = [];
  for (let i = 0; i < items.length; i += layout.perPage) {
    pages.push(sheetPageHtml(items.slice(i, i + layout.perPage), layout, mode, ctx));
  }
  return {
    html: pages.join(''),
    css: `
      @page { size: A4 ${layout.orientation}; margin: 0; }
      ${root} { margin: 0; padding: 0; background: #ffffff; }
      ${sheetCss(root)}
      ${passCss(root)}
    `
  };
}

// ── Data helpers ──────────────────────────────────────────────────────────────

function parseCustom(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw) || {}; } catch { return {}; }
}

/** Pass data for a delegate row from /registration/attendees (list or detail). */
export function passDataFromAttendee(a, categories = []) {
  const custom = parseCustom(a.custom_data);
  const code = a.delegate_category || custom.delegate_category || '';
  const cat = categories.find((c) => c.code === code || c.name === code);
  const days = Array.isArray(custom.pass_days) ? custom.pass_days.filter(Boolean) : [];
  return {
    attendee_id: a.attendee_id,
    name: a.name || '',
    category: cat?.ribbon || cat?.name || a.badge_ribbon || code,
    category_code: cat?.code || code,
    category_color: cat?.color || a.badge_color || '',
    pass_type: custom.pass_type || a.pass_type || '',
    valid_dates: days.join(', '),
    serial: a.serial_no || custom.serial_no || '',
    badge_no: a.badge_serial || '',
    sequence_no: a.badge_sequence ?? a.sequence_no ?? null,
    qr_value: a.qr_token || '',
    custom
  };
}

/** Pass data for a badge row from /registration/qr/pool. */
export function passDataFromBadge(q) {
  return {
    name: q.status === 'assigned' ? (q.attendee_name || '') : '',
    serial: q.status === 'assigned' ? (q.attendee_serial || '') : '',
    badge_no: q.badge_serial || '',
    sequence_no: q.sequence_no ?? null,
    qr_value: q.qr_data || '',
    custom: {}
  };
}

/**
 * Template for one delegate: the template linked to their category, then the festival default,
 * then the first saved template, then the starter for this mode.
 */
export function pickTemplate(templates = [], starters = [], categoryCode, mode) {
  if (categoryCode) {
    const byCategory = templates.find((t) => (t.category_codes || []).includes(categoryCode));
    if (byCategory) return byCategory;
  }
  const def = templates.find((t) => t.is_default) || templates[0];
  if (def) return def;
  return starters.find((s) => s.id === (mode === 'qr-only' ? 'starter-sticker' : 'starter-delegate')) || starters[0] || null;
}

/** Sample data for previews when there is no real delegate to show. */
export const SAMPLE_PASS_DATA = {
  name: 'Delegate Name',
  category: 'Category',
  category_color: '',
  pass_type: 'Pass type',
  valid_dates: '',
  serial: 'SERIAL-0001',
  badge_no: '123456',
  sequence_no: 1,
  qr_value: 'SAMPLE-QR-PREVIEW',
  custom: {}
};
