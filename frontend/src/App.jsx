/**
 * App — Root Application Component
 * Sets up routing, providers, declarative module gating (<ModuleGate>),
 * and dynamic plugin routes.
 */

import { Suspense, useContext } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AuthProvider } from './core/context/AuthContext';
import { FestivalProvider, FestivalContext } from './core/context/FestivalContext';
import { ThemeProvider } from './core/context/ThemeContext';
import ProtectedRoute from './core/components/ProtectedRoute';
import ModuleGate from './core/components/ModuleGate';
import PermissionGate from './core/components/PermissionGate';
import Layout from './core/components/Layout';
import { getPrimaryAccessibleRoute } from './core/utils/routePermissions';

// Core Pages
import LoginPage from './core/pages/LoginPage';
import DashboardPage from './core/pages/DashboardPage';
import SubmissionPage from './core/pages/SubmissionPage';
import FilmReviewPage from './core/pages/FilmReviewPage';
import ReviewPage from './core/pages/ReviewPage';
import TeamPage from './core/pages/TeamPage';
import PaymentsPage from './core/pages/PaymentsPage';
import SettingsPage from './core/pages/SettingsPage';
import ReviewStageCreatePage from './core/pages/ReviewStageCreatePage';
import ReviewStageEditPage from './core/pages/ReviewStageEditPage';
import AdminPage from './core/pages/AdminPage';

// Addon Module Pages
import CalendarPage from './core/pages/CalendarPage';
import TasksPage from './core/pages/TasksPage';
import DiscoveryPage from './core/pages/DiscoveryPage';
import NewsPage from './core/pages/NewsPage';
import AnalyticsPage from './core/pages/AnalyticsPage';
import GuestsPage from './core/pages/GuestsPage';
import ChatPage from './core/pages/ChatPage';
import SponsorsPage from './core/pages/SponsorsPage';

// Audience Module Pages
import AudienceSettingsPage from './core/pages/AudienceSettingsPage';
import AttendancePage from './core/pages/AttendancePage';
import VotingPage from './core/pages/VotingPage';
import RegistrationPage from './core/pages/RegistrationPage';
import AttendeeCreatePage from './core/pages/AttendeeCreatePage';
import AttendeeEditPage from './core/pages/AttendeeEditPage';
import AttendeeAssignQrPage from './core/pages/AttendeeAssignQrPage';
import BulkQrManagementPage from './core/pages/BulkQrManagementPage';
import PublicVotingPage from './core/pages/PublicVotingPage';
import PublicResultsPage from './core/pages/PublicResultsPage';
import { useCanViewRoster } from './core/hooks/useCanViewRoster';

import pluginRegistry from './config/pluginRegistry';

import { LockIcon } from './core/components/common/Icons';
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
  const festivalCtx = useContext(FestivalContext);
  const navigate = useNavigate();

  const isModuleEnabled = festivalCtx?.isModuleEnabled;
  const hasPermission = festivalCtx?.hasPermission;
  const isSuperAdmin = festivalCtx?.isSuperAdmin;
  const currentUserGroup = festivalCtx?.currentUserGroup;
  const currentFestival = festivalCtx?.currentFestival;

  const primaryRoute = getPrimaryAccessibleRoute(isModuleEnabled, hasPermission, isSuperAdmin, currentUserGroup);

  const getPrimaryLabel = (route) => {
    if (route.startsWith('/audience') || route.startsWith('/registration')) return 'Audience & Registration';
    if (route.startsWith('/attendance')) return 'Audience Attendance';
    if (route.startsWith('/submissions')) return 'Submissions Hub';
    if (route.startsWith('/dashboard')) return 'Festival Dashboard';
    if (route.startsWith('/schedule') || route.startsWith('/tasks')) return 'Tasks & Schedule';
    if (route.startsWith('/team')) return 'Team & Members';
    return 'Accessible Area';
  };

  return (
    <div className="permission-denied animate-fade-in" style={{ padding: '64px 24px', textAlign: 'center' }}>
      <div>
        <div className="permission-denied-icon" style={{ marginBottom: '14px', color: 'var(--fc-text-muted)' }}><LockIcon size={48} /></div>
        <p className="permission-denied-text" style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 8px', color: 'var(--fc-text-primary, #1e293b)' }}>
          Access Denied
        </p>
        <p className="permission-denied-subtext" style={{ fontSize: '14px', color: 'var(--fc-text-muted, #64748b)', margin: '0 auto 24px', maxWidth: '460px', lineHeight: 1.5 }}>
          {mod
            ? `The "${mod}" module is not enabled for ${currentFestival?.name || 'this festival edition'}.`
            : `You do not have permission to access this resource in ${currentFestival?.name || 'this festival'}.`}
        </p>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
          {primaryRoute && (
            <button
              type="button"
              onClick={() => navigate(primaryRoute, { replace: true })}
              style={{
                backgroundColor: 'var(--fc-brand-primary, #991b1b)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                padding: '10px 20px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              Go to {getPrimaryLabel(primaryRoute)} →
            </button>
          )}

          {festivalCtx?.festivals?.length > 1 && (
            <button
              type="button"
              onClick={() => festivalCtx.openFestivalModal()}
              style={{
                backgroundColor: 'var(--fc-card-bg, #ffffff)',
                color: 'var(--fc-text-primary, #1e293b)',
                border: '1px solid var(--fc-border-subtle, #e2e8f0)',
                borderRadius: '8px',
                padding: '10px 16px',
                fontSize: '13px',
                fontWeight: 500,
                cursor: 'pointer'
              }}
            >
              Switch Festival
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Full Audience delegate list / Bulk QR stock (registration:view_roster; admins always pass)
function RosterGate({ fallback = null, children }) {
  return useCanViewRoster() ? children : fallback;
}

// Smart home redirect based on enabled modules & permissions
function HomeRedirect() {
  const festivalCtx = useContext(FestivalContext);
  if (!festivalCtx || festivalCtx.loading) {
    return null;
  }

  // While user is selecting workspace upon fresh login, wait at '/' without pre-navigating
  if (festivalCtx.isFestivalModalOpen && sessionStorage.getItem('fc_festival_selected') !== '1') {
    return null;
  }

  const { isModuleEnabled, hasPermission, isSuperAdmin, currentUserGroup } = festivalCtx;
  const primaryRoute = getPrimaryAccessibleRoute(isModuleEnabled, hasPermission, isSuperAdmin, currentUserGroup);

  return <Navigate to={primaryRoute} replace />;
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ThemeProvider>
          <Routes>
          {/* Public Routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/vote/:token" element={<PublicVotingPage />} />
          <Route path="/results/:eventId" element={<PublicResultsPage />} />

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
                  <PermissionGate anyPermissions={['dashboard.view', 'dashboard:view', 'dashboard.manage', 'dashboard:manage']} fallback={<AccessDenied />}>
                    <DashboardPage />
                  </PermissionGate>
                </ModuleGate>
              }
            />

            {/* Submissions Intake (Core) */}
            {/* Submissions Intake & Dedicated Views (Core) */}
            <Route
              path="/submissions"
              element={
                <ModuleGate module="submissions" fallback={<AccessDenied module="submissions" />}>
                  <PermissionGate anyPermissions={['submission.view', 'submission:view', 'review.view', 'review:view', 'review.score', 'review:score', 'jury.submit_ballot', 'jury:submit_ballot']} fallback={<AccessDenied />}>
                    <SubmissionPage />
                  </PermissionGate>
                </ModuleGate>
              }
            />
            <Route
              path="/submissions/all"
              element={<Navigate to="/submissions" replace />}
            />
            <Route
              path="/submissions/new-submissions"
              element={
                <ModuleGate module="submissions" fallback={<AccessDenied module="submissions" />}>
                  <PermissionGate anyPermissions={['submission.view', 'submission:view', 'review.view', 'review:view', 'review.score', 'review:score', 'jury.submit_ballot', 'jury:submit_ballot']} fallback={<AccessDenied />}>
                    <SubmissionPage />
                  </PermissionGate>
                </ModuleGate>
              }
            />
            <Route
              path="/submissions/under-review"
              element={
                <ModuleGate module="submissions" fallback={<AccessDenied module="submissions" />}>
                  <PermissionGate anyPermissions={['submission.view', 'submission:view', 'review.view', 'review:view', 'review.score', 'review:score', 'jury.submit_ballot', 'jury:submit_ballot']} fallback={<AccessDenied />}>
                    <SubmissionPage />
                  </PermissionGate>
                </ModuleGate>
              }
            />
            <Route
              path="/submissions/rejected"
              element={
                <ModuleGate module="submissions" fallback={<AccessDenied module="submissions" />}>
                  <PermissionGate anyPermissions={['submission.view', 'submission:view', 'review.view', 'review:view', 'review.score', 'review:score', 'jury.submit_ballot', 'jury:submit_ballot']} fallback={<AccessDenied />}>
                    <SubmissionPage />
                  </PermissionGate>
                </ModuleGate>
              }
            />
            <Route
              path="/submissions/activity"
              element={
                <ModuleGate module="submissions" fallback={<AccessDenied module="submissions" />}>
                  <PermissionGate anyPermissions={['submission.view', 'submission:view', 'review.view', 'review:view', 'review.score', 'review:score', 'jury.submit_ballot', 'jury:submit_ballot']} fallback={<AccessDenied />}>
                    <SubmissionPage />
                  </PermissionGate>
                </ModuleGate>
              }
            />
            <Route
              path="/submissions/activity-log"
              element={<Navigate to="/submissions/activity" replace />}
            />

            {/* Sequential Stage & Board Views */}
            <Route
              path="/submissions/stage/:stageId"
              element={
                <ModuleGate module="submissions" fallback={<AccessDenied module="submissions" />}>
                  <PermissionGate anyPermissions={['submission.view', 'submission:view', 'review.view', 'review:view', 'review.score', 'review:score', 'jury.submit_ballot', 'jury:submit_ballot']} fallback={<AccessDenied />}>
                    <SubmissionPage />
                  </PermissionGate>
                </ModuleGate>
              }
            />
            <Route
              path="/submissions/screening"
              element={
                <ModuleGate module="submissions" fallback={<AccessDenied module="submissions" />}>
                  <PermissionGate anyPermissions={['submission.view', 'submission:view', 'review.view', 'review:view', 'review.score', 'review:score', 'jury.submit_ballot', 'jury:submit_ballot']} fallback={<AccessDenied />}>
                    <SubmissionPage />
                  </PermissionGate>
                </ModuleGate>
              }
            />
            <Route
              path="/submissions/consideration"
              element={
                <ModuleGate module="submissions" fallback={<AccessDenied module="submissions" />}>
                  <PermissionGate anyPermissions={['submission.view', 'submission:view', 'review.view', 'review:view', 'review.score', 'review:score', 'jury.submit_ballot', 'jury:submit_ballot']} fallback={<AccessDenied />}>
                    <SubmissionPage />
                  </PermissionGate>
                </ModuleGate>
              }
            />
            <Route
              path="/submissions/official-selection"
              element={
                <ModuleGate module="submissions" fallback={<AccessDenied module="submissions" />}>
                  <PermissionGate anyPermissions={['submission.view', 'submission:view', 'review.view', 'review:view', 'review.score', 'review:score', 'jury.submit_ballot', 'jury:submit_ballot']} fallback={<AccessDenied />}>
                    <SubmissionPage />
                  </PermissionGate>
                </ModuleGate>
              }
            />
            <Route
              path="/submissions/nominations"
              element={
                <ModuleGate module="submissions" fallback={<AccessDenied module="submissions" />}>
                  <PermissionGate anyPermissions={['submission.view', 'submission:view', 'review.view', 'review:view', 'review.score', 'review:score', 'jury.submit_ballot', 'jury:submit_ballot']} fallback={<AccessDenied />}>
                    <SubmissionPage />
                  </PermissionGate>
                </ModuleGate>
              }
            />
            <Route
              path="/submissions/jury-voting"
              element={
                <ModuleGate module="submissions" fallback={<AccessDenied module="submissions" />}>
                  <PermissionGate anyPermissions={['submission.view', 'submission:view', 'review.view', 'review:view', 'review.score', 'review:score', 'jury.submit_ballot', 'jury:submit_ballot']} fallback={<AccessDenied />}>
                    <SubmissionPage />
                  </PermissionGate>
                </ModuleGate>
              }
            />
            <Route
              path="/submissions/finalists"
              element={
                <ModuleGate module="submissions" fallback={<AccessDenied module="submissions" />}>
                  <PermissionGate anyPermissions={['submission.view', 'submission:view', 'review.view', 'review:view', 'review.score', 'review:score', 'jury.submit_ballot', 'jury:submit_ballot']} fallback={<AccessDenied />}>
                    <SubmissionPage />
                  </PermissionGate>
                </ModuleGate>
              }
            />
            <Route
              path="/submissions/finalist"
              element={<Navigate to="/submissions/finalists" replace />}
            />
            <Route
              path="/submissions/winners"
              element={
                <ModuleGate module="submissions" fallback={<AccessDenied module="submissions" />}>
                  <PermissionGate anyPermissions={['submission.view', 'submission:view', 'review.view', 'review:view', 'review.score', 'review:score', 'jury.submit_ballot', 'jury:submit_ballot']} fallback={<AccessDenied />}>
                    <SubmissionPage />
                  </PermissionGate>
                </ModuleGate>
              }
            />
            <Route
              path="/submissions/winner"
              element={<Navigate to="/submissions/winners" replace />}
            />

            {/* Film Rate & Review Dedicated Page */}
            <Route
              path="/submissions/:id/review"
              element={
                <ModuleGate module="submissions" fallback={<AccessDenied module="submissions" />}>
                  <PermissionGate anyPermissions={['review.score', 'review:score', 'review.view', 'review:view', 'submission.view', 'submission:view', 'jury.submit_ballot', 'jury:submit_ballot']} fallback={<AccessDenied />}>
                    <FilmReviewPage />
                  </PermissionGate>
                </ModuleGate>
              }
            />
            <Route
              path="/submissions/:id/rate"
              element={
                <ModuleGate module="submissions" fallback={<AccessDenied module="submissions" />}>
                  <PermissionGate anyPermissions={['review.score', 'review:score', 'review.view', 'review:view', 'submission.view', 'submission:view', 'jury.submit_ballot', 'jury:submit_ballot']} fallback={<AccessDenied />}>
                    <FilmReviewPage />
                  </PermissionGate>
                </ModuleGate>
              }
            />
            {/* Legacy route alias */}
            <Route
              path="/submission"
              element={<Navigate to="/submissions" replace />}
            />

            {/* Review Dashboard merged into Master Submissions Hub */}
            <Route
              path="/review-dashboard"
              element={<Navigate to="/submissions" replace />}
            />
            {/* Legacy route alias */}
            <Route
              path="/reviews"
              element={<Navigate to="/submissions" replace />}
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

            {/* Settings (Module) & Review State (SubModule) */}
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

            {/* Review Stage (/settings/review-stage) */}
            <Route
              path="/settings/review-stage"
              element={
                <ModuleGate module="settings" fallback={<AccessDenied module="settings" />}>
                  <PermissionGate anyPermissions={['settings.manage', 'settings:manage', 'settings.view', 'settings:view']} fallback={<AccessDenied />}>
                    <SettingsPage />
                  </PermissionGate>
                </ModuleGate>
              }
            />
            <Route path="/settings/review-state" element={<Navigate to="/settings/review-stage" replace />} />
            <Route path="/settings/review-states" element={<Navigate to="/settings/review-stage" replace />} />
            <Route path="/settings/review-stages" element={<Navigate to="/settings/review-stage" replace />} />

            {/* Create Review Stage: /settings/review-stage/create */}
            <Route
              path="/settings/review-stage/create"
              element={
                <ModuleGate module="settings" fallback={<AccessDenied module="settings" />}>
                  <PermissionGate anyPermissions={['settings.manage', 'settings:manage', 'settings.view', 'settings:view']} fallback={<AccessDenied />}>
                    <ReviewStageCreatePage />
                  </PermissionGate>
                </ModuleGate>
              }
            />
            <Route path="/settings/review-state/create" element={<Navigate to="/settings/review-stage/create" replace />} />

            {/* Edit Review Stage: /settings/review-stage/edit/:id and aliases */}
            <Route
              path="/settings/review-state/edit/:id"
              element={
                <ModuleGate module="settings" fallback={<AccessDenied module="settings" />}>
                  <PermissionGate anyPermissions={['settings.manage', 'settings:manage', 'settings.view', 'settings:view']} fallback={<AccessDenied />}>
                    <ReviewStageEditPage />
                  </PermissionGate>
                </ModuleGate>
              }
            />
            <Route
              path="/settings/review-stage/edit/:id"
              element={
                <ModuleGate module="settings" fallback={<AccessDenied module="settings" />}>
                  <PermissionGate anyPermissions={['settings.manage', 'settings:manage', 'settings.view', 'settings:view']} fallback={<AccessDenied />}>
                    <ReviewStageEditPage />
                  </PermissionGate>
                </ModuleGate>
              }
            />
            <Route
              path="/setting/review-state/edit/:id"
              element={
                <ModuleGate module="settings" fallback={<AccessDenied module="settings" />}>
                  <PermissionGate anyPermissions={['settings.manage', 'settings:manage', 'settings.view', 'settings:view']} fallback={<AccessDenied />}>
                    <ReviewStageEditPage />
                  </PermissionGate>
                </ModuleGate>
              }
            />
            <Route
              path="/setting/review-stage/edit/:id"
              element={
                <ModuleGate module="settings" fallback={<AccessDenied module="settings" />}>
                  <PermissionGate anyPermissions={['settings.manage', 'settings:manage', 'settings.view', 'settings:view']} fallback={<AccessDenied />}>
                    <ReviewStageEditPage />
                  </PermissionGate>
                </ModuleGate>
              }
            />

            {/* Festival Schedule Grid (Sub-Page under Tasks Module) */}
            <Route
              path="/schedule"
              element={
                <ModuleGate module="tasks" fallback={<AccessDenied module="tasks" />}>
                  <PermissionGate anyPermissions={['schedule.view', 'schedule:view', 'calendar.view', 'calendar:view', 'task.view', 'task:view']} fallback={<AccessDenied />}>
                    <CalendarPage />
                  </PermissionGate>
                </ModuleGate>
              }
            />
            <Route
              path="/calendar"
              element={<Navigate to="/schedule" replace />}
            />
            <Route
              path="/tasks/schedule"
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

            {/* Audience Settings under Settings: /settings/audience */}
            <Route
              path="/settings/audience"
              element={
                <ModuleGate module="audience" fallback={<AccessDenied module="audience" />}>
                  <PermissionGate anyPermissions={['audience.view', 'audience:view', 'audience.manage', 'audience:manage', 'settings.manage', 'settings:manage', 'settings.view', 'settings:view']} fallback={<AccessDenied />}>
                    <AudienceSettingsPage />
                  </PermissionGate>
                </ModuleGate>
              }
            />
            <Route path="/settings/Audience" element={<Navigate to="/settings/audience" replace />} />
            <Route
              path="/audience"
              element={
                <ModuleGate module="audience" fallback={<AccessDenied module="audience" />}>
                  <RosterGate fallback={<AccessDenied />}>
                    <RegistrationPage />
                  </RosterGate>
                </ModuleGate>
              }
            />
            <Route path="/Audience" element={<Navigate to="/audience" replace />} />
            <Route path="/registration" element={<Navigate to="/registration/add" replace />} />
            <Route path="/Registration" element={<Navigate to="/registration/add" replace />} />
            <Route
              path="/attendance"
              element={
                <ModuleGate module="audience" fallback={<AccessDenied module="audience" />}>
                  <PermissionGate permission="attendance.view" fallback={<AccessDenied />}>
                    <AttendancePage />
                  </PermissionGate>
                </ModuleGate>
              }
            />
            <Route
              path="/voting"
              element={
                <ModuleGate module="audience" fallback={<AccessDenied module="audience" />}>
                  <PermissionGate permission="voting.view_results" fallback={<AccessDenied />}>
                    <VotingPage />
                  </PermissionGate>
                </ModuleGate>
              }
            />
            <Route
              path="/registration/add"
              element={
                <ModuleGate module="audience" fallback={<AccessDenied module="audience" />}>
                  <PermissionGate anyPermissions={['registration.create', 'registration:create', 'registration.view', 'registration:view']} fallback={<AccessDenied />}>
                    <AttendeeCreatePage />
                  </PermissionGate>
                </ModuleGate>
              }
            />
            <Route
              path="/registration/edit/:id"
              element={
                <ModuleGate module="audience" fallback={<AccessDenied module="audience" />}>
                  <PermissionGate anyPermissions={['registration.create', 'registration:create', 'registration.view', 'registration:view']} fallback={<AccessDenied />}>
                    <AttendeeEditPage />
                  </PermissionGate>
                </ModuleGate>
              }
            />
            <Route
              path="/registration/:id/edit"
              element={
                <ModuleGate module="audience" fallback={<AccessDenied module="audience" />}>
                  <PermissionGate anyPermissions={['registration.create', 'registration:create', 'registration.view', 'registration:view']} fallback={<AccessDenied />}>
                    <AttendeeEditPage />
                  </PermissionGate>
                </ModuleGate>
              }
            />
            <Route
              path="/registration/assign-qr"
              element={
                <ModuleGate module="audience" fallback={<AccessDenied module="audience" />}>
                  <PermissionGate anyPermissions={['registration.create', 'registration:create', 'registration.view', 'registration:view']} fallback={<AccessDenied />}>
                    <AttendeeAssignQrPage />
                  </PermissionGate>
                </ModuleGate>
              }
            />
            <Route
              path="/registration/assign-qr/:id"
              element={
                <ModuleGate module="audience" fallback={<AccessDenied module="audience" />}>
                  <PermissionGate anyPermissions={['registration.create', 'registration:create', 'registration.view', 'registration:view']} fallback={<AccessDenied />}>
                    <AttendeeAssignQrPage />
                  </PermissionGate>
                </ModuleGate>
              }
            />
            <Route
              path="/registration/bulk-qr"
              element={
                <ModuleGate module="audience" fallback={<AccessDenied module="audience" />}>
                  <RosterGate fallback={<AccessDenied />}>
                    <BulkQrManagementPage />
                  </RosterGate>
                </ModuleGate>
              }
            />
            <Route path="/registration/new" element={<Navigate to="/registration/add" replace />} />


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
              element={<Navigate to="/dashboard" replace />}
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
