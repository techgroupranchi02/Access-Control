/**
 * Plugin Registry
 * Maps plugin module keys to their lazy-loaded React components.
 *
 * To add a plugin:
 * 1. Create the component in src/plugins/{pluginKey}/
 * 2. Add an entry here, e.g.
 *      myPlugin: { component: lazy(() => import('../plugins/myPlugin/MyPluginPage.jsx')), navLabel: 'My Plugin', route: '/my-plugin' }
 * 3. Add the backend side: a `modules` row with type 'custom' and plugin_dir, and
 *    backend/src/plugins/{dir}/{dir}.routes.js (mounted at /api/plugins/{module_key} by pluginLoader.js)
 *
 * The demo plugins Custom A/B/C were removed (API review A4); there are no plugins at the moment.
 */

// import { lazy } from 'react';

const pluginRegistry = {};

export default pluginRegistry;
