/**
 * Migration 027: KASHISH x BENGALURU 2026 schedule (docs/adr/0004-kashish-external-leaderboard.md, Amendment 2)
 *
 * Data, not schema. Reads migrations/data/kashish-bengaluru-2026-schedule.json and applies it to every
 * festival whose Voting Rules carry that file's Kashish event ID (audience_settings.settings_json.kashish_event_id),
 * so no festival id is written here and dev and production each find their own festival.
 *
 * - A show (matched by date + start time) is created if missing; an existing one gets the file's type and
 *   Audience Choice voting flag (only the short films are in the vote).
 * - Each film with a Kashish movie ID is linked to its show; films still without an ID are skipped.
 * - Every show and film link is applied once and recorded in data_seed_log (our own table), so later
 *   edits in Settings › Audience › Screenings are never undone by the next deploy, while IDs added to the
 *   file later are linked on the next run.
 * - Stored Kashish votes are re-checked when anything changed.
 *
 * Our own tables only (not shared with Freecomers). Idempotent: Jenkins runs it on every deploy.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { query } = require('../src/config/database');

const DATA_FILE = path.join(__dirname, 'data', 'kashish-bengaluru-2026-schedule.json');
const SHOW_TYPES = ['feature', 'short_block', 'panel', 'gala'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const MOVIE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

async function ensureSeedLog() {
  await query(`
    CREATE TABLE IF NOT EXISTS data_seed_log (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      seed_key VARCHAR(100) NOT NULL,
      event_id BIGINT UNSIGNED NOT NULL,
      item_key VARCHAR(255) NOT NULL,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_seed_item (seed_key, event_id, item_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function applied(seedKey, eventId) {
  const rows = await query('SELECT item_key FROM data_seed_log WHERE seed_key = ? AND event_id = ?', [seedKey, eventId]);
  return new Set(rows.map((r) => r.item_key));
}

const markApplied = (seedKey, eventId, itemKey) =>
  query('INSERT IGNORE INTO data_seed_log (seed_key, event_id, item_key) VALUES (?, ?, ?)', [seedKey, eventId, itemKey]);

const findShow = async (eventId, show) => (await query(
  `SELECT id FROM screening_blocks WHERE event_id = ? AND screening_date = ? AND TIME_FORMAT(start_time, '%H:%i') = ? ORDER BY id LIMIT 1`,
  [eventId, show.date, show.start]
))[0] || null;

function validate(data) {
  if (!data || typeof data.seed_key !== 'string' || !data.seed_key) throw new Error('seed_key is missing');
  if (typeof data.kashish_event_id !== 'string' || !data.kashish_event_id) throw new Error('kashish_event_id is missing');
  (data.shows || []).forEach((s, i) => {
    if (!DATE_RE.test(s.date) || !TIME_RE.test(s.start) || !TIME_RE.test(s.end)) throw new Error(`show ${i + 1}: date/start/end`);
    if (!s.title || !SHOW_TYPES.includes(s.type)) throw new Error(`show ${i + 1}: title/type`);
    (s.films || []).forEach((f) => {
      if (f.kashish_movie_id !== null && !MOVIE_ID_RE.test(String(f.kashish_movie_id))) throw new Error(`show ${i + 1}: bad Kashish movie ID ${f.kashish_movie_id}`);
    });
  });
}

async function applyToEvent(data, eventId) {
  const done = await applied(data.seed_key, eventId);
  let changed = 0;
  let pending = 0;
  for (const s of data.shows) {
    const showKey = `show:${s.date} ${s.start}`;
    if (!done.has(showKey)) {
      const existing = await findShow(eventId, s);
      if (existing) {
        await query('UPDATE screening_blocks SET block_type = ?, voting_enabled = ? WHERE id = ? AND event_id = ?',
          [s.type, s.voting ? 1 : 0, existing.id, eventId]);
      } else {
        await query(`
          INSERT INTO screening_blocks (event_id, venue_id, title, block_type, voting_enabled, screening_date, start_time, end_time, qr_token, voting_status)
          VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, 'pending')
        `, [eventId, s.title, s.type, s.voting ? 1 : 0, s.date, s.start, s.end, 'sb_' + crypto.randomBytes(8).toString('hex')]);
        console.log(`[Migration 027]   + show ${s.date} ${s.start} ${s.title}`);
      }
      await markApplied(data.seed_key, eventId, showKey);
      changed++;
    }

    for (const f of s.films || []) {
      if (!f.kashish_movie_id) { pending++; continue; }
      const filmKey = `film:${s.date} ${s.start}:${f.kashish_movie_id}`;
      if (done.has(filmKey)) continue;
      const block = await findShow(eventId, s);
      if (block) {
        await query(
          'INSERT IGNORE INTO screening_block_kashish_films (event_id, screening_block_id, kashish_movie_id, kashish_movie_title) VALUES (?, ?, ?, ?)',
          [eventId, block.id, String(f.kashish_movie_id), String(f.title || '').slice(0, 255)]
        );
        console.log(`[Migration 027]   + ${f.title} → ${s.title}`);
      } // a show staff deleted stays deleted
      await markApplied(data.seed_key, eventId, filmKey);
      changed++;
    }
  }
  return { changed, pending };
}

async function up() {
  console.log('[Migration 027] KASHISH x BENGALURU 2026 schedule: starting...');
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  validate(data);
  await ensureSeedLog();

  const events = await query(
    `SELECT event_id FROM audience_settings WHERE JSON_UNQUOTE(JSON_EXTRACT(settings_json, '$.kashish_event_id')) = ?`,
    [data.kashish_event_id]
  );
  if (!events.length) {
    console.log(`[Migration 027] No festival has Kashish event ID ${data.kashish_event_id} in Voting Rules yet; nothing to do.`);
    return;
  }

  for (const { event_id: eventId } of events) {
    const { changed, pending } = await applyToEvent(data, eventId);
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
