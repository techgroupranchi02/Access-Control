/**
 * Kashish Auto-Sync Scheduler (docs/adr/0003)
 *
 * Every KASHISH_SYNC_INTERVAL_SEC seconds (default 120; 0 disables), pulls Kashish votes for every
 * event that currently has a screening voting window OPEN, plus every festival whose votes come
 * from the Kashish app (voting_source = 'kashish') until a day after its voting period ends. Uses the same code path as the manual
 * "Sync Kashish votes" button (syncEventVotes), which holds a per-event lock, so runs never overlap.
 * Each run is recorded in kashish_sync_logs with synced_by_user_id = NULL (automatic).
 */

const { query } = require('../../config/database');

let timer = null;
let tickRunning = false;

async function tick() {
  if (tickRunning) return;
  tickRunning = true;
  try {
    // Lazy require avoids a circular import at startup (controller -> audience.controller -> ...)
    const { syncEventVotes } = require('../controllers/kashish-sync.controller');
    const { listKashishSyncEvents } = require('./kashishExternalVotes.service');
    const openWindowEvents = await query("SELECT DISTINCT event_id FROM screening_blocks WHERE voting_status = 'open'");
    // Festivals whose votes come from the Kashish app sync until a day after their voting period ends
    const eventIds = [...new Set([
      ...openWindowEvents.map(e => Number(e.event_id)),
      ...(await listKashishSyncEvents()).map(Number)
    ])];
    for (const eventId of eventIds) {
      try {
        const summary = await syncEventVotes(eventId, { userId: null });
        if (summary.mode === 'kashish') {
          if (summary.new_rows || summary.updated_rows) {
            console.log(`[KashishAutoSync] Event ${eventId} (Kashish films): ${summary.counted} counted of ${summary.total_fetched}, ${summary.new_rows} new, ${summary.updated_rows} changed`);
          }
        } else if (!summary.skipped && (summary.counted || summary.flagged_not_checked_in || summary.rejected_unregistered)) {
          console.log(`[KashishAutoSync] Event ${eventId}: +${summary.counted} counted, ${summary.flagged_not_checked_in} flagged, ${summary.rejected_unregistered} unregistered`);
        }
      } catch (err) {
        console.error(`[KashishAutoSync] Event ${eventId} sync failed:`, err.message);
      }
    }
  } catch (err) {
    console.error('[KashishAutoSync] Tick failed:', err.message);
  } finally {
    tickRunning = false;
  }
}

function startKashishAutoSync() {
  const seconds = parseInt(process.env.KASHISH_SYNC_INTERVAL_SEC ?? '120', 10);
  if (!seconds || seconds < 0) {
    console.log('[KashishAutoSync] Disabled (KASHISH_SYNC_INTERVAL_SEC=0).');
    return;
  }
  const intervalMs = Math.max(30, seconds) * 1000;
  timer = setInterval(tick, intervalMs);
  timer.unref();
  console.log(`[KashishAutoSync] Enabled: every ${intervalMs / 1000}s (open voting windows and Kashish-source festivals).`);
}

function stopKashishAutoSync() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { startKashishAutoSync, stopKashishAutoSync, tick };
