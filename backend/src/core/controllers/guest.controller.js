/**
 * Guest & Hospitality Controller
 * Real MySQL queries for VIP Guests, airport greetings, check-in, and badge issuance.
 * Scoped by role:
 * - Admin sees all 4 guests
 * - Volunteer sees assigned guests ("My Guests", e.g. 2 for user-4 Amit Sharma)
 */

const { query } = require('../../config/database');
const { getEventId } = require('../utils/eventId');

/**
 * GET /api/guests
 */
async function list(req, res) {
  try {
    const eventId = getEventId(req);
    const userId = req.user.id;

    // Check role
    const groupRows = await query(`
      SELECT g.group_key 
      FROM user_event_groups ueg
      JOIN \`groups\` g ON g.id = ueg.group_id
      WHERE ueg.user_id = ? AND ueg.event_id = ?
    `, [userId, eventId]);

    const isVolunteer = groupRows.some(g => g.group_key === 'volunteer');
    const isAdmin = groupRows.some(g => g.group_key === 'admin') || (req.user && req.user.isSuperAdmin);

    let sql = `
      SELECT 
        g.id,
        g.name,
        g.role,
        g.rsvp_status,
        g.hotel_details,
        g.flight_details,
        g.assigned_volunteer_id,
        g.badge_issued,
        COALESCE(i.name, o.name, u.email) as volunteer_name
      FROM guests g
      LEFT JOIN users u ON u.id = g.assigned_volunteer_id
      LEFT JOIN individuals i ON i.user_id = u.id
      LEFT JOIN organizations o ON o.user_id = u.id
      WHERE g.event_id = ?
    `;
    const params = [eventId];

    if (isVolunteer && !isAdmin) {
      sql += ' AND g.assigned_volunteer_id = ?';
      params.push(userId);
    }

    sql += ' ORDER BY g.id ASC';

    const guests = await query(sql, params);

    // Summary counts
    const totalCountRes = await query('SELECT count(*) as count FROM guests WHERE event_id = ?', [eventId]);
    const arrivedCountRes = await query("SELECT count(*) as count FROM guests WHERE event_id = ? AND rsvp_status = 'Arrived'", [eventId]);
    const myGuestsCountRes = await query('SELECT count(*) as count FROM guests WHERE event_id = ? AND assigned_volunteer_id = ?', [eventId, userId]);

    res.json({
      data: guests,
      totalCount: guests.length,
      scope: isAdmin ? 'all' : 'assigned',
      metrics: {
        allGuests: totalCountRes[0].count,
        arrivedGuests: arrivedCountRes[0].count,
        myGuests: myGuestsCountRes[0].count
      }
    });
  } catch (error) {
    console.error('[GuestController] list error:', error);
    res.status(500).json({ error: 'Failed to retrieve guests.' });
  }
}

/**
 * POST /api/guests/:id/checkin
 */
async function checkIn(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    const eventId = getEventId(req);

    await query(`
      UPDATE guests 
      SET rsvp_status = 'Arrived', badge_issued = 1, checked_in_at = COALESCE(checked_in_at, NOW())
      WHERE id = ? AND event_id = ?
    `, [id, eventId]);

    const [row] = await query('SELECT checked_in_at FROM guests WHERE id = ? AND event_id = ?', [id, eventId]);
    // checked_in_at keeps the first arrival time (API review D4)
    res.json({ message: 'Guest checked in and badge issued.', id, rsvp_status: 'Arrived', badge_issued: true, checked_in_at: row?.checked_in_at || null });
  } catch (error) {
    console.error('[GuestController] checkIn error:', error);
    res.status(500).json({ error: 'Failed to check in guest.' });
  }
}

/**
 * POST /api/guests/:id/print-badge
 */
async function printBadge(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    const eventId = getEventId(req);

    await query(`
      UPDATE guests 
      SET badge_issued = 1 
      WHERE id = ? AND event_id = ?
    `, [id, eventId]);

    res.json({ message: 'Badge printed successfully.', id, badge_issued: true });
  } catch (error) {
    console.error('[GuestController] printBadge error:', error);
    res.status(500).json({ error: 'Failed to print badge.' });
  }
}

module.exports = { list, checkIn, printBadge };
