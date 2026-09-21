/**
 * Plugin Service
 * Config-driven plugin discovery and integration.
 * 
 * This is the bridge between core business logic and custom plugins.
 * Business logic services call this service to discover what plugins exist
 * and what permissions they require — without ever importing plugin code directly.
 */

const { query } = require('../../config/database');

/**
 * Get all registered custom modules (plugins).
 * @returns {Promise<Array>}
 */
async function getRegisteredPlugins() {
  return query(
    `SELECT id, module_key, label, label as name, description, type, icon, plugin_dir, route, display_order, created_at
     FROM modules
     WHERE type = 'custom'
     ORDER BY display_order`
  );
}

/**
 * Get enabled plugins for a specific event / edition.
 * @param {number} eventId
 * @returns {Promise<Array>}
 */
async function getEnabledPlugins(eventId) {
  return query(
    `SELECT m.id, m.module_key, m.label, m.label as name, m.description, m.type, m.icon, m.plugin_dir, m.route, m.display_order
     FROM modules m
     JOIN events_modules em ON em.module_id = m.id AND em.event_id = ?
     WHERE m.type = 'custom'
     ORDER BY m.display_order`,
    [eventId]
  );
}

/**
 * Check if a specific plugin is enabled for an event.
 * @param {number} eventId
 * @param {string} moduleKey
 * @returns {Promise<boolean>}
 */
async function isPluginEnabled(eventId, moduleKey) {
  const rows = await query(
    `SELECT em.id FROM events_modules em
     JOIN modules m ON m.id = em.module_id
     WHERE em.event_id = ? AND m.module_key = ?
     LIMIT 1`,
    [eventId, moduleKey]
  );
  return rows.length > 0;
}

/**
 * Get permissions for a plugin.
 * @param {string} moduleKey
 * @returns {Promise<Array>}
 */
async function getPluginPermissions(moduleKey) {
  return query(
    `SELECT p.id, p.permission_key, p.label, p.label as name, p.description, p.module_id, p.page_id, p.actions_match, p.actions_unmatch
     FROM permissions p
     JOIN modules m ON m.id = p.module_id
     WHERE m.module_key = ?
     ORDER BY p.permission_key`,
    [moduleKey]
  );
}

/**
 * Register a new plugin module in the database.
 * This is used by the admin to register new custom modules without code changes.
 * @param {object} pluginData
 * @returns {Promise<object>}
 */
async function registerPlugin(pluginData) {
  const { moduleKey, name, label, description, route, icon, pluginDir, displayOrder } = pluginData;

  const result = await query(
    `INSERT INTO modules (module_key, type, label, description, route, icon, plugin_dir, display_order)
     VALUES (?, 'custom', ?, ?, ?, ?, ?, ?)`,
    [moduleKey, label || name, description, route, icon, pluginDir, displayOrder || 10]
  );

  return { id: result.insertId, moduleKey };
}

module.exports = {
  getRegisteredPlugins,
  getEnabledPlugins,
  isPluginEnabled,
  getPluginPermissions,
  registerPlugin,
};
