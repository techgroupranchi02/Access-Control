/**
 * Submission Controller
 * Real MySQL database operations for the 23 submissions, flags, and rejection workflow.
 */

const { query } = require('../../config/database');

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
          WHEN ffs.selection_status = 'rejected' OR ffs.submission_status = 'refunded' THEN 'Rejected'
          WHEN ffs.selection_status = 'accepted' OR ffs.selection_status = 'official selection' THEN 'Official Selection'
          WHEN ffs.selection_status = 'under review' THEN 'In Review'
          ELSE 'Submitted'
        END as status,
        CASE WHEN ffs.submission_status = 'refunded' THEN 'Submission payment was refunded.' ELSE NULL END as rejection_reason,
        CASE WHEN ffs.submission_status = 'refunded' THEN ffs.updated_at ELSE NULL END as rejected_at,
        ffs.created_at,
        ffs.updated_at
      FROM film_festivals_submissions ffs
      JOIN film_festivals ff ON ff.film_festival_id = ffs.festival_id
      LEFT JOIN projects p ON p.project_id = ffs.project_id
      LEFT JOIN users u ON u.id = ffs.user_id
      LEFT JOIN individuals i ON i.user_id = u.id
      LEFT JOIN organizations o ON o.user_id = u.id
      LEFT JOIN countries c ON c.country_id = p.country_id
      LEFT JOIN film_festivals_category_milestone_prices cm ON cm.film_festival_category_milestone_price_id = ffs.film_festival_category_milestone_price_id
      LEFT JOIN film_festivals_categories cat ON cat.film_festival_category_id = cm.film_festival_category_id
      WHERE ff.event_id = ? AND (ffs.submission_status IN ('submitted', 'refunded') OR ffs.transaction_record_id IS NOT NULL)
    `, [eventId]);

    for (const s of realSubs) {
      const existing = await query('SELECT id FROM submissions WHERE id = ?', [s.id]);
      if (existing.length === 0) {
        await query(`
          INSERT INTO submissions (id, event_id, title, director, category, runtime, country, email, synopsis, status, rejection_reason, rejected_at, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          s.id, s.event_id, s.title, s.director, s.category, s.runtime, s.country, s.email, s.synopsis, s.status, s.rejection_reason, s.rejected_at, s.created_at, s.updated_at
        ]);
      }
    }

    // Keep submissions status synchronized with screening assignments and reviews:
    // Only transition status to 'Admin Review' when ALL assigned judges for that round have completed reviews!
    const filmStatusStats = await query(`
      SELECT 
        s.id, 
        s.status,
        COUNT(DISTINCT CASE WHEN sa.round_number = 1 THEN sa.id END) AS r1_assigned,
        COUNT(DISTINCT CASE WHEN sr.round_number = 1 THEN sr.id END) AS r1_reviewed,
        COUNT(DISTINCT CASE WHEN sa.round_number = 2 THEN sa.id END) AS r2_assigned,
        COUNT(DISTINCT CASE WHEN sr.round_number = 2 THEN sr.id END) AS r2_reviewed
      FROM submissions s
      LEFT JOIN screening_assignments sa ON sa.film_id = s.id AND sa.event_id = s.event_id
      LEFT JOIN screening_reviews sr ON sr.film_id = s.id AND sr.event_id = s.event_id
      WHERE s.event_id = ?
      GROUP BY s.id, s.status
    `, [eventId]);

    for (const stat of filmStatusStats) {
      if (['Official Selection', 'Winner', 'Finalist', 'Rejected'].includes(stat.status)) {
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

    // Sync overall_average_rating if reviews exist
    await query(`
      UPDATE submissions s
      JOIN (
        SELECT film_id, event_id, AVG(overall_rating) as avg_rating
        FROM screening_reviews
        WHERE event_id = ?
        GROUP BY film_id, event_id
      ) r ON r.film_id = s.id AND r.event_id = s.event_id
      SET s.overall_average_rating = r.avg_rating
      WHERE s.event_id = ? AND (s.overall_average_rating IS NULL OR s.overall_average_rating != r.avg_rating)
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
    const { status, category, flag_id, search } = req.query;

    let sql = `
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
      WHERE s.event_id = ?
    `;
    const params = [eventId];

    if (status && status !== 'all') {
      if (status === 'Submitted') {
        sql += ` AND s.status = 'Submitted' 
                 AND s.id NOT IN (SELECT film_id FROM screening_assignments WHERE event_id = ?) 
                 AND s.id NOT IN (SELECT film_id FROM screening_reviews WHERE event_id = ?)`;
        params.push(eventId, eventId);
      } else if (status === 'Round 1 Screening') {
        sql += ` AND s.status IN ('Round 1 Screening', 'In Review')`;
      } else if (status === 'Admin Review') {
        sql += ` AND s.status IN ('Admin Review', 'Consideration')`;
      } else if (status === 'Round 2 Screening') {
        sql += ` AND s.status = 'Round 2 Screening'`;
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
    if (search && search.trim()) {
      sql += ' AND (s.title LIKE ? OR s.director LIKE ? OR s.country LIKE ?)';
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }

    sql += ' ORDER BY s.id ASC';

    const submissions = await query(sql, params);

    // Get summary counts across all 9 pipeline statuses
    const countRows = await query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE 
          WHEN s.status = 'Submitted' 
               AND s.id NOT IN (SELECT film_id FROM screening_assignments WHERE event_id = ?) 
               AND s.id NOT IN (SELECT film_id FROM screening_reviews WHERE event_id = ?) 
          THEN 1 ELSE 0 
        END) as submitted,
        SUM(CASE WHEN s.status IN ('Round 1 Screening', 'In Review') THEN 1 ELSE 0 END) as round_1_screening,
        SUM(CASE WHEN s.status IN ('Admin Review', 'Consideration') THEN 1 ELSE 0 END) as admin_review,
        SUM(CASE WHEN s.status = 'Round 2 Screening' THEN 1 ELSE 0 END) as round_2_screening,
        SUM(CASE WHEN s.status = 'Official Selection' THEN 1 ELSE 0 END) as official_selection,
        SUM(CASE WHEN s.status = 'Winner' THEN 1 ELSE 0 END) as winner,
        SUM(CASE WHEN s.status = 'Finalist' THEN 1 ELSE 0 END) as finalist,
        SUM(CASE WHEN s.status = 'Rejected' THEN 1 ELSE 0 END) as rejected,
        SUM(CASE WHEN s.flag_id IS NOT NULL THEN 1 ELSE 0 END) as flagged
      FROM submissions s
      WHERE s.event_id = ?
    `, [eventId, eventId, eventId]);

    const row = countRows[0] || {};
    const counts = {
      total: parseInt(row.total, 10) || 0,
      submitted: parseInt(row.submitted, 10) || 0,
      round_1_screening: parseInt(row.round_1_screening, 10) || 0,
      admin_review: parseInt(row.admin_review, 10) || 0,
      round_2_screening: parseInt(row.round_2_screening, 10) || 0,
      official_selection: parseInt(row.official_selection, 10) || 0,
      winner: parseInt(row.winner, 10) || 0,
      finalist: parseInt(row.finalist, 10) || 0,
      rejected: parseInt(row.rejected, 10) || 0,
      flagged: parseInt(row.flagged, 10) || 0,
      byStatus: {
        'all': parseInt(row.total, 10) || 0,
        'Submitted': parseInt(row.submitted, 10) || 0,
        'Round 1 Screening': parseInt(row.round_1_screening, 10) || 0,
        'Admin Review': parseInt(row.admin_review, 10) || 0,
        'Round 2 Screening': parseInt(row.round_2_screening, 10) || 0,
        'Official Selection': parseInt(row.official_selection, 10) || 0,
        'Winner': parseInt(row.winner, 10) || 0,
        'Finalist': parseInt(row.finalist, 10) || 0,
        'Rejected': parseInt(row.rejected, 10) || 0,
      }
    };

    let flags = await query('SELECT id, label, color FROM submission_flags WHERE event_id = ?', [eventId]);
    if (flags.length === 0) {
      flags = await query('SELECT id, label, color FROM submission_flags ORDER BY label ASC');
    }

    res.json({
      data: submissions,
      total: submissions.length,
      counts: counts,
      flags
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

    const rows = await query(`
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
        COALESCE(i.name, o.name, u.email) as jury_name
      FROM screening_reviews sr
      JOIN users u ON u.id = sr.jury_user_id
      LEFT JOIN individuals i ON i.user_id = u.id
      LEFT JOIN organizations o ON o.user_id = u.id
      WHERE sr.film_id = ?
    `, [id]);

    // Merge assignments with review outcomes so assigned jury always appears
    const mergedReviewItems = assignments.map(a => {
      const rev = reviews.find(r => (r.assignment_id && r.assignment_id === a.assignment_id) || (r.jury_user_id === a.jury_user_id && r.round_number === a.round_number));
      return {
        assignment_id: a.assignment_id,
        jury_id: a.jury_user_id,
        judge_id: a.jury_user_id,
        jury_name: a.jury_name,
        judge_name: a.jury_name,
        name: a.jury_name,
        round_number: a.round_number || 1,
        status: rev ? 'completed' : (a.assignment_status || 'assigned'),
        overall_rating: rev ? rev.overall_rating : null,
        criteria_scores: rev ? (typeof rev.criteria_scores === 'string' ? JSON.parse(rev.criteria_scores) : rev.criteria_scores) : null,
        notes: rev ? rev.notes : null,
        submitted_at: rev ? rev.submitted_at : null,
      };
    });

    // Also include any standalone review without an assignment
    reviews.forEach(r => {
      if (!mergedReviewItems.some(item => (r.assignment_id && item.assignment_id === r.assignment_id) || (item.jury_id === r.jury_user_id && item.round_number === r.round_number))) {
        mergedReviewItems.push({
          assignment_id: r.assignment_id,
          jury_id: r.jury_user_id,
          judge_id: r.jury_user_id,
          jury_name: r.jury_name,
          judge_name: r.jury_name,
          name: r.jury_name,
          round_number: r.round_number || 1,
          status: 'completed',
          overall_rating: r.overall_rating,
          criteria_scores: typeof r.criteria_scores === 'string' ? JSON.parse(r.criteria_scores) : r.criteria_scores,
          notes: r.notes,
          submitted_at: r.submitted_at,
        });
      }
    });

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

    res.json({
      ...rows[0],
      assigned_jury: mergedReviewItems,
      assigned_judges: mergedReviewItems,
      reviews: mergedReviewItems,
      assignments,
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

module.exports = { list, getById, reject, flag, updateStatus };
