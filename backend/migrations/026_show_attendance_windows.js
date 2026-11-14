/**
 * Migration 026: per-show attendance windows (docs/adr/0004-kashish-external-leaderboard.md, Amendment 2)
 *
 * - screening_blocks.voting_enabled: ceremonies and panels have attendance but no Audience Choice vote.
 * - screening_block_kashish_films: which Kashish-app movies play in a show (Kashish-source festivals
 *   have no submissions to link through screening_block_films).
 * - screening_checkins: every scan is kept (a badge may be scanned many times: re-entry, delays), so
 *   the one-row-per-show unique key becomes a plain index, plus an index for "scans of this delegate
 *   by time", and the 'outside_window' status.
 * - kashish_external_votes.outcome: 'unscheduled' and 'voted_before_checkin'.
 *
 * Our own tables only (not shared with Freecomers). Additive and idempotent.
 */

const { query } = require('../src/config/database');

async function columnExists(table, column) {
  const rows = await query(
    `SELECT COUNT(*) AS n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return Number(rows[0].n) > 0;
}

async function indexExists(table, index) {
  const rows = await query(
    `SELECT COUNT(*) AS n FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [table, index]
  );
  return Number(rows[0].n) > 0;
}

async function up() {
  console.log('[Migration 026] Show attendance windows: starting...');

  if (!(await columnExists('screening_blocks', 'voting_enabled'))) {
    await query('ALTER TABLE screening_blocks ADD COLUMN voting_enabled TINYINT(1) NOT NULL DEFAULT 1 AFTER block_type');
    console.log('[Migration 026] ✓ screening_blocks.voting_enabled added.');
  }

  await query(`
    CREATE TABLE IF NOT EXISTS screening_block_kashish_films (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      event_id BIGINT UNSIGNED NOT NULL,
      screening_block_id BIGINT UNSIGNED NOT NULL,
      kashish_movie_id VARCHAR(64) NOT NULL,
      kashish_movie_title VARCHAR(255) NOT NULL DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_block_kashish_movie (screening_block_id, kashish_movie_id),
      INDEX idx_bkf_event_movie (event_id, kashish_movie_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log('[Migration 026] ✓ screening_block_kashish_films ready.');

  // Keep every scan: add the plain index first (MySQL needs an index on screening_block_id for any FK)
  if (!(await indexExists('screening_checkins', 'idx_checkin_block_attendee'))) {
    await query('ALTER TABLE screening_checkins ADD INDEX idx_checkin_block_attendee (screening_block_id, attendee_id)');
  }
  if (await indexExists('screening_checkins', 'uk_attendee_screening')) {
    await query('ALTER TABLE screening_checkins DROP INDEX uk_attendee_screening');
    console.log('[Migration 026] ✓ screening_checkins keeps every scan (unique key removed).');
  }
  if (!(await indexExists('screening_checkins', 'idx_checkin_event_attendee_time'))) {
    await query('ALTER TABLE screening_checkins ADD INDEX idx_checkin_event_attendee_time (event_id, attendee_id, scanned_at)');
  }
  const status = await query(
    `SELECT COLUMN_TYPE AS t FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'screening_checkins' AND COLUMN_NAME = 'scan_status'`
  );
  if (status[0] && !String(status[0].t).includes("'outside_window'")) {
    await query(`ALTER TABLE screening_checkins MODIFY COLUMN scan_status ENUM('valid', 'duplicate_ignored', 'offline_synced', 'outside_window') NOT NULL DEFAULT 'valid'`);
    console.log("[Migration 026] ✓ scan_status gains 'outside_window'.");
  }

  // Two new vote outcomes: the film isn't on any show, or the vote came before the show's scan
  const outcome = await query(
    `SELECT COLUMN_TYPE AS t FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'kashish_external_votes' AND COLUMN_NAME = 'outcome'`
  );
  if (outcome[0] && !String(outcome[0].t).includes("'voted_before_checkin'")) {
    await query(`ALTER TABLE kashish_external_votes MODIFY outcome
      ENUM('counted','unregistered','not_checked_in','outside_period','not_verified','invalid','duplicate','removed','unscheduled','voted_before_checkin') NOT NULL`);
    console.log("[Migration 026] ✓ vote outcomes gain 'unscheduled' and 'voted_before_checkin'.");
  }

  console.log('[Migration 026] Completed.');
}

async function down() { /* additive; the old unique key would reject the repeat scans now stored */ }

module.exports = { up, down };

if (require.main === module) {
  up().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
}
