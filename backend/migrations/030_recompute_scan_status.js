/**
 * Migration 030: re-mark stored scans against the festival's time zone (docs/adr/0004, Amendment 8)
 *
 * Show windows used to be read in the server's time zone. Production runs on UTC, so on 2026-11-20 every
 * KASHISH window was 5h30 late and every scan was stored as `outside_window`. Windows now use the festival's
 * time zone (set by migration 027 from the schedule file, or in Settings › Audience › Screenings), so this
 * re-marks each stored scan valid / outside_window against its show's window, then re-checks stored Kashish
 * votes. Idempotent: only rows whose status differs are updated; it is safe on every deploy.
 */

const { query } = require('../src/config/database');
const showWindows = require('../src/core/services/showWindows.service');

async function up() {
  console.log('[Migration 030] Re-marking stored scans against each festival\'s time zone: starting...');
  const events = await query('SELECT DISTINCT event_id FROM screening_checkins');
  for (const { event_id: eventId } of events) {
    const settings = await showWindows.getWindowSettings(eventId);
    const { checked, changed } = await showWindows.recomputeScanStatus(eventId);
    console.log(`[Migration 030] ✓ festival ${eventId} (${settings.timeZone}): ${changed} of ${checked} scan(s) re-marked.`);
    if (!changed) continue;
    try {
      const kashish = require('../src/core/services/kashishExternalVotes.service');
      if (await kashish.isKashishSource(eventId)) {
        await kashish.syncExternalVotes(eventId, { fetch: false });
        console.log(`[Migration 030] ✓ festival ${eventId}: stored Kashish votes re-checked.`);
      }
    } catch (err) {
      console.log(`[Migration 030] Vote re-check skipped (${err.message}); the next sync re-checks them.`);
    }
  }
  console.log('[Migration 030] Completed.');
}

async function down() { /* statuses follow the windows; nothing to undo */ }

module.exports = { up, down };

if (require.main === module) {
  up()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
