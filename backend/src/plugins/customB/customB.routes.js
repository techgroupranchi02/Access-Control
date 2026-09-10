/**
 * CustomB Plugin — Routes
 * Self-contained route definitions for the CustomB plugin.
 * 
 * This file uses core middleware (auth, permissions) but defines its own routes.
 * The plugin loader discovers and registers these routes dynamically.
 */

const express = require('express');
const router = express.Router();
const customBController = require('./customB.controller');
const { authenticate } = require('../../core/middleware/auth.middleware');
const { requirePermission, requireFeature } = require('../../core/middleware/permission.middleware');

router.use(authenticate);

// Ensure customB feature is enabled for the current festival
router.use(requireFeature('customB'));

router.get('/', requirePermission('customB:read'), customBController.list);
router.get('/:id', requirePermission('customB:read'), customBController.getById);
router.put('/:id', requirePermission('customB:update'), customBController.update);
router.delete('/:id', requirePermission('customB:delete'), customBController.remove);

module.exports = router;
