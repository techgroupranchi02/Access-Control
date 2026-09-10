/**
 * Access Control System — Express Application Entry Point
 * 
 * Config-driven, plugin-based architecture.
 * Core routes are registered statically.
 * Plugin routes are discovered and registered dynamically from the database.
 */

const express = require('express');
const cookieParser = require('cookie-parser');
const env = require('./config/environment');
const { testConnection } = require('./config/database');
const { loadPlugins } = require('./config/pluginLoader');
const { securityHeaders, corsPolicy, permissionsPolicy } = require('./core/middleware/security.middleware');
const { generalLimiter } = require('./core/middleware/rateLimiter.middleware');

// Route imports
const authRoutes = require('./core/routes/auth.routes');
const festivalRoutes = require('./core/routes/festival.routes');
const submissionRoutes = require('./core/routes/submission.routes');
const teamRoutes = require('./core/routes/team.routes');
const juryRoutes = require('./core/routes/jury.routes');
const adminRoutes = require('./core/routes/admin.routes');
const {
  reviewRouter,
  calendarRouter,
  tasksRouter,
  departmentsRouter,
  paymentsRouter,
  settingsRouter,
  newsRouter,
  analyticsRouter,
} = require('./core/routes/modules.routes');

const app = express();

// Trust reverse proxy (Nginx) for HTTPS headers
app.set('trust proxy', 1);

// ── Global Middleware ────────────────────────────────────────────────
app.use(securityHeaders());
app.use(corsPolicy());
app.use(permissionsPolicy());
app.use(generalLimiter);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ── Health Check ─────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Core & Module Routes ─────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/events', festivalRoutes);
app.use('/api/submissions', submissionRoutes);
app.use('/api/team', teamRoutes);
app.use('/api/jury', juryRoutes);
app.use('/api/admin', adminRoutes);

// Declarative Module Routes
app.use('/api/reviews', reviewRouter);
app.use('/api/calendar', calendarRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/departments', departmentsRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/news', newsRouter);
app.use('/api/analytics', analyticsRouter);



// ── Start Server ─────────────────────────────────────────────────────
async function start() {
  // Test database connection
  const dbConnected = await testConnection();
  if (!dbConnected) {
    console.error('[App] Cannot start without database. Exiting.');
    process.exit(1);
  }

  // Dynamically load and register plugin routes
  await loadPlugins(app);

  // ── Error Handler ────────────────────────────────────────────────────
  // Generic error handler — no sensitive info exposed to client
  app.use((err, req, res, next) => {
    console.error('[App] Unhandled error:', err.message);
    res.status(500).json({ error: 'An internal server error occurred.' });
  });

  // ── 404 Handler ──────────────────────────────────────────────────────
  app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found.' });
  });

  // Listen on 127.0.0.1 for security (not 0.0.0.0)
  const host = env.nodeEnv === 'production' ? '0.0.0.0' : '127.0.0.1';
  app.listen(env.port, host, () => {
    console.log(`\n[App] ══════════════════════════════════════════`);
    console.log(`[App] Access Control System running`);
    console.log(`[App] Environment: ${env.nodeEnv}`);
    console.log(`[App] URL: http://${host}:${env.port}`);
    console.log(`[App] Frontend: ${env.frontendUrl}`);
    console.log(`[App] ══════════════════════════════════════════\n`);
  });
}

start().catch((err) => {
  console.error('[App] Failed to start:', err.message);
  process.exit(1);
});

module.exports = app;
