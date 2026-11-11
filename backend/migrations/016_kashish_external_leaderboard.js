/**
 * Migration 016: Kashish external leaderboard (docs/adr/0004)
 *
 * For festivals whose audience votes come from the Kashish Pride app and whose films are not
 * FestiPlus submissions (audience_settings.settings_json.voting_source = 'kashish'):
 *
 * 1. kashish_external_votes: one row per Kashish vote, keyed by Kashish's own movie id/title.
 *    Each row records whether the vote counts and why not (unregistered voter, not checked in,
 *    outside the voting period, not verified by Kashish, invalid, duplicate). It never references
 *    submissions. Voter email/phone stay in kashish_user_mappings and are not copied here.
 * 2. kashish_results_publications: a frozen snapshot of the standings each time the team clicks
 *    Approve & Publish. The public results endpoint serves the latest snapshot.
 *
 * Additive and idempotent (Jenkins runs migrate on every deploy).
 */

const { query } = require('../src/config/database');

async function up() {
  console.log('[Migration 016] Kashish external leaderboard: starting...');

  await query(`
    CREATE TABLE IF NOT EXISTS kashish_external_votes (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      event_id INT NOT NULL,
      kashish_vote_id VARCHAR(160) NOT NULL,
      kashish_user_id VARCHAR(128) NOT NULL,
      kashish_movie_id VARCHAR(128) NOT NULL,
      kashish_movie_title VARCHAR(255) NOT NULL,
      stars TINYINT UNSIGNED NULL DEFAULT NULL,
      source VARCHAR(16) DEFAULT NULL,
      kashish_status VARCHAR(64) DEFAULT NULL,
      voted_at DATETIME NULL DEFAULT NULL,
      attendee_id BIGINT UNSIGNED NULL DEFAULT NULL,
      qr_id BIGINT UNSIGNED NULL DEFAULT NULL,
      checkin_block_id BIGINT UNSIGNED NULL DEFAULT NULL,
      outcome ENUM('counted','unregistered','not_checked_in','outside_period','not_verified','invalid','duplicate') NOT NULL,
      reason VARCHAR(255) DEFAULT NULL,
      first_seen_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      last_evaluated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_event_kashish_ext_vote (event_id, kashish_vote_id),
      KEY idx_ext_vote_outcome_movie (event_id, outcome, kashish_movie_id),
      KEY idx_ext_vote_attendee (attendee_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log('[Migration 016] ✓ kashish_external_votes ready');

  await query(`
    CREATE TABLE IF NOT EXISTS kashish_results_publications (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      event_id INT NOT NULL,
      standings JSON NOT NULL,
      voting_from DATETIME NULL DEFAULT NULL,
      voting_to DATETIME NULL DEFAULT NULL,
      published_by_user_id BIGINT UNSIGNED NULL DEFAULT NULL,
      published_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_publication_event (event_id, published_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log('[Migration 016] ✓ kashish_results_publications ready');

  console.log('[Migration 016] ✓ Completed.');
}

async function down() {
  try { await query('DROP TABLE IF EXISTS kashish_results_publications'); } catch (e) { }
  try { await query('DROP TABLE IF EXISTS kashish_external_votes'); } catch (e) { }
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
