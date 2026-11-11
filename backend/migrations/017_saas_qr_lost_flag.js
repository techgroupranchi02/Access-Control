/**
 * Migration 017: Lost badges (docs/adr/0001, Amendment 2)
 *
 * Adds three nullable / defaulted columns to the shared saas_qr table:
 *   is_lost          1 once the badge is reported lost (or revoked). A lost badge is refused at
 *                    check-in, voting and pairing, and never goes back into blank stock.
 *   lost_at          when it was marked lost
 *   lost_by_user_id  who marked it lost
 * The row keeps its attendee_id (history) and its 6-digit serial stays reserved.
 *
 * Additive and idempotent: Laravel and festease_backend insert without these columns and get is_lost = 0.
 */

const { query } = require('../src/config/database');

async function columnExists(table, column) {
  const rows = await query(
    `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
    [table, column]
  );
  return rows.length > 0;
}

const COLUMNS = [
  ['is_lost', 'TINYINT(1) NOT NULL DEFAULT 0'],
  ['lost_at', 'DATETIME NULL DEFAULT NULL'],
  ['lost_by_user_id', 'BIGINT UNSIGNED NULL DEFAULT NULL']
];

async function up() {
  console.log('[Migration 017] saas_qr lost-badge columns: starting...');
  for (const [name, definition] of COLUMNS) {
    if (await columnExists('saas_qr', name)) {
      console.log(`[Migration 017] • saas_qr.${name} already exists`);
      continue;
    }
    await query(`ALTER TABLE saas_qr ADD COLUMN ${name} ${definition}`);
    console.log(`[Migration 017] ✓ Added saas_qr.${name}`);
  }
  console.log('[Migration 017] ✓ Completed.');
}

async function down() {
  for (const [name] of [...COLUMNS].reverse()) {
    try { await query(`ALTER TABLE saas_qr DROP COLUMN ${name}`); } catch (e) { }
  }
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
