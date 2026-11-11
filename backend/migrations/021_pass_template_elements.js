/**
 * Migration 021: pass template elements (docs/adr/0005-pass-templates.md, Amendment 1)
 *
 * Every template becomes a background plus generic elements (text, image, checklist):
 *   pass_template_elements  one row per element: type, name, position (JSON), metadata (JSON), sort_order
 *   pass_template_assets    images uploaded for image elements (data URLs, one per row)
 *
 * Existing templates are converted (only templates that have no element rows yet):
 *   artwork  config.slots → elements (qr → Badge QR image, logo → festival logo image, text keys → text)
 *   layout   config.fields → the built-in arrangement from buildLayoutElements()
 * and config keeps only background / accent / useCategoryColor (+ sticker, moved out by 022).
 *
 * Our own tables only. Idempotent.
 */

const { query, getConnection } = require('../src/config/database');
const svc = require('../src/core/services/passTemplates.service');

const TEXT_TOKEN = {
  festival_name: '{{festival_name}}', name: '{{name}}', category: '{{category}}', pass_type: '{{pass_type}}',
  valid_dates: '{{valid_dates}}', venue: '{{venue}}', serial: '{{serial}}', badge_no: '{{badge_no}}', sequence: '{{sequence}}'
};
const LABELS = {
  festival_name: 'Festival name', title: 'Title', name: 'Holder name', category: 'Category', pass_type: 'Pass type',
  valid_dates: 'Valid dates', venue: 'Venue', serial: 'Delegate serial', badge_no: 'Badge no.', sequence: 'Badge sequence no.'
};

function slotToElement(slot) {
  const position = { x: slot.x, y: slot.y, w: slot.w, h: slot.h, rotation: 0 };
  if (slot.key === 'qr') {
    return { type: 'image', name: 'Badge QR', position, metadata: { source: 'badge_qr', fit: 'contain', opacity: 1, radius: 0, showBadgeNo: false } };
  }
  if (slot.key === 'logo') {
    return { type: 'image', name: 'Festival logo', position, metadata: { source: 'festival_logo', fit: 'contain', opacity: 1, radius: 0, showBadgeNo: false } };
  }
  let content;
  let name;
  if (slot.key.startsWith('custom:')) {
    const k = slot.key.slice(7);
    content = `{{custom.${k}}}`;
    name = k;
  } else if (slot.key === 'title') {
    content = slot.text || 'DELEGATE PASS';
    name = LABELS.title;
  } else {
    content = slot.text && ['venue', 'valid_dates'].includes(slot.key) ? slot.text : TEXT_TOKEN[slot.key] || '';
    name = LABELS[slot.key] || slot.key;
  }
  return {
    type: 'text',
    name,
    position,
    metadata: {
      content, font: 'inter', sizePt: slot.fontSizePt || 10, weight: slot.bold ? 800 : 400, italic: false,
      color: slot.color || '#0f172a', align: slot.align || 'left', vAlign: 'middle', uppercase: false, letterSpacing: 0,
      lineHeight: 1.15, autoShrink: true, hideWhenEmpty: true, background: 'none', radius: 0, padding: 0
    }
  };
}

function layoutToElements(config, W, H) {
  const on = Object.fromEntries((config.fields || []).map((f) => [f.key, Boolean(f.on)]));
  const title = (config.fields || []).find((f) => f.key === 'title')?.text || 'DELEGATE PASS';
  const has = (k, d) => (k in on ? on[k] : d);
  return svc.buildLayoutElements(W, H, {
    title,
    qrBadgeNo: config.qr?.showBadgeNo !== false,
    show: {
      logo: config.showLogo !== false,
      festival_name: has('festival_name', true),
      title: has('title', true),
      name: has('name', true),
      category: has('category', true),
      pass_type: has('pass_type', true),
      valid_dates: has('valid_dates', true),
      serial: has('serial', true)
    }
  });
}

async function up() {
  console.log('[Migration 021] pass template elements: starting...');
  await query(`
    CREATE TABLE IF NOT EXISTS pass_template_elements (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      template_id INT UNSIGNED NOT NULL,
      type ENUM('text', 'image', 'checklist') NOT NULL,
      name VARCHAR(80) NOT NULL,
      position JSON NOT NULL,
      metadata JSON NOT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_pte_template (template_id, sort_order),
      CONSTRAINT fk_pte_template FOREIGN KEY (template_id) REFERENCES pass_templates (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS pass_template_assets (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      event_id BIGINT UNSIGNED NOT NULL,
      mime VARCHAR(40) NOT NULL,
      data_url MEDIUMTEXT NOT NULL,
      bytes INT UNSIGNED NOT NULL,
      created_by_user_id BIGINT UNSIGNED NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_pta_event (event_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log('[Migration 021] ✓ Tables ready');

  const templates = await query(`
    SELECT t.id, t.design_mode, t.width_mm, t.height_mm, t.config_json
    FROM pass_templates t
    WHERE NOT EXISTS (SELECT 1 FROM pass_template_elements e WHERE e.template_id = t.id)
  `);
  let converted = 0;
  for (const t of templates) {
    const config = typeof t.config_json === 'string' ? JSON.parse(t.config_json) : (t.config_json || {});
    const W = Number(t.width_mm);
    const H = Number(t.height_mm);
    if (!('slots' in config) && !('fields' in config)) continue; // already in the new shape
    const elements = t.design_mode === 'artwork'
      ? (config.slots || []).map(slotToElement)
      : layoutToElements(config, W, H);
    const newConfig = svc.sanitizeConfig(config);
    // Keep the old sticker settings for migration 022, which moves them to pass_print_settings
    if (config.sticker) newConfig.sticker = config.sticker;

    const conn = await getConnection();
    try {
      await conn.beginTransaction();
      for (let i = 0; i < elements.length; i += 1) {
        const e = elements[i];
        await conn.query(
          'INSERT INTO pass_template_elements (template_id, type, name, position, metadata, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
          [t.id, e.type, e.name, JSON.stringify(e.position), JSON.stringify(e.metadata), i]
        );
      }
      await conn.query('UPDATE pass_templates SET config_json = ?, updated_at = updated_at WHERE id = ?', [JSON.stringify(newConfig), t.id]);
      await conn.commit();
      converted += 1;
      console.log(`[Migration 021] ✓ Template ${t.id} (${t.design_mode}): ${elements.length} elements`);
    } catch (err) {
      await conn.rollback().catch(() => {});
      throw err;
    } finally {
      conn.release();
    }
  }
  console.log(`[Migration 021] ✓ Converted ${converted} templates. Completed.`);
}

async function down() {
  await query('DROP TABLE IF EXISTS pass_template_elements');
  await query('DROP TABLE IF EXISTS pass_template_assets');
}

module.exports = { up, down };

if (require.main === module) {
  up()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
