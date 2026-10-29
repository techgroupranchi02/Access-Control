/**
 * Audience Module Routes
 * 
 * Defines protected API endpoints for festival staff (Admin, Volunteer, Jury)
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
audienceRouter.get('/registration-form', requirePermission('audience.view'), audienceController.getRegistrationFormSchema);
audienceRouter.put('/registration-form', requirePermission('audience.manage_settings'), audienceController.saveRegistrationFormSchema);

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
votingRouter.post('/approve-results', requirePermission('voting.control_window'), audienceController.approveResults);
votingRouter.get('/approval-status', requirePermission('voting.view_results'), audienceController.getApprovalStatus);

// ── 4. Registration & Badges Router (/api/registration) ───────────────────────
const registrationRouter = express.Router();
registrationRouter.use(authenticate);
registrationRouter.use(requireModule('audience'));

registrationRouter.get('/attendees', requirePermission('registration.view'), audienceController.listAttendees);
registrationRouter.post('/attendees', requirePermission('registration.create'), audienceController.registerAttendee);
registrationRouter.post('/attendees/:id/issue-qr', requirePermission('registration.create'), audienceController.issueAttendeeQrCode);
registrationRouter.post('/attendees/:id/revoke-qr', requirePermission('registration.create'), audienceController.revokeAttendeeQrCode);
registrationRouter.post('/bulk-import', requirePermission('registration.create'), audienceController.bulkImportAttendees);

// ── 5. Public Mobile Voter Router (/api/public/vote) [No Staff Auth] ──────────
const publicVoteRouter = express.Router();
// Rate-limiting and input sanitization handled by Express middleware
publicVoteRouter.get('/:token', audienceController.getPublicScreeningVoteData);
publicVoteRouter.post('/:token/submit', audienceController.submitAudienceVote);

// ── 6. Public Registration & Reviews Router (/api/public) [No Auth] ───────────
const publicRegistrationRouter = express.Router();
publicRegistrationRouter.get('/registration-status', audienceController.getPublicRegistrationStatus);
publicRegistrationRouter.get('/registration-form-schema', audienceController.getPublicRegistrationFormSchema);

// Phase 7: Public Film Catalog & Delegate Reviews
publicRegistrationRouter.get('/films', audienceController.listFestivalFilms);
publicRegistrationRouter.get('/films/:filmId/reviews', audienceController.listPublicFilmReviews);
publicRegistrationRouter.post('/films/:filmId/reviews', audienceController.submitDelegateReview);

// ── 7. Delegate Reviews Moderation Router (/api/audience/reviews) ─────────────
audienceRouter.get('/reviews/moderation', requirePermission('audience.view'), audienceController.listModerationReviews);
audienceRouter.put('/reviews/:id/moderate', requirePermission('audience.view'), audienceController.moderateDelegateReview);
audienceRouter.delete('/reviews/:id', requirePermission('audience.view'), audienceController.deleteDelegateReview);

module.exports = {
  audienceRouter,
  attendanceRouter,
  votingRouter,
  registrationRouter,
  publicVoteRouter,
  publicRegistrationRouter
};
