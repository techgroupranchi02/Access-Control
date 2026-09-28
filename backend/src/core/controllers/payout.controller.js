/**
 * Payout Controller
 * Real MySQL queries for festival payout milestones.
 */

const { query } = require('../../config/database');

async function list(req, res) {
  try {
    const eventId = req.headers['x-event-id'] || req.headers['x-edition-id'] || req.headers['x-festival-id'] || req.query.eventId || 1;

    const milestones = await query('SELECT * FROM payout_milestones WHERE event_id = ? ORDER BY id ASC', [eventId]);

    res.json({
      milestones,
      totalAmount: milestones.reduce((sum, m) => sum + parseFloat(m.target_amount || 0), 0)
    });
  } catch (error) {
    console.error('[PayoutController] list error:', error);
    res.status(500).json({ error: 'Failed to retrieve payout milestones.' });
  }
}

async function requestRelease(req, res) {
  try {
    const { milestoneId } = req.body;
    await query("UPDATE payout_milestones SET status = 'Requested' WHERE id = ?", [milestoneId]);
    res.json({ message: 'Payout release requested.', milestoneId });
  } catch (error) {
    console.error('[PayoutController] requestRelease error:', error);
    res.status(500).json({ error: 'Failed to request payout release.' });
  }
}

module.exports = { list, requestRelease };
