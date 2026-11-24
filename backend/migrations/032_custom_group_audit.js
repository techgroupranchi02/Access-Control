/**
 * Migration 032: who last changed a custom group, and when (docs/adr/0009-team-group-config.md)
 *
 * Team › Group Config edits custom groups. `updated_at` is shown as "Last changed" and lets the server refuse a
 * save based on an older copy (two admins editing at once). The actor columns follow ADR 0007 (a Freecomers
 * admin has no users.id). FestiPlus-owned table; additive and idempotent.
 */

const { query } = require('../src/config/database');

const COLUMNS = [
  { column: 'updated_at', ddl: 'TIMESTAMP NULL DEFAULT NULL', after: 'created_at' },
  { column: 'updated_by_user_id', ddl: 'BIGINT UNSIGNED NULL DEFAULT NULL', after: 'updated_at' },
  { column: 'updated_by_admin_id', ddl: 'BIGINT UNSIGNED NULL DEFAULT NULL', after: 'updated_by_user_id' }
];

async function has(table, column) {
  const rows = column
    ? await query('SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1', [table, column])
    : await query('SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1', [table]);
  return rows.length > 0;
}

async function up() {
  console.log('[Migration 032] Custom group audit columns: starting...');
  if (!(await has('event_custom_groups'))) {
    console.log('[Migration 032] • event_custom_groups does not exist, skipped');
    return;
  }
  for (const { column, ddl, after } of COLUMNS) {
    if (await has('event_custom_groups', column)) { console.log(`[Migration 032] • ${column} already exists`); continue; }
    const position = (await has('event_custom_groups', after)) ? ` AFTER \`${after}\`` : '';
    await query(`ALTER TABLE event_custom_groups ADD COLUMN \`${column}\` ${ddl}${position}`);
    console.log(`[Migration 032] ✓ Added event_custom_groups.${column}`);
  }
  console.log('[Migration 032] ✓ Completed.');
}

async function down() {
  for (const { column } of COLUMNS) {
    try { await query(`ALTER TABLE event_custom_groups DROP COLUMN \`${column}\``); } catch (e) { }
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
