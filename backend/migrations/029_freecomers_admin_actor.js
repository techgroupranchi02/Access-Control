/**
 * Migration 029: record actions by a Freecomers admin as the admin (docs/adr/0007-freecomers-admin-identity.md)
 *
 * A Freecomers admin has no users.id (admins.id is a different table; users.id 1 is a real person). Where an
 * action is shown by name, the admin's admins.id goes into a new nullable column, and the name shows as
 * "Freecomers Admin". Additive and idempotent (Jenkins runs migrate on every deploy); a missing table is skipped.
 */

const { query } = require('../src/config/database');

const COLUMNS = [
  { table: 'screening_checkins', column: 'scanned_by_admin_id', after: 'scanned_by_user_id' },
  { table: 'submission_logs', column: 'actor_admin_id', after: 'actor_user_id' },
  { table: 'qr_print_log', column: 'printed_by_admin_id', after: 'printed_by' },
  { table: 'kashish_results_publications', column: 'published_by_admin_id', after: 'published_by_user_id' }
];

async function has(table, column) {
  const rows = column
    ? await query('SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1', [table, column])
    : await query('SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1', [table]);
  return rows.length > 0;
}

async function up() {
  console.log('[Migration 029] Freecomers admin actor columns: starting...');
  for (const { table, column, after } of COLUMNS) {
    if (!(await has(table))) { console.log(`[Migration 029] • ${table} does not exist, skipped`); continue; }
    if (await has(table, column)) { console.log(`[Migration 029] • ${table}.${column} already exists`); continue; }
    const position = (await has(table, after)) ? ` AFTER \`${after}\`` : '';
    await query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` BIGINT UNSIGNED NULL DEFAULT NULL${position}`);
    console.log(`[Migration 029] ✓ Added ${table}.${column}`);
  }
  console.log('[Migration 029] ✓ Completed.');
}

async function down() {
  for (const { table, column } of COLUMNS) {
    try { await query(`ALTER TABLE \`${table}\` DROP COLUMN \`${column}\``); } catch (e) { }
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
