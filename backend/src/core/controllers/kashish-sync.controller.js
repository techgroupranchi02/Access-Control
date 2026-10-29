/**
 * Kashish Sync Controller
 * Synchronizes votes and mappings between Kashish external portal and Freecomers Audience Module
 * References: Doc 4 (API Integration Guide), Doc 5 (Scoring Guide)
 */

const crypto = require('crypto');
const { query } = require('../../config/database');
const { fetchAllKashishVotes } = require('../services/kashish-api.service');
const { recalculateScores } = require('./audience.controller');

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

/**
 * POST /api/kashish-sync/sync-votes
 * Pulls all votes from Kashish API, auto-maps users and movies, stores votes, and recalculates scores.
 */
async function syncKashishVotes(req, res) {
  const eventId = getEventId(req);
  const userId = req.user ? req.user.id : 1;
  let logId = null;

  try {
    // 1. Create a sync log record
    const logRes = await query(`
      INSERT INTO kashish_sync_logs (event_id, sync_type, status, synced_by_user_id)
      VALUES (?, 'votes', 'running', ?)
    `, [eventId, userId]);
    logId = logRes.insertId;

    // 2. Fetch all votes from Kashish API
    console.log(`[KashishSync] Fetching all votes from Kashish API for event ${eventId}...`);
    const { votes, summary } = await fetchAllKashishVotes(req.body?.apiKey, req.body?.source || 'all');
    console.log(`[KashishSync] Retrieved ${votes.length} votes from Kashish API.`);

    // 3. Load existing movie mappings
    const existingMovieMappings = await query(`
      SELECT kashish_movie_id, freecomers_submission_id
      FROM kashish_movie_mappings
      WHERE event_id = ?
    `, [eventId]);
    const movieMap = new Map();
    existingMovieMappings.forEach(m => movieMap.set(String(m.kashish_movie_id), m.freecomers_submission_id));

    // 4. Load all submissions for this event for title auto-matching
    const submissions = await query(`
      SELECT id, title, director
      FROM submissions
      WHERE event_id = ?
    `, [eventId]);
    const titleToSubMap = new Map();
    submissions.forEach(s => {
      const norm = normalizeTitle(s.title);
      if (norm) titleToSubMap.set(norm, s.id);
    });

    // 5. Load existing user mappings
    const existingUserMappings = await query(`
      SELECT kashish_user_id, freecomers_attendee_id
      FROM kashish_user_mappings
      WHERE event_id = ?
    `, [eventId]);
    const userMap = new Map();
    existingUserMappings.forEach(u => userMap.set(String(u.kashish_user_id), u.freecomers_attendee_id));

    // 6. Process votes
    let newVotes = 0;
    let duplicateSkipped = 0;
    let usersAutoMatched = 0;
    let usersAutoCreated = 0;
    const unmappedMovieSet = new Set();
    const unmappedMovieInfo = new Map();

    for (const v of votes) {
      const kMovieId = v.movie?.id || v.movie?._id;
      const kMovieTitle = v.movie?.title || v.movie?.name || 'Untitled';
      const kUserId = v.user?.id || v.user?._id;
      const kUserName = v.user?.name || 'Kashish Delegate';
      const kUserEmail = v.user?.email ? v.user.email.toLowerCase().trim() : null;
      const kUserMobile = v.user?.mobileNumber || v.user?.mobile || null;

      // ── Step A: Resolve Movie ──────────────────────────────────────
      let submissionId = movieMap.get(String(kMovieId));
      if (!submissionId) {
        // Try auto-matching by normalized title
        const normKTitle = normalizeTitle(kMovieTitle);
        if (normKTitle && titleToSubMap.has(normKTitle)) {
          submissionId = titleToSubMap.get(normKTitle);
          // Persist the auto-matched mapping
          try {
            await query(`
              INSERT INTO kashish_movie_mappings (event_id, kashish_movie_id, kashish_movie_title, freecomers_submission_id)
              VALUES (?, ?, ?, ?)
              ON DUPLICATE KEY UPDATE freecomers_submission_id = VALUES(freecomers_submission_id)
            `, [eventId, String(kMovieId), kMovieTitle, submissionId]);
            movieMap.set(String(kMovieId), submissionId);
            console.log(`[KashishSync] Auto-mapped movie "${kMovieTitle}" -> submission #${submissionId}`);
          } catch (mErr) {
            console.warn('[KashishSync] Movie mapping insert notice:', mErr.message);
          }
        }
      }

      if (!submissionId) {
        unmappedMovieSet.add(String(kMovieId));
        unmappedMovieInfo.set(String(kMovieId), kMovieTitle);
        continue; // Cannot record vote for unmapped movie
      }

      // ── Step B: Resolve User / Attendee ─────────────────────────────
      let attendeeId = userMap.get(String(kUserId));
      if (!attendeeId && kUserId) {
        let matchedBy = null;

        // Try matching existing attendee by email
        if (kUserEmail) {
          const matchEmail = await query(`
            SELECT attendee_id FROM saas_attendees 
            WHERE event_id = ? AND LOWER(email) = ? 
            LIMIT 1
          `, [eventId, kUserEmail]);
          if (matchEmail.length > 0) {
            attendeeId = matchEmail[0].attendee_id;
            matchedBy = 'email';
          }
        }

        // Try matching existing attendee by mobile
        if (!attendeeId && kUserMobile) {
          const cleanMobile = kUserMobile.replace(/\D/g, '').slice(-10);
          if (cleanMobile.length === 10) {
            const matchMobile = await query(`
              SELECT attendee_id FROM saas_attendees 
              WHERE event_id = ? AND phone LIKE ? 
              LIMIT 1
            `, [eventId, `%${cleanMobile}`]);
            if (matchMobile.length > 0) {
              attendeeId = matchMobile[0].attendee_id;
              matchedBy = 'phone';
            }
          }
        }

        if (attendeeId) {
          usersAutoMatched++;
        } else {
          // Auto-create attendee
          const qrToken = crypto.randomUUID();
          const customMeta = JSON.stringify({
            kashish_user_id: kUserId,
            country_code: v.user?.countryCode || null,
            sync_source: 'kashish_api'
          });

          const createAttendeeRes = await query(`
            INSERT INTO saas_attendees (
              event_id, festival_id, name, email, phone, delegate_category,
              registration_type, registered_by_user_id, registered_by_role, status, qr_token, custom_data
            ) VALUES (?, ?, ?, ?, ?, 'kashish_synced', 'kashish_api', ?, 'admin', 'registered', ?, ?)
          `, [
            eventId, eventId, kUserName, kUserEmail, kUserMobile,
            userId, qrToken, customMeta
          ]);
          attendeeId = createAttendeeRes.insertId;

          // Also register QR record
          try {
            await query(`
              INSERT INTO saas_qr (qr_data, event_id, festival_id, attendee_id)
              VALUES (?, ?, ?, ?)
            `, [qrToken, eventId, eventId, attendeeId]);
          } catch (qrErr) {
            // non-fatal
          }

          matchedBy = 'auto_created';
          usersAutoCreated++;
        }

        // Save mapping for future lookups
        try {
          await query(`
            INSERT INTO kashish_user_mappings (
              event_id, kashish_user_id, kashish_user_email, kashish_user_name,
              kashish_user_mobile, freecomers_attendee_id, matched_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
              freecomers_attendee_id = VALUES(freecomers_attendee_id),
              matched_by = VALUES(matched_by)
          `, [eventId, String(kUserId), kUserEmail, kUserName, kUserMobile, attendeeId, matchedBy]);
          userMap.set(String(kUserId), attendeeId);
        } catch (uMapErr) {
          console.warn('[KashishSync] User mapping insert notice:', uMapErr.message);
        }
      }

      if (!attendeeId) {
        continue;
      }

      // ── Step C: Insert Vote ─────────────────────────────────────────
      const rawStars = v.vote?.stars ?? v.rating ?? 5;
      const stars = Math.max(1, Math.min(5, parseInt(rawStars, 10) || 5));
      const source = (v.vote?.source || v.source || 'scan') === 'scan' ? 'kashish_scan' : 'kashish_normal';
      const voteDate = v.vote?.timestamp ? new Date(v.vote.timestamp) : new Date();

      try {
        await query(`
          INSERT INTO audience_votes (
            event_id, screening_block_id, film_id, attendee_id, rating,
            is_attendance_verified, voting_method, status, created_at
          ) VALUES (?, NULL, ?, ?, ?, 1, ?, 'valid', ?)
        `, [eventId, submissionId, attendeeId, stars, source, voteDate]);
        newVotes++;
      } catch (insertErr) {
        if (insertErr.code === 'ER_DUP_ENTRY') {
          duplicateSkipped++;
        } else {
          console.error('[KashishSync] Vote insert error:', insertErr.message);
        }
      }
    }

    // 7. Recalculate leaderboard scores immediately with new votes
    await recalculateScores(eventId);

    // 8. Update sync log
    await query(`
      UPDATE kashish_sync_logs SET
        total_fetched = ?,
        new_votes_created = ?,
        duplicate_skipped = ?,
        users_auto_matched = ?,
        users_auto_created = ?,
        movies_unmapped = ?,
        status = 'completed',
        completed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      votes.length,
      newVotes,
      duplicateSkipped,
      usersAutoMatched,
      usersAutoCreated,
      unmappedMovieSet.size,
      logId
    ]);

    const unmappedList = Array.from(unmappedMovieSet).map(id => ({
      kashish_movie_id: id,
      kashish_movie_title: unmappedMovieInfo.get(id) || 'Unknown'
    }));

    res.json({
      success: true,
      message: `Sync completed: ${newVotes} new votes created, ${duplicateSkipped} duplicates skipped.`,
      summary: {
        total_fetched: votes.length,
        new_votes_created: newVotes,
        duplicate_skipped: duplicateSkipped,
        users_auto_matched: usersAutoMatched,
        users_auto_created: usersAutoCreated,
        movies_unmapped: unmappedMovieSet.size,
        unmapped_movies: unmappedList
      }
    });
  } catch (error) {
    console.error('[KashishSync] syncKashishVotes error:', error.message);
    if (logId) {
      await query(`
        UPDATE kashish_sync_logs SET
          status = 'failed',
          error_message = ?,
          completed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [error.message, logId]).catch(() => {});
    }
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

module.exports = {
  syncKashishVotes,
  listMovieMappings,
  createMovieMapping,
  deleteMovieMapping,
  listUserMappings,
  getSyncLogs
};
