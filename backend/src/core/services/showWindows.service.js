/**
 * Shows and their attendance windows (docs/adr/0004-kashish-external-leaderboard.md, Amendment 2).
 *
 * A show is a screening_blocks row (date, start, end). Its attendance window runs from
 * `before` minutes before the start to `endBefore` minutes before the end; both come from the
 * festival's Voting Rules (settings_json.attendance_window_before_min / _end_before_min, default 15).
 * Example: a 1:00–2:00 PM show with 15 / 15 → 12:45–1:45 PM. When a show is delayed, staff edit its
 * times and the window moves with it.
 *
 * Times are the festival's local wall-clock times (DATE + TIME columns) in the FESTIVAL'S time zone:
 * settings_json.timezone (Settings › Audience › Screenings), else FESTIVAL_TIMEZONE, else the server's zone.
 * They used to be read in the server's zone only; production runs on UTC, so on 2026-11-20 every KASHISH
 * window was 5h30 late ("not open yet" during the show, every scan "Outside window"). Scan times (TIMESTAMP)
 * and vote times (DATETIME written from JS Dates) come back as real instants, so all three compare directly.
 */

const { query } = require('../../config/database');
const env = require('../../config/environment');

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

/** True for an IANA time zone this server knows (e.g. "Asia/Kolkata"). */
function isValidTimeZone(tz) {
  if (typeof tz !== 'string' || !tz.trim()) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz.trim() }); return true; } catch { return false; }
}

const serverTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

/** The festival's time zone: its own setting, else FESTIVAL_TIMEZONE, else the server's. */
function resolveTimeZone(settingsJson) {
  const s = parseJson(settingsJson);
  if (isValidTimeZone(s.timezone)) return s.timezone.trim();
  if (isValidTimeZone(env.festivalTimeZone)) return env.festivalTimeZone;
  return serverTimeZone();
}

/** The festival's window offsets in minutes and its time zone: { before, endBefore, timeZone }. */
async function getWindowSettings(eventId) {
  const rows = await query('SELECT settings_json FROM audience_settings WHERE event_id = ? LIMIT 1', [eventId]);
  const s = parseJson(rows[0]?.settings_json);
  return {
    before: offset(s.attendance_window_before_min, DEFAULT_BEFORE_MIN),
    endBefore: offset(s.attendance_window_end_before_min, DEFAULT_END_BEFORE_MIN),
    timeZone: resolveTimeZone(s)
  };
}

/** Wall-clock parts of an instant in a time zone. */
function zonedParts(at, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).formatToParts(at);
  const get = (type) => Number(parts.find((p) => p.type === type)?.value);
  return { y: get('year'), m: get('month'), d: get('day'), h: get('hour') % 24, mi: get('minute'), s: get('second') };
}

/** How far the zone's wall clock is ahead of UTC at an instant, in ms. */
function zoneOffsetMs(ts, timeZone) {
  const p = zonedParts(new Date(ts), timeZone);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(ts / 1000) * 1000;
}

/**
 * 'YYYY-MM-DD' + 'HH:MM[:SS]' wall-clock time in `timeZone` as a Date (a real instant), or null.
 * Without a zone: the server's zone.
 */
function localDate(date, time, timeZone = null) {
  if (!date || !time) return null;
  const d = typeof date === 'string' ? date.slice(0, 10) : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const t = String(time).slice(0, 8);
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  const tm = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(t);
  if (!dm || !tm) return null;
  if (!timeZone) {
    const parsed = new Date(`${d}T${t.length === 5 ? `${t}:00` : t}`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const wall = Date.UTC(+dm[1], +dm[2] - 1, +dm[3], +tm[1], +tm[2], +(tm[3] || 0));
  let utc = wall - zoneOffsetMs(wall, timeZone);
  const second = wall - zoneOffsetMs(utc, timeZone); // corrects across a DST change
  if (second !== utc) utc = second;
  const parsed = new Date(utc);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** "10:45 am" for an instant, in the festival's time zone. */
function clockLabel(at, timeZone) {
  return new Date(at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', ...(timeZone ? { timeZone } : {}) });
}

/** "20 Nov" for an instant, in the festival's time zone. */
function dayLabel(at, timeZone) {
  return new Date(at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', ...(timeZone ? { timeZone } : {}) });
}

/**
 * The show's start, end and attendance window as Dates.
 * An end at or before the start is taken as running past midnight.
 */
function windowOf(block, settings) {
  const timeZone = settings.timeZone || null;
  const start = localDate(block.screening_date, block.start_time, timeZone);
  let end = localDate(block.screening_date, block.end_time, timeZone);
  if (!start || !end) return null;
  if (end <= start) end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
  const opens = new Date(start.getTime() - settings.before * 60000);
  let closes = new Date(end.getTime() - settings.endBefore * 60000);
  if (closes <= opens) closes = new Date(opens.getTime() + 60000); // very short show: keep a minimum window
  return { start, end, opens, closes, timeZone };
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

/** Window as JSON for the API: ISO instants plus HH:MM labels in the festival's time zone. */
function windowJson(w) {
  if (!w) return null;
  const hm = (d) => {
    if (!w.timeZone) return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const p = zonedParts(d, w.timeZone);
    return `${String(p.h).padStart(2, '0')}:${String(p.mi).padStart(2, '0')}`;
  };
  return { opens_at: w.opens.toISOString(), closes_at: w.closes.toISOString(), opens: hm(w.opens), closes: hm(w.closes), time_zone: w.timeZone || null };
}

/**
 * Re-mark every stored scan of the festival valid / outside_window against its show's window as it stands now
 * (after a time zone, window or show-time change). Scans of a show without times are left alone.
 * @returns {Promise<{ checked: number, changed: number }>}
 */
async function recomputeScanStatus(eventId) {
  const { shows } = await listShows(eventId);
  const windows = new Map(shows.filter((sh) => sh.window).map((sh) => [Number(sh.id), sh.window]));
  const rows = await query('SELECT id, screening_block_id, scanned_at, scan_status FROM screening_checkins WHERE event_id = ?', [eventId]);
  const toValid = [];
  const toOutside = [];
  for (const r of rows) {
    const w = windows.get(Number(r.screening_block_id));
    if (!w) continue;
    const want = inWindow(w, new Date(r.scanned_at)) ? 'valid' : 'outside_window';
    if (want !== r.scan_status) (want === 'valid' ? toValid : toOutside).push(r.id);
  }
  for (const [status, ids] of [['valid', toValid], ['outside_window', toOutside]]) {
    for (let i = 0; i < ids.length; i += 500) {
      const part = ids.slice(i, i + 500);
      await query(`UPDATE screening_checkins SET scan_status = ? WHERE event_id = ? AND id IN (${part.map(() => '?').join(',')})`, [status, eventId, ...part]);
    }
  }
  return { checked: rows.length, changed: toValid.length + toOutside.length };
}

module.exports = {
  getWindowSettings, windowOf, inWindow, listShows, currentShow, windowJson, localDate, recomputeScanStatus,
  isValidTimeZone, resolveTimeZone, serverTimeZone, clockLabel, dayLabel,
  DEFAULT_BEFORE_MIN, DEFAULT_END_BEFORE_MIN, MAX_OFFSET_MIN
};
