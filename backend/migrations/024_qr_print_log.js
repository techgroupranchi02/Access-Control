/**
 * Migration 024: badge print history (docs/adr/0005-pass-templates.md, Amendment 3)
 *
 *   qr_print_log   one row per badge each time it is sent to print from the print dialog
 *                  (Pass + QR or QR only), so the dialog can warn before a badge number is
 *                  printed a second time.
 *
 * Our own table only (saas_qr is shared with other Freecomers systems). Idempotent.
 */

const { query } = require('../src/config/database');

async function up() {
  console.log('[Migration 024] QR print log: starting...');
  await query(`
    CREATE TABLE IF NOT EXISTS qr_print_log (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      event_id BIGINT UNSIGNED NOT NULL,
      qr_id BIGINT UNSIGNED NOT NULL COMMENT 'saas_qr.qr_id',
      print_job VARCHAR(36) NOT NULL COMMENT 'groups the badges of one Print press',
      print_mode VARCHAR(16) NOT NULL COMMENT 'full (Pass + QR) or qr-only',
      template_id VARCHAR(40) NULL COMMENT 'pass template (or starter id) used, NULL for QR only',
      printed_by INT NULL COMMENT 'users.id',
      printed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_qr_print_event_qr (event_id, qr_id),
      KEY idx_qr_print_job (print_job)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log('[Migration 024] ✓ qr_print_log ready. Completed.');
}

async function down() {
  await query('DROP TABLE IF EXISTS qr_print_log');
}

module.exports = { up, down };

if (require.main === module) {
  up().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
}
