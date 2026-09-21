/**
 * Permission Service
 * Handles permissions, groups, module groups, and user group assignments.
 * Supports the Updated Declarative Configuration Specification without scope_key.
 */

const { query, getConnection } = require('../../config/database');

/**
 * Get all permissions.
 */
async function getAllPermissions() {
  return query(
    'SELECT id, permission_key, label, label as name, description, module_id, page_id, actions_match, actions_unmatch, created_at FROM permissions ORDER BY permission_key'
  );
}

/**
 * Get all declarative scopes (simplified to 'all' in Phase 1).
 */
async function getAllScopes() {
  return ['all'];
}

/**
 * Get all groups with their permissions and member counts.
 */
async function getAllGroups() {
  const groups = await query('SELECT id, group_key, label, label as name, description, is_system, created_at FROM `groups` ORDER BY id');

  for (const group of groups) {
    const perms = await query(
      `SELECT DISTINCT p.id, p.permission_key, p.label, p.label as name, p.module_id, p.page_id, p.actions_match, p.actions_unmatch
       FROM permissions p
       JOIN module_groups_permissions mgp ON mgp.permission_id = p.id
       JOIN module_groups mg ON mg.id = mgp.module_group_id
       WHERE mg.group_id = ?
       ORDER BY p.permission_key`,
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
 * Get a group by ID with its permissions.
 */
async function getGroupById(groupId) {
  const groups = await query('SELECT id, group_key, label, label as name, description, is_system, created_at FROM `groups` WHERE id = ?', [groupId]);
  if (groups.length === 0) return null;

  const group = groups[0];
  const perms = await query(
    `SELECT DISTINCT p.id, p.permission_key, p.label, p.label as name, p.module_id, p.page_id, p.actions_match, p.actions_unmatch
     FROM permissions p
     JOIN module_groups_permissions mgp ON mgp.permission_id = p.id
     JOIN module_groups mg ON mg.id = mgp.module_group_id
     WHERE mg.group_id = ?
     ORDER BY p.permission_key`,
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
      'INSERT INTO `groups` (group_key, label, description, is_system) VALUES (?, ?, ?, FALSE)',
      [groupKey, name, description]
    );
    const groupId = result.insertId;

    // Assign permissions
    for (const assignment of permissionAssignments) {
      const permId = typeof assignment === 'object' ? assignment.permissionId : assignment;
      if (!permId) continue;

      // Find module_id for permission
      const [pRows] = await conn.execute('SELECT module_id FROM permissions WHERE id = ?', [permId]);
      const moduleId = (pRows[0] && pRows[0].module_id) ? pRows[0].module_id : 1;

      // Find or create module_groups
      let [mgRows] = await conn.execute(
        'SELECT id FROM module_groups WHERE group_id = ? AND module_id = ?',
        [groupId, moduleId]
      );
      let mgId = mgRows[0] ? mgRows[0].id : null;
      if (!mgId) {
        const [insMg] = await conn.execute(
          'INSERT INTO module_groups (group_id, module_id, name) VALUES (?, ?, ?)',
          [groupId, moduleId, `${name} - Module ${moduleId}`]
        );
        mgId = insMg.insertId;
      }

      await conn.execute(
        'INSERT IGNORE INTO module_groups_permissions (module_group_id, permission_id) VALUES (?, ?)',
        [mgId, permId]
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
 * Update group permissions.
 */
async function updateGroupPermissions(groupId, permissionAssignments) {
  const conn = await getConnection();
  try {
    await conn.beginTransaction();

    // Delete existing module_groups_permissions for this group
    await conn.execute(
      `DELETE mgp FROM module_groups_permissions mgp
       JOIN module_groups mg ON mg.id = mgp.module_group_id
       WHERE mg.group_id = ?`,
      [groupId]
    );

    // Assign new permissions
    for (const assignment of permissionAssignments) {
      const permId = typeof assignment === 'object' ? assignment.permissionId : assignment;
      if (!permId) continue;

      const [pRows] = await conn.execute('SELECT module_id FROM permissions WHERE id = ?', [permId]);
      const moduleId = (pRows[0] && pRows[0].module_id) ? pRows[0].module_id : 1;

      let [mgRows] = await conn.execute(
        'SELECT id FROM module_groups WHERE group_id = ? AND module_id = ?',
        [groupId, moduleId]
      );
      let mgId = mgRows[0] ? mgRows[0].id : null;
      if (!mgId) {
        const [gRow] = await conn.execute('SELECT label FROM `groups` WHERE id = ?', [groupId]);
        const gLabel = gRow[0] ? gRow[0].label : 'Group';
        const [insMg] = await conn.execute(
          'INSERT INTO module_groups (group_id, module_id, name) VALUES (?, ?, ?)',
          [groupId, moduleId, `${gLabel} - Module ${moduleId}`]
        );
        mgId = insMg.insertId;
      }

      await conn.execute(
        'INSERT IGNORE INTO module_groups_permissions (module_group_id, permission_id) VALUES (?, ?)',
        [mgId, permId]
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
 * Assign a user to a group for an edition, checking event_user_limits.
 */
async function assignUserGroup(userId, editionId, groupId) {
  // Check user limit on event_user_limits if exists
  const limits = await query(
    `SELECT eul.max_users, mg.name
     FROM event_user_limits eul
     JOIN module_groups mg ON mg.id = eul.module_group_id
     WHERE eul.event_id = ? AND mg.group_id = ?`,
    [editionId, groupId]
  );

  if (limits.length > 0 && limits[0].max_users !== null) {
    const [countRow] = await query(
      'SELECT COUNT(DISTINCT user_id) as total FROM user_event_groups WHERE event_id = ? AND group_id = ?',
      [editionId, groupId]
    );
    if (countRow.total >= limits[0].max_users) {
      throw new Error(`Cannot assign user: Limit of ${limits[0].max_users} member(s) reached for this event.`);
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
 */
async function getUserPermissions(userId, editionId) {
  const rows = await query(
    `SELECT DISTINCT p.permission_key
     FROM user_event_groups ueg
     JOIN module_groups mg ON mg.group_id = ueg.group_id
     JOIN module_groups_permissions mgp ON mgp.module_group_id = mg.id
     JOIN permissions p ON p.id = mgp.permission_id
     WHERE ueg.user_id = ? AND ueg.event_id = ?
     UNION
     SELECT DISTINCT p.permission_key
     FROM user_event_custom_groups uecg
     JOIN event_custom_group_permissions ecgp ON ecgp.custom_group_id = uecg.custom_group_id
     JOIN permissions p ON p.id = ecgp.permission_id
     WHERE uecg.user_id = ? AND uecg.event_id = ?`,
    [userId, editionId, userId, editionId]
  );

  const keys = rows.map(r => r.permission_key);
  const isSuperAdmin = keys.includes('*');

  return {
    permissions: keys,
    details: rows,
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
      `SELECT e.event_id as event_id, e.event_id as id, e.name as event_name,
              g.id as group_id, g.label as group_name, g.label as name, g.group_key
       FROM user_event_groups ueg
       JOIN events e ON e.event_id = ueg.event_id AND e.is_deleted = 0
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
