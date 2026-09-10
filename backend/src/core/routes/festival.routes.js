/**
 * Festival Routes
 * GET  /api/festivals
 * GET  /api/festivals/:slug
 * GET  /api/festivals/:id/config
 * GET  /api/festivals/:id/features
 * PUT  /api/festivals/:festivalId/features/:featureId/toggle
 */

const express = require('express');
const router = express.Router();
const festivalController = require('../controllers/festival.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { requirePermission } = require('../middleware/permission.middleware');

// All festival routes require authentication
router.use(authenticate);

router.get('/', festivalController.list);
router.get('/:slug', festivalController.getBySlug);
router.get('/:id/config', festivalController.getConfig);
router.get('/:id/features', festivalController.getEnabledFeatures);

// Admin only — toggle features
router.put('/:festivalId/features/:featureId/toggle', requirePermission('admin:access'), festivalController.toggleFeature);

module.exports = router;
