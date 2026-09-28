/**
 * Submission Routes
 * Endpoints for 23 submissions, faceted filtering, rejection, and flagging.
 */

const express = require('express');
const router = express.Router();
const submissionController = require('../controllers/submission.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { requirePermission, requireModule } = require('../middleware/permission.middleware');

router.use(authenticate);
router.use(requireModule('submissions'));

router.get('/', requirePermission('submission.view'), submissionController.list);
router.get('/:id', requirePermission('submission.view'), submissionController.getById);
router.put('/:id/status', requirePermission('submission.update_status'), submissionController.updateStatus);
router.post('/:id/reject', requirePermission('submission.reject'), submissionController.reject);
router.post('/:id/flag', requirePermission('submission.edit'), submissionController.flag);

module.exports = router;
