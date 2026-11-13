/**
 * Migration 025: clear days saved on non-Day passes (docs/adr/0006-festiplus-delegate-confirmation-email.md)
 *
 * Switching a delegate from Day Pass to Full-Festival Pass in FestiPlus used to keep the old days
 * in saas_attendees.custom_data.pass_days, so the public confirmation showed e.g. "Valid days:
 * Nov 21st" on a full pass. Only a Day Pass (any pass_type containing "Day Pass") keeps days;
 * this sets pass_days to [] on every other pass, which is what Laravel itself saves.
 *
 * Data only (JSON inside custom_data); no schema change to the shared table. Idempotent.
 */

const { query } = require('../src/config/database');

async function up() {
  console.log('[Migration 025] Clear stale pass days: starting...');
  const result = await query(`
    UPDATE saas_attendees
       SET custom_data = JSON_SET(custom_data, '$.pass_days', JSON_ARRAY())
     WHERE custom_data IS NOT NULL
       AND JSON_VALID(custom_data)
       AND JSON_UNQUOTE(JSON_EXTRACT(custom_data, '$.pass_type')) IS NOT NULL
       AND JSON_UNQUOTE(JSON_EXTRACT(custom_data, '$.pass_type')) <> ''
       AND LOWER(TRIM(JSON_UNQUOTE(JSON_EXTRACT(custom_data, '$.pass_type')))) NOT LIKE '%day pass%'
       AND JSON_TYPE(JSON_EXTRACT(custom_data, '$.pass_days')) = 'ARRAY'
       AND JSON_LENGTH(JSON_EXTRACT(custom_data, '$.pass_days')) > 0
  `);
  console.log(`[Migration 025] ✓ ${result.affectedRows || 0} delegates fixed. Completed.`);
}

async function down() { /* not reversible: the old days were wrong */ }

module.exports = { up, down };

if (require.main === module) {
  up().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
}
