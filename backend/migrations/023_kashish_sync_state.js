/**
 * Migration 023: Kashish event filter + incremental sync (docs/adr/0004, Amendment 1)
 *
 *   kashish_sync_state        per festival: the Kashish event ID last synced, the API's syncedAt
 *                             (passed as updatedSince next time) and the last full sync
 *   kashish_external_votes    + kashish_event_id and the voter's email / name / mobile / country,
 *                             so stored votes can be re-checked against registrations and
 *                             check-ins without fetching them again
 *                             + outcome 'removed' (no longer in the festival's Kashish feed)
 *
 * Our own tables only. Idempotent.
 */

const { query } = require('../src/config/database');

async function columnExists(table, column) {
  const rows = await query(
    'SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1',
    [table, column]
  );
  return rows.length > 0;
}

const VOTE_COLUMNS = [
  ['kashish_event_id', 'VARCHAR(64) NULL DEFAULT NULL AFTER kashish_vote_id'],
  ['kashish_user_email', 'VARCHAR(255) NULL DEFAULT NULL AFTER kashish_user_id'],
  ['kashish_user_name', 'VARCHAR(255) NULL DEFAULT NULL AFTER kashish_user_email'],
  ['kashish_user_mobile', 'VARCHAR(32) NULL DEFAULT NULL AFTER kashish_user_name'],
  ['kashish_user_country', 'VARCHAR(8) NULL DEFAULT NULL AFTER kashish_user_mobile']
];

async function up() {
  console.log('[Migration 023] Kashish sync state: starting...');
  await query(`
    CREATE TABLE IF NOT EXISTS kashish_sync_state (
      event_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
      kashish_event_id VARCHAR(64) NULL,
      last_synced_at VARCHAR(40) NULL COMMENT 'sync.syncedAt from the Kashish API (ISO, passed back as updatedSince)',
      last_full_sync_at DATETIME NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log('[Migration 023] ✓ kashish_sync_state ready');

  for (const [name, def] of VOTE_COLUMNS) {
    if (!(await columnExists('kashish_external_votes', name))) {
      await query(`ALTER TABLE kashish_external_votes ADD COLUMN ${name} ${def}`);
      console.log(`[Migration 023] ✓ Added kashish_external_votes.${name}`);
    }
  }

  const col = await query(
    "SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'kashish_external_votes' AND COLUMN_NAME = 'outcome'"
  );
  if (col[0] && !String(col[0].COLUMN_TYPE).includes("'removed'")) {
    await query(`ALTER TABLE kashish_external_votes MODIFY outcome
      ENUM('counted','unregistered','not_checked_in','outside_period','not_verified','invalid','duplicate','removed') NOT NULL`);
    console.log("[Migration 023] ✓ outcome now includes 'removed'");
  }
  // Earlier syncs stored "no longer returned" votes as not_verified with this reason
  const moved = await query(
    "UPDATE kashish_external_votes SET outcome = 'removed' WHERE outcome = 'not_verified' AND reason = 'No longer returned by the Kashish API'"
  );
  console.log(`[Migration 023] ✓ ${moved.affectedRows || 0} earlier removed votes relabelled. Completed.`);
}

async function down() {
  await query('DROP TABLE IF EXISTS kashish_sync_state');
}

module.exports = { up, down };

if (require.main === module) {
  up().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
}
