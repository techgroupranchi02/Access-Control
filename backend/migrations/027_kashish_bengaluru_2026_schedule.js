/**
 * Migration 027: KASHISH x BENGALURU 2026 schedule (docs/adr/0004-kashish-external-leaderboard.md, Amendments 3 and 5)
 *
 * Data, not schema. Applies migrations/data/kashish-bengaluru-2026-schedule.json to every festival whose
 * Voting Rules carry that file's Kashish event ID (audience_settings.settings_json.kashish_event_id), so no
 * festival id is written here and dev and production each find their own festival.
 *
 * The work is done by src/core/services/scheduleSeed.service.js, which also runs when the Kashish event ID
 * is saved in Voting Rules and from Screenings › Import films from Kashish: if the ID is set after this
 * deploy, the schedule still arrives. Each show and film link is applied once (data_seed_log), so staff
 * edits are kept. Stored Kashish votes are re-checked when anything changed.
 *
 * Our own tables only (not shared with Freecomers). Idempotent: Jenkins runs it on every deploy.
 */

const path = require('path');
const scheduleSeed = require('../src/core/services/scheduleSeed.service');

const DATA_FILE = path.join(__dirname, 'data', 'kashish-bengaluru-2026-schedule.json');

async function up() {
  console.log('[Migration 027] KASHISH x BENGALURU 2026 schedule: starting...');
  const data = scheduleSeed.readScheduleFile(DATA_FILE);
  await scheduleSeed.ensureSeedLog();

  const events = await scheduleSeed.eventsForKashishEvent(data.kashish_event_id);
  if (!events.length) {
    console.log(`[Migration 027] No festival has Kashish event ID ${data.kashish_event_id} in Voting Rules yet; it is applied when that ID is saved.`);
    return;
  }

  for (const eventId of events) {
    const { changed, pending, created } = await scheduleSeed.applySchedule(data, eventId);
    created.forEach((c) => console.log(`[Migration 027]   + show ${c}`));
    console.log(`[Migration 027] ✓ festival ${eventId}: ${changed} change(s); ${pending} film(s) still without a Kashish movie ID.`);
    if (changed) {
      try {
        const { syncExternalVotes } = require('../src/core/services/kashishExternalVotes.service');
        await syncExternalVotes(eventId, { fetch: false });
        console.log(`[Migration 027] ✓ festival ${eventId}: stored Kashish votes re-checked.`);
      } catch (err) {
        console.log(`[Migration 027] Vote re-check skipped (${err.message}); the next sync re-checks them.`);
      }
    }
  }
  console.log('[Migration 027] Completed.');
}

async function down() { /* data seed; shows and links are edited in Settings › Audience › Screenings */ }

module.exports = { up, down };

if (require.main === module) {
  up().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
}
