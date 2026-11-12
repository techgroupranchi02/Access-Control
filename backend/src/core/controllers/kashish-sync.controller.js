/**
 * Kashish Sync Controller
 * Synchronizes votes and mappings between Kashish external portal and Freecomers Audience Module
 * References: Doc 4 (API Integration Guide), Doc 5 (Scoring Guide)
 */

const { query } = require('../../config/database');
const { fetchAllKashishVotes } = require('../services/kashish-api.service');
const { recalculateScores } = require('./audience.controller');
const kashishExternal = require('../services/kashishExternalVotes.service');

function getEventId(req) {
  return req.headers['x-event-id'] ||
         req.headers['x-edition-id'] ||
         req.headers['x-festival-id'] ||
         req.query.eventId ||
         req.query.festivalId ||
         req.query.festival_id ||
         req.body?.eventId ||
         req.body?.festivalId ||
         1;
}

/**
 * Normalize title for fuzzy matching (lowercase, remove punctuation, collapse spaces)
 */
function normalizeTitle(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Per-event lock so the manual button and the auto-sync timer never run the same event concurrently
const runningEvents = new Set();

const RECEIPT_FINAL = new Set(['counted', 'duplicate']);

async function upsertReceipt(eventId, r) {
  await query(`
    INSERT INTO kashish_vote_receipts (
      event_id, kashish_vote_id, kashish_user_id, kashish_movie_id, film_id, attendee_id, qr_id,
      screening_block_id, vote_id, stars, source, voted_at, outcome, reason, payload
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      film_id = VALUES(film_id), attendee_id = VALUES(attendee_id), qr_id = VALUES(qr_id),
      screening_block_id = VALUES(screening_block_id), vote_id = VALUES(vote_id),
      outcome = VALUES(outcome), reason = VALUES(reason), last_evaluated_at = CURRENT_TIMESTAMP
  `, [
    eventId, r.kashishVoteId, r.kUserId, r.kMovieId, r.filmId || null, r.attendeeId || null, r.qrId || null,
    r.blockId || null, r.voteId || null, r.stars, r.source, r.votedAt, r.outcome, r.reason || null,
    JSON.stringify(r.payload || null)
  ]);
}

/**
 * Pulls all Kashish votes and processes them for one event (docs/adr/0003):
 *   - a vote counts only for a REGISTERED delegate (matched by email / phone; never auto-created)
 *     who is CHECKED IN at a screening containing that film (or, if the film is not scheduled in
 *     any screening block, checked in at any screening of the event);
 *   - every vote stores the delegate's badge (audience_votes.qr_id) and the Kashish timestamp;
 *   - every Kashish vote gets a receipt row, whatever the outcome; non-final outcomes are
 *     re-evaluated on each sync (e.g. late registration or late check-in).
 * Returns a summary object. Throws on API/DB failure.
 */
async function syncEventVotes(eventId, { userId = null, apiKey, source = 'scan', full = false } = {}) {
  eventId = parseInt(eventId, 10);
  if (runningEvents.has(eventId)) {
    return { skipped: true, reason: 'A sync for this event is already running.' };
  }
  runningEvents.add(eventId);
  let logId = null;

  try {
    const logRes = await query(`
      INSERT INTO kashish_sync_logs (event_id, sync_type, status, synced_by_user_id)
      VALUES (?, 'votes', 'running', ?)
    `, [eventId, userId]);
    logId = logRes.insertId;

    // Festivals whose films live only in the Kashish app (docs/adr/0004)
    if (await kashishExternal.isKashishSource(eventId)) {
      return await kashishExternal.syncExternalVotes(eventId, { apiKey, logId, full });
    }

    // Submissions-mapped festivals: full fetch, filtered to the festival's Kashish event when set
    const { kashishEventId } = await kashishExternal.getVotingConfig(eventId);
    const { votes } = await fetchAllKashishVotes(apiKey, { source, eventId: kashishEventId || undefined });

    // Existing receipts: skip votes already final
    const receiptRows = await query('SELECT kashish_vote_id, outcome FROM kashish_vote_receipts WHERE event_id = ?', [eventId]);
    const receiptOutcome = new Map(receiptRows.map(r => [r.kashish_vote_id, r.outcome]));

    // Movie mappings + title auto-match
    const movieMap = new Map();
    (await query('SELECT kashish_movie_id, freecomers_submission_id FROM kashish_movie_mappings WHERE event_id = ?', [eventId]))
      .forEach(m => movieMap.set(String(m.kashish_movie_id), m.freecomers_submission_id));
    const titleToSubMap = new Map();
    (await query('SELECT id, title FROM submissions WHERE event_id = ?', [eventId]))
      .forEach(sub => { const n = normalizeTitle(sub.title); if (n) titleToSubMap.set(n, sub.id); });

    // User mappings (only to real, registered delegates of this event)
    const userCache = { map: await kashishExternal.loadUserMappings(eventId), misses: new Set() };

    const badgeCache = new Map();
    const blocksForFilmCache = new Map();

    const counts = { counted: 0, not_checked_in: 0, unregistered: 0, unmapped_film: 0, duplicate: 0, already_final: 0, users_matched: 0 };
    const unmappedMovieInfo = new Map();

    for (const v of votes) {
      const kMovieId = String(v.movie?.id || v.movie?._id || '');
      const kMovieTitle = v.movie?.title || v.movie?.name || 'Untitled';
      const kUserId = String(v.user?.id || v.user?._id || '');
      const kashishVoteId = String(v.id || `${kUserId}_${kMovieId}`);
      const starsNum = Number(v.vote?.stars ?? v.rating);
      const stars = Number.isInteger(starsNum) && starsNum >= 1 && starsNum <= 5 ? starsNum : null;
      const voteSource = (v.vote?.source || v.source || 'scan') === 'scan' ? 'scan' : 'normal';
      const votedAt = v.vote?.timestamp ? new Date(v.vote.timestamp) : new Date();
      const base = { kashishVoteId, kUserId, kMovieId, stars, source: voteSource, votedAt, payload: v };

      if (RECEIPT_FINAL.has(receiptOutcome.get(kashishVoteId))) { counts.already_final++; continue; }
      if (!stars) continue; // malformed record

      // A. Film
      let filmId = movieMap.get(kMovieId);
      if (!filmId) {
        const norm = normalizeTitle(kMovieTitle);
        if (norm && titleToSubMap.has(norm)) {
          filmId = titleToSubMap.get(norm);
          await query(`
            INSERT INTO kashish_movie_mappings (event_id, kashish_movie_id, kashish_movie_title, freecomers_submission_id)
            VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE freecomers_submission_id = VALUES(freecomers_submission_id)
          `, [eventId, kMovieId, kMovieTitle, filmId]).catch(e => console.warn('[KashishSync] Movie mapping notice:', e.message));
          movieMap.set(kMovieId, filmId);
        }
      }
      if (!filmId) {
        unmappedMovieInfo.set(kMovieId, kMovieTitle);
        await upsertReceipt(eventId, { ...base, outcome: 'unmapped_film', reason: `No Freecomers film mapped for "${kMovieTitle}"` });
        counts.unmapped_film++;
        continue;
      }

      // B. Registered delegate (email, then phone ignoring formatting). Never auto-created.
      const match = await kashishExternal.matchKashishUserToAttendee(eventId, v.user, userCache);
      if (match.newlyMatched) counts.users_matched++;
      const attendeeId = match.attendeeId;
      if (!attendeeId) {
        await upsertReceipt(eventId, { ...base, filmId, outcome: 'unregistered', reason: 'Voter is not a registered delegate of this festival (no email/phone match)' });
        counts.unregistered++;
        continue;
      }

      // C. Delegate's badge (QR / badge number captured on the vote)
      if (!badgeCache.has(attendeeId)) {
        const b = await query('SELECT qr_id FROM saas_qr WHERE attendee_id = ? AND is_lost = 0 ORDER BY qr_id DESC LIMIT 1', [attendeeId]);
        badgeCache.set(attendeeId, b.length ? b[0].qr_id : null);
      }
      const qrId = badgeCache.get(attendeeId);

      // D. Attendance verification
      if (!blocksForFilmCache.has(filmId)) {
        const b = await query(`
          SELECT sbf.screening_block_id AS id
          FROM screening_block_films sbf
          JOIN screening_blocks sb ON sb.id = sbf.screening_block_id
          WHERE sb.event_id = ? AND sbf.film_id = ?
        `, [eventId, filmId]);
        blocksForFilmCache.set(filmId, b.map(x => x.id));
      }
      const filmBlocks = blocksForFilmCache.get(filmId);
      const checkin = filmBlocks.length
        ? await query(
          `SELECT screening_block_id FROM screening_checkins WHERE attendee_id = ? AND screening_block_id IN (${filmBlocks.map(() => '?').join(',')}) ORDER BY scanned_at LIMIT 1`,
          [attendeeId, ...filmBlocks]
        )
        : await query('SELECT screening_block_id FROM screening_checkins WHERE attendee_id = ? AND event_id = ? ORDER BY scanned_at LIMIT 1', [attendeeId, eventId]);
      const verified = checkin.length > 0;
      const blockId = verified ? checkin[0].screening_block_id : null;
      const status = verified ? 'valid' : 'flagged_suspicious';
      const method = voteSource === 'scan' ? 'kashish_scan' : 'kashish_normal';

      // E. Record the vote (or promote an earlier flagged Kashish vote once the delegate is verified)
      let voteId = null;
      let outcome = verified ? 'counted' : 'not_checked_in';
      try {
        const ins = await query(`
          INSERT INTO audience_votes (
            event_id, screening_block_id, film_id, attendee_id, qr_id, rating,
            is_attendance_verified, voting_method, status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [eventId, blockId, filmId, attendeeId, qrId, stars, verified ? 1 : 0, method, status, votedAt]);
        voteId = ins.insertId;
      } catch (insertErr) {
        if (insertErr.code !== 'ER_DUP_ENTRY') throw insertErr;
        const existing = await query(
          'SELECT id, status, voting_method FROM audience_votes WHERE event_id = ? AND attendee_id = ? AND film_id = ? LIMIT 1',
          [eventId, attendeeId, filmId]
        );
        const ex = existing[0];
        if (ex && ex.status === 'flagged_suspicious' && String(ex.voting_method).startsWith('kashish_')) {
          voteId = ex.id;
          if (verified) {
            await query(
              'UPDATE audience_votes SET status = \'valid\', is_attendance_verified = 1, screening_block_id = ?, qr_id = COALESCE(qr_id, ?) WHERE id = ?',
              [blockId, qrId, ex.id]
            );
          }
        } else {
          voteId = ex ? ex.id : null;
          outcome = 'duplicate'; // already voted for this film (e.g. via /vote) — first vote is final
        }
      }

      await upsertReceipt(eventId, {
        ...base, filmId, attendeeId, qrId, blockId, voteId, outcome,
        reason: outcome === 'not_checked_in' ? 'Delegate was not checked in at a screening of this film'
          : outcome === 'duplicate' ? 'Delegate already has a vote for this film' : null
      });
      counts[outcome]++;
    }

    await recalculateScores(eventId);

    await query(`
      UPDATE kashish_sync_logs SET
        total_fetched = ?, new_votes_created = ?, duplicate_skipped = ?, users_auto_matched = ?,
        users_auto_created = 0, movies_unmapped = ?, status = 'completed', completed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [votes.length, counts.counted, counts.duplicate + counts.already_final, counts.users_matched, unmappedMovieInfo.size, logId]);

    return {
      total_fetched: votes.length,
      counted: counts.counted,
      flagged_not_checked_in: counts.not_checked_in,
      rejected_unregistered: counts.unregistered,
      unmapped_film_votes: counts.unmapped_film,
      duplicates: counts.duplicate,
      already_processed: counts.already_final,
      users_matched: counts.users_matched,
      // kept for the existing UI
      new_votes_created: counts.counted,
      duplicate_skipped: counts.duplicate + counts.already_final,
      users_auto_matched: counts.users_matched,
      users_auto_created: 0,
      movies_unmapped: unmappedMovieInfo.size,
      unmapped_movies: [...unmappedMovieInfo].map(([id, title]) => ({ kashish_movie_id: id, kashish_movie_title: title }))
    };
  } catch (error) {
    if (logId) {
      await query(
        "UPDATE kashish_sync_logs SET status = 'failed', error_message = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?",
        [error.message, logId]
      ).catch(() => { });
    }
    throw error;
  } finally {
    runningEvents.delete(eventId);
  }
}

/**
 * POST /api/kashish-sync/sync-votes
 * Manual sync (the auto-sync timer calls syncEventVotes directly).
 */
async function syncKashishVotes(req, res) {
  try {
    // "Sync now" re-reads the festival's whole Kashish feed (the timer fetches only new votes)
    const summary = await syncEventVotes(getEventId(req), {
      userId: req.user ? req.user.id : null,
      source: req.body?.source || 'scan',
      full: true
    });
    if (summary.skipped) {
      return res.status(409).json({ error: summary.reason });
    }
    if (summary.mode === 'kashish') {
      const o = summary.outcomes;
      return res.json({
        success: true,
        message: `Sync completed: ${o.counted} counted of ${summary.total_fetched} fetched${summary.kashish_event_id ? ` for Kashish event ${summary.kashish_event_id}` : ''}. Skipped: ${o.unregistered} not registered, ${o.not_checked_in} not checked in, ${o.outside_period} outside the voting period${summary.removed_from_feed ? `; ${summary.removed_from_feed} no longer in the event feed` : ''}.`,
        summary
      });
    }
    res.json({
      success: true,
      message: `Sync completed: ${summary.counted} counted, ${summary.flagged_not_checked_in} flagged (not checked in), ${summary.rejected_unregistered} from unregistered voters, ${summary.duplicates} duplicates.`,
      summary
    });
  } catch (error) {
    console.error('[KashishSync] syncKashishVotes error:', error.message);
    res.status(500).json({ error: `Sync failed: ${error.message}` });
  }
}

/**
 * GET /api/kashish-sync/movie-mappings
 * List all configured movie mappings + available submissions for mapping
 */
async function listMovieMappings(req, res) {
  try {
    const eventId = getEventId(req);

    const mappings = await query(`
      SELECT 
        m.id,
        m.event_id,
        m.kashish_movie_id,
        m.kashish_movie_title,
        m.freecomers_submission_id,
        m.created_at,
        m.updated_at,
        s.title AS freecomers_title,
        s.director AS freecomers_director,
        s.category AS freecomers_category
      FROM kashish_movie_mappings m
      LEFT JOIN submissions s ON s.id = m.freecomers_submission_id
      WHERE m.event_id = ?
      ORDER BY m.created_at DESC
    `, [eventId]);

    const submissions = await query(`
      SELECT id, title, director, category
      FROM submissions
      WHERE event_id = ?
      ORDER BY title ASC
    `, [eventId]);

    res.json({
      success: true,
      count: mappings.length,
      mappings,
      submissions
    });
  } catch (error) {
    console.error('[KashishSync] listMovieMappings error:', error.message);
    res.status(500).json({ error: 'Failed to list movie mappings.' });
  }
}

/**
 * POST /api/kashish-sync/movie-mappings
 * Create or update a movie mapping
 */
async function createMovieMapping(req, res) {
  try {
    const eventId = getEventId(req);
    const { kashish_movie_id, kashish_movie_title, freecomers_submission_id } = req.body;

    if (!kashish_movie_id || !freecomers_submission_id) {
      return res.status(400).json({ error: 'kashish_movie_id and freecomers_submission_id are required.' });
    }

    await query(`
      INSERT INTO kashish_movie_mappings (
        event_id, kashish_movie_id, kashish_movie_title, freecomers_submission_id
      ) VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        freecomers_submission_id = VALUES(freecomers_submission_id),
        kashish_movie_title = VALUES(kashish_movie_title)
    `, [eventId, String(kashish_movie_id).trim(), (kashish_movie_title || '').trim(), parseInt(freecomers_submission_id, 10)]);

    res.json({ success: true, message: 'Movie mapping saved successfully.' });
  } catch (error) {
    console.error('[KashishSync] createMovieMapping error:', error.message);
    res.status(500).json({ error: 'Failed to save movie mapping.' });
  }
}

/**
 * DELETE /api/kashish-sync/movie-mappings/:id
 */
async function deleteMovieMapping(req, res) {
  try {
    const eventId = getEventId(req);
    const mappingId = req.params.id;

    await query('DELETE FROM kashish_movie_mappings WHERE id = ? AND event_id = ?', [mappingId, eventId]);
    res.json({ success: true, message: 'Movie mapping deleted.' });
  } catch (error) {
    console.error('[KashishSync] deleteMovieMapping error:', error.message);
    res.status(500).json({ error: 'Failed to delete movie mapping.' });
  }
}

/**
 * GET /api/kashish-sync/user-mappings
 */
async function listUserMappings(req, res) {
  try {
    const eventId = getEventId(req);
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

    const [mappings, totalRes] = await Promise.all([
      query(`
        SELECT 
          u.id,
          u.kashish_user_id,
          u.kashish_user_email,
          u.kashish_user_name,
          u.kashish_user_mobile,
          u.freecomers_attendee_id,
          u.matched_by,
          u.created_at,
          a.name AS attendee_name,
          a.status AS attendee_status
        FROM kashish_user_mappings u
        LEFT JOIN saas_attendees a ON a.attendee_id = u.freecomers_attendee_id
        WHERE u.event_id = ?
        ORDER BY u.created_at DESC
        LIMIT ? OFFSET ?
      `, [eventId, limit, offset]),
      query('SELECT COUNT(*) AS total FROM kashish_user_mappings WHERE event_id = ?', [eventId])
    ]);

    res.json({
      success: true,
      total: totalRes[0]?.total || 0,
      limit,
      offset,
      mappings
    });
  } catch (error) {
    console.error('[KashishSync] listUserMappings error:', error.message);
    res.status(500).json({ error: 'Failed to list user mappings.' });
  }
}

/**
 * GET /api/kashish-sync/sync-logs
 */
async function getSyncLogs(req, res) {
  try {
    const eventId = getEventId(req);
    const logs = await query(`
      SELECT *
      FROM kashish_sync_logs
      WHERE event_id = ?
      ORDER BY started_at DESC
      LIMIT 30
    `, [eventId]);

    res.json({ success: true, count: logs.length, logs });
  } catch (error) {
    console.error('[KashishSync] getSyncLogs error:', error.message);
    res.status(500).json({ error: 'Failed to retrieve sync logs.' });
  }
}

/**
 * GET /api/kashish-sync/receipts?outcome=unregistered|not_checked_in|unmapped_film|duplicate|counted
 * Every Kashish vote seen by Freecomers and what happened to it (counted or why not).
 */
async function listVoteReceipts(req, res) {
  try {
    const eventId = getEventId(req);
    const outcome = req.query.outcome;
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
    const params = [eventId];
    let where = 'r.event_id = ?';
    if (outcome) { where += ' AND r.outcome = ?'; params.push(outcome); }

    const [rows, totals] = await Promise.all([
      query(`
        SELECT r.id, r.kashish_vote_id, r.outcome, r.reason, r.stars, r.source, r.voted_at, r.last_evaluated_at,
               r.film_id, s.title AS film_title, r.attendee_id, a.name AS attendee_name, q.serial_no AS badge_serial,
               JSON_UNQUOTE(JSON_EXTRACT(r.payload, '$.user.name')) AS kashish_user_name,
               JSON_UNQUOTE(JSON_EXTRACT(r.payload, '$.user.mobileNumber')) AS kashish_user_mobile,
               JSON_UNQUOTE(JSON_EXTRACT(r.payload, '$.movie.title')) AS kashish_movie_title
        FROM kashish_vote_receipts r
        LEFT JOIN submissions s ON s.id = r.film_id
        LEFT JOIN saas_attendees a ON a.attendee_id = r.attendee_id
        LEFT JOIN saas_qr q ON q.qr_id = r.qr_id
        WHERE ${where}
        ORDER BY r.voted_at DESC
        LIMIT ${limit}
      `, params),
      query('SELECT outcome, COUNT(*) AS c FROM kashish_vote_receipts WHERE event_id = ? GROUP BY outcome', [eventId])
    ]);

    res.json({
      success: true,
      totals: Object.fromEntries(totals.map(t => [t.outcome, Number(t.c)])),
      receipts: rows
    });
  } catch (error) {
    console.error('[KashishSync] listVoteReceipts error:', error.message);
    res.status(500).json({ error: 'Failed to retrieve Kashish vote receipts.' });
  }
}

/**
 * GET /api/kashish-sync/external-summary   (docs/adr/0004)
 * Sync status for a festival whose votes come from the Kashish app: voting period, counts per
 * outcome, per-film counted / skipped votes and recent syncs. Needs an explicit event id.
 */
async function getExternalSummary(req, res) {
  try {
    const eventId = parseInt(req.headers['x-event-id'] || req.headers['x-edition-id'] || req.query.eventId, 10);
    if (!eventId) return res.status(400).json({ error: 'Festival (event) id is required.' });
    const summary = await kashishExternal.getExternalSummary(eventId);
    res.json({ success: true, ...summary });
  } catch (error) {
    console.error('[KashishSync] getExternalSummary error:', error.message);
    res.status(500).json({ error: 'Failed to load Kashish sync status.' });
  }
}

module.exports = {
  getExternalSummary,
  listVoteReceipts,
  syncEventVotes,
  syncKashishVotes,
  listMovieMappings,
  createMovieMapping,
  deleteMovieMapping,
  listUserMappings,
  getSyncLogs
};
