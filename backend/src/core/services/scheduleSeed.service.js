/**
 * Festival schedule seeds (docs/adr/0004-kashish-external-leaderboard.md, Amendments 3 and 5)
 *
 * A schedule file in backend/migrations/data/*.json (seed_key, kashish_event_id, shows[]) is applied to
 * every festival whose Voting Rules carry that file's Kashish event ID. No festival id is written anywhere.
 *
 * - A show (matched by date + start time) is created if missing; an existing one gets the file's type and
 *   Audience Choice voting flag.
 * - Each film with a Kashish movie ID is linked to its show.
 * - Every show and film link is applied once and recorded in data_seed_log, so later edits in
 *   Settings › Audience › Screenings are never undone, while IDs added to the file later are linked.
 *
 * Applied by migration 027 on deploy, when the Kashish event ID is saved in Voting Rules, and by
 * Screenings › Import films from Kashish, so the result doesn't depend on which happened first.
 * Our own tables only.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { query } = require('../../config/database');

const DATA_DIR = path.resolve(__dirname, '../../../migrations/data');
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

/** Throws when a schedule file is malformed. */
function validate(data) {
  if (!data || typeof data.seed_key !== 'string' || !data.seed_key) throw new Error('seed_key is missing');
  if (typeof data.kashish_event_id !== 'string' || !data.kashish_event_id) throw new Error('kashish_event_id is missing');
  if (!Array.isArray(data.shows)) throw new Error('shows is missing');
  data.shows.forEach((s, i) => {
    if (!DATE_RE.test(s.date) || !TIME_RE.test(s.start) || !TIME_RE.test(s.end)) throw new Error(`show ${i + 1}: date/start/end`);
    if (!s.title || !SHOW_TYPES.includes(s.type)) throw new Error(`show ${i + 1}: title/type`);
    (s.films || []).forEach((f) => {
      if (f.kashish_movie_id !== null && !MOVIE_ID_RE.test(String(f.kashish_movie_id))) throw new Error(`show ${i + 1}: bad Kashish movie ID ${f.kashish_movie_id}`);
    });
  });
}

/** Read and validate one schedule file. */
function readScheduleFile(file) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  validate(data);
  return data;
}

/** Every valid schedule file in migrations/data (a broken file is logged and skipped). */
function listScheduleFiles() {
  let names = [];
  try { names = fs.readdirSync(DATA_DIR).filter((n) => n.endsWith('.json')); } catch { return []; }
  const files = [];
  for (const name of names) {
    try {
      files.push(readScheduleFile(path.join(DATA_DIR, name)));
    } catch (err) {
      console.warn(`[ScheduleSeed] ${name} skipped: ${err.message}`);
    }
  }
  return files;
}

const findShow = async (eventId, show) => (await query(
  `SELECT id FROM screening_blocks WHERE event_id = ? AND screening_date = ? AND TIME_FORMAT(start_time, '%H:%i') = ? ORDER BY id LIMIT 1`,
  [eventId, show.date, show.start]
))[0] || null;

/**
 * Apply one schedule to one festival (each item once).
 * @returns {Promise<{ changed: number, pending: number, created: string[] }>}
 */
async function applySchedule(data, eventId) {
  await ensureSeedLog();
  const done = new Set((await query('SELECT item_key FROM data_seed_log WHERE seed_key = ? AND event_id = ?', [data.seed_key, eventId])).map((r) => r.item_key));
  const mark = (itemKey) => query('INSERT IGNORE INTO data_seed_log (seed_key, event_id, item_key) VALUES (?, ?, ?)', [data.seed_key, eventId, itemKey]);
  let changed = 0;
  let pending = 0;
  const created = [];

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
        created.push(`${s.date} ${s.start} ${s.title}`);
      }
      await mark(showKey);
      changed++;
    }

    for (const f of s.films || []) {
      if (!f.kashish_movie_id) { pending++; continue; }
      const filmKey = `film:${s.date} ${s.start}:${f.kashish_movie_id}`;
      if (done.has(filmKey)) continue;
      const block = await findShow(eventId, s);
      if (block) { // a show staff deleted stays deleted
        await query(
          'INSERT IGNORE INTO screening_block_kashish_films (event_id, screening_block_id, kashish_movie_id, kashish_movie_title) VALUES (?, ?, ?, ?)',
          [eventId, block.id, String(f.kashish_movie_id), String(f.title || '').slice(0, 255)]
        );
      }
      await mark(filmKey);
      changed++;
    }
  }
  return { changed, pending, created };
}

/** Festivals whose Voting Rules carry this Kashish event ID. */
async function eventsForKashishEvent(kashishEventId) {
  const rows = await query(
    `SELECT event_id FROM audience_settings WHERE JSON_UNQUOTE(JSON_EXTRACT(settings_json, '$.kashish_event_id')) = ?`,
    [kashishEventId]
  );
  return rows.map((r) => r.event_id);
}

/**
 * Apply every schedule file whose Kashish event ID matches this festival's Voting Rules.
 * @returns {Promise<{ files: number, changed: number, pending: number, created: string[] }>}
 */
async function applySchedulesForEvent(eventId) {
  const rows = await query('SELECT settings_json FROM audience_settings WHERE event_id = ? LIMIT 1', [eventId]);
  let settings = rows[0]?.settings_json || {};
  if (typeof settings === 'string') { try { settings = JSON.parse(settings); } catch { settings = {}; } }
  const kashishEventId = typeof settings.kashish_event_id === 'string' ? settings.kashish_event_id.trim() : '';
  const total = { files: 0, changed: 0, pending: 0, created: [] };
  if (!kashishEventId) return total;
  for (const data of listScheduleFiles().filter((d) => d.kashish_event_id === kashishEventId)) {
    const r = await applySchedule(data, eventId);
    total.files++;
    total.changed += r.changed;
    total.pending += r.pending;
    total.created.push(...r.created);
  }
  return total;
}

module.exports = { readScheduleFile, listScheduleFiles, applySchedule, applySchedulesForEvent, eventsForKashishEvent, ensureSeedLog, DATA_DIR };
