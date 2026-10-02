/**
 * Audience Module Routes
 * 
 * Defines protected API endpoints for festival staff (Admin, Volunteer, Judge)
 * and public endpoints for mobile voters scanning projected screen QR codes.
 */

const express = require('express');
const { authenticate } = require('../middleware/auth.middleware');
const { requirePermission, requireModule } = require('../middleware/permission.middleware');
const audienceController = require('../controllers/audience.controller');

// ── 1. Audience Settings & Categories Router (/api/audience) ─────────────────
const audienceRouter = express.Router();
audienceRouter.use(authenticate);
audienceRouter.use(requireModule('audience'));

audienceRouter.get('/categories', requirePermission('audience.view'), audienceController.listCategories);
audienceRouter.post('/categories', requirePermission('audience.manage_categories'), audienceController.createCategory);
audienceRouter.put('/categories/:id', requirePermission('audience.manage_categories'), audienceController.updateCategory);
audienceRouter.delete('/categories/:id', requirePermission('audience.manage_categories'), audienceController.deleteCategory);

audienceRouter.get('/venues', requirePermission('audience.view'), audienceController.listVenues);
audienceRouter.get('/settings', requirePermission('audience.view'), audienceController.getAudienceSettings);
audienceRouter.put('/settings', requirePermission('audience.manage_settings'), audienceController.updateAudienceSettings);

audienceRouter.get('/screenings', requirePermission('audience.view'), audienceController.listScreeningBlocks);
audienceRouter.post('/screenings', requirePermission('audience.manage_settings'), audienceController.createScreeningBlock);
audienceRouter.post('/screenings/:id/open-voting', requirePermission('voting.control_window'), audienceController.openVotingWindow);
audienceRouter.post('/screenings/:id/close-voting', requirePermission('voting.control_window'), audienceController.closeVotingWindow);

// ── 2. Attendance & Check-in Router (/api/attendance) ─────────────────────────
const attendanceRouter = express.Router();
attendanceRouter.use(authenticate);
attendanceRouter.use(requireModule('audience'));

attendanceRouter.post('/scan', requirePermission('attendance.scan_checkin'), audienceController.performScreeningCheckin);
attendanceRouter.get('/logs', requirePermission('attendance.view'), audienceController.listAttendance);

// ── 3. Voting & Results Router (/api/voting) ──────────────────────────────────
const votingRouter = express.Router();
votingRouter.use(authenticate);
votingRouter.use(requireModule('audience'));

votingRouter.get('/leaderboard', requirePermission('voting.view_results'), audienceController.getVotingLeaderboard);
votingRouter.get('/flagged', requirePermission('voting.audit_fraud'), audienceController.listFlaggedVotes);
votingRouter.post('/void-vote', requirePermission('voting.audit_fraud'), audienceController.voidVote);

// ── 4. Registration & Badges Router (/api/registration) ───────────────────────
const registrationRouter = express.Router();
registrationRouter.use(authenticate);
registrationRouter.use(requireModule('audience'));

registrationRouter.get('/attendees', requirePermission('registration.view'), audienceController.listAttendees);
registrationRouter.post('/attendees', requirePermission('registration.create'), audienceController.registerAttendee);
registrationRouter.post('/bulk-import', requirePermission('registration.create'), audienceController.bulkImportAttendees);

// ── 5. Public Mobile Voter Router (/api/public/vote) [No Staff Auth] ──────────
const publicVoteRouter = express.Router();
// Rate-limiting and input sanitization handled by Express middleware
publicVoteRouter.get('/:token', audienceController.getPublicScreeningVoteData);
publicVoteRouter.post('/:token/submit', audienceController.submitAudienceVote);

module.exports = {
  audienceRouter,
  attendanceRouter,
  votingRouter,
  registrationRouter,
  publicVoteRouter
};
