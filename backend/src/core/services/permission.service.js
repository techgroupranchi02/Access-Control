/**
 * Permission Service
 * Handles permissions, groups, scopes, and user group assignments.
 * Supports the Updated Declarative Configuration Specification.
 */

const { query, getConnection } = require('../../config/database');

/**
 * Get all permissions grouped by resource/module.
 */
async function getAllPermissions() {
  return query('SELECT * FROM permissions ORDER BY resource, permission_key');
}

/**
 * Get all declarative scopes with rules.
 */
async function getAllScopes() {
  return ['all', 'assigned', 'jury_panel', 'department'];
}

/**
 * Get all groups with their scoped permissions and limits.
 */
async function getAllGroups() {
  const groups = await query('SELECT * FROM `groups` ORDER BY id');

  for (const group of groups) {
    const perms = await query(
      `SELECT p.id, p.permission_key, p.name, p.resource, p.action, gp.scope_key
       FROM permissions p
       JOIN group_permissions gp ON gp.permission_id = p.id
       WHERE gp.group_id = ?
       ORDER BY p.resource, p.permission_key`,
      [group.id]
    );

    group.permissions = perms;

    // Count current active members across editions/events
    const [countResult] = await query(
      'SELECT COUNT(DISTINCT user_id) as member_count FROM user_event_groups WHERE group_id = ?',
      [group.id]
    );
    group.currentMembers = countResult.member_count;
  }

  return groups;
}

/**
 * Get a group by ID with its scoped permissions.
 */
async function getGroupById(groupId) {
  const groups = await query('SELECT * FROM `groups` WHERE id = ?', [groupId]);
  if (groups.length === 0) return null;

  const group = groups[0];
  const perms = await query(
    `SELECT p.id, p.permission_key, p.name, p.resource, p.action, gp.scope_key
     FROM permissions p
     JOIN group_permissions gp ON gp.permission_id = p.id
     WHERE gp.group_id = ?
     ORDER BY p.resource, p.permission_key`,
    [group.id]
  );

  group.permissions = perms;
  return group;
}

/**
 * Create a new custom group.
 */
async function createGroup(groupKey, name, description, userLimit = null, permissionAssignments = []) {
  const conn = await getConnection();
  try {
    await conn.beginTransaction();

    const [result] = await conn.execute(
      'INSERT INTO `groups` (group_key, name, description, is_system, user_limit) VALUES (?, ?, ?, FALSE, ?)',
      [groupKey, name, description, userLimit]
    );
    const groupId = result.insertId;

    // Assign permissions with scopes
    for (const assignment of permissionAssignments) {
      // assignment can be { permissionId, scopeKey } or number
      const permId = typeof assignment === 'object' ? assignment.permissionId : assignment;
      const scopeKey = (typeof assignment === 'object' && assignment.scopeKey) || 'all';

      await conn.execute(
        'INSERT IGNORE INTO group_permissions (group_id, permission_id, scope_key) VALUES (?, ?, ?)',
        [groupId, permId, scopeKey]
      );
    }

    await conn.commit();
    return getGroupById(groupId);
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

/**
 * Update group permissions and scopes.
 */
async function updateGroupPermissions(groupId, permissionAssignments) {
  const conn = await getConnection();
  try {
    await conn.beginTransaction();

    // Remove old permissions
    await conn.execute('DELETE FROM group_permissions WHERE group_id = ?', [groupId]);

    // Assign new permissions with scopes
    for (const assignment of permissionAssignments) {
      const permId = typeof assignment === 'object' ? assignment.permissionId : assignment;
      const scopeKey = (typeof assignment === 'object' && assignment.scopeKey) || 'all';

      await conn.execute(
        'INSERT INTO group_permissions (group_id, permission_id, scope_key) VALUES (?, ?, ?)',
        [groupId, permId, scopeKey]
      );
    }

    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

/**
 * Assign a user to a group for an edition, enforcing group user_limit.
 */
async function assignUserGroup(userId, editionId, groupId) {
  // Check user limit on the group
  const [groupRow] = await query('SELECT group_key, name, user_limit FROM `groups` WHERE id = ?', [groupId]);
  if (!groupRow) {
    throw new Error('Group not found.');
  }

  if (groupRow.user_limit !== null) {
    const [countRow] = await query(
      'SELECT COUNT(DISTINCT user_id) as total FROM user_event_groups WHERE event_id = ? AND group_id = ?',
      [editionId, groupId]
    );
    if (countRow.total >= groupRow.user_limit) {
      throw new Error(`Cannot assign user: Group "${groupRow.name}" limit of ${groupRow.user_limit} member(s) reached.`);
    }
  }

  await query(
    'INSERT IGNORE INTO user_event_groups (user_id, event_id, group_id) VALUES (?, ?, ?)',
    [userId, editionId, groupId]
  );
}

/**
 * Remove a user from a group for an edition.
 */
async function removeUserGroup(userId, editionId, groupId) {
  await query(
    'DELETE FROM user_event_groups WHERE user_id = ? AND event_id = ? AND group_id = ?',
    [userId, editionId, groupId]
  );
}

/**
 * Get user's permissions for a specific edition.
 * Evaluates wildcard '*' and returns permission keys.
 */
async function getUserPermissions(userId, editionId) {
  const rows = await query(
    `SELECT DISTINCT p.permission_key, gp.scope_key
     FROM user_event_groups ueg
     JOIN group_permissions gp ON gp.group_id = ueg.group_id
     JOIN permissions p ON p.id = gp.permission_id
     WHERE ueg.user_id = ? AND ueg.event_id = ?`,
    [userId, editionId]
  );

  const details = rows;

  const keys = rows.map(r => r.permission_key);
  const isSuperAdmin = keys.includes('*');

  return {
    permissions: keys,
    details,
    isSuperAdmin,
  };
}

/**
 * Get all users with their edition groups.
 */
async function getAllUsersWithGroups() {
  const users = await query(
    'SELECT id, name, email, is_active, created_at FROM users ORDER BY name'
  );

  for (const user of users) {
    user.eventGroups = await query(
      `SELECT e.id as event_id, e.name as event_name, e.slug as event_slug,
              g.id as group_id, g.name as group_name, g.group_key, g.user_limit
       FROM user_event_groups ueg
       JOIN events e ON e.id = ueg.event_id
       JOIN \`groups\` g ON g.id = ueg.group_id
       WHERE ueg.user_id = ?`,
      [user.id]
    );
  }

  return users;
}

// Backward-compatible wrappers for old endpoints
const getAllRoles = getAllGroups;
const getRoleById = getGroupById;
const createRole = createGroup;
const updateRolePermissions = updateGroupPermissions;
const assignUserRole = assignUserGroup;
const removeUserRole = removeUserGroup;
const getAllUsersWithRoles = getAllUsersWithGroups;

module.exports = {
  getAllPermissions,
  getAllScopes,
  getAllGroups,
  getGroupById,
  createGroup,
  updateGroupPermissions,
  assignUserGroup,
  removeUserGroup,
  getUserPermissions,
  getAllUsersWithGroups,
  // Backward compatibility exports
  getAllRoles,
  getRoleById,
  createRole,
  updateRolePermissions,
  assignUserRole,
  removeUserRole,
  getAllUsersWithRoles,
};
