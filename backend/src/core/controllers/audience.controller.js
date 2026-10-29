/**
 * Audience Add-On Module Controller
 * 
 * Provides end-to-end business logic for:
 * 1. Audience Settings & Categories (delegate badges, quotas, venue run-of-show)
 * 2. Gate & Screening Attendance (barcode/QR scanning, duplicate detection)
 * 3. Audience Choice Voting (Option 3 eligibility check, Bayesian weighted scoring)
 * 4. Delegate Registration & Badging (Bangalore intake, CSV import, pass generation)
 * 5. Public Mobile Scorecard API (Fast, low-latency endpoints for voters)
 */

const crypto = require('crypto');
const { query, getConnection } = require('../../config/database');
const { PREBUILT_TEMPLATES, getAvailableTemplates, getTemplateByKey } = require('../services/registration-form-templates');

/**
 * Helper: Extract event_id from request headers or query
 */
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

// ═════════════════════════════════════════════════════════════════════════════
// 1. AUDIENCE SETTINGS & CATEGORIES (/audience)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/audience/categories
 * List all delegate categories with registered delegate counts
 */
async function listCategories(req, res) {
  try {
    const eventId = getEventId(req);
    const sql = `
      SELECT 
        ac.id,
        ac.event_id,
        ac.name,
        ac.code,
        ac.badge_color,
        ac.badge_ribbon_text,
        ac.can_vote,
        ac.voting_weight,
        ac.quota,
        ac.created_at,
        (
          SELECT COUNT(*) 
          FROM saas_attendees sa 
          WHERE (sa.event_id = ac.event_id OR sa.festival_id = ac.event_id)
            AND (sa.delegate_category = ac.code OR sa.delegate_category = ac.name)
        ) AS attendee_count
      FROM audience_categories ac
      WHERE ac.event_id = ?
      ORDER BY ac.id ASC
    `;
    const categories = await query(sql, [eventId]);
    res.json({ success: true, count: categories.length, categories });
  } catch (error) {
    console.error('[AudienceController] listCategories error:', error.message);
    res.status(500).json({ error: 'Failed to retrieve audience categories.' });
  }
}

/**
 * POST /api/audience/categories
 * Create a new delegate category
 */
async function createCategory(req, res) {
  try {
    const eventId = getEventId(req);
    const { name, code, badge_color, badge_ribbon_text, can_vote, voting_weight, quota } = req.body;

    if (!name || !code) {
      return res.status(400).json({ error: 'Category name and unique code are required.' });
    }

    const cleanCode = String(code).trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const color = badge_color || '#6366f1';
    const ribbon = badge_ribbon_text || name.toUpperCase();
    const voteEligible = can_vote !== false ? 1 : 0;
    const weight = parseFloat(voting_weight) || 1.00;
    const catQuota = quota ? parseInt(quota, 10) : null;

    const insertSql = `
      INSERT INTO audience_categories (event_id, name, code, badge_color, badge_ribbon_text, can_vote, voting_weight, quota)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const result = await query(insertSql, [eventId, name.trim(), cleanCode, color, ribbon, voteEligible, weight, catQuota]);

    res.json({
      success: true,
      message: 'Audience category created successfully.',
      category: {
        id: result.insertId,
        event_id: eventId,
        name,
        code: cleanCode,
        badge_color: color,
        badge_ribbon_text: ribbon,
        can_vote: Boolean(voteEligible),
        voting_weight: weight,
        quota: catQuota
      }
    });
  } catch (error) {
    console.error('[AudienceController] createCategory error:', error.message);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'A category with this code already exists for this festival edition.' });
    }
    res.status(500).json({ error: 'Failed to create audience category.' });
  }
}

/**
 * PUT /api/audience/categories/:id
 * Update an existing delegate category
 */
async function updateCategory(req, res) {
  try {
    const categoryId = parseInt(req.params.id, 10);
    const { name, badge_color, badge_ribbon_text, can_vote, voting_weight, quota } = req.body;

    const updates = [];
    const params = [];

    if (name) { updates.push('name = ?'); params.push(name.trim()); }
    if (badge_color) { updates.push('badge_color = ?'); params.push(badge_color); }
    if (badge_ribbon_text !== undefined) { updates.push('badge_ribbon_text = ?'); params.push(badge_ribbon_text); }
    if (can_vote !== undefined) { updates.push('can_vote = ?'); params.push(can_vote ? 1 : 0); }
    if (voting_weight !== undefined) { updates.push('voting_weight = ?'); params.push(parseFloat(voting_weight) || 1.00); }
    if (quota !== undefined) { updates.push('quota = ?'); params.push(quota ? parseInt(quota, 10) : null); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields provided for update.' });
    }

    params.push(categoryId);
    await query(`UPDATE audience_categories SET ${updates.join(', ')} WHERE id = ?`, params);

    res.json({ success: true, message: 'Audience category updated successfully.' });
  } catch (error) {
    console.error('[AudienceController] updateCategory error:', error.message);
    res.status(500).json({ error: 'Failed to update category.' });
  }
}

/**
 * DELETE /api/audience/categories/:id
 */
async function deleteCategory(req, res) {
  try {
    const categoryId = parseInt(req.params.id, 10);
    await query('DELETE FROM audience_categories WHERE id = ?', [categoryId]);
    res.json({ success: true, message: 'Category removed successfully.' });
  } catch (error) {
    console.error('[AudienceController] deleteCategory error:', error.message);
    res.status(500).json({ error: 'Failed to delete category.' });
  }
}

/**
 * GET /api/audience/venues
 * List physical festival venues and scheduled screening counts
 */
async function listVenues(req, res) {
  try {
    const eventId = getEventId(req);
    const sql = `
      SELECT 
        v.venue_id AS id,
        v.event_id,
        v.venue_name AS name,
        COALESCE(v.capacity, 100) AS capacity,
        (SELECT COUNT(*) FROM screening_blocks sb WHERE sb.venue_id = v.venue_id) AS total_screenings
      FROM venues v
      WHERE v.event_id = ? OR v.festival_id = ?
      ORDER BY v.venue_id ASC
    `;
    const venues = await query(sql, [eventId, eventId]);
    res.json({ success: true, count: venues.length, venues });
  } catch (error) {
    console.error('[AudienceController] listVenues error:', error.message);
    res.status(500).json({ error: 'Failed to retrieve venues.' });
  }
}

/**
 * GET /api/audience/settings
 */
async function getAudienceSettings(req, res) {
  try {
    const eventId = getEventId(req);
    const rows = await query('SELECT settings_json FROM audience_settings WHERE event_id = ?', [eventId]);

    const defaultConfig = {
      voting_window_minutes: 30,
      adjustment_number: 10,
      require_screening_checkin: true,
      enable_did_not_watch_skip: true,
      anti_sharing_protection: true,
      delegate_registration_enabled: false,
      festival_name: 'Delhi Shorts International Film Festival (Kashish Edition)'
    };

    let config = defaultConfig;
    if (rows.length > 0 && rows[0].settings_json) {
      try {
        const parsed = typeof rows[0].settings_json === 'string' ? JSON.parse(rows[0].settings_json) : rows[0].settings_json;
        config = { ...defaultConfig, ...parsed };
      } catch (e) {
        config = defaultConfig;
      }
    }

    res.json({ success: true, settings: config });
  } catch (error) {
    console.error('[AudienceController] getAudienceSettings error:', error.message);
    res.status(500).json({ error: 'Failed to retrieve audience settings.' });
  }
}

/**
 * PUT /api/audience/settings
 */
async function updateAudienceSettings(req, res) {
  try {
    const eventId = getEventId(req);
    const settings = req.body;

    await query(`
      INSERT INTO audience_settings (event_id, settings_json)
      VALUES (?, ?)
      ON DUPLICATE KEY UPDATE settings_json = VALUES(settings_json), updated_at = CURRENT_TIMESTAMP
    `, [eventId, JSON.stringify(settings)]);

    res.json({ success: true, message: 'Audience settings saved successfully.', settings });
  } catch (error) {
    console.error('[AudienceController] updateAudienceSettings error:', error.message);
    res.status(500).json({ error: 'Failed to save audience settings.' });
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// 2. SCREENING SESSIONS & BLOCKS (/voting & run-of-show)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/audience/screenings
 * List all screening blocks with associated films and active voting status
 */
async function listScreeningBlocks(req, res) {
  try {
    const eventId = getEventId(req);
    const sql = `
      SELECT 
        sb.id,
        sb.event_id,
        sb.venue_id,
        COALESCE(v.venue_name, 'Main Auditorium') AS venue_name,
        sb.title,
        sb.block_type,
        DATE_FORMAT(sb.screening_date, '%Y-%m-%d') AS screening_date,
        TIME_FORMAT(sb.start_time, '%H:%i') AS start_time,
        TIME_FORMAT(sb.end_time, '%H:%i') AS end_time,
        sb.qr_token,
        sb.voting_status,
        sb.voting_opened_at,
        sb.voting_closed_at,
        (SELECT COUNT(*) FROM screening_checkins sc WHERE sc.screening_block_id = sb.id) AS checked_in_count,
        (SELECT COUNT(*) FROM audience_votes av WHERE av.screening_block_id = sb.id) AS total_votes_cast
      FROM screening_blocks sb
      LEFT JOIN venues v ON v.venue_id = sb.venue_id
      WHERE sb.event_id = ?
      ORDER BY sb.screening_date ASC, sb.start_time ASC
    `;
    const screenings = await query(sql, [eventId]);

    // Attach films for each screening block
    for (const screening of screenings) {
      const filmsSql = `
        SELECT 
          sbf.id AS mapping_id,
          sbf.sequence_order,
          sbf.is_eligible_for_voting,
          s.id AS film_id,
          s.title,
          s.director,
          s.category,
          s.runtime,
          s.synopsis
        FROM screening_block_films sbf
        JOIN submissions s ON s.id = sbf.film_id
        WHERE sbf.screening_block_id = ?
        ORDER BY sbf.sequence_order ASC
      `;
      screening.films = await query(filmsSql, [screening.id]);
    }

    res.json({ success: true, count: screenings.length, screenings });
  } catch (error) {
    console.error('[AudienceController] listScreeningBlocks error:', error.message);
    res.status(500).json({ error: 'Failed to retrieve screening sessions.' });
  }
}

/**
 * POST /api/audience/screenings
 * Create a screening session (Feature or Short Film block)
 */
async function createScreeningBlock(req, res) {
  try {
    const eventId = getEventId(req);
    const { venue_id, title, block_type, screening_date, start_time, end_time, film_ids } = req.body;

    if (!title || !screening_date || !start_time || !end_time) {
      return res.status(400).json({ error: 'Title, screening date, start time, and end time are required.' });
    }

    const type = block_type === 'short_block' ? 'short_block' : 'feature';
    const qrToken = 'kashish_' + crypto.randomBytes(8).toString('hex');

    const result = await query(`
      INSERT INTO screening_blocks (event_id, venue_id, title, block_type, screening_date, start_time, end_time, qr_token, voting_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `, [eventId, venue_id || null, title.trim(), type, screening_date, start_time, end_time, qrToken]);

    const blockId = result.insertId;

    // Attach films
    if (Array.isArray(film_ids) && film_ids.length > 0) {
      for (let i = 0; i < film_ids.length; i++) {
        await query(`
          INSERT INTO screening_block_films (screening_block_id, film_id, sequence_order, is_eligible_for_voting)
          VALUES (?, ?, ?, TRUE)
        `, [blockId, parseInt(film_ids[i], 10), i + 1]);
      }
    }

    res.json({
      success: true,
      message: 'Screening session created successfully.',
      screening: { id: blockId, title, qr_token: qrToken, block_type: type }
    });
  } catch (error) {
    console.error('[AudienceController] createScreeningBlock error:', error.message);
    res.status(500).json({ error: 'Failed to create screening session.' });
  }
}

/**
 * POST /api/audience/screenings/:id/open-voting
 * Open the voting window for a screening
 */
async function openVotingWindow(req, res) {
  try {
    const blockId = parseInt(req.params.id, 10);
    // Refresh the qr_token on open for security
    const dynamicQrToken = 'kashish_' + crypto.randomBytes(8).toString('hex');

    await query(`
      UPDATE screening_blocks
      SET voting_status = 'open', voting_opened_at = CURRENT_TIMESTAMP, qr_token = ?
      WHERE id = ?
    `, [dynamicQrToken, blockId]);

    res.json({
      success: true,
      message: 'Voting window is now OPEN.',
      blockId,
      qr_token: dynamicQrToken,
      status: 'open',
      vote_url: `/vote/${dynamicQrToken}`
    });
  } catch (error) {
    console.error('[AudienceController] openVotingWindow error:', error.message);
    res.status(500).json({ error: 'Failed to open voting window.' });
  }
}

/**
 * POST /api/audience/screenings/:id/close-voting
 * Close the voting window and trigger Bayesian recalculation
 */
async function closeVotingWindow(req, res) {
  try {
    const blockId = parseInt(req.params.id, 10);

    await query(`
      UPDATE screening_blocks
      SET voting_status = 'closed', voting_closed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [blockId]);

    // Recalculate leaderboard
    await recalculateScores(getEventId(req));

    res.json({ success: true, message: 'Voting window is now CLOSED. Scores recalculated.', blockId, status: 'closed' });
  } catch (error) {
    console.error('[AudienceController] closeVotingWindow error:', error.message);
    res.status(500).json({ error: 'Failed to close voting window.' });
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// 3. GATE & SCREENING ATTENDANCE (/attendance)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/attendance/scan
 * Record gate/screening check-in from scanner
 */
async function performScreeningCheckin(req, res) {
  try {
    const eventId = getEventId(req);
    const userId = req.user ? req.user.id : 1;
    const qr_token = req.body.qr_token || req.body.badge_identifier || req.body.badge_token || req.body.token;
    const attendee_id = req.body.attendee_id || req.body.attendeeId;
    const screening_block_id = req.body.screening_block_id || req.body.screeningBlockId || req.body.screening_id;
    const venue_id = req.body.venue_id;

    if (!screening_block_id) {
      return res.status(400).json({ error: 'Screening session ID is required.' });
    }

    // 1. Identify Attendee
    let targetAttendeeId = attendee_id;
    let attendeeRecord = null;
    const rawToken = qr_token ? String(qr_token).trim() : '';

      if (!targetAttendeeId && rawToken) {
        const cleanToken = rawToken;
        let derivedId = parseInt(cleanToken, 10);
        if (cleanToken.toUpperCase().startsWith('KB26-')) {
          const idPart = cleanToken.replace(/KB26-/i, '');
          derivedId = parseInt(idPart, 10) || 0;
        }

        // Find in saas_attendees or saas_qr or by serial_no
        const rows = await query(`
        SELECT sa.attendee_id, sa.name, sa.email, sa.phone, sa.delegate_category, sa.status, sa.qr_token
        FROM saas_attendees sa
        LEFT JOIN saas_qr sq ON sq.attendee_id = sa.attendee_id
        WHERE sa.qr_token = ? 
           OR sq.qr_data = ? 
           OR sa.attendee_id = ?
           OR JSON_UNQUOTE(JSON_EXTRACT(sa.custom_data, '$.serial_no')) = ?
        LIMIT 1
      `, [cleanToken, cleanToken, derivedId || 0, cleanToken]);

        if (rows.length > 0) {
          attendeeRecord = rows[0];
          targetAttendeeId = attendeeRecord.attendee_id;
        }
      } else if (targetAttendeeId) {
        const rows = await query(`
        SELECT attendee_id, name, email, phone, delegate_category, status, qr_token
        FROM saas_attendees
        WHERE attendee_id = ?
      `, [targetAttendeeId]);
        if (rows.length > 0) attendeeRecord = rows[0];
      }

      if (!attendeeRecord || !targetAttendeeId) {
        return res.status(404).json({ error: 'Attendee not found with provided token or ID.' });
      }

      // Enforce 2-step verification: Attendee must have been issued a QR badge at reception
      if (!attendeeRecord.qr_token && attendeeRecord.status !== 'badge_issued') {
        return res.status(400).json({
          error: `Badge Not Issued: Attendee "${attendeeRecord.name}" (${rawToken || '#' + targetAttendeeId}) has pre-registered, but their verified QR pass has not been issued at reception yet. Please direct them to the NGMA reception desk to collect their printed badge.`
        });
      }

      // 2. Check for duplicate scan
      const existingCheckin = await query(`
      SELECT id, scanned_at, scanned_by_user_id
      FROM screening_checkins
      WHERE screening_block_id = ? AND attendee_id = ?
    `, [screening_block_id, targetAttendeeId]);

      if (existingCheckin.length > 0) {
        return res.json({
          success: true,
          is_duplicate: true,
          message: `Already checked in at ${new Date(existingCheckin[0].scanned_at).toLocaleTimeString()}`,
          attendee: attendeeRecord
        });
      }

      // 3. Insert verified screening check-in
      await query(`
      INSERT INTO screening_checkins (event_id, screening_block_id, attendee_id, venue_id, scanned_by_user_id, scan_status)
      VALUES (?, ?, ?, ?, ?, 'valid')
    `, [eventId, screening_block_id, targetAttendeeId, venue_id || null, userId]);

      // Also update saas_attendees status if registered
      await query("UPDATE saas_attendees SET status = 'checked_in' WHERE attendee_id = ?", [targetAttendeeId]);

      res.json({
        success: true,
        is_duplicate: false,
        message: 'Check-in verified successfully! Entry granted.',
        attendee: attendeeRecord
      });
    } catch (error) {
      console.error('[AudienceController] performScreeningCheckin error:', error.message);
      res.status(500).json({ error: 'Failed to record check-in.' });
    }
  }

/**
 * GET /api/attendance/logs
 * List verified screening check-ins
 */
async function listAttendance(req, res) {
    try {
      const eventId = getEventId(req);
      const screeningId = req.query.screening_id;
      const limit = parseInt(req.query.limit, 10) || 50;

      let sql = `
      SELECT 
        sc.id,
        sc.screening_block_id,
        sb.title AS screening_title,
        sb.screening_date,
        sc.attendee_id,
        sa.name AS attendee_name,
        sa.email AS attendee_email,
        sa.phone AS attendee_phone,
        sa.delegate_category,
        COALESCE(ac.badge_color, '#6366f1') AS badge_color,
        COALESCE(ac.badge_ribbon_text, UPPER(sa.delegate_category)) AS badge_ribbon,
        sc.scanned_at,
        sc.scan_status,
        COALESCE(ind.name, u.email, 'Gate Staff') AS scanned_by_name
      FROM screening_checkins sc
      JOIN screening_blocks sb ON sb.id = sc.screening_block_id
      JOIN saas_attendees sa ON sa.attendee_id = sc.attendee_id
      LEFT JOIN audience_categories ac ON ac.code = sa.delegate_category AND ac.event_id = sc.event_id
      LEFT JOIN users u ON u.id = sc.scanned_by_user_id
      LEFT JOIN individuals ind ON ind.user_id = u.id
      WHERE sc.event_id = ?
    `;
      const params = [eventId];

      if (screeningId) {
        sql += ' AND sc.screening_block_id = ?';
        params.push(screeningId);
      }

      sql += ' ORDER BY sc.scanned_at DESC LIMIT ?';
      params.push(limit);

      const logs = await query(sql, params);

      // Summary counts
      const totalScans = await query('SELECT COUNT(*) AS total FROM screening_checkins WHERE event_id = ?', [eventId]);
      const uniqueAttendees = await query('SELECT COUNT(DISTINCT attendee_id) AS unique_count FROM screening_checkins WHERE event_id = ?', [eventId]);

      res.json({
        success: true,
        count: logs.length,
        metrics: {
          totalCheckins: totalScans[0].total,
          uniqueAttendeesCheckedIn: uniqueAttendees[0].unique_count
        },
        logs
      });
    } catch (error) {
      console.error('[AudienceController] listAttendance error:', error.message);
      res.status(500).json({ error: 'Failed to retrieve attendance logs.' });
    }
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // 4. DELEGATE REGISTRATION & BADGES (/registration)
  // ═════════════════════════════════════════════════════════════════════════════

  /**
   * POST /api/registration/attendees
   * Register a new attendee (Bangalore Intake / Spot Desk)
   */
  async function registerAttendee(req, res) {
    try {
      const eventId = getEventId(req);
      const userId = req.user ? req.user.id : 1;
      const { name, email, phone, delegate_category, registration_type, remarks } = req.body;

      if (!name) {
        return res.status(400).json({ error: 'Attendee full name is required.' });
      }

      // High entropy 36-char secure UUID token for the QR - only if explicitly requested (e.g. spot issue)
      const issueQrNow = Boolean(req.body.issue_qr_now);
      const qrToken = issueQrNow ? crypto.randomUUID() : null;
      const category = delegate_category || 'bangalore_general';
      const regType = registration_type || 'spot';
      const initialStatus = issueQrNow ? 'badge_issued' : 'registered';

      const customData = req.body.custom_data || {};
      for (const [k, v] of Object.entries(req.body)) {
        if (!['name', 'email', 'phone', 'delegate_category', 'registration_type', 'remarks', 'custom_data', 'issue_qr_now'].includes(k)) {
          customData[k] = v;
        }
      }
      const customDataJson = Object.keys(customData).length > 0 ? JSON.stringify(customData) : null;

      const insertSql = `
      INSERT INTO saas_attendees (
        event_id, festival_id, name, email, phone, delegate_category, 
        registration_type, registered_by_user_id, registered_by_role, status, qr_token, custom_data
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'admin', ?, ?, ?)
    `;
      const result = await query(insertSql, [
        eventId, eventId, name.trim(), email ? email.trim() : null, phone ? phone.trim() : null,
        category, regType, userId, initialStatus, qrToken, customDataJson
      ]);

      const attendeeId = result.insertId;
      const serialNo = 'KB26-' + String(attendeeId).padStart(4, '0');
      customData.serial_no = serialNo;
      await query('UPDATE saas_attendees SET custom_data = ? WHERE attendee_id = ?', [JSON.stringify(customData), attendeeId]);

      // If issued immediately, also register in saas_qr
      if (qrToken) {
        await query(`
        INSERT INTO saas_qr (qr_data, event_id, festival_id, attendee_id)
        VALUES (?, ?, ?, ?)
      `, [qrToken, eventId, eventId, attendeeId]);
      }

      res.json({
        success: true,
        message: issueQrNow
          ? 'Attendee registered and QR badge issued successfully.'
          : 'Attendee registered successfully. QR Badge can be issued upon physical venue arrival.',
        attendee: {
          attendee_id: attendeeId,
          serial_no: serialNo,
          name,
          email,
          phone,
          delegate_category: category,
          pass_type: customData.pass_type || 'Full-Festival Pass',
          pass_days: customData.pass_days || ['All Days'],
          custom_data: customData,
          qr_token: qrToken,
          status: initialStatus
        }
      });
    } catch (error) {
      console.error('[AudienceController] registerAttendee error:', error.message);
      res.status(500).json({ error: 'Failed to register attendee.' });
    }
  }

  /**
   * POST /api/registration/attendees/:id/issue-qr
   * Issues a physical QR badge credential to a registered attendee upon physical arrival at the venue desk.
   */
  async function issueAttendeeQrCode(req, res) {
    try {
      const eventId = getEventId(req);
      const attendeeId = parseInt(req.params.id, 10);
      if (!attendeeId) {
        return res.status(400).json({ error: 'Valid attendee ID is required.' });
      }

      const rows = await query(`
      SELECT attendee_id, event_id, name, email, phone, delegate_category, status, qr_token, custom_data
      FROM saas_attendees
      WHERE attendee_id = ? AND (event_id = ? OR festival_id = ?)
      LIMIT 1
    `, [attendeeId, eventId, eventId]);

      if (rows.length === 0) {
        return res.status(404).json({ error: 'Attendee not found.' });
      }

      const attendee = rows[0];
      let qrToken = attendee.qr_token;

      // Generate new secure UUID token if not already assigned
      if (!qrToken) {
        qrToken = crypto.randomUUID();
        await query(`
        UPDATE saas_attendees 
        SET qr_token = ?, status = 'badge_issued'
        WHERE attendee_id = ?
      `, [qrToken, attendeeId]);

        // Insert or update in saas_qr
        await query(`
        INSERT INTO saas_qr (qr_data, event_id, festival_id, attendee_id)
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE qr_data = VALUES(qr_data)
      `, [qrToken, eventId, eventId, attendeeId]);
      } else {
        // Ensure status is badge_issued
        await query(`UPDATE saas_attendees SET status = 'badge_issued' WHERE attendee_id = ?`, [attendeeId]);
      }

      let cd = attendee.custom_data;
      if (typeof cd === 'string') {
        try { cd = JSON.parse(cd); } catch { }
      }
      const serialNo = cd?.serial_no || ('KB26-' + String(attendeeId).padStart(4, '0'));

      res.json({
        success: true,
        message: `QR Badge successfully issued for ${attendee.name} (${serialNo}).`,
        qr_token: qrToken,
        serial_no: serialNo,
        status: 'badge_issued',
        attendee: {
          ...attendee,
          status: 'badge_issued',
          qr_token: qrToken,
          serial_no: serialNo
        }
      });
    } catch (error) {
      console.error('[AudienceController] issueAttendeeQrCode error:', error.message);
      res.status(500).json({ error: 'Failed to issue QR badge.' });
    }
  }

  /**
   * POST /api/registration/attendees/:id/revoke-qr
   * Revokes / resets the issued QR code for an attendee (e.g. if badge is lost or cancelled).
   */
  async function revokeAttendeeQrCode(req, res) {
    try {
      const eventId = getEventId(req);
      const attendeeId = parseInt(req.params.id, 10);
      if (!attendeeId) {
        return res.status(400).json({ error: 'Valid attendee ID is required.' });
      }

      await query(`
      UPDATE saas_attendees 
      SET qr_token = NULL, status = 'registered'
      WHERE attendee_id = ? AND (event_id = ? OR festival_id = ?)
    `, [attendeeId, eventId, eventId]);

      await query(`
      DELETE FROM saas_qr WHERE attendee_id = ? AND (event_id = ? OR festival_id = ?)
    `, [attendeeId, eventId, eventId]);

      res.json({ success: true, message: 'QR badge revoked. Attendee reset to pre-registered status.' });
    } catch (error) {
      console.error('[AudienceController] revokeAttendeeQrCode error:', error.message);
      res.status(500).json({ error: 'Failed to revoke QR badge.' });
    }
  }

  /**
   * GET /api/registration/attendees
   * List registered attendees with filter and search
   */
  async function listAttendees(req, res) {
    try {
      const eventId = getEventId(req);
      const search = req.query.search ? req.query.search.trim() : '';
      const category = req.query.category;
      const limit = parseInt(req.query.limit, 10) || 100;

      let sql = `
      SELECT 
        sa.attendee_id,
        sa.name,
        sa.email,
        sa.phone,
        sa.delegate_category,
        COALESCE(ac.badge_color, '#6366f1') AS badge_color,
        COALESCE(ac.badge_ribbon_text, UPPER(sa.delegate_category)) AS badge_ribbon,
        sa.status,
        sa.qr_token,
        sa.registered_at,
        sa.custom_data,
        (SELECT COUNT(*) FROM screening_checkins sc WHERE sc.attendee_id = sa.attendee_id) AS screenings_attended
      FROM saas_attendees sa
      LEFT JOIN audience_categories ac ON (ac.code = sa.delegate_category OR ac.name = sa.delegate_category) AND ac.event_id = sa.event_id
      WHERE (sa.event_id = ? OR sa.festival_id = ?)
    `;
      const params = [eventId, eventId];

      if (search) {
        // Extract possible attendee ID from formats like "KB26-0275" or numeric input
        const numMatch = search.match(/\d+$/) || search.match(/(\d+)/);
        const parsedId = numMatch ? (parseInt(numMatch[1] || numMatch[0], 10) || 0) : (parseInt(search, 10) || 0);

        sql += ` AND (
        sa.name LIKE ? 
        OR sa.email LIKE ? 
        OR sa.phone LIKE ? 
        OR sa.attendee_id = ? 
        OR sa.custom_data LIKE ? 
        OR sa.delegate_category LIKE ? 
        OR ac.badge_ribbon_text LIKE ?
        OR ac.name LIKE ?
      )`;
        params.push(
          `%${search}%`,
          `%${search}%`,
          `%${search}%`,
          parsedId,
          `%${search}%`,
          `%${search}%`,
          `%${search}%`,
          `%${search}%`
        );
      }

      if (category) {
        sql += ' AND sa.delegate_category = ?';
        params.push(category);
      }

      sql += ' ORDER BY sa.attendee_id DESC LIMIT ?';
      params.push(limit);

      const rawAttendees = await query(sql, params);
      const attendees = rawAttendees.map(row => {
        let cd = row.custom_data;
        if (typeof cd === 'string') {
          try { cd = JSON.parse(cd); } catch { }
        }
        return {
          ...row,
          custom_data: cd,
          serial_no: cd?.serial_no || ('KB26-' + String(row.attendee_id).padStart(4, '0')),
          pass_type: cd?.pass_type || 'Full-Festival Pass',
          pass_days: cd?.pass_days || ['All Days']
        };
      });
      res.json({ success: true, count: attendees.length, attendees });
    } catch (error) {
      console.error('[AudienceController] listAttendees error:', error.message);
      res.status(500).json({ error: 'Failed to retrieve attendees.' });
    }
  }

  /**
   * POST /api/registration/bulk-import
   * Ingest bulk CSV array from Kashish
   */
  async function bulkImportAttendees(req, res) {
    try {
      const eventId = getEventId(req);
      const userId = req.user ? req.user.id : 1;
      const { delegates } = req.body;

      if (!Array.isArray(delegates) || delegates.length === 0) {
        return res.status(400).json({ error: 'Invalid or empty delegates array.' });
      }

      let createdCount = 0;
      let updatedCount = 0;

      for (const d of delegates) {
        if (!d.name) continue;
        const email = d.email ? d.email.trim() : null;
        const phone = d.phone || d.mobile ? String(d.phone || d.mobile).trim() : null;
        const category = d.category || 'delegate';

        // Check if existing
        const existing = await query(`
        SELECT attendee_id FROM saas_attendees 
        WHERE (event_id = ? OR festival_id = ?) AND ((email IS NOT NULL AND email = ?) OR (phone IS NOT NULL AND phone = ?))
        LIMIT 1
      `, [eventId, eventId, email, phone]);

        if (existing.length > 0) {
          await query(`
          UPDATE saas_attendees 
          SET name = ?, delegate_category = ? 
          WHERE attendee_id = ?
        `, [d.name.trim(), category, existing[0].attendee_id]);
          updatedCount++;
        } else {
          const qrToken = crypto.randomUUID();
          const res = await query(`
          INSERT INTO saas_attendees (event_id, festival_id, name, email, phone, delegate_category, registration_type, registered_by_user_id, registered_by_role, status, qr_token)
          VALUES (?, ?, ?, ?, ?, ?, 'kashish_sync', ?, 'admin', 'registered', ?)
        `, [eventId, eventId, d.name.trim(), email, phone, category, userId, qrToken]);

          await query('INSERT INTO saas_qr (qr_data, event_id, festival_id, attendee_id) VALUES (?, ?, ?, ?)', [qrToken, eventId, eventId, res.insertId]);
          createdCount++;
        }
      }

      // Log sync
      await query(`
      INSERT INTO festival_external_sync_logs (event_id, source_system, entity_type, records_fetched, records_created, records_updated, synced_by_user_id)
      VALUES (?, 'kashish_csv_bulk', 'attendees', ?, ?, ?, ?)
    `, [eventId, delegates.length, createdCount, updatedCount, userId]);

      res.json({
        success: true,
        message: `Sync completed: ${createdCount} created, ${updatedCount} updated.`,
        metrics: { total: delegates.length, created: createdCount, updated: updatedCount }
      });
    } catch (error) {
      console.error('[AudienceController] bulkImportAttendees error:', error.message);
      res.status(500).json({ error: 'Failed to import delegates.' });
    }
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // 5. AUDIENCE CHOICE VOTING & BAYESIAN LEADERBOARD (/voting & /api/public/vote)
  // ═════════════════════════════════════════════════════════════════════════════

  /**
   * Internal Helper: Recalculate Bayesian & Wilson scores for all films in competition
   */
  async function recalculateScores(eventId) {
    try {
      // 1. Adjustment number (Bayesian prior strength)
      // Read from audience_settings if available, default to 10 per Kashish Scoring Guide
      let m = 10;
      const settingsRows = await query('SELECT settings_json FROM audience_settings WHERE event_id = ?', [eventId]);
      if (settingsRows.length > 0 && settingsRows[0].settings_json) {
        try {
          const parsed = typeof settingsRows[0].settings_json === 'string'
            ? JSON.parse(settingsRows[0].settings_json)
            : settingsRows[0].settings_json;
          if (parsed.adjustment_number !== undefined) {
            m = parseInt(parsed.adjustment_number, 10) || 10;
          }
        } catch (e) { /* use default */ }
      }

      // 2. Compute overall festival mean rating C across all valid votes
      const globalRes = await query(`
      SELECT COUNT(*) AS total_votes, AVG(rating) AS festival_mean
      FROM audience_votes
      WHERE event_id = ? AND status = 'valid'
    `, [eventId]);

      const C = globalRes.length > 0 && globalRes[0].festival_mean ? parseFloat(globalRes[0].festival_mean) : 4.00;

      // 3. Get film-level aggregates
      const filmStats = await query(`
      SELECT 
        s.id AS film_id,
        COUNT(av.id) AS v,
        COALESCE(SUM(av.rating), 0) AS sum_ratings,
        COALESCE(AVG(av.rating), 0) AS raw_avg
      FROM submissions s
      LEFT JOIN audience_votes av ON av.film_id = s.id AND av.status = 'valid' AND av.event_id = ?
      WHERE s.event_id = ?
      GROUP BY s.id
    `, [eventId, eventId]);

      // 4. Compute Bayesian Score: W = (v / (v + m)) * R + (m / (v + m)) * C
      const scores = filmStats.map(f => {
        const v = parseInt(f.v, 10);
        const R = parseFloat(f.raw_avg);
        const sumRatings = parseInt(f.sum_ratings, 10);
        const bayesian = v > 0 ? ((v / (v + m)) * R) + ((m / (v + m)) * C) : 0;
        const hasQuorum = true;  // No minimum quorum per Kashish Scoring Guide — all films eligible

        // Wilson lower bound approximation for 5-star ratings (normalized to [0,1])
        const p = R > 0 ? (R - 1) / 4 : 0;
        const z = 1.96; // 95% confidence
        const wilson = v > 0 ? (p + (z * z) / (2 * v) - z * Math.sqrt((p * (1 - p) + (z * z) / (4 * v)) / v)) / (1 + (z * z) / v) : 0;
        const wilsonScaled = (wilson * 4) + 1; // back to 1-5 scale

        return {
          film_id: f.film_id,
          v,
          sumRatings,
          R,
          bayesian: parseFloat(bayesian.toFixed(3)),
          wilson: parseFloat(wilsonScaled.toFixed(3)),
          hasQuorum
        };
      });

      // Sort by: 1) Bayesian score DESC, 2) Total votes DESC (tie-break), 3) Raw average DESC
      scores.sort((a, b) => {
        if (b.bayesian !== a.bayesian) return b.bayesian - a.bayesian;
        if (b.v !== a.v) return b.v - a.v;
        return b.R - a.R;
      });

      // Save into audience_voting_scores table
      for (let rank = 0; rank < scores.length; rank++) {
        const s = scores[rank];
        await query(`
        INSERT INTO audience_voting_scores (
          event_id, film_id, total_votes, sum_ratings, raw_average, bayesian_score, 
          wilson_lower_bound, standing_rank, has_quorum
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE 
          total_votes = VALUES(total_votes),
          sum_ratings = VALUES(sum_ratings),
          raw_average = VALUES(raw_average),
          bayesian_score = VALUES(bayesian_score),
          wilson_lower_bound = VALUES(wilson_lower_bound),
          standing_rank = VALUES(standing_rank),
          has_quorum = VALUES(has_quorum)
      `, [eventId, s.film_id, s.v, s.sumRatings, s.R, s.bayesian, s.wilson, rank + 1, s.hasQuorum ? 1 : 0]);
      }

      return true;
    } catch (err) {
      console.error('[AudienceController] recalculateScores error:', err.message);
      return false;
    }
  }

  /**
   * GET /api/voting/leaderboard
   * Fetch official Audience Choice Award leaderboard
   */
  async function getVotingLeaderboard(req, res) {
    try {
      const eventId = getEventId(req);
      await recalculateScores(eventId);

      const sql = `
      SELECT 
        avs.standing_rank,
        avs.film_id,
        s.title AS film_title,
        s.director,
        s.category AS film_category,
        s.runtime,
        avs.total_votes,
        avs.raw_average,
        avs.bayesian_score,
        avs.wilson_lower_bound,
        avs.has_quorum,
        avs.results_approved,
        avs.approved_at,
        avs.calculated_at
      FROM audience_voting_scores avs
      JOIN submissions s ON s.id = avs.film_id
      WHERE avs.event_id = ?
      ORDER BY avs.standing_rank ASC
    `;
      const leaderboard = await query(sql, [eventId]);

      // Check approval status
      const approvalRows = await query(`
      SELECT results_approved, approved_by_user_id, approved_at
      FROM audience_voting_scores
      WHERE event_id = ? AND results_approved = 1
      LIMIT 1
    `, [eventId]);

      let approval = { is_approved: false, approved_at: null, approved_by: null };
      if (approvalRows.length > 0) {
        const appr = approvalRows[0];
        let approverName = 'Festival Administration';
        try {
          const userRows = await query(`
            SELECT u.email, ind.name 
            FROM users u 
            LEFT JOIN individuals ind ON ind.user_id = u.id 
            WHERE u.id = ?
          `, [appr.approved_by_user_id]);
          if (userRows.length > 0) approverName = userRows[0].name || userRows[0].email;
        } catch (e) { }
        approval = {
          is_approved: true,
          approved_at: appr.approved_at,
          approved_by: approverName
        };
      }

      res.json({ success: true, count: leaderboard.length, leaderboard, approval });
    } catch (error) {
      console.error('[AudienceController] getVotingLeaderboard error:', error.message);
      res.status(500).json({ error: 'Failed to retrieve voting leaderboard.' });
    }
  }

  /**
   * POST /api/voting/approve-results
   * Approves and locks the official Audience Choice results for publication
   */
  async function approveResults(req, res) {
    try {
      const eventId = getEventId(req);
      const userId = req.user ? req.user.id : 1;
      const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || '127.0.0.1';

      await query(`
      UPDATE audience_voting_scores 
      SET results_approved = 1, approved_by_user_id = ?, approved_at = CURRENT_TIMESTAMP
      WHERE event_id = ?
    `, [userId, eventId]);

      // Audit log
      await query(`
      INSERT INTO audience_voting_audit_logs 
        (event_id, vote_id, action, actor_user_id, reason, ip_address)
      VALUES (?, NULL, 'results_approved', ?, 'Audience Choice results approved for publication', ?)
    `, [eventId, userId, clientIp]);

      res.json({ success: true, message: 'Audience Choice results approved and published successfully.' });
    } catch (error) {
      console.error('[AudienceController] approveResults error:', error.message);
      res.status(500).json({ error: 'Failed to approve results.' });
    }
  }

  /**
   * GET /api/voting/approval-status
   */
  async function getApprovalStatus(req, res) {
    try {
      const eventId = getEventId(req);
      const rows = await query(`
      SELECT results_approved, approved_by_user_id, approved_at
      FROM audience_voting_scores
      WHERE event_id = ? AND results_approved = 1
      LIMIT 1
    `, [eventId]);

      if (rows.length === 0) {
        return res.json({ success: true, is_approved: false });
      }

      let approverName = 'Festival Administration';
      try {
        const userRows = await query(`
          SELECT u.email, ind.name 
          FROM users u 
          LEFT JOIN individuals ind ON ind.user_id = u.id 
          WHERE u.id = ?
        `, [rows[0].approved_by_user_id]);
        if (userRows.length > 0) approverName = userRows[0].name || userRows[0].email;
      } catch (e) { }

      res.json({
        success: true,
        is_approved: true,
        approved_at: rows[0].approved_at,
        approved_by: approverName
      });
    } catch (error) {
      console.error('[AudienceController] getApprovalStatus error:', error.message);
      res.status(500).json({ error: 'Failed to retrieve approval status.' });
    }
  }

  /**
   * GET /api/voting/flagged
   */
  async function listFlaggedVotes(req, res) {
    try {
      const eventId = getEventId(req);
      const sql = `
      SELECT 
        av.id AS vote_id,
        av.film_id,
        s.title AS film_title,
        av.attendee_id,
        sa.name AS attendee_name,
        sa.phone AS attendee_phone,
        av.rating,
        av.is_attendance_verified,
        av.status,
        av.ip_address,
        av.created_at
      FROM audience_votes av
      JOIN submissions s ON s.id = av.film_id
      JOIN saas_attendees sa ON sa.attendee_id = av.attendee_id
      WHERE av.event_id = ? AND av.status != 'valid'
      ORDER BY av.created_at DESC
    `;
      const flagged = await query(sql, [eventId]);
      res.json({ success: true, count: flagged.length, flagged });
    } catch (error) {
      console.error('[AudienceController] listFlaggedVotes error:', error.message);
      res.status(500).json({ error: 'Failed to retrieve flagged votes.' });
    }
  }

  /**
   * POST /api/voting/void-vote
   */
  async function voidVote(req, res) {
    try {
      const eventId = getEventId(req);
      const userId = req.user ? req.user.id : 1;
      const { vote_id, reason } = req.body;

      if (!vote_id) return res.status(400).json({ error: 'Vote ID is required.' });

      await query("UPDATE audience_votes SET status = 'admin_voided' WHERE id = ? AND event_id = ?", [vote_id, eventId]);

      // Audit log
      await query(`
      INSERT INTO audience_voting_audit_logs (event_id, vote_id, action, actor_user_id, reason)
      VALUES (?, ?, 'void', ?, ?)
    `, [eventId, vote_id, userId, reason || 'Admin manual void']);

      await recalculateScores(eventId);

      res.json({ success: true, message: 'Vote voided and scores recalculated.' });
    } catch (error) {
      console.error('[AudienceController] voidVote error:', error.message);
      res.status(500).json({ error: 'Failed to void vote.' });
    }
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // 6. PUBLIC MOBILE VOTER API (/api/public/vote)
  // ═════════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/public/vote/:token
   * Public endpoint when attendee scans screen QR
   */
  async function getPublicScreeningVoteData(req, res) {
    try {
      const { token } = req.params;

      const blockRows = await query(`
      SELECT 
        sb.id,
        sb.event_id,
        sb.title,
        sb.block_type,
        sb.voting_status,
        sb.voting_opened_at,
        sb.voting_closed_at,
        COALESCE(v.venue_name, 'Main Auditorium') AS venue_name
      FROM screening_blocks sb
      LEFT JOIN venues v ON v.venue_id = sb.venue_id
      WHERE sb.qr_token = ?
      LIMIT 1
    `, [token]);

      if (blockRows.length === 0) {
        return res.status(404).json({ error: 'Invalid or expired screening voting QR code.' });
      }

      const block = blockRows[0];

      // Fetch films in this screening
      const films = await query(`
      SELECT 
        s.id AS film_id,
        s.title,
        s.director,
        s.category,
        s.runtime,
        s.synopsis,
        sbf.sequence_order
      FROM screening_block_films sbf
      JOIN submissions s ON s.id = sbf.film_id
      WHERE sbf.screening_block_id = ? AND sbf.is_eligible_for_voting = TRUE
      ORDER BY sbf.sequence_order ASC
    `, [block.id]);

      res.json({
        success: true,
        screening: {
          id: block.id,
          title: block.title,
          venue: block.venue_name,
          block_type: block.block_type,
          voting_status: block.voting_status,
          films
        }
      });
    } catch (error) {
      console.error('[AudienceController] getPublicScreeningVoteData error:', error.message);
      res.status(500).json({ error: 'Failed to load voting session.' });
    }
  }

  /**
   * POST /api/public/vote/:token/submit
   * Submit Audience Choice Vote with Option 3 Screening Check-In Validation
   */
  async function submitAudienceVote(req, res) {
    try {
      const { token } = req.params;
      const { badge_number, phone_number, ratings, device_fingerprint } = req.body;
      const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
      const userAgent = req.headers['user-agent'] || 'Unknown';

      // 1. Verify screening session is OPEN
      const blockRows = await query(`
      SELECT id, event_id, title, voting_status
      FROM screening_blocks
      WHERE qr_token = ?
      LIMIT 1
    `, [token]);

      if (blockRows.length === 0) {
        return res.status(404).json({ error: 'Invalid voting token.' });
      }

      const block = blockRows[0];
      if (block.voting_status !== 'open') {
        return res.status(403).json({ error: 'Voting is currently closed for this screening session.' });
      }

      // 2. Identify Attendee by Badge ID, Serial Number (e.g. KB26-0011), or Phone
      const cleanBadgeStr = badge_number ? String(badge_number).trim() : '';
      const cleanPhone = phone_number ? String(phone_number).trim() : '';

      let derivedId = 0;
      if (cleanBadgeStr && /^\d+$/.test(cleanBadgeStr)) {
        derivedId = parseInt(cleanBadgeStr, 10);
      }

      if (!cleanBadgeStr && !derivedId && !cleanPhone) {
        return res.status(400).json({ error: 'Please enter your Badge ID or Registered Mobile number to verify attendance.' });
      }

      let attendeeRows = [];
      if (cleanBadgeStr || derivedId) {
        attendeeRows = await query(`
        SELECT attendee_id, name, delegate_category, qr_token
        FROM saas_attendees 
        WHERE (attendee_id = ? 
           OR UPPER(JSON_UNQUOTE(JSON_EXTRACT(custom_data, '$.serial_no'))) = UPPER(?) 
           OR qr_token = ?)
          AND (event_id = ? OR festival_id = ?)
        LIMIT 1
      `, [derivedId || 0, cleanBadgeStr, cleanBadgeStr, block.event_id, block.event_id]);
      } 
      
      if (attendeeRows.length === 0 && cleanPhone) {
        const digitsOnly = cleanPhone.replace(/\D/g, '');
        attendeeRows = await query(`
        SELECT attendee_id, name, delegate_category, qr_token
        FROM saas_attendees 
        WHERE (phone = ? OR REPLACE(REPLACE(phone, ' ', ''), '-', '') = ? OR REPLACE(REPLACE(phone, ' ', ''), '-', '') LIKE ?)
          AND (event_id = ? OR festival_id = ?)
        LIMIT 1
      `, [cleanPhone, digitsOnly, `%${digitsOnly.slice(-10)}`, block.event_id, block.event_id]);
      }

      if (attendeeRows.length === 0) {
        return res.status(404).json({ error: 'No attendee found matching this Badge ID or Mobile Number. Please check your festival pass.' });
      }

      const attendee = attendeeRows[0];

      // 3. Option 3 Eligibility Enforcement: Verify Attendee was Checked-In at this Screening
      const checkinRows = await query(`
      SELECT id, scanned_at 
      FROM screening_checkins 
      WHERE screening_block_id = ? AND attendee_id = ?
    `, [block.id, attendee.attendee_id]);

      if (checkinRows.length === 0) {
        return res.status(403).json({
          error: 'Access Restricted: You were not checked in at the entrance for this screening. Only attendees who entered the auditorium can cast an official ballot.'
        });
      }

      // 4. Record Votes (Ratings dictionary: { [filmId]: rating_1_to_5 })
      if (!ratings || typeof ratings !== 'object' || Object.keys(ratings).length === 0) {
        return res.status(400).json({ error: 'Please submit at least one film rating.' });
      }

      let votesCast = 0;
      for (const [filmIdStr, ratingVal] of Object.entries(ratings)) {
        const filmId = parseInt(filmIdStr, 10);
        const rating = parseInt(ratingVal, 10);

        // Skip non-rated or skipped films
        if (isNaN(rating) || rating < 1 || rating > 5) continue;

        try {
          await query(`
          INSERT INTO audience_votes (
            event_id, screening_block_id, film_id, attendee_id, rating, 
            is_attendance_verified, voting_method, status, ip_address, user_agent, device_fingerprint
          ) VALUES (?, ?, ?, ?, ?, TRUE, 'qr_direct', 'valid', ?, ?, ?)
        `, [
            block.event_id, block.id, filmId, attendee.attendee_id, rating,
            clientIp, userAgent, device_fingerprint || null
          ]);
          votesCast++;
        } catch (insertErr) {
          if (insertErr.code === 'ER_DUP_ENTRY') {
            // Already voted for this film — log the rejected attempt for audit trail
            // Product Brief: "Every try is remembered. Counted or not, Freecomers keeps a record."
            try {
              await query(`
              INSERT INTO audience_voting_audit_logs 
                (event_id, vote_id, action, actor_user_id, reason, ip_address)
              VALUES (?, NULL, 'duplicate_rejected', ?, ?, ?)
            `, [
                block.event_id,
                attendee.attendee_id,
                `Duplicate vote attempt: attendee ${attendee.attendee_id} for film ${filmId} (rating: ${rating})`,
                clientIp
              ]);
            } catch (auditErr) {
              console.warn('[Vote] Failed to log duplicate audit:', auditErr.message);
            }
          } else {
            throw insertErr;
          }
        }
      }

      if (votesCast === 0) {
        return res.status(400).json({ error: 'You have already submitted your ballot for this screening.' });
      }

      // Recalculate Bayesian scores so Live Leaderboard updates immediately
      recalculateScores(block.event_id).catch(err => console.error('[Vote] Score recalc error:', err.message));

      res.json({
        success: true,
        message: 'Thank you! Your vote has been officially recorded.',
        voter_name: attendee.name,
        votes_recorded: votesCast
      });
    } catch (error) {
      console.error('[AudienceController] submitAudienceVote error:', error.message);
      res.status(500).json({ error: 'Failed to process your vote. Please try again.' });
    }
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // 7. PUBLIC REGISTRATION STATUS CHECK (/api/public/registration-status)
  // ═════════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/public/registration-status
   * Public endpoint to check if self-registration is enabled for a festival
   */
  async function getPublicRegistrationStatus(req, res) {
    try {
      let eventId = req.query.eventId;
      const festivalId = req.query.festivalId || req.query.festival_id;

      if (!eventId && festivalId) {
        try {
          const festRows = await query('SELECT event_id FROM film_festivals WHERE film_festival_id = ?', [festivalId]);
          if (festRows.length > 0 && festRows[0].event_id) {
            eventId = festRows[0].event_id;
          } else {
            eventId = festivalId;
          }
        } catch (fErr) {
          eventId = festivalId;
        }
      }

      if (!eventId) eventId = 1;

      const rows = await query('SELECT settings_json FROM audience_settings WHERE event_id = ?', [eventId]);

      let enabled = false;
      if (rows.length > 0 && rows[0].settings_json) {
        try {
          const parsed = typeof rows[0].settings_json === 'string'
            ? JSON.parse(rows[0].settings_json)
            : rows[0].settings_json;
          enabled = parsed.delegate_registration_enabled === true;
        } catch (e) {
          enabled = false;
        }
      }

      res.json({ success: true, delegate_registration_enabled: enabled });
    } catch (error) {
      console.error('[AudienceController] getPublicRegistrationStatus error:', error.message);
      res.status(500).json({ error: 'Failed to check registration status.' });
    }
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // 8. DYNAMIC DELEGATE REGISTRATION FORM BUILDER & TEMPLATES
  // ═════════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/audience/registration-form
   * Returns active registration form schema for the event + all available pre-built templates
   */
  async function getRegistrationFormSchema(req, res) {
    try {
      const eventId = getEventId(req);
      const rows = await query('SELECT settings_json FROM audience_settings WHERE event_id = ?', [eventId]);

      let activeSchema = null;
      if (rows.length > 0 && rows[0].settings_json) {
        try {
          const parsed = typeof rows[0].settings_json === 'string'
            ? JSON.parse(rows[0].settings_json)
            : rows[0].settings_json;
          if (parsed.registration_form_schema && parsed.registration_form_schema.fields) {
            activeSchema = parsed.registration_form_schema;
          }
        } catch (e) { }
      }

      // Fallback to Kashish LGBTQ+ template if not yet customized, or ensure policy_info & venue_info exist
      if (!activeSchema) {
        activeSchema = JSON.parse(JSON.stringify(PREBUILT_TEMPLATES.kashish_lgbtq));
      } else {
        activeSchema = {
          ...PREBUILT_TEMPLATES.kashish_lgbtq,
          ...activeSchema,
          policy_info: {
            ...PREBUILT_TEMPLATES.kashish_lgbtq.policy_info,
            ...(activeSchema.policy_info || {}),
            faqs: (activeSchema.policy_info && Array.isArray(activeSchema.policy_info.faqs) && activeSchema.policy_info.faqs.length > 0)
              ? activeSchema.policy_info.faqs
              : PREBUILT_TEMPLATES.kashish_lgbtq.policy_info.faqs
          },
          venue_info: {
            ...PREBUILT_TEMPLATES.kashish_lgbtq.venue_info,
            ...(activeSchema.venue_info || {})
          },
        };

        if (activeSchema.fields && !activeSchema.fields.some(f => f.key === 'delegate_category')) {
          const passDaysIdx = activeSchema.fields.findIndex(f => f.key === 'pass_days');
          const defaultField = PREBUILT_TEMPLATES.kashish_lgbtq.fields.find(f => f.key === 'delegate_category');
          if (defaultField) {
            if (passDaysIdx !== -1) {
              activeSchema.fields.splice(passDaysIdx + 1, 0, JSON.parse(JSON.stringify(defaultField)));
            } else {
              activeSchema.fields.push(JSON.parse(JSON.stringify(defaultField)));
            }
          }
        }
      }

      res.json({
        success: true,
        schema: activeSchema,
        available_templates: getAvailableTemplates(),
        template_presets: PREBUILT_TEMPLATES
      });
    } catch (error) {
      console.error('[AudienceController] getRegistrationFormSchema error:', error.message);
      res.status(500).json({ error: 'Failed to retrieve registration form schema.' });
    }
  }

  /**
   * PUT /api/audience/registration-form
   * Saves custom or customized template registration form schema for the event
   */
  async function saveRegistrationFormSchema(req, res) {
    try {
      const eventId = getEventId(req);
      const { schema } = req.body;

      if (!schema || !Array.isArray(schema.fields) || schema.fields.length === 0) {
        return res.status(400).json({ error: 'Schema must contain an array of fields.' });
      }

      // Ensure core identity fields exist (name, email, phone)
      const fieldKeys = schema.fields.map(f => f.key || f.id);
      if (!fieldKeys.includes('name') || !fieldKeys.includes('email') || !fieldKeys.includes('phone')) {
        return res.status(400).json({ error: 'Form must include core identity fields: Name, Email, and Phone.' });
      }

      const rows = await query('SELECT settings_json FROM audience_settings WHERE event_id = ?', [eventId]);
      let currentConfig = {};
      if (rows.length > 0 && rows[0].settings_json) {
        try {
          currentConfig = typeof rows[0].settings_json === 'string'
            ? JSON.parse(rows[0].settings_json)
            : rows[0].settings_json;
        } catch (e) {
          currentConfig = {};
        }
      }

      currentConfig.registration_form_schema = schema;

      await query(`
      INSERT INTO audience_settings (event_id, settings_json)
      VALUES (?, ?)
      ON DUPLICATE KEY UPDATE settings_json = VALUES(settings_json), updated_at = CURRENT_TIMESTAMP
    `, [eventId, JSON.stringify(currentConfig)]);

      res.json({
        success: true,
        message: 'Registration form schema saved successfully.',
        schema
      });
    } catch (error) {
      console.error('[AudienceController] saveRegistrationFormSchema error:', error.message);
      res.status(500).json({ error: 'Failed to save registration form schema.' });
    }
  }

  /**
   * GET /api/public/registration-form-schema
   * Public endpoint to fetch active form schema for visitors
   */
  async function getPublicRegistrationFormSchema(req, res) {
    try {
      let eventId = req.query.eventId;
      const festivalId = req.query.festivalId || req.query.festival_id;

      if (!eventId && festivalId) {
        try {
          const festRows = await query('SELECT event_id FROM film_festivals WHERE film_festival_id = ?', [festivalId]);
          if (festRows.length > 0 && festRows[0].event_id) {
            eventId = festRows[0].event_id;
          } else {
            eventId = festivalId;
          }
        } catch (fErr) {
          eventId = festivalId;
        }
      }

      if (!eventId) eventId = 1;

      const rows = await query('SELECT settings_json FROM audience_settings WHERE event_id = ?', [eventId]);

      let activeSchema = null;
      if (rows.length > 0 && rows[0].settings_json) {
        try {
          const parsed = typeof rows[0].settings_json === 'string'
            ? JSON.parse(rows[0].settings_json)
            : rows[0].settings_json;
          if (parsed.registration_form_schema && parsed.registration_form_schema.fields) {
            activeSchema = parsed.registration_form_schema;
          }
        } catch (e) { }
      }

      if (!activeSchema) {
        activeSchema = JSON.parse(JSON.stringify(PREBUILT_TEMPLATES.kashish_lgbtq));
      } else {
        activeSchema = {
          ...PREBUILT_TEMPLATES.kashish_lgbtq,
          ...activeSchema,
          policy_info: {
            ...PREBUILT_TEMPLATES.kashish_lgbtq.policy_info,
            ...(activeSchema.policy_info || {}),
            faqs: (activeSchema.policy_info && Array.isArray(activeSchema.policy_info.faqs) && activeSchema.policy_info.faqs.length > 0)
              ? activeSchema.policy_info.faqs
              : PREBUILT_TEMPLATES.kashish_lgbtq.policy_info.faqs
          },
          venue_info: {
            ...PREBUILT_TEMPLATES.kashish_lgbtq.venue_info,
            ...(activeSchema.venue_info || {})
          },
        };

        if (activeSchema.fields && !activeSchema.fields.some(f => f.key === 'delegate_category')) {
          const passDaysIdx = activeSchema.fields.findIndex(f => f.key === 'pass_days');
          const defaultField = PREBUILT_TEMPLATES.kashish_lgbtq.fields.find(f => f.key === 'delegate_category');
          if (defaultField) {
            if (passDaysIdx !== -1) {
              activeSchema.fields.splice(passDaysIdx + 1, 0, JSON.parse(JSON.stringify(defaultField)));
            } else {
              activeSchema.fields.push(JSON.parse(JSON.stringify(defaultField)));
            }
          }
        }
      }

      res.json({
        success: true,
        schema: activeSchema
      });
    } catch (error) {
      console.error('[AudienceController] getPublicRegistrationFormSchema error:', error.message);
      res.status(500).json({ error: 'Failed to fetch form schema.' });
    }
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // 7. DELEGATE REVIEWS & FILM PAGES (Phase 7)
  // ═════════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/public/films
   * List festival films with screening status and approved reviews count/average
   */
  async function listFestivalFilms(req, res) {
    try {
      const eventId = getEventId(req);
      const sql = `
      SELECT 
        s.id AS film_id,
        s.title,
        s.director,
        s.category,
        s.runtime,
        s.country,
        s.language,
        s.synopsis,
        s.year,
        s.status,
        s.current_stage_name,
        COALESCE((SELECT avs.bayesian_score FROM audience_voting_scores avs WHERE avs.film_id = s.id LIMIT 1), 0) AS bayesian_score,
        COALESCE((SELECT avs.total_votes FROM audience_voting_scores avs WHERE avs.film_id = s.id LIMIT 1), 0) AS total_votes,
        (SELECT COUNT(*) FROM delegate_reviews dr WHERE dr.film_id = s.id AND dr.status = 'approved') AS approved_reviews_count,
        (SELECT ROUND(AVG(dr.review_stars), 1) FROM delegate_reviews dr WHERE dr.film_id = s.id AND dr.status = 'approved' AND dr.review_stars IS NOT NULL) AS average_review_stars,
        (SELECT sb.id FROM screening_blocks sb JOIN screening_block_films sbf ON sbf.screening_block_id = sb.id WHERE sbf.film_id = s.id LIMIT 1) AS current_screening_id,
        (SELECT sb.title FROM screening_blocks sb JOIN screening_block_films sbf ON sbf.screening_block_id = sb.id WHERE sbf.film_id = s.id LIMIT 1) AS screening_title,
        (SELECT sb.voting_status FROM screening_blocks sb JOIN screening_block_films sbf ON sbf.screening_block_id = sb.id WHERE sbf.film_id = s.id LIMIT 1) AS screening_voting_status
      FROM submissions s
      WHERE (s.event_id = ? OR s.event_id = 40)
      ORDER BY s.id ASC
    `;
      const films = await query(sql, [eventId]);
      res.json({ success: true, count: films.length, films });
    } catch (error) {
      console.error('[AudienceController] listFestivalFilms error:', error.message);
      res.status(500).json({ error: 'Failed to retrieve festival films.' });
    }
  }

  /**
   * GET /api/public/films/:filmId/reviews
   * List approved public reviews for a specific film
   */
  async function listPublicFilmReviews(req, res) {
    try {
      const filmId = parseInt(req.params.filmId, 10);
      if (!filmId) {
        return res.status(400).json({ error: 'Valid filmId is required.' });
      }

      const reviewsSql = `
      SELECT 
        dr.id,
        dr.film_id,
        dr.review_text,
        dr.review_stars,
        dr.is_anonymous,
        dr.created_at,
        CASE 
          WHEN dr.is_anonymous = 1 THEN 'Anonymous Delegate'
          ELSE COALESCE(sa.name, 'Festival Delegate')
        END AS author_name,
        CASE 
          WHEN dr.is_anonymous = 1 THEN NULL
          ELSE sa.delegate_category
        END AS author_category
      FROM delegate_reviews dr
      LEFT JOIN saas_attendees sa ON sa.attendee_id = dr.attendee_id
      WHERE dr.film_id = ? AND dr.status = 'approved'
      ORDER BY dr.id DESC
    `;
      const reviews = await query(reviewsSql, [filmId]);

      const statsSql = `
      SELECT 
        COUNT(*) AS total_reviews,
        ROUND(AVG(review_stars), 1) AS average_stars,
        SUM(CASE WHEN review_stars = 5 THEN 1 ELSE 0 END) AS stars_5,
        SUM(CASE WHEN review_stars = 4 THEN 1 ELSE 0 END) AS stars_4,
        SUM(CASE WHEN review_stars = 3 THEN 1 ELSE 0 END) AS stars_3,
        SUM(CASE WHEN review_stars = 2 THEN 1 ELSE 0 END) AS stars_2,
        SUM(CASE WHEN review_stars = 1 THEN 1 ELSE 0 END) AS stars_1
      FROM delegate_reviews
      WHERE film_id = ? AND status = 'approved'
    `;
      const [stats] = await query(statsSql, [filmId]);

      res.json({
        success: true,
        film_id: filmId,
        total_reviews: stats?.total_reviews || 0,
        average_stars: stats?.average_stars || null,
        rating_breakdown: {
          5: stats?.stars_5 || 0,
          4: stats?.stars_4 || 0,
          3: stats?.stars_3 || 0,
          2: stats?.stars_2 || 0,
          1: stats?.stars_1 || 0
        },
        reviews
      });
    } catch (error) {
      console.error('[AudienceController] listPublicFilmReviews error:', error.message);
      res.status(500).json({ error: 'Failed to retrieve film reviews.' });
    }
  }

  /**
   * POST /api/public/films/:filmId/reviews
   * Submit a delegate review (comment + optional stars + anonymous flag)
   */
  async function submitDelegateReview(req, res) {
    try {
      const filmId = parseInt(req.params.filmId, 10);
      const {
        pass_token,
        attendee_id,
        email,
        review_text,
        review_stars,
        is_anonymous
      } = req.body;

      if (!filmId) {
        return res.status(400).json({ error: 'Valid filmId is required.' });
      }

      if (!review_text || typeof review_text !== 'string' || review_text.trim().length < 3) {
        return res.status(400).json({ error: 'Review text must be at least 3 characters.' });
      }

      let parsedStars = null;
      if (review_stars !== undefined && review_stars !== null && review_stars !== '') {
        parsedStars = parseInt(review_stars, 10);
        if (isNaN(parsedStars) || parsedStars < 1 || parsedStars > 5) {
          return res.status(400).json({ error: 'Rating stars must be an integer between 1 and 5.' });
        }
      }

      // 1. Identify registered delegate
      let attendee = null;
      if (pass_token) {
        const rows = await query('SELECT attendee_id, event_id, name FROM saas_attendees WHERE qr_token = ? LIMIT 1', [pass_token.trim()]);
        if (rows.length > 0) attendee = rows[0];
      }
      if (!attendee && attendee_id) {
        const rows = await query('SELECT attendee_id, event_id, name FROM saas_attendees WHERE attendee_id = ? LIMIT 1', [parseInt(attendee_id, 10)]);
        if (rows.length > 0) attendee = rows[0];
      }
      if (!attendee && email) {
        const rows = await query('SELECT attendee_id, event_id, name FROM saas_attendees WHERE email = ? ORDER BY attendee_id DESC LIMIT 1', [email.trim().toLowerCase()]);
        if (rows.length > 0) attendee = rows[0];
      }

      if (!attendee) {
        return res.status(403).json({
          error: 'Only registered festival delegates can submit film reviews. Please provide your delegate pass token, badge ID, or registered email.'
        });
      }

      // 2. Identify film and event
      const filmRows = await query('SELECT id, event_id, title FROM submissions WHERE id = ? LIMIT 1', [filmId]);
      if (filmRows.length === 0) {
        return res.status(404).json({ error: 'Film not found.' });
      }
      const film = filmRows[0];
      const eventId = film.event_id || attendee.event_id || 40;

      // 3. Upsert review (defaults to pending moderation)
      const sql = `
      INSERT INTO delegate_reviews (
        event_id,
        film_id,
        attendee_id,
        review_text,
        review_stars,
        is_anonymous,
        status
      ) VALUES (?, ?, ?, ?, ?, ?, 'pending')
      ON DUPLICATE KEY UPDATE
        review_text = VALUES(review_text),
        review_stars = VALUES(review_stars),
        is_anonymous = VALUES(is_anonymous),
        status = 'pending',
        updated_at = CURRENT_TIMESTAMP
    `;
      await query(sql, [
        eventId,
        filmId,
        attendee.attendee_id,
        review_text.trim(),
        parsedStars,
        is_anonymous ? 1 : 0
      ]);

      res.json({
        success: true,
        message: 'Your review has been submitted and is pending moderation by the festival team.',
        film_id: filmId,
        film_title: film.title
      });
    } catch (error) {
      console.error('[AudienceController] submitDelegateReview error:', error.message);
      res.status(500).json({ error: 'Failed to submit review.' });
    }
  }

  /**
   * GET /api/audience/reviews/moderation
   * List all delegate reviews for admin moderation queue
   */
  async function listModerationReviews(req, res) {
    try {
      const eventId = getEventId(req);
      const statusFilter = req.query.status || 'all'; // 'pending' | 'approved' | 'rejected' | 'all'
      const filmId = req.query.filmId ? parseInt(req.query.filmId, 10) : null;
      const search = req.query.search ? req.query.search.trim() : '';

      let sql = `
      SELECT 
        dr.id,
        dr.event_id,
        dr.film_id,
        s.title AS film_title,
        s.director AS film_director,
        dr.attendee_id,
        sa.name AS attendee_name,
        sa.email AS attendee_email,
        sa.phone AS attendee_phone,
        sa.delegate_category,
        dr.review_text,
        dr.review_stars,
        dr.is_anonymous,
        dr.status,
        dr.created_at,
        dr.updated_at,
        dr.moderated_at,
        u.email AS moderated_by_name
      FROM delegate_reviews dr
      LEFT JOIN saas_attendees sa ON sa.attendee_id = dr.attendee_id
      LEFT JOIN submissions s ON s.id = dr.film_id
      LEFT JOIN users u ON u.id = dr.moderated_by_user_id
      WHERE (dr.event_id = ? OR dr.event_id = 40 OR s.event_id = ?)
    `;
      const params = [eventId, eventId];

      if (statusFilter && statusFilter !== 'all') {
        sql += ' AND dr.status = ?';
        params.push(statusFilter);
      }

      if (filmId) {
        sql += ' AND dr.film_id = ?';
        params.push(filmId);
      }

      if (search) {
        sql += ' AND (s.title LIKE ? OR sa.name LIKE ? OR sa.email LIKE ? OR dr.review_text LIKE ?)';
        params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
      }

      sql += ' ORDER BY CASE WHEN dr.status = \'pending\' THEN 0 ELSE 1 END, dr.id DESC LIMIT 200';

      const reviews = await query(sql, params);

      // Summary counts
      const countSql = `
      SELECT 
        COUNT(*) AS total,
        SUM(CASE WHEN dr.status = 'pending' THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN dr.status = 'approved' THEN 1 ELSE 0 END) AS approved,
        SUM(CASE WHEN dr.status = 'rejected' THEN 1 ELSE 0 END) AS rejected
      FROM delegate_reviews dr
      LEFT JOIN submissions s ON s.id = dr.film_id
      WHERE (dr.event_id = ? OR dr.event_id = 40 OR s.event_id = ?)
    `;
      const [counts] = await query(countSql, [eventId, eventId]);

      res.json({
        success: true,
        counts: {
          total: counts?.total || 0,
          pending: counts?.pending || 0,
          approved: counts?.approved || 0,
          rejected: counts?.rejected || 0
        },
        reviews
      });
    } catch (error) {
      console.error('[AudienceController] listModerationReviews error:', error.message);
      res.status(500).json({ error: 'Failed to retrieve review moderation list.' });
    }
  }

  /**
   * PUT /api/audience/reviews/:id/moderate
   * Approve or reject a delegate review
   */
  async function moderateDelegateReview(req, res) {
    try {
      const reviewId = parseInt(req.params.id, 10);
      const { status } = req.body;
      const userId = req.user?.id || req.user?.userId || 1;

      if (!reviewId) {
        return res.status(400).json({ error: 'Valid review ID is required.' });
      }

      if (!['approved', 'rejected', 'pending'].includes(status)) {
        return res.status(400).json({ error: 'Status must be approved, rejected, or pending.' });
      }

      const sql = `
      UPDATE delegate_reviews
      SET 
        status = ?,
        moderated_by_user_id = ?,
        moderated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
      const result = await query(sql, [status, userId, reviewId]);

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Review not found.' });
      }

      res.json({
        success: true,
        message: `Review #${reviewId} has been ${status}.`,
        review_id: reviewId,
        status
      });
    } catch (error) {
      console.error('[AudienceController] moderateDelegateReview error:', error.message);
      res.status(500).json({ error: 'Failed to update review status.' });
    }
  }

  /**
   * DELETE /api/audience/reviews/:id
   * Delete a delegate review permanently
   */
  async function deleteDelegateReview(req, res) {
    try {
      const reviewId = parseInt(req.params.id, 10);
      if (!reviewId) {
        return res.status(400).json({ error: 'Valid review ID is required.' });
      }

      const result = await query('DELETE FROM delegate_reviews WHERE id = ?', [reviewId]);
      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Review not found.' });
      }

      res.json({
        success: true,
        message: `Review #${reviewId} deleted permanently.`
      });
    } catch (error) {
      console.error('[AudienceController] deleteDelegateReview error:', error.message);
      res.status(500).json({ error: 'Failed to delete review.' });
    }
  }

  module.exports = {
    listCategories,
    createCategory,
    updateCategory,
    deleteCategory,
    listVenues,
    getAudienceSettings,
    updateAudienceSettings,
    listScreeningBlocks,
    createScreeningBlock,
    openVotingWindow,
    closeVotingWindow,
    performScreeningCheckin,
    listAttendance,
    registerAttendee,
    issueAttendeeQrCode,
    revokeAttendeeQrCode,
    listAttendees,
    bulkImportAttendees,
    getVotingLeaderboard,
    listFlaggedVotes,
    voidVote,
    getPublicScreeningVoteData,
    submitAudienceVote,
    getPublicRegistrationStatus,
    recalculateScores,
    approveResults,
    getApprovalStatus,
    getRegistrationFormSchema,
    saveRegistrationFormSchema,
    getPublicRegistrationFormSchema,
    // Phase 7: Film Pages & Delegate Reviews
    listFestivalFilms,
    listPublicFilmReviews,
    submitDelegateReview,
    listModerationReviews,
    moderateDelegateReview,
    deleteDelegateReview
  };

