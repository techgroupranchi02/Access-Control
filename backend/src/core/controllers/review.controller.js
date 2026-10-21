/**
 * Review & Jury Controller
 * Real MySQL database operations for Screening reviews,
 * 13-criteria judge scorecards, multi-judge assignments,
 * 10 summary metric counts, Judge Progress Matrix, and pipeline decisions.
 */

const { query } = require('../../config/database');
const { formatThumbnailUrl } = require('../utils/media.utils');

/**
 * Standard 13 screening review criteria matching Freecomers / FestiPlus spec
 */
const DEFAULT_CRITERIA_KEYS = [
  'story',
  'direction',
  'cinematography',
  'sound',
  'performance',
  'technical_quality',
  'emotional_impact',
  'originality',
  'clarity',
  'screenplay',
  'dialogues',
  'writing',
  'structure',
  'acting',
  'production_design',
  'music',
  'creativity',
  'inspire',
  'message_importance',
];

const CRITERIA_ALIASES = {
  story: ['story', 'screenplay', 'narrative', 'writing'],
  direction: ['direction', 'directorial_vision'],
  cinematography: ['cinematography', 'visuals'],
  sound: ['sound', 'music', 'sound_music', 'audio'],
  performance: ['performance', 'acting'],
  technical_quality: ['technical_quality', 'technical', 'structure', 'production_design'],
  emotional_impact: ['emotional_impact', 'inspire', 'impact'],
  originality: ['originality', 'creativity'],
  clarity: ['clarity', 'clarity_of_message', 'message_importance'],
};

/**
 * GET /api/reviews/pipeline
 * Returns:
 * - pipelineState
 * - metrics: 10 summary cards
 * - progressMatrix: all films with reviews count & overall avg
 * - filmsInRound: films in active screening round with review stats & assigned judges
 */
async function getPipeline(req, res) {
  try {
    const eventId = req.headers['x-event-id'] || req.headers['x-edition-id'] || req.headers['x-festival-id'] || req.query.eventId || 1;
    const roundNumber = parseInt(req.query.round, 10) || 1;

    // Pipeline state
    const stateRows = await query('SELECT * FROM pipeline_states WHERE event_id = ? LIMIT 1', [eventId]);
    const pipeline = stateRows.length > 0 ? stateRows[0] : { current_stage: 1, voting_open: false, active_round_count: 2 };

    const categories = await query('SELECT * FROM award_categories WHERE event_id = ? ORDER BY order_index ASC', [eventId]);

    // Submissions in this event
    const films = await query(`
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
        COALESCE(p.project_id, ffs.project_id) as project_id,
        p.watch_link,
        p.watch_link_password,
        p.trailer_link
      FROM submissions s
      LEFT JOIN submission_flags sf ON sf.id = s.flag_id
      LEFT JOIN film_festivals_submissions ffs ON ffs.film_festivals_submission_id = s.id
      LEFT JOIN projects p ON p.project_id = COALESCE(ffs.project_id, (SELECT p2.project_id FROM projects p2 WHERE p2.title = s.title ORDER BY p2.project_id DESC LIMIT 1))
      WHERE s.event_id = ?
      ORDER BY s.id ASC
    `, [eventId]);

    // All assignments for this event
    const assignments = await query(`
      SELECT sa.id, sa.film_id, sa.round_number, sa.jury_user_id, sa.status,
             COALESCE(i.name, o.name, u.email) as jury_name,
             COALESCE(i.name, o.name, u.email) as judge_name
      FROM screening_assignments sa
      JOIN users u ON u.id = sa.jury_user_id
      LEFT JOIN individuals i ON i.user_id = u.id
      LEFT JOIN organizations o ON o.user_id = u.id
      WHERE sa.event_id = ?
    `, [eventId]);

    // All reviews for this event
    const reviews = await query(`
      SELECT sr.id, sr.assignment_id, sr.film_id, sr.jury_user_id, sr.round_number,
             sr.criteria_scores, sr.overall_rating, sr.notes, sr.submitted_at,
             COALESCE(i.name, o.name, u.email) as jury_name,
             COALESCE(i.name, o.name, u.email) as judge_name
      FROM screening_reviews sr
      JOIN users u ON u.id = sr.jury_user_id
      LEFT JOIN individuals i ON i.user_id = u.id
      LEFT JOIN organizations o ON o.user_id = u.id
      WHERE sr.event_id = ?
    `, [eventId]);

    // Compute 10 metrics
    const totalFilms = films.length;
    const r1Assignments = assignments.filter(a => a.round_number === 1);
    const r1AssignedFilmIds = new Set(r1Assignments.map(a => a.film_id));
    const r1Reviews = reviews.filter(r => r.round_number === 1);

    // For each assigned film in R1, check if all assigned judges submitted
    let r1CompletedCount = 0;
    r1AssignedFilmIds.forEach(filmId => {
      const filmAssigns = r1Assignments.filter(a => a.film_id === filmId);
      const filmRevs = r1Reviews.filter(r => r.film_id === filmId);
      if (filmAssigns.length > 0 && filmRevs.length >= filmAssigns.length) {
        r1CompletedCount++;
      }
    });

    const r2Assignments = assignments.filter(a => a.round_number === 2);
    const r2AssignedFilmIds = new Set(r2Assignments.map(a => a.film_id));
    const r2Reviews = reviews.filter(r => r.round_number === 2);
    let r2CompletedCount = 0;
    r2AssignedFilmIds.forEach(filmId => {
      const filmAssigns = r2Assignments.filter(a => a.film_id === filmId);
      const filmRevs = r2Reviews.filter(r => r.film_id === filmId);
      if (filmAssigns.length > 0 && filmRevs.length >= filmAssigns.length) {
        r2CompletedCount++;
      }
    });

    const considerationCount = films.filter(f => f.status === 'Consideration').length;
    const finalistCount = films.filter(f => f.status === 'Finalist').length;
    const winnerCount = films.filter(f => f.status === 'Winner').length;
    const rejectedCount = films.filter(f => f.status === 'Rejected').length;

    const metrics = {
      total_films: totalFilms,
      round1_assigned: r1AssignedFilmIds.size,
      round1_completed: r1CompletedCount,
      round1_pending: Math.max(0, r1AssignedFilmIds.size - r1CompletedCount),
      consideration: considerationCount,
      round2_assigned: r2AssignedFilmIds.size,
      round2_completed: r2CompletedCount,
      finalists: finalistCount,
      winners: winnerCount,
      rejected: rejectedCount,
    };

    // Build Judge Progress Matrix rows
    const progressMatrix = films.map(f => {
      const filmR1Revs = r1Reviews.filter(r => r.film_id === f.id);
      const filmR2Revs = r2Reviews.filter(r => r.film_id === f.id);
      return {
        id: f.id,
        title: f.title,
        status: f.status,
        round1_reviews: filmR1Revs.length,
        round2_reviews: filmR2Revs.length,
        overall_avg: f.rating ? parseFloat(f.rating).toFixed(2) : null,
      };
    });

    // Build films in round with assigned judges, reviews, and criteria score summaries
    const filmsInRound = films.map(f => {
      const filmAssigns = assignments.filter(a => a.film_id === f.id && a.round_number === roundNumber);
      const filmRevs = reviews.filter(r => r.film_id === f.id && r.round_number === roundNumber);
      
      // Calculate criteria score averages across reviews for this film
      const criteriaAverages = {};
      const getCriteriaScore = (sc, key) => {
        if (!sc || typeof sc !== 'object') return null;
        if (sc[key] != null && !isNaN(sc[key])) return parseFloat(sc[key]);
        const aliases = CRITERIA_ALIASES[key];
        if (aliases) {
          for (const alias of aliases) {
            if (sc[alias] != null && !isNaN(sc[alias])) return parseFloat(sc[alias]);
          }
        }
        return null;
      };

      DEFAULT_CRITERIA_KEYS.forEach(k => {
        let sum = 0;
        let count = 0;
        filmRevs.forEach(r => {
          try {
            const sc = typeof r.criteria_scores === 'string' ? JSON.parse(r.criteria_scores) : r.criteria_scores;
            const scoreVal = getCriteriaScore(sc, k);
            if (scoreVal != null) {
              sum += scoreVal;
              count++;
            }
          } catch (e) {}
        });
        criteriaAverages[k] = count > 0 ? (sum / count).toFixed(1) : null;
      });

      const mergedReviews = filmAssigns.map(a => {
        const rev = filmRevs.find(r => (r.assignment_id && r.assignment_id === a.id) || (r.jury_user_id === a.jury_user_id));
        return {
          assignment_id: a.id,
          jury_id: a.jury_user_id,
          judge_id: a.jury_user_id,
          jury_name: a.jury_name,
          judge_name: a.judge_name,
          name: a.jury_name,
          round_number: a.round_number || roundNumber,
          status: rev ? 'completed' : a.status,
          overall_rating: rev ? rev.overall_rating : null,
          criteria_scores: rev ? (typeof rev.criteria_scores === 'string' ? JSON.parse(rev.criteria_scores) : rev.criteria_scores) : null,
          notes: rev ? rev.notes : null,
          submitted_at: rev ? rev.submitted_at : null,
        };
      });

      filmRevs.forEach(r => {
        if (!mergedReviews.some(m => (r.assignment_id && m.assignment_id === r.assignment_id) || m.jury_id === r.jury_user_id)) {
          mergedReviews.push({
            assignment_id: r.assignment_id,
            jury_id: r.jury_user_id,
            judge_id: r.jury_user_id,
            jury_name: r.jury_name,
            judge_name: r.judge_name,
            name: r.jury_name,
            round_number: r.round_number || roundNumber,
            status: 'completed',
            overall_rating: r.overall_rating,
            criteria_scores: typeof r.criteria_scores === 'string' ? JSON.parse(r.criteria_scores) : r.criteria_scores,
            notes: r.notes,
            submitted_at: r.submitted_at,
          });
        }
      });

      return {
        ...f,
        assigned_jury_ids: filmAssigns.map(a => a.jury_user_id),
        assigned_judge_ids: filmAssigns.map(a => a.jury_user_id),
        assigned_jury: mergedReviews,
        assigned_judges: mergedReviews,
        reviews_count: filmRevs.length,
        reviews: mergedReviews,
        criteria_averages: criteriaAverages,
      };
    });

    res.json({
      pipelineState: pipeline,
      awardCategories: categories,
      metrics,
      progressMatrix,
      filmsInRound,
    });
  } catch (error) {
    console.error('[ReviewController] getPipeline error:', error);
    res.status(500).json({ error: 'Failed to retrieve pipeline state.' });
  }
}

/**
 * GET /api/reviews/assignments
 * For Judge: returns their assigned films with review completion status & scorecard.
 * For Admin: returns all assignments or assignments for specified round.
 */
async function listAssignments(req, res) {
  try {
    const eventId = req.headers['x-event-id'] || req.headers['x-edition-id'] || req.headers['x-festival-id'] || req.query.eventId || 1;
    const userId = req.user.id;
    const roundNumber = parseInt(req.query.round, 10) || 1;

    // Check if user is Jury or Admin
    const groupRows = await query(`
      SELECT g.group_key 
      FROM user_event_groups ueg
      JOIN \`groups\` g ON g.id = ueg.group_id
      WHERE ueg.user_id = ? AND ueg.event_id = ?
    `, [userId, eventId]);

    const isJury = groupRows.some(g => g.group_key === 'jury' || g.group_key === 'judge');
    const isAdmin = groupRows.some(g => g.group_key === 'admin') || Boolean(req.user.isSuperAdmin);

    // If Jury and not explicitly requesting admin view:
    const forceJury = isJury && (!isAdmin || req.query.view === 'jury' || req.query.view === 'judge');

    let sql = `
      SELECT 
        sa.id as assignment_id,
        sa.film_id,
        sa.round_number,
        sa.status as assignment_status,
        s.title,
        s.director,
        s.category,
        s.runtime,
        s.country,
        s.synopsis,
        s.status as film_status,
        s.flag_id,
        sf.label as flag_label,
        sf.color as flag_color,
        sr.id as review_id,
        sr.criteria_scores,
        sr.overall_rating,
        sr.notes,
        sr.submitted_at,
        COALESCE(i.name, o.name, u.email) as jury_name,
        COALESCE(i.name, o.name, u.email) as judge_name,
        u.id as jury_id,
        u.id as judge_id
      FROM screening_assignments sa
      JOIN submissions s ON s.id = sa.film_id
      LEFT JOIN submission_flags sf ON sf.id = s.flag_id
      JOIN users u ON u.id = sa.jury_user_id
      LEFT JOIN individuals i ON i.user_id = u.id
      LEFT JOIN organizations o ON o.user_id = u.id
      LEFT JOIN screening_reviews sr ON sr.assignment_id = sa.id
      WHERE sa.event_id = ?
    `;
    const params = [eventId];

    if (forceJury) {
      sql += ' AND sa.jury_user_id = ?';
      params.push(userId);
      if (!req.query.all_rounds && !req.query.round) {
        sql += `
          AND EXISTS (
            SELECT 1 FROM festival_review_states frs
            WHERE frs.id = s.review_state_id AND frs.stage_order = sa.round_number
          )
        `;
      }
    }
    if (req.query.round) {
      sql += ' AND sa.round_number = ?';
      params.push(roundNumber);
    }

    sql += ' ORDER BY sa.id ASC';

    const rows = await query(sql, params);

    res.json({
      isJury: forceJury,
      isJudge: forceJury,
      data: rows.map(a => {
        let scores = null;
        if (a.criteria_scores) {
          try {
            scores = typeof a.criteria_scores === 'string' ? JSON.parse(a.criteria_scores) : a.criteria_scores;
          } catch (e) {}
        }
        return {
          ...a,
          isCompleted: a.assignment_status === 'completed' || Boolean(a.review_id),
          scores,
        };
      })
    });
  } catch (error) {
    console.error('[ReviewController] listAssignments error:', error);
    res.status(500).json({ error: 'Failed to retrieve screening assignments.' });
  }
}

/**
 * GET /api/reviews/jury & GET /api/reviews/judges
 * Returns all jury members available for assignment for this event.
 */
async function listJury(req, res) {
  try {
    const eventId = req.headers['x-event-id'] || req.headers['x-edition-id'] || req.headers['x-festival-id'] || req.query.eventId || 1;

    // Fetch users with group 'jury' or 'judge' assigned as jury for this festival
    let rawJury = await query(`
      SELECT DISTINCT 
        u.id, 
        u.email, 
        COALESCE(i.name, o.name, u.email) as name,
        COALESCE(i.thumbnail_pic, o.thumbnail_pic, i.profile_pic, o.profile_pic) as thumbnail_pic,
        g.group_key
      FROM users u
      LEFT JOIN individuals i ON i.user_id = u.id
      LEFT JOIN organizations o ON o.user_id = u.id
      JOIN user_event_groups ueg ON ueg.user_id = u.id
      JOIN \`groups\` g ON g.id = ueg.group_id
      WHERE ueg.event_id = ? AND g.group_key IN ('jury', 'judge')
      ORDER BY name ASC
    `, [eventId]);

    const jury = rawJury.map(j => ({
      ...j,
      thumbnail: formatThumbnailUrl(j.thumbnail_pic),
      thumbnailPic: formatThumbnailUrl(j.thumbnail_pic),
      thumbnail_pic: formatThumbnailUrl(j.thumbnail_pic)
    }));

    res.json({ data: jury });
  } catch (error) {
    console.error('[ReviewController] listJury error:', error);
    res.status(500).json({ error: 'Failed to retrieve jury members.' });
  }
}

const listJudges = listJury;

/**
 * POST /api/reviews/assign
 * Body: { film_id, round_number = 1, jury_ids = [], judge_ids = [] }
 */
async function assignJury(req, res) {
  try {
    const eventId = req.headers['x-event-id'] || req.headers['x-edition-id'] || req.headers['x-festival-id'] || req.query.eventId || 1;
    const { film_id, round_number = 1, jury_ids, judge_ids = [] } = req.body;

    if (!film_id) {
      return res.status(400).json({ error: 'film_id is required.' });
    }

    const round = parseInt(round_number, 10) || 1;
    const rawIds = jury_ids || judge_ids || [];
    const targetJuryIds = Array.isArray(rawIds) ? rawIds.map(id => parseInt(id, 10)).filter(Boolean) : [];

    // Existing assignments for this film & round
    const existing = await query(`
      SELECT id, jury_user_id FROM screening_assignments 
      WHERE film_id = ? AND round_number = ? AND event_id = ?
    `, [film_id, round, eventId]);

    const existingJuryIds = existing.map(e => e.jury_user_id);

    // Jury members to remove
    const toRemove = existing.filter(e => !targetJuryIds.includes(e.jury_user_id));
    for (const rem of toRemove) {
      await query(`DELETE FROM screening_assignments WHERE id = ?`, [rem.id]);
    }

    // Jury members to add
    const toAdd = targetJuryIds.filter(id => !existingJuryIds.includes(id));
    for (const jid of toAdd) {
      await query(`
        INSERT INTO screening_assignments (event_id, film_id, jury_user_id, round_number, status)
        VALUES (?, ?, ?, ?, 'in_progress')
      `, [eventId, film_id, jid, round]);
    }

    // Automatically transition submission status based on assignment
    if (targetJuryIds.length > 0) {
      if (round === 1) {
        const stage1Rows = await query(
          'SELECT id, unique_name FROM festival_review_states WHERE event_id = ? AND stage_order = 1 AND (status IS NULL OR status != "inactive") LIMIT 1',
          [eventId]
        );
        const stage1Id = stage1Rows.length > 0 ? stage1Rows[0].id : null;
        const stage1Name = stage1Rows.length > 0 ? stage1Rows[0].unique_name : 'Round 1: Screening';

        const revs = await query(
          'SELECT id FROM screening_reviews WHERE film_id = ? AND round_number = 1 AND event_id = ?',
          [film_id, eventId]
        );
        const allCompleted = revs.length >= targetJuryIds.length;
        const newStatus = allCompleted ? 'Admin Review' : 'Round 1 Screening';
        const currentSub = await query('SELECT review_state_id, current_stage_name, status FROM submissions WHERE id = ? AND event_id = ?', [film_id, eventId]);
        const wasSubmitted = currentSub.length > 0 && (!currentSub[0].review_state_id || ['Submitted', 'New Submission'].includes(currentSub[0].status) || ['Submitted', 'New Submission'].includes(currentSub[0].current_stage_name));

        await query(
          "UPDATE submissions SET status = ?, review_state_id = COALESCE(review_state_id, ?), current_stage_name = CASE WHEN review_state_id IS NULL OR current_stage_name IN ('Submitted', 'New Submission') THEN ? ELSE current_stage_name END, updated_at = NOW() WHERE id = ? AND event_id = ? AND status IN ('Submitted', 'New Submission', 'Round 1 Screening', 'In Review', 'Admin Review')",
          [newStatus, stage1Id, stage1Name, film_id, eventId]
        );

        if (wasSubmitted && req.user && req.user.id) {
          await query(`
            INSERT INTO submission_logs (submission_id, action, notes, actor_user_id)
            VALUES (?, 'STAGE_ADVANCE', ?, ?)
          `, [film_id, `Promoted from New Submission to Stage 1 (${stage1Name}) upon reviewer assignment`, req.user.id]);
        }
      } else if (round === 2) {
        const revs = await query(
          'SELECT id FROM screening_reviews WHERE film_id = ? AND round_number = 2 AND event_id = ?',
          [film_id, eventId]
        );
        const allCompleted = revs.length >= targetJuryIds.length;
        const newStatus = allCompleted ? 'Admin Review' : 'Round 2 Screening';
        await query(
          "UPDATE submissions SET status = ?, updated_at = NOW() WHERE id = ? AND event_id = ? AND status IN ('Admin Review', 'Submitted', 'New Submission', 'Round 1 Screening', 'Round 2 Screening')",
          [newStatus, film_id, eventId]
        );
      }
    } else {
      const revs = await query(
        'SELECT id FROM screening_reviews WHERE film_id = ? AND event_id = ?',
        [film_id, eventId]
      );
      if (revs.length === 0) {
        await query(
          "UPDATE submissions SET status = 'New Submission', current_stage_name = 'New Submission', updated_at = NOW() WHERE id = ? AND event_id = ? AND status IN ('Round 1 Screening', 'In Review')",
          [film_id, eventId]
        );
      }
    }

    res.json({
      message: 'Jury assignments updated successfully.',
      film_id,
      round_number: round,
      assigned_count: targetJuryIds.length,
      jury_ids: targetJuryIds,
      judge_ids: targetJuryIds,
    });
  } catch (error) {
    console.error('[ReviewController] assignJury error:', error);
    res.status(500).json({ error: 'Failed to assign jury.' });
  }
}

const assignJudges = assignJury;

/**
 * POST /api/reviews/scorecard
 * Body: { assignment_id, film_id, round_number = 1, scores, notes }
 */
async function submitScorecard(req, res) {
  try {
    const eventId = req.headers['x-event-id'] || req.headers['x-edition-id'] || req.headers['x-festival-id'] || req.query.eventId || 1;
    const { assignment_id, film_id, round_number = 1, scores, notes } = req.body;

    if (!film_id || !scores || typeof scores !== 'object') {
      return res.status(400).json({ error: 'film_id and criteria scores object are required.' });
    }

    const round = parseInt(round_number, 10) || 1;

    // Calculate overall rating average
    const scoreValues = Object.values(scores).map(Number).filter(v => !isNaN(v) && v > 0);
    const overallRating = scoreValues.length > 0 
      ? (scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length).toFixed(2)
      : '3.00';

    const scoresJson = JSON.stringify(scores);

    // Resolve all linked user IDs for this user (supporting individual and organization IDs)
    let allUserIds = [req.user.id];
    if (req.user.email) {
      const linkedUsers = await query('SELECT id FROM users WHERE email = ? AND status = 1', [req.user.email]);
      if (linkedUsers.length > 0) {
        allUserIds = linkedUsers.map(u => u.id);
      }
    }
    const userPlaceholders = allUserIds.map(() => '?').join(',');

    // Find or create assignment
    let assignId = assignment_id ? parseInt(assignment_id, 10) : null;
    let targetJuryUserId = req.user.id;

    if (assignId) {
      const assignRow = await query('SELECT jury_user_id FROM screening_assignments WHERE id = ?', [assignId]);
      if (assignRow.length > 0 && assignRow[0].jury_user_id) {
        targetJuryUserId = assignRow[0].jury_user_id;
      }
    } else {
      const existingAssign = await query(`
        SELECT id, jury_user_id FROM screening_assignments 
        WHERE film_id = ? AND jury_user_id IN (${userPlaceholders}) AND round_number = ? AND event_id = ?
        LIMIT 1
      `, [film_id, ...allUserIds, round, eventId]);

      if (existingAssign.length > 0) {
        assignId = existingAssign[0].id;
        targetJuryUserId = existingAssign[0].jury_user_id;
      } else {
        const ins = await query(`
          INSERT INTO screening_assignments (event_id, film_id, jury_user_id, round_number, status)
          VALUES (?, ?, ?, ?, 'completed')
        `, [eventId, film_id, req.user.id, round]);
        assignId = ins.insertId;
      }
    }

    // Insert or update review
    const existingReview = await query(`
      SELECT id FROM screening_reviews 
      WHERE (assignment_id IS NOT NULL AND assignment_id = ?) 
         OR (film_id = ? AND jury_user_id = ? AND round_number = ? AND event_id = ?)
      LIMIT 1
    `, [assignId, film_id, targetJuryUserId, round, eventId]);

    if (existingReview.length > 0) {
      await query(`
        UPDATE screening_reviews 
        SET criteria_scores = ?, overall_rating = ?, notes = ?, submitted_at = NOW(), jury_user_id = ?, assignment_id = ?
        WHERE id = ?
      `, [scoresJson, overallRating, notes || '', targetJuryUserId, assignId, existingReview[0].id]);
    } else {
      await query(`
        INSERT INTO screening_reviews (assignment_id, event_id, film_id, jury_user_id, round_number, criteria_scores, overall_rating, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [assignId, eventId, film_id, targetJuryUserId, round, scoresJson, overallRating, notes || '']);
    }

    if (assignId) {
      await query(`UPDATE screening_assignments SET status = 'completed', completed_at = NOW() WHERE id = ?`, [assignId]);
    }

    // Record activity log for the juror review submission
    try {
      await query(`
        INSERT INTO submission_logs (submission_id, action, notes, actor_user_id)
        VALUES (?, 'REVIEW_SUBMITTED', ?, ?)
      `, [
        film_id,
        `Submitted scorecard evaluation for Round ${round} with overall score: ${overallRating}${notes ? ` ("${notes.slice(0, 100)}")` : ''}`,
        req.user.id
      ]);
    } catch (logErr) {
      console.warn('[ReviewController] Failed to record REVIEW_SUBMITTED log:', logErr.message);
    }

    // Update overall rating on submission strictly for the current round
    const avgRes = await query(`
      SELECT AVG(overall_rating) as avg_score FROM screening_reviews WHERE film_id = ? AND event_id = ? AND round_number = ?
    `, [film_id, eventId, round]);
    if (avgRes.length > 0 && avgRes[0].avg_score) {
      await query('UPDATE submissions SET overall_average_rating = ? WHERE id = ?', [avgRes[0].avg_score, film_id]);
    }

    // Only transition status to 'Admin Review' when ALL assigned jury members for this round have submitted reviews
    const roundAssignments = await query(`
      SELECT sa.id, sa.jury_user_id, sr.id as review_id
      FROM screening_assignments sa
      LEFT JOIN screening_reviews sr ON (
        sr.assignment_id = sa.id 
        OR (sr.film_id = sa.film_id AND sr.jury_user_id = sa.jury_user_id AND sr.round_number = sa.round_number)
      )
      WHERE sa.film_id = ? AND sa.round_number = ? AND sa.event_id = ?
    `, [film_id, round, eventId]);

    const totalAssigned = roundAssignments.length;
    const completedCount = roundAssignments.filter(a => a.review_id).length;

    if (totalAssigned > 0 && completedCount >= totalAssigned) {
      // All assigned judges for this round have completed reviews -> transition to Admin Review
      await query(`
        UPDATE submissions 
        SET status = 'Admin Review', updated_at = NOW() 
        WHERE id = ? AND event_id = ? AND status IN ('Submitted', 'Round 1 Screening', 'Round 2 Screening', 'In Review')
      `, [film_id, eventId]);
    } else {
      // Some assigned judges are still pending -> keep status in current screening round
      const screeningStatus = round === 2 ? 'Round 2 Screening' : 'Round 1 Screening';
      await query(`
        UPDATE submissions 
        SET status = ?, updated_at = NOW() 
        WHERE id = ? AND event_id = ? AND status IN ('Submitted', 'In Review', 'Admin Review', 'Round 1 Screening', 'Round 2 Screening')
      `, [screeningStatus, film_id, eventId]);
    }

    res.json({
      message: 'Scorecard submitted successfully.',
      overallRating,
      scores,
      notes,
    });
  } catch (error) {
    console.error('[ReviewController] submitScorecard error:', error);
    res.status(500).json({ error: 'Failed to submit scorecard.' });
  }
}

/**
 * POST /api/reviews/decision
 * Body: { film_id, decision }
 */
async function makeDecision(req, res) {
  try {
    const eventId = req.headers['x-event-id'] || req.headers['x-edition-id'] || req.headers['x-festival-id'] || req.query.eventId || 1;
    const { film_id, decision } = req.body;

    if (!film_id || !decision) {
      return res.status(400).json({ error: 'film_id and decision are required.' });
    }

    let status = 'Submitted';
    if (decision === 'advance_round_2') status = 'Round 2 Screening';
    else if (decision === 'official_selection') status = 'Official Selection';
    else if (decision === 'consideration') status = 'Consideration';
    else if (decision === 'rejected') status = 'Rejected';
    else status = decision;

    await query(`
      UPDATE submissions SET status = ?, updated_at = NOW() WHERE id = ? AND event_id = ?
    `, [status, film_id, eventId]);

    // Also update Freecomers real table if applicable
    let ffsStatus = 'awaiting decision';
    if (status === 'Official Selection') ffsStatus = 'accepted';
    else if (status === 'Rejected') ffsStatus = 'rejected';
    else if (status === 'Round 2 Screening' || status === 'Consideration') ffsStatus = 'under review';

    await query(`
      UPDATE film_festivals_submissions SET selection_status = ?, updated_at = NOW() WHERE film_festivals_submission_id = ?
    `, [ffsStatus, film_id]);

    await query(`
      INSERT INTO submission_logs (submission_id, action, notes, actor_user_id)
      VALUES (?, 'DECISION', ?, ?)
    `, [film_id, `Pipeline decision applied: ${status}`, req.user.id]);

    res.json({
      message: `Decision applied: Film is now "${status}".`,
      film_id,
      status,
    });
  } catch (error) {
    console.error('[ReviewController] makeDecision error:', error);
    res.status(500).json({ error: 'Failed to apply decision.' });
  }
}

/**
 * POST /api/reviews/toggle-voting
 * Admin opens/closes voting in pipeline_states.
 */
async function toggleVoting(req, res) {
  try {
    const eventId = req.headers['x-event-id'] || req.headers['x-edition-id'] || req.headers['x-festival-id'] || req.query.eventId || 1;
    const { voting_open } = req.body;

    await query(`
      UPDATE pipeline_states SET voting_open = ? WHERE event_id = ?
    `, [Boolean(voting_open), eventId]);

    res.json({ message: `Voting ${voting_open ? 'opened' : 'closed'} successfully.`, voting_open: Boolean(voting_open) });
  } catch (error) {
    console.error('[ReviewController] toggleVoting error:', error);
    res.status(500).json({ error: 'Failed to update voting state.' });
  }
}

/**
 * POST /api/reviews/ballot
 * Confidential jury ballot.
 */
async function submitBallot(req, res) {
  try {
    const eventId = req.headers['x-event-id'] || req.headers['x-edition-id'] || req.headers['x-festival-id'] || req.query.eventId || 1;
    const { category_id, ranked_nominees } = req.body;

    if (!category_id || !ranked_nominees) {
      return res.status(400).json({ error: 'Category ID and ranked nominees required.' });
    }

    await query(`
      INSERT INTO jury_ballots (event_id, category_id, jury_user_id, ranked_nominees)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE ranked_nominees = VALUES(ranked_nominees), submitted_at = NOW()
    `, [eventId, category_id, req.user.id, JSON.stringify(ranked_nominees)]);

    res.json({ message: 'Confidential ballot cast successfully.' });
  } catch (error) {
    console.error('[ReviewController] submitBallot error:', error);
    res.status(500).json({ error: 'Failed to submit ballot.' });
  }
}

/**
 * POST /api/reviews/complete-stage
 * Complete current review stage and advance qualifying films to the next sequential stage.
 */
async function completeStage(req, res) {
  try {
    const eventId = req.headers['x-event-id'] || req.headers['x-edition-id'] || req.headers['x-festival-id'] || 1;
    const { stage_order, stage_id } = req.body;

    let currentStage = null;
    if (stage_id) {
      const rows = await query('SELECT * FROM festival_review_states WHERE id = ? AND event_id = ?', [stage_id, eventId]);
      if (rows.length > 0) currentStage = rows[0];
    } else if (stage_order) {
      const rows = await query('SELECT * FROM festival_review_states WHERE stage_order = ? AND event_id = ?', [stage_order, eventId]);
      if (rows.length > 0) currentStage = rows[0];
    } else {
      const rows = await query('SELECT * FROM festival_review_states WHERE stage_order = 1 AND event_id = ?', [eventId]);
      if (rows.length > 0) currentStage = rows[0];
    }

    if (!currentStage) {
      return res.status(404).json({ error: 'Review stage not found.' });
    }

    // Find next stage
    const nextStageRows = await query(
      'SELECT * FROM festival_review_states WHERE event_id = ? AND stage_order > ? ORDER BY stage_order ASC LIMIT 1',
      [eventId, currentStage.stage_order]
    );

    if (nextStageRows.length === 0) {
      return res.status(400).json({ error: 'This is already the final review stage. No further advancement stage exists.' });
    }

    const nextStage = nextStageRows[0];
    const cutoff = parseFloat(currentStage.auto_advance_cutoff) || 4.5;
    const rejectCutoff = parseFloat(currentStage.auto_reject_cutoff) || 3.0;

    // Fetch films currently in this stage
    const filmsInStage = await query(`
      SELECT id, title, overall_average_rating, composite_score
      FROM submissions
      WHERE event_id = ? AND (review_state_id = ? OR current_stage_name = ?)
    `, [eventId, currentStage.id, currentStage.unique_name]);

    let advancedFilms = [];
    let rejectedFilms = [];
    let pendingFilms = [];

    for (const film of filmsInStage) {
      const score = parseFloat(film.composite_score != null ? film.composite_score : (film.overall_average_rating || 0));
      if (score >= cutoff) {
        // Qualified! Advance to next stage
        await query(`
          UPDATE submissions 
          SET review_state_id = ?, current_stage_name = ?, auto_promoted = 1, updated_at = NOW()
          WHERE id = ? AND event_id = ?
        `, [nextStage.id, nextStage.unique_name, film.id, eventId]);

        await query(`
          INSERT INTO submission_logs (submission_id, action, notes, actor_user_id)
          VALUES (?, 'AUTO_ADVANCE', ?, ?)
        `, [film.id, `Advanced from ${currentStage.unique_name} to ${nextStage.unique_name} (Score: ${score} >= ${cutoff})`, req.user.id]);

        advancedFilms.push({ id: film.id, title: film.title, score });
      } else if (score > 0 && score < rejectCutoff) {
        // Below rejection cutoff
        await query(`
          UPDATE submissions 
          SET status = 'Rejected', rejection_reason = ?, rejected_at = NOW(), updated_at = NOW()
          WHERE id = ? AND event_id = ?
        `, [`Score (${score}) was below cutoff (${rejectCutoff}) in ${currentStage.unique_name}`, film.id, eventId]);

        rejectedFilms.push({ id: film.id, title: film.title, score });
      } else {
        pendingFilms.push({ id: film.id, title: film.title, score });
      }
    }

    // Mark current stage as completed, next stage as active
    await query('UPDATE festival_review_states SET status = "completed" WHERE id = ?', [currentStage.id]);
    await query('UPDATE festival_review_states SET status = "active" WHERE id = ?', [nextStage.id]);

    res.json({
      success: true,
      message: `Completed "${currentStage.unique_name}". Advanced ${advancedFilms.length} film(s) to "${nextStage.unique_name}".`,
      currentStage: currentStage.unique_name,
      nextStage: nextStage.unique_name,
      advancedCount: advancedFilms.length,
      rejectedCount: rejectedFilms.length,
      pendingCount: pendingFilms.length,
      advancedFilms,
      rejectedFilms
    });
  } catch (error) {
    console.error('[ReviewController] completeStage error:', error);
    res.status(500).json({ error: 'Failed to complete review stage.' });
  }
}

module.exports = {
  getPipeline,
  listAssignments,
  listJury,
  listJudges,
  assignJury,
  assignJudges,
  submitScorecard,
  makeDecision,
  toggleVoting,
  submitBallot,
  completeStage,
};
