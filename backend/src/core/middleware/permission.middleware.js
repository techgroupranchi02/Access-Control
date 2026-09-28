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

      const editionId = req.headers['x-event-id'] || req.headers['x-edition-id'] || req.headers['x-festival-id'] || req.query.eventId || req.query.editionId || req.query.festivalId || 1;


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
        `SELECT p.permission_key
         FROM user_event_custom_groups uecg
         JOIN event_custom_group_permissions ecgp ON ecgp.custom_group_id = uecg.custom_group_id
         JOIN permissions p ON p.id = ecgp.permission_id
         WHERE uecg.user_id = ? AND uecg.event_id = ? AND p.permission_key IN (${placeholders})
         LIMIT 1`,
        [req.user.id, editionId, ...aliases]
      );

      let rows = customRows;
      if (rows.length === 0) {
        rows = await query(
          `SELECT p.permission_key
           FROM user_event_groups ueg
           JOIN module_groups mg ON mg.group_id = ueg.group_id
           JOIN module_groups_permissions mgp ON mgp.module_group_id = mg.id
           JOIN permissions p ON p.id = mgp.permission_id
           WHERE ueg.user_id = ? AND ueg.event_id = ? AND p.permission_key IN (${placeholders})
           LIMIT 1`,
          [req.user.id, editionId, ...aliases]
        );
      }

      if (rows.length === 0) {
        return res.status(403).json({
          error: 'Access denied.',
          required: permissionKey,
        });
      }

      // Attach matched permission and scope to request
      req.permission = rows[0].permission_key;
      req.permissionScope = {
        scopeKey: 'all',
        isWildcard: rows[0].permission_key === '*',
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
      const editionId = req.headers['x-event-id'] || req.headers['x-edition-id'] || req.headers['x-festival-id'] || req.query.eventId || req.query.editionId || req.query.festivalId || 1;


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

module.exports = { requirePermission, requireModule, requireFeature };
