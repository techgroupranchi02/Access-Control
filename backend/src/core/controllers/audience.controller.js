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
      minimum_quorum_threshold: 25,
      require_screening_checkin: true,
      enable_did_not_watch_skip: true,
      anti_sharing_protection: true,
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

    if (!targetAttendeeId && qr_token) {
      // Find in saas_attendees or saas_qr
      const rows = await query(`
        SELECT sa.attendee_id, sa.name, sa.email, sa.phone, sa.delegate_category, sa.status
        FROM saas_attendees sa
        LEFT JOIN saas_qr sq ON sq.attendee_id = sa.attendee_id
        WHERE sa.qr_token = ? OR sq.qr_data = ? OR sa.attendee_id = ?
        LIMIT 1
      `, [qr_token, qr_token, parseInt(qr_token, 10) || 0]);

      if (rows.length > 0) {
        attendeeRecord = rows[0];
        targetAttendeeId = attendeeRecord.attendee_id;
      }
    } else if (targetAttendeeId) {
      const rows = await query(`
        SELECT attendee_id, name, email, phone, delegate_category, status
        FROM saas_attendees
        WHERE attendee_id = ?
      `, [targetAttendeeId]);
      if (rows.length > 0) attendeeRecord = rows[0];
    }

    if (!attendeeRecord || !targetAttendeeId) {
      return res.status(404).json({ error: 'Attendee not found with provided token or ID.' });
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

    // High entropy 36-char secure UUID token for the QR
    const qrToken = crypto.randomUUID();
    const category = delegate_category || 'bangalore_general';
    const regType = registration_type || 'spot';

    const insertSql = `
      INSERT INTO saas_attendees (
        event_id, festival_id, name, email, phone, delegate_category, 
        registration_type, registered_by_user_id, registered_by_role, status, qr_token
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'admin', 'registered', ?)
    `;
    const result = await query(insertSql, [
      eventId, eventId, name.trim(), email ? email.trim() : null, phone ? phone.trim() : null,
      category, regType, userId, qrToken
    ]);

    const attendeeId = result.insertId;

    // Also register in saas_qr
    await query(`
      INSERT INTO saas_qr (qr_data, event_id, festival_id, attendee_id)
      VALUES (?, ?, ?, ?)
    `, [qrToken, eventId, eventId, attendeeId]);

    res.json({
      success: true,
      message: 'Attendee registered successfully.',
      attendee: {
        attendee_id: attendeeId,
        name,
        email,
        phone,
        delegate_category: category,
        qr_token: qrToken,
        status: 'registered'
      }
    });
  } catch (error) {
    console.error('[AudienceController] registerAttendee error:', error.message);
    res.status(500).json({ error: 'Failed to register attendee.' });
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
        (SELECT COUNT(*) FROM screening_checkins sc WHERE sc.attendee_id = sa.attendee_id) AS screenings_attended
      FROM saas_attendees sa
      LEFT JOIN audience_categories ac ON (ac.code = sa.delegate_category OR ac.name = sa.delegate_category) AND ac.event_id = sa.event_id
      WHERE (sa.event_id = ? OR sa.festival_id = ?)
    `;
    const params = [eventId, eventId];

    if (search) {
      sql += ' AND (sa.name LIKE ? OR sa.email LIKE ? OR sa.phone LIKE ? OR sa.attendee_id = ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, parseInt(search, 10) || 0);
    }

    if (category) {
      sql += ' AND sa.delegate_category = ?';
      params.push(category);
    }

    sql += ' ORDER BY sa.attendee_id DESC LIMIT ?';
    params.push(limit);

    const attendees = await query(sql, params);
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
    // 1. Minimum quorum threshold m (default 25)
    const m = 25;

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
      const hasQuorum = v >= m;

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

    // Sort by Bayesian score descending to assign standing_rank
    scores.sort((a, b) => b.bayesian - a.bayesian);

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
        avs.calculated_at
      FROM audience_voting_scores avs
      JOIN submissions s ON s.id = avs.film_id
      WHERE avs.event_id = ?
      ORDER BY avs.standing_rank ASC
    `;
    const leaderboard = await query(sql, [eventId]);
    res.json({ success: true, count: leaderboard.length, leaderboard });
  } catch (error) {
    console.error('[AudienceController] getVotingLeaderboard error:', error.message);
    res.status(500).json({ error: 'Failed to retrieve voting leaderboard.' });
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

    // 2. Identify Attendee by Badge ID or Phone
    const cleanBadge = badge_number ? parseInt(badge_number, 10) : 0;
    const cleanPhone = phone_number ? String(phone_number).trim() : '';

    if (!cleanBadge && !cleanPhone) {
      return res.status(400).json({ error: 'Please enter your Badge ID or Registered Mobile number to verify attendance.' });
    }

    let attendeeRows = [];
    if (cleanBadge) {
      attendeeRows = await query(`
        SELECT attendee_id, name, delegate_category 
        FROM saas_attendees 
        WHERE attendee_id = ? AND (event_id = ? OR festival_id = ?)
      `, [cleanBadge, block.event_id, block.event_id]);
    } else {
      attendeeRows = await query(`
        SELECT attendee_id, name, delegate_category 
        FROM saas_attendees 
        WHERE phone = ? AND (event_id = ? OR festival_id = ?)
      `, [cleanPhone, block.event_id, block.event_id]);
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
          // Already voted for this film — ignore or continue
          console.log(`[Vote] Attendee ${attendee.attendee_id} already voted for film ${filmId}`);
        } else {
          throw insertErr;
        }
      }
    }

    if (votesCast === 0) {
      return res.status(400).json({ error: 'You have already submitted your ballot for this screening.' });
    }

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
  listAttendees,
  bulkImportAttendees,
  getVotingLeaderboard,
  listFlaggedVotes,
  voidVote,
  getPublicScreeningVoteData,
  submitAudienceVote
};
