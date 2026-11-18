/**
 * Venues, whatever shape the `venues` table has.
 *
 * Migration 006 creates `venues` with CREATE TABLE IF NOT EXISTS, so on a database that already had a
 * `venues` table (production's shared Freecomers table) ours was never created and the columns differ:
 * production has no `venue_name` (2026-11-18: "Unknown column 'v.venue_name'" broke Settings › Audience ›
 * Screenings). The column names are read from information_schema once per process, and every venue read
 * goes through here. A table without a usable id or name column gives no venues instead of an error.
 */

const { query } = require('../../config/database');
const { getFilmFestivalId } = require('./festivalIds.service');

const CANDIDATES = {
  id: ['venue_id', 'id'],
  name: ['venue_name', 'name', 'title', 'venue', 'hall_name'],
  event: ['event_id'],
  festival: ['festival_id', 'film_festival_id'],
  capacity: ['capacity', 'seats', 'seating_capacity']
};

let columnsPromise = null;

/** { id, name, event, festival, capacity } column names (null when absent), or null without a usable table. */
function venueColumns() {
  if (!columnsPromise) {
    columnsPromise = query(
      `SELECT COLUMN_NAME AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'venues'`
    ).then((rows) => {
      const have = new Set(rows.map((r) => r.c));
      const pick = (list) => list.find((c) => have.has(c)) || null;
      const cols = Object.fromEntries(Object.entries(CANDIDATES).map(([k, list]) => [k, pick(list)]));
      if (!cols.id || !cols.name || !(cols.event || cols.festival)) {
        console.warn(`[Venues] venues table has no usable id/name/festival columns (found: ${[...have].join(', ') || 'no table'}); venues are not shown.`);
        return null;
      }
      return cols;
    }).catch((err) => {
      columnsPromise = null; // try again next time
      console.warn('[Venues] could not read the venues table:', err.message);
      return null;
    });
  }
  return columnsPromise;
}

/** WHERE clause + params scoping venues to a festival (event_id, else the film festival id). */
async function scope(cols, eventId) {
  if (cols.event) return { where: `\`${cols.event}\` = ?`, params: [eventId] };
  const filmFestivalId = await getFilmFestivalId(eventId);
  return filmFestivalId ? { where: `\`${cols.festival}\` = ?`, params: [filmFestivalId] } : null;
}

/** The festival's venues: [{ id, name, capacity, event_id }], by id. */
async function listEventVenues(eventId) {
  const cols = await venueColumns();
  if (!cols) return [];
  const s = await scope(cols, eventId);
  if (!s) return [];
  const capacity = cols.capacity ? `\`${cols.capacity}\`` : 'NULL';
  const rows = await query(
    `SELECT \`${cols.id}\` AS id, \`${cols.name}\` AS name, ${capacity} AS capacity FROM venues WHERE ${s.where} ORDER BY \`${cols.id}\` ASC`,
    s.params
  );
  return rows.map((r) => ({ id: r.id, name: r.name, capacity: r.capacity, event_id: eventId }));
}

/** Map of venue id → name for a festival. */
async function venueNameMap(eventId) {
  const venues = await listEventVenues(eventId);
  return new Map(venues.map((v) => [Number(v.id), v.name]));
}

/** True when the venue belongs to the festival. */
async function venueBelongsToEvent(eventId, venueId) {
  if (!Number.isInteger(venueId)) return false;
  return (await venueNameMap(eventId)).has(venueId);
}

module.exports = { venueColumns, listEventVenues, venueNameMap, venueBelongsToEvent };
