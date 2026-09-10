/**
 * Jury Routes
 * Feature-gated: Only accessible when 'jury' feature is enabled for the festival.
 * 
 * GET    /api/jury        — requires jury:read + jury feature enabled
 * GET    /api/jury/:id    — requires jury:read
 * PUT    /api/jury/:id    — requires jury:update
 * DELETE /api/jury/:id    — requires jury:delete
 */

const express = require('express');
const router = express.Router();
const juryController = require('../controllers/jury.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { requirePermission, requireFeature } = require('../middleware/permission.middleware');

router.use(authenticate);

// All jury routes require the 'jury' feature to be enabled for the festival
router.use(requireFeature('jury'));

router.get('/', requirePermission('jury:read'), juryController.list);
router.get('/:id', requirePermission('jury:read'), juryController.getById);
router.put('/:id', requirePermission('jury:update'), juryController.update);
router.delete('/:id', requirePermission('jury:delete'), juryController.remove);

module.exports = router;
