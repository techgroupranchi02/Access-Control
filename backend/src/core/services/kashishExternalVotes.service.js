/**
 * Kashish external leaderboard (docs/adr/0004)
 *
 * For festivals whose audience votes come from the Kashish Pride app
 * (audience_settings.settings_json.voting_source = 'kashish'). Their films are not FestiPlus
 * submissions, so votes are stored and ranked by Kashish's own movie id and title, in
 * kashish_external_votes. Nothing here reads or writes submissions, audience_votes,
 * audience_voting_scores or kashish_movie_mappings.
 *
 * Votes are fetched for the festival's Kashish event ID (setting kashish_event_id), scan votes
 * only. Scheduled runs fetch only votes new since the last run (updatedSince); a full sync (manual
 * "Sync now", the first run, or a changed event ID) re-reads the event's whole feed and marks
 * stored votes that aren't in it as 'removed'. Kashish votes are never edited after they're cast.
 *
 * A vote counts only when all of these hold (checked in this order):
 *   0. it belongs to the configured Kashish event and is a scan vote   else 'invalid'
 *   1. stars is a whole number 1-5                         else 'invalid'
 *   2. Kashish marks it "Verified Vote"                    else 'not_verified'
 *   3. it was cast inside the festival's voting period     else 'outside_period'
 *   4. the voter is a registered delegate of this festival,
 *      matched by email, then by mobile number             else 'unregistered'
 *   5. that delegate has a check-in at this festival       else 'not_checked_in'
 *   6. it is the voter's first vote for that film          else 'duplicate'
 * Every stored vote is re-evaluated on every sync (voter details are stored with it), so a later
 * registration, a late check-in or a changed voting period takes effect on the next sync.
 */

const { query } = require('../../config/database');
const { fetchAllKashishVotes } = require('./kashish-api.service');

const VERIFIED_STATUS = 'verified vote';
const KASHISH_EVENT_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const DEFAULT_ADJUSTMENT = 10;
const DEFAULT_FESTIVAL_MEAN = 4.0;

// ── Settings ────────────────────────────────────────────────────────────────

function parseJson(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { return {}; }
}

function toDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * The festival's vote source, Kashish event ID and voting period.
 * @returns {Promise<{source: 'freecomers'|'kashish', kashishEventId: string|null, from: Date|null, to: Date|null, adjustment: number}>}
 */
async function getVotingConfig(eventId) {
  const rows = await query('SELECT settings_json FROM audience_settings WHERE event_id = ? LIMIT 1', [eventId]);
  const s = parseJson(rows[0]?.settings_json);
  const adjustment = parseInt(s.adjustment_number, 10);
  return {
    source: s.voting_source === 'kashish' ? 'kashish' : 'freecomers',
    kashishEventId: typeof s.kashish_event_id === 'string' && KASHISH_EVENT_ID_RE.test(s.kashish_event_id.trim()) ? s.kashish_event_id.trim() : null,
    from: toDate(s.kashish_voting_from),
    to: toDate(s.kashish_voting_to),
    adjustment: Number.isFinite(adjustment) && adjustment >= 0 ? adjustment : DEFAULT_ADJUSTMENT
  };
}

async function isKashishSource(eventId) {
  return (await getVotingConfig(eventId)).source === 'kashish';
}

/** Events in Kashish mode whose voting period hasn't ended more than a day ago (for auto-sync). */
async function listKashishSyncEvents() {
  const rows = await query(`
    SELECT event_id, settings_json FROM audience_settings
    WHERE JSON_UNQUOTE(JSON_EXTRACT(settings_json, '$.voting_source')) = 'kashish'
  `);
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  return rows
    .filter(r => {
      const to = toDate(parseJson(r.settings_json).kashish_voting_to);
      return !to || to.getTime() >= cutoff;
    })
    .map(r => r.event_id);
}

// ── Voter → registered delegate (shared with the submissions-based sync) ─────

/** Kashish user id → attendee id, for voters already matched to this festival's delegates. */
async function loadUserMappings(eventId) {
  const map = new Map();
  const rows = await query(`
    SELECT m.kashish_user_id, m.freecomers_attendee_id
    FROM kashish_user_mappings m
    JOIN saas_attendees a ON a.attendee_id = m.freecomers_attendee_id
    WHERE m.event_id = ? AND m.matched_by <> 'auto_created'
  `, [eventId]);
  rows.forEach(r => map.set(String(r.kashish_user_id), r.freecomers_attendee_id));
  return map;
}

/**
 * Match a Kashish voter to a registered delegate of this festival: email first, then the last
 * 10 digits of the mobile number (ignoring formatting). Never creates attendees. A new match is
 * saved in kashish_user_mappings.
 *
 * @param {number} eventId
 * @param {object} user  the vote's `user` object from the Kashish API
 * @param {{map: Map, misses: Set}} cache  per-sync cache (map from loadUserMappings)
 * @returns {Promise<{attendeeId: number|null, newlyMatched: boolean}>}
 */
async function matchKashishUserToAttendee(eventId, user, cache) {
  const kUserId = String(user?.id || user?._id || '');
  if (!kUserId) return { attendeeId: null, newlyMatched: false };
  if (cache.map.has(kUserId)) return { attendeeId: cache.map.get(kUserId), newlyMatched: false };
  if (cache.misses && cache.misses.has(kUserId)) return { attendeeId: null, newlyMatched: false };

  const email = user?.email && user.email !== 'Anonymous' ? String(user.email).toLowerCase().trim() : null;
  const mobile = user?.mobileNumber || user?.mobile || null;
  let attendeeId = null;
  let matchedBy = null;

  if (email) {
    const r = await query(
      'SELECT attendee_id FROM saas_attendees WHERE event_id = ? AND LOWER(email) = ? LIMIT 1',
      [eventId, email]
    );
    if (r.length) { attendeeId = r[0].attendee_id; matchedBy = 'email'; }
  }
  const mobile10 = mobile ? String(mobile).replace(/\D/g, '').slice(-10) : '';
  if (!attendeeId && mobile10.length === 10) {
    const r = await query(`
      SELECT attendee_id FROM saas_attendees
      WHERE event_id = ?
        AND REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '(', ''), ')', '') LIKE ?
      LIMIT 1
    `, [eventId, `%${mobile10}`]);
    if (r.length) { attendeeId = r[0].attendee_id; matchedBy = 'phone'; }
  }

  if (!attendeeId) {
    if (cache.misses) cache.misses.add(kUserId);
    return { attendeeId: null, newlyMatched: false };
  }

  cache.map.set(kUserId, attendeeId);
  await query(`
    INSERT INTO kashish_user_mappings (
      event_id, kashish_user_id, kashish_user_email, kashish_user_name, kashish_user_mobile, freecomers_attendee_id, matched_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE freecomers_attendee_id = VALUES(freecomers_attendee_id), matched_by = VALUES(matched_by)
  `, [eventId, kUserId, email, user?.name || null, mobile, attendeeId, matchedBy])
    .catch(e => console.warn('[KashishSync] User mapping notice:', e.message));
  return { attendeeId, newlyMatched: true };
}

// ── Sync ────────────────────────────────────────────────────────────────────

// MySQL DATETIME rounds fractional seconds; drop them so stored and incoming values compare equal
function wholeSecond(d) {
  return d ? new Date(Math.floor(d.getTime() / 1000) * 1000) : null;
}

function parseStars(raw) {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
}

const OUTCOME_REASON = {
  invalid: 'Rating is missing or not a whole number from 1 to 5',
  not_verified: 'Not marked as a verified vote by the Kashish app',
  outside_period: 'Cast outside the festival voting period',
  unregistered: 'Voter is not a registered delegate of this festival (no email or phone match)',
  not_checked_in: 'Delegate has not checked in at this festival',
  duplicate: 'Delegate already has a counted vote for this film',
  removed: "Not in this festival's Kashish event feed",
  other_event: 'Belongs to a different Kashish event',
  not_scan: 'Not a scan (QR) vote'
};

const COMPARE_FIELDS = ['kashish_event_id', 'kashish_user_id', 'kashish_user_email', 'kashish_user_name', 'kashish_user_mobile',
  'kashish_user_country', 'kashish_movie_id', 'kashish_movie_title', 'stars', 'source',
  'kashish_status', 'attendee_id', 'qr_id', 'checkin_block_id', 'outcome', 'reason'];

/** A Kashish API record in the shape the evaluator uses. */
function fromApi(v) {
  const kUserId = String(v.user?.id || v.user?._id || '');
  const kMovieId = String(v.movie?.id || v.movie?._id || '');
  return {
    id: String(v.id || (kUserId && kMovieId ? `${kUserId}_${kMovieId}` : '')),
    eventId: v.eventId || v.vote?.eventId || null,
    user: { id: kUserId, email: v.user?.email || null, name: v.user?.name || null, mobileNumber: v.user?.mobileNumber || v.user?.mobile || null, countryCode: v.user?.countryCode || null },
    movie: { id: kMovieId, title: v.movie?.title || v.movie?.name || null },
    stars: v.vote?.stars ?? v.rating,
    source: v.vote?.source || v.source || null,
    status: v.vote?.status || null,
    timestamp: v.vote?.timestamp || null
  };
}

/** A stored vote row in the same shape, so stored votes are re-checked without fetching them again. */
function fromRow(r) {
  return {
    id: r.kashish_vote_id,
    eventId: r.kashish_event_id,
    user: { id: r.kashish_user_id, email: r.kashish_user_email, name: r.kashish_user_name, mobileNumber: r.kashish_user_mobile, countryCode: r.kashish_user_country },
    movie: { id: r.kashish_movie_id, title: r.kashish_movie_title },
    stars: r.stars,
    source: r.source,
    status: r.kashish_status,
    timestamp: r.voted_at
  };
}

async function getSyncState(eventId) {
  const rows = await query('SELECT kashish_event_id, last_synced_at, last_full_sync_at FROM kashish_sync_state WHERE event_id = ? LIMIT 1', [eventId]);
  return rows[0] || null;
}

function sameValue(a, b) {
  if (a === null || a === undefined) return b === null || b === undefined;
  return String(a) === String(b);
}

/**
 * Sync one festival in Kashish mode: fetch votes (new since the last run, or the whole event feed on
 * a full sync), then (re)evaluate every stored vote. The caller holds the per-event lock and owns
 * the kashish_sync_logs row.
 *
 * @param {number} eventId
 * @param {{ apiKey?: string, logId?: number, full?: boolean }} opts  full: re-read the whole feed
 * @returns {Promise<object>} summary with counts per outcome
 */
async function syncExternalVotes(eventId, { apiKey, logId = null, full = false } = {}) {
  const config = await getVotingConfig(eventId);
  const state = await getSyncState(eventId);
  // A full sync is needed the first time and whenever the Kashish event ID changes
  const isFull = full || !state || !state.last_synced_at || (state.kashish_event_id || null) !== config.kashishEventId;
  const fetched = await fetchAllKashishVotes(apiKey, {
    source: 'scan',
    eventId: config.kashishEventId || undefined,
    updatedSince: isFull ? undefined : state.last_synced_at
  });
  const votes = fetched.votes;

  const existingRows = await query(`
    SELECT id, kashish_vote_id, ${COMPARE_FIELDS.join(', ')}, voted_at
    FROM kashish_external_votes WHERE event_id = ?
  `, [eventId]);
  const existing = new Map(existingRows.map(r => [r.kashish_vote_id, r]));

  // What to evaluate: on a full sync, the event's feed; otherwise every stored vote (except
  // removed ones) plus whatever is new since the last run
  const toEvaluate = new Map();
  if (!isFull) existingRows.filter(r => r.outcome !== 'removed').forEach(r => toEvaluate.set(r.kashish_vote_id, fromRow(r)));
  votes.map(fromApi).forEach(v => { if (v.id) toEvaluate.set(v.id.slice(0, 160), v); });

  const userCache = { map: await loadUserMappings(eventId), misses: new Set() };
  const checkinCache = new Map();
  const badgeCache = new Map();
  let usersMatched = 0;

  // 1. Evaluate every vote on its own
  const evaluated = [];
  for (const v of toEvaluate.values()) {
    if (!v.id || !v.user.id || !v.movie.id) continue; // unusable record

    const row = {
      kashish_vote_id: v.id.slice(0, 160),
      kashish_event_id: v.eventId ? String(v.eventId).slice(0, 64) : null,
      kashish_user_id: String(v.user.id).slice(0, 128),
      kashish_user_email: v.user.email ? String(v.user.email).slice(0, 255) : null,
      kashish_user_name: v.user.name ? String(v.user.name).slice(0, 255) : null,
      kashish_user_mobile: v.user.mobileNumber ? String(v.user.mobileNumber).slice(0, 32) : null,
      kashish_user_country: v.user.countryCode ? String(v.user.countryCode).slice(0, 8) : null,
      kashish_movie_id: String(v.movie.id).slice(0, 128),
      kashish_movie_title: String(v.movie.title || 'Untitled').trim().slice(0, 255),
      stars: parseStars(v.stars),
      source: v.source ? String(v.source).slice(0, 16) : null,
      kashish_status: v.status ? String(v.status).slice(0, 64) : null,
      voted_at: wholeSecond(toDate(v.timestamp)),
      attendee_id: null,
      qr_id: null,
      checkin_block_id: null,
      outcome: 'counted',
      reason: null
    };

    // Guards in case an API filter is ignored: another Kashish event, or not a scan vote
    if (config.kashishEventId && row.kashish_event_id !== config.kashishEventId) {
      row.outcome = 'invalid'; row.reason = OUTCOME_REASON.other_event;
    } else if (String(row.source || '').toLowerCase() !== 'scan') {
      row.outcome = 'invalid'; row.reason = OUTCOME_REASON.not_scan;
    } else if (row.stars === null) row.outcome = 'invalid';
    else if (String(row.kashish_status || '').toLowerCase() !== VERIFIED_STATUS) row.outcome = 'not_verified';
    else if (!row.voted_at || (config.from && row.voted_at < config.from) || (config.to && row.voted_at > config.to)) row.outcome = 'outside_period';

    if (row.outcome === 'counted') {
      const match = await matchKashishUserToAttendee(eventId, v.user, userCache);
      if (match.newlyMatched) usersMatched++;
      if (!match.attendeeId) {
        row.outcome = 'unregistered';
      } else {
        row.attendee_id = match.attendeeId;
        if (!badgeCache.has(match.attendeeId)) {
          const b = await query(
            'SELECT qr_id FROM saas_qr WHERE attendee_id = ? AND event_id = ? AND is_lost = 0 ORDER BY qr_id DESC LIMIT 1',
            [match.attendeeId, eventId]
          );
          badgeCache.set(match.attendeeId, b.length ? b[0].qr_id : null);
        }
        row.qr_id = badgeCache.get(match.attendeeId);
        // KASHISH films are not in our screening blocks, so any check-in at this festival counts
        if (!checkinCache.has(match.attendeeId)) {
          const c = await query(
            'SELECT screening_block_id FROM screening_checkins WHERE attendee_id = ? AND event_id = ? ORDER BY scanned_at LIMIT 1',
            [match.attendeeId, eventId]
          );
          checkinCache.set(match.attendeeId, c.length ? (c[0].screening_block_id || 0) : null);
        }
        const block = checkinCache.get(match.attendeeId);
        if (block === null) row.outcome = 'not_checked_in';
        else row.checkin_block_id = block || null;
      }
    }
    evaluated.push(row);
  }

  // 2. One counted vote per voter per film: the earliest wins
  const firstCounted = new Map();
  evaluated
    .filter(r => r.outcome === 'counted')
    .sort((a, b) => a.voted_at - b.voted_at)
    .forEach(r => {
      const key = `${r.kashish_user_id}|${r.kashish_movie_id}`;
      if (firstCounted.has(key)) r.outcome = 'duplicate';
      else firstCounted.set(key, r);
    });
  evaluated.forEach(r => { if (r.outcome !== 'counted' && !r.reason) r.reason = OUTCOME_REASON[r.outcome]; });

  // 3. Write: insert new votes, update changed ones; on a full sync, mark stored votes that aren't
  //    in the event's feed as removed
  const seen = new Set();
  const inserts = [];
  let updated = 0;
  for (const r of evaluated) {
    seen.add(r.kashish_vote_id);
    const prev = existing.get(r.kashish_vote_id);
    if (!prev) { inserts.push(r); continue; }
    // DATETIME keeps whole seconds; Kashish timestamps carry milliseconds
    const toSecond = (d) => (d ? Math.floor(new Date(d).getTime() / 1000) : null);
    const changed = COMPARE_FIELDS.some(f => !sameValue(prev[f], r[f])) || toSecond(prev.voted_at) !== toSecond(r.voted_at);
    if (changed) {
      await query(`
        UPDATE kashish_external_votes SET
          kashish_event_id = ?, kashish_user_id = ?, kashish_user_email = ?, kashish_user_name = ?, kashish_user_mobile = ?, kashish_user_country = ?,
          kashish_movie_id = ?, kashish_movie_title = ?, stars = ?, source = ?, kashish_status = ?,
          voted_at = ?, attendee_id = ?, qr_id = ?, checkin_block_id = ?, outcome = ?, reason = ?, last_evaluated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [r.kashish_event_id, r.kashish_user_id, r.kashish_user_email, r.kashish_user_name, r.kashish_user_mobile, r.kashish_user_country,
        r.kashish_movie_id, r.kashish_movie_title, r.stars, r.source, r.kashish_status,
        r.voted_at, r.attendee_id, r.qr_id, r.checkin_block_id, r.outcome, r.reason, prev.id]);
      updated++;
    }
  }
  for (let i = 0; i < inserts.length; i += 200) {
    const chunk = inserts.slice(i, i + 200);
    await query(`
      INSERT INTO kashish_external_votes (
        event_id, kashish_vote_id, kashish_event_id, kashish_user_id, kashish_user_email, kashish_user_name, kashish_user_mobile,
        kashish_user_country, kashish_movie_id, kashish_movie_title, stars, source,
        kashish_status, voted_at, attendee_id, qr_id, checkin_block_id, outcome, reason
      ) VALUES ${chunk.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ')}
    `, chunk.flatMap(r => [eventId, r.kashish_vote_id, r.kashish_event_id, r.kashish_user_id, r.kashish_user_email, r.kashish_user_name,
      r.kashish_user_mobile, r.kashish_user_country, r.kashish_movie_id, r.kashish_movie_title,
      r.stars, r.source, r.kashish_status, r.voted_at, r.attendee_id, r.qr_id, r.checkin_block_id, r.outcome, r.reason]));
  }
  const removedIds = isFull
    ? existingRows.filter(p => !seen.has(p.kashish_vote_id) && p.outcome !== 'removed').map(p => p.id)
    : [];
  for (let i = 0; i < removedIds.length; i += 500) {
    const ids = removedIds.slice(i, i + 500);
    await query(
      `UPDATE kashish_external_votes SET outcome = 'removed', reason = ?, attendee_id = NULL, last_evaluated_at = CURRENT_TIMESTAMP
       WHERE id IN (${ids.map(() => '?').join(',')})`,
      [OUTCOME_REASON.removed, ...ids]
    );
  }

  // Remember where to resume: the API's syncedAt is passed back as updatedSince next time
  await query(`
    INSERT INTO kashish_sync_state (event_id, kashish_event_id, last_synced_at, last_full_sync_at)
    VALUES (?, ?, ?, ${isFull ? 'CURRENT_TIMESTAMP' : 'NULL'})
    ON DUPLICATE KEY UPDATE kashish_event_id = VALUES(kashish_event_id), last_synced_at = VALUES(last_synced_at)
      ${isFull ? ', last_full_sync_at = CURRENT_TIMESTAMP' : ''}
  `, [eventId, config.kashishEventId, fetched.syncedAt || new Date().toISOString()]);

  const outcomes = { counted: 0, unregistered: 0, not_checked_in: 0, outside_period: 0, not_verified: 0, invalid: 0, duplicate: 0, removed: removedIds.length };
  evaluated.forEach(r => { outcomes[r.outcome]++; });

  if (logId) {
    await query(`
      UPDATE kashish_sync_logs SET
        total_fetched = ?, new_votes_created = ?, duplicate_skipped = ?, users_auto_matched = ?,
        users_auto_created = 0, movies_unmapped = 0, status = 'completed', completed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [votes.length, outcomes.counted, outcomes.duplicate, usersMatched, logId]);
  }

  return {
    mode: 'kashish',
    sync_type: isFull ? 'full' : 'incremental',
    kashish_event_id: config.kashishEventId,
    total_fetched: votes.length,
    counted: outcomes.counted,
    outcomes,
    new_rows: inserts.length,
    updated_rows: updated,
    removed_from_feed: removedIds.length,
    users_matched: usersMatched
  };
}

// ── Standings ───────────────────────────────────────────────────────────────

/**
 * Rank Kashish films for one festival from counted votes.
 * Bayesian score W = v/(v+m)·R + m/(v+m)·C (same formula as recalculateScores), where C is the
 * mean of all counted votes. Ties: more votes, then higher raw average.
 * Films with only out-of-period or removed (other-event) votes are left out; films with in-period votes that didn't count
 * are listed with 0 votes so the team can see them.
 */
async function computeExternalStandings(eventId, config = null) {
  const cfg = config || await getVotingConfig(eventId);
  const m = cfg.adjustment;

  const films = await query(`
    SELECT kashish_movie_id,
           MAX(kashish_movie_title) AS film_title,
           SUM(outcome = 'counted') AS v,
           COALESCE(SUM(CASE WHEN outcome = 'counted' THEN stars END), 0) AS sum_stars
    FROM kashish_external_votes
    WHERE event_id = ? AND outcome NOT IN ('outside_period', 'removed')
    GROUP BY kashish_movie_id
  `, [eventId]);

  const totalVotes = films.reduce((t, f) => t + Number(f.v), 0);
  const totalStars = films.reduce((t, f) => t + Number(f.sum_stars), 0);
  const C = totalVotes > 0 ? totalStars / totalVotes : DEFAULT_FESTIVAL_MEAN;

  const rows = films.map(f => {
    const v = Number(f.v);
    const R = v > 0 ? Number(f.sum_stars) / v : 0;
    const W = v > 0 ? (v / (v + m)) * R + (m / (v + m)) * C : 0;
    return {
      film_id: f.kashish_movie_id,
      film_title: f.film_title,
      director: null,
      film_category: null,
      runtime: null,
      total_votes: v,
      raw_average: Number(R.toFixed(4)),
      bayesian_score: Number(W.toFixed(4))
    };
  });

  rows.sort((a, b) =>
    (b.bayesian_score - a.bayesian_score) || (b.total_votes - a.total_votes) || (b.raw_average - a.raw_average)
    || String(a.film_title).localeCompare(String(b.film_title)));
  rows.forEach((r, i) => { r.standing_rank = i + 1; });
  return { standings: rows, festival_mean: Number(C.toFixed(4)), adjustment_number: m };
}

// ── Publications (frozen results) ───────────────────────────────────────────

async function getLatestPublication(eventId) {
  const rows = await query(
    'SELECT id, standings, voting_from, voting_to, published_by_user_id, published_at FROM kashish_results_publications WHERE event_id = ? ORDER BY published_at DESC, id DESC LIMIT 1',
    [eventId]
  );
  if (!rows.length) return null;
  return { ...rows[0], standings: parseJson(rows[0].standings) };
}

async function publishExternalResults(eventId, userId) {
  const cfg = await getVotingConfig(eventId);
  const { standings } = await computeExternalStandings(eventId, cfg);
  await query(
    'INSERT INTO kashish_results_publications (event_id, standings, voting_from, voting_to, published_by_user_id) VALUES (?, ?, ?, ?, ?)',
    [eventId, JSON.stringify(standings), cfg.from, cfg.to, userId || null]
  );
  return getLatestPublication(eventId);
}

/** True when the live standings differ from the published snapshot (order or vote counts). */
function standingsChanged(published, live) {
  const a = Array.isArray(published) ? published : [];
  if (a.length !== live.length) return true;
  return a.some((p, i) => p.film_id !== live[i].film_id || Number(p.total_votes) !== Number(live[i].total_votes));
}

// ── Summary for the Sync status tab ─────────────────────────────────────────

async function getExternalSummary(eventId) {
  const cfg = await getVotingConfig(eventId);
  const outcomeRows = await query(
    'SELECT outcome, COUNT(*) AS n FROM kashish_external_votes WHERE event_id = ? GROUP BY outcome',
    [eventId]
  );
  const outcomes = { counted: 0, unregistered: 0, not_checked_in: 0, outside_period: 0, not_verified: 0, invalid: 0, duplicate: 0, removed: 0 };
  outcomeRows.forEach(r => { outcomes[r.outcome] = Number(r.n); });
  const state = await getSyncState(eventId);

  const films = await query(`
    SELECT kashish_movie_id AS film_id, MAX(kashish_movie_title) AS film_title,
           SUM(outcome = 'counted') AS counted,
           SUM(outcome = 'unregistered') AS unregistered,
           SUM(outcome = 'not_checked_in') AS not_checked_in,
           SUM(outcome = 'outside_period') AS outside_period,
           SUM(outcome IN ('not_verified', 'invalid', 'duplicate')) AS other_skipped,
           COUNT(*) AS total
    FROM kashish_external_votes WHERE event_id = ? AND outcome <> 'removed'
    GROUP BY kashish_movie_id
    ORDER BY counted DESC, total DESC, film_title ASC
  `, [eventId]);

  const logs = await query(`
    SELECT id, started_at, completed_at, status, total_fetched, new_votes_created AS counted,
           users_auto_matched AS users_matched, error_message
    FROM kashish_sync_logs WHERE event_id = ? ORDER BY started_at DESC LIMIT 10
  `, [eventId]);

  return {
    source: cfg.source,
    voting_period: { from: cfg.from, to: cfg.to },
    kashish_event_id: cfg.kashishEventId,
    sync_state: {
      kashish_event_id: state?.kashish_event_id || null,
      last_synced_at: state?.last_synced_at || null,
      last_full_sync_at: state?.last_full_sync_at || null
    },
    outcomes,
    total: Object.values(outcomes).reduce((t, n) => t + n, 0),
    films: films.map(f => ({
      film_id: f.film_id,
      film_title: f.film_title,
      counted: Number(f.counted),
      unregistered: Number(f.unregistered),
      not_checked_in: Number(f.not_checked_in),
      outside_period: Number(f.outside_period),
      other_skipped: Number(f.other_skipped),
      total: Number(f.total)
    })),
    last_sync: logs.find(l => l.status === 'completed') || null,
    recent_syncs: logs
  };
}

module.exports = {
  getVotingConfig,
  isKashishSource,
  listKashishSyncEvents,
  loadUserMappings,
  matchKashishUserToAttendee,
  syncExternalVotes,
  computeExternalStandings,
  getLatestPublication,
  publishExternalResults,
  standingsChanged,
  getExternalSummary
};
