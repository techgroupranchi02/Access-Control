/**
 * SaaS Admin Routes (Freecomers_admin)
 * 
 * Exposes endpoints for managing festival SaaS access, module provisioning,
 * and the Group Access Matrix.
 */

const express = require('express');
const router = express.Router();
const saasAdminController = require('../controllers/saasAdmin.controller');

// Festival List & SaaS Toggle
router.get('/festivals', saasAdminController.listFestivals);
router.put('/festivals/:eventId/toggle-saas', saasAdminController.toggleFestivalSaaS);

// Full Hierarchical Architecture Tree
// [ Festival Edition ] -> [ Modules ] -> [ Routes & Scoped Permissions ] -> [ Group Access Matrix ]
router.get('/festivals/:eventId/architecture', saasAdminController.getFestivalArchitecture);

// Module Provisioning (events_modules)
router.post('/festivals/:eventId/modules/:moduleId/toggle', saasAdminController.toggleFestivalModule);

// Group Access Matrix Configuration (module_groups_permissions)
router.put('/festivals/:eventId/modules/:moduleId/matrix', saasAdminController.updateGroupPermissionMatrix);

// Settings (Seat limits & edition metadata)
router.put('/festivals/:eventId/settings', saasAdminController.updateFestivalSettings);

module.exports = router;
