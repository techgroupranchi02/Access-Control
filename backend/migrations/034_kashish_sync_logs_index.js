/**
 * Migration 034: index for the Kashish sync log (API review D5).
 *
 * kashish_sync_logs gets a row on every automatic Kashish sync (every few minutes while voting is open) and
 * had only its primary key, so "last sync for this festival" (WHERE event_id = ? ORDER BY started_at /
 * completed_at) read the whole table. Adds (event_id, started_at). Additive and idempotent; Access-Control
 * table only. The D5 indexes on Freecomers tables (events, film_festivals, saas_qr) are left to their owners.
 */

const { query } = require('../src/config/database');

async function hasIndex(table, name) {
  const rows = await query(
    'SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1',
    [table, name]
  );
  return rows.length > 0;
}

async function tableExists(table) {
  const rows = await query('SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1', [table]);
  return rows.length > 0;
}

async function up() {
  console.log('[Migration 034] Kashish sync log index: starting...');
  if (!(await tableExists('kashish_sync_logs'))) {
    console.log('[Migration 034] • kashish_sync_logs does not exist, skipped');
  } else if (await hasIndex('kashish_sync_logs', 'idx_ksl_event_started')) {
    console.log('[Migration 034] • idx_ksl_event_started already exists');
  } else {
    await query('ALTER TABLE kashish_sync_logs ADD INDEX idx_ksl_event_started (event_id, started_at)');
    console.log('[Migration 034] ✓ Added kashish_sync_logs.idx_ksl_event_started (event_id, started_at)');
  }
  console.log('[Migration 034] ✓ Completed.');
}

async function down() {
  try { await query('ALTER TABLE kashish_sync_logs DROP INDEX idx_ksl_event_started'); } catch (e) { }
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
