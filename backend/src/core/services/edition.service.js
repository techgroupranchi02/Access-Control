/**
 * Edition Service
 * Handles edition management and module configuration (Core & Addon).
 * Supports the New Schema with events_modules (presence = enabled).
 */

const { query } = require('../../config/database');

/**
 * Get all active editions / events.
 */
async function getAllEditions() {
  return query(
    'SELECT event_id as id, event_id, user_id, name, edition, description, event_type, saas_enabled, is_deleted, created_at FROM events WHERE is_deleted = 0 ORDER BY event_id ASC'
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
