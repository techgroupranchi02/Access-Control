/**
 * Migration 033: create the two tables the API needs that no migration created (API review D2).
 *
 * - delegate_reviews: delegates' film reviews (/api/public/films/:filmId/reviews, review moderation).
 *   Listed with the shared Freecomers tables in CLAUDE.md; CREATE TABLE IF NOT EXISTS never touches an
 *   existing table, so this only matters on a fresh database.
 * - event_module_settings: the "Format B" module settings (/api/modules/:moduleKey/settings). It was only
 *   created by backend/scripts/migrate_format_b_settings.js, which the runner doesn't run.
 *
 * Definitions copied from the dev database (SHOW CREATE TABLE), without a foreign key to the shared `events`
 * table (API review D7) and without the redundant (event_id, module_id) index (D6). Additive and idempotent.
 */

const { query } = require('../src/config/database');

async function tableExists(table) {
  const rows = await query('SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1', [table]);
  return rows.length > 0;
}

const TABLES = {
  delegate_reviews: `
    CREATE TABLE IF NOT EXISTS delegate_reviews (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      event_id BIGINT UNSIGNED NOT NULL,
      film_id BIGINT UNSIGNED NOT NULL,
      attendee_id BIGINT UNSIGNED NOT NULL,
      review_text TEXT NOT NULL,
      review_stars TINYINT UNSIGNED DEFAULT NULL,
      is_anonymous TINYINT(1) DEFAULT '0',
      status ENUM('pending','approved','rejected') DEFAULT 'pending',
      moderated_by_user_id BIGINT UNSIGNED DEFAULT NULL,
      moderated_at TIMESTAMP NULL DEFAULT NULL,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_event_film_attendee (event_id, film_id, attendee_id),
      KEY idx_film_status (film_id, status),
      KEY idx_event_status (event_id, status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  event_module_settings: `
    CREATE TABLE IF NOT EXISTS event_module_settings (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      event_id BIGINT UNSIGNED NOT NULL,
      module_id INT NOT NULL,
      setting_key VARCHAR(100) NOT NULL,
      setting_value JSON NOT NULL,
      updated_by_user_id BIGINT UNSIGNED DEFAULT NULL,
      updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_event_module_setting (event_id, module_id, setting_key),
      KEY module_id (module_id),
      CONSTRAINT fk_ems_module FOREIGN KEY (module_id) REFERENCES modules (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
};

async function up() {
  console.log('[Migration 033] Delegate reviews and module settings tables: starting...');
  for (const [table, ddl] of Object.entries(TABLES)) {
    if (await tableExists(table)) { console.log(`[Migration 033] • ${table} already exists`); continue; }
    await query(ddl);
    console.log(`[Migration 033] ✓ Created ${table}`);
  }
  console.log('[Migration 033] ✓ Completed.');
}

async function down() {
  // Never drop these: they hold staff and delegate data.
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
