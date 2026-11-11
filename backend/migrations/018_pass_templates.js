/**
 * Migration 018: Badge & pass templates (docs/adr/0005-pass-templates.md)
 *
 * Creates `pass_templates`, our own table (no shared Freecomers table is touched).
 * Each festival (event) can save several templates and print them as
 * Pass + QR, Pass only or QR only.
 *
 *   design_mode       'layout'  = built-in layout from a form
 *                     'artwork' = an uploaded finished design with positioned slots
 *   width_mm/height_mm  printed size of one pass
 *   config_json       colours, fields, slot positions, QR and sticker settings
 *   background_image  PNG/JPEG data URL (artwork or background), at most 2 MB; never in list responses
 *   category_codes    JSON array of audience_categories.code that use this template by default
 *
 * Idempotent.
 */

const { query } = require('../src/config/database');

async function up() {
  console.log('[Migration 018] pass_templates: starting...');
  await query(`
    CREATE TABLE IF NOT EXISTS pass_templates (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      event_id BIGINT UNSIGNED NOT NULL,
      name VARCHAR(120) NOT NULL,
      design_mode ENUM('layout', 'artwork') NOT NULL DEFAULT 'layout',
      width_mm DECIMAL(6, 2) NOT NULL,
      height_mm DECIMAL(6, 2) NOT NULL,
      config_json JSON NOT NULL,
      background_image MEDIUMTEXT NULL,
      category_codes JSON NULL,
      is_default TINYINT(1) NOT NULL DEFAULT 0,
      is_archived TINYINT(1) NOT NULL DEFAULT 0,
      created_by_user_id BIGINT UNSIGNED NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_pass_templates_event (event_id, is_archived)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log('[Migration 018] ✓ Table `pass_templates` ready.');
}

async function down() {
  await query('DROP TABLE IF EXISTS pass_templates');
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
