/**
 * Modules Routes
 * Connects controllers for all declarative edition modules:
 * Reviews, Calendar, Tasks, Departments, Payments, Settings, News, Analytics.
 */

const express = require('express');
const modulesController = require('../controllers/modules.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { requirePermission, requireModule } = require('../middleware/permission.middleware');

// ── Module Subrouters ────────────────────────────────────────────────
const reviewRouter = express.Router();
const calendarRouter = express.Router();
const tasksRouter = express.Router();
const departmentsRouter = express.Router();
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
  paymentsRouter,
  settingsRouter,
  newsRouter,
  analyticsRouter,
].forEach(r => r.use(authenticate));

// ── Review & Scoring Pipeline ─────────────────────────────────────────
reviewRouter.use(requireModule('review_dashboard'));
reviewRouter.get('/', requirePermission('review.view'), modulesController.listReviews);
reviewRouter.put('/:id/evaluate', requirePermission('review.evaluate'), modulesController.evaluateReview);
reviewRouter.post('/:id/assign', requirePermission('review.assign'), modulesController.assignReviewer);
reviewRouter.post('/:id/dispute', requirePermission('review.flag_dispute'), modulesController.flagDispute);
reviewRouter.post('/:id/override', requirePermission('review.override_decision'), modulesController.overrideDecision);

// ── Calendar & Screenings ─────────────────────────────────────────────
calendarRouter.use(requireModule('calendar'));
calendarRouter.get('/', requirePermission('calendar.view'), modulesController.listCalendar);
calendarRouter.post('/', requirePermission('calendar.manage_events'), modulesController.manageEvents);

// ── Departmental Tasks ────────────────────────────────────────────────
tasksRouter.use(requireModule('tasks'));
tasksRouter.get('/', requirePermission('task.view'), modulesController.listTasks);
tasksRouter.post('/', requirePermission('task.create'), modulesController.createTask);
tasksRouter.put('/:id/status', requirePermission('task.update_status'), modulesController.updateTaskStatus);

// ── Departments ───────────────────────────────────────────────────────
departmentsRouter.use(requireModule('departments'));
departmentsRouter.get('/', requirePermission('department.view'), modulesController.listDepartments);

// ── Payments & Payouts ────────────────────────────────────────────────
paymentsRouter.use(requireModule('payments'));
paymentsRouter.get('/', requirePermission('payment.view'), modulesController.listPayments);
paymentsRouter.post('/payout', requirePermission('payment.manage_payouts'), modulesController.processPayouts);

// ── Edition Settings ──────────────────────────────────────────────────
settingsRouter.get('/', requirePermission('settings.view'), modulesController.getSettings);
settingsRouter.post('/modules/:moduleId/toggle', requirePermission('settings.manage_addons'), modulesController.toggleAddon);

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
  paymentsRouter,
  settingsRouter,
  newsRouter,
  analyticsRouter,
};
