/**
 * Modules Routes
 * Connects controllers for all declarative edition modules:
 * Reviews, Calendar, Tasks, Departments, Guests, Chat, Sponsors, Payouts, Settings.
 */

const express = require('express');
const { authenticate } = require('../middleware/auth.middleware');
const { requirePermission, requireAnyPermission, requireModule, requireEventId, requireFestivalMember } = require('../middleware/permission.middleware');

const taskController = require('../controllers/task.controller');
const reviewController = require('../controllers/review.controller');
const scheduleController = require('../controllers/schedule.controller');
const guestController = require('../controllers/guest.controller');
const chatController = require('../controllers/chat.controller');
const sponsorController = require('../controllers/sponsor.controller');
const payoutController = require('../controllers/payout.controller');
const departmentController = require('../controllers/department.controller');
const modulesController = require('../controllers/modules.controller');
const settingsController = require('../controllers/settings.controller');

// ── Module Subrouters ────────────────────────────────────────────────
const reviewRouter = express.Router();
const calendarRouter = express.Router();
const tasksRouter = express.Router();
const departmentsRouter = express.Router();
const guestsRouter = express.Router();
const chatRouter = express.Router();
const sponsorsRouter = express.Router();
const payoutsRouter = express.Router();
const settingsRouter = express.Router();

// Apply authentication to all module subrouters
[
  reviewRouter,
  calendarRouter,
  tasksRouter,
  departmentsRouter,
  guestsRouter,
  chatRouter,
  sponsorsRouter,
  payoutsRouter,
  settingsRouter,
].forEach(r => r.use(authenticate, requireEventId, requireFestivalMember)); // a user can only act on festivals they belong to

// ── Review & Scoring Pipeline ─────────────────────────────────────────
reviewRouter.use(requireModule('submissions'));
reviewRouter.get('/pipeline', requirePermission('review:view'), reviewController.getPipeline);
reviewRouter.get('/assignments', requirePermission('review:view'), reviewController.listAssignments);
reviewRouter.get('/jury', requirePermission('review:view'), reviewController.listJury);
reviewRouter.post('/assign', requirePermission('review:assign'), reviewController.assignJury);
reviewRouter.post('/scorecard', requirePermission('review:score'), reviewController.submitScorecard);
reviewRouter.post('/decision', requirePermission('review:advance'), reviewController.makeDecision);
reviewRouter.post('/ballot', requirePermission('review:score'), reviewController.submitBallot);
reviewRouter.post('/complete-stage', requirePermission('review:advance'), reviewController.completeStage);

// ── Calendar & Screenings ─────────────────────────────────────────────
calendarRouter.use(requireModule('calendar'));
calendarRouter.get('/', requirePermission('schedule:view'), scheduleController.list);
calendarRouter.post('/slot', requirePermission('schedule:manage'), scheduleController.createSlot);

// ── Departmental Tasks ────────────────────────────────────────────────
tasksRouter.use(requireModule('tasks'));
tasksRouter.get('/', requirePermission('task:view'), taskController.list);
tasksRouter.post('/', requirePermission('task:create'), taskController.create);
tasksRouter.put('/:id/status', requirePermission('task:status_update'), taskController.updateStatus);

// ── Guests & Hospitality ──────────────────────────────────────────────
guestsRouter.get('/', requirePermission('guest:view'), guestController.list);
guestsRouter.post('/:id/checkin', requirePermission('guest:checkin'), guestController.checkIn);
guestsRouter.post('/:id/print-badge', requirePermission('guest:edit'), guestController.printBadge);

// ── Communications & Chat ─────────────────────────────────────────────
chatRouter.get('/channels', requirePermission('chat:view'), chatController.listChannels);
chatRouter.get('/channels/:channelId/messages', requirePermission('chat:view'), chatController.listMessages);
chatRouter.post('/channels/:channelId/messages', requirePermission('chat:view'), chatController.sendMessage);

// ── Sponsors ──────────────────────────────────────────────────────────
sponsorsRouter.get('/', requirePermission('sponsors:view'), sponsorController.list);
sponsorsRouter.put('/deliverables/:id/status', requirePermission('sponsors:manage'), sponsorController.updateDeliverableStatus);

// ── Payouts ───────────────────────────────────────────────────────────
payoutsRouter.get('/', requirePermission('payouts:view'), payoutController.list);
payoutsRouter.get('/export-csv', requirePermission('payouts:view'), payoutController.exportCsv);
payoutsRouter.get('/:paymentId/receipt', requirePermission('payouts:view'), payoutController.getReceipt);

// ── Departments ───────────────────────────────────────────────────────
departmentsRouter.use(requireModule('departments'));
departmentsRouter.get('/', requirePermission('department:view'), departmentController.list);

// ── Edition Settings ──────────────────────────────────────────────────
settingsRouter.get('/', requirePermission('settings:manage'), modulesController.getSettings);
settingsRouter.post('/modules/:moduleId/toggle', requirePermission('settings:manage'), modulesController.toggleAddon);

// Film Flags CRUD
// Review settings are read by Admins, the Jury and anyone who can see submissions; only settings:manage changes them
const canReadReviewSettings = requireAnyPermission(['settings:manage', 'review:view', 'submission:view']);
settingsRouter.get('/flags', canReadReviewSettings, settingsController.listFlags);
settingsRouter.post('/flags', requirePermission('settings:manage'), settingsController.createFlag);
settingsRouter.put('/flags/:id', requirePermission('settings:manage'), settingsController.updateFlag);
settingsRouter.delete('/flags/:id', requirePermission('settings:manage'), settingsController.deleteFlag);

// Review Rounds & Criteria Configuration
settingsRouter.get('/review-rounds', canReadReviewSettings, settingsController.getReviewRounds);
settingsRouter.put('/review-rounds/max-rounds', settingsController.updateMaxRounds);
settingsRouter.put('/review-rounds/:roundNumber', settingsController.updateRoundConfig);
settingsRouter.post('/review-rounds/:roundNumber/categories', settingsController.addCategory);
settingsRouter.put('/review-rounds/:roundNumber/categories/:id', settingsController.updateCategory);
settingsRouter.delete('/review-rounds/:roundNumber/categories/:id', settingsController.deleteCategory);

// Sequential 6-Stages Review Workflow Settings
settingsRouter.get('/review-states', canReadReviewSettings, settingsController.getReviewStates);
settingsRouter.get('/review-states/:id', canReadReviewSettings, settingsController.getReviewStateById);
settingsRouter.post('/review-states', requirePermission('settings:manage'), settingsController.createReviewState);
settingsRouter.put('/review-states/:id', requirePermission('settings:manage'), settingsController.updateReviewState);
settingsRouter.delete('/review-states/:id', requirePermission('settings:manage'), settingsController.deleteReviewState);
settingsRouter.post('/review-states/reorder', requirePermission('settings:manage'), settingsController.reorderReviewStates);
settingsRouter.post('/review-states/:id/criteria', requirePermission('settings:manage'), settingsController.addStateCriteria);
settingsRouter.delete('/review-states/:id/criteria/:critId', requirePermission('settings:manage'), settingsController.deleteStateCriteria);

module.exports = {
  reviewRouter,
  calendarRouter,
  tasksRouter,
  departmentsRouter,
  guestsRouter,
  chatRouter,
  sponsorsRouter,
  payoutsRouter,
  settingsRouter,
};
