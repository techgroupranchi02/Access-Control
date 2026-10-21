/**
 * Submission Controller
 * Real MySQL database operations for the 23 submissions, flags, and rejection workflow.
 */

const { query } = require('../../config/database');
const { scopeSubmissionsQuery, canAccessSubmission } = require('../services/scoping.service');
const { formatThumbnailUrl } = require('../utils/media.utils');

/**
 * Automatically sync real Freecomers submissions from film_festivals_submissions
 * for this event into the submissions table if not already present.
 */
async function syncSubmissionsForEvent(eventId) {
  if (!eventId) return;
  try {
    const ffRows = await query('SELECT film_festival_id FROM film_festivals WHERE event_id = ?', [eventId]);
    if (ffRows.length === 0) return;
    const festivalId = ffRows[0].film_festival_id;

    const realSubs = await query(`
      SELECT 
        ffs.film_festivals_submission_id as id,
        ff.event_id,
        p.title,
        COALESCE(i.name, o.name, u.email, 'Filmmaker') as director,
        COALESCE(cat.name, 'Documentary') as category,
        COALESCE(p.duration, 15) as runtime,
        COALESCE(c.country, 'India') as country,
        COALESCE(u.email, 'filmmaker@freecomers.com') as email,
        COALESCE(p.synopsis, '') as synopsis,
        CASE 
          WHEN ffs.selection_status = 'rejected' 
            OR ffs.submission_status = 'refunded' 
            OR ffs.selection_status = 'refunded' 
            OR tr.status = 'refunded' 
          THEN 'Rejected'
          WHEN ffs.selection_status = 'accepted' OR ffs.selection_status = 'official selection' THEN 'Official Selection'
          WHEN ffs.selection_status = 'under review' THEN 'In Review'
          ELSE 'New Submission'
        END as status,
        CASE 
          WHEN ffs.submission_status = 'refunded' OR ffs.selection_status = 'refunded' OR tr.status = 'refunded' 
          THEN 'Submission payment was refunded.' 
          WHEN ffs.selection_status = 'rejected' THEN 'Submission was rejected.'
          ELSE NULL 
        END as rejection_reason,
        CASE 
          WHEN ffs.submission_status = 'refunded' OR ffs.selection_status = 'refunded' OR tr.status = 'refunded' 
          THEN COALESCE(tr.updated_at, ffs.updated_at) 
          WHEN ffs.selection_status = 'rejected' THEN ffs.updated_at
          ELSE NULL 
        END as rejected_at,
        ffs.created_at,
        ffs.updated_at
      FROM film_festivals_submissions ffs
      JOIN film_festivals ff ON ff.film_festival_id = ffs.festival_id
      LEFT JOIN transaction_records tr ON tr.transaction_record_id = ffs.transaction_record_id
      LEFT JOIN projects p ON p.project_id = ffs.project_id
      LEFT JOIN users u ON u.id = ffs.user_id
      LEFT JOIN individuals i ON i.user_id = u.id
      LEFT JOIN organizations o ON o.user_id = u.id
      LEFT JOIN countries c ON c.country_id = p.country_id
      LEFT JOIN film_festivals_category_milestone_prices cm ON cm.film_festival_category_milestone_price_id = ffs.film_festival_category_milestone_price_id
      LEFT JOIN film_festivals_categories cat ON cat.film_festival_category_id = cm.film_festival_category_id
      WHERE ff.event_id = ? AND (ffs.submission_status IN ('submitted', 'refunded') OR ffs.transaction_record_id IS NOT NULL OR tr.status = 'refunded')
    `, [eventId]);

    for (const s of realSubs) {
      const existing = await query('SELECT id, status, rejection_reason FROM submissions WHERE id = ?', [s.id]);
      if (existing.length === 0) {
        await query(`
          INSERT INTO submissions (id, event_id, title, director, category, runtime, country, email, synopsis, status, current_stage_name, rejection_reason, rejected_at, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          s.id, s.event_id, s.title, s.director, s.category, s.runtime, s.country, s.email, s.synopsis, s.status, s.status === 'Rejected' ? 'Rejected' : 'New Submission', s.rejection_reason, s.rejected_at, s.created_at, s.updated_at
        ]);
      } else {
        // If the upstream Freecomers submission was refunded or rejected, synchronize status down immediately!
        if (s.status === 'Rejected') {
          if (existing[0].status !== 'Rejected' || !existing[0].rejection_reason) {
            await query(`
              UPDATE submissions 
              SET status = 'Rejected', 
                  current_stage_name = 'Rejected',
                  review_state_id = NULL,
                  rejection_reason = COALESCE(rejection_reason, ?),
                  rejected_at = COALESCE(rejected_at, ?),
                  updated_at = NOW()
              WHERE id = ?
            `, [s.rejection_reason || 'Submission payment was refunded.', s.rejected_at || new Date(), s.id]);
          }
        }
      }
    }

    // Ensure any refunded submissions are flagged as Rejected
    await query(`
      UPDATE submissions s
      JOIN film_festivals_submissions ffs ON ffs.film_festivals_submission_id = s.id
      LEFT JOIN transaction_records tr ON tr.transaction_record_id = ffs.transaction_record_id
      SET s.status = 'Rejected',
          s.current_stage_name = 'Rejected',
          s.review_state_id = NULL,
          s.rejection_reason = COALESCE(s.rejection_reason, 'Submission payment was refunded.'),
          s.rejected_at = COALESCE(s.rejected_at, tr.updated_at, ffs.updated_at, NOW()),
          s.updated_at = NOW()
      WHERE (ffs.submission_status = 'refunded' OR ffs.selection_status = 'refunded' OR tr.status = 'refunded')
        AND (s.status != 'Rejected' OR s.rejection_reason IS NULL)
    `);

    // Keep submissions status synchronized with screening assignments and reviews:
    // Only transition status to 'Admin Review' when ALL assigned judges for that round have completed reviews!
    const filmStatusStats = await query(`
      SELECT 
        s.id, 
        s.status,
        s.review_state_id,
        COUNT(DISTINCT CASE WHEN sa.round_number = 1 THEN sa.id END) AS r1_assigned,
        COUNT(DISTINCT CASE WHEN sr.round_number = 1 THEN sr.id END) AS r1_reviewed,
        COUNT(DISTINCT CASE WHEN sa.round_number = 2 THEN sa.id END) AS r2_assigned,
        COUNT(DISTINCT CASE WHEN sr.round_number = 2 THEN sr.id END) AS r2_reviewed
      FROM submissions s
      LEFT JOIN screening_assignments sa ON sa.film_id = s.id AND sa.event_id = s.event_id
      LEFT JOIN screening_reviews sr ON sr.film_id = s.id AND sr.event_id = s.event_id
      WHERE s.event_id = ?
      GROUP BY s.id, s.status, s.review_state_id
    `, [eventId]);

    for (const stat of filmStatusStats) {
      // If film is in a sequential review state or fixed final status, do not overwrite with legacy screening status
      if (stat.review_state_id || ['Official Selection', 'Winner', 'Finalist', 'Rejected'].includes(stat.status)) {
        continue;
      }

      let desiredStatus = stat.status;

      if (stat.r2_assigned > 0) {
        if (stat.r2_reviewed < stat.r2_assigned) {
          // Some Round 2 reviews are pending! Status MUST be Round 2 Screening
          desiredStatus = 'Round 2 Screening';
        } else if (stat.status === 'Round 2 Screening') {
          // All Round 2 reviews completed! Transition to Admin Review
          desiredStatus = 'Admin Review';
        }
      } else if (stat.r1_assigned > 0) {
        if (stat.r1_reviewed < stat.r1_assigned) {
          // Some Round 1 reviews are pending! Status MUST be Round 1 Screening
          desiredStatus = 'Round 1 Screening';
        } else if (['Submitted', 'Round 1 Screening', 'In Review'].includes(stat.status)) {
          // All Round 1 reviews completed! Transition to Admin Review
          desiredStatus = 'Admin Review';
        }
      } else {
        if (['Round 1 Screening', 'In Review'].includes(stat.status)) {
          desiredStatus = 'Submitted';
        }
      }

      if (desiredStatus !== stat.status) {
        await query('UPDATE submissions SET status = ?, updated_at = NOW() WHERE id = ?', [desiredStatus, stat.id]);
      }
    }

    // Sync overall_average_rating strictly for the film's CURRENT sequential stage (round_number = stage_order)
    // If the film has advanced to a new stage where reviews have not yet occurred, overall_average_rating is NULL (Unrated)
    await query(`
      UPDATE submissions s
      LEFT JOIN festival_review_states frs ON frs.id = s.review_state_id
      LEFT JOIN (
        SELECT film_id, event_id, round_number, AVG(overall_rating) as avg_rating
        FROM screening_reviews
        WHERE event_id = ?
        GROUP BY film_id, event_id, round_number
      ) r ON r.film_id = s.id AND r.event_id = s.event_id AND r.round_number = frs.stage_order
      SET s.overall_average_rating = r.avg_rating
      WHERE s.event_id = ? AND (
        (r.avg_rating IS NOT NULL AND (s.overall_average_rating IS NULL OR s.overall_average_rating != r.avg_rating))
        OR (r.avg_rating IS NULL AND s.overall_average_rating IS NOT NULL)
      )
    `, [eventId, eventId]);
  } catch (err) {
    console.error('[SubmissionController] syncSubmissionsForEvent error:', err);
  }
}

/**
 * GET /api/submissions
 * Supports filtering by status, category, flag_id, search, and returns category counts.
 */
async function list(req, res) {
  try {
    const eventId = req.headers['x-event-id'] || req.headers['x-edition-id'] || req.headers['x-festival-id'] || req.query.eventId || 1;
    await syncSubmissionsForEvent(eventId);
    const { status, category, flag_id, search, stage_id, stage_name, scope, score_range, assignment_status, country, runtime_range } = req.query;

    let sql = `
      SELECT 
        s.id,
        s.title,
        s.director,
        s.category,
        s.runtime,
        s.country,
        s.status,
        s.review_state_id,
        s.current_stage_name,
        COALESCE(frs.jury_assignment_mode, 'auto') as jury_assignment_mode,
        frs.stage_order,
        s.composite_score,
        s.auto_promoted,
        s.flag_id,
        sf.label as flag_label,
        sf.color as flag_color,
        sf.is_active as flag_is_active,
        s.overall_average_rating as rating,
        s.email,
        s.synopsis,
        s.rejection_reason,
        s.rejected_at,
        s.created_at,
        COALESCE(ffs.submission_status, '') as submission_status,
        CASE WHEN ffs.submission_status = 'refunded' OR ffs.selection_status = 'refunded' OR tr.status = 'refunded' THEN 1 ELSE 0 END as is_refunded,
        COALESCE(p.project_id, ffs.project_id) as project_id,
        p.watch_link,
        p.watch_link_password,
        p.trailer_link
      FROM submissions s
      LEFT JOIN festival_review_states frs ON frs.id = s.review_state_id
      LEFT JOIN submission_flags sf ON sf.id = s.flag_id
      LEFT JOIN film_festivals_submissions ffs ON ffs.film_festivals_submission_id = s.id
      LEFT JOIN transaction_records tr ON tr.transaction_record_id = ffs.transaction_record_id
      LEFT JOIN projects p ON p.project_id = COALESCE(ffs.project_id, (SELECT p2.project_id FROM projects p2 WHERE p2.title = s.title ORDER BY p2.project_id DESC LIMIT 1))
      WHERE s.event_id = ?
    `;
    let params = [eventId];

    // Stage filters (supports matching review_state_id OR stage_order)
    if (stage_id && stage_id !== 'all') {
      sql += ' AND (s.review_state_id = ? OR s.review_state_id IN (SELECT id FROM festival_review_states WHERE event_id = ? AND stage_order = ?))';
      params.push(parseInt(stage_id, 10), eventId, parseInt(stage_id, 10));
    } else if (stage_name && stage_name !== 'all') {
      sql += ' AND (s.current_stage_name = ? OR s.review_state_id IN (SELECT id FROM festival_review_states WHERE event_id = ? AND unique_name = ?))';
      params.push(stage_name, eventId, stage_name);
    }

    // High-level Scope pill filters (All, Submitted, Under Review, Rejected)
    if (scope === 'submitted') {
      sql += ` AND s.status IN ('New Submission', 'Submitted') 
               AND s.id NOT IN (SELECT film_id FROM screening_assignments WHERE event_id = ?) 
               AND s.id NOT IN (SELECT film_id FROM screening_reviews WHERE event_id = ?)`;
      params.push(eventId, eventId);
    } else if (scope === 'rejected') {
      sql += " AND s.status = 'Rejected'";
    } else if (scope === 'under_review') {
      sql += ` AND s.status != 'Rejected'
               AND NOT (
                 s.status IN ('New Submission', 'Submitted') 
                 AND s.id NOT IN (SELECT film_id FROM screening_assignments WHERE event_id = ?) 
                 AND s.id NOT IN (SELECT film_id FROM screening_reviews WHERE event_id = ?)
               )`;
      params.push(eventId, eventId);
    } else if (status && status !== 'all') {
      if (status === 'Submitted' || status === 'New Submission') {
        sql += ` AND s.status IN ('New Submission', 'Submitted') 
                 AND s.id NOT IN (SELECT film_id FROM screening_assignments WHERE event_id = ?) 
                 AND s.id NOT IN (SELECT film_id FROM screening_reviews WHERE event_id = ?)`;
        params.push(eventId, eventId);
      } else if (status === 'Round 1 Screening' || status === 'Round 1: Screening') {
        sql += " AND (s.status IN ('Round 1 Screening', 'In Review') OR s.current_stage_name LIKE 'Round 1%')";
      } else if (status === 'Round 2 Screening' || status === 'Round 2: Consideration') {
        sql += " AND (s.status IN ('Round 2 Screening', 'Admin Review', 'Consideration') OR s.current_stage_name LIKE 'Round 2%')";
      } else if (status === 'Official Selection') {
        sql += " AND (s.status = 'Official Selection' OR s.current_stage_name = 'Official Selection')";
      } else if (status === 'Nominations') {
        sql += " AND (s.status = 'Nominations' OR s.current_stage_name = 'Nominations')";
      } else if (status === 'Official Selection Nominations') {
        sql += " AND (s.status LIKE 'Official Selection%' OR s.current_stage_name LIKE 'Official Selection%' OR s.status = 'Nominations')";
      } else if (status === 'Jury & Voting') {
        sql += " AND (s.status = 'Jury & Voting' OR s.current_stage_name = 'Jury & Voting')";
      } else if (status === 'Finalist') {
        sql += " AND (s.status = 'Finalist' OR s.current_stage_name = 'Finalist')";
      } else if (status === 'Winner') {
        sql += " AND (s.status = 'Winner' OR s.current_stage_name = 'Winner')";
      } else if (status === 'Rejected') {
        sql += " AND s.status = 'Rejected'";
      } else {
        sql += ' AND s.status = ?';
        params.push(status);
      }
    }

    if (category && category !== 'all') {
      sql += ' AND s.category = ?';
      params.push(category);
    }
    if (flag_id && flag_id !== 'all') {
      sql += ' AND s.flag_id = ?';
      params.push(flag_id);
    }
    if (country && country !== 'all') {
      sql += ' AND s.country = ?';
      params.push(country);
    }

    // Advanced score/rating filter
    if (score_range && score_range !== 'all') {
      if (score_range === 'high') {
        sql += ' AND (s.composite_score >= 4.0 OR s.overall_average_rating >= 4.0)';
      } else if (score_range === 'mid') {
        sql += ' AND ((s.composite_score >= 3.0 AND s.composite_score < 4.0) OR (s.overall_average_rating >= 3.0 AND s.overall_average_rating < 4.0))';
      } else if (score_range === 'low') {
        sql += ' AND ((s.composite_score > 0 AND s.composite_score < 3.0) OR (s.overall_average_rating > 0 AND s.overall_average_rating < 3.0))';
      } else if (score_range === 'unrated') {
        sql += ' AND ((s.composite_score IS NULL OR s.composite_score = 0) AND (s.overall_average_rating IS NULL OR s.overall_average_rating = 0))';
      }
    }

    // Jury assignment status filter
    if (assignment_status && assignment_status !== 'all') {
      if (assignment_status === 'unassigned') {
        sql += ` AND s.id NOT IN (SELECT film_id FROM screening_assignments WHERE event_id = ?) 
                 AND s.id NOT IN (SELECT film_id FROM screening_reviews WHERE event_id = ?)`;
        params.push(eventId, eventId);
      } else if (assignment_status === 'assigned') {
        sql += ` AND (s.id IN (SELECT film_id FROM screening_assignments WHERE event_id = ?) 
                 OR s.id IN (SELECT film_id FROM screening_reviews WHERE event_id = ?))`;
        params.push(eventId, eventId);
      } else if (assignment_status === 'completed') {
        sql += ` AND s.id IN (SELECT film_id FROM screening_reviews WHERE event_id = ?)`;
        params.push(eventId);
      }
    }

    // Runtime / length filter
    if (runtime_range && runtime_range !== 'all') {
      if (runtime_range === 'short') {
        sql += ' AND CAST(s.runtime AS SIGNED) > 0 AND CAST(s.runtime AS SIGNED) < 15';
      } else if (runtime_range === 'medium') {
        sql += ' AND CAST(s.runtime AS SIGNED) >= 15 AND CAST(s.runtime AS SIGNED) <= 45';
      } else if (runtime_range === 'feature') {
        sql += ' AND CAST(s.runtime AS SIGNED) > 45';
      }
    }

    if (search && search.trim()) {
      const cleanTerm = search.trim();
      const term = `%${cleanTerm}%`;
      const numTerm = parseInt(cleanTerm.replace(/^#/, ''), 10);
      if (!isNaN(numTerm) && numTerm > 0) {
        sql += ` AND (
          s.id = ? 
          OR s.title LIKE ? 
          OR s.director LIKE ? 
          OR s.country LIKE ? 
          OR s.category LIKE ?
        )`;
        params.push(numTerm, term, term, term, term);
      } else {
        sql += ` AND (
          s.title LIKE ? 
          OR s.director LIKE ? 
          OR s.country LIKE ? 
          OR s.category LIKE ? 
          OR s.rejection_reason LIKE ? 
          OR s.current_stage_name LIKE ?
          OR s.id IN (
            SELECT sa.film_id FROM screening_assignments sa 
            JOIN users u ON u.id = sa.jury_user_id 
            LEFT JOIN individuals i ON i.user_id = u.id 
            LEFT JOIN organizations o ON o.user_id = u.id 
            WHERE sa.event_id = ? AND (i.name LIKE ? OR o.name LIKE ? OR u.email LIKE ?)
          )
        )`;
        params.push(term, term, term, term, term, term, eventId, term, term, term);
      }
    }

    // Apply row-level permission scoping
    const scoped = scopeSubmissionsQuery(sql, params, req.permissionScope);
    sql = scoped.sql;
    params = scoped.params;
    sql += ' ORDER BY s.id ASC';

    const submissions = await query(sql, params);

    // Fetch assignments and reviews for inline juror breakdown
    const filmIds = submissions.map(s => s.id);
    let jurorScoresByFilm = {};
    let assignedJuryNamesByFilm = {};
    let reviews = [];
    let assignments = [];

    if (filmIds.length > 0) {
      // Map stage ID to stage_order to strictly associate jury assignments and reviews to the CURRENT stage
      const stateOrderRows = await query('SELECT id, stage_order FROM festival_review_states WHERE event_id = ?', [eventId]);
      const stateOrderMap = {};
      for (const st of stateOrderRows) {
        stateOrderMap[st.id] = st.stage_order;
      }

      assignments = await query(`
        SELECT sa.film_id, sa.jury_user_id, sa.round_number, sa.status,
               COALESCE(i.name, o.name, u.email) as juror_name,
               COALESCE(i.thumbnail_pic, o.thumbnail_pic, i.profile_pic, o.profile_pic) as thumbnail_pic
        FROM screening_assignments sa
        JOIN users u ON u.id = sa.jury_user_id
        LEFT JOIN individuals i ON i.user_id = u.id
        LEFT JOIN organizations o ON o.user_id = u.id
        WHERE sa.film_id IN (${filmIds.map(() => '?').join(',')}) AND sa.event_id = ?
      `, [...filmIds, eventId]);

      reviews = await query(`
        SELECT sr.film_id, sr.jury_user_id, sr.round_number, sr.overall_rating, sr.notes, sr.submitted_at,
               COALESCE(i.name, o.name, u.email) as juror_name,
               COALESCE(i.thumbnail_pic, o.thumbnail_pic, i.profile_pic, o.profile_pic) as thumbnail_pic
        FROM screening_reviews sr
        JOIN users u ON u.id = sr.jury_user_id
        LEFT JOIN individuals i ON i.user_id = u.id
        LEFT JOIN organizations o ON o.user_id = u.id
        WHERE sr.film_id IN (${filmIds.map(() => '?').join(',')}) AND sr.event_id = ?
      `, [...filmIds, eventId]);

      for (const sub of submissions) {
        jurorScoresByFilm[sub.id] = [];
        assignedJuryNamesByFilm[sub.id] = new Set();

        const currentRound = (sub.review_state_id && stateOrderMap[sub.review_state_id]) || (sub.status === 'Submitted' || sub.status === 'New Submission' ? 0 : 1);
        if (currentRound > 0) {
          const currentAssigns = assignments.filter(a => a.film_id === sub.id && a.round_number === currentRound);
          const currentRevs = reviews.filter(r => r.film_id === sub.id && r.round_number === currentRound);

          for (const a of currentAssigns) {
            assignedJuryNamesByFilm[sub.id].add(a.juror_name);
            const rev = currentRevs.find(r => r.jury_user_id === a.jury_user_id);
            jurorScoresByFilm[sub.id].push({
              name: a.juror_name,
              role: `Stage ${currentRound} Panel`,
              score: rev ? `★ ${parseFloat(rev.overall_rating).toFixed(1)}` : '—',
              status: rev ? 'Done' : 'Pending',
              note: rev ? (rev.notes || 'Scorecard submitted.') : 'Assigned',
              thumbnail: formatThumbnailUrl(a.thumbnail_pic || rev?.thumbnail_pic)
            });
          }

          // Standalone reviews in current round without pre-assignment
          for (const r of currentRevs) {
            assignedJuryNamesByFilm[sub.id].add(r.juror_name);
            if (!jurorScoresByFilm[sub.id].some(item => item.name === r.juror_name)) {
              jurorScoresByFilm[sub.id].push({
                name: r.juror_name,
                role: `Stage ${currentRound} Panel`,
                score: `★ ${parseFloat(r.overall_rating).toFixed(1)}`,
                status: 'Done',
                note: r.notes || 'Scorecard submitted.',
                thumbnail: formatThumbnailUrl(r.thumbnail_pic)
              });
            }
          }
        }
      }
    }

    const isJuryUser = Boolean(
      req.user && (
        req.user.current_group === 'jury' ||
        req.user.current_group === 'judge' ||
        req.user.role === 'jury' ||
        req.user.role === 'judge' ||
        req.permissionScope?.scopeKey === 'assigned'
      ) && !req.user.isSuperAdmin && req.user.role !== 'Admin'
    );
    const currentJurorUserIds = req.permissionScope?.allUserIds || (req.user?.id ? [req.user.id] : []);

    // Load state order and jury mode mapping for stage-aware scoring
    const stateOrderRows = await query('SELECT id, stage_order, unique_name, jury_assignment_mode FROM festival_review_states WHERE event_id = ?', [eventId]);
    const stateOrderMap = {};
    const stateModeMap = {};
    for (const st of stateOrderRows) {
      stateOrderMap[st.id] = st.stage_order;
      stateModeMap[st.id] = st.jury_assignment_mode;
    }

    // Attach jurorScores, jury summary string, and canAdvance flag to each submission
    const enrichedSubmissions = submissions.map(sub => {
      const isRejected = sub.status === 'Rejected';
      const currentRound = (sub.review_state_id && stateOrderMap[sub.review_state_id]) || (sub.status === 'Submitted' || sub.status === 'New Submission' ? 0 : 1);

      // Current round reviews only
      const currentRoundRevs = currentRound > 0 ? reviews.filter(r => r.film_id === sub.id && r.round_number === currentRound) : [];
      const currentRoundAvg = currentRoundRevs.length > 0 
        ? (currentRoundRevs.reduce((sum, r) => sum + parseFloat(r.overall_rating || 0), 0) / currentRoundRevs.length).toFixed(1)
        : null;

      // ── STRICT JURY BLIND REVIEW PROTECTION ──
      // Jurors must never see fellow jurors' names, notes, completion status, or peer scores.
      if (isJuryUser) {
        const myReview = currentRound > 0 ? reviews.find(r => r.film_id === sub.id && r.round_number === currentRound && currentJurorUserIds.includes(r.jury_user_id)) : null;
        const myAssignment = currentRound > 0 ? assignments.find(a => a.film_id === sub.id && a.round_number === currentRound && currentJurorUserIds.includes(a.jury_user_id)) : null;
        const myScoreNum = myReview && myReview.overall_rating ? parseFloat(myReview.overall_rating).toFixed(1) : null;

        return {
          ...sub,
          // Redact aggregate/composite score so it doesn't bias the juror before or during rating
          rating: myScoreNum,
          composite_score: myScoreNum,
          my_rating: myScoreNum,
          my_review_status: myReview ? 'Done' : (myAssignment ? 'Pending' : 'Not Assigned'),
          my_notes: myReview ? myReview.notes : null,
          jurorScores: myReview ? [{
            name: 'You',
            role: 'Screening Jury',
            score: `★ ${myScoreNum}`,
            status: 'Done',
            note: myReview.notes || 'Scorecard submitted'
          }] : [{
            name: 'You',
            role: 'Screening Jury',
            score: '—',
            status: 'Pending',
            note: myAssignment ? 'Pending your review' : 'Not assigned in this stage'
          }],
          jury: myAssignment ? 'Assigned to You' : 'Not Assigned to You',
          canAdvance: false
        };
      }

      const scores = jurorScoresByFilm[sub.id] || [];
      const juryNamesSet = assignedJuryNamesByFilm[sub.id];
      const isNoJuryStage = sub.status === 'Winner' || 
        sub.current_stage_name === 'Winner' || 
        sub.jury_assignment_mode === 'none' ||
        (sub.review_state_id && stateModeMap[sub.review_state_id] === 'none');

      const juryString = isRejected && (!juryNamesSet || juryNamesSet.size === 0)
        ? 'No jury assigned'
        : (isNoJuryStage && (!juryNamesSet || juryNamesSet.size === 0)
            ? 'No jury required'
            : (juryNamesSet && juryNamesSet.size > 0 
                ? Array.from(juryNamesSet).map(n => n.split(' ')[0]).join(', ')
                : 'Unassigned'));

      const numericRating = parseFloat(currentRoundAvg) || 0;
      const canAdvance = !isRejected && sub.status !== 'Winner' && (numericRating >= 4.0 || (sub.composite_score && sub.composite_score >= 4.0));

      return {
        ...sub,
        rating: currentRoundAvg,
        composite_score: currentRoundAvg,
        overall_average_rating: currentRoundAvg,
        jurorScores: scores,
        jury: juryString,
        is_no_jury_stage: Boolean(isNoJuryStage),
        jury_assignment_mode: (sub.review_state_id && stateModeMap[sub.review_state_id]) || (isNoJuryStage ? 'none' : 'auto'),
        canAdvance
      };
    });

    // Pipeline Stepper (Active sequential stages for this event)
    const pipelineStates = await query(`
      SELECT 
        s.id, s.stage_order, s.unique_name, s.review_type, s.star_scale, s.auto_advance_cutoff, s.auto_reject_cutoff, s.status,
        s.award_criteria, s.vote_mode, s.rank_mode, s.jury_assignment_mode,
        (SELECT COUNT(*) FROM submissions sub WHERE sub.event_id = s.event_id AND sub.review_state_id = s.id AND sub.status != 'Rejected') as film_count
      FROM festival_review_states s
      WHERE s.event_id = ? AND (s.status IS NULL OR s.status != 'inactive')
      ORDER BY s.stage_order ASC
    `, [eventId]);

    const pipelineStepper = pipelineStates.map((ps, idx) => {
      let subDesc = 'Active';
      if (ps.review_type === 'star_based' || ps.review_type === 'star_rating') subDesc += ` · ${ps.film_count || 0} Films · ${ps.star_scale || 5} Stars`;
      else if (ps.review_type === 'vote_based' || ps.review_type === 'vote_nomination') subDesc += ` · ${ps.film_count || 0} Films · Ballot`;
      else subDesc += ` · ${ps.film_count || 0} Films`;

      let parsedAwards = [];
      if (ps.award_criteria) {
        try {
          parsedAwards = typeof ps.award_criteria === 'string' ? JSON.parse(ps.award_criteria) : ps.award_criteria;
        } catch (e) {}
      }

      return {
        id: ps.id,
        stage_order: idx + 1,
        order: idx + 1,
        unique_name: ps.unique_name,
        name: ps.unique_name,
        title: ps.unique_name,
        status: ps.status || 'active',
        count: parseInt(ps.film_count, 10) || 0,
        film_count: parseInt(ps.film_count, 10) || 0,
        filmCount: parseInt(ps.film_count, 10) || 0,
        subText: subDesc,
        review_type: ps.review_type,
        star_scale: ps.star_scale,
        vote_mode: ps.vote_mode,
        rank_mode: ps.rank_mode,
        jury_assignment_mode: ps.jury_assignment_mode,
        award_criteria: Array.isArray(parsedAwards) ? parsedAwards : [],
        auto_advance_cutoff: ps.auto_advance_cutoff,
        auto_reject_cutoff: ps.auto_reject_cutoff
      };
    });

    // Counts for high-level pills
    const totalCount = await query('SELECT count(*) as cnt FROM submissions WHERE event_id = ?', [eventId]);
    const submittedCount = await query(`
      SELECT count(*) as cnt FROM submissions 
      WHERE event_id = ? AND status IN ('New Submission', 'Submitted') 
        AND id NOT IN (SELECT film_id FROM screening_assignments WHERE event_id = ?) 
        AND id NOT IN (SELECT film_id FROM screening_reviews WHERE event_id = ?)
    `, [eventId, eventId, eventId]);
    const rejectedCount = await query("SELECT count(*) as cnt FROM submissions WHERE event_id = ? AND status = 'Rejected'", [eventId]);

    const totalCnt = totalCount[0]?.cnt || 0;
    const submittedCnt = submittedCount[0]?.cnt || 0;
    const rejectedCnt = rejectedCount[0]?.cnt || 0;
    const underReviewCnt = Math.max(0, totalCnt - submittedCnt - rejectedCnt);

    const counts = {
      total: totalCnt,
      submitted: submittedCnt,
      under_review: underReviewCnt,
      underReview: underReviewCnt,
      rejected: rejectedCnt
    };

    let flags = await query('SELECT id, label, color, is_active, sort_order FROM submission_flags WHERE event_id = ? ORDER BY sort_order ASC, id ASC', [eventId]);
    if (flags.length === 0) {
      flags = await query('SELECT id, label, color, is_active, sort_order FROM submission_flags ORDER BY sort_order ASC, label ASC');
    }

    const countryRows = await query('SELECT DISTINCT country FROM submissions WHERE event_id = ? AND country IS NOT NULL AND country != "" ORDER BY country ASC', [eventId]);
    const availableCountries = countryRows.map(r => r.country).filter(Boolean);

    res.json({
      data: enrichedSubmissions,
      total: enrichedSubmissions.length,
      counts,
      pipelineStepper,
      flags,
      availableCountries
    });
  } catch (error) {
    console.error('[SubmissionController] list error:', error);
    res.status(500).json({ error: 'Failed to retrieve submissions.' });
  }
}

/**
 * GET /api/submissions/:id
 */
async function getById(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    const eventId = req.headers['x-event-id'] || req.headers['x-edition-id'] || req.headers['x-festival-id'] || 1;
    await syncSubmissionsForEvent(eventId);

    if (req.permissionScope && !req.permissionScope.isWildcard && req.permissionScope.scopeKey !== 'all') {
      const allowed = await canAccessSubmission(id, req.permissionScope);
      if (!allowed) {
        return res.status(403).json({ error: 'Access denied: submission is outside your assigned scope.' });
      }
    }

    const rows = await query(`
      SELECT 
        s.id,
        s.event_id,
        s.title,
        s.director,
        s.category,
        s.runtime,
        s.country,
        s.status,
        s.review_state_id,
        s.current_stage_name,
        s.composite_score,
        s.flag_id,
        sf.label as flag_label,
        sf.color as flag_color,
        s.overall_average_rating as rating,
        s.email,
        s.synopsis,
        s.rejection_reason,
        s.rejected_at,
        s.created_at,
        COALESCE(ffs.submission_status, '') as submission_status,
        CASE WHEN ffs.submission_status = 'refunded' OR ffs.selection_status = 'refunded' OR tr.status = 'refunded' THEN 1 ELSE 0 END as is_refunded,
        COALESCE(p.project_id, ffs.project_id) as project_id,
        p.watch_link,
        p.watch_link_password,
        p.trailer_link
      FROM submissions s
      LEFT JOIN submission_flags sf ON sf.id = s.flag_id
      LEFT JOIN film_festivals_submissions ffs ON ffs.film_festivals_submission_id = s.id
      LEFT JOIN transaction_records tr ON tr.transaction_record_id = ffs.transaction_record_id
      LEFT JOIN projects p ON p.project_id = COALESCE(ffs.project_id, (SELECT p2.project_id FROM projects p2 WHERE p2.title = s.title ORDER BY p2.project_id DESC LIMIT 1))
      WHERE s.id = ?
    `, [id]);

    if (rows.length === 0) return res.status(404).json({ error: 'Submission not found.' });

    // Fetch assignments for this film
    // Fetch assigned jury members
    const assignments = await query(`
      SELECT 
        sa.id as assignment_id,
        sa.film_id,
        sa.round_number,
        sa.jury_user_id,
        sa.status as assignment_status,
        sa.assigned_at,
        sa.completed_at,
        COALESCE(i.name, o.name, u.email) as jury_name,
        u.email as jury_email
      FROM screening_assignments sa
      JOIN users u ON u.id = sa.jury_user_id
      LEFT JOIN individuals i ON i.user_id = u.id
      LEFT JOIN organizations o ON o.user_id = u.id
      WHERE sa.film_id = ?
      ORDER BY sa.round_number ASC, sa.id ASC
    `, [id]);

    // Fetch review details if available
    const reviews = await query(`
      SELECT 
        sr.id as review_id,
        sr.assignment_id,
        sr.film_id,
        sr.jury_user_id,
        sr.round_number,
        sr.criteria_scores,
        sr.overall_rating,
        sr.notes,
        sr.submitted_at,
        COALESCE(i.name, o.name, u.email) as jury_name,
        u.email as jury_email
      FROM screening_reviews sr
      JOIN users u ON u.id = sr.jury_user_id
      LEFT JOIN individuals i ON i.user_id = u.id
      LEFT JOIN organizations o ON o.user_id = u.id
      WHERE sr.film_id = ?
    `, [id]);

    // Determine film's current round number from its review_state_id
    let currentRound = 0;
    if (rows[0].review_state_id) {
      const stateRow = await query('SELECT stage_order FROM festival_review_states WHERE id = ?', [rows[0].review_state_id]);
      if (stateRow.length > 0) currentRound = stateRow[0].stage_order;
    } else if (rows[0].status !== 'Submitted') {
      currentRound = 1;
    }

    // Filter assignments and reviews strictly for the current round
    const currentAssignments = currentRound > 0 ? assignments.filter(a => a.round_number === currentRound) : [];
    const currentReviews = currentRound > 0 ? reviews.filter(r => r.round_number === currentRound) : [];

    // Calculate rating strictly for the current round
    const currentRoundAvg = currentReviews.length > 0 
      ? (currentReviews.reduce((sum, r) => sum + parseFloat(r.overall_rating || 0), 0) / currentReviews.length).toFixed(1)
      : null;

    // Merge assignments with review outcomes for the current round so only current stage jury appears
    const mergedReviewItems = currentAssignments.map(a => {
      const rev = currentReviews.find(r => (r.assignment_id && r.assignment_id === a.assignment_id) || (r.jury_user_id === a.jury_user_id));
      return {
        assignment_id: a.assignment_id,
        jury_user_id: a.jury_user_id,
        jury_id: a.jury_user_id,
        judge_id: a.jury_user_id,
        jury_name: a.jury_name,
        jury_email: a.jury_email,
        email: a.jury_email,
        judge_name: a.jury_name,
        name: a.jury_name,
        round_number: a.round_number || currentRound,
        status: rev ? 'completed' : (a.assignment_status || 'assigned'),
        overall_rating: rev ? rev.overall_rating : null,
        criteria_scores: rev ? (typeof rev.criteria_scores === 'string' ? JSON.parse(rev.criteria_scores) : rev.criteria_scores) : null,
        notes: rev ? rev.notes : null,
        submitted_at: rev ? rev.submitted_at : null,
      };
    });

    // Also include any standalone review in current round without an assignment
    currentReviews.forEach(r => {
      if (!mergedReviewItems.some(item => (r.assignment_id && item.assignment_id === r.assignment_id) || (item.jury_id === r.jury_user_id))) {
        mergedReviewItems.push({
          assignment_id: r.assignment_id,
          jury_user_id: r.jury_user_id,
          jury_id: r.jury_user_id,
          judge_id: r.jury_user_id,
          jury_name: r.jury_name,
          jury_email: r.jury_email,
          email: r.jury_email,
          judge_name: r.jury_name,
          name: r.jury_name,
          round_number: r.round_number || currentRound,
          status: 'completed',
          overall_rating: r.overall_rating,
          criteria_scores: typeof r.criteria_scores === 'string' ? JSON.parse(r.criteria_scores) : r.criteria_scores,
          notes: r.notes,
          submitted_at: r.submitted_at,
        });
      }
    });

    // Set film rating attributes strictly to the current round
    rows[0].rating = currentRoundAvg;
    rows[0].overall_average_rating = currentRoundAvg;
    rows[0].composite_score = currentRoundAvg;
    rows[0].current_round = currentRound;

    // Fetch audit logs
    const logs = await query(`
      SELECT sl.action, sl.notes, sl.created_at, COALESCE(i.name, o.name, u.email) as actor_name
      FROM submission_logs sl
      LEFT JOIN users u ON u.id = sl.actor_user_id
      LEFT JOIN individuals i ON i.user_id = u.id
      LEFT JOIN organizations o ON o.user_id = u.id
      WHERE sl.submission_id = ?
      ORDER BY sl.created_at DESC
    `, [id]);

    // Fetch dynamic review stage criteria
    let stageCriteria = [];
    const targetEventId = rows[0].event_id || eventId || 40;
    const reviewStateId = rows[0].review_state_id;

    const isJuryVotingStage = currentRound === 5 || 
      (rows[0].current_stage_name && rows[0].current_stage_name.toLowerCase().includes('jury')) ||
      (rows[0].status && rows[0].status.toLowerCase().includes('jury'));

    if (isJuryVotingStage) {
      // 1. Nominated award categories for this specific film
      const filmNoms = await query(`
        SELECT acn.id, acn.award_name, acn.award_category_id
        FROM award_category_nominations acn
        WHERE acn.event_id = ? AND acn.submission_id = ?
        ORDER BY acn.id ASC
      `, [targetEventId, id]);

      if (filmNoms.length > 0) {
        stageCriteria = filmNoms.map((nom, idx) => ({
          id: nom.award_category_id || nom.id || idx + 1,
          label: nom.award_name,
          criterion_key: `award_${nom.award_name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
          weight_percentage: null,
          sort_order: idx + 1,
          is_award_category: true,
          description: `Rate performance for ${nom.award_name}`
        }));
      } else {
        // 2. Fallback: all active award categories for this event
        const eventAwards = await query(`
          SELECT id, name FROM award_categories 
          WHERE event_id = ? 
          ORDER BY order_index ASC, id ASC
        `, [targetEventId]);

        if (eventAwards.length > 0) {
          stageCriteria = eventAwards.map((ac, idx) => ({
            id: ac.id,
            label: ac.name,
            criterion_key: `award_${ac.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
            weight_percentage: null,
            sort_order: idx + 1,
            is_award_category: true,
            description: `Rate performance for ${ac.name}`
          }));
        }
      }
    } else {
      if (reviewStateId) {
        stageCriteria = await query(
          'SELECT id, label, criterion_key, weight_percentage, sort_order FROM festival_state_criteria WHERE state_id = ? AND event_id = ? ORDER BY sort_order ASC',
          [reviewStateId, targetEventId]
        );
      }
      if (stageCriteria.length === 0) {
        // Fallback to active Round 1 stage criteria for this event
        stageCriteria = await query(`
          SELECT fsc.id, fsc.label, fsc.criterion_key, fsc.weight_percentage, fsc.sort_order 
          FROM festival_state_criteria fsc
          JOIN festival_review_states frs ON frs.id = fsc.state_id
          WHERE frs.event_id = ? AND frs.stage_order = 1
          ORDER BY fsc.sort_order ASC
        `, [targetEventId]);
      }
    }

    const isJuryUser = Boolean(
      req.user && (
        req.user.current_group === 'jury' ||
        req.user.current_group === 'judge' ||
        req.user.role === 'jury' ||
        req.user.role === 'judge' ||
        req.permissionScope?.scopeKey === 'assigned'
      ) && !req.user.isSuperAdmin && req.user.role !== 'Admin'
    );

    if (isJuryUser) {
      const currentJurorUserIds = req.permissionScope?.allUserIds || (req.user?.id ? [req.user.id] : []);
      const myMergedReviewItems = mergedReviewItems.filter(item => currentJurorUserIds.includes(item.jury_user_id));
      const myAssignments = assignments.filter(a => currentJurorUserIds.includes(a.jury_user_id));
      const myReview = myMergedReviewItems[0];
      const myScoreNum = myReview && myReview.overall_rating ? parseFloat(myReview.overall_rating).toFixed(1) : null;

      return res.json({
        ...rows[0],
        is_award_category_stage: isJuryVotingStage,
        rating: myScoreNum,
        composite_score: myScoreNum,
        overall_average_rating: myScoreNum,
        assigned_jury: myMergedReviewItems,
        assigned_judges: myMergedReviewItems,
        reviews: myMergedReviewItems,
        assignments: myAssignments,
        stage_criteria: stageCriteria,
        logs: []
      });
    }

    res.json({
      ...rows[0],
      is_award_category_stage: isJuryVotingStage,
      assigned_jury: mergedReviewItems,
      assigned_judges: mergedReviewItems,
      reviews: mergedReviewItems,
      assignments,
      stage_criteria: stageCriteria,
      logs
    });
  } catch (error) {
    console.error('[SubmissionController] getById error:', error);
    res.status(500).json({ error: 'Failed to retrieve submission.' });
  }
}

/**
 * POST /api/submissions/:id/reject
 * Enforces mandatory rejection reason >= 10 characters.
 */
async function reject(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    const eventId = req.headers['x-event-id'] || req.headers['x-edition-id'] || req.headers['x-festival-id'] || 1;
    const { reason } = req.body;

    if (!reason || typeof reason !== 'string' || reason.trim().length < 10) {
      return res.status(400).json({
        error: 'Rejection reason must be at least 10 characters long to maintain filmmaker transparency.'
      });
    }

    const trimmedReason = reason.trim();
    await query(`
      UPDATE submissions 
      SET status = 'Rejected', rejection_reason = ?, rejected_at = NOW() 
      WHERE id = ? AND event_id = ?
    `, [trimmedReason, id, eventId]);

    // Also update Freecomers real table if this was a film_festivals_submission
    await query(`
      UPDATE film_festivals_submissions 
      SET selection_status = 'rejected', updated_at = NOW() 
      WHERE film_festivals_submission_id = ?
    `, [id]);

    await query(`
      INSERT INTO submission_logs (submission_id, action, notes, actor_user_id)
      VALUES (?, 'REJECT', ?, ?)
    `, [id, `Rejected with reason: "${trimmedReason}"`, req.user.id]);

    res.json({
      message: 'Submission rejected and filmmaker notification queued.',
      submissionId: id,
      status: 'Rejected',
      reason: trimmedReason
    });
  } catch (error) {
    console.error('[SubmissionController] reject error:', error);
    res.status(500).json({ error: 'Failed to reject submission.' });
  }
}

/**
 * POST /api/submissions/:id/flag
 * Set or remove flag.
 */
async function flag(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    const { flag_id } = req.body;

    await query(`
      UPDATE submissions 
      SET flag_id = ? 
      WHERE id = ?
    `, [flag_id || null, id]);

    await query(`
      INSERT INTO submission_logs (submission_id, action, notes, actor_user_id)
      VALUES (?, 'FLAG_UPDATE', ?, ?)
    `, [id, flag_id ? `Flag updated to ${flag_id}` : 'Flag cleared', req.user.id]);

    const updatedRows = await query(`
      SELECT 
        s.id,
        s.title,
        s.director,
        s.category,
        s.runtime,
        s.country,
        s.status,
        s.flag_id,
        sf.label as flag_label,
        sf.color as flag_color,
        s.overall_average_rating as rating,
        s.email,
        s.synopsis,
        s.rejection_reason,
        s.rejected_at,
        s.created_at
      FROM submissions s
      LEFT JOIN submission_flags sf ON sf.id = s.flag_id
      WHERE s.id = ?
    `, [id]);

    res.json({ message: 'Submission flag updated.', flag_id, film: updatedRows[0] || null });
  } catch (error) {
    console.error('[SubmissionController] flag error:', error);
    res.status(500).json({ error: 'Failed to update submission flag.' });
  }
}

/**
 * PUT /api/submissions/:id/status
 */
async function updateStatus(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    const eventId = req.headers['x-event-id'] || req.headers['x-edition-id'] || req.headers['x-festival-id'] || 1;
    const { status } = req.body;

    if (!status) return res.status(400).json({ error: 'Status is required.' });

    await query(`
      UPDATE submissions 
      SET status = ? 
      WHERE id = ? AND event_id = ?
    `, [status, id, eventId]);

    let ffsStatus = 'awaiting decision';
    if (status === 'Official Selection' || status === 'accepted') ffsStatus = 'accepted';
    else if (status === 'Rejected') ffsStatus = 'rejected';
    else if (status === 'In Review') ffsStatus = 'under review';

    await query(`
      UPDATE film_festivals_submissions 
      SET selection_status = ?, updated_at = NOW() 
      WHERE film_festivals_submission_id = ?
    `, [ffsStatus, id]);

    await query(`
      INSERT INTO submission_logs (submission_id, action, notes, actor_user_id)
      VALUES (?, 'STATUS_CHANGE', ?, ?)
    `, [id, `Status transitioned to ${status}`, req.user.id]);

    res.json({ message: `Submission status updated to ${status}.` });
  } catch (error) {
    console.error('[SubmissionController] updateStatus error:', error);
    res.status(500).json({ error: 'Failed to update submission status.' });
  }
}


/**
 * PUT /api/submissions/:id/category
 * Update submission category directly in database.
 */
async function updateCategory(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    const eventId = req.headers['x-event-id'] || req.headers['x-edition-id'] || req.headers['x-festival-id'] || 1;
    const { category } = req.body;

    if (!category || !category.trim()) {
      return res.status(400).json({ error: 'Category is required.' });
    }

    await query('UPDATE submissions SET category = ?, updated_at = NOW() WHERE id = ? AND event_id = ?', [category.trim(), id, eventId]);

    await query(`
      INSERT INTO submission_logs (submission_id, action, notes, actor_user_id)
      VALUES (?, 'CATEGORY_UPDATE', ?, ?)
    `, [id, `Category changed to: ${category.trim()}`, req.user.id]);

    res.json({ success: true, message: 'Category updated successfully.', category: category.trim() });
  } catch (error) {
    console.error('[SubmissionController] updateCategory error:', error);
    res.status(500).json({ error: 'Failed to update submission category.' });
  }
}

/**
 * PUT /api/submissions/:id/stage
 * Move submission to another review state.
 */
async function updateStage(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    const eventId = req.headers['x-event-id'] || req.headers['x-edition-id'] || req.headers['x-festival-id'] || 1;
    const { review_state_id, stage_name } = req.body;

    if (
      stage_name === 'Submitted' || 
      stage_name === 'Submitted (Intake)' || 
      review_state_id === 'intake-submitted' || 
      review_state_id === 'stage-submitted'
    ) {
      await query(`
        UPDATE submissions 
        SET review_state_id = NULL, current_stage_name = 'New Submission', status = 'New Submission', updated_at = NOW()
        WHERE id = ? AND event_id = ?
      `, [id, eventId]);
      const updatedRows = await query('SELECT * FROM submissions WHERE id = ?', [id]);
      return res.json({ success: true, message: 'Submission moved to New Submission (Intake).', submission: updatedRows[0] });
    }

    let stateRows = [];
    if (review_state_id && typeof review_state_id === 'number') {
      stateRows = await query('SELECT id, stage_order, unique_name FROM festival_review_states WHERE id = ? AND event_id = ?', [review_state_id, eventId]);
    } else if (stage_name) {
      stateRows = await query('SELECT id, stage_order, unique_name FROM festival_review_states WHERE unique_name = ? AND event_id = ?', [stage_name, eventId]);
    }

    if (stateRows.length === 0) {
      return res.status(404).json({ error: 'Review state not found for this event.' });
    }

    const state = stateRows[0];
    await query(`
      UPDATE submissions 
      SET review_state_id = ?, current_stage_name = ?, status = ?, overall_average_rating = NULL, composite_score = NULL, updated_at = NOW()
      WHERE id = ? AND event_id = ?
    `, [state.id, state.unique_name, state.unique_name, id, eventId]);

    // Trigger stage-configured jury assignment
    await autoAssignJuryForFilmStage(eventId, id, state.id, state.stage_order);

    await query(`
      INSERT INTO submission_logs (submission_id, action, notes, actor_user_id)
      VALUES (?, 'STAGE_CHANGE', ?, ?)
    `, [id, `Moved to stage: ${state.unique_name}`, req.user.id]);

    const updatedRows = await query('SELECT * FROM submissions WHERE id = ?', [id]);

    res.json({ success: true, message: `Submission moved to ${state.unique_name}.`, stage: state, submission: updatedRows[0] });
  } catch (error) {
    console.error('[SubmissionController] updateStage error:', error);
    res.status(500).json({ error: 'Failed to update review state.' });
  }
}

/**
 * Auto-assigns jury members to a film based on the review stage configuration.
 * - Condition 2.1: 'all_jury' -> Assigns all active jurors for the event.
 * - Condition 2.2: 'manual' -> Skips auto-assignment (Admin assigns manually).
 * - Condition 2.3: 'n_jury' -> Assigns <n> jurors using least-loaded distribution.
 */
async function autoAssignJuryForFilmStage(eventId, filmId, stageId, roundNumber) {
  try {
    const stageRows = await query('SELECT id, jury_assignment_mode, jury_auto_rule, jury_count_per_film, stage_order FROM festival_review_states WHERE id = ? AND event_id = ?', [stageId, eventId]);
    if (stageRows.length === 0) return;
    const stage = stageRows[0];
    const round = roundNumber || stage.stage_order || 1;

    // If manual or no jury assignment ('none'), skip auto assignment
    if (stage.jury_assignment_mode === 'manual' || stage.jury_assignment_mode === 'none') {
      return;
    }

    // Auto assignment mode: fetch active jurors strictly assigned to this event
    let jurors = await query(`
      SELECT DISTINCT u.id, u.email
      FROM users u
      JOIN user_event_groups ueg ON ueg.user_id = u.id
      JOIN \`groups\` g ON g.id = ueg.group_id
      WHERE ueg.event_id = ? AND g.group_key IN ('jury', 'judge')
      ORDER BY u.id ASC
    `, [eventId]);

    if (!jurors || jurors.length === 0) return;

    let selectedJurorIds = [];

    if (stage.jury_auto_rule === 'n_jury') {
      // Condition 2.3: Every film will be reviewed by <n> jury
      const n = Math.max(1, Math.min(stage.jury_count_per_film || 1, jurors.length));
      const jurorIds = jurors.map(j => j.id);

      // Workload-balanced selection: count assignments each juror currently has in this round
      const workloadRows = await query(`
        SELECT jury_user_id, COUNT(*) as assigned_count
        FROM screening_assignments
        WHERE event_id = ? AND round_number = ? AND jury_user_id IN (${jurorIds.map(() => '?').join(',')})
        GROUP BY jury_user_id
      `, [eventId, round, ...jurorIds]);

      const workloadMap = {};
      for (const row of workloadRows) {
        workloadMap[row.jury_user_id] = row.assigned_count;
      }

      // Sort jurors by least assignments first
      const sortedJurors = [...jurors].sort((a, b) => {
        const countA = workloadMap[a.id] || 0;
        const countB = workloadMap[b.id] || 0;
        return countA - countB;
      });

      selectedJurorIds = sortedJurors.slice(0, n).map(j => j.id);
    } else {
      // Condition 2.1: Every jury will review all films of this stage
      selectedJurorIds = jurors.map(j => j.id);
    }

    // Create assignments
    for (const jId of selectedJurorIds) {
      const existing = await query(`
        SELECT id FROM screening_assignments 
        WHERE event_id = ? AND film_id = ? AND jury_user_id = ? AND round_number = ?
      `, [eventId, filmId, jId, round]);

      if (existing.length === 0) {
        await query(`
          INSERT INTO screening_assignments (event_id, film_id, jury_user_id, round_number, status, assigned_at)
          VALUES (?, ?, ?, ?, 'assigned', NOW())
        `, [eventId, filmId, jId, round]);
      }
    }
  } catch (err) {
    console.error('[AutoAssignJury] error:', err);
  }
}

/**
 * POST /api/submissions/:id/advance
 * Advance single film to next sequential review state.
 */
async function advanceFilm(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    const eventId = req.headers['x-event-id'] || req.headers['x-edition-id'] || req.headers['x-festival-id'] || 1;

    const filmRows = await query('SELECT id, review_state_id, current_stage_name FROM submissions WHERE id = ? AND event_id = ?', [id, eventId]);
    if (filmRows.length === 0) {
      return res.status(404).json({ error: 'Submission not found.' });
    }

    const currentFilm = filmRows[0];
    let currentOrder = 0;
    if (currentFilm.review_state_id) {
      const orderRow = await query('SELECT stage_order FROM festival_review_states WHERE id = ?', [currentFilm.review_state_id]);
      if (orderRow.length > 0) currentOrder = orderRow[0].stage_order;
    }

    // Find next stage (skipping inactive stages)
    const nextStageRows = await query(
      'SELECT id, stage_order, unique_name FROM festival_review_states WHERE event_id = ? AND stage_order > ? AND (status IS NULL OR status != "inactive") ORDER BY stage_order ASC LIMIT 1',
      [eventId, currentOrder]
    );

    if (nextStageRows.length === 0) {
      return res.status(400).json({ error: 'This film is already in the final review stage.' });
    }

    const nextStage = nextStageRows[0];
    await query(`
      UPDATE submissions 
      SET review_state_id = ?, current_stage_name = ?, status = ?, overall_average_rating = NULL, composite_score = NULL, updated_at = NOW()
      WHERE id = ? AND event_id = ?
    `, [nextStage.id, nextStage.unique_name, nextStage.unique_name, id, eventId]);

    // Trigger stage-configured jury assignment (Auto: all / n-jury, or Manual)
    await autoAssignJuryForFilmStage(eventId, id, nextStage.id, nextStage.stage_order);

    await query(`
      INSERT INTO submission_logs (submission_id, action, notes, actor_user_id)
      VALUES (?, 'STAGE_ADVANCE', ?, ?)
    `, [id, `Advanced from ${currentOrder === 0 ? 'Submitted' : `Stage ${currentOrder}`} to Stage ${nextStage.stage_order} (${nextStage.unique_name})`, req.user.id]);

    const updatedRows = await query('SELECT * FROM submissions WHERE id = ?', [id]);

    res.json({ 
      success: true, 
      message: `Film successfully advanced to ${nextStage.unique_name}!`, 
      nextStage, 
      next_stage_name: nextStage.unique_name,
      submission: updatedRows[0]
    });
  } catch (error) {
    console.error('[SubmissionController] advanceFilm error:', error);
    res.status(500).json({ error: 'Failed to advance film.' });
  }
}

/**
 * POST /api/submissions/bulk-assign
 * Assign selected films to jury users.
 */
async function bulkAssign(req, res) {
  try {
    const eventId = req.headers['x-event-id'] || req.headers['x-edition-id'] || req.headers['x-festival-id'] || 1;
    const film_ids = req.body.film_ids || req.body.submission_ids;
    const jury_user_ids = req.body.jury_user_ids || req.body.jury_ids || [];
    const round_number = req.body.round_number;
    const stage_id = req.body.stage_id;
    const shouldReplace = Boolean(req.body.replace);

    if (!Array.isArray(film_ids) || film_ids.length === 0) {
      return res.status(400).json({ error: 'film_ids or submission_ids array is required.' });
    }
    if (!shouldReplace && (!Array.isArray(jury_user_ids) || jury_user_ids.length === 0)) {
      return res.status(400).json({ error: 'jury_user_ids or jury_ids array is required.' });
    }

    let defaultRound = parseInt(round_number, 10);
    if (!defaultRound && stage_id) {
      const sRows = await query('SELECT stage_order FROM festival_review_states WHERE id = ? AND event_id = ?', [stage_id, eventId]);
      if (sRows.length > 0) defaultRound = sRows[0].stage_order;
    }

    let assignmentsCreated = 0;

    for (const filmId of film_ids) {
      // Disallow assigning jury to rejected submissions
      const subRow = await query('SELECT status, review_state_id FROM submissions WHERE id = ?', [filmId]);
      if (subRow.length > 0 && subRow[0].status === 'Rejected') {
        continue;
      }

      // Determine round number from round_number, stage_id or film state
      let filmRound = defaultRound;
      if (!filmRound && subRow.length > 0 && subRow[0].review_state_id) {
        const orderRow = await query('SELECT stage_order FROM festival_review_states WHERE id = ?', [subRow[0].review_state_id]);
        if (orderRow.length > 0) filmRound = orderRow[0].stage_order;
      }
      if (!filmRound) filmRound = 1;

      // Option 3 Unified Workflow: If film is in Submitted (Intake) stage, advance it to Stage 1 (Round 1: Screening)
      if (subRow.length > 0 && (!subRow[0].review_state_id || subRow[0].status === 'Submitted')) {
        const stage1Rows = await query(`
          SELECT id, stage_order, unique_name 
          FROM festival_review_states 
          WHERE event_id = ? AND stage_order = 1 AND (status IS NULL OR status != 'inactive')
          LIMIT 1
        `, [eventId]);
        if (stage1Rows.length > 0) {
          const stage1 = stage1Rows[0];
          await query(`
            UPDATE submissions 
            SET review_state_id = ?, current_stage_name = ?, status = ?, overall_average_rating = NULL, composite_score = NULL, updated_at = NOW()
            WHERE id = ? AND event_id = ?
          `, [stage1.id, stage1.unique_name, stage1.unique_name, filmId, eventId]);

          const actorId = (req.user && req.user.id) || 1;
          await query(`
            INSERT INTO submission_logs (submission_id, action, notes, actor_user_id)
            VALUES (?, 'STAGE_ADVANCE', ?, ?)
          `, [filmId, `Promoted from Submitted to Stage 1 (${stage1.unique_name}) upon reviewer assignment`, actorId]);

          filmRound = 1;
        }
      }

      // Fetch nominated award categories for this film (if in voting stage)
      const nomCats = await query(`
        SELECT award_name, award_category_id 
        FROM award_category_nominations 
        WHERE event_id = ? AND submission_id = ?
      `, [eventId, filmId]);

      // If replacing (single film edit): remove unselected jurors
      if (shouldReplace) {
        let removedJurors = [];
        if (jury_user_ids.length > 0) {
          removedJurors = await query(`
            SELECT id, jury_user_id FROM screening_assignments 
            WHERE event_id = ? AND film_id = ? AND round_number = ? AND jury_user_id NOT IN (?)
          `, [eventId, filmId, filmRound, jury_user_ids]);
          await query(`
            DELETE FROM screening_assignments 
            WHERE event_id = ? AND film_id = ? AND round_number = ? AND jury_user_id NOT IN (?)
          `, [eventId, filmId, filmRound, jury_user_ids]);
        } else {
          removedJurors = await query(`
            SELECT id, jury_user_id FROM screening_assignments 
            WHERE event_id = ? AND film_id = ? AND round_number = ?
          `, [eventId, filmId, filmRound]);
          await query(`
            DELETE FROM screening_assignments 
            WHERE event_id = ? AND film_id = ? AND round_number = ?
          `, [eventId, filmId, filmRound]);
        }

        // Clean up award_category_jury if removed juror has no other films in that category
        for (const rem of removedJurors) {
          for (const nc of nomCats) {
            const otherFilms = await query(`
              SELECT sa.id FROM screening_assignments sa
              JOIN award_category_nominations acn ON acn.submission_id = sa.film_id AND acn.event_id = sa.event_id
              WHERE sa.event_id = ? AND sa.round_number = ? AND sa.jury_user_id = ? AND acn.award_name = ?
            `, [eventId, filmRound, rem.jury_user_id, nc.award_name]);
            if (otherFilms.length === 0) {
              await query(`
                DELETE FROM award_category_jury WHERE event_id = ? AND award_name = ? AND jury_user_id = ?
              `, [eventId, nc.award_name, rem.jury_user_id]);
            }
          }
        }
      }

      for (const juryId of jury_user_ids) {
        const existing = await query(`
          SELECT id FROM screening_assignments 
          WHERE event_id = ? AND film_id = ? AND jury_user_id = ? AND round_number = ?
        `, [eventId, filmId, juryId, filmRound]);

        if (existing.length === 0) {
          await query(`
            INSERT INTO screening_assignments (event_id, film_id, jury_user_id, round_number, status, assigned_at)
            VALUES (?, ?, ?, ?, 'assigned', NOW())
          `, [eventId, filmId, juryId, filmRound]);
          assignmentsCreated++;
        }

        // Also sync into award_category_jury
        for (const nc of nomCats) {
          await query(`
            INSERT INTO award_category_jury (event_id, award_category_id, award_name, jury_user_id)
            VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE award_name = VALUES(award_name)
          `, [eventId, nc.award_category_id || null, nc.award_name, juryId]);
        }

        // Ensure user is enrolled in jury group
        const groupRow = await query("SELECT id FROM `groups` WHERE group_key = 'jury'");
        if (groupRow.length > 0) {
          const juryGroupId = groupRow[0].id;
          await query(`
            INSERT INTO user_event_groups (user_id, event_id, group_id)
            VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE group_id = VALUES(group_id)
          `, [juryId, eventId, juryGroupId]);
        }
      }

      const actorId = (req.user && req.user.id) || 1;
      await query(`
        INSERT INTO submission_logs (submission_id, action, notes, actor_user_id)
        VALUES (?, 'JURY_ASSIGNED', ?, ?)
      `, [filmId, `Bulk assigned to ${jury_user_ids.length} juror(s) with scope_key: assigned`, actorId]);
    }

    res.json({
      success: true,
      message: `Successfully assigned ${film_ids.length} film(s) to ${jury_user_ids.length} juror(s).`,
      assignmentsCreated
    });
  } catch (error) {
    console.error('[SubmissionController] bulkAssign error:', error);
    res.status(500).json({ error: 'Failed to assign films to jury.' });
  }
}

/**
 * POST /api/submissions/bulk-advance
 * Advance selected films to next sequential stage.
 */
async function bulkAdvance(req, res) {
  try {
    const eventId = req.headers['x-event-id'] || req.headers['x-edition-id'] || req.headers['x-festival-id'] || 1;
    const film_ids = req.body.film_ids || req.body.submission_ids;

    if (!Array.isArray(film_ids) || film_ids.length === 0) {
      return res.status(400).json({ error: 'film_ids or submission_ids array is required.' });
    }

    let advancedCount = 0;
    const actorId = (req.user && req.user.id) || 1;

    for (const filmId of film_ids) {
      const filmRows = await query('SELECT id, event_id, review_state_id, status FROM submissions WHERE id = ?', [filmId]);
      if (filmRows.length > 0) {
        if (filmRows[0].status === 'Rejected') continue;
        const filmEventId = filmRows[0].event_id || eventId;

        let currentOrder = 0;
        if (filmRows[0].review_state_id) {
          const orderRow = await query('SELECT stage_order FROM festival_review_states WHERE id = ?', [filmRows[0].review_state_id]);
          if (orderRow.length > 0) currentOrder = orderRow[0].stage_order;
        }

        const nextStageRows = await query(
          'SELECT id, stage_order, unique_name FROM festival_review_states WHERE event_id = ? AND stage_order > ? AND (status IS NULL OR status != "inactive") ORDER BY stage_order ASC LIMIT 1',
          [filmEventId, currentOrder]
        );

        if (nextStageRows.length > 0) {
          const nextStage = nextStageRows[0];
          await query(`
            UPDATE submissions 
            SET review_state_id = ?, current_stage_name = ?, status = ?, overall_average_rating = NULL, composite_score = NULL, updated_at = NOW() 
            WHERE id = ?
          `, [nextStage.id, nextStage.unique_name, nextStage.unique_name, filmId]);

          await autoAssignJuryForFilmStage(filmEventId, filmId, nextStage.id, nextStage.stage_order);

          await query(`
            INSERT INTO submission_logs (submission_id, action, notes, actor_user_id)
            VALUES (?, 'STAGE_ADVANCE', ?, ?)
          `, [filmId, `Bulk advanced from ${currentOrder === 0 ? 'Submitted' : `Stage ${currentOrder}`} to Stage ${nextStage.stage_order} (${nextStage.unique_name})`, actorId]);

          advancedCount++;
        }
      }
    }

    res.json({ success: true, message: `Successfully advanced ${advancedCount} film(s) to the next stage.`, advancedCount });
  } catch (error) {
    console.error('[SubmissionController] bulkAdvance error:', error);
    res.status(500).json({ error: 'Failed to bulk advance films.' });
  }
}

/**
 * POST /api/submissions/bulk-reject
 * Reject selected films.
 */
async function bulkReject(req, res) {
  try {
    const eventId = req.headers['x-event-id'] || req.headers['x-edition-id'] || req.headers['x-festival-id'] || 1;
    const film_ids = req.body.film_ids || req.body.submission_ids;
    const { reason } = req.body;

    if (!Array.isArray(film_ids) || film_ids.length === 0) {
      return res.status(400).json({ error: 'film_ids or submission_ids array is required.' });
    }

    const trimmedReason = (reason && reason.trim()) ? reason.trim() : 'Does not meet competition criteria for progression.';
    const actorId = (req.user && req.user.id) || 1;

    for (const filmId of film_ids) {
      await query(`
        UPDATE submissions 
        SET status = 'Rejected', rejection_reason = ?, rejected_by_user_id = ?, rejected_at = NOW(), updated_at = NOW()
        WHERE id = ?
      `, [trimmedReason, actorId, filmId]);

      await query(`
        INSERT INTO submission_logs (submission_id, action, notes, actor_user_id)
        VALUES (?, 'REJECT', ?, ?)
      `, [filmId, `Bulk rejected with reason: "${trimmedReason}"`, actorId]);
    }

    res.json({ success: true, message: `Successfully rejected ${film_ids.length} film(s).`, rejectedCount: film_ids.length });
  } catch (error) {
    console.error('[SubmissionController] bulkReject error:', error);
    res.status(500).json({ error: 'Failed to bulk reject films.' });
  }
}

/**
 * GET /api/submissions/export
 * Download CSV report.
 */
async function exportCsv(req, res) {
  try {
    const eventId = req.headers['x-event-id'] || req.headers['x-edition-id'] || req.headers['x-festival-id'] || 1;
    const films = await query(`
      SELECT 
        s.id, s.title, s.director, s.category, s.runtime, s.country, 
        COALESCE(s.current_stage_name, s.status) as stage, s.status,
        COALESCE(s.overall_average_rating, 'Unrated') as rating,
        COALESCE(sf.label, 'None') as flag
      FROM submissions s
      LEFT JOIN submission_flags sf ON sf.id = s.flag_id
      WHERE s.event_id = ?
      ORDER BY s.id ASC
    `, [eventId]);

    let csv = 'ID,Title,Director,Category,Runtime,Country,Review Stage,Status,Rating,Flag\n';
    for (const f of films) {
      const row = [
        f.id,
        `"${(f.title || '').replace(/"/g, '""')}"`,
        `"${(f.director || '').replace(/"/g, '""')}"`,
        `"${f.category || ''}"`,
        `"${f.runtime || ''}"`,
        `"${f.country || ''}"`,
        `"${f.stage || ''}"`,
        `"${f.status || ''}"`,
        `"${f.rating || ''}"`,
        `"${f.flag || ''}"`
      ];
      csv += row.join(',') + '\n';
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="Freecomers_Submissions_Report.csv"');
    res.send(csv);
  } catch (error) {
    console.error('[SubmissionController] exportCsv error:', error);
    res.status(500).json({ error: 'Failed to export CSV.' });
  }
}

/**
 * GET /api/submissions/nominations-board
 * Returns categories, eligible films from Official Selection, and all nominations mapped by category
 */
async function getNominationsBoard(req, res) {
  try {
    const eventId = req.headers['x-event-id'] || req.headers['x-edition-id'] || req.headers['x-festival-id'] || 1;
    const stageId = req.query.stage_id ? parseInt(req.query.stage_id, 10) : null;

    let targetStage = null;
    if (stageId) {
      const stateRows = await query(
        'SELECT id, stage_order, unique_name, award_criteria FROM festival_review_states WHERE id = ? AND event_id = ?',
        [stageId, eventId]
      );
      if (stateRows.length > 0) targetStage = stateRows[0];
    }

    // 1. Fetch categories
    let categories = await query(
      'SELECT id, event_id, name, order_index FROM award_categories WHERE event_id = ? ORDER BY order_index ASC, id ASC',
      [eventId]
    );

    // If targetStage has configured award_criteria in settings, sync and display only those
    if (targetStage && targetStage.award_criteria) {
      let parsed = [];
      try {
        parsed = typeof targetStage.award_criteria === 'string'
          ? JSON.parse(targetStage.award_criteria)
          : targetStage.award_criteria;
      } catch (e) {}

      if (Array.isArray(parsed) && parsed.length > 0) {
        const stageCategoryNames = parsed
          .map(p => (typeof p === 'string' ? p.trim() : (p.name || '').trim()))
          .filter(Boolean);

        for (let i = 0; i < stageCategoryNames.length; i++) {
          const name = stageCategoryNames[i];
          const exists = categories.find(c => c.name.toLowerCase() === name.toLowerCase());
          if (!exists) {
            const ins = await query('INSERT INTO award_categories (event_id, name, order_index) VALUES (?, ?, ?)', [eventId, name, i + 1]);
            categories.push({ id: ins.insertId, event_id: eventId, name, order_index: i + 1 });
          }
        }

        // Filter categories so only the configured award criteria for this stage are shown
        categories = categories.filter(c => stageCategoryNames.some(sn => sn.toLowerCase() === c.name.toLowerCase()));
      }
    }

    // 2. Fetch eligible films dynamically based on targetStage
    let films = [];
    if (targetStage) {
      films = await query(`
        SELECT 
          s.id, s.title, s.director, s.category, s.runtime, s.country, 
          s.status, s.current_stage_name, s.review_state_id,
          COALESCE(NULLIF(s.overall_average_rating, ''), NULLIF(s.composite_score, ''), 'Unrated') as rating
        FROM submissions s
        WHERE s.event_id = ? 
          AND s.status != 'Rejected'
          AND (
            s.review_state_id = ?
            OR s.current_stage_name = ?
            OR s.status = ?
            OR s.id IN (
              SELECT submission_id FROM award_category_nominations WHERE event_id = ?
            )
            OR s.review_state_id IN (
              SELECT id FROM festival_review_states 
              WHERE event_id = ? AND stage_order >= ?
            )
          )
        ORDER BY s.title ASC
      `, [eventId, targetStage.id, targetStage.unique_name, targetStage.unique_name, eventId, eventId, targetStage.stage_order]);
    } else {
      films = await query(`
        SELECT 
          s.id, s.title, s.director, s.category, s.runtime, s.country, 
          s.status, s.current_stage_name, s.review_state_id,
          COALESCE(NULLIF(s.overall_average_rating, ''), NULLIF(s.composite_score, ''), 'Unrated') as rating
        FROM submissions s
        WHERE s.event_id = ? 
          AND s.status != 'Rejected'
          AND (
            s.status IN ('Nominations', 'Jury & Voting', 'Finalist', 'Winner')
            OR s.current_stage_name IN ('Nominations', 'Jury & Voting', 'Finalist', 'Winner')
            OR s.review_state_id IN (
              SELECT id FROM festival_review_states 
              WHERE event_id = ? AND (
                unique_name IN ('Nominations', 'Jury & Voting', 'Finalist', 'Winner')
                OR stage_order >= 4
              )
            )
            OR s.id IN (
              SELECT submission_id FROM award_category_nominations WHERE event_id = ?
            )
          )
        ORDER BY s.title ASC
      `, [eventId, eventId, eventId]);
    }

    // 3. Fetch existing nominations
    const nominations = await query(
      'SELECT id, award_category_id, award_name, submission_id FROM award_category_nominations WHERE event_id = ?',
      [eventId]
    );

    res.json({
      success: true,
      categories,
      films,
      nominations,
      stage: targetStage ? { id: targetStage.id, unique_name: targetStage.unique_name, stage_order: targetStage.stage_order } : null
    });
  } catch (error) {
    console.error('[SubmissionController] getNominationsBoard error:', error);
    res.status(500).json({ error: 'Failed to fetch nominations board data.' });
  }
}

/**
 * POST /api/submissions/toggle-nomination
 * Toggle nomination for a film under an award category.
 */
async function toggleNomination(req, res) {
  try {
    const eventId = req.headers['x-event-id'] || req.headers['x-edition-id'] || req.headers['x-festival-id'] || 1;
    const { award_name, submission_id, award_category_id } = req.body;

    if (!award_name || !submission_id) {
      return res.status(400).json({ error: 'award_name and submission_id are required.' });
    }

    const trimmedAward = String(award_name).trim();
    const subId = parseInt(submission_id, 10);

    const existing = await query(
      'SELECT id FROM award_category_nominations WHERE event_id = ? AND award_name = ? AND submission_id = ?',
      [eventId, trimmedAward, subId]
    );

    if (existing.length > 0) {
      await query('DELETE FROM award_category_nominations WHERE id = ?', [existing[0].id]);
      return res.json({ success: true, nominated: false, message: 'Nomination removed.' });
    } else {
      await query(
        'INSERT INTO award_category_nominations (event_id, award_category_id, award_name, submission_id) VALUES (?, ?, ?, ?)',
        [eventId, award_category_id || null, trimmedAward, subId]
      );
      return res.json({ success: true, nominated: true, message: 'Film nominated successfully.' });
    }
  } catch (error) {
    console.error('[SubmissionController] toggleNomination error:', error);
    res.status(500).json({ error: 'Failed to toggle nomination.' });
  }
}

/**
 * POST /api/submissions/add-award-category
 */
async function addAwardCategory(req, res) {
  try {
    const eventId = req.headers['x-event-id'] || req.headers['x-edition-id'] || req.headers['x-festival-id'] || 1;
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Category name is required.' });
    }
    const trimmed = name.trim();

    const existing = await query('SELECT id, name, order_index FROM award_categories WHERE event_id = ? AND name = ?', [eventId, trimmed]);
    if (existing.length > 0) {
      return res.json({ success: true, category: existing[0] });
    }

    const maxOrder = await query('SELECT MAX(order_index) as m FROM award_categories WHERE event_id = ?', [eventId]);
    const nextOrder = (maxOrder[0]?.m || 0) + 1;

    const ins = await query('INSERT INTO award_categories (event_id, name, order_index) VALUES (?, ?, ?)', [eventId, trimmed, nextOrder]);
    return res.json({ success: true, category: { id: ins.insertId, event_id: eventId, name: trimmed, order_index: nextOrder } });
  } catch (error) {
    console.error('[SubmissionController] addAwardCategory error:', error);
    res.status(500).json({ error: 'Failed to add award category.' });
  }
}

/**
 * POST /api/submissions/remove-award-category
 */
async function removeAwardCategory(req, res) {
  try {
    const eventId = req.headers['x-event-id'] || req.headers['x-edition-id'] || req.headers['x-festival-id'] || 1;
    const { id, name } = req.body;

    if (id) {
      await query('DELETE FROM award_categories WHERE id = ? AND event_id = ?', [id, eventId]);
    } else if (name) {
      await query('DELETE FROM award_categories WHERE name = ? AND event_id = ?', [name, eventId]);
    }

    if (name) {
      await query('DELETE FROM award_category_nominations WHERE award_name = ? AND event_id = ?', [name, eventId]);
    }

    res.json({ success: true, message: 'Award category removed.' });
  } catch (error) {
    console.error('[SubmissionController] removeAwardCategory error:', error);
    res.status(500).json({ error: 'Failed to remove award category.' });
  }
}

/**
 * POST /api/submissions/advance-nominations-to-jury
 * Dynamically advances nominated/eligible films from the current stage to the target (next) stage.
 */
async function advanceNominationsToJury(req, res) {
  try {
    const eventId = req.headers['x-event-id'] || req.headers['x-edition-id'] || req.headers['x-festival-id'] || 1;
    const actorId = (req.user && req.user.id) || 1;
    const { current_stage_id, target_stage_id } = req.body || {};

    let currentStage = null;
    if (current_stage_id) {
      const cRows = await query(
        'SELECT id, stage_order, unique_name FROM festival_review_states WHERE id = ? AND event_id = ?',
        [current_stage_id, eventId]
      );
      if (cRows.length > 0) currentStage = cRows[0];
    }

    let targetStage = null;
    if (target_stage_id) {
      const tRows = await query(
        'SELECT id, stage_order, unique_name FROM festival_review_states WHERE id = ? AND event_id = ?',
        [target_stage_id, eventId]
      );
      if (tRows.length > 0) targetStage = tRows[0];
    }

    // If target stage wasn't provided, determine next sequential stage after currentStage
    if (!targetStage && currentStage) {
      const nextRows = await query(
        'SELECT id, stage_order, unique_name FROM festival_review_states WHERE event_id = ? AND stage_order > ? AND (status IS NULL OR status != "inactive") ORDER BY stage_order ASC LIMIT 1',
        [eventId, currentStage.stage_order]
      );
      if (nextRows.length > 0) targetStage = nextRows[0];
    }

    // Fallback if neither provided: find Jury stage or stage_order = 5
    if (!targetStage) {
      const fallbackRows = await query(
        'SELECT id, stage_order, unique_name FROM festival_review_states WHERE event_id = ? AND (unique_name LIKE "%jury%" OR stage_order = 5) AND (status IS NULL OR status != "inactive") ORDER BY stage_order ASC LIMIT 1',
        [eventId]
      );
      if (fallbackRows.length > 0) targetStage = fallbackRows[0];
    }

    if (!targetStage) {
      return res.status(400).json({ error: 'Target stage for advancement not found.' });
    }

    // Find all nominated films
    const nominatedRows = await query(
      'SELECT DISTINCT submission_id FROM award_category_nominations WHERE event_id = ?',
      [eventId]
    );

    let targetFilmIds = nominatedRows.map(r => r.submission_id);

    // If no films specifically nominated yet, advance any films currently in this stage
    if (targetFilmIds.length === 0) {
      if (currentStage) {
        const activeStageFilms = await query(`
          SELECT id FROM submissions 
          WHERE event_id = ? AND status != 'Rejected' AND (
            review_state_id = ?
            OR current_stage_name = ?
            OR status = ?
          )
        `, [eventId, currentStage.id, currentStage.unique_name, currentStage.unique_name]);
        targetFilmIds = activeStageFilms.map(r => r.id);
      } else {
        const activeStageFilms = await query(`
          SELECT id FROM submissions 
          WHERE event_id = ? AND status != 'Rejected' AND (
            status IN ('Nominations') 
            OR current_stage_name IN ('Nominations')
            OR review_state_id IN (SELECT id FROM festival_review_states WHERE event_id = ? AND (unique_name LIKE "%nomination%" OR stage_order = 4))
          )
        `, [eventId, eventId]);
        targetFilmIds = activeStageFilms.map(r => r.id);
      }
    }

    if (targetFilmIds.length === 0) {
      return res.status(400).json({ error: `No films available in ${currentStage?.unique_name || 'Nominations'} stage to advance to ${targetStage.unique_name}.` });
    }

    let advancedCount = 0;
    for (const filmId of targetFilmIds) {
      await query(`
        UPDATE submissions 
        SET review_state_id = ?, current_stage_name = ?, status = ?, overall_average_rating = NULL, composite_score = NULL, updated_at = NOW()
        WHERE id = ? AND event_id = ?
      `, [targetStage.id, targetStage.unique_name, targetStage.unique_name, filmId, eventId]);

      await autoAssignJuryForFilmStage(eventId, filmId, targetStage.id, targetStage.stage_order);

      const fromLabel = currentStage ? `${currentStage.unique_name}` : 'Nominations';
      await query(`
        INSERT INTO submission_logs (submission_id, action, notes, actor_user_id)
        VALUES (?, 'STAGE_ADVANCE', ?, ?)
      `, [filmId, `Advanced from ${fromLabel} to Stage ${targetStage.stage_order} (${targetStage.unique_name})`, actorId]);

      advancedCount++;
    }

    res.json({
      success: true,
      message: `Successfully advanced ${advancedCount} film(s) to ${targetStage.unique_name}!`,
      advancedCount,
      targetStage: targetStage.unique_name,
      targetStageId: targetStage.id
    });
  } catch (error) {
    console.error('[SubmissionController] advanceNominationsToJury error:', error);
    res.status(500).json({ error: 'Failed to advance nominations to jury.' });
  }
}

/**
 * GET /api/submissions/jury-voting-board
 * Returns award categories, nominated films per category, available jury members, and assignments.
 */
async function getJuryVotingBoard(req, res) {
  try {
    const eventId = req.headers['x-event-id'] || req.headers['x-edition-id'] || req.headers['x-festival-id'] || 1;

    // 1. Fetch categories
    let categories = await query(
      'SELECT id, event_id, name, order_index FROM award_categories WHERE event_id = ? ORDER BY order_index ASC, id ASC',
      [eventId]
    );

    // 2. Fetch available jurors
    let availableJury = await query(`
      SELECT DISTINCT 
        u.id, 
        u.email, 
        COALESCE(i.name, o.name, u.email) as name,
        g.group_key
      FROM users u
      LEFT JOIN individuals i ON i.user_id = u.id
      LEFT JOIN organizations o ON o.user_id = u.id
      JOIN user_event_groups ueg ON ueg.user_id = u.id
      JOIN \`groups\` g ON g.id = ueg.group_id
      WHERE ueg.event_id = ? AND g.group_key IN ('jury', 'judge')
      ORDER BY name ASC
    `, [eventId]);

    // 3. Fetch nominations with film details (including runtime, country, and ratings)
    const nominations = await query(`
      SELECT acn.id, acn.award_name, acn.award_category_id, acn.submission_id, s.title, s.director, s.category, s.runtime, s.country, s.status, s.current_stage_name,
             COALESCE(NULLIF(s.overall_average_rating, ''), NULLIF(s.composite_score, ''), 'Unrated') as rating
      FROM award_category_nominations acn
      JOIN submissions s ON s.id = acn.submission_id
      WHERE acn.event_id = ? AND s.status != 'Rejected'
      ORDER BY s.title ASC
    `, [eventId]);

    // 4. Fetch category-level jury assignments
    const categoryJuryAssignments = await query(
      'SELECT id, award_name, award_category_id, jury_user_id FROM award_category_jury WHERE event_id = ?',
      [eventId]
    );

    // 5. Fetch Stage review round number and detailed review progress dynamically
    const targetStageId = req.query.stage_id || req.body?.stage_id;
    let targetStage = null;
    if (targetStageId) {
      const sRows = await query('SELECT id, stage_order, unique_name FROM festival_review_states WHERE event_id = ? AND id = ? LIMIT 1', [eventId, targetStageId]);
      if (sRows.length > 0) targetStage = sRows[0];
    }
    if (!targetStage) {
      const stage5Rows = await query(
        'SELECT id, stage_order, unique_name FROM festival_review_states WHERE event_id = ? AND (unique_name LIKE "%jury%" OR stage_order = 5) LIMIT 1',
        [eventId]
      );
      targetStage = stage5Rows[0] || null;
    }
    const roundNumber = targetStage?.stage_order || 5;

    const round5Assignments = await query(`
      SELECT sa.id as assignment_id, sa.film_id, s.title as film_title, sa.jury_user_id,
             COALESCE(i.name, o.name, u.email) as jury_name,
             sa.status as assignment_status,
             sr.id as review_id, sr.overall_rating, sr.submitted_at
      FROM screening_assignments sa
      JOIN submissions s ON s.id = sa.film_id
      JOIN users u ON u.id = sa.jury_user_id
      LEFT JOIN individuals i ON i.user_id = u.id
      LEFT JOIN organizations o ON o.user_id = u.id
      LEFT JOIN screening_reviews sr ON sr.assignment_id = sa.id
      WHERE sa.event_id = ? AND sa.round_number = ?
    `, [eventId, roundNumber]);

    const totalAssignments = round5Assignments.length;
    const completedAssignments = round5Assignments.filter(a => a.assignment_status === 'completed' || a.review_id).length;
    const pendingAssignments = totalAssignments - completedAssignments;
    const allReviewsCompleted = totalAssignments > 0 && pendingAssignments === 0;

    const pendingList = round5Assignments
      .filter(a => a.assignment_status !== 'completed' && !a.review_id)
      .map(a => ({
        assignmentId: a.assignment_id,
        filmId: a.film_id,
        filmTitle: a.film_title,
        juryUserId: a.jury_user_id,
        juryName: a.jury_name
      }));

    // Calculate per-film review summary
    const filmReviewStats = {};
    for (const a of round5Assignments) {
      if (!filmReviewStats[a.film_id]) {
        filmReviewStats[a.film_id] = { total: 0, completed: 0, ratings: [] };
      }
      filmReviewStats[a.film_id].total++;
      if (a.assignment_status === 'completed' || a.review_id) {
        filmReviewStats[a.film_id].completed++;
        if (a.overall_rating) filmReviewStats[a.film_id].ratings.push(parseFloat(a.overall_rating));
      }
    }

    res.json({
      success: true,
      categories,
      availableJury,
      nominations,
      categoryJuryAssignments,
      stage: targetStage ? { id: targetStage.id, unique_name: targetStage.unique_name, stage_order: targetStage.stage_order } : null,
      votingStats: {
        totalAssignments,
        completedAssignments,
        pendingAssignments,
        allReviewsCompleted,
        pendingList,
        filmReviewStats,
        roundNumber,
        assignments: round5Assignments
      }
    });
  } catch (error) {
    console.error('[SubmissionController] getJuryVotingBoard error:', error);
    res.status(500).json({ error: 'Failed to fetch jury voting board data.' });
  }
}

/**
 * POST /api/submissions/toggle-category-jury
 * Toggle jury member assignment to an award category.
 */
async function toggleCategoryJury(req, res) {
  try {
    const eventId = req.headers['x-event-id'] || req.headers['x-edition-id'] || req.headers['x-festival-id'] || 1;
    const { award_name, jury_user_id, award_category_id, stage_id } = req.body;

    if (!award_name || !jury_user_id) {
      return res.status(400).json({ error: 'award_name and jury_user_id are required.' });
    }

    const trimmedAward = String(award_name).trim();
    const juryId = parseInt(jury_user_id, 10);

    let roundNumber = 5;
    if (stage_id) {
      const sRows = await query('SELECT stage_order FROM festival_review_states WHERE id = ? AND event_id = ?', [stage_id, eventId]);
      if (sRows.length > 0) roundNumber = sRows[0].stage_order;
    } else {
      const stage5Rows = await query(
        'SELECT id, stage_order FROM festival_review_states WHERE event_id = ? AND (unique_name LIKE "%jury%" OR stage_order = 5) LIMIT 1',
        [eventId]
      );
      roundNumber = stage5Rows[0]?.stage_order || 5;
    }

    // Check if currently assigned
    const existing = await query(
      'SELECT id FROM award_category_jury WHERE event_id = ? AND award_name = ? AND jury_user_id = ?',
      [eventId, trimmedAward, juryId]
    );

    // Fetch all films nominated under this award category
    const nomFilms = await query(
      'SELECT submission_id FROM award_category_nominations WHERE event_id = ? AND award_name = ?',
      [eventId, trimmedAward]
    );

    if (existing.length > 0) {
      // Unassign
      await query('DELETE FROM award_category_jury WHERE id = ?', [existing[0].id]);

      // Remove screening_assignments for these films, unless juror is assigned via another category for this film
      for (const row of nomFilms) {
        const filmId = row.submission_id;
        const otherCats = await query(`
          SELECT acj.id 
          FROM award_category_jury acj
          JOIN award_category_nominations acn ON acn.event_id = acj.event_id AND acn.award_name = acj.award_name
          WHERE acj.event_id = ? AND acj.jury_user_id = ? AND acn.submission_id = ?
        `, [eventId, juryId, filmId]);

        if (otherCats.length === 0) {
          await query(
            'DELETE FROM screening_assignments WHERE event_id = ? AND film_id = ? AND round_number = ? AND jury_user_id = ?',
            [eventId, filmId, roundNumber, juryId]
          );
        }
      }

      return res.json({ success: true, assigned: false, message: 'Juror unassigned from category.' });
    } else {
      // Assign
      await query(
        'INSERT INTO award_category_jury (event_id, award_category_id, award_name, jury_user_id) VALUES (?, ?, ?, ?)',
        [eventId, award_category_id || null, trimmedAward, juryId]
      );

      // Create screening assignments for all nominated films in this category
      for (const row of nomFilms) {
        const filmId = row.submission_id;
        await query(`
          INSERT INTO screening_assignments (event_id, film_id, round_number, jury_user_id, status)
          VALUES (?, ?, ?, ?, 'assigned')
          ON DUPLICATE KEY UPDATE status = status
        `, [eventId, filmId, roundNumber, juryId]);
      }

      return res.json({ success: true, assigned: true, message: 'Juror assigned to category.' });
    }
  } catch (error) {
    console.error('[SubmissionController] toggleCategoryJury error:', error);
    res.status(500).json({ error: 'Failed to toggle category jury.' });
  }
}

/**
 * POST /api/submissions/assign-all-category-jury
 * Assign or unassign all available jurors for an award category.
 */
async function assignAllCategoryJury(req, res) {
  try {
    const eventId = req.headers['x-event-id'] || req.headers['x-edition-id'] || req.headers['x-festival-id'] || 1;
    const { award_name, award_category_id, assign, stage_id } = req.body;

    if (!award_name) {
      return res.status(400).json({ error: 'award_name is required.' });
    }

    const trimmedAward = String(award_name).trim();

    let roundNumber = 5;
    if (stage_id) {
      const sRows = await query('SELECT stage_order FROM festival_review_states WHERE id = ? AND event_id = ?', [stage_id, eventId]);
      if (sRows.length > 0) roundNumber = sRows[0].stage_order;
    } else {
      const stage5Rows = await query(
        'SELECT id, stage_order FROM festival_review_states WHERE event_id = ? AND (unique_name LIKE "%jury%" OR stage_order = 5) LIMIT 1',
        [eventId]
      );
      roundNumber = stage5Rows[0]?.stage_order || 5;
    }

    // Fetch all jurors
    const availableJury = await query(`
      SELECT DISTINCT u.id 
      FROM users u
      JOIN user_event_groups ueg ON ueg.user_id = u.id
      JOIN \`groups\` g ON g.id = ueg.group_id
      WHERE ueg.event_id = ? AND g.group_key IN ('jury', 'judge')
    `, [eventId]);

    // Fetch films in category
    const nomFilms = await query(
      'SELECT submission_id FROM award_category_nominations WHERE event_id = ? AND award_name = ?',
      [eventId, trimmedAward]
    );

    if (assign === false) {
      // Remove all jury for this category
      await query('DELETE FROM award_category_jury WHERE event_id = ? AND award_name = ?', [eventId, trimmedAward]);
      for (const f of nomFilms) {
        for (const j of availableJury) {
          const other = await query(`
            SELECT acj.id 
            FROM award_category_jury acj
            JOIN award_category_nominations acn ON acn.event_id = acj.event_id AND acn.award_name = acj.award_name
            WHERE acj.event_id = ? AND acj.jury_user_id = ? AND acn.submission_id = ?
          `, [eventId, j.id, f.submission_id]);
          if (other.length === 0) {
            await query('DELETE FROM screening_assignments WHERE event_id = ? AND film_id = ? AND round_number = ? AND jury_user_id = ?', [eventId, f.submission_id, roundNumber, j.id]);
          }
        }
      }
      return res.json({ success: true, message: 'All jurors unassigned from category.' });
    } else {
      for (const j of availableJury) {
        await query(`
          INSERT INTO award_category_jury (event_id, award_category_id, award_name, jury_user_id)
          VALUES (?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE award_name = VALUES(award_name)
        `, [eventId, award_category_id || null, trimmedAward, j.id]);

        for (const f of nomFilms) {
          await query(`
            INSERT INTO screening_assignments (event_id, film_id, round_number, jury_user_id, status)
            VALUES (?, ?, ?, ?, 'assigned')
            ON DUPLICATE KEY UPDATE status = status
          `, [eventId, f.submission_id, roundNumber, j.id]);
        }
      }
      return res.json({ success: true, message: 'All jurors assigned to category.' });
    }
  } catch (error) {
    console.error('[SubmissionController] assignAllCategoryJury error:', error);
    res.status(500).json({ error: 'Failed to bulk assign category jury.' });
  }
}

/**
 * POST /api/submissions/advance-to-results
 * Advance from Stage 5 to Stage 6 (Finalist / Results).
 * Strictly requires that ALL assigned jury members have reviewed and rated their assigned films.
 */
async function advanceToResults(req, res) {
  try {
    const eventId = req.headers['x-event-id'] || req.headers['x-edition-id'] || req.headers['x-festival-id'] || 1;
    const actorId = (req.user && req.user.id) || 1;
    const currentStageId = req.body?.current_stage_id;
    const targetStageId = req.body?.target_stage_id;

    // 1. Determine current stage dynamically
    let currentStage = null;
    if (currentStageId) {
      const sRows = await query('SELECT id, stage_order, unique_name FROM festival_review_states WHERE event_id = ? AND id = ? LIMIT 1', [eventId, currentStageId]);
      if (sRows.length > 0) currentStage = sRows[0];
    }
    if (!currentStage) {
      const stage5Rows = await query(
        'SELECT id, stage_order, unique_name FROM festival_review_states WHERE event_id = ? AND (unique_name LIKE "%jury%" OR stage_order = 5) LIMIT 1',
        [eventId]
      );
      currentStage = stage5Rows[0] || null;
    }
    const roundNumber = currentStage?.stage_order || 5;

    // 2. Check for pending assignments in this round
    const pendingReviews = await query(`
      SELECT sa.id, s.title, COALESCE(i.name, o.name, u.email) as jury_name
      FROM screening_assignments sa
      JOIN submissions s ON s.id = sa.film_id
      JOIN users u ON u.id = sa.jury_user_id
      LEFT JOIN individuals i ON i.user_id = u.id
      LEFT JOIN organizations o ON o.user_id = u.id
      LEFT JOIN screening_reviews sr ON sr.assignment_id = sa.id
      WHERE sa.event_id = ? AND sa.round_number = ? AND (sa.status != 'completed' AND sr.id IS NULL)
    `, [eventId, roundNumber]);

    if (pendingReviews.length > 0) {
      return res.status(400).json({
        error: `Cannot view results yet: ${pendingReviews.length} jury review(s) are still pending. All assigned jurors must review and rate their assigned films before results can be finalized.`,
        pendingCount: pendingReviews.length,
        pending: pendingReviews
      });
    }

    // 3. Determine next stage dynamically
    let nextStage = null;
    if (targetStageId) {
      const nRows = await query('SELECT id, stage_order, unique_name FROM festival_review_states WHERE event_id = ? AND id = ? LIMIT 1', [eventId, targetStageId]);
      if (nRows.length > 0) nextStage = nRows[0];
    }
    if (!nextStage) {
      const nextStageRows = await query(
        'SELECT id, stage_order, unique_name FROM festival_review_states WHERE event_id = ? AND stage_order > ? AND (status IS NULL OR status != "inactive") ORDER BY stage_order ASC LIMIT 1',
        [eventId, roundNumber]
      );
      if (nextStageRows.length > 0) nextStage = nextStageRows[0];
    }

    if (!nextStage) {
      return res.status(400).json({ error: 'Next review stage not found.' });
    }

    // 4. Find all films in current stage to advance
    const filmsInJury = await query(`
      SELECT DISTINCT s.id FROM submissions s
      WHERE s.event_id = ? AND s.status != 'Rejected' AND (
        s.review_state_id = ?
        OR s.current_stage_name = ?
        OR s.status = ?
        OR s.id IN (SELECT submission_id FROM award_category_nominations WHERE event_id = ?)
      )
    `, [eventId, currentStage?.id || 0, currentStage?.unique_name || '', currentStage?.unique_name || '', eventId]);

    let advancedCount = 0;
    for (const f of filmsInJury) {
      await query(`
        UPDATE submissions 
        SET review_state_id = ?, current_stage_name = ?, status = ?, updated_at = NOW()
        WHERE id = ? AND event_id = ?
      `, [nextStage.id, nextStage.unique_name, nextStage.unique_name, f.id, eventId]);

      await query(`
        INSERT INTO submission_logs (submission_id, action, notes, actor_user_id)
        VALUES (?, 'STAGE_ADVANCE', ?, ?)
      `, [f.id, `Advanced from ${currentStage?.unique_name || 'Jury Stage'} to Stage ${nextStage.stage_order} (${nextStage.unique_name})`, actorId]);

      advancedCount++;
    }

    res.json({
      success: true,
      message: `Successfully advanced ${advancedCount} film(s) to ${nextStage.unique_name}!`,
      advancedCount,
      targetStage: nextStage.unique_name,
      targetStageId: nextStage.id
    });
  } catch (error) {
    console.error('[SubmissionController] advanceToResults error:', error);
    res.status(500).json({ error: 'Failed to advance to results stage.' });
  }
}


/**
 * GET /api/submissions/finalists-board
 * Returns award categories with finalist films ranked by Round 5 jury ratings,
 * along with any winners already chosen.
 */
async function getFinalistsBoard(req, res) {
  try {
    const eventId = req.headers['x-event-id'] || req.headers['x-edition-id'] || req.headers['x-festival-id'] || 1;
    const stageId = req.query.stage_id || req.body?.stage_id;

    // 1. Fetch categories
    const categories = await query(
      'SELECT id, event_id, name, order_index FROM award_categories WHERE event_id = ? ORDER BY order_index ASC, id ASC',
      [eventId]
    );

    // 2. Dynamic stage resolution
    let targetStage = null;
    if (stageId) {
      const sRows = await query('SELECT id, stage_order, unique_name FROM festival_review_states WHERE event_id = ? AND id = ? LIMIT 1', [eventId, stageId]);
      if (sRows.length > 0) targetStage = sRows[0];
    }
    if (!targetStage) {
      const stageRows = await query(
        'SELECT id, stage_order, unique_name FROM festival_review_states WHERE event_id = ? AND (unique_name LIKE "%finalist%" OR stage_order = 6) LIMIT 1',
        [eventId]
      );
      targetStage = stageRows[0] || null;
    }

    // Determine roundNumber for scoring from preceding review/voting stage
    let roundNumber = 5;
    if (targetStage) {
      const prevRows = await query(
        'SELECT id, stage_order FROM festival_review_states WHERE event_id = ? AND stage_order < ? ORDER BY stage_order DESC LIMIT 1',
        [eventId, targetStage.stage_order]
      );
      if (prevRows.length > 0) roundNumber = prevRows[0].stage_order;
    } else {
      const stage5Rows = await query(
        'SELECT id, stage_order FROM festival_review_states WHERE event_id = ? AND (unique_name LIKE "%jury%" OR stage_order = 5) LIMIT 1',
        [eventId]
      );
      roundNumber = stage5Rows[0]?.stage_order || 5;
    }

    // 3. Fetch all finalist films (either in Finalist or Winner stages) and their nominations
    const finalistNoms = await query(`
      SELECT 
        acn.id as nomination_id,
        acn.award_name,
        acn.award_category_id,
        COALESCE(acn.is_winner, 0) as is_winner,
        s.id as submission_id,
        s.title,
        s.director,
        s.category,
        s.country,
        s.runtime,
        s.runtime as runtime_minutes,
        s.status,
        s.current_stage_name
      FROM award_category_nominations acn
      JOIN submissions s ON s.id = acn.submission_id
      WHERE acn.event_id = ? AND s.status != 'Rejected'
      ORDER BY acn.award_name ASC, s.title ASC
    `, [eventId]);

    // 4. Fetch reviews to compute category-specific jury ratings
    const reviews = await query(`
      SELECT film_id, overall_rating, criteria_scores
      FROM screening_reviews
      WHERE event_id = ? AND round_number = ?
    `, [eventId, roundNumber]);

    // Compute category-specific rating for each finalist nomination
    for (const fn of finalistNoms) {
      const key = 'award_' + fn.award_name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
      const filmRevs = reviews.filter(r => r.film_id === fn.submission_id);
      let totalScore = 0;
      let count = 0;
      for (const r of filmRevs) {
        let score = null;
        if (r.criteria_scores) {
          try {
            const parsed = typeof r.criteria_scores === 'string' ? JSON.parse(r.criteria_scores) : r.criteria_scores;
            if (parsed[key] !== undefined) score = Number(parsed[key]);
          } catch (e) {}
        }
        if (score === null && r.overall_rating) {
          score = Number(r.overall_rating);
        }
        if (score !== null && !isNaN(score) && score > 0) {
          totalScore += score;
          count++;
        }
      }
      fn.jury_rating = count > 0 ? (totalScore / count).toFixed(2) : '0.00';
      fn.review_count = count;
    }

    // 5. Also fetch all submissions currently marked as 'Finalist' or 'Winner' in this event
    const minFinalistOrder = targetStage?.stage_order || 6;
    const allStageFinalists = await query(`
      SELECT 
        s.id as submission_id,
        s.title,
        s.director,
        s.category,
        s.country,
        s.runtime,
        s.runtime as runtime_minutes,
        s.status,
        s.current_stage_name,
        ROUND(COALESCE(AVG(sr.overall_rating), 0), 2) as jury_rating,
        COUNT(sr.id) as review_count
      FROM submissions s
      LEFT JOIN screening_reviews sr ON sr.film_id = s.id AND sr.event_id = s.event_id AND sr.round_number = ?
      WHERE s.event_id = ? AND s.status != 'Rejected' AND (
        s.status IN ('Finalist', 'Winner') 
        OR s.current_stage_name IN ('Finalist', 'Winner')
        OR s.review_state_id IN (SELECT id FROM festival_review_states WHERE event_id = ? AND stage_order >= ?)
      )
      GROUP BY s.id, s.title, s.director, s.category, s.country, s.runtime, s.status, s.current_stage_name
      ORDER BY jury_rating DESC, s.title ASC
    `, [roundNumber, eventId, eventId, minFinalistOrder]);

    // Group finalists by category name
    const finalistsByCategory = {};
    for (const cat of categories) {
      finalistsByCategory[cat.name] = finalistNoms
        .filter(n => n.award_name.toLowerCase() === cat.name.toLowerCase())
        .sort((a, b) => parseFloat(b.jury_rating || 0) - parseFloat(a.jury_rating || 0));
    }

    // For any unassigned finalists (not explicitly in award_category_nominations)
    const nominatedSubIds = new Set(finalistNoms.map(n => n.submission_id));
    const unassignedFinalists = allStageFinalists.filter(f => !nominatedSubIds.has(f.submission_id));

    res.json({
      success: true,
      categories,
      finalistsByCategory,
      allStageFinalists,
      unassignedFinalists,
      finalistNoms,
      stage: targetStage ? { id: targetStage.id, unique_name: targetStage.unique_name, stage_order: targetStage.stage_order } : null
    });
  } catch (error) {
    console.error('[SubmissionController] getFinalistsBoard error:', error);
    res.status(500).json({ error: 'Failed to fetch finalists board data.' });
  }
}

/**
 * POST /api/submissions/select-winner
 * Admin chooses one winner in an award category.
 */
async function selectWinner(req, res) {
  try {
    const eventId = req.headers['x-event-id'] || req.headers['x-edition-id'] || req.headers['x-festival-id'] || 1;
    const actorId = (req.user && req.user.id) || 1;
    const { award_name, submission_id, award_category_id } = req.body;

    if (!award_name || !submission_id) {
      return res.status(400).json({ error: 'award_name and submission_id are required.' });
    }

    const trimmedAward = String(award_name).trim();
    const filmId = parseInt(submission_id, 10);

    // 1. Clear previous winner for this award in this event
    await query(
      'UPDATE award_category_nominations SET is_winner = 0 WHERE event_id = ? AND award_name = ?',
      [eventId, trimmedAward]
    );

    // 2. Mark this film as winner for this award
    const nomCheck = await query(
      'SELECT id FROM award_category_nominations WHERE event_id = ? AND award_name = ? AND submission_id = ?',
      [eventId, trimmedAward, filmId]
    );

    if (nomCheck.length > 0) {
      await query(
        'UPDATE award_category_nominations SET is_winner = 1 WHERE id = ?',
        [nomCheck[0].id]
      );
    } else {
      await query(
        'INSERT INTO award_category_nominations (event_id, award_category_id, award_name, submission_id, is_winner) VALUES (?, ?, ?, ?, 1)',
        [eventId, award_category_id || null, trimmedAward, filmId]
      );
    }

    const filmRow = await query('SELECT title FROM submissions WHERE id = ?', [filmId]);
    const filmTitle = filmRow[0]?.title || `Film #${filmId}`;

    await query(
      'INSERT INTO submission_logs (submission_id, action, notes, actor_user_id) VALUES (?, "WINNER_SELECTED", ?, ?)',
      [filmId, `Declared Official Winner of "${trimmedAward}"`, actorId]
    );

    res.json({
      success: true,
      message: `"${filmTitle}" selected as Winner of ${trimmedAward}! 🏆`,
      award_name: trimmedAward,
      submission_id: filmId,
      filmTitle
    });
  } catch (error) {
    console.error('[SubmissionController] selectWinner error:', error);
    res.status(500).json({ error: 'Failed to select winner.' });
  }
}

/**
 * POST /api/submissions/remove-winner
 * Admin revokes winner status for a film in an award category.
 */
async function removeWinner(req, res) {
  try {
    const eventId = req.headers['x-event-id'] || req.headers['x-edition-id'] || req.headers['x-festival-id'] || 1;
    const actorId = (req.user && req.user.id) || 1;
    const { award_name, submission_id } = req.body;

    if (!award_name || !submission_id) {
      return res.status(400).json({ error: 'award_name and submission_id are required.' });
    }

    const trimmedAward = String(award_name).trim();
    const filmId = parseInt(submission_id, 10);

    await query(
      'UPDATE award_category_nominations SET is_winner = 0 WHERE event_id = ? AND award_name = ? AND submission_id = ?',
      [eventId, trimmedAward, filmId]
    );

    await query(
      'INSERT INTO submission_logs (submission_id, action, notes, actor_user_id) VALUES (?, "WINNER_REVOKED", ?, ?)',
      [filmId, `Revoked Winner status for "${trimmedAward}"`, actorId]
    );

    res.json({
      success: true,
      message: `Winner status removed for "${trimmedAward}".`
    });
  } catch (error) {
    console.error('[SubmissionController] removeWinner error:', error);
    res.status(500).json({ error: 'Failed to remove winner.' });
  }
}

/**
 * POST /api/submissions/advance-to-winners
 * Advances all crowned winning films to Stage 7 (Winner).
 */
async function advanceToWinners(req, res) {
  try {
    const eventId = req.headers['x-event-id'] || req.headers['x-edition-id'] || req.headers['x-festival-id'] || 1;
    const actorId = (req.user && req.user.id) || 1;

    const targetStageId = req.body?.target_stage_id;
    const currentStageId = req.body?.current_stage_id;

    let winnerStage = null;
    if (targetStageId) {
      const sRows = await query('SELECT id, stage_order, unique_name FROM festival_review_states WHERE event_id = ? AND id = ? LIMIT 1', [eventId, targetStageId]);
      if (sRows.length > 0) winnerStage = sRows[0];
    }
    if (!winnerStage && currentStageId) {
      const curRows = await query('SELECT stage_order FROM festival_review_states WHERE event_id = ? AND id = ? LIMIT 1', [eventId, currentStageId]);
      if (curRows.length > 0) {
        const nextRows = await query(
          'SELECT id, stage_order, unique_name FROM festival_review_states WHERE event_id = ? AND stage_order > ? AND (status IS NULL OR status != "inactive") ORDER BY stage_order ASC LIMIT 1',
          [eventId, curRows[0].stage_order]
        );
        if (nextRows.length > 0) winnerStage = nextRows[0];
      }
    }
    if (!winnerStage) {
      const winnerStageRows = await query(
        'SELECT id, stage_order, unique_name FROM festival_review_states WHERE event_id = ? AND (unique_name LIKE "%winner%" OR stage_order = 7) LIMIT 1',
        [eventId]
      );
      if (winnerStageRows.length > 0) winnerStage = winnerStageRows[0];
    }
    if (!winnerStage) {
      return res.status(400).json({ error: 'Target winner stage not found for this festival.' });
    }

    const winnerSubmissions = await query(
      'SELECT DISTINCT submission_id FROM award_category_nominations WHERE event_id = ? AND is_winner = 1',
      [eventId]
    );

    let advancedCount = 0;
    for (const row of winnerSubmissions) {
      await query(
        'UPDATE submissions SET review_state_id = ?, current_stage_name = ?, status = ?, updated_at = NOW() WHERE id = ? AND event_id = ?',
        [winnerStage.id, winnerStage.unique_name, winnerStage.unique_name, row.submission_id, eventId]
      );
      await query(
        'INSERT INTO submission_logs (submission_id, action, notes, actor_user_id) VALUES (?, "STAGE_ADVANCE", ?, ?)',
        [row.submission_id, `Advanced to Stage 7 (${winnerStage.unique_name}) as Official Award Winner`, actorId]
      );
      advancedCount++;
    }

    res.json({
      success: true,
      message: `Successfully advanced ${advancedCount} winner film(s) to ${winnerStage.unique_name}!`,
      advancedCount,
      targetStage: winnerStage.unique_name
    });
  } catch (error) {
    console.error('[SubmissionController] advanceToWinners error:', error);
    res.status(500).json({ error: 'Failed to advance winners to final stage.' });
  }
}

/**
 * GET /api/submissions/winners-board
 * Returns official festival winners grouped category-wise.
 */
async function getWinnersBoard(req, res) {
  try {
    const eventId = req.headers['x-event-id'] || req.headers['x-edition-id'] || req.headers['x-festival-id'] || 1;
    const stageId = req.query.stage_id || req.body?.stage_id;

    // 1. Fetch categories
    const categories = await query(
      'SELECT id, event_id, name, order_index FROM award_categories WHERE event_id = ? ORDER BY order_index ASC, id ASC',
      [eventId]
    );

    // 2. Dynamic stage resolution
    let targetStage = null;
    if (stageId) {
      const sRows = await query('SELECT id, stage_order, unique_name FROM festival_review_states WHERE event_id = ? AND id = ? LIMIT 1', [eventId, stageId]);
      if (sRows.length > 0) targetStage = sRows[0];
    }
    if (!targetStage) {
      const stage7Rows = await query(
        'SELECT id, stage_order, unique_name FROM festival_review_states WHERE event_id = ? AND (unique_name LIKE "%winner%" OR stage_order = 7) LIMIT 1',
        [eventId]
      );
      targetStage = stage7Rows[0] || null;
    }

    // Dynamic roundNumber for scoring from previous voting stage
    let roundNumber = 5;
    const juryStageRows = await query(
      'SELECT id, stage_order FROM festival_review_states WHERE event_id = ? AND (unique_name LIKE "%jury%" OR stage_order = 5) LIMIT 1',
      [eventId]
    );
    if (juryStageRows.length > 0) {
      roundNumber = juryStageRows[0].stage_order;
    }

    // 3. Fetch all nominations for this event
    const finalistNoms = await query(`
      SELECT 
        acn.id as nomination_id,
        acn.award_name,
        acn.award_category_id,
        COALESCE(acn.is_winner, 0) as is_winner,
        s.id as submission_id,
        s.title,
        s.director,
        s.category,
        s.country,
        s.runtime,
        s.runtime as runtime_minutes,
        s.synopsis,
        s.status,
        s.current_stage_name
      FROM award_category_nominations acn
      JOIN submissions s ON s.id = acn.submission_id
      WHERE acn.event_id = ? AND s.status != 'Rejected'
      ORDER BY acn.award_name ASC, s.title ASC
    `, [eventId]);

    // 4. Fetch Round reviews for category-specific jury scores
    const reviews = await query(`
      SELECT film_id, overall_rating, criteria_scores
      FROM screening_reviews
      WHERE event_id = ? AND round_number = ?
    `, [eventId, roundNumber]);

    for (const fn of finalistNoms) {
      const key = 'award_' + fn.award_name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
      const filmRevs = reviews.filter(r => r.film_id === fn.submission_id);
      let totalScore = 0;
      let count = 0;
      for (const r of filmRevs) {
        let score = null;
        if (r.criteria_scores) {
          try {
            const parsed = typeof r.criteria_scores === 'string' ? JSON.parse(r.criteria_scores) : r.criteria_scores;
            if (parsed[key] !== undefined) score = Number(parsed[key]);
          } catch (e) {}
        }
        if (score === null && r.overall_rating) {
          score = Number(r.overall_rating);
        }
        if (score !== null && !isNaN(score) && score > 0) {
          totalScore += score;
          count++;
        }
      }
      fn.jury_rating = count > 0 ? (totalScore / count).toFixed(2) : '0.00';
      fn.review_count = count;
    }

    // 5. Structure category-wise winners and runner-ups
    const categoryWinners = categories.map(cat => {
      const catNoms = finalistNoms.filter(n => n.award_name.toLowerCase() === cat.name.toLowerCase());
      const winner = catNoms.find(n => Number(n.is_winner) === 1) || null;
      const otherNominees = catNoms
        .filter(n => Number(n.is_winner) !== 1)
        .sort((a, b) => parseFloat(b.jury_rating || 0) - parseFloat(a.jury_rating || 0));

      return {
        category_id: cat.id,
        category_name: cat.name,
        order_index: cat.order_index,
        winner,
        nominees: otherNominees,
        total_nominees: catNoms.length
      };
    });

    // 6. Find any films in Winner stage without a category nomination
    const nominatedSubIds = new Set(finalistNoms.map(n => n.submission_id));
    const winnerStageId = targetStage?.id || null;
    const winnerStageOrder = targetStage?.stage_order || 7;
    const allStageWinners = await query(`
      SELECT 
        s.id as submission_id,
        s.title,
        s.director,
        s.category,
        s.country,
        s.runtime,
        s.runtime as runtime_minutes,
        s.synopsis,
        s.status,
        s.current_stage_name
      FROM submissions s
      WHERE s.event_id = ? AND s.status != 'Rejected' AND (
        s.status = 'Winner' 
        OR s.current_stage_name = 'Winner'
        OR s.review_state_id = ?
        OR s.review_state_id IN (SELECT id FROM festival_review_states WHERE event_id = ? AND stage_order = ?)
      )
      ORDER BY s.title ASC
    `, [eventId, winnerStageId, eventId, winnerStageOrder]);

    const unassignedWinners = allStageWinners.filter(w => !nominatedSubIds.has(w.submission_id));
    const uniqueWinningFilmIds = new Set(
      finalistNoms.filter(n => Number(n.is_winner) === 1).map(n => n.submission_id)
    );

    res.json({
      success: true,
      categories,
      categoryWinners,
      unassignedWinners,
      finalistNoms,
      stage: targetStage ? { id: targetStage.id, unique_name: targetStage.unique_name, stage_order: targetStage.stage_order } : null,
      stats: {
        totalCategories: categories.length,
        awardedCategories: categoryWinners.filter(c => c.winner !== null).length,
        totalWinningFilms: uniqueWinningFilmIds.size
      }
    });
  } catch (error) {
    console.error('[SubmissionController] getWinnersBoard error:', error);
    res.status(500).json({ error: 'Failed to fetch winners board data.' });
  }
}

/**
 * GET /api/submissions/activity-logs
 * Unified activity log for Submissions Hub.
 * - Admin can see all groups' activities across the festival, with filters for group (admin vs jury), action, search, dates.
 * - Jury members can strictly only see their own activities (evaluations, scores, notes).
 */
async function getActivityLogs(req, res) {
  try {
    const eventId = req.headers['x-event-id'] || req.headers['x-edition-id'] || req.headers['x-festival-id'] || req.query.eventId || 40;

    const isJuryUser = Boolean(
      req.user && (
        req.user.current_group === 'jury' ||
        req.user.current_group === 'judge' ||
        req.user.role === 'jury' ||
        req.user.role === 'judge' ||
        req.permissionScope?.scopeKey === 'assigned'
      ) && !req.user.isSuperAdmin && req.user.role !== 'Admin'
    );
    const currentJurorUserIds = req.permissionScope?.allUserIds || (req.user?.id ? [req.user.id] : []);

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
    const offset = (page - 1) * limit;

    const { action, group, search, startDate, endDate, submissionId } = req.query;

    const conditions = ['s.event_id = ?'];
    const params = [eventId];

    if (isJuryUser) {
      // Jurors strictly see only actions they personally performed
      if (currentJurorUserIds.length > 0) {
        const placeholders = currentJurorUserIds.map(() => '?').join(',');
        conditions.push(`sl.actor_user_id IN (${placeholders})`);
        params.push(...currentJurorUserIds);
      } else {
        conditions.push('1 = 0');
      }
    } else {
      // Admin scoping: can filter by actor_group ('admin' or 'jury')
      if (group === 'jury') {
        conditions.push(`(g.group_key = 'jury' OR sl.action = 'REVIEW_SUBMITTED')`);
      } else if (group === 'admin') {
        conditions.push(`(g.group_key = 'admin' OR g.group_key IS NULL) AND sl.action != 'REVIEW_SUBMITTED'`);
      }
    }

    if (submissionId) {
      conditions.push('sl.submission_id = ?');
      params.push(submissionId);
    }

    if (action && action !== 'ALL') {
      conditions.push('sl.action = ?');
      params.push(action);
    }

    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      conditions.push(`(s.title LIKE ? OR i.name LIKE ? OR o.name LIKE ? OR u.email LIKE ? OR sl.notes LIKE ?)`);
      params.push(term, term, term, term, term);
    }

    if (startDate) {
      conditions.push('sl.created_at >= ?');
      params.push(startDate);
    }

    if (endDate) {
      conditions.push('sl.created_at <= ?');
      params.push(`${endDate} 23:59:59`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Total count
    const countSql = `
      SELECT COUNT(*) as total
      FROM submission_logs sl
      JOIN submissions s ON s.id = sl.submission_id
      LEFT JOIN users u ON u.id = sl.actor_user_id
      LEFT JOIN individuals i ON i.user_id = u.id
      LEFT JOIN organizations o ON o.user_id = u.id
      LEFT JOIN user_event_groups ueg ON ueg.user_id = sl.actor_user_id AND ueg.event_id = s.event_id
      LEFT JOIN \`groups\` g ON g.id = ueg.group_id
      ${whereClause}
    `;
    const countRes = await query(countSql, params);
    const total = countRes[0]?.total || 0;

    // Fetch action breakdown for filter badges
    const actionCountsSql = `
      SELECT sl.action, COUNT(*) as cnt
      FROM submission_logs sl
      JOIN submissions s ON s.id = sl.submission_id
      LEFT JOIN users u ON u.id = sl.actor_user_id
      LEFT JOIN user_event_groups ueg ON ueg.user_id = sl.actor_user_id AND ueg.event_id = s.event_id
      LEFT JOIN \`groups\` g ON g.id = ueg.group_id
      WHERE s.event_id = ? ${isJuryUser ? `AND sl.actor_user_id IN (${currentJurorUserIds.map(() => '?').join(',')})` : ''}
      GROUP BY sl.action
    `;
    const actionCountsParams = [eventId];
    if (isJuryUser) {
      actionCountsParams.push(...currentJurorUserIds);
    }
    const actionCountsRes = await query(actionCountsSql, actionCountsParams);
    const actionCounts = {};
    for (const ac of actionCountsRes) {
      actionCounts[ac.action] = ac.cnt;
    }

    // Fetch logs with limit and offset
    const listSql = `
      SELECT 
        sl.id,
        sl.submission_id,
        sl.action,
        sl.notes,
        sl.created_at,
        sl.actor_user_id,
        s.title as film_title,
        s.director as film_director,
        s.category as category_name,
        COALESCE(s.current_stage_name, s.status) as current_stage_name,
        s.event_id,
        COALESCE(i.name, o.name, u.email, 'System') as actor_name,
        COALESCE(i.thumbnail_pic, o.thumbnail_pic, i.profile_pic, o.profile_pic) as actor_thumbnail_pic,
        u.email as actor_email,
        COALESCE(g.label, CASE WHEN sl.action = 'REVIEW_SUBMITTED' THEN 'Jury' ELSE 'Admin' END) as actor_group,
        COALESCE(g.group_key, CASE WHEN sl.action = 'REVIEW_SUBMITTED' THEN 'jury' ELSE 'admin' END) as actor_group_key
      FROM submission_logs sl
      JOIN submissions s ON s.id = sl.submission_id
      LEFT JOIN users u ON u.id = sl.actor_user_id
      LEFT JOIN individuals i ON i.user_id = u.id
      LEFT JOIN organizations o ON o.user_id = u.id
      LEFT JOIN user_event_groups ueg ON ueg.user_id = sl.actor_user_id AND ueg.event_id = s.event_id
      LEFT JOIN \`groups\` g ON g.id = ueg.group_id
      ${whereClause}
      ORDER BY sl.created_at DESC, sl.id DESC
      LIMIT ? OFFSET ?
    `;
    const listParams = [...params, limit, offset];
    const rawLogs = await query(listSql, listParams);
    const logs = rawLogs.map(l => ({
      ...l,
      actor_thumbnail_pic: formatThumbnailUrl(l.actor_thumbnail_pic)
    }));

    res.json({
      success: true,
      logs,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
      actionCounts,
      isJuryUser
    });
  } catch (error) {
    console.error('[SubmissionController] getActivityLogs error:', error);
    res.status(500).json({ error: 'Failed to retrieve activity logs.' });
  }
}

/**
 * GET /api/submissions/activity-logs/export
 * Admin-only CSV export of the activity audit log.
 */
async function exportActivityCsv(req, res) {
  try {
    const isJuryUser = Boolean(
      req.user && (
        req.user.current_group === 'jury' ||
        req.user.current_group === 'judge' ||
        req.user.role === 'jury' ||
        req.user.role === 'judge' ||
        req.permissionScope?.scopeKey === 'assigned'
      ) && !req.user.isSuperAdmin && req.user.role !== 'Admin'
    );

    if (isJuryUser) {
      return res.status(403).json({ error: 'Activity log export is restricted to festival administrators.' });
    }

    const eventId = req.headers['x-event-id'] || req.headers['x-edition-id'] || req.headers['x-festival-id'] || req.query.eventId || 40;
    const { action, group, search, startDate, endDate } = req.query;

    const conditions = ['s.event_id = ?'];
    const params = [eventId];

    if (group === 'jury') {
      conditions.push(`(g.group_key = 'jury' OR sl.action = 'REVIEW_SUBMITTED')`);
    } else if (group === 'admin') {
      conditions.push(`(g.group_key = 'admin' OR g.group_key IS NULL) AND sl.action != 'REVIEW_SUBMITTED'`);
    }

    if (action && action !== 'ALL') {
      conditions.push('sl.action = ?');
      params.push(action);
    }

    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      conditions.push(`(s.title LIKE ? OR i.name LIKE ? OR o.name LIKE ? OR u.email LIKE ? OR sl.notes LIKE ?)`);
      params.push(term, term, term, term, term);
    }

    if (startDate) {
      conditions.push('sl.created_at >= ?');
      params.push(startDate);
    }

    if (endDate) {
      conditions.push('sl.created_at <= ?');
      params.push(`${endDate} 23:59:59`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT 
        sl.id,
        sl.submission_id,
        sl.action,
        sl.notes,
        sl.created_at,
        s.title as film_title,
        s.category as category_name,
        COALESCE(i.name, o.name, u.email, 'System') as actor_name,
        u.email as actor_email,
        COALESCE(g.label, CASE WHEN sl.action = 'REVIEW_SUBMITTED' THEN 'Jury' ELSE 'Admin' END) as actor_group
      FROM submission_logs sl
      JOIN submissions s ON s.id = sl.submission_id
      LEFT JOIN users u ON u.id = sl.actor_user_id
      LEFT JOIN individuals i ON i.user_id = u.id
      LEFT JOIN organizations o ON o.user_id = u.id
      LEFT JOIN user_event_groups ueg ON ueg.user_id = sl.actor_user_id AND ueg.event_id = s.event_id
      LEFT JOIN \`groups\` g ON g.id = ueg.group_id
      ${whereClause}
      ORDER BY sl.created_at DESC, sl.id DESC
      LIMIT 10000
    `;
    const rows = await query(sql, params);

    let csv = 'Log ID,Timestamp UTC,Date & Time (Local),Film Title,Action Type,Performed By,Role / Group,Activity Details\n';
    for (const r of rows) {
      const dt = new Date(r.created_at);
      const utcStr = !isNaN(dt) ? dt.toISOString() : '';
      const localStr = !isNaN(dt) ? dt.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : '';
      const row = [
        r.id,
        `"${utcStr}"`,
        `"${localStr}"`,
        `"${(r.film_title || '').replace(/"/g, '""')}"`,
        `"${r.action || ''}"`,
        `"${(r.actor_name || '').replace(/"/g, '""')}"`,
        `"${r.actor_group || 'Admin'}"`,
        `"${(r.notes || '').replace(/"/g, '""')}"`
      ];
      csv += row.join(',') + '\n';
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="Festival_Activity_Log_${eventId}_${Date.now()}.csv"`);
    res.send(csv);
  } catch (error) {
    console.error('[SubmissionController] exportActivityCsv error:', error);
    res.status(500).json({ error: 'Failed to export activity logs CSV.' });
  }
}

module.exports = {
  list,
  getById,
  reject,
  flag,
  updateStatus,
  updateCategory,
  updateStage,
  advanceFilm,
  bulkAssign,
  bulkAdvance,
  bulkReject,
  exportCsv,
  getActivityLogs,
  exportActivityCsv,
  getNominationsBoard,
  toggleNomination,
  addAwardCategory,
  removeAwardCategory,
  advanceNominationsToJury,
  getJuryVotingBoard,
  toggleCategoryJury,
  assignAllCategoryJury,
  advanceToResults,
  getFinalistsBoard,
  selectWinner,
  removeWinner,
  advanceToWinners,
  getWinnersBoard
};
