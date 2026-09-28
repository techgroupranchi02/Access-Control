/**
 * Team Controller
 * Real MySQL database queries for festival team members, roles, departments, and seat limits.
 */

const { query } = require('../../config/database');
const bcrypt = require('bcrypt');

const GROUP_PERMISSIONS = {
  admin: [
    { key: '*', label: 'All Permissions' },
    { key: 'admin:access', label: 'Admin Access' },
    { key: 'submissions:*', label: 'Submissions Control' },
    { key: 'reviews:*', label: 'Review Pipeline' },
    { key: 'tasks:*', label: 'Task Management' },
    { key: 'payouts:*', label: 'Payouts Control' }
  ],
  judge: [
    { key: 'jury:view_panel', label: 'View Jury Panel' },
    { key: 'jury:score', label: 'Score Submissions' },
    { key: 'jury:submit_decision', label: 'Submit Ballots' },
    { key: 'review:evaluate', label: 'Evaluate Reviews' },
    { key: 'submission:view', label: 'View Submissions' }
  ],
  volunteer: [
    { key: 'task:view', label: 'View Tasks' },
    { key: 'task:update_status', label: 'Update Progress' },
    { key: 'calendar:view', label: 'View Screenings' },
    { key: 'submission:view', label: 'View Submissions' }
  ]
};

/**
 * Helper: Retrieve all canonical modules and their scoped permissions
 */
async function getPermissionsCatalog() {
  const mods = await query(`
    SELECT m.id, m.module_key, m.label, m.icon, m.type, m.display_order
    FROM modules m
    ORDER BY m.display_order ASC, m.id ASC
  `);
  const perms = await query(`
    SELECT p.id, p.permission_key, p.label, p.description, p.module_id
    FROM permissions p
    ORDER BY p.id ASC
  `);
  return mods.map(m => ({
    id: m.id,
    key: m.module_key,
    label: m.label,
    icon: m.icon,
    permissions: perms.filter(p => p.module_id === m.id).map(p => ({
      id: p.id,
      key: p.permission_key,
      label: p.label,
      description: p.description
    }))
  })).filter(m => m.permissions.length > 0);
}

/**
 * Helper: Retrieve a member's assigned groups and effective union permissions for an event
 */
async function getMemberPermissions(userId, eventId) {
  // 1. Fetch assigned standard groups
  const stdGroups = await query(`
    SELECT g.id, g.group_key, g.label, g.description
    FROM user_event_groups ueg
    JOIN \`groups\` g ON g.id = ueg.group_id
    WHERE ueg.user_id = ? AND ueg.event_id = ?
    ORDER BY g.id ASC
  `, [userId, eventId]);

  // 2. Fetch assigned custom groups
  const customGroups = await query(`
    SELECT ecg.id, ecg.name, ecg.description
    FROM user_event_custom_groups uecg
    JOIN event_custom_groups ecg ON ecg.id = uecg.custom_group_id
    WHERE uecg.user_id = ? AND uecg.event_id = ?
    ORDER BY ecg.name ASC
  `, [userId, eventId]);

  // 3. Fetch permissions from assigned standard groups
  const stdPerms = await query(`
    SELECT DISTINCT p.id, p.permission_key as \`key\`, p.label, p.description, p.module_id as moduleId, m.label as module, m.display_order
    FROM user_event_groups ueg
    JOIN module_groups mg ON mg.group_id = ueg.group_id
    JOIN module_groups_permissions mgp ON mgp.module_group_id = mg.id
    JOIN permissions p ON p.id = mgp.permission_id
    JOIN modules m ON m.id = p.module_id
    WHERE ueg.user_id = ? AND ueg.event_id = ?
    ORDER BY m.display_order ASC, p.id ASC
  `, [userId, eventId]);

  // 4. Fetch permissions from assigned custom groups
  const customPerms = await query(`
    SELECT DISTINCT p.id, p.permission_key as \`key\`, p.label, p.description, p.module_id as moduleId, m.label as module, m.display_order
    FROM user_event_custom_groups uecg
    JOIN event_custom_group_permissions ecgp ON ecgp.custom_group_id = uecg.custom_group_id
    JOIN permissions p ON p.id = ecgp.permission_id
    JOIN modules m ON m.id = p.module_id
    WHERE uecg.user_id = ? AND uecg.event_id = ?
    ORDER BY m.display_order ASC, p.id ASC
  `, [userId, eventId]);

  // Union permissions (deduplicate by key)
  const permMap = new Map();
  for (const p of [...stdPerms, ...customPerms]) {
    if (!permMap.has(p.key)) {
      permMap.set(p.key, p);
    }
  }
  const unionedPerms = Array.from(permMap.values());

  const assignedGroups = [
    ...stdGroups.map(g => ({
      id: g.id,
      key: g.group_key,
      label: g.label,
      description: g.description,
      type: 'standard'
    })),
    ...customGroups.map(cg => ({
      id: cg.id,
      key: `custom_${cg.id}`,
      label: cg.name,
      description: cg.description || '',
      type: 'custom'
    }))
  ];

  const roleLabels = assignedGroups.map(g => g.label);
  const roleKeys = assignedGroups.map(g => g.key);

  return {
    groups: assignedGroups,
    roles: roleLabels,
    roleKeys,
    groupDisplay: roleLabels.join(', ') || 'Volunteer',
    primaryRoleKey: roleKeys[0] || 'volunteer',
    primaryGroup: roleLabels[0] || 'Volunteer',
    permissions: unionedPerms,
    hasCustomPermissions: customGroups.length > 0
  };
}

/**
 * GET /api/team
 * Returns list of team members for current event/edition with groups, granular permissions, and full catalog.
 */
async function list(req, res) {
  try {
    const eventId = req.headers['x-event-id'] || req.headers['x-edition-id'] || req.headers['x-festival-id'] || req.query.eventId || 1;

    // Fetch all unique users assigned to this festival edition
    const rows = await query(`
      SELECT DISTINCT
        u.id, 
        COALESCE(i.name, o.name, u.email) as name, 
        u.email, 
        u.status
      FROM users u
      LEFT JOIN individuals i ON i.user_id = u.id
      LEFT JOIN organizations o ON o.user_id = u.id
      WHERE u.id IN (
        SELECT user_id FROM user_event_groups WHERE event_id = ?
        UNION
        SELECT user_id FROM user_event_custom_groups WHERE event_id = ?
      )
      ORDER BY u.id ASC
    `, [eventId, eventId]);

    const catalog = await getPermissionsCatalog();

    const users = await Promise.all(rows.map(async r => {
      const permData = await getMemberPermissions(r.id, eventId);

      let accessTier = 'General Access';
      if (permData.roleKeys.includes('admin')) accessTier = 'Full Control';
      else if (permData.roleKeys.includes('judge')) accessTier = 'Jury & Scoring';
      else if (permData.roleKeys.includes('volunteer')) accessTier = 'Assigned Only';

      return {
        id: r.id,
        name: r.name,
        email: r.email,
        groups: permData.groups,
        roles: permData.roles,
        roleKeys: permData.roleKeys,
        role: permData.groupDisplay,
        group: permData.groupDisplay,
        roleKey: permData.primaryRoleKey,
        groupId: permData.groups[0]?.id || 2,
        permissions: permData.permissions,
        hasCustomPermissions: permData.hasCustomPermissions,
        accessTier,
        isActive: r.status === 1
      };
    }));

    const groupPermRows = await query(`
      SELECT g.group_key, p.permission_key
      FROM \`groups\` g
      JOIN module_groups mg ON mg.group_id = g.id
      JOIN module_groups_permissions mgp ON mgp.module_group_id = mg.id
      JOIN permissions p ON p.id = mgp.permission_id
    `);
    const groupDefaults = { admin: [], judge: [], volunteer: [] };
    for (const gp of groupPermRows) {
      if (groupDefaults[gp.group_key]) {
        groupDefaults[gp.group_key].push(gp.permission_key);
      }
    }

    // Fetch custom groups for this festival event
    const customGroupsRows = await query(`
      SELECT 
        ecg.id,
        ecg.name,
        ecg.description,
        ecg.created_at,
        COUNT(DISTINCT uecg.user_id) as member_count
      FROM event_custom_groups ecg
      LEFT JOIN user_event_custom_groups uecg ON uecg.custom_group_id = ecg.id
      WHERE ecg.event_id = ? AND ecg.name NOT LIKE 'user_%_custom'
      GROUP BY ecg.id, ecg.name, ecg.description, ecg.created_at
      ORDER BY ecg.name ASC
    `, [eventId]);

    const customGroups = await Promise.all(customGroupsRows.map(async cg => {
      const perms = await query(`
        SELECT p.id, p.permission_key as \`key\`, p.label, p.description, p.module_id as moduleId, m.label as module, m.display_order
        FROM event_custom_group_permissions ecgp
        JOIN permissions p ON p.id = ecgp.permission_id
        JOIN modules m ON m.id = p.module_id
        WHERE ecgp.custom_group_id = ?
        ORDER BY m.display_order ASC, p.id ASC
      `, [cg.id]);

      return {
        id: cg.id,
        name: cg.name,
        description: cg.description || '',
        memberCount: parseInt(cg.member_count || 0, 10),
        permissions: perms.map(p => p.key),
        permissionDetails: perms,
        createdAt: cg.created_at
      };
    }));

    res.json({
      users,
      catalog,
      groupDefaults,
      customGroups,
      totalCount: users.length,
      seatsAllocated: users.length,
      seatLimit: 25
    });
  } catch (error) {
    console.error('[TeamController] list error:', error);
    res.status(500).json({ error: 'Failed to retrieve team members.' });
  }
}

/**
 * GET /api/team/:id
 */
async function getById(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    const eventId = req.headers['x-event-id'] || req.headers['x-edition-id'] || req.headers['x-festival-id'] || 1;

    const rows = await query(`
      SELECT 
        u.id, 
        COALESCE(i.name, o.name, u.email) as name, 
        u.email, 
        u.status,
        g.id as group_id,
        g.group_key as role_key,
        g.label as role
      FROM users u
      LEFT JOIN individuals i ON i.user_id = u.id
      LEFT JOIN organizations o ON o.user_id = u.id
      LEFT JOIN user_event_groups ueg ON ueg.user_id = u.id AND ueg.event_id = ?
      LEFT JOIN \`groups\` g ON g.id = ueg.group_id
      WHERE u.id = ?
      GROUP BY u.id, i.name, o.name, u.email, u.status, g.id, g.group_key, g.label
    `, [eventId, id]);

    if (rows.length === 0) return res.status(404).json({ error: 'Team member not found.' });

    const r = rows[0];
    const roleKey = r.role_key || 'volunteer';
    const roleDisplay = r.role || 'Volunteer';

    const permData = await getMemberPermissions(r.id, eventId);
    const catalog = await getPermissionsCatalog();

    res.json({
      id: r.id,
      name: r.name,
      email: r.email,
      groups: permData.groups,
      roles: permData.roles,
      roleKeys: permData.roleKeys,
      role: permData.groupDisplay,
      group: permData.groupDisplay,
      roleKey: permData.primaryRoleKey,
      groupId: permData.groups[0]?.id || 2,
      permissions: permData.permissions,
      hasCustomPermissions: permData.hasCustomPermissions,
      catalog,
      isActive: r.status === 1
    });
  } catch (error) {
    console.error('[TeamController] getById error:', error);
    res.status(500).json({ error: 'Failed to retrieve team member.' });
  }
}

/**
 * GET /api/team/search
 * Search registered individual users from the individuals table for adding to team.
 */
async function searchIndividuals(req, res) {
  try {
    const eventId = req.headers['x-event-id'] || req.headers['x-edition-id'] || req.headers['x-festival-id'] || req.query.eventId || 1;
    const q = (req.query.q || '').trim();

    if (!q || q.length < 2) {
      return res.json({ users: [] });
    }

    const pattern = `%${q}%`;
    const prefix = `${q}%`;

    const rows = await query(`
      SELECT 
        u.id as user_id,
        i.id as individual_id,
        i.name,
        u.email,
        i.username,
        i.image_name,
        EXISTS(
          SELECT 1 FROM user_event_groups ueg 
          WHERE ueg.user_id = u.id AND ueg.event_id = ?
        ) as is_already_member
      FROM individuals i
      JOIN users u ON u.id = i.user_id
      WHERE 
        (u.status = 1 OR u.status IS NULL)
        AND (
          i.name LIKE ? 
          OR u.email LIKE ? 
          OR i.username LIKE ?
        )
      ORDER BY 
        CASE 
          WHEN i.name LIKE ? THEN 1
          WHEN u.email LIKE ? THEN 2
          ELSE 3 
        END,
        i.name ASC
      LIMIT 20
    `, [eventId, pattern, pattern, pattern, prefix, prefix]);

    const users = rows.map(r => ({
      userId: r.user_id,
      individualId: r.individual_id,
      name: r.name || 'Unnamed Individual',
      email: r.email,
      username: r.username,
      imageName: r.image_name,
      isAlreadyMember: Boolean(r.is_already_member)
    }));

    res.json({ users });
  } catch (error) {
    console.error('[TeamController] searchIndividuals error:', error);
    res.status(500).json({ error: 'Failed to search users.' });
  }
}

/**
 * Helper: Persist or clear custom permissions for a user in an event
 */
async function syncUserCustomPermissions(userId, eventId, permissions, targetRole) {
  // If targetRole indicates a named custom group
  let customGroup = null;
  if (targetRole) {
    if (typeof targetRole === 'string' && targetRole.startsWith('custom_')) {
      const cId = parseInt(targetRole.replace('custom_', ''), 10);
      const rows = await query('SELECT id, name FROM event_custom_groups WHERE id = ? AND event_id = ?', [cId, eventId]);
      if (rows.length > 0) customGroup = rows[0];
    } else if (typeof targetRole === 'number') {
      const rows = await query('SELECT id, name FROM event_custom_groups WHERE id = ? AND event_id = ?', [targetRole, eventId]);
      if (rows.length > 0) customGroup = rows[0];
    } else if (typeof targetRole === 'string' && targetRole !== 'admin' && targetRole !== 'judge' && targetRole !== 'volunteer') {
      const rows = await query('SELECT id, name FROM event_custom_groups WHERE name = ? AND event_id = ?', [targetRole, eventId]);
      if (rows.length > 0) customGroup = rows[0];
    }
  }

  // Clear existing user_event_custom_groups linkage & any old user_x_custom group
  const prevCustomRows = await query(
    'SELECT uecg.custom_group_id, ecg.name FROM user_event_custom_groups uecg JOIN event_custom_groups ecg ON ecg.id = uecg.custom_group_id WHERE uecg.user_id = ? AND uecg.event_id = ?',
    [userId, eventId]
  );
  for (const prev of prevCustomRows) {
    await query('DELETE FROM user_event_custom_groups WHERE user_id = ? AND event_id = ? AND custom_group_id = ?', [userId, eventId, prev.custom_group_id]);
    if (prev.name.startsWith('user_') && prev.name.endsWith('_custom')) {
      await query('DELETE FROM event_custom_group_permissions WHERE custom_group_id = ?', [prev.custom_group_id]);
      await query('DELETE FROM event_custom_groups WHERE id = ?', [prev.custom_group_id]);
    }
  }

  if (customGroup) {
    // Check if permissions match the custom group template exactly
    const cgPerms = await query(
      'SELECT p.permission_key FROM event_custom_group_permissions ecgp JOIN permissions p ON p.id = ecgp.permission_id WHERE ecgp.custom_group_id = ?',
      [customGroup.id]
    );
    const cgPermKeys = new Set(cgPerms.map(p => p.permission_key));
    const isSameAsCg = Array.isArray(permissions) &&
      permissions.length === cgPermKeys.size &&
      permissions.every(k => cgPermKeys.has(k));

    if (isSameAsCg || !permissions) {
      // Directly assign user to this custom group
      await query(
        'INSERT IGNORE INTO user_event_custom_groups (user_id, event_id, custom_group_id) VALUES (?, ?, ?)',
        [userId, eventId, customGroup.id]
      );
      return;
    }
  }

  // Otherwise, if individual custom permissions are provided, save under user_${userId}_custom
  const customGroupName = `user_${userId}_custom`;
  if (Array.isArray(permissions)) {
    let customGroupId;
    const existingCg = await query(
      'SELECT id FROM event_custom_groups WHERE event_id = ? AND name = ? LIMIT 1',
      [eventId, customGroupName]
    );

    if (existingCg.length > 0) {
      customGroupId = existingCg[0].id;
    } else {
      const insRes = await query(
        'INSERT INTO event_custom_groups (event_id, name, description) VALUES (?, ?, ?)',
        [eventId, customGroupName, `Custom permissions for user ${userId}`]
      );
      customGroupId = insRes.insertId;
    }

    await query(
      'INSERT IGNORE INTO user_event_custom_groups (user_id, event_id, custom_group_id) VALUES (?, ?, ?)',
      [userId, eventId, customGroupId]
    );

    await query('DELETE FROM event_custom_group_permissions WHERE custom_group_id = ?', [customGroupId]);

    for (const item of permissions) {
      let pId = null;
      if (typeof item === 'number') {
        pId = item;
      } else if (typeof item === 'string') {
        const pRows = await query('SELECT id FROM permissions WHERE permission_key = ? LIMIT 1', [item]);
        if (pRows.length > 0) pId = pRows[0].id;
      }
      if (pId) {
        await query(
          'INSERT IGNORE INTO event_custom_group_permissions (custom_group_id, permission_id) VALUES (?, ?)',
          [customGroupId, pId]
        );
      }
    }
  }
}

/**
 * POST /api/team
 * Adds an existing individual user to the festival edition's team.
 */
async function create(req, res) {
  try {
    const eventId = req.headers['x-event-id'] || req.headers['x-edition-id'] || req.headers['x-festival-id'] || 1;
    const { userId, email, role, group, permissions } = req.body;

    let targetUserId = userId;

    // If userId was not passed, attempt lookup by email in individuals table
    if (!targetUserId && email) {
      const lookup = await query(`
        SELECT u.id 
        FROM users u 
        JOIN individuals i ON i.user_id = u.id 
        WHERE u.email = ?
        LIMIT 1
      `, [email.toLowerCase().trim()]);

      if (lookup.length > 0) {
        targetUserId = lookup[0].id;
      }
    }

    if (!targetUserId) {
      return res.status(400).json({ 
        error: 'Only registered users from the Freecomers individuals directory can be added to a team.' 
      });
    }

    // Verify user is an individual in individuals table
    const indRows = await query(`
      SELECT u.id, u.email, i.name, i.username, i.image_name 
      FROM individuals i 
      JOIN users u ON u.id = i.user_id 
      WHERE u.id = ?
      LIMIT 1
    `, [targetUserId]);

    if (indRows.length === 0) {
      return res.status(400).json({ 
        error: 'Selected user is not a registered individual. Other users cannot be added to a team.' 
      });
    }

    const indUser = indRows[0];

    // Check if user is already assigned to this festival edition
    const existingMember = await query(
      'SELECT id FROM user_event_groups WHERE user_id = ? AND event_id = ? LIMIT 1',
      [targetUserId, eventId]
    );
    if (existingMember.length > 0) {
      return res.status(400).json({ 
        error: `${indUser.name || indUser.email} is already a member of this festival edition team.` 
      });
    }

    // Check seat limit
    const currentCountRes = await query(
      'SELECT count(*) as count FROM user_event_groups WHERE event_id = ?',
      [eventId]
    );
    const currentCount = currentCountRes[0].count;
    if (currentCount >= 25) {
      return res.status(403).json({ error: 'Seat allocation limit reached (25 seats max).' });
    }

    // Assign user to multiple groups (standard and/or custom)
    const rawGroups = req.body.groups || req.body.group || req.body.role || 'volunteer';
    await assignUserToGroups(targetUserId, eventId, rawGroups);

    const permData = await getMemberPermissions(targetUserId, eventId);

    res.status(201).json({
      message: 'Team member added successfully.',
      member: {
        id: targetUserId,
        name: indUser.name || indUser.email,
        email: indUser.email,
        groups: permData.groups,
        roles: permData.roles,
        roleKeys: permData.roleKeys,
        role: permData.groupDisplay,
        group: permData.groupDisplay,
        roleKey: permData.primaryRoleKey,
        groupId: permData.groups[0]?.id || 2,
        permissions: permData.permissions,
        hasCustomPermissions: permData.hasCustomPermissions
      }
    });
  } catch (error) {
    console.error('[TeamController] create error:', error);
    res.status(500).json({ error: error.message || 'Failed to add team member.' });
  }
}

/**
 * Helper: Assign a user to one or more groups (standard and/or custom) for an event
 */
async function assignUserToGroups(userId, eventId, rawGroups) {
  const selectedGroupKeys = Array.isArray(rawGroups) && rawGroups.length > 0
    ? rawGroups
    : (rawGroups ? [rawGroups] : ['volunteer']);

  const standardKeys = [];
  const customIds = [];

  for (const gk of selectedGroupKeys) {
    if (typeof gk === 'string' && gk.startsWith('custom_')) {
      const cid = parseInt(gk.replace('custom_', ''), 10);
      if (!isNaN(cid)) customIds.push(cid);
    } else if (typeof gk === 'number') {
      customIds.push(gk);
    } else if (typeof gk === 'string') {
      const k = gk.toLowerCase().trim();
      if (k === 'admin' || k.includes('admin')) {
        if (!standardKeys.includes('admin')) standardKeys.push('admin');
      } else if (k === 'judge' || k.includes('judge')) {
        if (!standardKeys.includes('judge')) standardKeys.push('judge');
      } else if (k === 'volunteer' || k.includes('volunteer')) {
        if (!standardKeys.includes('volunteer')) standardKeys.push('volunteer');
      }
    }
  }

  // Ensure at least one standard group is present for base event membership
  if (standardKeys.length === 0 && customIds.length === 0) {
    standardKeys.push('volunteer');
  }

  // Remove previous assignments
  await query('DELETE FROM user_event_groups WHERE user_id = ? AND event_id = ?', [userId, eventId]);
  await query('DELETE FROM user_event_custom_groups WHERE user_id = ? AND event_id = ?', [userId, eventId]);

  // Insert standard groups
  if (standardKeys.length > 0) {
    const stdGroupRows = await query(
      `SELECT id, group_key FROM \`groups\` WHERE group_key IN (${standardKeys.map(() => '?').join(',')})`,
      standardKeys
    );
    for (const sg of stdGroupRows) {
      await query('INSERT INTO user_event_groups (user_id, event_id, group_id) VALUES (?, ?, ?)', [userId, eventId, sg.id]);
    }
  } else {
    await query('INSERT INTO user_event_groups (user_id, event_id, group_id) VALUES (?, ?, 2)', [userId, eventId]);
  }

  // Insert custom groups
  if (customIds.length > 0) {
    const validCgs = await query(
      `SELECT id FROM event_custom_groups WHERE event_id = ? AND id IN (${customIds.map(() => '?').join(',')})`,
      [eventId, ...customIds]
    );
    for (const cg of validCgs) {
      await query('INSERT INTO user_event_custom_groups (user_id, event_id, custom_group_id) VALUES (?, ?, ?)', [userId, eventId, cg.id]);
    }
  }

  // Clean up any old ad-hoc override group
  const adHocCg = await query('SELECT id FROM event_custom_groups WHERE event_id = ? AND name = ? LIMIT 1', [eventId, `user_${userId}_custom`]);
  if (adHocCg.length > 0) {
    await query('DELETE FROM event_custom_group_permissions WHERE custom_group_id = ?', [adHocCg[0].id]);
    await query('DELETE FROM event_custom_groups WHERE id = ?', [adHocCg[0].id]);
  }
}

/**
 * PUT /api/team/:id
 * Updates team member role and granular permissions.
 */
async function update(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    const eventId = req.headers['x-event-id'] || req.headers['x-edition-id'] || req.headers['x-festival-id'] || 1;
    const { name, email, role, group, groups } = req.body;

    if (email) {
      await query('UPDATE users SET email = ? WHERE id = ?', [email.toLowerCase().trim(), id]);
    }
    if (name) {
      const ind = await query('SELECT id FROM individuals WHERE user_id = ?', [id]);
      if (ind.length > 0) {
        await query('UPDATE individuals SET name = ? WHERE user_id = ?', [name.trim(), id]);
      } else {
        const org = await query('SELECT id FROM organizations WHERE user_id = ?', [id]);
        if (org.length > 0) {
          await query('UPDATE organizations SET name = ? WHERE user_id = ?', [name.trim(), id]);
        } else {
          await query('INSERT INTO individuals (user_id, name) VALUES (?, ?)', [id, name.trim()]);
        }
      }
    }

    const rawGroups = groups !== undefined ? groups : (group || role);
    if (rawGroups !== undefined) {
      await assignUserToGroups(id, eventId, rawGroups);
    }

    res.json({ message: 'Team member updated successfully.' });
  } catch (error) {
    console.error('[TeamController] update error:', error);
    res.status(500).json({ error: 'Failed to update team member.' });
  }
}

/**
 * DELETE /api/team/:id
 */
async function remove(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    const eventId = req.headers['x-event-id'] || req.headers['x-edition-id'] || req.headers['x-festival-id'] || 1;

    // Protection 1: Prevent user from removing themselves
    if (req.user && req.user.id === id) {
      return res.status(400).json({ error: 'You cannot remove yourself from the festival team.' });
    }

    // Protection 2: Prevent removing the festival owner / director
    const ownerRows = await query('SELECT user_id FROM events WHERE event_id = ?', [eventId]);
    if (ownerRows.length > 0 && ownerRows[0].user_id === id) {
      return res.status(400).json({ error: 'The festival owner/director cannot be removed from the team.' });
    }

    // Clean up custom permissions if any
    const customGroupName = `user_${id}_custom`;
    const existingCg = await query(
      'SELECT id FROM event_custom_groups WHERE event_id = ? AND name = ? LIMIT 1',
      [eventId, customGroupName]
    );
    if (existingCg.length > 0) {
      const customGroupId = existingCg[0].id;
      await query('DELETE FROM event_custom_group_permissions WHERE custom_group_id = ?', [customGroupId]);
      await query('DELETE FROM user_event_custom_groups WHERE custom_group_id = ?', [customGroupId]);
      await query('DELETE FROM event_custom_groups WHERE id = ?', [customGroupId]);
    }

    // Remove any user_event_custom_groups links
    await query('DELETE FROM user_event_custom_groups WHERE user_id = ? AND event_id = ?', [id, eventId]);
    await query('DELETE FROM user_event_groups WHERE user_id = ? AND event_id = ?', [id, eventId]);

    res.json({ message: 'Team member removed from festival.' });
  } catch (error) {
    console.error('[TeamController] remove error:', error);
    res.status(500).json({ error: 'Failed to remove team member.' });
  }
}

/**
 * GET /api/team/custom-groups
 * Returns all custom groups created for current festival event.
 */
async function listCustomGroups(req, res) {
  try {
    const eventId = req.headers['x-event-id'] || req.headers['x-edition-id'] || req.headers['x-festival-id'] || req.query.eventId || 1;

    const rows = await query(`
      SELECT 
        ecg.id,
        ecg.name,
        ecg.description,
        ecg.created_at,
        COUNT(DISTINCT uecg.user_id) as member_count
      FROM event_custom_groups ecg
      LEFT JOIN user_event_custom_groups uecg ON uecg.custom_group_id = ecg.id
      WHERE ecg.event_id = ? AND ecg.name NOT LIKE 'user_%_custom'
      GROUP BY ecg.id, ecg.name, ecg.description, ecg.created_at
      ORDER BY ecg.name ASC
    `, [eventId]);

    const customGroups = await Promise.all(rows.map(async cg => {
      const perms = await query(`
        SELECT p.id, p.permission_key as \`key\`, p.label, p.description, p.module_id as moduleId, m.label as module, m.display_order
        FROM event_custom_group_permissions ecgp
        JOIN permissions p ON p.id = ecgp.permission_id
        JOIN modules m ON m.id = p.module_id
        WHERE ecgp.custom_group_id = ?
        ORDER BY m.display_order ASC, p.id ASC
      `, [cg.id]);

      return {
        id: cg.id,
        name: cg.name,
        description: cg.description || '',
        memberCount: parseInt(cg.member_count || 0, 10),
        permissions: perms.map(p => p.key),
        permissionDetails: perms,
        createdAt: cg.created_at
      };
    }));

    res.json({ customGroups });
  } catch (error) {
    console.error('[TeamController] listCustomGroups error:', error);
    res.status(500).json({ error: 'Failed to retrieve custom groups.' });
  }
}

/**
 * POST /api/team/custom-groups
 * Creates a new custom group with modular permissions.
 * Allowed ONLY for Festival Administrator.
 */
async function createCustomGroup(req, res) {
  try {
    const eventId = req.headers['x-event-id'] || req.headers['x-edition-id'] || req.headers['x-festival-id'] || req.query.eventId || 1;
    const { name, description, permissions } = req.body;

    // Security check: ONLY Festival Admin can create custom groups
    const isDirectAdmin = req.user && (
      req.user.isSuperAdmin ||
      req.user.role === 'Admin' ||
      req.user.current_group === 'admin'
    );
    if (!isDirectAdmin) {
      const adminRows = await query(
        'SELECT 1 FROM user_event_groups ueg JOIN `groups` g ON g.id = ueg.group_id WHERE ueg.user_id = ? AND ueg.event_id = ? AND g.group_key = "admin" LIMIT 1',
        [req.user ? req.user.id : 0, eventId]
      );
      if (adminRows.length === 0) {
        return res.status(403).json({ error: 'Only Festival Administrators can create custom groups.' });
      }
    }

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Group name is required.' });
    }

    const trimmedName = name.trim();

    // Prevent using reserved group names
    if (['admin', 'judge', 'volunteer', 'all'].includes(trimmedName.toLowerCase())) {
      return res.status(400).json({ error: `"${trimmedName}" is a reserved group name. Please choose another name.` });
    }

    // Check duplicate name for this event
    const existing = await query(
      'SELECT id FROM event_custom_groups WHERE event_id = ? AND LOWER(name) = ? LIMIT 1',
      [eventId, trimmedName.toLowerCase()]
    );
    if (existing.length > 0) {
      return res.status(400).json({ error: `A group named "${trimmedName}" already exists for this festival.` });
    }

    // Insert into event_custom_groups
    const insRes = await query(
      'INSERT INTO event_custom_groups (event_id, name, description) VALUES (?, ?, ?)',
      [eventId, trimmedName, description ? description.trim() : null]
    );
    const customGroupId = insRes.insertId;

    // Associate modular permissions
    if (Array.isArray(permissions) && permissions.length > 0) {
      for (const item of permissions) {
        let pId = null;
        if (typeof item === 'number') {
          pId = item;
        } else if (typeof item === 'string') {
          const pRows = await query('SELECT id FROM permissions WHERE permission_key = ? LIMIT 1', [item]);
          if (pRows.length > 0) pId = pRows[0].id;
        }
        if (pId) {
          await query(
            'INSERT IGNORE INTO event_custom_group_permissions (custom_group_id, permission_id) VALUES (?, ?)',
            [customGroupId, pId]
          );
        }
      }
    }

    // Fetch created group with full details
    const perms = await query(`
      SELECT p.id, p.permission_key as \`key\`, p.label, p.description, p.module_id as moduleId, m.label as module, m.display_order
      FROM event_custom_group_permissions ecgp
      JOIN permissions p ON p.id = ecgp.permission_id
      JOIN modules m ON m.id = p.module_id
      WHERE ecgp.custom_group_id = ?
      ORDER BY m.display_order ASC, p.id ASC
    `, [customGroupId]);

    res.status(201).json({
      message: `Custom group "${trimmedName}" created successfully.`,
      group: {
        id: customGroupId,
        name: trimmedName,
        description: description ? description.trim() : '',
        memberCount: 0,
        permissions: perms.map(p => p.key),
        permissionDetails: perms,
        createdAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('[TeamController] createCustomGroup error:', error);
    res.status(500).json({ error: 'Failed to create custom group.' });
  }
}

/**
 * DELETE /api/team/custom-groups/:id
 * Removes a custom group and unassigns members.
 * Allowed ONLY for Festival Administrator.
 */
async function deleteCustomGroup(req, res) {
  try {
    const eventId = req.headers['x-event-id'] || req.headers['x-edition-id'] || req.headers['x-festival-id'] || req.query.eventId || 1;
    const customGroupId = parseInt(req.params.id, 10);

    const isDirectAdmin = req.user && (
      req.user.isSuperAdmin ||
      req.user.role === 'Admin' ||
      req.user.current_group === 'admin'
    );
    if (!isDirectAdmin) {
      const adminRows = await query(
        'SELECT 1 FROM user_event_groups ueg JOIN `groups` g ON g.id = ueg.group_id WHERE ueg.user_id = ? AND ueg.event_id = ? AND g.group_key = "admin" LIMIT 1',
        [req.user ? req.user.id : 0, eventId]
      );
      if (adminRows.length === 0) {
        return res.status(403).json({ error: 'Only Festival Administrators can manage custom groups.' });
      }
    }

    const existing = await query(
      'SELECT id, name FROM event_custom_groups WHERE id = ? AND event_id = ? LIMIT 1',
      [customGroupId, eventId]
    );
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Custom group not found.' });
    }

    // Unassign users from this custom group
    await query('DELETE FROM user_event_custom_groups WHERE custom_group_id = ?', [customGroupId]);
    await query('DELETE FROM event_custom_group_permissions WHERE custom_group_id = ?', [customGroupId]);
    await query('DELETE FROM event_custom_groups WHERE id = ?', [customGroupId]);

    res.json({ message: `Custom group "${existing[0].name}" deleted successfully.` });
  } catch (error) {
    console.error('[TeamController] deleteCustomGroup error:', error);
    res.status(500).json({ error: 'Failed to delete custom group.' });
  }
}

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
  searchIndividuals,
  getPermissionsCatalog,
  getMemberPermissions,
  listCustomGroups,
  createCustomGroup,
  deleteCustomGroup
};

