/**
 * Migration 020: correct saas_qr / saas_attendees.festival_id written by FestiPlus
 *
 * FestiPlus used to store the event id in `festival_id`. Laravel and festease_backend store
 * film_festivals.film_festival_id there (event 40 = film festival 29). This rewrites only rows
 * with the FestiPlus mistake: festival_id = event_id while the event's film festival id differs.
 * Rows written by the other services are untouched; updated_at is preserved. Idempotent.
 * See core/services/festivalIds.service.js.
 */

const { query } = require('../src/config/database');

const TABLES = ['saas_qr', 'saas_attendees'];

async function up() {
  console.log('[Migration 020] festival_id correction: starting...');
  for (const table of TABLES) {
    const result = await query(`
      UPDATE ${table} t
      JOIN (
        SELECT event_id, MIN(film_festival_id) AS ff_id
        FROM film_festivals WHERE is_deleted = 0 GROUP BY event_id
      ) ff ON ff.event_id = t.event_id
      SET t.festival_id = ff.ff_id, t.updated_at = t.updated_at -- keep the row's real last-change time
      WHERE t.festival_id = t.event_id AND ff.ff_id <> t.event_id
    `);
    console.log(`[Migration 020] ✓ ${table}: corrected ${result.affectedRows || 0} rows`);
  }
  console.log('[Migration 020] ✓ Completed.');
}

async function down() {
  // Not reversible: the old values were wrong.
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
