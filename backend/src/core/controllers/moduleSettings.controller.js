/**
 * Generic Module Settings Controller
 * Provides standardized GET and PUT handlers for module configuration
 * backed by the `event_module_settings` table.
 */

const { query } = require('../../config/database');

function getEventId(req) {
  const raw = req.headers['x-event-id'] || req.headers['x-edition-id'] || req.headers['x-festival-id'] || req.query.eventId || 1;
  const parsed = parseInt(raw, 10);
  return isNaN(parsed) ? 1 : parsed;
}

/**
 * GET /api/modules/:moduleKey/settings
 * Fetches all settings for a specific module and event context.
 */
async function getModuleSettings(req, res) {
  try {
    const eventId = getEventId(req);
    const { moduleKey } = req.params;

    const moduleRows = await query(
      'SELECT id, module_key, label, type, has_settings, settings_route FROM modules WHERE module_key = ? LIMIT 1',
      [moduleKey]
    );

    if (moduleRows.length === 0) {
      return res.status(404).json({ error: `Module '${moduleKey}' not found.` });
    }

    const mod = moduleRows[0];

    // Fetch key-value settings from event_module_settings
    const settingRows = await query(
      'SELECT setting_key, setting_value, updated_at FROM event_module_settings WHERE event_id = ? AND module_id = ?',
      [eventId, mod.id]
    );

    const settings = {};
    for (const r of settingRows) {
      try {
        settings[r.setting_key] = typeof r.setting_value === 'string' ? JSON.parse(r.setting_value) : r.setting_value;
      } catch (e) {
        settings[r.setting_key] = r.setting_value;
      }
    }

    // Fetch any registered settings pages for this module
    const settingPages = await query(
      `SELECT id, page_key, label, route, permission_id, display_order, sidebar_menu, menu_order 
       FROM pages 
       WHERE module_id = ? AND page_type = 'settings' 
       ORDER BY menu_order ASC, display_order ASC`,
      [mod.id]
    );

    res.json({
      success: true,
      moduleKey,
      module: mod,
      settings,
      pages: settingPages
    });
  } catch (error) {
    console.error('[ModuleSettingsController] getModuleSettings error:', error);
    res.status(500).json({ error: 'Failed to retrieve module settings.' });
  }
}

/**
 * PUT /api/modules/:moduleKey/settings
 * Upserts key-value configuration for a module within an event context.
 */
async function updateModuleSettings(req, res) {
  try {
    const eventId = getEventId(req);
    const { moduleKey } = req.params;
    const settingsPayload = req.body.settings || req.body;

    if (!settingsPayload || typeof settingsPayload !== 'object') {
      return res.status(400).json({ error: 'Settings payload must be an object of key-value pairs.' });
    }

    const moduleRows = await query(
      'SELECT id FROM modules WHERE module_key = ? LIMIT 1',
      [moduleKey]
    );

    if (moduleRows.length === 0) {
      return res.status(404).json({ error: `Module '${moduleKey}' not found.` });
    }

    const moduleId = moduleRows[0].id;
    const userId = req.user ? req.user.id : null;

    for (const [key, rawValue] of Object.entries(settingsPayload)) {
      if (key === 'eventId' || key === 'moduleKey') continue;

      const serialized = JSON.stringify(rawValue);
      await query(
        `INSERT INTO event_module_settings (event_id, module_id, setting_key, setting_value, updated_by_user_id)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE 
           setting_value = VALUES(setting_value), 
           updated_by_user_id = VALUES(updated_by_user_id),
           updated_at = CURRENT_TIMESTAMP`,
        [eventId, moduleId, key, serialized, userId]
      );
    }

    res.json({
      success: true,
      message: `Settings for '${moduleKey}' updated successfully.`
    });
  } catch (error) {
    console.error('[ModuleSettingsController] updateModuleSettings error:', error);
    res.status(500).json({ error: 'Failed to update module settings.' });
  }
}

module.exports = {
  getModuleSettings,
  updateModuleSettings
};
