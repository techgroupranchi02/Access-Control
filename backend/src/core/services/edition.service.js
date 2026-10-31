/**
 * Edition Service
 * Handles edition management and module configuration (Core & Addon).
 * Supports the New Schema with events_modules (presence = enabled).
 */

const { query } = require('../../config/database');

/**
 * Get active editions / events accessible to the user.
 * Freecomers Admins see all festivals.
 * Festival Admins / Team members see festivals they own or belong to.
 * Active SaaS festivals (saas_enabled = 1) are always prioritized at the top.
 */
async function getAllEditions(user) {
  // If user is SuperAdmin or role 'admin' from Freecomers admins table, restrict to active SaaS festivals (plus target festival if launched directly)
  if (user && (user.isSuperAdmin || user.role === 'admin')) {
    let extraFilter = '';
    if (user.targetFestivalId) {
      extraFilter = ` OR event_id = ${parseInt(user.targetFestivalId, 10)}`;
    }
    return query(
      `SELECT event_id as id, event_id, user_id, name, edition, description, event_type, saas_enabled, is_deleted, created_at,
              1 as is_owner, 'Platform Admin' as role_label
       FROM events 
       WHERE is_deleted = 0 
         AND (saas_enabled = 1 OR is_saas = 1${extraFilter})
       ORDER BY (saas_enabled = 1) DESC, event_id DESC`
    );
  }

  // If user is a platform user (Festival Admin / Team member)
  if (user && (user.email || user.id)) {
    let allUserIds = user.userIds || [user.id];
    let userEmail = user.email || '';
    if (user.email) {
      const linkedUsers = await query('SELECT id FROM users WHERE email = ? AND status = 1', [user.email]);
      if (linkedUsers.length > 0) {
        allUserIds = linkedUsers.map(u => u.id);
      }
    } else if (user.id) {
      const userRows = await query('SELECT email FROM users WHERE id = ?', [user.id]);
      if (userRows.length > 0 && userRows[0].email) {
        userEmail = userRows[0].email;
      }
    }
    const placeholders = allUserIds.map(() => '?').join(',');

    return query(
      `SELECT DISTINCT
         e.event_id as id, e.event_id, e.user_id, e.name, e.edition, e.description,
         e.event_type, e.saas_enabled, e.is_deleted, e.created_at,
         (CASE 
            WHEN e.user_id IN (${placeholders}) THEN 1 
            WHEN ffc_approved.event_id IS NOT NULL THEN 1 
            ELSE 0 
          END) as is_owner,
         (CASE 
            WHEN e.user_id IN (${placeholders}) THEN 'Festival Owner · Admin'
            WHEN ffc_approved.event_id IS NOT NULL THEN 'Festival Owner · Admin'
            WHEN g.group_key = 'admin' THEN 'Team Admin'
            WHEN g.group_key = 'volunteer' THEN 'Volunteer'
            WHEN g.group_key = 'jury' THEN 'Jury'
            WHEN g.label IS NOT NULL THEN g.label
            ELSE 'Team Member'
          END) as role_label
       FROM events e
       LEFT JOIN (
         SELECT DISTINCT ff.event_id 
         FROM film_festivals ff 
         JOIN film_festivals_claims ffc ON ffc.film_festival_id = ff.film_festival_id 
         WHERE (ffc.user_id IN (${placeholders}) OR ffc.email = ?) AND ffc.claim_request_status = 'approved'
       ) ffc_approved ON ffc_approved.event_id = e.event_id
       LEFT JOIN user_event_groups ueg ON ueg.event_id = e.event_id AND ueg.user_id IN (${placeholders})
       LEFT JOIN \`groups\` g ON g.id = ueg.group_id
       WHERE e.is_deleted = 0
         AND (e.user_id IN (${placeholders}) OR ffc_approved.event_id IS NOT NULL OR ueg.user_id IS NOT NULL)
       ORDER BY (e.saas_enabled = 1) DESC, e.event_id DESC`,
      [
        ...allUserIds,
        ...allUserIds,
        ...allUserIds, userEmail,
        ...allUserIds,
        ...allUserIds
      ]
    );
  }

  // Fallback (e.g. unauthenticated)
  return query(
    `SELECT event_id as id, event_id, user_id, name, edition, description, event_type, saas_enabled, is_deleted, created_at,
            0 as is_owner, 'Guest' as role_label
     FROM events 
     WHERE is_deleted = 0 
     ORDER BY (saas_enabled = 1) DESC, event_id DESC`
  );
}

/**
 * Get edition / event by slug or name or id.
 */
async function getEditionBySlug(slug) {
  const isNumeric = !isNaN(slug);
  const rows = await query(
    'SELECT event_id as id, event_id, user_id, name, description, event_type, saas_enabled, is_deleted, created_at FROM events WHERE (name = ? OR (1 = ? AND event_id = ?)) AND is_deleted = 0',
    [slug, isNumeric ? 1 : 0, isNumeric ? parseInt(slug, 10) : 0]
  );
  return rows[0] || null;
}

/**
 * Get edition / event by ID.
 */
async function getEditionById(id) {
  const rows = await query(
    'SELECT event_id as id, event_id, user_id, name, description, event_type, saas_enabled, is_deleted, created_at FROM events WHERE event_id = ? AND is_deleted = 0',
    [id]
  );
  return rows[0] || null;
}

/**
 * Get full module configuration for an edition (Core, Addon, Custom).
 * Uses LEFT JOIN on events_modules (row presence = enabled).
 */
async function getEditionConfig(editionId) {
  return query(
    `SELECT m.id as module_id, m.id as feature_id, m.module_key, m.module_key as feature_key,
            m.type as module_type, m.type as feature_type, m.type, m.label, m.label as name, m.description,
            m.route, m.icon, m.plugin_dir, m.display_order,
            (CASE WHEN em.event_id IS NOT NULL THEN 1 ELSE 0 END) as is_enabled
     FROM modules m
     LEFT JOIN events_modules em ON em.module_id = m.id AND em.event_id = ?
     ORDER BY m.display_order, m.label`,
    [editionId]
  );
}

/**
 * Get only enabled modules for an edition.
 */
async function getEnabledModules(editionId) {
  return query(
    `SELECT m.id as module_id, m.module_key, m.type as module_type, m.label, m.label as name, m.description,
            m.route, m.icon, m.plugin_dir, m.display_order
     FROM modules m
     JOIN events_modules em ON em.module_id = m.id AND em.event_id = ?
     ORDER BY m.display_order, m.label`,
    [editionId]
  );
}

/**
 * Toggle a module on or off for an edition.
 * Enabling inserts into events_modules, disabling deletes from events_modules.
 */
async function toggleModule(editionId, moduleId, isEnabled) {
  if (isEnabled) {
    await query(
      'INSERT IGNORE INTO events_modules (event_id, module_id) VALUES (?, ?)',
      [editionId, moduleId]
    );
  } else {
    await query(
      'DELETE FROM events_modules WHERE event_id = ? AND module_id = ?',
      [editionId, moduleId]
    );
  }
}

// Backward compatibility exports
const getAllFestivals = getAllEditions;
const getFestivalBySlug = getEditionBySlug;
const getFestivalById = getEditionById;
const getFestivalConfig = getEditionConfig;
const getEnabledFeatures = getEnabledModules;
const toggleFeature = toggleModule;

module.exports = {
  getAllEditions,
  getEditionBySlug,
  getEditionById,
  getEditionConfig,
  getEnabledModules,
  toggleModule,
  // Backward compatibility
  getAllFestivals,
  getFestivalBySlug,
  getFestivalById,
  getFestivalConfig,
  getEnabledFeatures,
  toggleFeature,
};
