/**
 * App — Root Application Component
 * Sets up routing, providers, declarative module gating (<ModuleGate>),
 * and dynamic plugin routes.
 */

import { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './core/context/AuthContext';
import { FestivalProvider } from './core/context/FestivalContext';
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
import DepartmentsPage from './core/pages/DepartmentsPage';
import JuryPage from './core/pages/JuryPage';
import DiscoveryPage from './core/pages/DiscoveryPage';
import NewsPage from './core/pages/NewsPage';
import AnalyticsPage from './core/pages/AnalyticsPage';

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

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
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
            {/* Dashboard (Core) */}
            <Route path="/dashboard" element={<DashboardPage />} />

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

            {/* Review & Scoring Pipeline (Core) */}
            <Route
              path="/reviews"
              element={
                <ModuleGate module="review_dashboard" fallback={<AccessDenied module="review_dashboard" />}>
                  <PermissionGate permission="review.view" fallback={<AccessDenied />}>
                    <ReviewPage />
                  </PermissionGate>
                </ModuleGate>
              }
            />

            {/* Team & Access Control (Core) */}
            <Route
              path="/team"
              element={
                <ModuleGate module="team_management" fallback={<AccessDenied module="team_management" />}>
                  <PermissionGate permission="team.view" fallback={<AccessDenied />}>
                    <TeamPage />
                  </PermissionGate>
                </ModuleGate>
              }
            />

            {/* Payments & Payouts (Core) */}
            <Route
              path="/payments"
              element={
                <ModuleGate module="payments" fallback={<AccessDenied module="payments" />}>
                  <PermissionGate permission="payment.view" fallback={<AccessDenied />}>
                    <PaymentsPage />
                  </PermissionGate>
                </ModuleGate>
              }
            />

            {/* Edition Settings (Core) */}
            <Route
              path="/settings"
              element={
                <ModuleGate module="edition_settings" fallback={<AccessDenied module="edition_settings" />}>
                  <PermissionGate permission="settings.view" fallback={<AccessDenied />}>
                    <SettingsPage />
                  </PermissionGate>
                </ModuleGate>
              }
            />

            {/* Calendar & Screenings (Addon) */}
            <Route
              path="/calendar"
              element={
                <ModuleGate module="calendar" fallback={<AccessDenied module="calendar" />}>
                  <PermissionGate permission="calendar.view" fallback={<AccessDenied />}>
                    <CalendarPage />
                  </PermissionGate>
                </ModuleGate>
              }
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

            {/* Department Management (Addon) */}
            <Route
              path="/departments"
              element={
                <ModuleGate module="departments" fallback={<AccessDenied module="departments" />}>
                  <PermissionGate permission="department.view" fallback={<AccessDenied />}>
                    <DepartmentsPage />
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

            {/* System Administration */}
            <Route
              path="/admin"
              element={
                <PermissionGate permission="admin:access" fallback={<AccessDenied />}>
                  <AdminPage />
                </PermissionGate>
              }
            />
          </Route>

          {/* Default redirect */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
