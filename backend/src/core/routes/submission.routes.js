/**
 * Submission Routes
 * Uses dot-notation permissions with backward-compatibility aliases:
 * GET    /api/submissions        — requires submission.view
 * POST   /api/submissions        — requires submission.create
 * GET    /api/submissions/:id    — requires submission.view
 * PUT    /api/submissions/:id    — requires submission.edit
 * PUT    /api/submissions/:id/status — requires submission.update_status
 * POST   /api/submissions/:id/reject — requires submission.reject
 * DELETE /api/submissions/:id    — requires submission.delete
 */

const express = require('express');
const router = express.Router();
const submissionController = require('../controllers/submission.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { requirePermission, requireModule } = require('../middleware/permission.middleware');

router.use(authenticate);
router.use(requireModule('submissions'));

router.get('/', requirePermission('submission.view'), submissionController.list);
router.post('/', requirePermission('submission.create'), submissionController.create);
router.get('/:id', requirePermission('submission.view'), submissionController.getById);
router.put('/:id', requirePermission('submission.edit'), submissionController.update);
router.put('/:id/status', requirePermission('submission.update_status'), submissionController.updateStatus);
router.post('/:id/reject', requirePermission('submission.reject'), submissionController.reject);
router.delete('/:id', requirePermission('submission.delete'), submissionController.remove);

module.exports = router;
