/**
 * Scoping Service
 * Handles Row-Level Permission Scoping resolution and query filter generation.
 * 
 * Supported Scopes:
 * - 'all': Global access across the entire edition/event.
 * - 'assigned': Restricted to records directly assigned to the user.
 * - 'jury_panel': Restricted to records within the juror's assigned jury panel / category.
 */

const { query } = require('../../config/database');

/**
 * Scope hierarchy rank (higher number = more permissive)
 */
const SCOPE_HIERARCHY = {
  'all': 100,
  'jury_panel': 50,
  'assigned': 10
};

/**
 * Resolves the most permissive scope among an array of scope keys.
 * e.g. ['assigned', 'all'] -> 'all'
 * @param {string[]} scopeKeys
 * @returns {string}
 */
function resolveHighestScope(scopeKeys) {
  if (!scopeKeys || scopeKeys.length === 0) return 'all';
  let best = 'assigned';
  let bestRank = -1;

  for (const s of scopeKeys) {
    const rank = SCOPE_HIERARCHY[s] || 0;
    if (rank > bestRank) {
      bestRank = rank;
      best = s;
    }
  }

  return best;
}

/**
 * Apply row-level scoping to film submissions list query.
 * 
 * @param {string} baseSql
 * @param {Array} baseParams
 * @param {object} scope - req.permissionScope
 * @returns {{ sql: string, params: Array }}
 */
function scopeSubmissionsQuery(baseSql, baseParams, scope) {
  if (!scope || scope.isWildcard || scope.scopeKey === 'all') {
    return { sql: baseSql, params: baseParams };
  }

  const userIds = scope.allUserIds || (scope.primaryUserId ? [scope.primaryUserId] : []);
  if (userIds.length === 0) {
    // No user ID: deny by returning impossible condition
    return { sql: `${baseSql} AND 1 = 0`, params: baseParams };
  }

  const placeholders = userIds.map(() => '?').join(',');

  if (scope.scopeKey === 'assigned') {
    // Only films assigned to this juror/reviewer in screening_assignments
    const sql = `
      ${baseSql}
      AND s.id IN (
        SELECT film_id FROM screening_assignments 
        WHERE event_id = ? AND jury_user_id IN (${placeholders})
      )
    `;
    return {
      sql,
      params: [...baseParams, scope.editionId, ...userIds]
    };
  }

  if (scope.scopeKey === 'jury_panel') {
    // Only films in categories the juror is assigned to via jury_ballots or event category
    const sql = `
      ${baseSql}
      AND (
        s.category IN (
          SELECT DISTINCT c.name FROM film_festivals_categories c
          JOIN jury_ballots jb ON jb.category_id = c.id
          WHERE jb.event_id = ? AND jb.jury_user_id IN (${placeholders})
        )
        OR s.id IN (
          SELECT film_id FROM screening_assignments 
          WHERE event_id = ? AND jury_user_id IN (${placeholders})
        )
      )
    `;
    return {
      sql,
      params: [...baseParams, scope.editionId, ...userIds, scope.editionId, ...userIds]
    };
  }

  return { sql: baseSql, params: baseParams };
}

/**
 * Verify whether a specific submission record can be viewed/accessed by the user under current scope.
 * 
 * @param {number} filmId
 * @param {object} scope - req.permissionScope
 * @returns {Promise<boolean>}
 */
async function canAccessSubmission(filmId, scope) {
  if (!scope || scope.isWildcard || scope.scopeKey === 'all') {
    return true;
  }

  const userIds = scope.allUserIds || (scope.primaryUserId ? [scope.primaryUserId] : []);
  if (userIds.length === 0) return false;

  const placeholders = userIds.map(() => '?').join(',');

  if (scope.scopeKey === 'assigned') {
    const rows = await query(`
      SELECT id FROM screening_assignments 
      WHERE event_id = ? AND film_id = ? AND jury_user_id IN (${placeholders})
      LIMIT 1
    `, [scope.editionId, filmId, ...userIds]);
    return rows.length > 0;
  }

  if (scope.scopeKey === 'jury_panel') {
    const rows = await query(`
      SELECT s.id FROM submissions s
      WHERE s.id = ? AND s.event_id = ?
        AND (
          s.category IN (
            SELECT DISTINCT c.name FROM film_festivals_categories c
            JOIN jury_ballots jb ON jb.category_id = c.id
            WHERE jb.event_id = ? AND jb.jury_user_id IN (${placeholders})
          )
          OR s.id IN (
            SELECT film_id FROM screening_assignments 
            WHERE event_id = ? AND jury_user_id IN (${placeholders})
          )
        )
      LIMIT 1
    `, [filmId, scope.editionId, scope.editionId, ...userIds, scope.editionId, ...userIds]);
    return rows.length > 0;
  }

  return true;
}

/**
 * Apply row-level scoping to tasks query.
 * 
 * @param {string} baseSql
 * @param {Array} baseParams
 * @param {object} scope - req.permissionScope
 * @returns {{ sql: string, params: Array }}
 */
function scopeTasksQuery(baseSql, baseParams, scope) {
  if (!scope || scope.isWildcard || scope.scopeKey === 'all') {
    return { sql: baseSql, params: baseParams };
  }

  const userIds = scope.allUserIds || (scope.primaryUserId ? [scope.primaryUserId] : []);
  if (userIds.length === 0) {
    return { sql: `${baseSql} AND 1 = 0`, params: baseParams };
  }

  const placeholders = userIds.map(() => '?').join(',');

  if (scope.scopeKey === 'assigned') {
    const sql = `
      ${baseSql}
      AND t.id IN (
        SELECT task_id FROM task_assignees 
        WHERE user_id IN (${placeholders})
      )
    `;
    return {
      sql,
      params: [...baseParams, ...userIds]
    };
  }

  return { sql: baseSql, params: baseParams };
}

module.exports = {
  SCOPE_HIERARCHY,
  resolveHighestScope,
  scopeSubmissionsQuery,
  canAccessSubmission,
  scopeTasksQuery
};
