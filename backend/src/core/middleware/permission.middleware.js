/**
 * Permission Middleware
 * Factory functions to enforce permissions and module availability.
 * 
 * Supports:
 * - Wildcard '*' permission: grants access across all modules
 * - Dot-notation and colon-notation permission keys
 * - Contextual scope evaluation attachment (req.permissionScope)
 * - Module gating (both core and addon modules)
 */

const { query } = require('../../config/database');
const { canSignInSql } = require('../utils/userStatus');
const { resolveHighestScope } = require('../services/scoping.service');
const { getEventId, EVENT_REQUIRED_MESSAGE } = require('../utils/eventId');

/**
 * Creates a middleware that checks if the current user has the specified permission.
 * Grants access if user has exact permission OR wildcard '*'.
 * 
 * @param {string} permissionKey - e.g. 'submission.view', 'customA.view'
 * @returns {Function} Express middleware
 */
function requirePermission(permissionKey) {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required.' });
      }

      const editionId = getEventId(req);
      if (!editionId) return res.status(400).json({ error: EVENT_REQUIRED_MESSAGE });

      // If user is Freecomers SuperAdmin / platform admin, allow all
      if (req.user.isSuperAdmin || req.user.role === 'admin') {
        req.permission = '*';
        req.permissionScope = { scopeKey: 'all', permissionKey: '*', isWildcard: true, allUserIds: [req.user.id], primaryUserId: req.user.id, editionId: parseInt(editionId, 10) };
        return next();
      }

      // Check if user is the OWNER of this event (across any of their linked user IDs)
      let allUserIds = req.user.userIds || [req.user.id];
      if (req.user.email) {
        const linkedUsers = await query(`SELECT id FROM users WHERE email = ? AND ${canSignInSql()}`, [req.user.email]);
        if (linkedUsers.length > 0) {
          allUserIds = linkedUsers.map(u => u.id);
        }
      }
      const userPlaceholders = allUserIds.map(() => '?').join(',');

      // If user owns the event, they are the Festival Director / Owner -> grant access!
      const ownerRows = await query(
        `SELECT user_id FROM events WHERE event_id = ? AND user_id IN (${userPlaceholders})`,
        [editionId, ...allUserIds]
      );
      if (ownerRows.length > 0) {
        req.permission = '*';
        req.permissionScope = { scopeKey: 'all', permissionKey: '*', isWildcard: true, allUserIds, primaryUserId: req.user.id, editionId: parseInt(editionId, 10) };
        return next();
      }

      // If user is assigned to group 'admin' in user_event_groups -> grant access!
      const adminGroupRows = await query(
        `SELECT ueg.id FROM user_event_groups ueg
         JOIN \`groups\` g ON g.id = ueg.group_id
         WHERE ueg.event_id = ? AND ueg.user_id IN (${userPlaceholders}) AND g.group_key = 'admin' LIMIT 1`,
        [editionId, ...allUserIds]
      );
      if (adminGroupRows.length > 0) {
        req.permission = '*';
        req.permissionScope = { scopeKey: 'all', permissionKey: '*', isWildcard: true, allUserIds, primaryUserId: req.user.id, editionId: parseInt(editionId, 10) };
        return next();
      }

      // Check legacy and colon/dot aliases (e.g. submission:view <-> submission.view, submission:read)
      const aliases = [permissionKey, '*'];
      if (permissionKey.includes('.')) {
        const [mod, act] = permissionKey.split('.');
        aliases.push(`${mod}:${act}`);
        aliases.push(`${mod}:${act === 'view' ? 'read' : (act === 'read' ? 'view' : act)}`);
      } else if (permissionKey.includes(':')) {
        const [mod, act] = permissionKey.split(':');
        aliases.push(`${mod}.${act}`);
        aliases.push(`${mod}.${act === 'read' ? 'view' : (act === 'view' ? 'read' : act)}`);
      }

      // Query user's permissions for this edition/event
      const placeholders = aliases.map(() => '?').join(',');

      // 1. Check if user has granular custom permissions configured for this edition/event
      const customRows = await query(
        `SELECT p.permission_key, ecgp.scope_key
         FROM user_event_custom_groups uecg
         JOIN event_custom_groups ecg_own ON ecg_own.id = uecg.custom_group_id AND ecg_own.event_id = uecg.event_id
         JOIN event_custom_group_permissions ecgp ON ecgp.custom_group_id = uecg.custom_group_id
         JOIN permissions p ON p.id = ecgp.permission_id
         WHERE uecg.user_id IN (${userPlaceholders}) AND uecg.event_id = ? AND p.permission_key IN (${placeholders})`,
        [...allUserIds, editionId, ...aliases]
      );

      // 2. Check standard module group permissions
      const stdRows = await query(
        `SELECT p.permission_key, mgp.scope_key
         FROM user_event_groups ueg
         JOIN module_groups mg ON mg.group_id = ueg.group_id
         JOIN module_groups_permissions mgp ON mgp.module_group_id = mg.id
         JOIN permissions p ON p.id = mgp.permission_id
         WHERE ueg.user_id IN (${userPlaceholders}) AND ueg.event_id = ? AND p.permission_key IN (${placeholders})`,
        [...allUserIds, editionId, ...aliases]
      );

      const allMatchedRows = [...customRows, ...stdRows];
      if (allMatchedRows.length === 0) {
        return res.status(403).json({
          error: 'Access denied.',
          required: permissionKey,
        });
      }

      // Resolve most permissive scope among matches
      const matchedScopes = allMatchedRows.map(r => r.scope_key || 'all');
      const resolvedScope = resolveHighestScope(matchedScopes);

      // Attach matched permission and rich scope to request
      req.permission = allMatchedRows[0].permission_key;
      req.permissionScope = {
        scopeKey: resolvedScope,
        permissionKey: allMatchedRows[0].permission_key,
        isWildcard: false,
        allUserIds,
        primaryUserId: req.user.id,
        editionId: parseInt(editionId, 10),
      };

      next();
    } catch (error) {
      console.error('[Permission] Error checking permission:', error.message);
      return res.status(500).json({ error: 'Permission check failed.' });
    }
  };
}

/**
 * Creates a middleware that checks if a module is enabled for the current edition.
 * 
 * @param {string} moduleKey - Module key to check (e.g., 'submissions', 'jury', 'customA')
 * @returns {Function} Express middleware
 */
function requireModule(moduleKey) {
  return async (req, res, next) => {
    try {
      const editionId = getEventId(req);
      if (!editionId) return res.status(400).json({ error: EVENT_REQUIRED_MESSAGE });


      // Check if module is enabled in events_modules (row presence = enabled)
      const rows = await query(
        `SELECT em.id, m.module_key, m.type
         FROM events_modules em
         JOIN modules m ON m.id = em.module_id
         WHERE em.event_id = ? AND m.module_key = ?
         LIMIT 1`,
        [editionId, moduleKey]
      );

      if (rows.length === 0) {
        return res.status(404).json({
          error: 'Module not available for this edition.',
          module: moduleKey,
        });
      }

      req.module = rows[0];
      next();
    } catch (error) {
      console.error('[Permission] Error checking module:', error.message);
      return res.status(500).json({ error: 'Module check failed.' });
    }
  };
}

// Backward-compatible alias
const requireFeature = requireModule;

/** The festival a request is for (core/utils/eventId.js), or null. */
const requestedFestivalId = getEventId;

/** Refuses a request that names no festival (400), instead of falling back to a fixed one. */
function requireEventId(req, res, next) {
  if (!getEventId(req)) return res.status(400).json({ error: EVENT_REQUIRED_MESSAGE });
  next();
}

const MEMBER_CACHE_TTL_MS = 60 * 1000;
const memberCache = new Map(); // '<userKey>:<eventId>' -> { ok, at }

/** True when the user belongs to the festival: owner, approved claim, or in any of its groups. */
async function isFestivalMember(user, eventId) {
  let ids = (user.userIds && user.userIds.length ? user.userIds : [user.id]).filter(Boolean);
  if (user.email) {
    const linked = await query(`SELECT id FROM users WHERE email = ? AND ${canSignInSql()}`, [user.email]);
    if (linked.length) ids = linked.map((u) => u.id);
  }
  if (!ids.length) return false;
  const ph = ids.map(() => '?').join(',');
  const rows = await query(
    `SELECT 1 FROM events WHERE event_id = ? AND user_id IN (${ph})
     UNION SELECT 1 FROM user_event_groups WHERE event_id = ? AND user_id IN (${ph})
     UNION SELECT 1 FROM user_event_custom_groups uecg
       JOIN event_custom_groups ecg ON ecg.id = uecg.custom_group_id AND ecg.event_id = uecg.event_id
       WHERE uecg.event_id = ? AND uecg.user_id IN (${ph})
     UNION SELECT 1 FROM film_festivals ff
       JOIN film_festivals_claims ffc ON ffc.film_festival_id = ff.film_festival_id AND ffc.claim_request_status = 'approved'
       WHERE ff.event_id = ? AND ffc.user_id IN (${ph})
     LIMIT 1`,
    [eventId, ...ids, eventId, ...ids, eventId, ...ids, eventId, ...ids]
  );
  return rows.length > 0;
}

/**
 * A signed-in user may only act on festivals they belong to. Runs after `authenticate` on every festival
 * router, so a route that forgets its requirePermission still can't be used for another festival by changing
 * the festival header. Freecomers admins pass. A request that names no festival passes here; requireEventId
 * (or the route's own check) handles that.
 */
async function requireFestivalMember(req, res, next) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required.' });
    if (req.user.isFreecomersAdmin || req.user.isSuperAdmin) return next();
    const eventId = requestedFestivalId(req);
    if (!eventId) return next();
    const key = `${req.user.id || 'x'}:${req.user.email || ''}:${eventId}`;
    const hit = memberCache.get(key);
    let ok;
    if (hit && Date.now() - hit.at < MEMBER_CACHE_TTL_MS) {
      ok = hit.ok;
    } else {
      ok = await isFestivalMember(req.user, eventId);
      if (memberCache.size > 5000) memberCache.clear();
      memberCache.set(key, { ok, at: Date.now() });
    }
    if (!ok) {
      return res.status(403).json({ error: "You're not on this festival's team." });
    }
    next();
  } catch (error) {
    console.error('[Permission] Festival membership check failed:', error.message);
    return res.status(500).json({ error: 'Permission check failed.' });
  }
}

/**
 * True when the user passes requirePermission(key) (admins, owners and granted groups). For checks inside a
 * handler, e.g. a field only some users may change.
 */
function userHasPermission(req, key) {
  const probe = { ...req, headers: req.headers, query: req.query, user: req.user };
  return new Promise((resolve) => {
    const res = { status: () => ({ json: () => resolve(false) }) };
    requirePermission(key)(probe, res, () => resolve(true)).catch(() => resolve(false));
  });
}

/** True when the user passes requirePermission for at least one of the keys. */
async function hasAnyPermission(req, keys) {
  for (const key of keys) {
    if (await userHasPermission(req, key)) return true;
  }
  return false;
}

/** Like requirePermission, but passes when the user has at least one of the keys. */
function requireAnyPermission(keys) {
  return async (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required.' });
    for (const key of keys) {
      if (await userHasPermission(req, key)) return requirePermission(key)(req, res, next); // sets req.permissionScope
    }
    return res.status(403).json({ error: `Permission denied. Requires one of: ${keys.join(', ')}.` });
  };
}

module.exports = { requirePermission, requireAnyPermission, requireModule, requireFeature, userHasPermission, hasAnyPermission, requireFestivalMember, requireEventId, requestedFestivalId, isFestivalMember };
