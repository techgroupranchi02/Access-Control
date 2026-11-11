/**
 * Badge & pass templates API (/api/pass-templates), docs/adr/0005-pass-templates.md
 *
 * GET    /                 list (elements, no images) + starters + festival context for the renderer
 * GET    /:id              one template with its background image, elements and uploaded assets
 *                          (also starter-delegate / starter-sticker)
 * POST   /                 create (template + elements in one transaction)
 * PUT    /:id              update (elements are replaced in one transaction)
 * POST   /assets           upload one image for an image element → { asset_id }
 * PUT    /qr-settings      save the festival's QR Settings (QR-only stickers)
 * POST   /layout-preview   the built-in arrangement for a size → { elements }
 * POST   /:id/duplicate    copy (works for starters too)
 * PUT    /:id/default      make it the festival default
 * DELETE /:id              archive
 */

const { query, getConnection } = require('../../config/database');
const { festivalImageUrl } = require('../utils/media.utils');
const { PREBUILT_TEMPLATES } = require('../services/registration-form-templates');
const svc = require('../services/passTemplates.service');
const { requirePermission } = require('../middleware/permission.middleware');

/** True when the user passes requirePermission(key) (admins, owners and granted groups). */
function userHasPermission(req, key) {
  const probe = { ...req, headers: req.headers, query: req.query, user: req.user };
  return new Promise((resolve) => {
    const res = { status: () => ({ json: () => resolve(false) }) };
    requirePermission(key)(probe, res, () => resolve(true)).catch(() => resolve(false));
  });
}

async function getQrSettings(eventId) {
  const rows = await query('SELECT qr_json FROM pass_print_settings WHERE event_id = ? LIMIT 1', [eventId]);
  const raw = rows[0]?.qr_json;
  return svc.sanitizeQrSettings(typeof raw === 'string' ? JSON.parse(raw) : raw);
}

// Registration form fields that already have their own pass field
const STANDARD_FORM_KEYS = new Set(['name', 'email', 'phone', 'pass_type', 'pass_days', 'delegate_category', 'certified_18_plus']);
const LIST_COLUMNS = `id, event_id, name, design_mode, width_mm, height_mm, config_json, category_codes, is_default,
  (background_image IS NOT NULL) AS has_image, updated_at`;

function getEventId(req) {
  const raw = req.headers['x-event-id'] || req.headers['x-edition-id'] || req.headers['x-festival-id'] || req.query.eventId;
  const id = parseInt(raw, 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function requireEvent(req, res) {
  const eventId = getEventId(req);
  if (!eventId) res.status(400).json({ success: false, message: 'Choose a festival first.' });
  return eventId;
}

function handleError(res, error, where) {
  if (error instanceof svc.ValidationError) {
    return res.status(400).json({ success: false, message: error.message });
  }
  console.error(`[PassTemplates] ${where} error:`, error.message);
  return res.status(500).json({ success: false, message: 'Something went wrong with the pass templates. Please try again.' });
}

function formatDateRange(start, end) {
  const s = start ? new Date(start) : null;
  const e = end ? new Date(end) : null;
  const ok = (d) => d && !Number.isNaN(d.getTime());
  const fmt = (d, opts) => d.toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', ...opts });
  if (ok(s) && ok(e)) {
    const sameYear = s.getFullYear() === e.getFullYear();
    return `${fmt(s, sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' })} – ${fmt(e, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  }
  if (ok(s)) return fmt(s, { day: 'numeric', month: 'short', year: 'numeric' });
  return '';
}

/** Festival-level data a pass can show; everything comes from the festival's own records. */
async function getFestivalContext(eventId) {
  const [eventRows, festRows, settingsRows, categories] = await Promise.all([
    query('SELECT name FROM events WHERE event_id = ? LIMIT 1', [eventId]),
    query(
      `SELECT film_festival_logo, film_festival_logo_image_name, film_festival_venue, film_festival_start_date, film_festival_end_date
       FROM film_festivals WHERE event_id = ? AND is_deleted = 0 ORDER BY film_festival_id LIMIT 1`,
      [eventId]
    ),
    query('SELECT settings_json FROM audience_settings WHERE event_id = ? LIMIT 1', [eventId]),
    query('SELECT code, name, badge_color, badge_ribbon_text FROM audience_categories WHERE event_id = ? ORDER BY name', [eventId])
  ]);

  let schema = null;
  try {
    const raw = settingsRows[0]?.settings_json;
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    schema = parsed?.registration_form_schema?.fields ? parsed.registration_form_schema : null;
  } catch { /* no saved form */ }

  const fest = festRows[0] || {};
  const venueInfo = schema?.venue_info || {};
  const formFields = (schema?.fields || PREBUILT_TEMPLATES.kashish_lgbtq.fields || [])
    .filter((f) => f && f.key && f.enabled !== false && !STANDARD_FORM_KEYS.has(f.key) && !['legal_checkbox', 'section', 'heading'].includes(f.type))
    .map((f) => ({ key: f.key, label: f.label || f.key }));

  return {
    festival: {
      name: eventRows[0]?.name || '',
      logo_url: festivalImageUrl(fest.film_festival_logo_image_name || fest.film_festival_logo),
      venue: venueInfo.venue || fest.film_festival_venue || '',
      dates: venueInfo.dates || formatDateRange(fest.film_festival_start_date, fest.film_festival_end_date),
      timing: venueInfo.timing || ''
    },
    categories: categories.map((c) => ({ code: c.code, name: c.name, color: c.badge_color, ribbon: c.badge_ribbon_text || '' })),
    custom_fields: formFields,
    // Multi-choice registration fields (with their options) for checklist elements, e.g. pass_days
    choice_fields: (schema?.fields || PREBUILT_TEMPLATES.kashish_lgbtq.fields || [])
      .filter((f) => f && f.key && f.enabled !== false && ['multi_checkbox', 'checkbox_group', 'select', 'radio'].includes(f.type) && Array.isArray(f.options) && f.options.length)
      .map((f) => ({ key: f.key, label: f.label || f.key, options: f.options.map((o) => (typeof o === 'object' ? (o.label ?? o.value) : o)).filter(Boolean).map(String).slice(0, 20) }))
  };
}

async function loadRow(eventId, id) {
  const rows = await query('SELECT * FROM pass_templates WHERE id = ? AND event_id = ? AND is_archived = 0 LIMIT 1', [id, eventId]);
  return rows[0] || null;
}

async function loadElementRows(templateIds) {
  if (!templateIds.length) return [];
  return query(
    `SELECT id, template_id, type, name, position, metadata, sort_order FROM pass_template_elements
     WHERE template_id IN (${templateIds.map(() => '?').join(',')}) ORDER BY template_id, sort_order, id`,
    templateIds
  );
}

/** Full template: row + elements + the uploaded images its elements use (asset id → data URL). */
async function loadFullTemplate(eventId, id) {
  const row = await loadRow(eventId, id);
  if (!row) return null;
  const template = svc.rowToTemplate(row, await loadElementRows([row.id]), { withImage: true });
  const assetIds = [...new Set(template.elements.map((e) => e.metadata?.asset_id).filter(Boolean))];
  template.assets = {};
  if (assetIds.length) {
    const assets = await query(
      `SELECT id, data_url FROM pass_template_assets WHERE event_id = ? AND id IN (${assetIds.map(() => '?').join(',')})`,
      [eventId, ...assetIds]
    );
    assets.forEach((a) => { template.assets[a.id] = a.data_url; });
  }
  return template;
}

async function insertElements(conn, templateId, elements) {
  for (let i = 0; i < elements.length; i += 1) {
    const e = elements[i];
    await conn.query(
      'INSERT INTO pass_template_elements (template_id, type, name, position, metadata, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
      [templateId, e.type, e.name, JSON.stringify(e.position), JSON.stringify(e.metadata), i]
    );
  }
}

async function inTransaction(fn) {
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
}

/** Deletes this event's uploaded images that no element uses and that are older than a day. */
async function cleanupAssets(eventId) {
  try {
    const rows = await query(
      `SELECT e.metadata FROM pass_template_elements e JOIN pass_templates t ON t.id = e.template_id
       WHERE t.event_id = ? AND e.type = 'image'`,
      [eventId]
    );
    const used = new Set();
    rows.forEach((r) => {
      const m = typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata;
      if (m?.asset_id) used.add(Number(m.asset_id));
    });
    const old = await query('SELECT id FROM pass_template_assets WHERE event_id = ? AND created_at < NOW() - INTERVAL 1 DAY', [eventId]);
    const unused = old.map((a) => Number(a.id)).filter((id) => !used.has(id));
    if (unused.length) {
      await query(`DELETE FROM pass_template_assets WHERE event_id = ? AND id IN (${unused.map(() => '?').join(',')})`, [eventId, ...unused]);
    }
  } catch (err) {
    console.error('[PassTemplates] asset cleanup error:', err.message);
  }
}

async function listTemplates(req, res) {
  try {
    const eventId = requireEvent(req, res);
    if (!eventId) return;
    const [rows, context, qrSettings, canManage] = await Promise.all([
      query(`SELECT ${LIST_COLUMNS} FROM pass_templates WHERE event_id = ? AND is_archived = 0 ORDER BY is_default DESC, name`, [eventId]),
      getFestivalContext(eventId),
      getQrSettings(eventId),
      userHasPermission(req, 'settings.manage')
    ]);
    const elementRows = await loadElementRows(rows.map((r) => r.id));
    res.json({
      success: true,
      templates: rows.map((r) => svc.rowToTemplate(r, elementRows.filter((e) => e.template_id === r.id))),
      starters: svc.STARTER_TEMPLATES,
      ...context,
      qr_settings: qrSettings,
      can_manage: canManage,
      limits: { max_image_bytes: svc.MAX_IMAGE_BYTES, max_asset_bytes: svc.MAX_ASSET_BYTES }
    });
  } catch (error) {
    handleError(res, error, 'list');
  }
}

async function getTemplate(req, res) {
  try {
    const eventId = requireEvent(req, res);
    if (!eventId) return;
    const starter = svc.getStarter(req.params.id);
    if (starter) return res.json({ success: true, template: { ...starter, background_image: null, assets: {} } });
    const template = await loadFullTemplate(eventId, req.params.id);
    if (!template) return res.status(404).json({ success: false, message: 'Template not found.' });
    res.json({ success: true, template });
  } catch (error) {
    handleError(res, error, 'get');
  }
}

async function createTemplate(req, res) {
  try {
    const eventId = requireEvent(req, res);
    if (!eventId) return;
    const v = await svc.validateTemplateInput(eventId, { ...req.body, keep_image: false });
    const id = await inTransaction(async (conn) => {
      const [result] = await conn.query(
        `INSERT INTO pass_templates (event_id, name, design_mode, width_mm, height_mm, config_json, background_image, category_codes, created_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [eventId, v.name, v.design_mode, v.width_mm, v.height_mm, JSON.stringify(v.config), v.background_image, JSON.stringify(v.category_codes), req.user?.id || null]
      );
      await insertElements(conn, result.insertId, v.elements);
      return result.insertId;
    });
    cleanupAssets(eventId);
    res.status(201).json({ success: true, template: await loadFullTemplate(eventId, id) });
  } catch (error) {
    handleError(res, error, 'create');
  }
}

async function updateTemplate(req, res) {
  try {
    const eventId = requireEvent(req, res);
    if (!eventId) return;
    const existing = await loadRow(eventId, req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'Template not found.' });

    // keep_image: the client didn't resend the stored image and didn't remove it
    const keepImage = req.body?.keep_image === true && Boolean(existing.background_image);
    const v = await svc.validateTemplateInput(eventId, { ...req.body, keep_image: keepImage });
    const image = v.background_image || (v.keep_image ? existing.background_image : null);

    await inTransaction(async (conn) => {
      await conn.query(
        `UPDATE pass_templates SET name = ?, design_mode = ?, width_mm = ?, height_mm = ?, config_json = ?, background_image = ?, category_codes = ?
         WHERE id = ? AND event_id = ?`,
        [v.name, v.design_mode, v.width_mm, v.height_mm, JSON.stringify(v.config), image, JSON.stringify(v.category_codes), existing.id, eventId]
      );
      await conn.query('DELETE FROM pass_template_elements WHERE template_id = ?', [existing.id]);
      await insertElements(conn, existing.id, v.elements);
    });
    cleanupAssets(eventId);
    res.json({ success: true, template: await loadFullTemplate(eventId, existing.id) });
  } catch (error) {
    handleError(res, error, 'update');
  }
}

async function duplicateTemplate(req, res) {
  try {
    const eventId = requireEvent(req, res);
    if (!eventId) return;
    const starter = svc.getStarter(req.params.id);
    let source;
    if (starter) {
      source = { ...starter, name: starter.name.replace(/\s*\(starter\)$/i, ''), background_image: null };
    } else {
      source = await loadFullTemplate(eventId, req.params.id);
      if (!source) return res.status(404).json({ success: false, message: 'Template not found.' });
      source.name = `${source.name} (copy)`.slice(0, 120);
    }
    const id = await inTransaction(async (conn) => {
      const [result] = await conn.query(
        `INSERT INTO pass_templates (event_id, name, design_mode, width_mm, height_mm, config_json, background_image, category_codes, created_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [eventId, source.name, source.design_mode, source.width_mm, source.height_mm, JSON.stringify(svc.sanitizeConfig(source.config)),
          source.background_image || null, JSON.stringify(starter ? [] : source.category_codes), req.user?.id || null]
      );
      // Uploaded images are shared: they belong to the event, not to one template
      await insertElements(conn, result.insertId, source.elements);
      return result.insertId;
    });
    res.status(201).json({ success: true, template: await loadFullTemplate(eventId, id) });
  } catch (error) {
    handleError(res, error, 'duplicate');
  }
}

async function uploadAsset(req, res) {
  try {
    const eventId = requireEvent(req, res);
    if (!eventId) return;
    const dataUrl = svc.checkImageDataUrl(req.body?.data_url, svc.MAX_ASSET_BYTES, 'The image');
    const mime = dataUrl.slice(5, dataUrl.indexOf(';'));
    const bytes = Math.floor((dataUrl.length - dataUrl.indexOf(',') - 1) * 3 / 4);
    const result = await query(
      'INSERT INTO pass_template_assets (event_id, mime, data_url, bytes, created_by_user_id) VALUES (?, ?, ?, ?, ?)',
      [eventId, mime, dataUrl, bytes, req.user?.id || null]
    );
    res.status(201).json({ success: true, asset_id: result.insertId });
  } catch (error) {
    handleError(res, error, 'upload asset');
  }
}

async function saveQrSettings(req, res) {
  try {
    const eventId = requireEvent(req, res);
    if (!eventId) return;
    const settings = svc.sanitizeQrSettings(req.body);
    await query(
      `INSERT INTO pass_print_settings (event_id, qr_json, updated_by_user_id) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE qr_json = VALUES(qr_json), updated_by_user_id = VALUES(updated_by_user_id)`,
      [eventId, JSON.stringify(settings), req.user?.id || null]
    );
    res.json({ success: true, qr_settings: settings });
  } catch (error) {
    handleError(res, error, 'save QR settings');
  }
}

async function layoutPreview(req, res) {
  try {
    const W = Number(req.body?.width_mm);
    const H = Number(req.body?.height_mm);
    if (![W, H].every((n) => Number.isFinite(n) && n >= 20 && n <= 300)) {
      return res.status(400).json({ success: false, message: 'Pass width and height must be between 20 and 300 mm.' });
    }
    res.json({ success: true, elements: svc.buildLayoutElements(W, H, { title: typeof req.body?.title === 'string' ? req.body.title.slice(0, 60) : undefined }) });
  } catch (error) {
    handleError(res, error, 'layout preview');
  }
}

async function setDefaultTemplate(req, res) {
  let conn;
  try {
    const eventId = requireEvent(req, res);
    if (!eventId) return;
    const row = await loadRow(eventId, req.params.id);
    if (!row) return res.status(404).json({ success: false, message: 'Template not found.' });
    conn = await getConnection();
    await conn.beginTransaction();
    await conn.query('UPDATE pass_templates SET is_default = 0 WHERE event_id = ? AND is_default = 1', [eventId]);
    await conn.query('UPDATE pass_templates SET is_default = 1 WHERE id = ? AND event_id = ?', [row.id, eventId]);
    await conn.commit();
    res.json({ success: true });
  } catch (error) {
    if (conn) await conn.rollback().catch(() => {});
    handleError(res, error, 'set default');
  } finally {
    if (conn) conn.release();
  }
}

async function archiveTemplate(req, res) {
  try {
    const eventId = requireEvent(req, res);
    if (!eventId) return;
    const row = await loadRow(eventId, req.params.id);
    if (!row) return res.status(404).json({ success: false, message: 'Template not found.' });
    await query('UPDATE pass_templates SET is_archived = 1, is_default = 0 WHERE id = ? AND event_id = ?', [row.id, eventId]);
    res.json({ success: true });
  } catch (error) {
    handleError(res, error, 'archive');
  }
}

module.exports = {
  listTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  duplicateTemplate,
  setDefaultTemplate,
  archiveTemplate,
  uploadAsset,
  layoutPreview,
  saveQrSettings
};
