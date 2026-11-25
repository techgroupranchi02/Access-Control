/**
 * Team Controller
 * Real MySQL database queries for festival team members, roles, departments, and seat limits.
 */

const { query } = require('../../config/database');
const { getEventId } = require('../utils/eventId');
const bcrypt = require('bcrypt');
const { resolveHighestScope } = require('../services/scoping.service');
const { formatThumbnailUrl } = require('../utils/media.utils');
const { accountState } = require('../utils/userStatus');
const teamInvites = require('../services/teamInvites.service');
const { assignUserToGroups, InviteError } = teamInvites;
const teamGroups = require('../services/teamGroups.service');
const { GroupError } = teamGroups;

/** The festival from the request (core/utils/eventId.js), or null. Never falls back to a fixed festival. */
const eventIdOf = getEventId;

function sendInviteError(res, err, tag) {
  if (err instanceof InviteError || err instanceof GroupError) {
    const { status, message, code, invitationId } = err;
    return res.status(status).json({ error: message, ...(code ? { code } : {}), ...(invitationId ? { invitationId } : {}) });
  }
  console.error(`[TeamController] ${tag} error:`, err);
  return res.status(500).json({ error: 'Something went wrong. Try again.' });
}

/** Is this user (any account with the same email) a member of the festival team? */
async function isTeamMember(userId, eventId) {
  const rows = await query(
    `SELECT 1 FROM user_event_groups WHERE user_id = ? AND event_id = ?
     UNION SELECT 1 FROM user_event_custom_groups WHERE user_id = ? AND event_id = ? LIMIT 1`,
    [userId, eventId, userId, eventId]
  );
  return rows.length > 0;
}

const GROUP_PERMISSIONS = {
  admin: [
    { key: '*', label: 'All Permissions' },
    { key: 'admin:access', label: 'Admin Access' },
    { key: 'submissions:*', label: 'Submissions Control' },
    { key: 'reviews:*', label: 'Review Pipeline' },
    { key: 'tasks:*', label: 'Task Management' },
    { key: 'payouts:*', label: 'Payouts Control' }
  ],
  jury: [
    { key: 'jury:view_panel', label: 'View Jury Panel' },
    { key: 'jury:score', label: 'Score Submissions' },
    { key: 'jury:submit_decision', label: 'Submit Ballots' },
    { key: 'review:evaluate', label: 'Evaluate Reviews' },
    { key: 'submission:view', label: 'View Submissions' }
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
    JOIN event_custom_groups ecg ON ecg.id = uecg.custom_group_id AND ecg.event_id = uecg.event_id
    WHERE uecg.user_id = ? AND uecg.event_id = ?
    ORDER BY ecg.name ASC
  `, [userId, eventId]);

  // 3. Fetch permissions from assigned standard groups
  const stdPerms = await query(`
    SELECT DISTINCT p.id, p.permission_key as \`key\`, p.label, p.description, p.module_id as moduleId, m.label as module, m.display_order, mgp.scope_key as scopeKey
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
    SELECT DISTINCT p.id, p.permission_key as \`key\`, p.label, p.description, p.module_id as moduleId, m.label as module, m.display_order, ecgp.scope_key as scopeKey
    FROM user_event_custom_groups uecg
    JOIN event_custom_groups ecg_own ON ecg_own.id = uecg.custom_group_id AND ecg_own.event_id = uecg.event_id
         JOIN event_custom_group_permissions ecgp ON ecgp.custom_group_id = uecg.custom_group_id
    JOIN permissions p ON p.id = ecgp.permission_id
    JOIN modules m ON m.id = p.module_id
    WHERE uecg.user_id = ? AND uecg.event_id = ?
    ORDER BY m.display_order ASC, p.id ASC
  `, [userId, eventId]);

  // Union permissions (deduplicate by key, resolving most permissive scope)
  const permMap = new Map();
  for (const p of [...stdPerms, ...customPerms]) {
    const sKey = p.scopeKey || 'all';
    if (!permMap.has(p.key)) {
      permMap.set(p.key, { ...p, scopeKey: sKey });
    } else {
      const existing = permMap.get(p.key);
      const higherScope = resolveHighestScope([existing.scopeKey, sKey]);
      permMap.set(p.key, { ...existing, scopeKey: higherScope });
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
    const eventId = getEventId(req);

    // Fetch all unique users assigned to this festival edition (both organization and individual accounts)
    const rows = await query(`
      SELECT DISTINCT
        u.id, 
        COALESCE(i.name, o.name, u.email) as name, 
        u.email, 
        u.status,
        u.account_type,
        COALESCE(i.thumbnail_pic, o.thumbnail_pic, i.profile_pic, o.profile_pic) as thumbnail_pic
      FROM users u
      LEFT JOIN individuals i ON i.user_id = u.id
      LEFT JOIN organizations o ON o.user_id = u.id
      WHERE u.id IN (
        SELECT user_id FROM user_event_groups WHERE event_id = ?
        UNION
        SELECT user_id FROM user_event_custom_groups WHERE event_id = ?
      )
      ORDER BY (u.account_type = 'organization') DESC, u.email ASC, u.id ASC
    `, [eventId, eventId]);

    const catalog = await getPermissionsCatalog();

    const users = await Promise.all(rows.map(async r => {
      const permData = await getMemberPermissions(r.id, eventId);

      let accessTier = 'General Access';
      if (permData.roleKeys.includes('admin')) accessTier = 'Full Control';
      else if (permData.roleKeys.includes('jury') || permData.roleKeys.includes('judge')) accessTier = 'Jury & Scoring';
      else if (permData.roleKeys.includes('volunteer')) accessTier = 'Assigned Only';

      return {
        id: r.id,
        name: r.name,
        email: r.email,
        accountType: r.account_type || 'individual',
        accountTypeLabel: r.account_type === 'organization' ? 'Organization Account' : 'Individual Account',
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
        isActive: r.status === 1,
        thumbnail: formatThumbnailUrl(r.thumbnail_pic),
        thumbnailPic: formatThumbnailUrl(r.thumbnail_pic),
        thumbnail_pic: formatThumbnailUrl(r.thumbnail_pic)
      };
    }));

    const groupPermRows = await query(`
      SELECT g.group_key, p.permission_key, mgp.scope_key
      FROM \`groups\` g
      JOIN module_groups mg ON mg.group_id = g.id
      JOIN module_groups_permissions mgp ON mgp.module_group_id = mg.id
      JOIN permissions p ON p.id = mgp.permission_id
    `);
    const groupDefaults = { admin: [], jury: [], judge: [], volunteer: [] };
    const groupScopeDefaults = { admin: {}, jury: {}, judge: {}, volunteer: {} };
    for (const gp of groupPermRows) {
      if (groupDefaults[gp.group_key]) {
        groupDefaults[gp.group_key].push(gp.permission_key);
        groupScopeDefaults[gp.group_key][gp.permission_key] = gp.scope_key || 'all';
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
      LEFT JOIN user_event_custom_groups uecg ON uecg.custom_group_id = ecg.id AND uecg.event_id = ecg.event_id
      WHERE ecg.event_id = ? AND ecg.name NOT LIKE 'user_%_custom'
      GROUP BY ecg.id, ecg.name, ecg.description, ecg.created_at
      ORDER BY ecg.name ASC
    `, [eventId]);

    const customGroups = await Promise.all(customGroupsRows.map(async cg => {
      const perms = await query(`
        SELECT p.id, p.permission_key as \`key\`, p.label, p.description, p.module_id as moduleId, m.label as module, m.display_order, ecgp.scope_key as scopeKey
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

    const [invitations, seats] = await Promise.all([
      teamInvites.listPending(eventId),
      teamInvites.seatUsage(eventId)
    ]);

    res.json({
      users,
      invitations,
      catalog,
      groupDefaults,
      groupScopeDefaults,
      customGroups,
      totalCount: users.length,
      // Seats count members and pending invites (an invite holds a seat until it is accepted or cancelled)
      seatsAllocated: seats.used,
      seatLimit: seats.limit,
      links: teamInvites.accountLinks()
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
    const eventId = getEventId(req);

    const rows = await query(`
      SELECT 
        u.id, 
        COALESCE(i.name, o.name, u.email) as name, 
        u.email, 
        u.status,
        u.account_type,
        g.id as group_id,
        g.group_key as role_key,
        g.label as role
      FROM users u
      LEFT JOIN individuals i ON i.user_id = u.id
      LEFT JOIN organizations o ON o.user_id = u.id
      LEFT JOIN user_event_groups ueg ON ueg.user_id = u.id AND ueg.event_id = ?
      LEFT JOIN \`groups\` g ON g.id = ueg.group_id
      WHERE u.id = ?
      GROUP BY u.id, i.name, o.name, u.email, u.status, u.account_type, g.id, g.group_key, g.label
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
      accountType: r.account_type || 'individual',
      accountTypeLabel: r.account_type === 'organization' ? 'Organization Account' : 'Individual Account',
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
 * Search registered users (both individual filmmakers and organizations) for adding to team.
 */
async function searchIndividuals(req, res) {
  try {
    const eventId = eventIdOf(req);
    if (!eventId) return res.status(400).json({ error: 'Choose a festival first.' });
    const q = (req.query.q || '').trim();
    const links = teamInvites.accountLinks();

    if (!q || q.length < 2) {
      return res.json({ users: [], links });
    }

    const pattern = `%${q}%`;
    const prefix = `${q}%`;

    // Every account except deleted ones: unverified, onboarding and deactivated accounts are shown with their
    // state so staff know why one can't be added (docs/adr/0008-team-invitations.md)
    const rows = await query(`
      SELECT 
        u.id as user_id,
        u.email,
        u.status,
        u.account_type,
        COALESCE(i.name, o.name, u.email) as name,
        COALESCE(i.username, o.username, '') as username,
        COALESCE(i.image_name, o.image_name, '') as image_name,
        COALESCE(i.thumbnail_pic, o.thumbnail_pic, i.profile_pic, o.profile_pic) as thumbnail_pic,
        EXISTS(
          SELECT 1 FROM user_event_groups ueg WHERE ueg.user_id = u.id AND ueg.event_id = ?
          UNION SELECT 1 FROM user_event_custom_groups uecg WHERE uecg.user_id = u.id AND uecg.event_id = ?
        ) as is_already_member
      FROM users u
      LEFT JOIN individuals i ON i.user_id = u.id
      LEFT JOIN organizations o ON o.user_id = u.id
      WHERE 
        (
          COALESCE(i.name, o.name) LIKE ? 
          OR u.email LIKE ? 
          OR COALESCE(i.username, o.username) LIKE ?
        )
      ORDER BY 
        CASE 
          WHEN u.email = ? THEN 0
          WHEN COALESCE(i.name, o.name) LIKE ? THEN 1
          WHEN u.email LIKE ? THEN 2
          ELSE 3 
        END,
        (u.status = 1 OR u.status IS NULL) DESC,
        (u.account_type = 'organization') DESC,
        u.id ASC
      LIMIT 30
    `, [eventId, eventId, pattern, pattern, pattern, q.toLowerCase(), prefix, prefix]);

    const users = rows.map(r => {
      const state = accountState(r.status);
      return {
        userId: r.user_id,
        name: r.name || 'Unnamed User',
        email: r.email,
        username: r.username,
        imageName: r.image_name,
        accountType: r.account_type || 'individual',
        accountTypeLabel: r.account_type === 'organization' ? 'Organization Account' : 'Individual Account',
        // active / onboarding can sign in now; unverified gets an invite; deactivated can't be added
        accountState: state,
        isAlreadyMember: Boolean(r.is_already_member),
        thumbnail: formatThumbnailUrl(r.thumbnail_pic),
        thumbnailPic: formatThumbnailUrl(r.thumbnail_pic),
        thumbnail_pic: formatThumbnailUrl(r.thumbnail_pic)
      };
    });

    // An unverified duplicate of an email that already has a working account can't be invited: hide it
    const usableEmails = new Set(users.filter(u => u.accountState === 'active' || u.accountState === 'onboarding').map(u => (u.email || '').toLowerCase()));
    for (let i = users.length - 1; i >= 0; i--) {
      if (users[i].accountState === 'unverified' && usableEmails.has((users[i].email || '').toLowerCase())) users.splice(i, 1);
    }

    // When the query is an email, say whether it can be invited
    const email = teamInvites.normalizeEmail(q);
    let invite = null;
    if (teamInvites.isValidEmail(email)) {
      const [pending] = await query("SELECT id FROM team_invitations WHERE event_id = ? AND email = ? AND status = 'pending' LIMIT 1", [eventId, email]);
      const exact = users.filter(u => (u.email || '').toLowerCase() === email);
      const state = exact.length ? await teamInvites.accountStateForEmail(email) : 'none';
      invite = {
        email,
        accountState: state,
        alreadyInvited: Boolean(pending),
        invitationId: pending?.id || null,
        canInvite: !pending && (state === 'none' || state === 'unverified')
      };
    }

    res.json({ users, links, invite });
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
    } else if (typeof targetRole === 'string' && targetRole !== 'admin' && targetRole !== 'jury' && targetRole !== 'judge' && targetRole !== 'volunteer') {
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
      let scopeKey = 'all';
      if (typeof item === 'number') {
        pId = item;
      } else if (typeof item === 'string') {
        const pRows = await query('SELECT id FROM permissions WHERE permission_key = ? LIMIT 1', [item]);
        if (pRows.length > 0) pId = pRows[0].id;
      } else if (typeof item === 'object' && item !== null) {
        if (item.id) pId = item.id;
        else if (item.key) {
          const pRows = await query('SELECT id FROM permissions WHERE permission_key = ? LIMIT 1', [item.key]);
          if (pRows.length > 0) pId = pRows[0].id;
        }
        if (item.scopeKey || item.scope_key) {
          scopeKey = item.scopeKey || item.scope_key;
        }
      }
      if (pId) {
        await query(
          'INSERT INTO event_custom_group_permissions (custom_group_id, permission_id, scope_key) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE scope_key = VALUES(scope_key)',
          [customGroupId, pId, scopeKey]
        );
      }
    }
  }
}

/**
 * POST /api/team
 * Adds an existing Freecomers account to the festival team and emails them, or, for an email with no usable
 * account, creates a pending invitation and emails sign-up steps (docs/adr/0008-team-invitations.md).
 */
async function create(req, res) {
  try {
    const eventId = eventIdOf(req);
    if (!eventId) return res.status(400).json({ error: 'Choose a festival first.' });
    const { userId, email, accountType } = req.body;
    const rawGroups = req.body.groups || req.body.group || req.body.role || 'volunteer';
    // Only festival Admins may give the Admin group or a group that can manage the team / settings
    try {
      await teamGroups.assertCanGrant(req, eventId, await teamInvites.normalizeGroups(eventId, rawGroups));
    } catch (err) {
      return sendInviteError(res, err, 'create');
    }

    let targetUserId = userId;

    // If userId was not passed, attempt lookup by email in users table
    if (!targetUserId && email) {
      const lookupParams = [teamInvites.normalizeEmail(email)];
      let sql = 'SELECT u.id, u.account_type, u.status FROM users u WHERE u.email = ?';
      if (accountType) {
        sql += ' AND u.account_type = ?';
        lookupParams.push(accountType);
      }
      sql += ' ORDER BY (u.status = 1) DESC, (u.status = 2) DESC, (u.account_type = "organization") DESC LIMIT 1';
      const lookup = await query(sql, lookupParams);

      // Only an account that can sign in is added directly; anything else becomes an invitation
      const state = lookup.length ? accountState(lookup[0].status) : 'none';
      if (state === 'active' || state === 'onboarding') {
        targetUserId = lookup[0].id;
      } else if (req.body.invite) {
        try {
          const result = await teamInvites.createInvitation({ eventId, email, groups: rawGroups, req });
          return res.status(201).json({ message: 'Invitation saved.', ...result });
        } catch (err) {
          return sendInviteError(res, err, 'invite');
        }
      }
    }

    if (!targetUserId) {
      return res.status(400).json({ 
        error: 'Please select a valid user from the Freecomers platform.' 
      });
    }

    // Verify user exists in users table (either individual or organization)
    const userRows = await query(`
      SELECT u.id, u.email, u.account_type, u.status,
             COALESCE(i.name, o.name, u.email) as name,
             COALESCE(i.username, o.username, '') as username,
             COALESCE(i.image_name, o.image_name, '') as image_name
      FROM users u
      LEFT JOIN individuals i ON i.user_id = u.id
      LEFT JOIN organizations o ON o.user_id = u.id
      WHERE u.id = ?
      LIMIT 1
    `, [targetUserId]);

    if (userRows.length === 0) {
      return res.status(400).json({ 
        error: 'Selected user was not found on Freecomers.' 
      });
    }

    const targetUser = userRows[0];
    const state = accountState(targetUser.status);
    if (state === 'deactivated') {
      return res.status(400).json({ error: 'This Freecomers account is deactivated. Ask Freecomers support to reactivate it first.' });
    }
    if (state === 'unverified') {
      // Can't sign in until the email is verified: invite instead, claimed at their first login
      try {
        const result = await teamInvites.createInvitation({ eventId, email: targetUser.email, groups: rawGroups, req });
        return res.status(201).json({ message: 'Invitation saved.', ...result });
      } catch (err) {
        return sendInviteError(res, err, 'invite');
      }
    }

    // Check if user is already assigned to this festival edition
    if (await isTeamMember(targetUserId, eventId)) {
      const typeLabel = targetUser.account_type === 'organization' ? 'Organization Account' : 'Individual Account';
      return res.status(400).json({ 
        error: `${targetUser.name || targetUser.email} (${typeLabel}) is already a member of this festival edition team.` 
      });
    }

    // Seat limit (members + pending invites; set per festival in the SaaS console)
    const usage = await teamInvites.seatUsage(eventId);
    const ownInvite = await query("SELECT id FROM team_invitations WHERE event_id = ? AND email = ? AND status = 'pending' AND expires_at > NOW() LIMIT 1", [eventId, teamInvites.normalizeEmail(targetUser.email)]);
    // A pending invite for this same email already holds the seat
    if (usage.used - (ownInvite.length ? 1 : 0) >= usage.limit) {
      return res.status(403).json({ error: `All ${usage.limit} team seats are in use (pending invites count too). Remove a member or cancel an invite first.` });
    }

    // Assign user to multiple groups (standard and/or custom)
    const assigned = await assignUserToGroups(targetUserId, eventId, rawGroups);
    await teamInvites.markAcceptedForEmail(eventId, targetUser.email, targetUserId);

    const permData = await getMemberPermissions(targetUserId, eventId);
    const emailResult = req.body.notify === false
      ? { sent: false, reason: 'Not requested.' }
      : await teamInvites.sendAddedEmail({ eventId, email: targetUser.email, groups: assigned, req });

    res.status(201).json({
      message: 'Team member added successfully.',
      email: emailResult,
      member: {
        id: targetUserId,
        name: targetUser.name || targetUser.email,
        email: targetUser.email,
        accountType: targetUser.account_type || 'individual',
        accountTypeLabel: targetUser.account_type === 'organization' ? 'Organization Account' : 'Individual Account',
        groups: permData.groups,
        roles: permData.roles,
        roleKeys: permData.roleKeys,
        role: permData.groupDisplay,
        group: permData.groupDisplay,
        roleKey: permData.primaryRoleKey,
        groupId: permData.groups[0]?.id || null,
        permissions: permData.permissions,
        hasCustomPermissions: permData.hasCustomPermissions
      }
    });
  } catch (error) {
    console.error('[TeamController] create error:', error);
    res.status(500).json({ error: 'Failed to add team member.' });
  }
}

/**
 * PUT /api/team/:id
 * Updates team member role and granular permissions.
 */
async function update(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    const eventId = eventIdOf(req);
    if (!eventId) return res.status(400).json({ error: 'Choose a festival first.' });
    if (!Number.isInteger(id) || !(await isTeamMember(id, eventId))) {
      return res.status(404).json({ error: 'Team member not found in this festival.' });
    }
    // Name and email belong to the person's Freecomers account (shared users table): FestiPlus only changes
    // their festival groups here.
    const { role, group, groups } = req.body;

    const rawGroups = groups !== undefined ? groups : (group || role);
    if (rawGroups !== undefined) {
      try {
        await teamGroups.assertCanGrant(req, eventId, await teamInvites.normalizeGroups(eventId, rawGroups));
      } catch (err) {
        return sendInviteError(res, err, 'update');
      }
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
    const eventId = eventIdOf(req);
    if (!eventId) return res.status(400).json({ error: 'Choose a festival first.' });
    if (!Number.isInteger(id) || !(await isTeamMember(id, eventId))) {
      return res.status(404).json({ error: 'Team member not found in this festival.' });
    }

    // Protection 1: Prevent user from removing their active logged-in account
    if (req.user && req.user.id === id) {
      return res.status(400).json({ error: 'You cannot remove your active logged-in account from the festival team.' });
    }

    // Protection 2: Prevent removing the festival owner / director
    const ownerRows = await query('SELECT user_id FROM events WHERE event_id = ?', [eventId]);
    if (ownerRows.length > 0 && ownerRows[0].user_id === id) {
      return res.status(400).json({ error: 'The festival owner organization account cannot be removed from the team.' });
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

// ── Group Config (docs/adr/0009-team-group-config.md) ───────────────────────
// Custom groups belong to one festival: every handler is scoped by the festival header and never falls back.

function withFestival(handler, tag) {
  return async (req, res) => {
    try {
      const eventId = eventIdOf(req);
      if (!eventId) return res.status(400).json({ error: 'Choose a festival first.' });
      await handler(req, res, eventId);
    } catch (err) {
      sendInviteError(res, err, tag);
    }
  };
}

/** GET /api/team/groups: default groups (read-only) and this festival's custom groups */
const groupsOverview = withFestival(async (req, res, eventId) => {
  res.json(await teamGroups.overview(req, eventId));
}, 'groupsOverview');

/** GET /api/team/custom-groups (kept for older callers) */
const listCustomGroups = withFestival(async (req, res, eventId) => {
  res.json({ customGroups: await teamGroups.listCustomGroups(eventId) });
}, 'listCustomGroups');

/** GET /api/team/custom-groups/:id */
const getCustomGroup = withFestival(async (req, res, eventId) => {
  res.json({ group: await teamGroups.getCustomGroup(eventId, req.params.id) });
}, 'getCustomGroup');

/** POST /api/team/custom-groups  { name, description, permissions: [{ key, scopeKey }] } (festival Admins) */
const createCustomGroup = withFestival(async (req, res, eventId) => {
  const group = await teamGroups.createGroup(req, eventId, req.body);
  res.status(201).json({ message: `Custom group "${group.name}" created.`, group });
}, 'createCustomGroup');

/** PUT /api/team/custom-groups/:id  { name, description, permissions, expectedUpdatedAt } (festival Admins) */
const updateCustomGroup = withFestival(async (req, res, eventId) => {
  const group = await teamGroups.updateGroup(req, eventId, req.params.id, req.body);
  res.json({ message: `Custom group "${group.name}" saved.`, group });
}, 'updateCustomGroup');

/** GET /api/team/custom-groups/:id/usage: members and pending invites a delete would affect */
const customGroupUsage = withFestival(async (req, res, eventId) => {
  res.json(await teamGroups.groupUsage(eventId, req.params.id));
}, 'customGroupUsage');

/** DELETE /api/team/custom-groups/:id (festival Admins). Members keep their default groups. */
const deleteCustomGroup = withFestival(async (req, res, eventId) => {
  const usage = await teamGroups.deleteGroup(req, eventId, req.params.id);
  res.json({ message: `Custom group "${usage.name}" deleted.`, ...usage });
}, 'deleteCustomGroup');

// ── Invitations (docs/adr/0008-team-invitations.md) ─────────────────────────

/** GET /api/team/invitations */
async function listInvitations(req, res) {
  try {
    const eventId = eventIdOf(req);
    if (!eventId) return res.status(400).json({ error: 'Choose a festival first.' });
    res.json({ invitations: await teamInvites.listPending(eventId), seats: await teamInvites.seatUsage(eventId) });
  } catch (err) {
    sendInviteError(res, err, 'listInvitations');
  }
}

/** POST /api/team/invitations/:id/resend */
async function resendInvitation(req, res) {
  try {
    const eventId = eventIdOf(req);
    if (!eventId) return res.status(400).json({ error: 'Choose a festival first.' });
    res.json(await teamInvites.resendInvitation({ eventId, id: parseInt(req.params.id, 10), req }));
  } catch (err) {
    sendInviteError(res, err, 'resendInvitation');
  }
}

/** PUT /api/team/invitations/:id  { groups } */
async function updateInvitation(req, res) {
  try {
    const eventId = eventIdOf(req);
    if (!eventId) return res.status(400).json({ error: 'Choose a festival first.' });
    await teamGroups.assertCanGrant(req, eventId, await teamInvites.normalizeGroups(eventId, req.body.groups));
    const invitation = await teamInvites.updateInvitationGroups({ eventId, id: parseInt(req.params.id, 10), groups: req.body.groups });
    res.json({ invitation });
  } catch (err) {
    sendInviteError(res, err, 'updateInvitation');
  }
}

/** DELETE /api/team/invitations/:id */
async function revokeInvitation(req, res) {
  try {
    const eventId = eventIdOf(req);
    if (!eventId) return res.status(400).json({ error: 'Choose a festival first.' });
    await teamInvites.revokeInvitation({ eventId, id: parseInt(req.params.id, 10) });
    res.json({ message: 'Invitation cancelled.' });
  } catch (err) {
    sendInviteError(res, err, 'revokeInvitation');
  }
}

/** GET /api/team/invitations/:id/text: the invite as plain text, to share another way */
async function invitationText(req, res) {
  try {
    const eventId = eventIdOf(req);
    if (!eventId) return res.status(400).json({ error: 'Choose a festival first.' });
    const invitation = (await teamInvites.listPending(eventId)).find((i) => i.id === parseInt(req.params.id, 10));
    if (!invitation) return res.status(404).json({ error: 'Invitation not found.' });
    res.json({ text: await teamInvites.inviteText(eventId, invitation) });
  } catch (err) {
    sendInviteError(res, err, 'invitationText');
  }
}

module.exports = {
  list,
  listInvitations,
  resendInvitation,
  updateInvitation,
  revokeInvitation,
  invitationText,
  getById,
  create,
  update,
  remove,
  searchIndividuals,
  getPermissionsCatalog,
  getMemberPermissions,
  groupsOverview,
  listCustomGroups,
  getCustomGroup,
  createCustomGroup,
  updateCustomGroup,
  customGroupUsage,
  deleteCustomGroup
};



