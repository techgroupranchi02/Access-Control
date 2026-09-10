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
    `SELECT m.*
     FROM modules m
     WHERE m.type = 'custom'
     ORDER BY m.display_order`
  );
}

/**
 * Get enabled plugins for a specific event / edition.
 * @param {number} eventId
 * @returns {Promise<Array>}
 */
async function getEnabledPlugins(eventId) {
  return query(
    `SELECT m.*
     FROM modules m
     JOIN events_modules em ON em.module_id = m.id AND em.event_id = ? AND em.is_enabled = TRUE
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
     WHERE em.event_id = ? AND m.module_key = ? AND em.is_enabled = TRUE
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
    `SELECT p.* FROM permissions p
     WHERE p.resource = ?
     ORDER BY p.action`,
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
  const { moduleKey, name, description, route, icon, componentName, pluginDir, displayOrder } = pluginData;

  const result = await query(
    `INSERT INTO modules (module_key, type, name, description, route, icon, component_name, plugin_dir, display_order)
     VALUES (?, 'custom', ?, ?, ?, ?, ?, ?, ?)`,
    [moduleKey, name, description, route, icon, componentName, pluginDir, displayOrder || 10]
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
