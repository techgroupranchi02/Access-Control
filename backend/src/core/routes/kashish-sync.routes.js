/**
 * Kashish Sync API Routes
 */

const express = require('express');
const { authenticate } = require('../middleware/auth.middleware');
const { requirePermission, requireModule } = require('../middleware/permission.middleware');
const kashishSyncController = require('../controllers/kashish-sync.controller');

const kashishSyncRouter = express.Router();
kashishSyncRouter.use(authenticate);
kashishSyncRouter.use(requireModule('audience'));

// Sync trigger
kashishSyncRouter.post('/sync-votes', requirePermission('voting.control_window'), kashishSyncController.syncKashishVotes);

// Movie mappings
kashishSyncRouter.get('/movie-mappings', requirePermission('audience.view'), kashishSyncController.listMovieMappings);
kashishSyncRouter.post('/movie-mappings', requirePermission('audience.manage_settings'), kashishSyncController.createMovieMapping);
kashishSyncRouter.delete('/movie-mappings/:id', requirePermission('audience.manage_settings'), kashishSyncController.deleteMovieMapping);

// User mappings & sync history
kashishSyncRouter.get('/user-mappings', requirePermission('audience.view'), kashishSyncController.listUserMappings);
kashishSyncRouter.get('/sync-logs', requirePermission('audience.view'), kashishSyncController.getSyncLogs);

module.exports = { kashishSyncRouter };
