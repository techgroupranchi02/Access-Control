/**
 * Kashish Sync API Routes
 */

const express = require('express');
const { authenticate } = require('../middleware/auth.middleware');
const { requirePermission, requireAnyPermission, requireModule } = require('../middleware/permission.middleware');
const canManageScreenings = requireAnyPermission(['audience.manage_settings', 'audience.manage_screenings']);
const kashishSyncController = require('../controllers/kashish-sync.controller');

const kashishSyncRouter = express.Router();
kashishSyncRouter.use(authenticate);
kashishSyncRouter.use(requireModule('audience'));

// Sync trigger
kashishSyncRouter.post('/sync-votes', requirePermission('voting.control_window'), kashishSyncController.syncKashishVotes);

// Movie mappings
kashishSyncRouter.get('/movie-mappings', requirePermission('audience.view'), kashishSyncController.listMovieMappings);
kashishSyncRouter.post('/movie-mappings', canManageScreenings, kashishSyncController.createMovieMapping);
kashishSyncRouter.delete('/movie-mappings/:id', canManageScreenings, kashishSyncController.deleteMovieMapping);

// User mappings & sync history
kashishSyncRouter.get('/user-mappings', requirePermission('audience.view'), kashishSyncController.listUserMappings);
kashishSyncRouter.get('/external-summary', requirePermission('audience.view'), kashishSyncController.getExternalSummary);
kashishSyncRouter.get('/sync-logs', requirePermission('audience.view'), kashishSyncController.getSyncLogs);
kashishSyncRouter.get('/receipts', requirePermission('voting.audit_fraud'), kashishSyncController.listVoteReceipts);
// Voters behind each Sync status count (names, emails, mobiles): same permission as the vote audit
kashishSyncRouter.get('/external-votes', requirePermission('voting.audit_fraud'), kashishSyncController.listExternalVotes);

module.exports = { kashishSyncRouter };
