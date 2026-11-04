/**
 * Migration 015: Link votes to the delegate's badge + Kashish vote receipts (docs/adr/0003)
 *
 * 1. audience_votes.qr_id (nullable, indexed): the saas_qr badge the delegate held when the vote
 *    was accepted, so every vote carries the delegate's QR / badge number (serial via join).
 * 2. kashish_vote_receipts: one row per Kashish vote ({userId}_{movieId}), whatever the outcome.
 *    Makes repeated syncs idempotent and keeps rejected votes (unregistered voter, not checked in,
 *    unmapped film) on record so the team can explain any result.
 *
 * Additive and idempotent (Jenkins runs migrate on every deploy).
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

async function up() {
  console.log('[Migration 015] Vote badge link + Kashish receipts: starting...');

  if (!(await columnExists('audience_votes', 'qr_id'))) {
    await query(`
      ALTER TABLE audience_votes
        ADD COLUMN qr_id BIGINT UNSIGNED NULL DEFAULT NULL AFTER attendee_id,
        ADD KEY idx_votes_qr (qr_id)
    `);
    console.log('[Migration 015] ✓ Added audience_votes.qr_id');
  } else {
    console.log('[Migration 015] • audience_votes.qr_id already exists');
  }

  await query(`
    CREATE TABLE IF NOT EXISTS kashish_vote_receipts (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      event_id BIGINT UNSIGNED NOT NULL,
      kashish_vote_id VARCHAR(160) NOT NULL COMMENT '{userId}_{movieId} from the Kashish API',
      kashish_user_id VARCHAR(64) DEFAULT NULL,
      kashish_movie_id VARCHAR(64) DEFAULT NULL,
      film_id BIGINT UNSIGNED DEFAULT NULL,
      attendee_id BIGINT UNSIGNED DEFAULT NULL,
      qr_id BIGINT UNSIGNED DEFAULT NULL,
      screening_block_id BIGINT UNSIGNED DEFAULT NULL,
      vote_id BIGINT UNSIGNED DEFAULT NULL,
      stars TINYINT UNSIGNED DEFAULT NULL,
      source VARCHAR(16) DEFAULT NULL,
      voted_at TIMESTAMP NULL DEFAULT NULL,
      outcome ENUM('counted','not_checked_in','unregistered','unmapped_film','duplicate') NOT NULL,
      reason VARCHAR(255) DEFAULT NULL,
      payload JSON DEFAULT NULL,
      first_seen_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      last_evaluated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_event_kashish_vote (event_id, kashish_vote_id),
      KEY idx_receipt_outcome (event_id, outcome),
      KEY idx_receipt_attendee (attendee_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log('[Migration 015] ✓ kashish_vote_receipts ready');

  console.log('[Migration 015] ✓ Completed.');
}

async function down() {
  try { await query('DROP TABLE IF EXISTS kashish_vote_receipts'); } catch (e) { }
  try { await query('ALTER TABLE audience_votes DROP KEY idx_votes_qr, DROP COLUMN qr_id'); } catch (e) { }
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
