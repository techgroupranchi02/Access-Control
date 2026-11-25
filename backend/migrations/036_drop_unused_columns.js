/**
 * Migration 036: drop columns that nothing reads or writes (API review D4).
 *
 * Checked on 24 Nov 2026: none of these names appears in the Access-Control backend or frontend, the Freecomers
 * Laravel apps or festease, and on dev every value is NULL. The features they were meant for (chat replies and
 * editing, channel visibility, review-stage deadlines, guest seats, single-film jury ballots, offline scans,
 * before/after values in the activity log) were never built; re-add a column when a feature needs it.
 *
 * Added 25 Nov 2026 (second sweep of every FestiPlus table: empty on dev and no code ever puts a value in it):
 * - screening_checkins.venue_id: set from a request field the scanner never sends; a scan's venue is its show's
 *   (screening_blocks.venue_id).
 * - festival_review_states.custom_group_id, audience_voting_audit_logs.metadata: never read or written.
 * - submissions.composite_score: only ever reset to NULL; ratings come from overall_average_rating.
 * - submissions.premiere: always the default 'None', never written; the film drawer no longer shows it.
 * - permissions.page_id, pages.permission_id: never written (the spec sync doesn't set either link).
 * - kashish_sync_logs.users_auto_created: always 0 since delegates stopped being auto-created.
 *
 * Kept and now set instead of dropped: guests.checked_in_at (guest check-in) and
 * festival_external_sync_logs.records_failed / error_payload (delegate bulk import). Kept as the tables' only
 * timestamps: chat_messages.sent_at, festival_external_sync_logs.synced_at, *.first_seen_at.
 *
 * Before dropping, each column's definition and its non-NULL values (with the row id) are written to
 * backend/logs/db-backups/036_unused_columns_<timestamp>.json (logs/ survives deploys). Nothing is dropped if
 * the backup can't be written. Idempotent: columns already gone are skipped. Access-Control tables only.
 */

const fs = require('fs');
const path = require('path');
const { query } = require('../src/config/database');

const COLUMNS = [
  ['chat_channels', 'is_system_group'],
  ['chat_channels', 'visibility_mode'],
  ['chat_messages', 'reply_to'],
  ['chat_messages', 'edited_at'],
  ['festival_review_states', 'deadline_at'],
  ['guests', 'assigned_seat'],
  ['jury_ballots', 'voted_film_id'],
  ['screening_checkins', 'offline_client_timestamp'],
  ['submission_logs', 'old_value'],
  ['submission_logs', 'new_value'],
  ['screening_checkins', 'venue_id'],
  ['festival_review_states', 'custom_group_id'],
  ['audience_voting_audit_logs', 'metadata'],
  ['submissions', 'composite_score'],
  ['submissions', 'premiere'],
  ['permissions', 'page_id'],
  ['pages', 'permission_id'],
  ['kashish_sync_logs', 'users_auto_created']
];

async function columnInfo(table, column) {
  const rows = await query(
    'SELECT COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
    [table, column]
  );
  return rows[0] || null;
}

async function primaryKey(table) {
  const rows = await query(
    "SELECT COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = 'PRIMARY' ORDER BY ORDINAL_POSITION LIMIT 1",
    [table]
  );
  return rows[0]?.COLUMN_NAME || null;
}

async function up() {
  console.log('[Migration 036] Drop unused columns: starting...');
  const present = [];
  for (const [table, column] of COLUMNS) {
    const info = await columnInfo(table, column);
    if (info) present.push({ table, column, info });
    else console.log(`[Migration 036] • ${table}.${column} already gone`);
  }
  if (!present.length) {
    console.log('[Migration 036] ✓ Nothing to drop.');
    return;
  }

  // 1. Back up definitions and any values
  const backup = { migration: '036_drop_unused_columns', taken_at: new Date().toISOString(), columns: [] };
  for (const p of present) {
    const pk = await primaryKey(p.table);
    const values = pk
      ? await query(`SELECT \`${pk}\` AS id, \`${p.column}\` AS value FROM \`${p.table}\` WHERE \`${p.column}\` IS NOT NULL`)
      : [];
    backup.columns.push({ table: p.table, column: p.column, definition: p.info, primary_key: pk, values });
  }
  const dir = path.resolve(__dirname, '../logs/db-backups');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `036_unused_columns_${backup.taken_at.replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(file, JSON.stringify(backup, null, 2));
  if (JSON.parse(fs.readFileSync(file, 'utf8')).columns.length !== present.length) throw new Error('Backup check failed; nothing dropped.');
  console.log(`[Migration 036] ✓ Backed up ${present.length} column(s) to ${file}`);

  // 2. Drop, one ALTER per table
  const byTable = new Map();
  for (const p of present) {
    if (!byTable.has(p.table)) byTable.set(p.table, []);
    byTable.get(p.table).push(p.column);
  }
  for (const [table, columns] of byTable) {
    await query(`ALTER TABLE \`${table}\` ${columns.map((c) => `DROP COLUMN \`${c}\``).join(', ')}`);
    const kept = backup.columns.filter((c) => c.table === table).reduce((n, c) => n + c.values.length, 0);
    console.log(`[Migration 036] ✓ Dropped ${table}.${columns.join(', ')} (${kept} non-empty value(s) backed up)`);
  }
  console.log('[Migration 036] ✓ Completed.');
}

async function down() {
  // Re-add from the backup file by hand if ever needed: it has each column's type, default and values.
}

module.exports = { up, down, COLUMNS };

if (require.main === module) {
  up()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
