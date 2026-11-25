/**
 * Department Controller
 * Real MySQL queries for festival departments, staff counts, and active tasks.
 */

const { query } = require('../../config/database');
const { getEventId } = require('../utils/eventId');

async function list(req, res) {
  try {
    const eventId = getEventId(req);

    const rows = await query(`
      SELECT 
        fd.id,
        fd.name,
        COUNT(DISTINCT ta.user_id) as staff_count,
        COUNT(DISTINCT t.id) as task_count
      FROM festival_departments fd
      LEFT JOIN tasks t ON t.department = fd.name AND t.event_id = fd.event_id
      LEFT JOIN task_assignees ta ON ta.task_id = t.id
      WHERE fd.event_id = ?
      GROUP BY fd.id, fd.name
      ORDER BY fd.id ASC
    `, [eventId]);

    res.json({
      departments: rows.map(r => ({
        id: r.id,
        name: r.name,
        staffCount: Number(r.staff_count),
        activeTasks: Number(r.task_count)
      }))
    });
  } catch (error) {
    console.error('[DepartmentController] list error:', error);
    res.status(500).json({ error: 'Failed to retrieve departments.' });
  }
}

module.exports = { list };
