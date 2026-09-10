/**
 * Plugin Loader
 * Dynamically discovers and registers custom plugin routes from the database.
 * 
 * This is the core of the plugin architecture:
 * - Reads the 'features' table for custom features with plugin_dir set
 * - Dynamically requires each plugin's routes file
 * - Mounts them on /api/plugins/{featureKey}
 * 
 * Adding a new plugin requires:
 * 1. Creating a plugin directory under src/plugins/
 * 2. Inserting a record in the 'features' table
 * 3. ZERO changes to core business logic
 */

const path = require('path');
const fs = require('fs');
const { query } = require('./database');

/**
 * Load and register all custom plugins on the Express app.
 * @param {import('express').Application} app
 */
async function loadPlugins(app) {
  try {
    // Discover all custom plugins from modules table
    const plugins = await query(
      `SELECT module_key as feature_key, plugin_dir FROM modules WHERE type = 'custom' AND plugin_dir IS NOT NULL`
    );

    console.log(`[PluginLoader] Discovered ${plugins.length} custom plugin(s)`);

    for (const plugin of plugins) {
      let pluginRoutePath = path.resolve(
        __dirname,
        '../plugins',
        plugin.plugin_dir,
        `${plugin.plugin_dir}.routes.js`
      );

      // Fallback: check flat path ../plugins/{plugin_dir}.routes.js
      if (!fs.existsSync(pluginRoutePath)) {
        const flatPath = path.resolve(__dirname, '../plugins', `${plugin.plugin_dir}.routes.js`);
        if (fs.existsSync(flatPath)) {
          pluginRoutePath = flatPath;
        }
      }

      // Check if route file exists
      if (!fs.existsSync(pluginRoutePath)) {
        console.warn(`[PluginLoader] ⚠ Plugin '${plugin.feature_key}' route file not found: ${pluginRoutePath}`);
        continue;
      }

      try {
        const pluginRouter = require(pluginRoutePath);
        const mountPath = `/api/plugins/${plugin.feature_key}`;
        app.use(mountPath, pluginRouter);
        console.log(`[PluginLoader] ✓ Registered plugin '${plugin.feature_key}' at ${mountPath}`);
      } catch (loadError) {
        console.error(`[PluginLoader] ✗ Failed to load plugin '${plugin.feature_key}':`, loadError.message);
      }
    }

    console.log('[PluginLoader] Plugin loading complete');
  } catch (error) {
    console.error('[PluginLoader] Failed to discover plugins:', error.message);
  }
}

module.exports = { loadPlugins };
