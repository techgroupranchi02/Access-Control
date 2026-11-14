/**
 * Shows and their attendance windows (docs/adr/0004-kashish-external-leaderboard.md, Amendment 2).
 *
 * A show is a screening_blocks row (date, start, end). Its attendance window runs from
 * `before` minutes before the start to `endBefore` minutes before the end; both come from the
 * festival's Voting Rules (settings_json.attendance_window_before_min / _end_before_min, default 15).
 * Example: a 1:00–2:00 PM show with 15 / 15 → 12:45–1:45 PM. When a show is delayed, staff edit its
 * times and the window moves with it.
 *
 * Times are the festival's local wall-clock times (DATE + TIME columns), read in the server's time
 * zone, which must be the festival's (IST for KASHISH). Scan times (TIMESTAMP) and vote times
 * (DATETIME written from JS Dates) come back as real instants, so all three compare directly.
 */

const { query } = require('../../config/database');

const DEFAULT_BEFORE_MIN = 15;
const DEFAULT_END_BEFORE_MIN = 15;
const MAX_OFFSET_MIN = 180;

function parseJson(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { return {}; }
}

function offset(value, fallback) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= MAX_OFFSET_MIN ? n : fallback;
}

/** The festival's window offsets in minutes: { before, endBefore }. */
async function getWindowSettings(eventId) {
  const rows = await query('SELECT settings_json FROM audience_settings WHERE event_id = ? LIMIT 1', [eventId]);
  const s = parseJson(rows[0]?.settings_json);
  return {
    before: offset(s.attendance_window_before_min, DEFAULT_BEFORE_MIN),
    endBefore: offset(s.attendance_window_end_before_min, DEFAULT_END_BEFORE_MIN)
  };
}

/** 'YYYY-MM-DD' + 'HH:MM[:SS]' as a local Date, or null. */
function localDate(date, time) {
  if (!date || !time) return null;
  const d = typeof date === 'string' ? date.slice(0, 10) : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const t = String(time).slice(0, 8);
  const parsed = new Date(`${d}T${t.length === 5 ? `${t}:00` : t}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * The show's start, end and attendance window as Dates.
 * An end at or before the start is taken as running past midnight.
 */
function windowOf(block, settings) {
  const start = localDate(block.screening_date, block.start_time);
  let end = localDate(block.screening_date, block.end_time);
  if (!start || !end) return null;
  if (end <= start) end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
  const opens = new Date(start.getTime() - settings.before * 60000);
  let closes = new Date(end.getTime() - settings.endBefore * 60000);
  if (closes <= opens) closes = new Date(opens.getTime() + 60000); // very short show: keep a minimum window
  return { start, end, opens, closes };
}

const inWindow = (w, at) => Boolean(w && at && at >= w.opens && at <= w.closes);

/**
 * Every show of the festival with its window and Kashish films, earliest first.
 * @returns {Promise<{settings, shows: Array<{id, title, block_type, voting_enabled, screening_date, start_time, end_time, venue_id, window, kashish_films: Array<{id, title}>}>}>}
 */
async function listShows(eventId) {
  const settings = await getWindowSettings(eventId);
  const blocks = await query(`
    SELECT id, title, block_type, voting_enabled, venue_id,
           DATE_FORMAT(screening_date, '%Y-%m-%d') AS screening_date,
           TIME_FORMAT(start_time, '%H:%i') AS start_time,
           TIME_FORMAT(end_time, '%H:%i') AS end_time
    FROM screening_blocks WHERE event_id = ?
    ORDER BY screening_date ASC, start_time ASC, id ASC
  `, [eventId]);
  const films = await query(
    'SELECT screening_block_id, kashish_movie_id, kashish_movie_title FROM screening_block_kashish_films WHERE event_id = ? ORDER BY id',
    [eventId]
  );
  const byBlock = new Map();
  films.forEach((f) => {
    if (!byBlock.has(f.screening_block_id)) byBlock.set(f.screening_block_id, []);
    byBlock.get(f.screening_block_id).push({ id: f.kashish_movie_id, title: f.kashish_movie_title });
  });
  const shows = blocks.map((b) => ({
    ...b,
    voting_enabled: Number(b.voting_enabled) === 1,
    window: windowOf(b, settings),
    kashish_films: byBlock.get(b.id) || []
  }));
  return { settings, shows };
}

/** The show whose window contains `at`, else the next one to open, else the last one (for the scanner's default). */
function currentShow(shows, at = new Date()) {
  const timed = shows.filter((s) => s.window);
  return timed.find((s) => inWindow(s.window, at))
    || timed.find((s) => s.window.opens > at)
    || timed[timed.length - 1]
    || shows[0]
    || null;
}

/** Window as JSON for the API: ISO instants plus local HH:MM labels. */
function windowJson(w) {
  if (!w) return null;
  const hm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return { opens_at: w.opens.toISOString(), closes_at: w.closes.toISOString(), opens: hm(w.opens), closes: hm(w.closes) };
}

module.exports = { getWindowSettings, windowOf, inWindow, listShows, currentShow, windowJson, localDate, DEFAULT_BEFORE_MIN, DEFAULT_END_BEFORE_MIN, MAX_OFFSET_MIN };
