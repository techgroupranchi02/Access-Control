/**
 * Plugin Registry
 * Maps plugin feature keys to their lazy-loaded React components.
 * 
 * To add a new plugin:
 * 1. Create the component in src/plugins/{pluginKey}/
 * 2. Add an entry here
 * 3. The feature must be registered in the database 'features' table
 * 4. ZERO changes to core business logic required
 */

import { lazy } from 'react';

const pluginRegistry = {
  customA: {
    component: lazy(() => import('../plugins/customA/CustomAPage.jsx')),
    navLabel: 'Custom A',
    navIcon: 'puzzle',
  },
  // Future plugins:
  customB: {
    component: lazy(() => import('../plugins/customB/CustomBPage.jsx')),
    navLabel: 'Custom B',
    navIcon: 'layers',
    route: '/custom-b',
  },
  customC: {
    component: lazy(() => import('../plugins/customC/CustomCPage.jsx')),
    navLabel: 'Custom C',
    navIcon: 'layers',
    route: '/custom-c',
  },
};

export default pluginRegistry;
