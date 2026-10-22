/**
 * Freecomers Workbench Sidebar
 * Matches the canonical UI layout from freecomers.pages.dev and screenshot:
 * - Brand: "freecomers" + "FESTIVAL OPERATING SYSTEM"
 * - ACTIVE ROLE box with instant persona switcher (Admin, Judge, Volunteer)
 * - Festival Edition card: "Indie Film Festival Bangalore" (Edition 4 · 2026)
 * - Grouped navigation with canonical badges:
 *   - Submissions [23]
 *   - Schedule [1] (conflict indicator)
 *   - Sponsors [5]
 *   - Guests & Hospitality [1]
 *   - Team [3]
 *   - Tickets [Soon]
 * - User profile footer with initials and moon icon
 */

import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useFestivalConfig } from '../hooks/useFestivalConfig';
import { usePermissions } from '../hooks/usePermissions';
import { useTheme } from '../context/ThemeContext';
import api from '../services/api';
import { 
  DashboardIcon, 
  MovieIcon, 
  PeopleIcon, 
  SettingsIcon, 
  TuneIcon, 
  LightModeIcon, 
  DarkModeIcon,
  SearchIcon,
  LocalOfferIcon
} from './common/Icons';

function ChevronIcon({ isOpen }) {
  return (
    <svg 
      className={`fc-chevron-icon ${isOpen ? 'is-open' : ''}`} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2.5" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

export default function Sidebar() {
  const { user, logout, switchPersona } = useAuth();
  const { 
    currentFestival, 
    currentEdition, 
    isModuleEnabled, 
    isSaasEnabled, 
    isSuperAdmin, 
    festivals, 
    selectFestival, 
    currentUserGroup,
    openFestivalModal 
  } = useFestivalConfig();
  const { can, canAny } = usePermissions();
  const { theme, toggleTheme, isDark } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = location.pathname;

  const [openModules, setOpenModules] = useState({
    submissions: true,
    team: true,
    tasks: true,
    audience: true,
    marketing: false,
    settings: true,
  });

  // Auto-expand module when current route is within it
  useEffect(() => {
    if (['/submissions', '/review-dashboard'].some(p => currentPath.startsWith(p))) {
      setOpenModules(prev => ({ ...prev, submissions: true }));
    }
    if (currentPath.startsWith('/team')) {
      setOpenModules(prev => ({ ...prev, team: true }));
    }
    if (['/tasks', '/schedule', '/calendar'].some(p => currentPath.startsWith(p))) {
      setOpenModules(prev => ({ ...prev, tasks: true }));
    }
    if (['/audience', '/registration', '/attendance', '/voting', '/vote'].some(p => currentPath.startsWith(p))) {
      setOpenModules(prev => ({ ...prev, audience: true }));
    }
    if (['/submission-buttons', '/laurel'].some(p => currentPath.startsWith(p))) {
      setOpenModules(prev => ({ ...prev, marketing: true }));
    }
    if (['/settings', '/setting'].some(p => currentPath.startsWith(p))) {
      setOpenModules(prev => ({ ...prev, settings: true }));
    }
  }, [currentPath]);

  const toggleModule = (moduleKey) => {
    setOpenModules(prev => ({ ...prev, [moduleKey]: !prev[moduleKey] }));
  };

  const isSubmissionsActive = ['/submissions', '/review-dashboard'].some(p => currentPath.startsWith(p));
  const isTeamActive = currentPath.startsWith('/team');
  const isTasksActive = ['/tasks', '/schedule', '/calendar'].some(p => currentPath.startsWith(p));
  const isAudienceActive = ['/audience', '/registration', '/attendance', '/voting', '/vote'].some(p => currentPath.startsWith(p));
  const isMarketingActive = ['/submission-buttons', '/laurel'].some(p => currentPath.startsWith(p));
  const isSettingsActive = ['/settings', '/setting'].some(p => currentPath.startsWith(p));

  // Determine current active persona / role key
  const effectiveGroup = currentUserGroup || user?.current_group || (isSuperAdmin ? 'admin' : (user?.isSuperAdmin ? 'admin' : 'jury'));
  const roleKey = effectiveGroup === 'judge' ? 'jury' : effectiveGroup;
  const isAdminUser = Boolean(isSuperAdmin || effectiveGroup === 'admin' || user?.isSuperAdmin);

  const userRoleKeys = Array.from(new Set([
    ...(user?.eventGroups?.map(eg => eg.group_key) || []),
    ...(user?.roles?.map(r => r.group_key) || []),
    roleKey
  ])).filter(Boolean);

  // ── Core Modules Permission & Feature Checks ──
  const canAccessDashboard = isModuleEnabled('dashboard') && (isAdminUser || canAny(['dashboard.view', 'dashboard:view', 'dashboard.manage', 'dashboard:manage']));

  const canAccessSubmissions = isModuleEnabled('submissions') && (isAdminUser || canAny([
    'submission.view', 'submission:view',
    'review.view', 'review:view',
    'review.score', 'review:score',
    'jury.submit_ballot', 'jury:submit_ballot'
  ]));

  const canAccessDiscovery = isModuleEnabled('discovery') && (isAdminUser || canAny(['discovery.view', 'discovery:view', 'discovery.browse', 'discovery:browse']));

  const canAccessPayouts = (isModuleEnabled('payouts') || isModuleEnabled('payments')) && (isAdminUser || canAny([
    'payouts.view', 'payouts:view',
    'payment.view', 'payment:view',
    'payouts.manage', 'payouts:manage'
  ]));

  const canAccessTeam = (isModuleEnabled('team') || isModuleEnabled('team_management')) && (isAdminUser || canAny(['team.view', 'team:view', 'team.manage', 'team:manage']));
  const canManageTeam = isAdminUser || canAny(['team.manage', 'team:manage', 'settings.manage', 'settings:manage']);

  const canAccessSettings = (isModuleEnabled('settings') || isModuleEnabled('edition_settings')) && (isAdminUser || canAny(['settings.view', 'settings:view', 'settings.manage', 'settings:manage']));

  const hasAnyCoreModules = canAccessDashboard || canAccessSubmissions || canAccessDiscovery || canAccessPayouts || canAccessTeam || canAccessSettings;

  // ── Add-On Modules Permission & Feature Checks ──
  const isTasksModEnabled = isModuleEnabled('tasks') || isModuleEnabled('schedule') || isModuleEnabled('calendar');
  const canAccessTaskBoard = isTasksModEnabled && (isAdminUser || canAny(['task.view', 'task:view', 'tasks.view', 'tasks:view', 'task.manage', 'task:manage']));
  const canAccessSchedule = isTasksModEnabled && (isAdminUser || canAny(['schedule.view', 'schedule:view', 'calendar.view', 'calendar:view']));
  const canAccessTasks = canAccessTaskBoard || canAccessSchedule;

  const canAccessSponsors = isModuleEnabled('sponsors') && (isAdminUser || canAny(['sponsors.view', 'sponsors:view', 'sponsors.manage', 'sponsors:manage']));

  const canAccessComms = (isModuleEnabled('comms') || isModuleEnabled('chat')) && (isAdminUser || canAny(['chat.view', 'chat:view', 'comms.view', 'comms:view']));

  const canAccessGuests = isModuleEnabled('guests') && (isAdminUser || canAny(['guest.view', 'guest:view', 'guests.view', 'guests:view', 'hospitality.view', 'hospitality:view']));

  const isAudienceModEnabled = isModuleEnabled('audience');
  const canAccessAudienceSettings = isAudienceModEnabled && (isAdminUser || canAny(['audience.view', 'audience:view', 'audience.manage', 'audience:manage']));
  const canAccessRegistration = isAudienceModEnabled && (isAdminUser || canAny(['registration.view', 'registration:view', 'tickets.view', 'tickets:view']));
  const canAccessAttendance = isAudienceModEnabled && (isAdminUser || canAny(['attendance.view', 'attendance:view']));
  const canAccessVoting = isAudienceModEnabled && (isAdminUser || canAny(['voting.view_results', 'voting:view_results', 'voting.vote', 'voting:vote']));
  const canAccessAudience = canAccessAudienceSettings || canAccessRegistration || canAccessAttendance || canAccessVoting;

  const isMarketingModEnabled = isModuleEnabled('marketing');
  const canAccessMarketingButtons = isMarketingModEnabled && (isAdminUser || canAny(['marketing.view', 'marketing:view', 'marketing.manage', 'marketing:manage']));
  const canAccessLaurel = isMarketingModEnabled && (isAdminUser || canAny(['marketing.view', 'marketing:view', 'marketing.manage', 'marketing:manage']));
  const canAccessMarketing = canAccessMarketingButtons || canAccessLaurel;

  const hasAnyAddonModules = canAccessTasks || canAccessSponsors || canAccessComms || canAccessGuests || canAccessAudience || canAccessMarketing;



  const getInitials = (name) => {
    if (!name) return 'SH';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  const displayName = user?.name || user?.email?.split('@')[0] || 'SHASHANK';
  const isFestivalOwner = Boolean(
    currentFestival?.is_owner || 
    (currentFestival?.user_id && (user?.id === currentFestival?.user_id || user?.userIds?.includes(currentFestival?.user_id)))
  );
  const displayRole = isFestivalOwner 
    ? 'Festival Owner · Admin' 
    : (roleKey === 'jury' || roleKey === 'judge') 
      ? 'Jury · Jury Member' 
      : roleKey === 'volunteer' 
        ? 'Volunteer · Operations' 
        : (currentFestival?.role_label || 'Admin · Team Member');

  return (
    <aside className="fc-sidebar">
      {/* Brand Header */}
      <div className="fc-sidebar-header">
        <div className="fc-brand">
          <span className="fc-brand-title">freecomers</span>
          <span className="fc-brand-subtitle">FESTIVAL OPERATING SYSTEM</span>
        </div>
        <button className="fc-collapse-btn" title="Collapse sidebar" aria-label="Collapse">
          ‹
        </button>
      </div>

      {/* Festival Edition Card */}
      <div 
        className="fc-festival-card"
        style={festivals && festivals.length > 1 ? { cursor: 'pointer', transition: 'border-color 0.15s ease' } : {}}
        onClick={() => {
          if (festivals && festivals.length > 1 && openFestivalModal) {
            openFestivalModal();
          }
        }}
        title={festivals && festivals.length > 1 ? "Click to switch festival workspace" : undefined}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', marginBottom: '2px' }}>
          <div className="fc-festival-name" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {currentFestival?.name || 'Indie Film Festival Bangalore'}
          </div>
          {festivals && festivals.length > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (openFestivalModal) openFestivalModal();
              }}
              style={{
                background: 'rgba(168, 47, 47, 0.08)',
                color: 'var(--fc-brand, #a82f2f)',
                border: '1px solid rgba(168, 47, 47, 0.22)',
                borderRadius: '5px',
                padding: '2px 7px',
                fontSize: '0.675rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                flexShrink: 0,
                lineHeight: 1.2
              }}
              title="Switch Festival Workspace"
            >
              <span>⇄</span>
              <span>Switch</span>
            </button>
          )}
        </div>
        <div className="fc-festival-edition">
          {currentFestival?.edition || 'Edition 4 · 2026'}
        </div>
        <div className="fc-festival-status">
          <span className="fc-status-dot" style={!isSaasEnabled ? { backgroundColor: '#ef4444' } : {}}></span>
          <span>{isSaasEnabled ? 'Live · Accepting submissions' : 'SaaS Inactive · Central Managed'}</span>
        </div>
      </div>

      {/* Navigation Menu */}
      <nav className="fc-nav">
        {/* ── CORE MODULES ── */}
        {hasAnyCoreModules && (
          <>
            <div className="fc-section-header">
              <span className="fc-section-title">CORE MODULES</span>
              <span className="fc-section-pill">Core</span>
            </div>

            {/* Dashboard (Single Page) */}
            {canAccessDashboard && (
              <div className="fc-module-block">
                <NavLink 
                  to="/dashboard" 
                  className={({ isActive }) => `fc-nav-item ${isActive ? 'active' : ''}`}
                >
                  <DashboardIcon size={17} style={{ marginRight: '8px' }} />
                  <span>Dashboard</span>
                </NavLink>
              </div>
            )}

            {/* Submissions (All-in-One Master Submissions Hub) */}
            {canAccessSubmissions && (
              <div className="fc-module-block">
                <NavLink 
                  to="/submissions" 
                  className={({ isActive }) => `fc-nav-item ${isActive || location.pathname.startsWith('/submissions') || location.pathname.startsWith('/review') ? 'active' : ''}`}
                >
                  <MovieIcon size={17} style={{ marginRight: '8px' }} />
                  <span>Submissions</span>
                </NavLink>
              </div>
            )}

            {/* Discovery (Single Page) */}
            {canAccessDiscovery && (
              <div className="fc-module-block">
                <NavLink 
                  to="/discovery" 
                  className={({ isActive }) => `fc-nav-item ${isActive ? 'active' : ''}`}
                >
                  <SearchIcon size={17} style={{ marginRight: '8px' }} />
                  <span>Discovery</span>
                </NavLink>
              </div>
            )}

            {/* Payouts (Single Page - Core) */}
            {canAccessPayouts && (
              <div className="fc-module-block">
                <NavLink 
                  to="/payouts" 
                  className={({ isActive }) => `fc-nav-item ${isActive ? 'active' : ''}`}
                >
                  <LocalOfferIcon size={17} style={{ marginRight: '8px' }} />
                  <span>Payouts</span>
                </NavLink>
              </div>
            )}

            {/* Team (Core) */}
            {canAccessTeam && (
              <div className="fc-module-block">
                <NavLink 
                  to="/team" 
                  className={({ isActive }) => `fc-nav-item ${isActive ? 'active' : ''}`}
                >
                  <PeopleIcon size={17} style={{ marginRight: '8px' }} />
                  <span>Team</span>
                </NavLink>
              </div>
            )}

            {/* Settings Module with Submodule (Review Stage) */}
            {canAccessSettings && (
              <div className="fc-module-block">
                <button 
                  type="button"
                  className={`fc-module-toggle ${isSettingsActive ? 'is-active-module' : ''}`}
                  onClick={() => toggleModule('settings')}
                  aria-expanded={openModules.settings}
                >
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <SettingsIcon size={17} style={{ marginRight: '8px' }} />
                    <span className="fc-toggle-title">Settings</span>
                  </div>
                  <div className="fc-toggle-actions">
                    <ChevronIcon isOpen={openModules.settings} />
                  </div>
                </button>
                {openModules.settings && (
                  <div className="fc-sub-nav">
                    <NavLink 
                      to="/settings/review-stage" 
                      className={({ isActive }) => `fc-nav-item ${isActive || currentPath.includes('/review-stage') || currentPath.includes('/review-state') ? 'active' : ''}`}
                    >
                      <TuneIcon size={15} style={{ marginRight: '8px' }} />
                      <span>Review Stage</span>
                    </NavLink>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ── ADD-ON MODULES ── */}
        {hasAnyAddonModules && (
          <>
            <div className="fc-section-divider"></div>
            <div className="fc-section-header">
              <span className="fc-section-title">ADD-ON MODULES</span>
              <span className="fc-section-pill fc-pill-addon">Add-ons</span>
            </div>

            {/* Tasks & Schedule */}
            {canAccessTasks && (
              <div className="fc-module-block">
                <button 
                  type="button"
                  className={`fc-module-toggle ${isTasksActive ? 'is-active-module' : ''}`}
                  onClick={() => toggleModule('tasks')}
                  aria-expanded={openModules.tasks}
                >
                  <span className="fc-toggle-title">Tasks</span>
                  <div className="fc-toggle-actions">
                    <ChevronIcon isOpen={openModules.tasks} />
                  </div>
                </button>
                {openModules.tasks && (
                  <div className="fc-sub-nav">
                    {canAccessTaskBoard && (
                      <NavLink 
                        to="/tasks" 
                        className={({ isActive }) => `fc-nav-item ${isActive ? 'active' : ''}`}
                      >
                        <span>Tasks Board</span>
                      </NavLink>
                    )}
                    {canAccessSchedule && (
                      <NavLink 
                        to="/schedule" 
                        className={({ isActive }) => `fc-nav-item ${isActive ? 'active' : ''}`}
                      >
                        <span>Schedule</span>
                      </NavLink>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Sponsors */}
            {canAccessSponsors && (
              <div className="fc-module-block">
                <NavLink 
                  to="/sponsors" 
                  className={({ isActive }) => `fc-nav-item ${isActive ? 'active' : ''}`}
                >
                  <span>Sponsors</span>
                </NavLink>
              </div>
            )}

            {/* Communications */}
            {canAccessComms && (
              <div className="fc-module-block">
                <NavLink 
                  to="/chat" 
                  className={({ isActive }) => `fc-nav-item ${isActive ? 'active' : ''}`}
                >
                  <span>Communications</span>
                </NavLink>
              </div>
            )}

            {/* Guests & Hospitality */}
            {canAccessGuests && (
              <div className="fc-module-block">
                <NavLink 
                  to="/guests" 
                  className={({ isActive }) => `fc-nav-item ${isActive ? 'active' : ''}`}
                >
                  <span>Guests & Hospitality</span>
                </NavLink>
              </div>
            )}

            {/* Audience & Voting */}
            {canAccessAudience && (
              <div className="fc-module-block">
                <button 
                  type="button"
                  className={`fc-module-toggle ${isAudienceActive ? 'is-active-module' : ''}`}
                  onClick={() => toggleModule('audience')}
                  aria-expanded={openModules.audience}
                >
                  <span className="fc-toggle-title">Audience & Voting</span>
                  <div className="fc-toggle-actions">
                    <span className="fc-badge fc-badge-blue">Live</span>
                    <ChevronIcon isOpen={openModules.audience} />
                  </div>
                </button>
                {openModules.audience && (
                  <div className="fc-sub-nav">
                    {canAccessAudienceSettings && (
                      <NavLink 
                        to="/audience" 
                        className={({ isActive }) => `fc-nav-item ${isActive ? 'active' : ''}`}
                      >
                        <span>Audience Settings</span>
                      </NavLink>
                    )}
                    {canAccessRegistration && (
                      <NavLink 
                        to="/registration" 
                        className={({ isActive }) => `fc-nav-item ${isActive ? 'active' : ''}`}
                      >
                        <span>Registration & Passes</span>
                      </NavLink>
                    )}
                    {canAccessAttendance && (
                      <NavLink 
                        to="/attendance" 
                        className={({ isActive }) => `fc-nav-item ${isActive ? 'active' : ''}`}
                      >
                        <span>Gate Attendance</span>
                        <span className="fc-badge fc-badge-blue">Live</span>
                      </NavLink>
                    )}
                    {canAccessVoting && (
                      <NavLink 
                        to="/voting" 
                        className={({ isActive }) => `fc-nav-item ${isActive ? 'active' : ''}`}
                      >
                        <span>Audience Voting</span>
                        <span className="fc-badge fc-badge-amber">Awards</span>
                      </NavLink>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Marketing */}
            {canAccessMarketing && (
              <div className="fc-module-block">
                <button 
                  type="button"
                  className={`fc-module-toggle ${isMarketingActive ? 'is-active-module' : ''}`}
                  onClick={() => toggleModule('marketing')}
                  aria-expanded={openModules.marketing}
                >
                  <span className="fc-toggle-title">Marketing</span>
                  <div className="fc-toggle-actions">
                    <ChevronIcon isOpen={openModules.marketing} />
                  </div>
                </button>
                {openModules.marketing && (
                  <div className="fc-sub-nav">
                    {canAccessMarketingButtons && (
                      <NavLink 
                        to="/submission-buttons" 
                        className={({ isActive }) => `fc-nav-item ${isActive ? 'active' : ''}`}
                      >
                        <span>Submission Buttons</span>
                      </NavLink>
                    )}
                    {canAccessLaurel && (
                      <NavLink 
                        to="/laurel" 
                        className={({ isActive }) => `fc-nav-item ${isActive ? 'active' : ''}`}
                      >
                        <span>Laurel Studio</span>
                      </NavLink>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </nav>

      {/* User Profile Footer */}
      <div className="fc-user-footer">
        <div className="fc-avatar" style={{ overflow: 'hidden', position: 'relative' }}>
          {user?.thumbnail_pic || user?.thumbnailPic || user?.thumbnail ? (
            <img
              src={user.thumbnail_pic || user.thumbnailPic || user.thumbnail}
              alt={displayName}
              style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                if (e.currentTarget.nextSibling) {
                  e.currentTarget.nextSibling.style.display = 'flex';
                }
              }}
            />
          ) : null}
          <span style={{ display: (user?.thumbnail_pic || user?.thumbnailPic || user?.thumbnail) ? 'none' : 'flex', width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
            {getInitials(displayName)}
          </span>
        </div>
        <div className="fc-user-meta">
          <div className="fc-user-name">{displayName}</div>
          <div className="fc-user-role">{displayRole}</div>
        </div>
        <button
          className="fc-theme-toggle"
          onClick={toggleTheme}
          title={isDark ? "Switch to light theme" : "Switch to dark theme"}
          aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
        >
          {isDark ? <LightModeIcon size={18} /> : <DarkModeIcon size={18} />}
        </button>
        <button
          className="fc-logout-btn"
          onClick={logout}
          title="Sign out / Logout"
          aria-label="Sign out"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
            <polyline points="16 17 21 12 16 7"></polyline>
            <line x1="21" y1="12" x2="9" y2="12"></line>
          </svg>
        </button>
      </div>
    </aside>
  );
}
