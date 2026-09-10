/**
 * Modules Controller
 * Handlers for the declarative edition modules:
 * reviews, calendar, tasks, departments, payments, settings, news, analytics, discovery
 */

const { query } = require('../../config/database');
const editionService = require('../services/edition.service');

// Demo state data
let reviewsData = [
  { id: 1, submissionId: 1, title: 'Documentary Film - The Journey', reviewerId: 2, score: 8.5, status: 'Completed', disputeFlag: false, notes: 'Compelling narrative structure.' },
  { id: 2, submissionId: 2, title: 'Short Film - Sunrise', reviewerId: 2, score: 9.0, status: 'In Review', disputeFlag: false, notes: 'Excellent cinematography and pacing.' },
  { id: 3, submissionId: 3, title: 'Animation - Dream World', reviewerId: 3, score: 7.2, status: 'Disputed', disputeFlag: true, notes: 'Score disputed by lead reviewer.' },
];

let calendarData = [
  { id: 1, title: 'Opening Gala & Screening', venue: 'Main Auditorium', startTime: '2026-10-12 18:00', duration: '120m', type: 'Screening' },
  { id: 2, title: 'Panel: Future of Indie Cinema', venue: 'Workshop Room B', startTime: '2026-10-13 14:00', duration: '60m', type: 'Event' },
  { id: 3, title: 'Shorts Program Block A', venue: 'Screen 2', startTime: '2026-10-14 11:00', duration: '90m', type: 'Screening' },
];

let tasksData = [
  { id: 1, department_id: 1, department: 'Programming', title: 'Verify DCP subtitles for Screen 2', assignee: 'Jane Volunteer', status: 'In Progress' },
  { id: 2, department_id: 1, department: 'Programming', title: 'Distribute jury voting sheets', assignee: 'John Volunteer', status: 'Pending' },
  { id: 3, department_id: 2, department: 'Hospitality', title: 'Airport greeting for VIP Guest Elena', assignee: 'Sam Volunteer', status: 'Completed' },
];

let departmentsData = [
  { id: 1, name: 'Programming & Screenings', lead: 'Sarah Jenkins', staffCount: 14, activeTasks: 5 },
  { id: 2, name: 'Guest Hospitality & Transport', lead: 'Marcus Chen', staffCount: 8, activeTasks: 3 },
  { id: 3, name: 'Marketing & Press Relations', lead: 'Elena Rostova', staffCount: 6, activeTasks: 2 },
];

let paymentsData = [
  { id: 1, reference: 'PAY-8821', recipient: 'Director John Doe', amount: '$450.00', type: 'Award Honorarium', status: 'Completed', date: '2026-09-01' },
  { id: 2, reference: 'PAY-8822', recipient: 'Screen 2 DCP Lab', amount: '$1,200.00', type: 'Lab Processing', status: 'Pending', date: '2026-09-05' },
];

let newsData = [
  { id: 1, title: 'Official Selection Announced for 2026 Edition', category: 'Announcements', author: 'Festival Director', status: 'Published', publishedAt: '2026-09-01' },
  { id: 2, title: 'Volunteer Orientation Schedule Released', category: 'Internal Updates', author: 'HR Lead', status: 'Draft', publishedAt: null },
];

let analyticsData = {
  totalSubmissions: 342,
  acceptanceRate: '14.2%',
  activeJurors: 18,
  ticketsReserved: 1850,
  breakdown: [
    { category: 'Documentary', count: 110 },
    { category: 'Feature Film', count: 95 },
    { category: 'Short Film', count: 88 },
    { category: 'Animation', count: 49 },
  ]
};

// ── Review Handlers ───────────────────────────────────────────────────
async function listReviews(req, res) {
  res.json(reviewsData);
}

async function evaluateReview(req, res) {
  const id = parseInt(req.params.id, 10);
  const review = reviewsData.find(r => r.id === id);
  if (!review) return res.status(404).json({ error: 'Review not found.' });

  const { score, notes } = req.body;
  if (score !== undefined) review.score = parseFloat(score);
  if (notes) review.notes = notes;
  review.status = 'Completed';

  res.json({ message: 'Review evaluation saved.', data: review });
}

async function assignReviewer(req, res) {
  const id = parseInt(req.params.id, 10);
  const review = reviewsData.find(r => r.id === id);
  if (!review) return res.status(404).json({ error: 'Review not found.' });

  review.reviewerId = req.body.reviewerId || req.user.id;
  res.json({ message: 'Reviewer assigned.', data: review });
}

async function flagDispute(req, res) {
  const id = parseInt(req.params.id, 10);
  const review = reviewsData.find(r => r.id === id);
  if (!review) return res.status(404).json({ error: 'Review not found.' });

  review.disputeFlag = true;
  review.status = 'Disputed';
  res.json({ message: 'Review dispute flagged for committee review.', data: review });
}

async function overrideDecision(req, res) {
  const id = parseInt(req.params.id, 10);
  const review = reviewsData.find(r => r.id === id);
  if (!review) return res.status(404).json({ error: 'Review not found.' });

  review.status = req.body.decision || 'Accepted';
  review.disputeFlag = false;
  res.json({ message: 'Review decision overridden by authority.', data: review });
}

// ── Calendar Handlers ─────────────────────────────────────────────────
async function listCalendar(req, res) {
  res.json(calendarData);
}

async function manageEvents(req, res) {
  const { title, venue, startTime, duration, type } = req.body;
  const newEvent = { id: Date.now(), title, venue, startTime, duration, type: type || 'Event' };
  calendarData.push(newEvent);
  res.status(201).json({ message: 'Calendar event created.', data: newEvent });
}

// ── Tasks Handlers ────────────────────────────────────────────────────
async function listTasks(req, res) {
  let filtered = tasksData;
  if (req.permissionScope && req.permissionScope.scopeKey === 'department') {
    // Filter to user's assigned department (e.g. Programming department_id 1)
    filtered = tasksData.filter(t => t.department_id === 1);
  }
  res.json({ data: filtered, scope: req.permissionScope ? req.permissionScope.scopeKey : 'all' });
}

async function createTask(req, res) {
  const { title, department_id = 1, department = 'General', assignee } = req.body;
  const newTask = { id: Date.now(), department_id, department, title, assignee: assignee || 'Unassigned', status: 'Pending' };
  tasksData.push(newTask);
  res.status(201).json({ message: 'Task created.', data: newTask });
}

async function updateTaskStatus(req, res) {
  const id = parseInt(req.params.id, 10);
  const task = tasksData.find(t => t.id === id);
  if (!task) return res.status(404).json({ error: 'Task not found.' });

  task.status = req.body.status || 'In Progress';
  res.json({ message: 'Task status updated.', data: task });
}

// ── Department Handlers ───────────────────────────────────────────────
async function listDepartments(req, res) {
  res.json(departmentsData);
}

// ── Payments Handlers ─────────────────────────────────────────────────
async function listPayments(req, res) {
  res.json(paymentsData);
}

async function processPayouts(req, res) {
  const { paymentId } = req.body;
  const p = paymentsData.find(item => item.id === paymentId);
  if (p) p.status = 'Completed';
  res.json({ message: 'Payout processed successfully.', data: p });
}

// ── Settings & Addon Toggling Handlers ────────────────────────────────
async function getSettings(req, res) {
  const editionId = req.headers['x-edition-id'] || req.headers['x-festival-id'] || 1;
  const modules = await editionService.getEditionConfig(editionId);
  res.json({
    editionId,
    modules,
  });
}

async function toggleAddon(req, res) {
  const editionId = req.headers['x-edition-id'] || req.headers['x-festival-id'] || 1;
  const moduleId = parseInt(req.params.moduleId, 10);
  const { isEnabled } = req.body;

  await editionService.toggleModule(editionId, moduleId, isEnabled);
  res.json({ message: 'Module status updated.', moduleId, isEnabled });
}

// ── News Handlers ─────────────────────────────────────────────────────
async function listNews(req, res) {
  res.json(newsData);
}

async function publishNews(req, res) {
  const { title, category } = req.body;
  const item = { id: Date.now(), title, category: category || 'General', author: req.user.name, status: 'Published', publishedAt: new Date().toISOString().split('T')[0] };
  newsData.unshift(item);
  res.status(201).json({ message: 'News published.', data: item });
}

// ── Analytics Handlers ────────────────────────────────────────────────
async function getAnalytics(req, res) {
  res.json(analyticsData);
}

module.exports = {
  listReviews, evaluateReview, assignReviewer, flagDispute, overrideDecision,
  listCalendar, manageEvents,
  listTasks, createTask, updateTaskStatus,
  listDepartments,
  listPayments, processPayouts,
  getSettings, toggleAddon,
  listNews, publishNews,
  getAnalytics,
};
