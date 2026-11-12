/**
 * Badge & pass templates (docs/adr/0005-pass-templates.md, Amendment 3)
 *
 * A template is a background plus a list of **elements**. The frontend renderer
 * (frontend/src/core/utils/passRenderer.js) turns a template + delegate/badge data into print HTML
 * in one of three modes:
 *   full    Pass + QR
 *   no-qr   Pass only (a Badge QR image becomes an outlined box for a pre-printed sticker)
 *   qr-only QR sticker, using the festival's QR Settings (pass_print_settings)
 *
 * Design types differ only in their background and starting point:
 *   artwork  the background is an uploaded finished design (pass_templates.background_image)
 *   layout   a colour background (optional image); FestiPlus places the elements for you
 *            (buildLayoutElements), and they are then edited like any other element
 *
 * Elements (table pass_template_elements):
 *   { type: 'text' | 'image' | 'checklist', name, position: { x, y, w, h, rotation }, metadata }
 *   position is in mm from the top-left of the pass; rotation is a multiple of 45° (0–315).
 *   At 90°/270° the box is the area the rotated content fills; at 45° steps the box itself turns
 *   around its centre.
 *   text      content with merge fields ({{name}}, {{custom.dob}} …), font, size, colours, box fill
 *   image     source: upload (asset_id → pass_template_assets) | festival_logo | badge_qr
 *   checklist items from a multi-choice registration field (delegate's answers ticked) or a typed list
 *   Colours accept '#hex', 'accent' (template accent; the category colour when useCategoryColor)
 *   or 'category' (the delegate's category colour).
 *
 * config_json: { background, accent, useCategoryColor, bleedMm }
 *   bleedMm  artwork only: extra artwork on each side beyond the pass (card) size, 0–12.7 mm
 *            (e.g. a 4.5 × 6.5 in artwork on a 4 × 6 in card has 6.35 mm). The pass shows the
 *            middle of the artwork; the bleed is cut off or printed past the card edge (ADR 0005, Amendment 4).
 * QR-only sticker settings are festival-wide (table pass_print_settings, sanitizeQrSettings).
 * Starter templates are generated here, never stored; saving one creates a real copy.
 */

const { query } = require('../../config/database');

const MIN_MM = 20;
const MAX_MM = 300;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_ASSET_BYTES = 600 * 1024;
const MAX_ELEMENTS = 60;

const ELEMENT_TYPES = ['text', 'image', 'checklist'];
const IMAGE_SOURCES = ['upload', 'festival_logo', 'badge_qr'];
const FONT_KEYS = ['inter', 'poppins', 'montserrat', 'oswald', 'playfair', 'roboto_slab', 'dancing_script'];
const MERGE_KEYS = ['festival_name', 'name', 'category', 'pass_type', 'valid_dates', 'venue', 'serial', 'badge_no', 'sequence'];
const MERGE_TOKEN = /\{\{\s*([a-z_]+(?:\.[a-z0-9_]{1,60})?)\s*\}\}/gi;
const HEX = /^#[0-9a-f]{3}([0-9a-f]{3})?$/i;
const ALIGNS = ['left', 'center', 'right'];
const V_ALIGNS = ['top', 'middle', 'bottom'];
const WEIGHTS = [400, 600, 800];
const ROTATIONS = [0, 45, 90, 135, 180, 225, 270, 315];

const DEFAULT_STICKER = { sizeMm: 58, showFestivalName: true, title: 'DELEGATE PASS BADGE', showBadgeNo: true, showIndex: true };

class ValidationError extends Error {}

const num = (v, min, max, fallback) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n * 100) / 100));
};
const r2 = (n) => Math.round(n * 100) / 100;
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const hex = (v, fallback) => (typeof v === 'string' && HEX.test(v.trim()) ? v.trim() : fallback);
const colorVal = (v, fallback) => (v === 'accent' || v === 'category' ? v : hex(v, fallback));
const bool = (v, fallback) => (v === undefined ? fallback : Boolean(v));
const oneOf = (v, list, fallback) => (list.includes(v) ? v : fallback);

function defaultConfig(overrides = {}) {
  return {
    background: '#ffffff',
    accent: '#a82f2f',
    useCategoryColor: true,
    ...overrides
  };
}

/** QR-only sticker settings (festival-wide; shown in the print dialog as "QR Settings"). */
function sanitizeQrSettings(raw) {
  const st = raw && typeof raw === 'object' ? raw : {};
  return {
    sizeMm: num(st.sizeMm, MIN_MM, 150, DEFAULT_STICKER.sizeMm),
    showFestivalName: bool(st.showFestivalName, true),
    title: st.title === undefined ? DEFAULT_STICKER.title : str(st.title, 60),
    showBadgeNo: bool(st.showBadgeNo, true),
    showIndex: bool(st.showIndex, true)
  };
}

// ── Built-in layout generator ────────────────────────────────────────────────

const DEFAULT_LAYOUT = {
  title: 'DELEGATE PASS',
  show: { band: true, logo: true, festival_name: true, title: true, name: true, category: true, pass_type: true, valid_dates: true, serial: true, qr: true },
  qrBadgeNo: true
};

const textEl = (name, content, position, meta = {}) => ({
  type: 'text',
  name,
  position: { rotation: 0, ...position },
  metadata: {
    content, font: 'inter', sizePt: 9, weight: 600, italic: false, color: '#0f172a', align: 'center', vAlign: 'middle',
    uppercase: false, letterSpacing: 0, lineHeight: 1.15, autoShrink: true, hideWhenEmpty: true,
    background: 'none', radius: 0, padding: 0, ...meta
  }
});
const imageEl = (name, source, position, meta = {}) => ({
  type: 'image',
  name,
  position: { rotation: 0, ...position },
  metadata: { source, fit: 'contain', opacity: 1, radius: 0, showBadgeNo: source === 'badge_qr', ...meta }
});

/**
 * Places the default elements for a built-in layout of W × H mm.
 * Portrait: header at the top, delegate details in the middle, QR at the bottom.
 * Landscape: details on the left, QR on the right.
 */
function buildLayoutElements(W, H, options = {}) {
  const given = Object.fromEntries(Object.entries(options).filter(([, v]) => v !== undefined));
  const o = { ...DEFAULT_LAYOUT, ...given, show: { ...DEFAULT_LAYOUT.show, ...(options.show || {}) } };
  // Shrink the text step by step until the stack fits above the QR / inside the pass; on very
  // small passes, drop the least important details one at a time and try again
  const dropOrder = ['serial', 'valid_dates', 'pass_type', 'logo', 'title', 'festival_name', 'category'];
  let els = [];
  for (let dropped = 0; dropped <= dropOrder.length; dropped += 1) {
    const show = { ...o.show };
    dropOrder.slice(0, dropped).forEach((key) => { show[key] = false; });
    for (let k = 1; k >= 0.55; k = r2(k - 0.08)) {
      const res = layoutAt(W, H, { ...o, show }, k);
      els = res.elements;
      if (res.fits) return els;
    }
  }
  return els;
}

function layoutAt(W, H, o, k) {
  const base = Math.min(1.7, Math.max(0.85, Math.min(W, H) / 54));
  const s = base * k;
  const pad = r2(3.5 * base);
  const landscape = W > H * 1.15;
  const els = [];
  const badgeLine = o.qrBadgeNo ? r2(4.2 * base) : 0;

  if (o.show.band) els.push(textEl('Accent band', '', { x: 0, y: 0, w: W, h: r2(2 * base) }, { background: 'accent', hideWhenEmpty: false, autoShrink: false }));

  // QR block size and place
  let qr = null;
  if (o.show.qr) {
    if (landscape) {
      const size = r2(Math.min(H - 2 * pad - badgeLine - 2 * base, W * 0.38));
      qr = { x: r2(W - pad - size), y: r2((H - size - badgeLine) / 2 + base), w: size, h: r2(size + badgeLine) };
    } else {
      const size = r2(Math.min(W - 2 * pad, H * 0.32));
      qr = { x: r2((W - size) / 2), y: r2(H - pad - size - badgeLine), w: size, h: r2(size + badgeLine) };
    }
  }

  // Text column
  const colX = pad;
  const colW = r2(landscape ? (qr ? qr.x - 2 * pad : W - 2 * pad) : W - 2 * pad);
  const align = landscape ? 'left' : 'center';
  let y = r2(pad + 2 * s);
  const push = (el, h) => { els.push(el); y = r2(y + h + 1.2 * s); };
  const line = (pt, lines = 1) => r2(pt * 0.3528 * 1.25 * lines + 0.6);

  if (o.show.logo) {
    const h = r2(9 * s);
    push(imageEl('Festival logo', 'festival_logo', { x: colX, y, w: colW, h }, { fit: 'contain' }), h);
  }
  if (o.show.festival_name) {
    const pt = r2(7.5 * s);
    push(textEl('Festival name', '{{festival_name}}', { x: colX, y, w: colW, h: line(pt, 2) },
      { sizePt: pt, weight: 800, color: 'accent', uppercase: true, letterSpacing: 0.04, align }), line(pt, 2));
  }
  if (o.show.title && o.title) {
    const pt = r2(5.6 * s);
    push(textEl('Title', o.title, { x: colX, y, w: colW, h: line(pt) },
      { sizePt: pt, weight: 600, color: '#475569', uppercase: true, letterSpacing: 0.12, align, hideWhenEmpty: false }), line(pt));
  }

  // Delegate details: in portrait they sit in the space above the QR
  const details = [];
  if (o.show.name) {
    const pt = r2(13 * s);
    details.push([textEl('Holder name', '{{name}}', { x: colX, y: 0, w: colW, h: line(pt, 2) }, { sizePt: pt, weight: 800, align }), line(pt, 2)]);
  }
  if (o.show.category) {
    const pt = r2(6.6 * s);
    const w = r2(landscape ? Math.min(colW, 40 * s) : Math.min(colW, W * 0.55));
    details.push([textEl('Category ribbon', '{{category}}', { x: landscape ? colX : r2((W - w) / 2), y: 0, w, h: line(pt) + r2(1.2 * s) },
      { sizePt: pt, weight: 800, color: '#ffffff', background: 'category', uppercase: true, letterSpacing: 0.06, radius: 1, padding: r2(0.6 * s) }), line(pt) + r2(1.2 * s)]);
  }
  if (o.show.pass_type) {
    const pt = r2(7 * s);
    details.push([textEl('Pass type', '{{pass_type}}', { x: colX, y: 0, w: colW, h: line(pt) }, { sizePt: pt, weight: 600, align }), line(pt)]);
  }
  if (o.show.valid_dates) {
    const pt = r2(6.6 * s);
    details.push([textEl('Valid dates', '{{valid_dates}}', { x: colX, y: 0, w: colW, h: line(pt, 2) }, { sizePt: pt, weight: 400, align, color: '#334155' }), line(pt, 2)]);
  }
  if (o.show.serial) {
    const pt = r2(7.5 * s);
    details.push([textEl('Delegate serial', '{{serial}}', { x: colX, y: 0, w: colW, h: line(pt) }, { sizePt: pt, weight: 800, align, letterSpacing: 0.08 }), line(pt)]);
  }

  const gap = r2(1.2 * s);
  const detailsH = details.reduce((t, [, h]) => t + h, 0) + gap * Math.max(0, details.length - 1);
  const bottomLimit = landscape ? H - pad : (qr ? qr.y - 1.5 * s : H - pad);
  // Centre the details in the free space (never above the header)
  let dy = r2(Math.max(y, y + (bottomLimit - y - detailsH) / 2));
  for (const [el, h] of details) {
    el.position.y = dy;
    els.push(el);
    dy = r2(dy + h + gap);
  }

  if (qr) els.push(imageEl('Badge QR', 'badge_qr', qr, { showBadgeNo: o.qrBadgeNo }));
  const fits = dy - gap <= bottomLimit + 0.01;

  // Keep everything inside the pass even on very small sizes
  const elements = els.map((el) => {
    const p = el.position;
    p.w = r2(Math.max(1, Math.min(p.w, W)));
    p.h = r2(Math.max(1, Math.min(p.h, H)));
    p.x = r2(Math.min(Math.max(0, p.x), W - p.w));
    p.y = r2(Math.min(Math.max(0, p.y), H - p.h));
    return el;
  });
  return { elements, fits };
}

const STARTER_TEMPLATES = [
  {
    id: 'starter-delegate',
    name: 'Delegate pass (starter)',
    design_mode: 'layout',
    width_mm: 105,
    height_mm: 148,
    category_codes: [],
    is_default: false,
    is_starter: true,
    has_image: false,
    has_assets: false,
    config: defaultConfig(),
    elements: buildLayoutElements(105, 148)
  },
  {
    id: 'starter-sticker',
    name: 'Small QR pass (starter)',
    design_mode: 'layout',
    width_mm: 58,
    height_mm: 62,
    category_codes: [],
    is_default: false,
    is_starter: true,
    has_image: false,
    has_assets: false,
    config: defaultConfig({ useCategoryColor: false }),
    elements: buildLayoutElements(58, 62, {
      title: 'DELEGATE PASS BADGE',
      show: { band: false, logo: false, name: false, category: false, pass_type: false, valid_dates: false, serial: false }
    })
  }
];

function getStarter(id) {
  const s = STARTER_TEMPLATES.find((t) => t.id === id);
  return s ? JSON.parse(JSON.stringify(s)) : null;
}

// ── Validation ───────────────────────────────────────────────────────────────

function sanitizeConfig(raw) {
  const c = raw && typeof raw === 'object' ? raw : {};
  return {
    background: hex(c.background, '#ffffff'),
    accent: hex(c.accent, '#a82f2f'),
    useCategoryColor: bool(c.useCategoryColor, true),
    bleedMm: Number.isFinite(Number(c.bleedMm)) ? Math.round(Math.min(12.7, Math.max(0, Number(c.bleedMm))) * 100) / 100 : 0
  };
}

function checkMergeFields(content, label) {
  for (const m of content.matchAll(MERGE_TOKEN)) {
    const key = m[1].toLowerCase();
    if (!MERGE_KEYS.includes(key) && !/^custom\.[a-z0-9_]{1,60}$/.test(key)) {
      throw new ValidationError(`"${label}" uses an unknown field {{${m[1]}}}.`);
    }
  }
}

function sanitizeElement(raw, index, W, H) {
  if (!raw || typeof raw !== 'object') throw new ValidationError('An element is missing its details.');
  const type = raw.type;
  if (!ELEMENT_TYPES.includes(type)) throw new ValidationError(`Element ${index + 1} has an unknown type.`);
  const fallbackName = `${type === 'text' ? 'Text' : type === 'image' ? 'Image' : 'Checklist'} ${index + 1}`;
  const name = str(raw.name, 80) || fallbackName;

  const p = raw.position && typeof raw.position === 'object' ? raw.position : {};
  const position = {
    x: num(p.x, 0, MAX_MM, 0),
    y: num(p.y, 0, MAX_MM, 0),
    w: num(p.w, 1, MAX_MM, 20),
    h: num(p.h, 1, MAX_MM, 8),
    rotation: oneOf(Number(p.rotation) || 0, ROTATIONS, 0)
  };
  if (position.x + position.w > W + 0.5 || position.y + position.h > H + 0.5) {
    throw new ValidationError(`"${name}" goes outside the pass. Move or shrink it.`);
  }

  const m = raw.metadata && typeof raw.metadata === 'object' ? raw.metadata : {};
  let metadata;
  if (type === 'text') {
    const content = typeof m.content === 'string' ? m.content.slice(0, 500) : '';
    checkMergeFields(content, name);
    metadata = {
      content,
      font: oneOf(m.font, FONT_KEYS, 'inter'),
      sizePt: num(m.sizePt, 4, 96, 10),
      weight: oneOf(Number(m.weight), WEIGHTS, 600),
      italic: bool(m.italic, false),
      color: colorVal(m.color, '#0f172a'),
      align: oneOf(m.align, ALIGNS, 'left'),
      vAlign: oneOf(m.vAlign, V_ALIGNS, 'middle'),
      uppercase: bool(m.uppercase, false),
      letterSpacing: num(m.letterSpacing, -0.1, 0.5, 0),
      lineHeight: num(m.lineHeight, 0.8, 2.5, 1.15),
      autoShrink: bool(m.autoShrink, true),
      hideWhenEmpty: bool(m.hideWhenEmpty, true),
      background: m.background === 'none' || m.background === undefined ? 'none' : colorVal(m.background, 'none'),
      radius: num(m.radius, 0, 50, 0),
      padding: num(m.padding, 0, 20, 0)
    };
  } else if (type === 'image') {
    const source = oneOf(m.source, IMAGE_SOURCES, null);
    if (!source) throw new ValidationError(`"${name}" needs an image source.`);
    metadata = {
      source,
      fit: oneOf(m.fit, ['contain', 'cover'], 'contain'),
      opacity: num(m.opacity, 0.05, 1, 1),
      radius: num(m.radius, 0, 50, 0),
      showBadgeNo: source === 'badge_qr' ? bool(m.showBadgeNo, true) : false
    };
    if (source === 'upload') {
      const assetId = parseInt(m.asset_id, 10);
      if (!Number.isFinite(assetId) || assetId <= 0) throw new ValidationError(`"${name}" has no uploaded image yet.`);
      metadata.asset_id = assetId;
    }
  } else {
    const source = m.source === 'field' ? 'field' : 'static';
    const items = (Array.isArray(m.items) ? m.items : []).map((i) => str(String(i ?? ''), 60)).filter(Boolean).slice(0, 20);
    const field = source === 'field' ? str(m.field, 60) : '';
    if (source === 'field' && !/^[a-z0-9_]{1,60}$/i.test(field)) throw new ValidationError(`"${name}" needs a registration field to tick from.`);
    if (source === 'static' && items.length === 0) throw new ValidationError(`"${name}" needs at least one item.`);
    metadata = {
      source,
      field,
      items,
      font: oneOf(m.font, FONT_KEYS, 'inter'),
      sizePt: num(m.sizePt, 4, 48, 8),
      color: colorVal(m.color, '#0f172a'),
      columns: num(m.columns, 1, 4, 1),
      box: oneOf(m.box, ['square', 'circle'], 'square'),
      showUnticked: bool(m.showUnticked, true)
    };
  }
  return { type, name, position, metadata };
}

/** Validates the element list; uploaded images must belong to this event. */
async function sanitizeElements(eventId, raw, W, H) {
  const list = Array.isArray(raw) ? raw : [];
  if (list.length > MAX_ELEMENTS) throw new ValidationError(`A pass can have at most ${MAX_ELEMENTS} elements.`);
  const elements = list.map((el, i) => sanitizeElement(el, i, W, H));
  const assetIds = [...new Set(elements.filter((e) => e.metadata.asset_id).map((e) => e.metadata.asset_id))];
  if (assetIds.length) {
    const rows = await query(
      `SELECT id FROM pass_template_assets WHERE event_id = ? AND id IN (${assetIds.map(() => '?').join(',')})`,
      [eventId, ...assetIds]
    );
    const known = new Set(rows.map((r) => Number(r.id)));
    const missing = elements.find((e) => e.metadata.asset_id && !known.has(e.metadata.asset_id));
    if (missing) throw new ValidationError(`The image for "${missing.name}" wasn't found. Upload it again.`);
  }
  return elements;
}

/** Validates a create/update body and returns the values to store. */
async function validateTemplateInput(eventId, body) {
  const b = body || {};
  const name = str(b.name, 120);
  if (!name) throw new ValidationError('Give the template a name.');

  const designMode = b.design_mode === 'artwork' ? 'artwork' : 'layout';
  const widthMm = Number(b.width_mm);
  const heightMm = Number(b.height_mm);
  if (![widthMm, heightMm].every((n) => Number.isFinite(n) && n >= MIN_MM && n <= MAX_MM)) {
    throw new ValidationError(`Pass width and height must be between ${MIN_MM} and ${MAX_MM} mm.`);
  }

  let backgroundImage = null;
  if (b.background_image) {
    backgroundImage = checkImageDataUrl(b.background_image, MAX_IMAGE_BYTES, 'The image');
  }
  if (designMode === 'artwork' && !backgroundImage && b.keep_image !== true) {
    throw new ValidationError('Upload the artwork image for this template.');
  }

  let categoryCodes = [];
  if (Array.isArray(b.category_codes) && b.category_codes.length) {
    const wanted = [...new Set(b.category_codes.map((c) => String(c).trim()).filter(Boolean))].slice(0, 50);
    if (wanted.length) {
      const rows = await query(
        `SELECT code FROM audience_categories WHERE event_id = ? AND code IN (${wanted.map(() => '?').join(',')})`,
        [eventId, ...wanted]
      );
      const known = new Set(rows.map((r) => r.code));
      const unknown = wanted.filter((c) => !known.has(c));
      if (unknown.length) throw new ValidationError(`Unknown category for this festival: ${unknown.join(', ')}.`);
      categoryCodes = wanted;
    }
  }

  return {
    name,
    design_mode: designMode,
    width_mm: r2(widthMm),
    height_mm: r2(heightMm),
    config: sanitizeConfig(b.config),
    elements: await sanitizeElements(eventId, b.elements, widthMm, heightMm),
    background_image: backgroundImage,
    category_codes: categoryCodes,
    keep_image: b.keep_image === true && !backgroundImage
  };
}

function checkImageDataUrl(value, maxBytes, label) {
  if (typeof value !== 'string' || !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(value)) {
    throw new ValidationError(`${label} must be a PNG or JPG file.`);
  }
  const bytes = Math.floor((value.length - value.indexOf(',') - 1) * 3 / 4);
  if (bytes > maxBytes) throw new ValidationError(`${label} is larger than ${Math.round(maxBytes / 1024)} KB. Export it smaller and try again.`);
  return value;
}

const parseJson = (v, fallback) => {
  if (v === null || v === undefined) return fallback;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return fallback; }
};

function rowToElement(row) {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    position: parseJson(row.position, {}),
    metadata: parseJson(row.metadata, {})
  };
}

function rowToTemplate(row, elementRows = [], { withImage = false } = {}) {
  const elements = elementRows.map(rowToElement);
  const t = {
    id: row.id,
    name: row.name,
    design_mode: row.design_mode,
    width_mm: Number(row.width_mm),
    height_mm: Number(row.height_mm),
    config: { ...defaultConfig(), ...sanitizeConfig(parseJson(row.config_json, {})) },
    elements,
    category_codes: parseJson(row.category_codes, []) || [],
    is_default: Boolean(row.is_default),
    is_starter: false,
    has_image: Boolean(row.has_image ?? row.background_image),
    has_assets: elements.some((e) => e.type === 'image' && e.metadata?.source === 'upload'),
    updated_at: row.updated_at
  };
  if (withImage) t.background_image = row.background_image || null;
  return t;
}

module.exports = {
  ELEMENT_TYPES,
  FONT_KEYS,
  MERGE_KEYS,
  MAX_IMAGE_BYTES,
  MAX_ASSET_BYTES,
  STARTER_TEMPLATES,
  ValidationError,
  defaultConfig,
  sanitizeQrSettings,
  DEFAULT_STICKER,
  buildLayoutElements,
  getStarter,
  sanitizeConfig,
  sanitizeElements,
  validateTemplateInput,
  checkImageDataUrl,
  rowToTemplate
};
