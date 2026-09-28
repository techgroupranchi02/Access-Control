/**
 * Sponsor Controller
 * Real MySQL queries for festival sponsors and deliverables.
 */

const { query } = require('../../config/database');

async function list(req, res) {
  try {
    const eventId = req.headers['x-event-id'] || req.headers['x-edition-id'] || req.headers['x-festival-id'] || req.query.eventId || 1;

    const sponsors = await query('SELECT * FROM sponsors WHERE event_id = ? ORDER BY id ASC', [eventId]);
    const deliverables = await query(`
      SELECT sd.*, s.name as sponsor_name 
      FROM sponsor_deliverables sd
      JOIN sponsors s ON s.id = sd.sponsor_id
      WHERE s.event_id = ?
      ORDER BY sd.due_date ASC
    `, [eventId]);

    res.json({
      sponsors,
      deliverables,
      totalDeliverables: deliverables.length
    });
  } catch (error) {
    console.error('[SponsorController] list error:', error);
    res.status(500).json({ error: 'Failed to retrieve sponsors.' });
  }
}

async function updateDeliverableStatus(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    const { status } = req.body;

    await query('UPDATE sponsor_deliverables SET status = ? WHERE id = ?', [status, id]);
    res.json({ message: 'Deliverable status updated.', id, status });
  } catch (error) {
    console.error('[SponsorController] updateDeliverableStatus error:', error);
    res.status(500).json({ error: 'Failed to update deliverable status.' });
  }
}

module.exports = { list, updateDeliverableStatus };
