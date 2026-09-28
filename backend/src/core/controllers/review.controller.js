/**
 * Review & Jury Controller
 * Real MySQL database operations for Screening reviews,
 * 13-criteria judge scorecards, multi-judge assignments,
 * 10 summary metric counts, Judge Progress Matrix, and pipeline decisions.
 */

const { query } = require('../../config/database');

/**
 * Standard 13 screening review criteria matching Freecomers / FestiPlus spec
 */
const DEFAULT_CRITERIA_KEYS = [
  'screenplay',
  'dialogues',
  'writing',
  'structure',
  'direction',
  'acting',
  'cinematography',
  'production_design',
  'sound',
  'music',
  'creativity',
  'inspire',
  'message_importance',
];

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
        s.rejected_at
      FROM submissions s
      LEFT JOIN submission_flags sf ON sf.id = s.flag_id
      WHERE s.event_id = ?
      ORDER BY s.id ASC
    `, [eventId]);

    // All assignments for this event
    const assignments = await query(`
      SELECT sa.id, sa.film_id, sa.round_number, sa.judge_user_id, sa.status,
             COALESCE(i.name, o.name, u.email) as judge_name
      FROM screening_assignments sa
      JOIN users u ON u.id = sa.judge_user_id
      LEFT JOIN individuals i ON i.user_id = u.id
      LEFT JOIN organizations o ON o.user_id = u.id
      WHERE sa.event_id = ?
    `, [eventId]);

    // All reviews for this event
    const reviews = await query(`
      SELECT sr.id, sr.assignment_id, sr.film_id, sr.judge_user_id, sr.round_number,
             sr.criteria_scores, sr.overall_rating, sr.notes, sr.submitted_at,
             COALESCE(i.name, o.name, u.email) as judge_name
      FROM screening_reviews sr
      JOIN users u ON u.id = sr.judge_user_id
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
      DEFAULT_CRITERIA_KEYS.forEach(k => {
        let sum = 0;
        let count = 0;
        filmRevs.forEach(r => {
          try {
            const sc = typeof r.criteria_scores === 'string' ? JSON.parse(r.criteria_scores) : r.criteria_scores;
            if (sc && sc[k] != null && !isNaN(sc[k])) {
              sum += parseFloat(sc[k]);
              count++;
            }
          } catch (e) {}
        });
        criteriaAverages[k] = count > 0 ? (sum / count).toFixed(1) : null;
      });

      const mergedReviews = filmAssigns.map(a => {
        const rev = filmRevs.find(r => (r.assignment_id && r.assignment_id === a.id) || (r.judge_user_id === a.judge_user_id));
        return {
          assignment_id: a.id,
          judge_id: a.judge_user_id,
          judge_name: a.judge_name,
          name: a.judge_name,
          round_number: a.round_number || roundNumber,
          status: rev ? 'completed' : a.status,
          overall_rating: rev ? rev.overall_rating : null,
          criteria_scores: rev ? (typeof rev.criteria_scores === 'string' ? JSON.parse(rev.criteria_scores) : rev.criteria_scores) : null,
          notes: rev ? rev.notes : null,
          submitted_at: rev ? rev.submitted_at : null,
        };
      });

      filmRevs.forEach(r => {
        if (!mergedReviews.some(m => (r.assignment_id && m.assignment_id === r.assignment_id) || m.judge_id === r.judge_user_id)) {
          mergedReviews.push({
            assignment_id: r.assignment_id,
            judge_id: r.judge_user_id,
            judge_name: r.judge_name,
            name: r.judge_name,
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
        assigned_judge_ids: filmAssigns.map(a => a.judge_user_id),
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

    // Check if user is Judge
    const groupRows = await query(`
      SELECT g.group_key 
      FROM user_event_groups ueg
      JOIN \`groups\` g ON g.id = ueg.group_id
      WHERE ueg.user_id = ? AND ueg.event_id = ?
    `, [userId, eventId]);

    const isJudge = groupRows.some(g => g.group_key === 'judge');
    const isAdmin = groupRows.some(g => g.group_key === 'admin') || Boolean(req.user.isSuperAdmin);

    // If Judge and not explicitly requesting admin view:
    const forceJudge = isJudge && (!isAdmin || req.query.view === 'judge');

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
        COALESCE(i.name, o.name, u.email) as judge_name,
        u.id as judge_id
      FROM screening_assignments sa
      JOIN submissions s ON s.id = sa.film_id
      LEFT JOIN submission_flags sf ON sf.id = s.flag_id
      JOIN users u ON u.id = sa.judge_user_id
      LEFT JOIN individuals i ON i.user_id = u.id
      LEFT JOIN organizations o ON o.user_id = u.id
      LEFT JOIN screening_reviews sr ON sr.assignment_id = sa.id
      WHERE sa.event_id = ?
    `;
    const params = [eventId];

    if (forceJudge) {
      sql += ' AND sa.judge_user_id = ?';
      params.push(userId);
    }
    if (req.query.round) {
      sql += ' AND sa.round_number = ?';
      params.push(roundNumber);
    }

    sql += ' ORDER BY sa.id ASC';

    const rows = await query(sql, params);

    res.json({
      isJudge: forceJudge,
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
 * GET /api/reviews/judges
 * Returns all judges available for assignment for this event.
 */
async function listJudges(req, res) {
  try {
    const eventId = req.headers['x-event-id'] || req.headers['x-edition-id'] || req.headers['x-festival-id'] || req.query.eventId || 1;

    // Fetch users with group 'judge' or 'reviewer' or assigned as judge
    let judges = await query(`
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
      WHERE ueg.event_id = ? AND g.group_key IN ('judge', 'reviewer', 'volunteer')
      ORDER BY name ASC
    `, [eventId]);

    // Fallback if no specific user_event_groups: return all users who have group 'judge'
    if (judges.length === 0) {
      judges = await query(`
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
        WHERE g.group_key = 'judge'
        ORDER BY name ASC
      `);
    }

    res.json({ data: judges });
  } catch (error) {
    console.error('[ReviewController] listJudges error:', error);
    res.status(500).json({ error: 'Failed to retrieve judges.' });
  }
}

/**
 * POST /api/reviews/assign
 * Body: { film_id, round_number = 1, judge_ids = [] }
 */
async function assignJudges(req, res) {
  try {
    const eventId = req.headers['x-event-id'] || req.headers['x-edition-id'] || req.headers['x-festival-id'] || req.query.eventId || 1;
    const { film_id, round_number = 1, judge_ids = [] } = req.body;

    if (!film_id) {
      return res.status(400).json({ error: 'film_id is required.' });
    }

    const round = parseInt(round_number, 10) || 1;
    const targetJudgeIds = Array.isArray(judge_ids) ? judge_ids.map(id => parseInt(id, 10)).filter(Boolean) : [];

    // Existing assignments for this film & round
    const existing = await query(`
      SELECT id, judge_user_id FROM screening_assignments 
      WHERE film_id = ? AND round_number = ? AND event_id = ?
    `, [film_id, round, eventId]);

    const existingJudgeIds = existing.map(e => e.judge_user_id);

    // Judges to remove
    const toRemove = existing.filter(e => !targetJudgeIds.includes(e.judge_user_id));
    for (const rem of toRemove) {
      await query(`DELETE FROM screening_assignments WHERE id = ?`, [rem.id]);
    }

    // Judges to add
    const toAdd = targetJudgeIds.filter(id => !existingJudgeIds.includes(id));
    for (const jid of toAdd) {
      await query(`
        INSERT INTO screening_assignments (event_id, film_id, judge_user_id, round_number, status)
        VALUES (?, ?, ?, ?, 'in_progress')
      `, [eventId, film_id, jid, round]);
    }

    // Automatically transition submission status based on assignment
    if (targetJudgeIds.length > 0) {
      if (round === 1) {
        const revs = await query(
          'SELECT id FROM screening_reviews WHERE film_id = ? AND round_number = 1 AND event_id = ?',
          [film_id, eventId]
        );
        const allCompleted = revs.length >= targetJudgeIds.length;
        const newStatus = allCompleted ? 'Admin Review' : 'Round 1 Screening';
        await query(
          "UPDATE submissions SET status = ?, updated_at = NOW() WHERE id = ? AND event_id = ? AND status IN ('Submitted', 'Round 1 Screening', 'In Review', 'Admin Review')",
          [newStatus, film_id, eventId]
        );
      } else if (round === 2) {
        const revs = await query(
          'SELECT id FROM screening_reviews WHERE film_id = ? AND round_number = 2 AND event_id = ?',
          [film_id, eventId]
        );
        const allCompleted = revs.length >= targetJudgeIds.length;
        const newStatus = allCompleted ? 'Admin Review' : 'Round 2 Screening';
        await query(
          "UPDATE submissions SET status = ?, updated_at = NOW() WHERE id = ? AND event_id = ? AND status IN ('Admin Review', 'Submitted', 'Round 1 Screening', 'Round 2 Screening')",
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
          "UPDATE submissions SET status = 'Submitted', updated_at = NOW() WHERE id = ? AND event_id = ? AND status IN ('Round 1 Screening', 'In Review')",
          [film_id, eventId]
        );
      }
    }

    res.json({
      message: 'Judge assignments updated successfully.',
      film_id,
      round_number: round,
      assigned_count: targetJudgeIds.length,
      judge_ids: targetJudgeIds,
    });
  } catch (error) {
    console.error('[ReviewController] assignJudges error:', error);
    res.status(500).json({ error: 'Failed to assign judges.' });
  }
}

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

    // Find or create assignment
    let assignId = assignment_id ? parseInt(assignment_id, 10) : null;
    let targetJudgeUserId = req.user.id;

    if (assignId) {
      const assignRow = await query('SELECT judge_user_id FROM screening_assignments WHERE id = ?', [assignId]);
      if (assignRow.length > 0 && assignRow[0].judge_user_id) {
        targetJudgeUserId = assignRow[0].judge_user_id;
      }
    } else {
      const existingAssign = await query(`
        SELECT id, judge_user_id FROM screening_assignments 
        WHERE film_id = ? AND judge_user_id = ? AND round_number = ? AND event_id = ?
        LIMIT 1
      `, [film_id, req.user.id, round, eventId]);

      if (existingAssign.length > 0) {
        assignId = existingAssign[0].id;
        targetJudgeUserId = existingAssign[0].judge_user_id;
      } else {
        const ins = await query(`
          INSERT INTO screening_assignments (event_id, film_id, judge_user_id, round_number, status)
          VALUES (?, ?, ?, ?, 'completed')
        `, [eventId, film_id, req.user.id, round]);
        assignId = ins.insertId;
      }
    }

    // Insert or update review
    const existingReview = await query(`
      SELECT id FROM screening_reviews 
      WHERE (assignment_id IS NOT NULL AND assignment_id = ?) 
         OR (film_id = ? AND judge_user_id = ? AND round_number = ? AND event_id = ?)
      LIMIT 1
    `, [assignId, film_id, targetJudgeUserId, round, eventId]);

    if (existingReview.length > 0) {
      await query(`
        UPDATE screening_reviews 
        SET criteria_scores = ?, overall_rating = ?, notes = ?, submitted_at = NOW(), judge_user_id = ?, assignment_id = ?
        WHERE id = ?
      `, [scoresJson, overallRating, notes || '', targetJudgeUserId, assignId, existingReview[0].id]);
    } else {
      await query(`
        INSERT INTO screening_reviews (assignment_id, event_id, film_id, judge_user_id, round_number, criteria_scores, overall_rating, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [assignId, eventId, film_id, targetJudgeUserId, round, scoresJson, overallRating, notes || '']);
    }

    if (assignId) {
      await query(`UPDATE screening_assignments SET status = 'completed', completed_at = NOW() WHERE id = ?`, [assignId]);
    }

    // Update overall rating on submission
    const avgRes = await query(`
      SELECT AVG(overall_rating) as avg_score FROM screening_reviews WHERE film_id = ? AND event_id = ?
    `, [film_id, eventId]);
    if (avgRes.length > 0 && avgRes[0].avg_score) {
      await query('UPDATE submissions SET overall_average_rating = ? WHERE id = ?', [avgRes[0].avg_score, film_id]);
    }

    // Only transition status to 'Admin Review' when ALL assigned judges for this round have submitted reviews
    const roundAssignments = await query(`
      SELECT sa.id, sa.judge_user_id, sr.id as review_id
      FROM screening_assignments sa
      LEFT JOIN screening_reviews sr ON (
        sr.assignment_id = sa.id 
        OR (sr.film_id = sa.film_id AND sr.judge_user_id = sa.judge_user_id AND sr.round_number = sa.round_number)
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
      INSERT INTO jury_ballots (event_id, category_id, judge_user_id, ranked_nominees)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE ranked_nominees = VALUES(ranked_nominees), submitted_at = NOW()
    `, [eventId, category_id, req.user.id, JSON.stringify(ranked_nominees)]);

    res.json({ message: 'Confidential ballot cast successfully.' });
  } catch (error) {
    console.error('[ReviewController] submitBallot error:', error);
    res.status(500).json({ error: 'Failed to submit ballot.' });
  }
}

module.exports = {
  getPipeline,
  listAssignments,
  listJudges,
  assignJudges,
  submitScorecard,
  makeDecision,
  toggleVoting,
  submitBallot,
};
