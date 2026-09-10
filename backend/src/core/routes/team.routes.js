/**
 * Team Routes
 * GET    /api/team        — requires team:read
 * GET    /api/team/:id    — requires team:read
 * PUT    /api/team/:id    — requires team:update
 * DELETE /api/team/:id    — requires team:delete
 */

const express = require('express');
const router = express.Router();
const teamController = require('../controllers/team.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { requirePermission } = require('../middleware/permission.middleware');

router.use(authenticate);

router.get('/', requirePermission('team:read'), teamController.list);
router.get('/:id', requirePermission('team:read'), teamController.getById);
router.put('/:id', requirePermission('team:update'), teamController.update);
router.delete('/:id', requirePermission('team:delete'), teamController.remove);

module.exports = router;
