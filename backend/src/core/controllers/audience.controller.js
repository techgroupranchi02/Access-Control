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
const { festivalImageUrl } = require('../utils/media.utils');
const { query, getConnection } = require('../../config/database');
const { PREBUILT_TEMPLATES, getAvailableTemplates, getTemplateByKey } = require('../services/registration-form-templates');
const qrCredential = require('../services/qrCredential.service');
const qrPrintLog = require('../services/qrPrintLog.service');
const cardPdf = require('../services/cardPdf.service');
const { sendDelegateConfirmation, isDayPass } = require('../services/delegateConfirmationEmail');
const kashishExternal = require('../services/kashishExternalVotes.service');
const { getFilmFestivalId } = require('../services/festivalIds.service');

const KASHISH_VOTING_MESSAGE = 'Audience voting for this festival happens in the Kashish Pride app.';

async function getApproverName(userId) {
  if (!userId) return 'Festival Administration';
  try {
    const rows = await query(`
      SELECT u.email, ind.name
      FROM users u
      LEFT JOIN individuals ind ON ind.user_id = u.id
      WHERE u.id = ?
    `, [userId]);
    if (rows.length > 0) return rows[0].name || rows[0].email;
  } catch (e) { /* fall through */ }
  return 'Festival Administration';
}

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
          WHERE sa.event_id = ac.event_id
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
      WHERE v.event_id = ?
      ORDER BY v.venue_id ASC
    `;
    const venues = await query(sql, [eventId]);
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
      // Where audience votes come from: 'freecomers' (screening QR / /vote) or 'kashish' (Kashish app, docs/adr/0004)
      voting_source: 'freecomers',
      kashish_voting_from: null,
      kashish_voting_to: null,
      kashish_event_id: null
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

    // Festival name and images always come from the festival's own records (never stored / hard-coded)
    const eventRows = await query('SELECT name FROM events WHERE event_id = ? LIMIT 1', [eventId]);
    const festRows = await query(
      `SELECT film_festival_banner, film_festival_banner_image_name, film_festival_logo, film_festival_logo_image_name
       FROM film_festivals WHERE event_id = ? AND is_deleted = 0 ORDER BY film_festival_id LIMIT 1`,
      [eventId]
    );
    const fest = festRows[0] || {};
    config = {
      ...config,
      festival_name: eventRows[0]?.name || '',
      festival_banner_url: festivalImageUrl(fest.film_festival_banner_image_name || fest.film_festival_banner),
      festival_logo_url: festivalImageUrl(fest.film_festival_logo_image_name || fest.film_festival_logo)
    };

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
    // festival_name is derived from events.name on read; don't persist a copy that can go stale
    const { festival_name: _ignoredName, festival_banner_url: _b, festival_logo_url: _l, ...settings } = req.body || {};

    // Vote source + Kashish voting period: keep only known values / valid dates
    settings.voting_source = settings.voting_source === 'kashish' ? 'kashish' : 'freecomers';
    for (const key of ['kashish_voting_from', 'kashish_voting_to']) {
      const d = settings[key] ? new Date(settings[key]) : null;
      settings[key] = d && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
    }
    // Kashish event ID: the votes API's eventId filter (e.g. "EF3j920261"); empty = not set
    const kEvent = typeof settings.kashish_event_id === 'string' ? settings.kashish_event_id.trim() : '';
    if (kEvent && !/^[A-Za-z0-9_-]{1,64}$/.test(kEvent)) {
      return res.status(400).json({ error: 'The Kashish event ID can only contain letters, numbers, "-" and "_" (up to 64 characters).' });
    }
    settings.kashish_event_id = kEvent || null;
    if (settings.kashish_voting_from && settings.kashish_voting_to && settings.kashish_voting_from > settings.kashish_voting_to) {
      return res.status(400).json({ error: '"Voting from" must be before "Voting to".' });
    }

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
    const blockEvent = await query('SELECT event_id FROM screening_blocks WHERE id = ? LIMIT 1', [blockId]);
    if (blockEvent.length && await kashishExternal.isKashishSource(blockEvent[0].event_id)) {
      return res.status(403).json({ error: KASHISH_VOTING_MESSAGE });
    }
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
        // Credentials: scanned QR payload or typed 6-digit badge serial, scoped to this event (ADR 0001).
        // The KB26-xxxx delegate label and raw attendee ids are not accepted as credentials.
        const resolved = await qrCredential.resolveAttendee(eventId, rawToken);
        if (resolved && resolved.lost) {
          return res.status(403).json({ error: qrCredential.lostBadgeMessage(resolved.lost_at), status: 'lost' });
        }
        if (resolved) {
          const { custom_data, event_id, ...rest } = resolved.attendee;
          attendeeRecord = rest;
          targetAttendeeId = attendeeRecord.attendee_id;
        }
      } else if (targetAttendeeId) {
        // Explicit selection by authenticated staff (attendee picked from the list)
        const rows = await query(`
        SELECT attendee_id, name, email, phone, delegate_category, status, qr_token
        FROM saas_attendees
        WHERE attendee_id = ? AND event_id = ?
      `, [targetAttendeeId, eventId]);
        if (rows.length > 0) attendeeRecord = rows[0];
      }

      if (!attendeeRecord || !targetAttendeeId) {
        return res.status(404).json({ error: 'Badge not found for this festival. Check the code and try again.' });
      }

      // Enforce 2-step verification: Attendee must have been issued a QR badge at the registration desk
      if (!attendeeRecord.qr_token && attendeeRecord.status !== 'badge_issued') {
        return res.status(400).json({
          error: `Badge Not Issued: Attendee "${attendeeRecord.name}" (${rawToken || '#' + targetAttendeeId}) has pre-registered, but their verified QR pass has not been issued at the registration desk yet. Please direct them to the NGMA registration desk to collect their printed badge.`
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

      // Optional search: name, email, phone (formatting ignored), category, scanner, or 6-digit badge number
      const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 100) : '';
      if (search) {
        const like = `%${search}%`;
        const searchDigits = search.replace(/\D/g, '');
        const phoneDigits = searchDigits.length >= 4 ? searchDigits.slice(-10) : '';
        const badgeSerial = /^\d{6}$/.test(search) ? search : '';
        sql += `
        AND (
          sa.name LIKE ?
          OR sa.email LIKE ?
          OR sa.phone LIKE ?
          OR sa.delegate_category LIKE ?
          OR ac.badge_ribbon_text LIKE ?
          OR ind.name LIKE ?
          OR u.email LIKE ?
          OR (? <> '' AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(sa.phone, ' ', ''), '-', ''), '+', ''), '(', ''), ')', '') LIKE ?)
          OR (? <> '' AND EXISTS (SELECT 1 FROM saas_qr sq WHERE sq.attendee_id = sa.attendee_id AND sq.event_id = sc.event_id AND sq.serial_no = ?))
        )`;
        params.push(like, like, like, like, like, like, like, phoneDigits, `%${phoneDigits}%`, badgeSerial, badgeSerial);
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

      // QR badge (UUID payload + 6-digit serial) only if explicitly requested (e.g. spot issue)
      const issueQrNow = Boolean(req.body.issue_qr_now);
      let qrToken = null;
      let badgeSerial = null;
      const category = delegate_category || 'bangalore_general';
      const regType = registration_type || 'spot';
      const initialStatus = issueQrNow ? 'badge_issued' : 'registered';

      const customData = req.body.custom_data || {};
      for (const [k, v] of Object.entries(req.body)) {
        if (!['name', 'email', 'phone', 'delegate_category', 'registration_type', 'remarks', 'custom_data', 'issue_qr_now'].includes(k)) {
          customData[k] = v;
        }
      }
      // Only a Day Pass has chosen days (the form may still send days ticked before switching)
      if (customData.pass_type && !isDayPass(customData.pass_type)) customData.pass_days = [];
      const customDataJson = Object.keys(customData).length > 0 ? JSON.stringify(customData) : null;

      const insertSql = `
      INSERT INTO saas_attendees (
        event_id, festival_id, name, email, phone, delegate_category, 
        registration_type, registered_by_user_id, registered_by_role, status, qr_token, custom_data
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'admin', ?, ?, ?)
    `;
      // festival_id holds film_festivals.film_festival_id, not the event id (festivalIds.service.js)
      const filmFestivalId = (await getFilmFestivalId(eventId)) ?? 0;
      const result = await query(insertSql, [
        eventId, filmFestivalId, name.trim(), email ? email.trim() : null, phone ? phone.trim() : null,
        category, regType, userId, initialStatus, qrToken, customDataJson
      ]);

      const attendeeId = result.insertId;
      const serialNo = 'KB26-' + String(attendeeId).padStart(4, '0');
      customData.serial_no = serialNo;
      await query('UPDATE saas_attendees SET custom_data = ? WHERE attendee_id = ?', [JSON.stringify(customData), attendeeId]);

      // If issued immediately, create the badge credential in saas_qr and link it
      if (issueQrNow) {
        const qrRow = await qrCredential.createQrRow(eventId, { attendeeId });
        qrToken = qrRow.qr_data;
        badgeSerial = qrRow.serial_no;
        await query('UPDATE saas_attendees SET qr_token = ? WHERE attendee_id = ?', [qrToken, attendeeId]);
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
          badge_serial: badgeSerial,
          status: initialStatus
        }
      });
    } catch (error) {
      console.error('[AudienceController] registerAttendee error:', error.message);
      res.status(500).json({ error: 'Failed to register attendee.' });
    }
  }

  /**
   * GET /api/registration/attendees/:id
   * Retrieves full details of a single attendee for viewing or editing.
   */
  async function getAttendee(req, res) {
    try {
      const eventId = getEventId(req);
      const attendeeId = parseInt(req.params.id, 10);
      if (!attendeeId) {
        return res.status(400).json({ error: 'Valid attendee ID is required.' });
      }

      const sql = `
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
        WHERE sa.attendee_id = ? AND sa.event_id = ?
        LIMIT 1
      `;
      const rows = await query(sql, [attendeeId, eventId]);
      if (!rows || rows.length === 0) {
        return res.status(404).json({ error: 'Attendee not found.' });
      }

      const row = rows[0];
      let cd = row.custom_data;
      if (typeof cd === 'string') {
        try { cd = JSON.parse(cd); } catch { }
      }
      const attendee = {
        ...row,
        custom_data: cd || {},
        serial_no: cd?.serial_no || ('KB26-' + String(row.attendee_id).padStart(4, '0')),
        badge_serial: await qrCredential.getBadgeSerial(row.attendee_id),
        lost_badges: await (async () => {
          const lost = await qrCredential.getLostBadges(getEventId(req), row.attendee_id);
          const names = new Map();
          for (const l of lost) {
            if (l.lost_by_user_id && !names.has(l.lost_by_user_id)) names.set(l.lost_by_user_id, await getApproverName(l.lost_by_user_id));
          }
          return lost.map(l => ({ badge_serial: l.badge_serial, lost_at: l.lost_at, lost_by: l.lost_by_user_id ? names.get(l.lost_by_user_id) : null }));
        })(),
        pass_type: cd?.pass_type || 'Full-Festival Pass',
        pass_days: cd?.pass_days || ['All Days']
      };

      res.json({ success: true, attendee });
    } catch (error) {
      console.error('[AudienceController] getAttendee error:', error.message);
      res.status(500).json({ error: 'Failed to retrieve attendee.' });
    }
  }

  /**
   * PUT /api/registration/attendees/:id
   * Updates attendee details (name, email, phone, category, custom schema fields, status).
   */
  async function updateAttendee(req, res) {
    try {
      const eventId = getEventId(req);
      const attendeeId = parseInt(req.params.id, 10);
      if (!attendeeId) {
        return res.status(400).json({ error: 'Valid attendee ID is required.' });
      }

      const existingRows = await query(
        'SELECT * FROM saas_attendees WHERE attendee_id = ? AND event_id = ?',
        [attendeeId, eventId]
      );
      if (!existingRows || existingRows.length === 0) {
        return res.status(404).json({ error: 'Attendee not found.' });
      }
      const existing = existingRows[0];

      const { name, email, phone, delegate_category, status } = req.body;
      if (!name || !name.trim()) {
        return res.status(400).json({ error: 'Attendee full name is required.' });
      }

      let currentCustomData = {};
      if (typeof existing.custom_data === 'string') {
        try { currentCustomData = JSON.parse(existing.custom_data); } catch { }
      } else if (existing.custom_data && typeof existing.custom_data === 'object') {
        currentCustomData = existing.custom_data;
      }

      const incomingCustomData = req.body.custom_data || {};
      const updatedCustomData = {
        ...currentCustomData,
        ...incomingCustomData
      };

      for (const [k, v] of Object.entries(req.body)) {
        if (!['name', 'email', 'phone', 'delegate_category', 'status', 'custom_data', 'attendee_id', 'qr_token', 'registered_at', 'created_at', 'updated_at', 'send_confirmation'].includes(k)) {
          updatedCustomData[k] = v;
        }
      }
      // Only a Day Pass keeps chosen days: switching to a full pass clears them (they showed on the pass)
      if (updatedCustomData.pass_type && !isDayPass(updatedCustomData.pass_type)) updatedCustomData.pass_days = [];

      if (!updatedCustomData.serial_no) {
        updatedCustomData.serial_no = 'KB26-' + String(attendeeId).padStart(4, '0');
      }

      const updatedCategory = delegate_category || existing.delegate_category || 'bangalore_general';
      const updatedStatus = status || existing.status;

      const updateSql = `
        UPDATE saas_attendees
        SET name = ?, email = ?, phone = ?, delegate_category = ?, status = ?, custom_data = ?
        WHERE attendee_id = ? AND event_id = ?
      `;
      await query(updateSql, [
        name.trim(),
        email ? email.trim() : null,
        phone ? phone.trim() : null,
        updatedCategory,
        updatedStatus,
        JSON.stringify(updatedCustomData),
        attendeeId,
        eventId
      ]);

      // Email the updated Delegate Registration Confirmation when staff ask for it (docs/adr/0006).
      // A failed email never undoes the save; the result is reported back.
      const savedEmail = email ? email.trim() : null;
      let confirmationEmail = null;
      if (req.body.send_confirmation === true) {
        confirmationEmail = await sendDelegateConfirmation(eventId, {
          name: name.trim(), email: savedEmail, delegate_category: updatedCategory, custom_data: updatedCustomData
        });
      }

      res.json({
        success: true,
        message: 'Attendee updated successfully.',
        confirmation_email: confirmationEmail,
        attendee: {
          attendee_id: attendeeId,
          name: name.trim(),
          email: email ? email.trim() : null,
          phone: phone ? phone.trim() : null,
          delegate_category: updatedCategory,
          status: updatedStatus,
          serial_no: updatedCustomData.serial_no,
          pass_type: updatedCustomData.pass_type || 'Full-Festival Pass',
          pass_days: updatedCustomData.pass_days || ['All Days'],
          custom_data: updatedCustomData,
          qr_token: existing.qr_token
        }
      });
    } catch (error) {
      console.error('[AudienceController] updateAttendee error:', error.message);
      res.status(500).json({ error: 'Failed to update attendee.' });
    }
  }

  /**
   * POST /api/registration/attendees/:id/issue-qr
   * Issues a physical QR badge credential to a registered attendee upon physical arrival at the venue desk.
   */
  /**
   * POST /api/registration/attendees/:id/verify-phone   (Lost Badge tab, instant check)
   * Checks the last 4 mobile digits the delegate tells the desk, without revealing them.
   * Wrong answers count toward lostBadgeLimiter, the same as report-lost.
   */
  async function verifyLostBadgePhone(req, res) {
    try {
      const eventId = parseInt(getEventId(req), 10);
      const attendeeId = parseInt(req.params.id, 10);
      const rows = await query(
        'SELECT phone FROM saas_attendees WHERE attendee_id = ? AND event_id = ? LIMIT 1',
        [attendeeId, eventId]
      );
      if (!attendeeId || rows.length === 0) {
        return res.status(404).json({ error: 'Attendee not found.' });
      }
      if (String(rows[0].phone || '').replace(/\D/g, '').length < 4) {
        return res.json({ success: true, match: false, no_phone: true });
      }
      const match = qrCredential.phoneLast4Matches(rows[0].phone, req.body?.phone_last4);
      if (!match) {
        res.locals.credentialMiss = true;
        return res.status(403).json({ success: false, match: false, error: 'Those digits don\'t match the delegate\'s registered mobile number.' });
      }
      res.json({ success: true, match: true });
    } catch (error) {
      console.error('[AudienceController] verifyLostBadgePhone error:', error.message);
      res.status(500).json({ error: 'Could not check the digits.' });
    }
  }

  async function reportLostBadge(req, res) {
    try {
      const eventId = parseInt(getEventId(req), 10);
      const attendeeId = parseInt(req.params.id, 10);
      if (!attendeeId) {
        return res.status(400).json({ error: 'Valid attendee ID is required.' });
      }
      const rows = await query(
        `SELECT attendee_id, name, phone, status, qr_token FROM saas_attendees
         WHERE attendee_id = ? AND event_id = ? LIMIT 1`,
        [attendeeId, eventId]
      );
      if (rows.length === 0) {
        return res.status(404).json({ error: 'Attendee not found.' });
      }
      const attendee = rows[0];

      // Identity: last 4 digits of the registered mobile. Without a mobile on file, only admins may proceed.
      const storedDigits = String(attendee.phone || '').replace(/\D/g, '');
      if (storedDigits.length >= 4) {
        if (!qrCredential.phoneLast4Matches(attendee.phone, req.body?.phone_last4)) {
          res.locals.credentialMiss = true;
          return res.status(403).json({ error: 'Those digits don\'t match the delegate\'s registered mobile number.' });
        }
      } else {
        // requirePermission marks platform admins, festival owners and the admin group as wildcard
        const isAdmin = Boolean(req.user?.isSuperAdmin || req.permissionScope?.isWildcard);
        if (!isAdmin) {
          return res.status(403).json({ error: 'This delegate has no mobile number on file. Ask an admin to mark the badge lost.' });
        }
      }

      const activeBadges = await query(
        'SELECT COUNT(*) AS n FROM saas_qr WHERE attendee_id = ? AND event_id = ? AND is_lost = 0',
        [attendeeId, eventId]
      );
      if (!Number(activeBadges[0]?.n) && !attendee.qr_token) {
        return res.status(400).json({ error: `${attendee.name} has no active badge to mark as lost. Assign a new badge instead.` });
      }

      const { lostSerials } = await qrCredential.markBadgesLost(eventId, attendeeId, req.user ? req.user.id : null);
      res.json({
        success: true,
        attendee_id: attendeeId,
        lost_badges: lostSerials,
        message: `Badge ${lostSerials.length ? lostSerials.map(s => '#' + s).join(', ') : ''} marked lost for ${attendee.name}. It can't be used again. Assign a new badge now.`.replace('Badge  marked', 'Badge marked')
      });
    } catch (error) {
      console.error('[AudienceController] reportLostBadge error:', error.message);
      res.status(500).json({ error: 'Failed to mark the badge as lost.' });
    }
  }

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
      WHERE attendee_id = ? AND event_id = ?
      LIMIT 1
    `, [attendeeId, eventId]);

      if (rows.length === 0) {
        return res.status(404).json({ error: 'Attendee not found.' });
      }

      const attendee = rows[0];
      let qrToken = attendee.qr_token;

      // Create a new badge credential (UUID payload + 6-digit serial) if not already assigned
      let badgeSerial;
      if (!qrToken) {
        const qrRow = await qrCredential.createQrRow(eventId, { attendeeId });
        qrToken = qrRow.qr_data;
        badgeSerial = qrRow.serial_no;
        await query(`
        UPDATE saas_attendees
        SET qr_token = ?, status = 'badge_issued'
        WHERE attendee_id = ?
      `, [qrToken, attendeeId]);
      } else {
        // Ensure status is badge_issued
        await query(`UPDATE saas_attendees SET status = 'badge_issued' WHERE attendee_id = ?`, [attendeeId]);
        badgeSerial = await qrCredential.getBadgeSerial(attendeeId);
      }

      let cd = attendee.custom_data;
      if (typeof cd === 'string') {
        try { cd = JSON.parse(cd); } catch { }
      }
      const serialNo = cd?.serial_no || ('KB26-' + String(attendeeId).padStart(4, '0'));

      res.json({
        success: true,
        message: `QR Badge successfully issued for ${attendee.name}${badgeSerial ? ` (badge ${badgeSerial})` : ''}.`,
        qr_token: qrToken,
        serial_no: serialNo,
        badge_serial: badgeSerial,
        status: 'badge_issued',
        attendee: {
          ...attendee,
          status: 'badge_issued',
          qr_token: qrToken,
          serial_no: serialNo,
          badge_serial: badgeSerial
        }
      });
    } catch (error) {
      console.error('[AudienceController] issueAttendeeQrCode error:', error.message);
      res.status(500).json({ error: 'Failed to issue QR badge.' });
    }
  }

  /**
   * POST /api/registration/attendees/:id/revoke-qr   (admin roster page)
   * Revokes the attendee's badge by marking it lost (ADR 0001, Amendment 2): the badge is refused
   * everywhere from now on and never returns to stock, but its row and history are kept.
   */
  async function revokeAttendeeQrCode(req, res) {
    try {
      const eventId = getEventId(req);
      const attendeeId = parseInt(req.params.id, 10);
      if (!attendeeId) {
        return res.status(400).json({ error: 'Valid attendee ID is required.' });
      }
      const exists = await query(
        'SELECT attendee_id FROM saas_attendees WHERE attendee_id = ? AND event_id = ? LIMIT 1',
        [attendeeId, eventId]
      );
      if (exists.length === 0) {
        return res.status(404).json({ error: 'Attendee not found.' });
      }

      const { lostSerials } = await qrCredential.markBadgesLost(eventId, attendeeId, req.user ? req.user.id : null);

      res.json({
        success: true,
        lost_badges: lostSerials,
        message: lostSerials.length
          ? `Badge ${lostSerials.map(s => '#' + s).join(', ')} revoked and marked lost. It can't be used again; assign a new badge from Registration.`
          : 'QR badge revoked. Attendee reset to pre-registered status.'
      });
    } catch (error) {
      console.error('[AudienceController] revokeAttendeeQrCode error:', error.message);
      res.status(500).json({ error: 'Failed to revoke QR badge.' });
    }
  }

  /**
   * POST /api/registration/qr/bulk-generate
   * Generates batches of unassigned physical QR credentials with 6-digit unique codes.
   */
  async function bulkGenerateQRs(req, res) {
    try {
      const eventId = getEventId(req);
      const count = Math.min(Math.max(parseInt(req.body.count, 10) || 50, 1), 2000);

      // UUID payload + random 6-digit serial unique per event; uniqueness enforced by the DB (ADR 0001)
      let created;
      try {
        created = await qrCredential.createQrRows(eventId, count);
      } catch (genErr) {
        if (genErr.code === 'SERIAL_SPACE_EXHAUSTED') {
          return res.status(409).json({
            error: genErr.message,
            generated_count: genErr.created.length,
            batch: genErr.created.map(r => ({ code: r.serial_no, qr_data: r.qr_data, badge_serial: r.serial_no, sequence_no: r.sequence_no ?? null, status: 'unassigned' }))
          });
        }
        throw genErr;
      }

      // Fetch updated pool stats for event
      const statsRows = await query(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN attendee_id IS NULL AND is_lost = 0 THEN 1 ELSE 0 END) as unassigned,
          SUM(CASE WHEN attendee_id IS NOT NULL AND is_lost = 0 THEN 1 ELSE 0 END) as assigned,
          SUM(CASE WHEN is_lost = 1 THEN 1 ELSE 0 END) as lost
        FROM saas_qr
        WHERE event_id = ?
      `, [eventId]);
      const statsRow = statsRows?.[0] || {};

      res.json({
        success: true,
        message: `Successfully generated ${created.length} bulk QR codes.`,
        generated_count: created.length,
        batch: created.map((r, idx) => ({
          code: r.serial_no,
          qr_data: r.qr_data,
          badge_serial: r.serial_no,
          sequence_no: r.sequence_no ?? null,
          stock_index: idx + 1,
          status: 'unassigned'
        })),
        sequence_range: created.length ? { from: created[0].sequence_no ?? null, to: created[created.length - 1].sequence_no ?? null } : null,
        pool_stats: {
          total: parseInt(statsRow?.total || 0, 10),
          unassigned: parseInt(statsRow?.unassigned || 0, 10),
          assigned: parseInt(statsRow?.assigned || 0, 10),
          lost: parseInt(statsRow?.lost || 0, 10)
        }
      });
    } catch (error) {
      console.error('[AudienceController] bulkGenerateQRs error:', error.message);
      res.status(500).json({ error: 'Failed to generate bulk QR codes: ' + error.message });
    }
  }

  /**
   * POST /api/registration/qr/print-status   { qr_values: [] }
   * Which of these badges were sent to print before (docs/adr/0005, Amendment 3).
   */
  async function getQrPrintStatus(req, res) {
    try {
      const eventId = getEventId(req);
      const values = Array.isArray(req.body?.qr_values) ? req.body.qr_values : [];
      if (values.length > qrPrintLog.MAX_ITEMS) {
        return res.status(400).json({ success: false, message: `Check up to ${qrPrintLog.MAX_ITEMS} badges at a time.` });
      }
      const printed = await qrPrintLog.getPrintStatus(eventId, values);
      res.json({ success: true, printed });
    } catch (err) {
      console.error('Error reading badge print history:', err);
      res.status(500).json({ success: false, message: 'Could not check which badges were printed before.' });
    }
  }

  /**
   * POST /api/registration/qr/print-log   { mode: 'full'|'qr-only', items: [{ qr_value, template_id }] }
   * Records the badges of one Print press.
   */
  async function logQrPrints(req, res) {
    try {
      const eventId = getEventId(req);
      const items = Array.isArray(req.body?.items) ? req.body.items : [];
      if (items.length > qrPrintLog.MAX_ITEMS) {
        return res.status(400).json({ success: false, message: `Record up to ${qrPrintLog.MAX_ITEMS} badges at a time.` });
      }
      const result = await qrPrintLog.recordPrints(eventId, items, { mode: req.body?.mode, userId: req.user ? req.user.id : null });
      res.json({ success: true, ...result });
    } catch (err) {
      if (err.status === 400) return res.status(400).json({ success: false, message: err.message });
      console.error('Error recording badge prints:', err);
      res.status(500).json({ success: false, message: 'Could not record the print.' });
    }
  }

  /**
   * POST /api/registration/qr/card-pdfs
   * One PDF per card of a print job, as a ZIP. The body is the job as the print dialog renders it:
   * { zipName, css, fontsUrl, cards: [{ name, html }] }. Template images are loaded here (cardPdf.service).
   */
  async function downloadCardPdfs(req, res) {
    try {
      const zipName = typeof req.body?.zipName === 'string' && req.body.zipName.trim() ? req.body.zipName.trim().slice(0, 120) : 'cards';
      await cardPdf.streamCardPdfZip(req.body, res, { eventId: getEventId(req), zipName });
    } catch (err) {
      if (res.headersSent) return;
      if (err instanceof cardPdf.CardPdfError) return res.status(err.status).json({ success: false, message: err.message });
      console.error('[CardPdf] Error making card PDFs:', err);
      res.status(500).json({ success: false, message: 'Could not make the PDFs. Try again, or use Print.' });
    }
  }

  /**
   * GET /api/registration/qr/pool
   * Returns QR pool statistics and list of badges.
   */
  async function getQRPool(req, res) {
    try {
      const eventId = getEventId(req);
      const statusFilter = req.query.status; // 'unassigned', 'assigned', 'all'
      const search = req.query.search ? req.query.search.trim() : '';
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 1000);
      const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
      const offset = (page - 1) * limit;
      // Badge sequence range (#from–#to) and "#45" search (ADR 0001, Amendment 3)
      const seqFrom = parseInt(req.query.seq_from, 10);
      const seqTo = parseInt(req.query.seq_to, 10);
      const seqSearch = /^#\s*\d{1,7}$/.test(search) ? parseInt(search.replace(/\D/g, ''), 10) : null;

      // Number badges other systems added since the last look
      await qrCredential.assignMissingSequences(eventId);

      // Stats
      const statsRows = await query(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN attendee_id IS NULL AND is_lost = 0 THEN 1 ELSE 0 END) as unassigned,
          SUM(CASE WHEN attendee_id IS NOT NULL AND is_lost = 0 THEN 1 ELSE 0 END) as assigned,
          SUM(CASE WHEN is_lost = 1 THEN 1 ELSE 0 END) as lost
        FROM saas_qr
        WHERE event_id = ?
      `, [eventId]);
      const statsRow = statsRows?.[0] || {};

      let sql = `
        SELECT 
          sq.qr_id,
          sq.qr_data,
          sq.serial_no,
          sq.sequence_no,
          sq.attendee_id,
          sq.is_lost,
          sq.lost_at,
          sq.created_at,
          sq.updated_at,
          sa.name as attendee_name,
          sa.email as attendee_email,
          sa.phone as attendee_phone,
          sa.delegate_category,
          sa.custom_data as attendee_custom_data
        FROM saas_qr sq
        LEFT JOIN saas_attendees sa ON sa.attendee_id = sq.attendee_id
        WHERE sq.event_id = ?
      `;
      const params = [eventId];

      if (statusFilter === 'unassigned') {
        sql += ' AND sq.attendee_id IS NULL AND sq.is_lost = 0';
      } else if (statusFilter === 'assigned') {
        sql += ' AND sq.attendee_id IS NOT NULL AND sq.is_lost = 0';
      } else if (statusFilter === 'lost') {
        sql += ' AND sq.is_lost = 1';
      }

      if (Number.isFinite(seqFrom) && seqFrom > 0) {
        sql += ' AND sq.sequence_no >= ?';
        params.push(seqFrom);
      }
      if (Number.isFinite(seqTo) && seqTo > 0) {
        sql += ' AND sq.sequence_no <= ?';
        params.push(seqTo);
      }

      if (seqSearch !== null) {
        sql += ' AND sq.sequence_no = ?';
        params.push(seqSearch);
      } else if (search) {
        // Badge number (partial), QR UUID, delegate name / email, phone (formatting ignored)
        const like = `%${search.slice(0, 100)}%`;
        const searchDigits = search.replace(/\D/g, '');
        const phoneDigits = searchDigits.length >= 4 ? searchDigits.slice(-10) : '';
        sql += `
        AND (
          sq.serial_no LIKE ? OR sq.qr_data LIKE ? OR sa.name LIKE ? OR sa.email LIKE ? OR sa.phone LIKE ?
          OR (? <> '' AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(sa.phone, ' ', ''), '-', ''), '+', ''), '(', ''), ')', '') LIKE ?)
        )`;
        params.push(like, like, like, like, like, phoneDigits, `%${phoneDigits}%`);
      }

      sql += ' ORDER BY sq.sequence_no IS NULL, sq.sequence_no DESC, sq.qr_id DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const rows = await query(sql, params);

      const qrs = (rows || []).map(r => {
        let cd = r.attendee_custom_data;
        if (typeof cd === 'string') {
          try { cd = JSON.parse(cd); } catch { }
        }
        return {
          qr_id: r.qr_id,
          qr_data: r.qr_data,
          code: r.serial_no || r.qr_data,
          badge_serial: r.serial_no,
          sequence_no: r.sequence_no == null ? null : Number(r.sequence_no),
          status: Number(r.is_lost) === 1 ? 'lost' : (r.attendee_id ? 'assigned' : 'unassigned'),
          lost_at: r.lost_at || null,
          attendee_id: r.attendee_id,
          attendee_name: r.attendee_name,
          attendee_serial: cd?.serial_no || (r.attendee_id ? ('KB26-' + String(r.attendee_id).padStart(4, '0')) : null),
          attendee_category: r.delegate_category,
          created_at: r.created_at,
          updated_at: r.updated_at
        };
      });

      res.json({
        success: true,
        stats: {
          total: parseInt(statsRow?.total || 0, 10),
          unassigned: parseInt(statsRow?.unassigned || 0, 10),
          assigned: parseInt(statsRow?.assigned || 0, 10),
          lost: parseInt(statsRow?.lost || 0, 10)
        },
        page,
        limit,
        qrs
      });
    } catch (error) {
      console.error('[AudienceController] getQRPool error:', error.message);
      res.status(500).json({ error: 'Failed to retrieve QR pool.' });
    }
  }

  /**
   * GET /api/registration/qr/check/:code
   * Validates if a 6-digit code or scanned QR token is valid and available.
   */
  async function checkQRCode(req, res) {
    try {
      const eventId = getEventId(req);
      let rawCode = req.params.code ? req.params.code.trim() : '';
      if (!rawCode) {
        return res.status(400).json({ valid: false, error: 'Code is required.' });
      }

      rawCode = qrCredential.normalizeCredential(rawCode);

      // Scanned QR payload or typed 6-digit serial, within this event's stock (ADR 0001)
      const qrRow = await qrCredential.findQrRow(eventId, rawCode);

      if (!qrRow) {
        res.locals.credentialMiss = true;
        return res.json({
          success: true,
          valid: false,
          in_pool: false,
          status: 'not_found',
          code: rawCode,
          message: `Code "${rawCode}" is not in this festival's badge stock. Check the code, or generate new stock.`
        });
      }

      if (Number(qrRow.is_lost) === 1) {
        return res.json({
          success: true,
          valid: false,
          in_pool: true,
          status: 'lost',
          code: qrRow.qr_data,
          badge_serial: qrRow.serial_no,
          sequence_no: qrRow.sequence_no ?? null,
          display_code: qrRow.serial_no || qrRow.qr_data,
          message: `${qrCredential.lostBadgeMessage(qrRow.lost_at)} It can't be assigned again; use a different badge.`
        });
      }

      let row = { ...qrRow, attendee_name: null, delegate_category: null, custom_data: null };
      if (qrRow.attendee_id) {
        const aRows = await query(
          'SELECT name AS attendee_name, delegate_category, custom_data FROM saas_attendees WHERE attendee_id = ? LIMIT 1',
          [qrRow.attendee_id]
        );
        if (aRows.length > 0) row = { ...row, ...aRows[0] };
      }
      const displayCode = row.serial_no || row.qr_data;

      if (row.attendee_id) {
        let cd = row.custom_data;
        if (typeof cd === 'string') {
          try { cd = JSON.parse(cd); } catch { }
        }
        const serialNo = cd?.serial_no || ('KB26-' + String(row.attendee_id).padStart(4, '0'));
        return res.json({
          success: true,
          valid: false,
          in_pool: true,
          status: 'already_assigned',
          code: row.qr_data,
          badge_serial: row.serial_no,
          sequence_no: row.sequence_no ?? null,
          display_code: displayCode,
          assigned_to: {
            attendee_id: row.attendee_id,
            name: row.attendee_name,
            serial_no: serialNo,
            delegate_category: row.delegate_category
          },
          message: `Badge "${displayCode}" is already assigned to ${row.attendee_name} (${serialNo}).`
        });
      }

      return res.json({
        success: true,
        valid: true,
        in_pool: true,
        status: 'unassigned',
        code: row.qr_data,
        badge_serial: row.serial_no,
          sequence_no: row.sequence_no ?? null,
        display_code: displayCode,
        message: `Badge "${displayCode}" is valid and ready to be assigned.`
      });
    } catch (error) {
      console.error('[AudienceController] checkQRCode error:', error.message);
      res.status(500).json({ error: 'Failed to check QR code.' });
    }
  }

  /**
   * POST /api/registration/attendees/:id/assign-qr
   * Assigns a physical 6-digit QR badge to a registered delegate.
   */
  async function assignAttendeeQR(req, res) {
    try {
      const eventId = getEventId(req);
      const attendeeId = parseInt(req.params.id, 10);
      const qrCode = qrCredential.normalizeCredential(req.body.qr_code);

      if (!attendeeId) {
        return res.status(400).json({ error: 'Valid attendee ID is required.' });
      }
      if (!qrCode) {
        return res.status(400).json({ error: 'Scan the badge QR or enter its 6-digit badge number.' });
      }

      // Verify attendee exists for this event
      const attendeeRows = await query(`
        SELECT attendee_id, name, email, phone, delegate_category, status, qr_token, custom_data
        FROM saas_attendees
        WHERE attendee_id = ? AND event_id = ?
        LIMIT 1
      `, [attendeeId, eventId]);

      if (!attendeeRows || attendeeRows.length === 0) {
        return res.status(404).json({ error: 'Attendee not found.' });
      }

      const attendee = attendeeRows[0];

      // Resolve to an existing stock row of this event (QR payload or 6-digit serial). Unknown codes
      // are rejected: badges must come from generated stock (ADR 0001).
      const qrRow = await qrCredential.findQrRow(eventId, qrCode);
      if (!qrRow) {
        return res.status(404).json({
          error: `Badge "${qrCode}" is not in this festival's badge stock. Check the code, or generate new stock first.`
        });
      }
      const displayCode = qrRow.serial_no || qrRow.qr_data;
      if (Number(qrRow.is_lost) === 1) {
        return res.status(400).json({ error: `Badge ${displayCode} was reported lost and can't be reused. Please scan or enter a different badge.` });
      }

      // Link atomically: only if unassigned or already ours (guards concurrent desks)
      const linkResult = await query(`
        UPDATE saas_qr
        SET attendee_id = ?, updated_at = NOW()
        WHERE qr_id = ? AND is_lost = 0 AND (attendee_id IS NULL OR attendee_id = ?)
      `, [attendeeId, qrRow.qr_id, attendeeId]);

      if (!linkResult.affectedRows) {
        const otherRows = await query(
          'SELECT attendee_id, name, custom_data FROM saas_attendees WHERE attendee_id = (SELECT attendee_id FROM saas_qr WHERE qr_id = ?) LIMIT 1',
          [qrRow.qr_id]
        );
        const other = otherRows[0] || {};
        let ocd = other.custom_data;
        if (typeof ocd === 'string') {
          try { ocd = JSON.parse(ocd); } catch { }
        }
        const otherSerial = ocd?.serial_no || (other.attendee_id ? 'KB26-' + String(other.attendee_id).padStart(4, '0') : '');
        return res.status(400).json({
          error: `Badge ${displayCode} is already assigned to another delegate: "${other.name || 'unknown'}" (${otherSerial}). Please scan or enter an unassigned badge.`
        });
      }

      // Release any other (non-lost) badge previously linked to this attendee in this event.
      // Lost badges keep their owner link and never return to stock (ADR 0001, Amendment 2).
      await query(`
        UPDATE saas_qr
        SET attendee_id = NULL, updated_at = NOW()
        WHERE attendee_id = ? AND qr_id <> ? AND is_lost = 0 AND event_id = ?
      `, [attendeeId, qrRow.qr_id, eventId]);

      // Parse custom data and ensure serial_no (delegate label) is preserved
      let cd = attendee.custom_data;
      if (typeof cd === 'string') {
        try { cd = JSON.parse(cd); } catch { }
      }
      if (!cd || typeof cd !== 'object') cd = {};
      const serialNo = cd?.serial_no || ('KB26-' + String(attendeeId).padStart(4, '0'));
      cd.serial_no = serialNo;
      cd.physical_qr_code = displayCode;

      // Attendee credential token = the badge's QR payload
      await query(`
        UPDATE saas_attendees 
        SET qr_token = ?, status = 'badge_issued', custom_data = ?
        WHERE attendee_id = ?
      `, [qrRow.qr_data, JSON.stringify(cd), attendeeId]);

      res.json({
        success: true,
        message: `Physical QR Badge (${displayCode}) successfully assigned to ${attendee.name} (${serialNo}).`,
        qr_token: qrRow.qr_data,
        code: qrRow.qr_data,
        serial_no: serialNo,
        badge_serial: qrRow.serial_no,
        status: 'badge_issued',
        attendee: {
          ...attendee,
          status: 'badge_issued',
          qr_token: qrRow.qr_data,
          serial_no: serialNo,
          badge_serial: qrRow.serial_no,
          custom_data: cd
        }
      });
    } catch (error) {
      console.error('[AudienceController] assignAttendeeQR error:', error.message);
      res.status(500).json({ error: 'Failed to assign QR badge: ' + error.message });
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
      // Default 100 for lookups; the Audience page asks for the full roster (capped for safety)
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 5000);

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
        (SELECT COUNT(*) FROM screening_checkins sc WHERE sc.attendee_id = sa.attendee_id) AS screenings_attended,
        (SELECT sq.serial_no FROM saas_qr sq WHERE sq.attendee_id = sa.attendee_id AND sq.serial_no IS NOT NULL AND sq.is_lost = 0 ORDER BY sq.qr_id DESC LIMIT 1) AS badge_serial,
        (SELECT sq.sequence_no FROM saas_qr sq WHERE sq.attendee_id = sa.attendee_id AND sq.is_lost = 0 ORDER BY sq.qr_id DESC LIMIT 1) AS badge_sequence,
        (SELECT COUNT(*) FROM saas_qr sq WHERE sq.attendee_id = sa.attendee_id AND sq.is_lost = 1) AS lost_badge_count
      FROM saas_attendees sa
      LEFT JOIN audience_categories ac ON (ac.code = sa.delegate_category OR ac.name = sa.delegate_category) AND ac.event_id = sa.event_id
      WHERE sa.event_id = ?
    `;
      const params = [eventId];

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
        OR (? <> '' AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(sa.phone, ' ', ''), '-', ''), '+', ''), '(', ''), ')', '') LIKE ?)
        OR (? <> '' AND EXISTS (SELECT 1 FROM saas_qr sq WHERE sq.attendee_id = sa.attendee_id AND sq.serial_no = ?))
      )`;
        // Phone match ignoring formatting: "+91 98765-43210", "9876543210", "43210" all match
        // (last 10 digits of the typed number, min 4 digits). 6-digit input also matches badge numbers.
        const searchDigits = search.replace(/\D/g, '');
        const phoneDigits = searchDigits.length >= 4 ? searchDigits.slice(-10) : '';
        const badgeSerial = /^\d{6}$/.test(search) ? search : '';
        params.push(
          `%${search}%`,
          `%${search}%`,
          `%${search}%`,
          parsedId,
          `%${search}%`,
          `%${search}%`,
          `%${search}%`,
          `%${search}%`,
          phoneDigits, `%${phoneDigits}%`,
          badgeSerial, badgeSerial
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
        WHERE event_id = ? AND ((email IS NOT NULL AND email = ?) OR (phone IS NOT NULL AND phone = ?))
        LIMIT 1
      `, [eventId, email, phone]);

        if (existing.length > 0) {
          await query(`
          UPDATE saas_attendees 
          SET name = ?, delegate_category = ? 
          WHERE attendee_id = ?
        `, [d.name.trim(), category, existing[0].attendee_id]);
          updatedCount++;
        } else {
          const res = await query(`
          INSERT INTO saas_attendees (event_id, festival_id, name, email, phone, delegate_category, registration_type, registered_by_user_id, registered_by_role, status, qr_token)
          VALUES (?, ?, ?, ?, ?, ?, 'kashish_sync', ?, 'admin', 'registered', NULL)
        `, [eventId, (await getFilmFestivalId(eventId)) ?? 0, d.name.trim(), email, phone, category, userId]);

          // Badge credential: UUID payload + per-event 6-digit serial (ADR 0001)
          const qrRow = await qrCredential.createQrRow(eventId, { attendeeId: res.insertId });
          await query('UPDATE saas_attendees SET qr_token = ? WHERE attendee_id = ?', [qrRow.qr_data, res.insertId]);
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

      // Festivals whose films live only in the Kashish app (docs/adr/0004)
      const votingConfig = await kashishExternal.getVotingConfig(eventId);
      if (votingConfig.source === 'kashish') {
        const { standings, adjustment_number, festival_mean } = await kashishExternal.computeExternalStandings(eventId, votingConfig);
        const publication = await kashishExternal.getLatestPublication(eventId);
        const lastSync = await query(
          "SELECT completed_at FROM kashish_sync_logs WHERE event_id = ? AND status = 'completed' ORDER BY completed_at DESC LIMIT 1",
          [eventId]
        );
        return res.json({
          success: true,
          source: 'kashish',
          count: standings.length,
          leaderboard: standings,
          adjustment_number,
          festival_mean,
          voting_period: { from: votingConfig.from, to: votingConfig.to },
          last_sync_at: lastSync[0]?.completed_at || null,
          approval: publication
            ? {
              is_approved: true,
              approved_at: publication.published_at,
              approved_by: await getApproverName(publication.published_by_user_id),
              changed_since: kashishExternal.standingsChanged(publication.standings, standings)
            }
            : { is_approved: false, approved_at: null, approved_by: null, changed_since: false }
        });
      }

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
   * GET /api/public/results/:eventId   [No auth, ADR 0003]
   * Approved Audience Choice standings for the big-screen winners page and the Kashish app.
   * Returns 403 { status: 'results_not_approved' } until the festival team approves the results,
   * so nothing is public before approval.
   */
  async function getPublicResults(req, res) {
    try {
      const eventId = parseInt(req.params.eventId, 10);
      if (!eventId) {
        return res.status(400).json({ error: 'Valid event id is required.' });
      }

      const eventRows = await query('SELECT event_id, name FROM events WHERE event_id = ? AND is_deleted = 0 LIMIT 1', [eventId]);
      if (eventRows.length === 0) {
        return res.status(404).json({ error: 'Festival not found.' });
      }

      // Kashish-app festivals: serve the frozen snapshot from the latest Approve & Publish (docs/adr/0004)
      if (await kashishExternal.isKashishSource(eventId)) {
        const publication = await kashishExternal.getLatestPublication(eventId);
        if (!publication) {
          return res.status(403).json({
            success: false,
            status: 'results_not_approved',
            event: { event_id: eventId, name: eventRows[0].name },
            message: 'Audience Choice results have not been approved yet.'
          });
        }
        const ranked = (publication.standings || [])
          .filter(r => Number(r.total_votes) > 0)
          .map(r => ({
            rank: r.standing_rank,
            film_id: r.film_id,
            film_title: r.film_title,
            director: r.director || null,
            total_votes: Number(r.total_votes),
            average_rating: Number(r.raw_average),
            score: Number(r.bayesian_score),
            eligible: true
          }));
        res.set('Cache-Control', 'public, max-age=30');
        return res.json({
          success: true,
          status: 'approved',
          source: 'kashish',
          event: { event_id: eventId, name: eventRows[0].name },
          approved_at: publication.published_at,
          winner: ranked[0] || null,
          standings: ranked
        });
      }

      const approvalRows = await query(
        'SELECT approved_at FROM audience_voting_scores WHERE event_id = ? AND results_approved = 1 ORDER BY approved_at DESC LIMIT 1',
        [eventId]
      );
      if (approvalRows.length === 0) {
        return res.status(403).json({
          success: false,
          status: 'results_not_approved',
          event: { event_id: eventId, name: eventRows[0].name },
          message: 'Audience Choice results have not been approved yet.'
        });
      }

      const standings = await query(`
        SELECT avs.standing_rank AS \`rank\`, avs.film_id, s.title AS film_title, s.director,
               avs.total_votes, avs.raw_average, avs.bayesian_score, avs.has_quorum
        FROM audience_voting_scores avs
        JOIN submissions s ON s.id = avs.film_id
        WHERE avs.event_id = ? AND avs.total_votes > 0
        ORDER BY avs.standing_rank ASC
      `, [eventId]);

      const ranked = standings.map(r => ({
          rank: r.rank,
          film_id: r.film_id,
          film_title: r.film_title,
          director: r.director,
          total_votes: Number(r.total_votes),
          average_rating: Number(r.raw_average),
          score: Number(r.bayesian_score),
          eligible: Boolean(r.has_quorum)
      }));

      res.set('Cache-Control', 'public, max-age=30');
      res.json({
        success: true,
        status: 'approved',
        event: { event_id: eventId, name: eventRows[0].name },
        approved_at: approvalRows[0].approved_at,
        winner: ranked.find(r => r.eligible) || null,
        standings: ranked
      });
    } catch (error) {
      console.error('[AudienceController] getPublicResults error:', error.message);
      res.status(500).json({ error: 'Failed to load results.' });
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

      // Kashish-app festivals: freeze the current standings as the published results (docs/adr/0004)
      if (await kashishExternal.isKashishSource(eventId)) {
        const publication = await kashishExternal.publishExternalResults(eventId, req.user ? req.user.id : null);
        await query(`
          INSERT INTO audience_voting_audit_logs (event_id, vote_id, action, actor_user_id, reason, ip_address)
          VALUES (?, NULL, 'results_approved', ?, 'Kashish Audience Choice standings published (frozen snapshot)', ?)
        `, [eventId, userId, clientIp]);
        return res.json({
          success: true,
          message: 'Audience Choice results published. The winners screen now shows these standings until you publish again.',
          published_at: publication?.published_at || null
        });
      }

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
      if (await kashishExternal.isKashishSource(eventId)) {
        const publication = await kashishExternal.getLatestPublication(eventId);
        if (!publication) return res.json({ success: true, is_approved: false });
        return res.json({
          success: true,
          is_approved: true,
          approved_at: publication.published_at,
          approved_by: await getApproverName(publication.published_by_user_id)
        });
      }
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
        av.voting_method,
        sq.serial_no AS badge_serial,
        av.ip_address,
        av.created_at
      FROM audience_votes av
      JOIN submissions s ON s.id = av.film_id
      JOIN saas_attendees sa ON sa.attendee_id = av.attendee_id
      LEFT JOIN saas_qr sq ON sq.qr_id = av.qr_id
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
      if (await kashishExternal.isKashishSource(block.event_id)) {
        return res.status(403).json({ error: KASHISH_VOTING_MESSAGE });
      }

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
      if (await kashishExternal.isKashishSource(block.event_id)) {
        return res.status(403).json({ error: KASHISH_VOTING_MESSAGE });
      }
      if (block.voting_status !== 'open') {
        return res.status(403).json({ error: 'Voting is currently closed for this screening session.' });
      }

      // 2. Identify Attendee (ADR 0001):
      //    - scanned badge QR (UUID) is sufficient on its own;
      //    - typed 6-digit badge number (or legacy printed code) also needs the last 4 digits
      //      of the registered mobile number.
      //    KB26-xxxx labels, attendee ids and phone-only lookups are not accepted.
      const cleanBadgeStr = qrCredential.normalizeCredential(badge_number);
      if (!cleanBadgeStr) {
        return res.status(400).json({ error: 'Please scan your badge QR or enter the 6-digit badge number printed on it.' });
      }

      const notFoundMsg = 'We could not verify this badge. Check the badge number and mobile digits on your festival pass.';
      const resolved = await qrCredential.resolveAttendee(block.event_id, cleanBadgeStr);
      if (resolved && resolved.lost) {
        return res.status(403).json({ error: qrCredential.lostBadgeMessage(resolved.lost_at), status: 'lost' });
      }
      if (!resolved) {
        return res.status(404).json({ error: notFoundMsg });
      }
      if (!resolved.strong) {
        if (!phone_number || String(phone_number).replace(/\D/g, '').length < 4) {
          return res.status(400).json({
            error: 'Please also enter the last 4 digits of your registered mobile number.',
            requires_phone: true
          });
        }
        if (!qrCredential.phoneLast4Matches(resolved.attendee.phone, phone_number)) {
          return res.status(404).json({ error: notFoundMsg });
        }
      }

      const attendee = resolved.attendee;
      // Badge the vote was cast with (stored on every vote, ADR 0003)
      const voteQrId = resolved.qr?.qr_id
        || (await query('SELECT qr_id FROM saas_qr WHERE attendee_id = ? AND is_lost = 0 ORDER BY qr_id DESC LIMIT 1', [attendee.attendee_id]))[0]?.qr_id
        || null;

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
            event_id, screening_block_id, film_id, attendee_id, qr_id, rating, 
            is_attendance_verified, voting_method, status, ip_address, user_agent, device_fingerprint
          ) VALUES (?, ?, ?, ?, ?, ?, TRUE, 'qr_direct', 'valid', ?, ?, ?)
        `, [
            block.event_id, block.id, filmId, attendee.attendee_id, voteQrId, rating,
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
      delete currentConfig.festival_name; // derived from events.name on read

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
      WHERE (dr.event_id = ? OR s.event_id = ?)
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
      WHERE (dr.event_id = ? OR s.event_id = ?)
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
  getPublicResults,
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
    getAttendee,
    updateAttendee,
    issueAttendeeQrCode,
    revokeAttendeeQrCode,
    reportLostBadge,
    verifyLostBadgePhone,
    bulkGenerateQRs,
    getQRPool,
    getQrPrintStatus,
    logQrPrints,
    downloadCardPdfs,
    checkQRCode,
    assignAttendeeQR,
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

