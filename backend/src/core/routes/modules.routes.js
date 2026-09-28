/**
 * Modules Routes
 * Connects controllers for all declarative edition modules:
 * Reviews, Calendar, Tasks, Departments, Guests, Chat, Sponsors, Payouts, Payments, Settings, News, Analytics.
 */

const express = require('express');
const { authenticate } = require('../middleware/auth.middleware');
const { requirePermission, requireModule } = require('../middleware/permission.middleware');

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
const paymentsRouter = express.Router();
const settingsRouter = express.Router();
const newsRouter = express.Router();
const analyticsRouter = express.Router();

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
  paymentsRouter,
  settingsRouter,
  newsRouter,
  analyticsRouter,
].forEach(r => r.use(authenticate));

// ── Review & Scoring Pipeline ─────────────────────────────────────────
reviewRouter.use(requireModule('submissions'));
reviewRouter.get('/pipeline', reviewController.getPipeline);
reviewRouter.get('/assignments', reviewController.listAssignments);
reviewRouter.get('/judges', reviewController.listJudges);
reviewRouter.post('/assign', reviewController.assignJudges);
reviewRouter.post('/scorecard', reviewController.submitScorecard);
reviewRouter.post('/decision', reviewController.makeDecision);
reviewRouter.post('/toggle-voting', reviewController.toggleVoting);
reviewRouter.post('/ballot', reviewController.submitBallot);
// Fallback list
reviewRouter.get('/', reviewController.listAssignments);

// ── Calendar & Screenings ─────────────────────────────────────────────
calendarRouter.use(requireModule('calendar'));
calendarRouter.get('/', requirePermission('calendar.view'), scheduleController.list);
calendarRouter.post('/slot', requirePermission('calendar.manage_events'), scheduleController.createSlot);

// ── Departmental Tasks ────────────────────────────────────────────────
tasksRouter.use(requireModule('tasks'));
tasksRouter.get('/', requirePermission('task.view'), taskController.list);
tasksRouter.post('/', requirePermission('task.create'), taskController.create);
tasksRouter.put('/:id/status', requirePermission('task.update_status'), taskController.updateStatus);

// ── Guests & Hospitality ──────────────────────────────────────────────
guestsRouter.get('/', guestController.list);
guestsRouter.post('/:id/checkin', guestController.checkIn);
guestsRouter.post('/:id/print-badge', guestController.printBadge);

// ── Communications & Chat ─────────────────────────────────────────────
chatRouter.get('/channels', chatController.listChannels);
chatRouter.get('/channels/:channelId/messages', chatController.listMessages);
chatRouter.post('/channels/:channelId/messages', chatController.sendMessage);

// ── Sponsors ──────────────────────────────────────────────────────────
sponsorsRouter.get('/', sponsorController.list);
sponsorsRouter.put('/deliverables/:id/status', sponsorController.updateDeliverableStatus);

// ── Payouts ───────────────────────────────────────────────────────────
payoutsRouter.get('/', payoutController.list);
payoutsRouter.post('/release', payoutController.requestRelease);

// ── Departments ───────────────────────────────────────────────────────
departmentsRouter.use(requireModule('departments'));
departmentsRouter.get('/', requirePermission('department.view'), departmentController.list);

// ── Payments ──────────────────────────────────────────────────────────
paymentsRouter.use(requireModule('payments'));
paymentsRouter.get('/', requirePermission('payment.view'), modulesController.listPayments);
paymentsRouter.post('/payout', requirePermission('payment.manage_payouts'), modulesController.processPayouts);

// ── Edition Settings ──────────────────────────────────────────────────
settingsRouter.get('/', requirePermission('settings.view'), modulesController.getSettings);
settingsRouter.post('/modules/:moduleId/toggle', requirePermission('settings.manage_addons'), modulesController.toggleAddon);

// Film Flags CRUD
settingsRouter.get('/flags', settingsController.listFlags);
settingsRouter.post('/flags', settingsController.createFlag);
settingsRouter.put('/flags/:id', settingsController.updateFlag);
settingsRouter.delete('/flags/:id', settingsController.deleteFlag);

// Review Rounds & Criteria Configuration
settingsRouter.get('/review-rounds', settingsController.getReviewRounds);
settingsRouter.put('/review-rounds/max-rounds', settingsController.updateMaxRounds);
settingsRouter.put('/review-rounds/:roundNumber', settingsController.updateRoundConfig);
settingsRouter.post('/review-rounds/:roundNumber/categories', settingsController.addCategory);
settingsRouter.put('/review-rounds/:roundNumber/categories/:id', settingsController.updateCategory);
settingsRouter.delete('/review-rounds/:roundNumber/categories/:id', settingsController.deleteCategory);

// ── News & Publications ───────────────────────────────────────────────
newsRouter.use(requireModule('news'));
newsRouter.get('/', requirePermission('news.view'), modulesController.listNews);
newsRouter.post('/', requirePermission('news.publish'), modulesController.publishNews);

// ── Analytics ─────────────────────────────────────────────────────────
analyticsRouter.use(requireModule('analytics'));
analyticsRouter.get('/', requirePermission('analytics.view'), modulesController.getAnalytics);

module.exports = {
  reviewRouter,
  calendarRouter,
  tasksRouter,
  departmentsRouter,
  guestsRouter,
  chatRouter,
  sponsorsRouter,
  payoutsRouter,
  paymentsRouter,
  settingsRouter,
  newsRouter,
  analyticsRouter,
};
