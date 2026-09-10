/**
 * Edition Service
 * Handles edition management and module configuration (Core & Addon).
 * Supports the Updated Declarative Configuration Specification.
 */

const { query } = require('../../config/database');

/**
 * Get all active editions / events.
 */
async function getAllEditions() {
  return query('SELECT id, name, slug, description, is_active, created_at FROM events WHERE is_active = TRUE ORDER BY name');
}

/**
 * Get edition / event by slug.
 */
async function getEditionBySlug(slug) {
  const rows = await query('SELECT * FROM events WHERE slug = ? AND is_active = TRUE', [slug]);
  return rows[0] || null;
}

/**
 * Get edition / event by ID.
 */
async function getEditionById(id) {
  const rows = await query('SELECT * FROM events WHERE id = ?', [id]);
  return rows[0] || null;
}

/**
 * Get full module configuration for an edition (Core, Addon, Custom).
 */
async function getEditionConfig(editionId) {
  return query(
    `SELECT m.id as module_id, m.module_key, m.type as module_type, m.name, m.description,
            m.route, m.icon, m.plugin_dir, m.display_order,
            COALESCE(em.is_enabled, FALSE) as is_enabled, em.config as module_config
     FROM modules m
     LEFT JOIN events_modules em ON em.module_id = m.id AND em.event_id = ?
     ORDER BY m.display_order, m.name`,
    [editionId]
  );
}

/**
 * Get only enabled modules for an edition.
 */
async function getEnabledModules(editionId) {
  return query(
    `SELECT m.id as module_id, m.module_key, m.type as module_type, m.name, m.description,
            m.route, m.icon, m.plugin_dir, m.display_order,
            em.config as module_config
     FROM modules m
     JOIN events_modules em ON em.module_id = m.id AND em.event_id = ? AND em.is_enabled = TRUE
     ORDER BY m.display_order, m.name`,
    [editionId]
  );
}

/**
 * Toggle a module on or off for an edition (e.g. toggle addon modules).
 */
async function toggleModule(editionId, moduleId, isEnabled) {
  await query(
    `INSERT INTO events_modules (event_id, module_id, is_enabled)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE is_enabled = ?`,
    [editionId, moduleId, isEnabled, isEnabled]
  );
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
