/**
 * Kashish films catalog (docs/adr/0004-kashish-external-leaderboard.md, Amendment 4)
 *
 * refreshCatalog(): copies the festival's films from the Kashish Movies API into kashish_movies.
 * autoLinkFilms():  links each catalog film that is on no show yet to the show it plays in, matched by
 *                   the film's Kashish screening slot ("Friday Nov 20, 2.00 PM | NGMA ...") against the
 *                   show's date and start time, else by the Kashish show name (sub-category) or, for a
 *                   feature shown on its own, the film title. It only adds links; staff links are kept.
 */

const { query } = require('../../config/database');
const { fetchKashishMovies } = require('./kashish-api.service');
const { getVotingConfig } = require('./kashishExternalVotes.service');

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const NO_SUB_CATEGORY = 'no sub category';

/** Same rules as ScreeningsEditor's norm(): lower case, no bracketed alternate titles, words only. */
const norm = (t) => String(t || '').toLowerCase().replace(/\([^)]*\)/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/** "Friday Nov 20, 2.00 PM | NGMA" → { md: '11-20', time: '14:00' }, or null when it can't be read. */
function parseScreening(text) {
  const m = /([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{1,2})(?:[.:](\d{2}))?\s*([AP])\.?M/i.exec(String(text || ''));
  if (!m) return null;
  const month = MONTHS.indexOf(m[1].toLowerCase());
  if (month < 0) return null;
  let hour = parseInt(m[3], 10) % 12;
  if (m[5].toUpperCase() === 'P') hour += 12;
  const pad = (n) => String(n).padStart(2, '0');
  return { md: `${pad(month + 1)}-${pad(parseInt(m[2], 10))}`, time: `${pad(hour)}:${m[4] || '00'}` };
}

const toDate = (iso) => {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
};

/**
 * Fetch the festival's films from Kashish and store them.
 * @returns {Promise<{ total: number, added: number, removed: number, syncedAt: string|null }>}
 */
async function refreshCatalog(eventId) {
  const { kashishEventId } = await getVotingConfig(eventId);
  if (!kashishEventId) {
    const err = new Error('Set the Kashish event ID in Settings › Audience › Voting Rules first.');
    err.status = 400;
    throw err;
  }
  const { movies, syncedAt } = await fetchKashishMovies(null, { eventId: kashishEventId });
  const before = new Set((await query('SELECT kashish_movie_id FROM kashish_movies WHERE event_id = ?', [eventId])).map((r) => r.kashish_movie_id));

  const seen = new Set();
  for (const m of movies) {
    const id = String(m.id || '').slice(0, 64);
    if (!id || !m.title || seen.has(id)) continue;
    seen.add(id);
    await query(`
      INSERT INTO kashish_movies (event_id, kashish_movie_id, title, category_name, sub_category_name, screening, is_nominated, is_shown, poster_url, kashish_updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE title = VALUES(title), category_name = VALUES(category_name), sub_category_name = VALUES(sub_category_name),
        screening = VALUES(screening), is_nominated = VALUES(is_nominated), is_shown = VALUES(is_shown), poster_url = VALUES(poster_url),
        kashish_updated_at = VALUES(kashish_updated_at), fetched_at = CURRENT_TIMESTAMP
    `, [
      eventId, id, String(m.title).slice(0, 255),
      (m.categoryName || m.category || null)?.slice(0, 255) ?? null,
      (m.subCategoryName || m.subCategory || null)?.slice(0, 255) ?? null,
      (m.screening || null)?.slice(0, 255) ?? null,
      m.is_nominated ? 1 : 0, m.is_shown ? 1 : 0,
      m.posterUrl || null, toDate(m.updatedAt)
    ]);
  }

  // Drop films Kashish no longer lists (never on an empty answer, which would wipe the catalog)
  const gone = seen.size ? [...before].filter((id) => !seen.has(id)) : [];
  for (const id of gone) {
    await query('DELETE FROM kashish_movies WHERE event_id = ? AND kashish_movie_id = ?', [eventId, id]);
  }
  return { total: seen.size, added: [...seen].filter((id) => !before.has(id)).length, removed: gone.length, syncedAt };
}

/** Catalog films of a festival: [{ id, title, show_name, category_name, screening }]. */
async function listCatalog(eventId) {
  const rows = await query(`
    SELECT kashish_movie_id AS id, title, sub_category_name, category_name, screening
    FROM kashish_movies WHERE event_id = ? ORDER BY title ASC
  `, [eventId]);
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    show_name: norm(r.sub_category_name) === NO_SUB_CATEGORY ? null : r.sub_category_name,
    category_name: r.category_name,
    screening: r.screening
  }));
}

/**
 * Link every catalog film that is on no show to its show (adds links only).
 * @returns {Promise<{ linked: Array<{id, title, show}>, unmatched: Array<{id, title, screening}> }>}
 */
async function autoLinkFilms(eventId) {
  const films = await query('SELECT kashish_movie_id AS id, title, sub_category_name, screening FROM kashish_movies WHERE event_id = ?', [eventId]);
  const linkedIds = new Set((await query('SELECT DISTINCT kashish_movie_id FROM screening_block_kashish_films WHERE event_id = ?', [eventId])).map((r) => r.kashish_movie_id));
  const shows = await query(`
    SELECT id, title, DATE_FORMAT(screening_date, '%m-%d') AS md, TIME_FORMAT(start_time, '%H:%i') AS start
    FROM screening_blocks WHERE event_id = ?
  `, [eventId]);

  const only = (list) => (list.length === 1 ? list[0] : null);
  const linked = [];
  const unmatched = [];
  for (const f of films) {
    if (linkedIds.has(f.id)) continue;
    const slot = parseScreening(f.screening);
    const sub = norm(f.sub_category_name);
    const byName = sub && sub !== NO_SUB_CATEGORY
      ? shows.filter((s) => norm(s.title) === sub)
      : shows.filter((s) => norm(s.title) && norm(s.title) === norm(f.title));
    const show = (slot && only(shows.filter((s) => s.md === slot.md && s.start === slot.time))) || only(byName);
    if (!show) {
      unmatched.push({ id: f.id, title: f.title, screening: f.screening });
      continue;
    }
    await query(
      'INSERT IGNORE INTO screening_block_kashish_films (event_id, screening_block_id, kashish_movie_id, kashish_movie_title) VALUES (?, ?, ?, ?)',
      [eventId, show.id, f.id, f.title]
    );
    linked.push({ id: f.id, title: f.title, show: show.title });
  }
  return { linked, unmatched };
}

module.exports = { refreshCatalog, listCatalog, autoLinkFilms, parseScreening };
