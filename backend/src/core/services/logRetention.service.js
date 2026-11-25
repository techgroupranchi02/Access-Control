/**
 * Log retention (API review D8).
 *
 * kashish_sync_logs gets a row on every automatic Kashish sync (every couple of minutes while voting is open),
 * so it grows without limit. Once a day this removes runs older than KASHISH_SYNC_LOG_RETENTION_DAYS (default
 * 90; 0 turns the clean-up off), but always keeps each festival's latest KASHISH_SYNC_LOG_KEEP_PER_EVENT runs
 * (default 50) so Sync status and the leaderboard export can still show the last sync of a festival that
 * hasn't synced for months. Deletes in batches so the table is never locked for long.
 *
 * qr_print_log is not trimmed: it is the badge print history staff look at, and it grows only when staff print.
 */

const { query } = require('../../config/database');
const env = require('../../config/environment');

const DAY_MS = 24 * 60 * 60 * 1000;
const FIRST_RUN_DELAY_MS = 5 * 60 * 1000; // after start-up has settled
const BATCH_SIZE = 5000;

let timer = null;
let running = false;

/**
 * Remove old Kashish sync log rows. Returns { deleted, wouldDelete } (wouldDelete with dryRun).
 * `table` exists only so tests can run against a copy; it must be kashish_sync_logs or a zz_tmp_ table.
 */
async function pruneKashishSyncLogs({
  days = env.kashishSyncLogRetentionDays,
  keepPerEvent = env.kashishSyncLogKeepPerEvent,
  dryRun = false,
  table = 'kashish_sync_logs'
} = {}) {
  if (table !== 'kashish_sync_logs' && !/^zz_tmp_[a-z_]+$/.test(table)) throw new Error('Unexpected table for log retention.');
  if (!days || days <= 0) return { deleted: 0, wouldDelete: 0, skipped: 'retention off' };
  const keep = Math.max(0, parseInt(keepPerEvent, 10) || 0);
  // Rows past the retention period that are not among their festival's latest `keep` runs
  const where = `started_at < NOW() - INTERVAL ? DAY
    AND id NOT IN (
      SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY event_id ORDER BY started_at DESC, id DESC) AS rn FROM \`${table}\`
      ) ranked WHERE rn <= ?
    )`;
  if (dryRun) {
    const [row] = await query(`SELECT COUNT(*) AS n FROM \`${table}\` WHERE ${where}`, [days, keep]);
    return { deleted: 0, wouldDelete: Number(row.n) };
  }
  let deleted = 0;
  for (;;) {
    const res = await query(`DELETE FROM \`${table}\` WHERE ${where} LIMIT ${BATCH_SIZE}`, [days, keep]);
    deleted += res.affectedRows;
    if (res.affectedRows < BATCH_SIZE) break;
  }
  return { deleted };
}

async function runOnce() {
  if (running) return;
  running = true;
  try {
    const { deleted, skipped } = await pruneKashishSyncLogs();
    if (skipped) return;
    if (deleted) console.log(`[LogRetention] Removed ${deleted} Kashish sync log row(s) older than ${env.kashishSyncLogRetentionDays} days (kept each festival's latest ${env.kashishSyncLogKeepPerEvent}).`);
  } catch (err) {
    console.error('[LogRetention] Clean-up failed:', err.message);
  } finally {
    running = false;
  }
}

/** Start the daily clean-up (called from app.js start()). */
function startLogRetention() {
  if (timer) return;
  if (!env.kashishSyncLogRetentionDays) {
    console.log('[LogRetention] Disabled (KASHISH_SYNC_LOG_RETENTION_DAYS=0).');
    return;
  }
  console.log(`[LogRetention] Kashish sync logs: keep ${env.kashishSyncLogRetentionDays} days (and each festival's latest ${env.kashishSyncLogKeepPerEvent} runs); checked daily.`);
  const first = setTimeout(() => { runOnce(); }, FIRST_RUN_DELAY_MS);
  first.unref?.();
  timer = setInterval(() => { runOnce(); }, DAY_MS);
  timer.unref?.();
}

module.exports = { pruneKashishSyncLogs, startLogRetention, runOnce };
