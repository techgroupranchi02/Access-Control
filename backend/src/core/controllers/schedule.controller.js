/**
 * Schedule Controller
 * Venue screening slots, grid timetable, and Day 1 director arrival conflict detection.
 */

const { query } = require('../../config/database');

/**
 * GET /api/calendar
 */
async function list(req, res) {
  try {
    const eventId = req.headers['x-event-id'] || req.headers['x-edition-id'] || req.headers['x-festival-id'] || req.query.eventId || 1;

    const venues = await query('SELECT venue_id as id, venue_name as name, capacity, event_id, created_at FROM venues WHERE event_id = ? ORDER BY venue_id ASC', [eventId]);

    const slots = await query(`
      SELECT 
        vss.id,
        vss.venue_name,
        vss.day_index,
        vss.start_time,
        vss.end_time,
        vss.film_id,
        s.title as film_title,
        s.director as film_director,
        s.runtime as film_runtime,
        s.category as film_category,
        s.status as film_status
      FROM venue_screening_slots vss
      LEFT JOIN submissions s ON s.id = vss.film_id
      WHERE vss.event_id = ?
      ORDER BY vss.day_index ASC, vss.start_time ASC
    `, [eventId]);

    // Check for VIP Guest arrival conflicts
    // Day 1: "The Long Walk" (director Deepa Rao) at 17:30 vs Flight arrival at 19:00
    const guests = await query('SELECT * FROM guests WHERE event_id = ?', [eventId]);
    const conflicts = [];

    for (const slot of slots) {
      if (slot.film_director) {
        const matchedGuest = guests.find(g => 
          g.role && g.role.toLowerCase().includes(slot.film_title.toLowerCase()) ||
          g.name.toLowerCase() === slot.film_director.toLowerCase()
        );

        if (matchedGuest && matchedGuest.flight_details && matchedGuest.flight_details.includes('19:00')) {
          // If slot starts before 19:00 on arrival day
          if (slot.start_time < '19:00:00') {
            conflicts.push({
              slotId: slot.id,
              venue: slot.venue_name,
              dayIndex: slot.day_index,
              filmTitle: slot.film_title,
              director: slot.film_director,
              startTime: slot.start_time,
              guestName: matchedGuest.name,
              flightInfo: matchedGuest.flight_details,
              severity: 'CRITICAL',
              message: `Director ${matchedGuest.name} flight arrives at 19:00, but screening begins at ${slot.start_time.slice(0, 5)} in ${slot.venue_name}.`
            });
          }
        }
      }
    }

    res.json({
      venues,
      slots,
      conflicts,
      hasConflicts: conflicts.length > 0,
      totalSlots: slots.length
    });
  } catch (error) {
    console.error('[ScheduleController] list error:', error);
    res.status(500).json({ error: 'Failed to retrieve schedule.' });
  }
}

/**
 * POST /api/calendar/slot
 */
async function createSlot(req, res) {
  try {
    const eventId = req.headers['x-event-id'] || req.headers['x-edition-id'] || req.headers['x-festival-id'] || req.query.eventId || 1;
    const { venue_name, day_index = 0, start_time, end_time, film_id } = req.body;

    if (!venue_name || !start_time || !end_time || !film_id) {
      return res.status(400).json({ error: 'Venue, start time, end time, and film ID are required.' });
    }

    const result = await query(`
      INSERT INTO venue_screening_slots (event_id, venue_name, day_index, start_time, end_time, film_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [eventId, venue_name, day_index, start_time, end_time, film_id]);

    res.status(201).json({ message: 'Slot created successfully.', slotId: result.insertId });
  } catch (error) {
    console.error('[ScheduleController] createSlot error:', error);
    res.status(500).json({ error: 'Failed to create slot.' });
  }
}

module.exports = { list, createSlot };
