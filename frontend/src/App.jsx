/**
 * App — Root Application Component
 * Sets up routing, providers, declarative module gating (<ModuleGate>),
 * and dynamic plugin routes.
 */

import { Suspense, useContext } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './core/context/AuthContext';
import { FestivalProvider, FestivalContext } from './core/context/FestivalContext';
import { ThemeProvider } from './core/context/ThemeContext';
import ProtectedRoute from './core/components/ProtectedRoute';
import ModuleGate from './core/components/ModuleGate';
import PermissionGate from './core/components/PermissionGate';
import Layout from './core/components/Layout';

// Core Pages
import LoginPage from './core/pages/LoginPage';
import DashboardPage from './core/pages/DashboardPage';
import SubmissionPage from './core/pages/SubmissionPage';
import ReviewPage from './core/pages/ReviewPage';
import TeamPage from './core/pages/TeamPage';
import PaymentsPage from './core/pages/PaymentsPage';
import SettingsPage from './core/pages/SettingsPage';
import AdminPage from './core/pages/AdminPage';

// Addon Module Pages
import CalendarPage from './core/pages/CalendarPage';
import TasksPage from './core/pages/TasksPage';

import JuryPage from './core/pages/JuryPage';
import DiscoveryPage from './core/pages/DiscoveryPage';
import NewsPage from './core/pages/NewsPage';
import AnalyticsPage from './core/pages/AnalyticsPage';
import GuestsPage from './core/pages/GuestsPage';
import ChatPage from './core/pages/ChatPage';
import SponsorsPage from './core/pages/SponsorsPage';

import pluginRegistry from './config/pluginRegistry';

// Loading fallback for lazy-loaded plugins
function PluginLoading() {
  return (
    <div className="animate-fade-in" style={{ padding: 'var(--space-xl)' }}>
      <div className="skeleton" style={{ height: '32px', width: '200px', marginBottom: 'var(--space-lg)' }}></div>
      <div className="skeleton" style={{ height: '200px' }}></div>
    </div>
  );
}

// Access denied fallback
function AccessDenied({ module, feature }) {
  const mod = module || feature;
  return (
    <div className="permission-denied animate-fade-in">
      <div>
        <div className="permission-denied-icon">🚫</div>
        <p className="permission-denied-text">Access Denied</p>
        <p className="permission-denied-subtext">
          {mod
            ? `The "${mod}" module is not enabled for this festival edition.`
            : 'You do not have permission to access this resource.'}
        </p>
      </div>
    </div>
  );
}

// Smart home redirect based on enabled modules
function HomeRedirect() {
  const festivalCtx = useContext(FestivalContext);
  if (!festivalCtx || festivalCtx.loading) {
    return null;
  }
  if (festivalCtx.isModuleEnabled('dashboard')) {
    return <Navigate to="/dashboard" replace />;
  }
  if (festivalCtx.isModuleEnabled('submissions')) {
    return <Navigate to="/submissions" replace />;
  }
  if (festivalCtx.isModuleEnabled('review_dashboard')) {
    return <Navigate to="/reviews" replace />;
  }
  if (festivalCtx.isModuleEnabled('team_management')) {
    return <Navigate to="/team" replace />;
  }
  return <Navigate to="/submissions" replace />;
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ThemeProvider>
          <Routes>
          {/* Public Routes */}
          <Route path="/login" element={<LoginPage />} />

          {/* Protected Routes — wrapped in FestivalProvider */}
          <Route
            element={
              <ProtectedRoute>
                <FestivalProvider>
                  <Layout />
                </FestivalProvider>
              </ProtectedRoute>
            }
          >
            {/* Root index route inside protected layout */}
            <Route index element={<HomeRedirect />} />

            {/* Dashboard (Core) */}
            <Route
              path="/dashboard"
              element={
                <ModuleGate module="dashboard" fallback={<AccessDenied module="dashboard" />}>
                  <DashboardPage />
                </ModuleGate>
              }
            />

            {/* Submissions Intake (Core) */}
            <Route
              path="/submissions"
              element={
                <ModuleGate module="submissions" fallback={<AccessDenied module="submissions" />}>
                  <PermissionGate permission="submission.view" fallback={<AccessDenied />}>
                    <SubmissionPage />
                  </PermissionGate>
                </ModuleGate>
              }
            />
            {/* Legacy route alias */}
            <Route
              path="/submission"
              element={<Navigate to="/submissions" replace />}
            />

            {/* Review Dashboard (Submissions Module Page 2) */}
            <Route
              path="/review-dashboard"
              element={
                <ModuleGate module="submissions" fallback={<AccessDenied module="submissions" />}>
                  <PermissionGate anyPermissions={['review.view', 'review:view', 'submission.view', 'submission:view']} fallback={<AccessDenied />}>
                    <ReviewPage />
                  </PermissionGate>
                </ModuleGate>
              }
            />
            {/* Legacy route alias */}
            <Route
              path="/reviews"
              element={<Navigate to="/review-dashboard" replace />}
            />

            {/* Team & Access Control (Core) */}
            <Route
              path="/team"
              element={
                <ModuleGate module="team" fallback={<AccessDenied module="team" />}>
                  <PermissionGate anyPermissions={['team.view', 'team:view', 'team.manage', 'team:manage']} fallback={<AccessDenied />}>
                    <TeamPage />
                  </PermissionGate>
                </ModuleGate>
              }
            />

            {/* Payouts Hub (Core / Addon) */}
            <Route
              path="/payouts"
              element={
                <ModuleGate module="payouts" fallback={<AccessDenied module="payouts" />}>
                  <PermissionGate anyPermissions={['payouts.view', 'payouts:view', 'payment.view', 'payment:view']} fallback={<AccessDenied />}>
                    <PaymentsPage />
                  </PermissionGate>
                </ModuleGate>
              }
            />
            <Route
              path="/payments"
              element={<Navigate to="/payouts" replace />}
            />

            {/* Edition Settings (Core) */}
            <Route
              path="/settings"
              element={
                <ModuleGate module="settings" fallback={<AccessDenied module="settings" />}>
                  <PermissionGate anyPermissions={['settings.manage', 'settings:manage', 'settings.view', 'settings:view']} fallback={<AccessDenied />}>
                    <SettingsPage />
                  </PermissionGate>
                </ModuleGate>
              }
            />

            {/* Festival Schedule Grid (Addon / Core) */}
            <Route
              path="/schedule"
              element={
                <ModuleGate module="schedule" fallback={<AccessDenied module="schedule" />}>
                  <PermissionGate anyPermissions={['schedule.view', 'schedule:view', 'calendar.view', 'calendar:view']} fallback={<AccessDenied />}>
                    <CalendarPage />
                  </PermissionGate>
                </ModuleGate>
              }
            />
            <Route
              path="/calendar"
              element={<Navigate to="/schedule" replace />}
            />

            {/* Departmental Tasks (Addon) */}
            <Route
              path="/tasks"
              element={
                <ModuleGate module="tasks" fallback={<AccessDenied module="tasks" />}>
                  <PermissionGate permission="task.view" fallback={<AccessDenied />}>
                    <TasksPage />
                  </PermissionGate>
                </ModuleGate>
              }
            />



            {/* Jury Management (Addon) */}
            <Route
              path="/jury"
              element={
                <ModuleGate module="jury" fallback={<AccessDenied module="jury" />}>
                  <PermissionGate anyPermissions={['jury.view_panel', 'jury.view_assignments', 'jury:read']} fallback={<AccessDenied />}>
                    <JuryPage />
                  </PermissionGate>
                </ModuleGate>
              }
            />

            {/* Discovery Feed (Addon - disabled by default) */}
            <Route
              path="/discovery"
              element={
                <ModuleGate module="discovery" fallback={<AccessDenied module="discovery" />}>
                  <PermissionGate anyPermissions={['discovery.view_public', 'discovery.browse', 'discovery:read']} fallback={<AccessDenied />}>
                    <DiscoveryPage />
                  </PermissionGate>
                </ModuleGate>
              }
            />

            {/* News & Announcements (Addon) */}
            <Route
              path="/news"
              element={
                <ModuleGate module="news" fallback={<AccessDenied module="news" />}>
                  <PermissionGate permission="news.view" fallback={<AccessDenied />}>
                    <NewsPage />
                  </PermissionGate>
                </ModuleGate>
              }
            />

            {/* Analytics & Reporting (Addon) */}
            <Route
              path="/analytics"
              element={
                <ModuleGate module="analytics" fallback={<AccessDenied module="analytics" />}>
                  <PermissionGate anyPermissions={['analytics.view_basic', 'analytics.view_advanced', 'analytics.view', 'analytics:read']} fallback={<AccessDenied />}>
                    <AnalyticsPage />
                  </PermissionGate>
                </ModuleGate>
              }
            />

            {/* Guests & Hospitality */}
            <Route path="/guests" element={<GuestsPage />} />

            {/* Communications & Chat */}
            <Route path="/chat" element={<ChatPage />} />

            {/* Sponsors & Deliverables */}
            <Route path="/sponsors" element={<SponsorsPage />} />


            {/* Dynamic Plugin Routes (Custom Modules) */}
            {Object.entries(pluginRegistry).map(([featureKey, plugin]) => {
              const PluginComponent = plugin.component;
              const routePath = plugin.route || `/custom-${featureKey.replace('custom', '').toLowerCase()}`;
              return (
                <Route
                  key={featureKey}
                  path={routePath}
                  element={
                    <ModuleGate module={featureKey} fallback={<AccessDenied module={featureKey} />}>
                      <PermissionGate permission={`${featureKey}.view`} fallback={<AccessDenied />}>
                        <Suspense fallback={<PluginLoading />}>
                          <PluginComponent />
                        </Suspense>
                      </PermissionGate>
                    </ModuleGate>
                  }
                />
              );
            })}

            {/* System Administration inside Freecomers Workbench */}
            <Route
              path="/freecomers-admin"
              element={
                <PermissionGate permission="admin:access" fallback={<AccessDenied />}>
                  <AdminPage />
                </PermissionGate>
              }
            />
            <Route
              path="/admin"
              element={
                <PermissionGate permission="admin:access" fallback={<AccessDenied />}>
                  <AdminPage />
                </PermissionGate>
              }
            />
          </Route>

          {/* Default fallback redirects */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </ThemeProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
