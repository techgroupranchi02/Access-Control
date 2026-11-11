/**
 * Migration 022: festival-wide print settings (docs/adr/0005-pass-templates.md, Amendment 2)
 *
 * QR-only sticker settings ("QR Settings" in the print dialog) belong to the festival, not to a
 * template. Creates pass_print_settings (one row per event) and copies each festival's sticker
 * settings from its default template (or its first template), then removes `sticker` from
 * template configs. Our own tables only. Idempotent.
 */

const { query } = require('../src/config/database');
const svc = require('../src/core/services/passTemplates.service');

async function up() {
  console.log('[Migration 022] pass print settings: starting...');
  await query(`
    CREATE TABLE IF NOT EXISTS pass_print_settings (
      event_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
      qr_json JSON NOT NULL,
      updated_by_user_id BIGINT UNSIGNED NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  const templates = await query(`
    SELECT id, event_id, config_json, is_default, is_archived FROM pass_templates
    WHERE JSON_CONTAINS_PATH(config_json, 'one', '$.sticker')
    ORDER BY event_id, is_archived, is_default DESC, id
  `);
  const seen = new Set();
  let copied = 0;
  for (const t of templates) {
    if (seen.has(t.event_id)) continue;
    seen.add(t.event_id);
    const config = typeof t.config_json === 'string' ? JSON.parse(t.config_json) : t.config_json;
    const result = await query(
      'INSERT IGNORE INTO pass_print_settings (event_id, qr_json) VALUES (?, ?)',
      [t.event_id, JSON.stringify(svc.sanitizeQrSettings(config.sticker))]
    );
    if (result.affectedRows) {
      copied += 1;
      console.log(`[Migration 022] ✓ Event ${t.event_id}: QR settings from template ${t.id}`);
    }
  }
  const stripped = await query(
    "UPDATE pass_templates SET config_json = JSON_REMOVE(config_json, '$.sticker'), updated_at = updated_at WHERE JSON_CONTAINS_PATH(config_json, 'one', '$.sticker')"
  );
  console.log(`[Migration 022] ✓ Copied ${copied} festivals' settings; removed sticker from ${stripped.affectedRows || 0} templates. Completed.`);
}

async function down() {
  await query('DROP TABLE IF EXISTS pass_print_settings');
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
