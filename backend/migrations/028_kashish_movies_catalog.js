/**
 * Migration 028: Kashish films catalog (docs/adr/0004-kashish-external-leaderboard.md, Amendment 4)
 *
 * kashish_movies holds each festival's films as the Kashish Movies API lists them
 * (GET /api/v1/movies?eventId=...), so Settings › Audience › Screenings can offer and link every film,
 * not only films that already have votes. Filled by kashishMovies.service.refreshCatalog().
 *
 * Our own table (not shared with Freecomers). Idempotent: Jenkins runs it on every deploy.
 */

const { query } = require('../src/config/database');

async function up() {
  console.log('[Migration 028] Kashish films catalog: starting...');
  await query(`
    CREATE TABLE IF NOT EXISTS kashish_movies (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      event_id BIGINT UNSIGNED NOT NULL,
      kashish_movie_id VARCHAR(64) NOT NULL,
      title VARCHAR(255) NOT NULL,
      category_name VARCHAR(255) NULL,
      sub_category_name VARCHAR(255) NULL,
      screening VARCHAR(255) NULL,
      is_nominated TINYINT(1) NOT NULL DEFAULT 0,
      is_shown TINYINT(1) NOT NULL DEFAULT 0,
      poster_url TEXT NULL,
      kashish_updated_at DATETIME NULL,
      fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_kashish_movie (event_id, kashish_movie_id),
      KEY idx_kashish_movies_event (event_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log('[Migration 028] ✓ kashish_movies ready.');
  console.log('[Migration 028] Completed.');
}

async function down() {
  await query('DROP TABLE IF EXISTS kashish_movies');
}

module.exports = { up, down };

if (require.main === module) {
  up().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
}
