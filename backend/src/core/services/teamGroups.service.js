/**
 * Team › Group Config (docs/adr/0009-team-group-config.md).
 *
 * Default groups (Admin, Jury, Volunteer) are the same for every festival: their grants live in
 * module_groups_permissions and are rebuilt from the spec on every migrate, so they are read-only here.
 * Custom groups belong to one festival (event_custom_groups.event_id); every query is scoped by it, and a
 * group id from another festival is "not found". Hidden per-user groups (`user_<id>_custom`) never show.
 */

const { query, getConnection } = require('../../config/database');
const { actorUserId, actorAdminId, FREECOMERS_ADMIN_LABEL } = require('../utils/actor');
const { canSignInSql } = require('../utils/userStatus');

const DEFAULT_GROUP_KEYS = ['admin', 'jury', 'volunteer'];
const RESERVED_NAMES = ['admin', 'administrator', 'jury', 'judge', 'volunteer', 'all'];
const HIDDEN_NAME_RE = /^user_\d+_custom$/i;
const NAME_MIN = 2;
const NAME_MAX = 60;
const DESCRIPTION_MAX = 300;
/** Scope keys, widest first (scoping.service.js SCOPE_HIERARCHY). */
const SCOPES = ['all', 'jury_panel', 'assigned'];
/** Permissions that let someone change who has access. Only festival Admins may hand these out. */
const SENSITIVE_PERMISSIONS = ['team:manage', 'settings:manage'];
const HIDDEN_SQL = "name NOT LIKE 'user\\_%\\_custom'";

class GroupError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    Object.assign(this, extra);
  }
}

// ── Who may manage ───────────────────────────────────────────────────────────

/**
 * Festival Admin for this festival: a Freecomers admin, the festival owner, or a member of the Admin group
 * (under any account with the same email).
 */
async function isFestivalAdmin(req, eventId) {
  if (!req?.user) return false;
  if (req.user.isFreecomersAdmin || req.user.isSuperAdmin) return true;
  let ids = (req.user.userIds && req.user.userIds.length ? req.user.userIds : [req.user.id]).filter(Boolean);
  if (req.user.email) {
    const linked = await query(`SELECT id FROM users WHERE email = ? AND ${canSignInSql()}`, [req.user.email]);
    if (linked.length) ids = linked.map((r) => r.id);
  }
  if (!ids.length) return false;
  const ph = ids.map(() => '?').join(',');
  const rows = await query(
    `SELECT 1 FROM events WHERE event_id = ? AND user_id IN (${ph})
     UNION SELECT 1 FROM user_event_groups ueg JOIN \`groups\` g ON g.id = ueg.group_id
       WHERE ueg.event_id = ? AND g.group_key = 'admin' AND ueg.user_id IN (${ph})
     LIMIT 1`,
    [eventId, ...ids, eventId, ...ids]
  );
  return rows.length > 0;
}

async function assertFestivalAdmin(req, eventId) {
  if (!(await isFestivalAdmin(req, eventId))) {
    throw new GroupError(403, 'Only festival Admins can change groups.');
  }
}

/**
 * Only festival Admins may give someone the Admin group, or a custom group that includes a sensitive
 * permission (team or settings management). Others could otherwise grant themselves more access.
 * @param {string[]} groupKeys normalised keys: admin | jury | volunteer | custom_<id>
 */
async function assertCanGrant(req, eventId, groupKeys) {
  if (await isFestivalAdmin(req, eventId)) return;
  if (groupKeys.includes('admin')) {
    throw new GroupError(403, 'Only festival Admins can give someone the Admin group.');
  }
  const customIds = groupKeys.filter((k) => k.startsWith('custom_')).map((k) => parseInt(k.slice(7), 10));
  if (!customIds.length) return;
  const rows = await query(
    `SELECT DISTINCT ecg.name FROM event_custom_groups ecg
     JOIN event_custom_group_permissions ecgp ON ecgp.custom_group_id = ecg.id
     JOIN permissions p ON p.id = ecgp.permission_id
     WHERE ecg.event_id = ? AND ecg.id IN (${customIds.map(() => '?').join(',')})
       AND p.permission_key IN (${SENSITIVE_PERMISSIONS.map(() => '?').join(',')})`,
    [eventId, ...customIds, ...SENSITIVE_PERMISSIONS]
  );
  if (rows.length) {
    throw new GroupError(403, `Only festival Admins can give someone the "${rows[0].name}" group, because it can manage the team or settings.`);
  }
}

// ── Reading ──────────────────────────────────────────────────────────────────

const PERM_COLUMNS = 'p.id, p.permission_key AS `key`, p.label, p.description, p.module_id AS moduleId, m.module_key AS moduleKey, m.label AS module, m.display_order';

async function memberNames(userIds) {
  if (!userIds.length) return new Map();
  const rows = await query(
    `SELECT u.id, COALESCE(NULLIF(TRIM(i.name), ''), NULLIF(TRIM(o.name), ''), u.email) AS name, u.email
     FROM users u LEFT JOIN individuals i ON i.user_id = u.id LEFT JOIN organizations o ON o.user_id = u.id
     WHERE u.id IN (${userIds.map(() => '?').join(',')})`,
    userIds
  );
  return new Map(rows.map((r) => [r.id, { id: r.id, name: r.name, email: r.email }]));
}

async function updatedByLabel(row) {
  if (row.updated_by_admin_id) return FREECOMERS_ADMIN_LABEL;
  if (!row.updated_by_user_id) return null;
  const m = await memberNames([row.updated_by_user_id]);
  return m.get(row.updated_by_user_id)?.name || null;
}

/** Pending invites (any festival group key in groups_json) using this custom group. */
async function invitesUsing(eventId, customGroupId) {
  const rows = await query("SELECT id, email, groups_json FROM team_invitations WHERE event_id = ? AND status = 'pending'", [eventId]);
  const key = `custom_${customGroupId}`;
  return rows.filter((r) => {
    const g = typeof r.groups_json === 'string' ? JSON.parse(r.groups_json || '[]') : (r.groups_json || []);
    return Array.isArray(g) && g.includes(key);
  });
}

async function shapeCustomGroup(eventId, row) {
  const perms = await query(
    `SELECT ${PERM_COLUMNS}, ecgp.scope_key AS scopeKey
     FROM event_custom_group_permissions ecgp
     JOIN permissions p ON p.id = ecgp.permission_id
     JOIN modules m ON m.id = p.module_id
     WHERE ecgp.custom_group_id = ?
     ORDER BY m.display_order ASC, p.id ASC`,
    [row.id]
  );
  const memberRows = await query('SELECT DISTINCT user_id FROM user_event_custom_groups WHERE custom_group_id = ? AND event_id = ?', [row.id, eventId]);
  const names = await memberNames(memberRows.map((r) => r.user_id));
  const members = memberRows.map((r) => names.get(r.user_id)).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
  const invites = await invitesUsing(eventId, row.id);
  return {
    id: row.id,
    key: `custom_${row.id}`,
    name: row.name,
    description: row.description || '',
    permissions: perms.map((p) => p.key),
    scopes: Object.fromEntries(perms.map((p) => [p.key, p.scopeKey || 'all'])),
    permissionDetails: perms,
    memberCount: members.length,
    members,
    inviteCount: invites.length,
    createdAt: row.created_at,
    updatedAt: row.updated_at || null,
    updatedBy: await updatedByLabel(row)
  };
}

async function loadCustomRow(eventId, id) {
  const n = parseInt(id, 10);
  if (!Number.isInteger(n)) throw new GroupError(404, 'Group not found in this festival.');
  const rows = await query(`SELECT * FROM event_custom_groups WHERE id = ? AND event_id = ? AND ${HIDDEN_SQL} LIMIT 1`, [n, eventId]);
  if (!rows.length) throw new GroupError(404, 'Group not found in this festival.');
  return rows[0];
}

async function getCustomGroup(eventId, id) {
  return shapeCustomGroup(eventId, await loadCustomRow(eventId, id));
}

async function listCustomGroups(eventId) {
  const rows = await query(`SELECT * FROM event_custom_groups WHERE event_id = ? AND ${HIDDEN_SQL} ORDER BY name ASC`, [eventId]);
  const out = [];
  for (const r of rows) out.push(await shapeCustomGroup(eventId, r));
  return out;
}

/** Admin, Jury, Volunteer with their permissions (read-only) and this festival's members in each. */
async function listDefaultGroups(eventId) {
  const groups = await query(
    `SELECT id, group_key, label, description FROM \`groups\` WHERE group_key IN (${DEFAULT_GROUP_KEYS.map(() => '?').join(',')})`,
    DEFAULT_GROUP_KEYS
  );
  const out = [];
  for (const key of DEFAULT_GROUP_KEYS) {
    const g = groups.find((x) => x.group_key === key);
    if (!g) continue;
    const perms = await query(
      `SELECT DISTINCT ${PERM_COLUMNS}, mgp.scope_key AS scopeKey
       FROM module_groups mg
       JOIN module_groups_permissions mgp ON mgp.module_group_id = mg.id
       JOIN permissions p ON p.id = mgp.permission_id
       JOIN modules m ON m.id = p.module_id
       WHERE mg.group_id = ?
       ORDER BY m.display_order ASC, p.id ASC`,
      [g.id]
    );
    const memberRows = await query('SELECT DISTINCT user_id FROM user_event_groups WHERE group_id = ? AND event_id = ?', [g.id, eventId]);
    const names = await memberNames(memberRows.map((r) => r.user_id));
    const members = memberRows.map((r) => names.get(r.user_id)).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
    out.push({
      key,
      name: g.label || key,
      description: g.description || '',
      permissions: perms.map((p) => p.key),
      scopes: Object.fromEntries(perms.map((p) => [p.key, p.scopeKey || 'all'])),
      permissionDetails: perms,
      memberCount: members.length,
      members,
      readOnly: true
    });
  }
  return out;
}

async function enabledModules(eventId) {
  const rows = await query('SELECT m.module_key FROM events_modules em JOIN modules m ON m.id = em.module_id WHERE em.event_id = ?', [eventId]);
  return rows.map((r) => r.module_key);
}

/** Everything Group Config shows, for the current festival. */
async function overview(req, eventId) {
  const [defaultGroups, customGroups, modules, canManage] = await Promise.all([
    listDefaultGroups(eventId),
    listCustomGroups(eventId),
    enabledModules(eventId),
    isFestivalAdmin(req, eventId)
  ]);
  return {
    defaultGroups,
    customGroups,
    enabledModules: modules,
    sensitivePermissions: SENSITIVE_PERMISSIONS,
    scopes: SCOPES,
    canManage,
    limits: { nameMin: NAME_MIN, nameMax: NAME_MAX, descriptionMax: DESCRIPTION_MAX }
  };
}

// ── Writing ──────────────────────────────────────────────────────────────────

/**
 * Check and normalise a custom group's name, description and permissions. Unknown permission keys and
 * scopes are refused (400). Permissions arrive as keys (string) or { key, scopeKey }.
 */
async function validateGroupInput(eventId, body, { excludeId = null } = {}) {
  const name = String(body?.name ?? '').replace(/\s+/g, ' ').trim();
  if (name.length < NAME_MIN || name.length > NAME_MAX) throw new GroupError(400, `The group name must be ${NAME_MIN}–${NAME_MAX} characters.`);
  if (RESERVED_NAMES.includes(name.toLowerCase())) throw new GroupError(400, `"${name}" is the name of a default group. Choose another name.`);
  if (HIDDEN_NAME_RE.test(name)) throw new GroupError(400, 'Choose another name.');
  const dup = await query(
    `SELECT id FROM event_custom_groups WHERE event_id = ? AND LOWER(name) = ?${excludeId ? ' AND id <> ?' : ''} LIMIT 1`,
    excludeId ? [eventId, name.toLowerCase(), excludeId] : [eventId, name.toLowerCase()]
  );
  if (dup.length) throw new GroupError(409, `This festival already has a group named "${name}".`);

  const description = String(body?.description ?? '').trim();
  if (description.length > DESCRIPTION_MAX) throw new GroupError(400, `The description can be at most ${DESCRIPTION_MAX} characters.`);

  const list = Array.isArray(body?.permissions) ? body.permissions : [];
  const wanted = new Map();
  for (const item of list) {
    const key = typeof item === 'string' ? item : (item && typeof item === 'object' ? (item.key || item.permission_key) : null);
    if (!key || typeof key !== 'string') throw new GroupError(400, 'Each permission must be given by its key.');
    const scope = (item && typeof item === 'object' && (item.scopeKey || item.scope_key)) || 'all';
    if (!SCOPES.includes(scope)) throw new GroupError(400, `Unknown access level "${scope}" for ${key}.`);
    wanted.set(key, scope);
  }
  if (!wanted.size) throw new GroupError(400, 'Tick at least one permission.');
  const keys = [...wanted.keys()];
  const known = await query(`SELECT id, permission_key FROM permissions WHERE permission_key IN (${keys.map(() => '?').join(',')})`, keys);
  const idByKey = new Map(known.map((r) => [r.permission_key, r.id]));
  const unknown = keys.filter((k) => !idByKey.has(k));
  if (unknown.length) throw new GroupError(400, `Unknown permission: ${unknown.join(', ')}.`);
  return { name, description, permissions: keys.map((k) => ({ id: idByKey.get(k), key: k, scope: wanted.get(k) })) };
}

async function writePermissions(conn, groupId, permissions) {
  await conn.execute('DELETE FROM event_custom_group_permissions WHERE custom_group_id = ?', [groupId]);
  for (const p of permissions) {
    await conn.execute('INSERT INTO event_custom_group_permissions (custom_group_id, permission_id, scope_key) VALUES (?, ?, ?)', [groupId, p.id, p.scope]);
  }
}

async function inTransaction(fn) {
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    const out = await fn(conn);
    await conn.commit();
    return out;
  } catch (err) {
    try { await conn.rollback(); } catch { /* ignore */ }
    throw err;
  } finally {
    conn.release();
  }
}

async function createGroup(req, eventId, body) {
  await assertFestivalAdmin(req, eventId);
  const input = await validateGroupInput(eventId, body);
  const id = await inTransaction(async (conn) => {
    const [ins] = await conn.execute(
      'INSERT INTO event_custom_groups (event_id, name, description, updated_at, updated_by_user_id, updated_by_admin_id) VALUES (?, ?, ?, NOW(), ?, ?)',
      [eventId, input.name, input.description || null, actorUserId(req), actorAdminId(req)]
    );
    await writePermissions(conn, ins.insertId, input.permissions);
    return ins.insertId;
  });
  console.log(`[TeamGroups] Created custom group ${id} "${input.name}" in event ${eventId} (${input.permissions.length} permissions)`);
  return getCustomGroup(eventId, id);
}

const sameInstant = (a, b) => {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) < 1000;
};

async function updateGroup(req, eventId, id, body) {
  await assertFestivalAdmin(req, eventId);
  const row = await loadCustomRow(eventId, id);
  // Refuse a save made from an older copy (someone else saved in between)
  if (body && Object.prototype.hasOwnProperty.call(body, 'expectedUpdatedAt') && !sameInstant(body.expectedUpdatedAt, row.updated_at)) {
    throw new GroupError(409, 'Someone else changed this group while you were editing. Reload to see their changes.', { code: 'stale' });
  }
  const input = await validateGroupInput(eventId, body, { excludeId: row.id });
  await inTransaction(async (conn) => {
    await conn.execute(
      'UPDATE event_custom_groups SET name = ?, description = ?, updated_at = NOW(), updated_by_user_id = ?, updated_by_admin_id = ? WHERE id = ? AND event_id = ?',
      [input.name, input.description || null, actorUserId(req), actorAdminId(req), row.id, eventId]
    );
    await writePermissions(conn, row.id, input.permissions);
  });
  console.log(`[TeamGroups] Updated custom group ${row.id} "${input.name}" in event ${eventId} (${input.permissions.length} permissions)`);
  return getCustomGroup(eventId, row.id);
}

/** Who a delete would affect. */
async function groupUsage(eventId, id) {
  const group = await getCustomGroup(eventId, id);
  const invites = await invitesUsing(eventId, group.id);
  return { id: group.id, name: group.name, members: group.members, invites: invites.map((i) => ({ id: i.id, email: i.email })) };
}

async function deleteGroup(req, eventId, id) {
  await assertFestivalAdmin(req, eventId);
  const usage = await groupUsage(eventId, id);
  const key = `custom_${usage.id}`;
  const volunteer = await query("SELECT id FROM `groups` WHERE group_key = 'volunteer' LIMIT 1");
  await inTransaction(async (conn) => {
    const [members] = await conn.execute('SELECT DISTINCT user_id FROM user_event_custom_groups WHERE custom_group_id = ? AND event_id = ?', [usage.id, eventId]);
    await conn.execute('DELETE FROM user_event_custom_groups WHERE custom_group_id = ?', [usage.id]);
    await conn.execute('DELETE FROM event_custom_group_permissions WHERE custom_group_id = ?', [usage.id]);
    await conn.execute('DELETE FROM event_custom_groups WHERE id = ? AND event_id = ?', [usage.id, eventId]);
    // Members keep festival access: anyone left without a default group becomes a Volunteer
    for (const m of members) {
      const [std] = await conn.execute('SELECT 1 FROM user_event_groups WHERE user_id = ? AND event_id = ? LIMIT 1', [m.user_id, eventId]);
      if (!std.length && volunteer.length) {
        await conn.execute('INSERT IGNORE INTO user_event_groups (user_id, event_id, group_id) VALUES (?, ?, ?)', [m.user_id, eventId, volunteer[0].id]);
      }
    }
    // Pending invites lose the group; an invite left with nothing becomes Volunteer
    for (const inv of usage.invites) {
      const [rows] = await conn.execute('SELECT groups_json FROM team_invitations WHERE id = ?', [inv.id]);
      const raw = rows[0]?.groups_json;
      const groups = (typeof raw === 'string' ? JSON.parse(raw || '[]') : (raw || [])).filter((g) => g !== key);
      await conn.execute('UPDATE team_invitations SET groups_json = ? WHERE id = ?', [JSON.stringify(groups.length ? groups : ['volunteer']), inv.id]);
    }
  });
  console.log(`[TeamGroups] Deleted custom group ${usage.id} "${usage.name}" in event ${eventId} (${usage.members.length} members, ${usage.invites.length} invites)`);
  return usage;
}

module.exports = {
  GroupError,
  DEFAULT_GROUP_KEYS,
  SCOPES,
  SENSITIVE_PERMISSIONS,
  isFestivalAdmin,
  assertFestivalAdmin,
  assertCanGrant,
  overview,
  listCustomGroups,
  getCustomGroup,
  validateGroupInput,
  createGroup,
  updateGroup,
  groupUsage,
  deleteGroup
};
