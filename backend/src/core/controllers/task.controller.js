/**
 * Task Controller
 * Implements role-scoped task access:
 * - Admin sees all 14 tasks (including 3 unassigned)
 * - Volunteer sees only tasks assigned to them (e.g. 2 for user-4 Amit Sharma)
 * - Status transitions: 'To Do' -> 'In Progress' -> 'Done'
 */

const { query } = require('../../config/database');
const { scopeTasksQuery } = require('../services/scoping.service');

/**
 * GET /api/tasks
 */
async function list(req, res) {
  try {
    const eventId = req.headers['x-event-id'] || req.headers['x-edition-id'] || req.headers['x-festival-id'] || req.query.eventId || 1;
    const userId = req.user.id;

    // Check user role
    const groupRows = await query(`
      SELECT g.group_key 
      FROM user_event_groups ueg
      JOIN \`groups\` g ON g.id = ueg.group_id
      WHERE ueg.user_id = ? AND ueg.event_id = ?
    `, [userId, eventId]);

    const userRole = groupRows.length > 0 ? groupRows[0].group_key : 'volunteer';
    const isAdmin = userRole === 'admin' || (req.user && req.user.isSuperAdmin);

    const effectiveScope = req.permissionScope || {
      scopeKey: isAdmin ? 'all' : 'assigned',
      isWildcard: isAdmin,
      allUserIds: req.user.userIds || [userId],
      primaryUserId: userId,
      editionId: parseInt(eventId, 10)
    };

    let sql = `
      SELECT 
        t.id,
        t.title,
        t.department,
        t.priority,
        t.due_date,
        t.status,
        t.created_at,
        GROUP_CONCAT(DISTINCT COALESCE(i.name, o.name, u.email) SEPARATOR ', ') as assignees,
        GROUP_CONCAT(DISTINCT u.id SEPARATOR ',') as assignee_ids
      FROM tasks t
      LEFT JOIN task_assignees ta ON ta.task_id = t.id
      LEFT JOIN users u ON u.id = ta.user_id
      LEFT JOIN individuals i ON i.user_id = u.id
      LEFT JOIN organizations o ON o.user_id = u.id
      WHERE t.event_id = ?
    `;
    let params = [eventId];

    if (req.query.unassigned === 'true' && (effectiveScope.isWildcard || effectiveScope.scopeKey === 'all')) {
      sql += ` AND t.id NOT IN (SELECT task_id FROM task_assignees)`;
    }

    // Apply row-level scoping
    const scoped = scopeTasksQuery(sql, params, effectiveScope);
    sql = scoped.sql;
    params = scoped.params;

    sql += ` GROUP BY t.id, t.title, t.department, t.priority, t.due_date, t.status, t.created_at ORDER BY t.id ASC`;

    const tasks = await query(sql, params);

    const userIds = effectiveScope.allUserIds || [userId];
    const userPlaceholders = userIds.map(() => '?').join(',');

    // Summary counts for filter tabs
    const totalCountRes = await query('SELECT count(*) as count FROM tasks WHERE event_id = ?', [eventId]);
    const unassignedCountRes = await query(`
      SELECT count(*) as count FROM tasks 
      WHERE event_id = ? AND id NOT IN (SELECT task_id FROM task_assignees)
    `, [eventId]);
    const myTasksCountRes = await query(`
      SELECT count(DISTINCT task_id) as count FROM task_assignees WHERE user_id IN (${userPlaceholders})
    `, [...userIds]);

    const myUserIdStrings = new Set(userIds.map(String));

    res.json({
      data: tasks.map(t => ({
        ...t,
        assigneeList: t.assignees ? t.assignees.split(', ') : [],
        assigneeIdList: t.assignee_ids ? t.assignee_ids.split(',').map(Number) : [],
        isAssignedToMe: t.assignee_ids ? t.assignee_ids.split(',').some(id => myUserIdStrings.has(id)) : false
      })),
      totalCount: tasks.length,
      scope: effectiveScope.scopeKey,
      metrics: {
        allTasks: totalCountRes[0].count,
        unassignedTasks: unassignedCountRes[0].count,
        myTasks: myTasksCountRes[0].count
      }
    });
  } catch (error) {
    console.error('[TaskController] list error:', error);
    res.status(500).json({ error: 'Failed to retrieve tasks.' });
  }
}

/**
 * PUT /api/tasks/:id/status
 */
async function updateStatus(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    const eventId = req.headers['x-event-id'] || req.headers['x-edition-id'] || req.headers['x-festival-id'] || 1;
    const { status } = req.body;

    const validStatuses = ['To Do', 'In Progress', 'Done'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    await query(`
      UPDATE tasks SET status = ? WHERE id = ? AND event_id = ?
    `, [status, id, eventId]);

    res.json({ message: `Task status updated to ${status}.`, id, status });
  } catch (error) {
    console.error('[TaskController] updateStatus error:', error);
    res.status(500).json({ error: 'Failed to update task status.' });
  }
}

/**
 * POST /api/tasks
 */
async function create(req, res) {
  try {
    const eventId = req.headers['x-event-id'] || req.headers['x-edition-id'] || req.headers['x-festival-id'] || 1;
    const { title, department = 'General', priority = 'medium', due_date, assigneeIds = [] } = req.body;

    if (!title) return res.status(400).json({ error: 'Task title is required.' });

    const result = await query(`
      INSERT INTO tasks (event_id, title, department, priority, due_date, status, created_by_user_id)
      VALUES (?, ?, ?, ?, COALESCE(?, '2026-06-05 12:00:00'), 'To Do', ?)
    `, [eventId, title.trim(), department, priority, due_date || null, req.user.id]);

    const taskId = result.insertId;

    if (Array.isArray(assigneeIds) && assigneeIds.length > 0) {
      for (const uid of assigneeIds) {
        await query('INSERT INTO task_assignees (task_id, user_id) VALUES (?, ?)', [taskId, uid]);
      }
    }

    res.status(201).json({ message: 'Task created.', taskId });
  } catch (error) {
    console.error('[TaskController] create error:', error);
    res.status(500).json({ error: 'Failed to create task.' });
  }
}

module.exports = { list, updateStatus, create };
