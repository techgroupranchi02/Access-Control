/**
 * Admin Routes
 * All routes require admin:access permission.
 */

const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { requirePermission } = require('../middleware/permission.middleware');

router.use(authenticate);
router.use(requirePermission('admin:access'));

// Groups
router.get('/groups', adminController.listRoles);
router.post('/groups', adminController.createRole);
router.put('/groups/:id/permissions', adminController.updateRolePermissions);

// Permissions
router.get('/permissions', adminController.listPermissions);
router.get('/permission-groups', adminController.listPermissionGroups);

// Users
router.get('/users', adminController.listUsers);
router.post('/users/:userId/groups', adminController.assignUserRole);
router.delete('/users/:userId/groups', adminController.removeUserRole);

// Events & Modules
router.get('/events', adminController.listAllFestivals);
router.get('/modules', adminController.listFeatures);

module.exports = router;
