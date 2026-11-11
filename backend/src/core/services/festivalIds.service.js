/**
 * Festival id mapping for the shared saas_* tables.
 *
 * FestiPlus works per event (`events.event_id`, the X-Event-Id header). The shared Freecomers
 * tables (saas_qr, saas_attendees, saas_checkins …) also have a `festival_id` column, which
 * Laravel and festease_backend fill with **film_festivals.film_festival_id**: a different id.
 * Example: KASHISH x BENGALURU 2026 is event 40 but film festival 29.
 *
 * Rules:
 *   - Filter saas_* rows by `event_id` only. Never `event_id = ? OR festival_id = ?` with the
 *     same value: the two ids live in different number spaces, so that matches other festivals.
 *   - When inserting, write `festival_id` from getFilmFestivalId(eventId).
 */

const { query } = require('../../config/database');

const TTL_MS = 10 * 60 * 1000;
const cache = new Map(); // eventId -> { id, at }

/** film_festivals.film_festival_id for an event, or null when the event has no film festival row. */
async function getFilmFestivalId(eventId) {
  const key = Number(eventId);
  if (!Number.isFinite(key) || key <= 0) return null;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.id;
  const rows = await query(
    'SELECT film_festival_id FROM film_festivals WHERE event_id = ? AND is_deleted = 0 ORDER BY film_festival_id LIMIT 1',
    [key]
  );
  const id = rows.length ? Number(rows[0].film_festival_id) : null;
  cache.set(key, { id, at: Date.now() });
  return id;
}

module.exports = { getFilmFestivalId };
