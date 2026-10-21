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
router.get('/export', requirePermission('submission.view'), submissionController.exportCsv);
router.get('/activity-logs', requirePermission('submission.view'), submissionController.getActivityLogs);
router.get('/activity-logs/export', requirePermission('submission.view'), submissionController.exportActivityCsv);
router.get('/nominations-board', requirePermission('submission.view'), submissionController.getNominationsBoard);
router.post('/toggle-nomination', requirePermission('submission.edit'), submissionController.toggleNomination);
router.post('/add-award-category', requirePermission('submission.edit'), submissionController.addAwardCategory);
router.post('/remove-award-category', requirePermission('submission.edit'), submissionController.removeAwardCategory);
router.post('/advance-nominations-to-jury', requirePermission('submission.update_status'), submissionController.advanceNominationsToJury);
router.get('/jury-voting-board', requirePermission('submission.view'), submissionController.getJuryVotingBoard);
router.post('/toggle-category-jury', requirePermission('submission.edit'), submissionController.toggleCategoryJury);
router.post('/assign-all-category-jury', requirePermission('submission.edit'), submissionController.assignAllCategoryJury);
router.post('/advance-to-results', requirePermission('submission.update_status'), submissionController.advanceToResults);
router.get('/finalists-board', requirePermission('submission.view'), submissionController.getFinalistsBoard);
router.get('/winners-board', requirePermission('submission.view'), submissionController.getWinnersBoard);
router.post('/select-winner', requirePermission('submission.edit'), submissionController.selectWinner);
router.post('/remove-winner', requirePermission('submission.edit'), submissionController.removeWinner);
router.post('/advance-to-winners', requirePermission('submission.update_status'), submissionController.advanceToWinners);
router.post('/bulk-assign', requirePermission('submission.edit'), submissionController.bulkAssign);
router.post('/bulk-advance', requirePermission('submission.update_status'), submissionController.bulkAdvance);
router.post('/bulk-reject', requirePermission('submission.reject'), submissionController.bulkReject);

router.get('/:id', requirePermission('submission.view'), submissionController.getById);
router.put('/:id/category', requirePermission('submission.edit'), submissionController.updateCategory);
router.put('/:id/stage', requirePermission('submission.update_status'), submissionController.updateStage);
router.post('/:id/advance', requirePermission('submission.update_status'), submissionController.advanceFilm);
router.put('/:id/status', requirePermission('submission.update_status'), submissionController.updateStatus);
router.post('/:id/reject', requirePermission('submission.reject'), submissionController.reject);
router.post('/:id/flag', requirePermission('submission.edit'), submissionController.flag);

module.exports = router;
