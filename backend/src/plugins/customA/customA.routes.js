/**
 * CustomA Plugin — Routes
 * Self-contained route definitions for the CustomA plugin.
 * 
 * This file uses core middleware (auth, permissions) but defines its own routes.
 * The plugin loader discovers and registers these routes dynamically.
 */

const express = require('express');
const router = express.Router();
const customAController = require('./customA.controller');
const { authenticate } = require('../../core/middleware/auth.middleware');
const { requirePermission, requireFeature } = require('../../core/middleware/permission.middleware');

router.use(authenticate);

// Ensure customA feature is enabled for the current festival
router.use(requireFeature('customA'));

router.get('/', requirePermission('customA:read'), customAController.list);
router.get('/:id', requirePermission('customA:read'), customAController.getById);
router.put('/:id', requirePermission('customA:update'), customAController.update);
router.delete('/:id', requirePermission('customA:delete'), customAController.remove);

module.exports = router;
