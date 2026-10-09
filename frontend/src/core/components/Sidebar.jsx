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
import { useTheme } from '../context/ThemeContext';
import api from '../services/api';

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
  const { currentFestival, currentEdition, isModuleEnabled, isSaasEnabled, isSuperAdmin, festivals, selectFestival } = useFestivalConfig();
  const { theme, toggleTheme, isDark } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = location.pathname;
  const [switching, setSwitching] = useState(false);
  const [submissionCount, setSubmissionCount] = useState(null);

  const [openModules, setOpenModules] = useState({
    submissions: true,
    tasks: true,
    audience: true,
    marketing: false,
  });

  // Auto-expand module when current route is within it
  useEffect(() => {
    if (['/submissions', '/review-dashboard'].some(p => currentPath.startsWith(p))) {
      setOpenModules(prev => ({ ...prev, submissions: true }));
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
  }, [currentPath]);

  const toggleModule = (moduleKey) => {
    setOpenModules(prev => ({ ...prev, [moduleKey]: !prev[moduleKey] }));
  };

  const isSubmissionsActive = ['/submissions', '/review-dashboard'].some(p => currentPath.startsWith(p));
  const isTasksActive = ['/tasks', '/schedule', '/calendar'].some(p => currentPath.startsWith(p));
  const isAudienceActive = ['/audience', '/registration', '/attendance', '/voting', '/vote'].some(p => currentPath.startsWith(p));
  const isMarketingActive = ['/submission-buttons', '/laurel'].some(p => currentPath.startsWith(p));

  useEffect(() => {
    if (currentFestival?.id && isModuleEnabled('submissions')) {
      api.get('/submissions')
        .then(res => {
          if (res.data?.counts?.total !== undefined) {
            setSubmissionCount(res.data.counts.total);
          } else if (Array.isArray(res.data?.data)) {
            setSubmissionCount(res.data.data.length);
          }
        })
        .catch(() => {});
    }
  }, [currentFestival?.id, isModuleEnabled]);

  // Determine current active persona / role key
  const rawRoleKey = user?.current_group || (user?.isSuperAdmin ? 'admin' : 'admin');
  const roleKey = rawRoleKey === 'judge' ? 'jury' : rawRoleKey;

  const handleRoleChange = async (e) => {
    const newRole = e.target.value;
    setSwitching(true);
    try {
      await switchPersona(newRole);
      if (newRole === 'jury' || newRole === 'judge') {
        navigate('/reviews');
      } else if (newRole === 'volunteer') {
        navigate('/tasks');
      } else {
        navigate('/team');
      }
    } catch (err) {
      console.error('Role switch error:', err);
    } finally {
      setSwitching(false);
    }
  };

  const getInitials = (name) => {
    if (!name) return 'SH';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  const displayName = user?.name || user?.email?.split('@')[0] || 'SHASHANK';
  const displayRole = (roleKey === 'jury' || roleKey === 'judge') ? 'Jury · Jury Member' : roleKey === 'volunteer' ? 'Volunteer · Operations' : 'Admin · Festival Director';

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

      {/* Active Role Card */}
      <div className="fc-role-card">
        <div className="fc-role-label">ACTIVE ROLE</div>
        <div className="fc-role-select-wrapper">
          <select 
            className="fc-role-select" 
            value={roleKey} 
            onChange={handleRoleChange}
            disabled={switching}
          >
            <option value="admin">Admin</option>
            <option value="jury">Jury</option>
            <option value="volunteer">Volunteer</option>
          </select>
          <span className="fc-select-chevron">▾</span>
        </div>
      </div>

      {/* Festival Edition Card */}
      <div className="fc-festival-card">
        {festivals && festivals.length > 1 ? (
          <div className="fc-festival-select-wrapper" style={{ position: 'relative', marginBottom: '4px' }}>
            <select
              className="fc-festival-select"
              value={currentFestival?.id || ''}
              onChange={(e) => {
                const fest = festivals.find(f => f.id === parseInt(e.target.value, 10));
                if (fest) selectFestival(fest);
              }}
              style={{
                width: '100%',
                appearance: 'none',
                background: 'transparent',
                border: 'none',
                fontFamily: 'inherit',
                fontSize: '0.8125rem',
                fontWeight: 700,
                color: 'var(--fc-text-main)',
                cursor: 'pointer',
                paddingRight: '18px',
                outline: 'none',
              }}
            >
              {festivals.map(fest => (
                <option key={fest.id} value={fest.id}>
                  {fest.name} {fest.saas_enabled ? '· SaaS Active' : '· Inactive'}
                </option>
              ))}
            </select>
            <span style={{ position: 'absolute', right: 0, top: 0, pointerEvents: 'none', fontSize: '0.75rem', color: 'var(--fc-text-muted)' }}>▾</span>
          </div>
        ) : (
          <div className="fc-festival-name">
            {currentFestival?.name || 'Indie Film Festival Bangalore'}
          </div>
        )}
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
        <div className="fc-section-header">
          <span className="fc-section-title">CORE MODULES</span>
          <span className="fc-section-pill">Core</span>
        </div>

        {/* Dashboard (Single Page) */}
        {isModuleEnabled('dashboard') && (
          <div className="fc-module-block">
            <NavLink 
              to="/dashboard" 
              className={({ isActive }) => `fc-nav-item ${isActive ? 'active' : ''}`}
            >
              <span>Dashboard</span>
            </NavLink>
          </div>
        )}

        {/* Submissions (Multiple Pages: All Submissions + Review Dashboard) */}
        {isModuleEnabled('submissions') && (
          <div className="fc-module-block">
            <button 
              type="button"
              className={`fc-module-toggle ${isSubmissionsActive ? 'is-active-module' : ''}`}
              onClick={() => toggleModule('submissions')}
              aria-expanded={openModules.submissions}
            >
              <span className="fc-toggle-title">Submissions</span>
              <div className="fc-toggle-actions">
                <span className="fc-badge fc-badge-blue">
                  {submissionCount !== null ? submissionCount : (currentFestival?.id === 1 ? 23 : 6)}
                </span>
                <ChevronIcon isOpen={openModules.submissions} />
              </div>
            </button>
            {openModules.submissions && (
              <div className="fc-sub-nav">
                <NavLink 
                  to="/submissions" 
                  className={({ isActive }) => `fc-nav-item ${isActive ? 'active' : ''}`}
                >
                  <span>All Submissions</span>
                </NavLink>
                <NavLink 
                  to="/review-dashboard" 
                  className={({ isActive }) => `fc-nav-item ${isActive ? 'active' : ''}`}
                >
                  <span>Review Dashboard</span>
                </NavLink>
              </div>
            )}
          </div>
        )}

        {/* Discovery (Single Page) */}
        {isModuleEnabled('discovery') && (
          <div className="fc-module-block">
            <NavLink 
              to="/discovery" 
              className={({ isActive }) => `fc-nav-item ${isActive ? 'active' : ''}`}
            >
              <span>Discovery</span>
            </NavLink>
          </div>
        )}

        {/* Payouts (Single Page - Core) */}
        {(isModuleEnabled('payouts') || isModuleEnabled('payments')) && (
          <div className="fc-module-block">
            <NavLink 
              to="/payouts" 
              className={({ isActive }) => `fc-nav-item ${isActive ? 'active' : ''}`}
            >
              <span>Payouts</span>
              <span className="fc-badge fc-badge-subtle">Core</span>
            </NavLink>
          </div>
        )}

        {/* Team (Single Page - Core) */}
        {(isModuleEnabled('team') || isModuleEnabled('team_management')) && (
          <div className="fc-module-block">
            <NavLink 
              to="/team" 
              className={({ isActive }) => `fc-nav-item ${isActive ? 'active' : ''}`}
            >
              <span>Team</span>
              <span className="fc-badge fc-badge-burgundy">3</span>
            </NavLink>
          </div>
        )}

        {/* Settings (Single Page - Core) */}
        {(isModuleEnabled('settings') || isModuleEnabled('edition_settings')) && (
          <div className="fc-module-block">
            <NavLink 
              to="/settings" 
              className={({ isActive }) => `fc-nav-item ${isActive ? 'active' : ''}`}
            >
              <span>Settings</span>
            </NavLink>
          </div>
        )}

        {/* ── ADD-ON MODULES ── */}
        {(isModuleEnabled('tasks') || isModuleEnabled('sponsors') || isModuleEnabled('chat') || isModuleEnabled('comms') || isModuleEnabled('guests') || isModuleEnabled('audience') || isModuleEnabled('marketing')) && (
          <>
            <div className="fc-section-divider"></div>
            <div className="fc-section-header">
              <span className="fc-section-title">ADD-ON MODULES</span>
              <span className="fc-section-pill fc-pill-addon">Add-ons</span>
            </div>

            {/* Tasks & Schedule (Multiple Pages: Tasks Board + Schedule) */}
            {isModuleEnabled('tasks') && (
              <div className="fc-module-block">
                <button 
                  type="button"
                  className={`fc-module-toggle ${isTasksActive ? 'is-active-module' : ''}`}
                  onClick={() => toggleModule('tasks')}
                  aria-expanded={openModules.tasks}
                >
                  <span className="fc-toggle-title">Tasks</span>
                  <div className="fc-toggle-actions">
                    <span className="fc-badge fc-badge-red" title="1 Conflict Detected">1</span>
                    <ChevronIcon isOpen={openModules.tasks} />
                  </div>
                </button>
                {openModules.tasks && (
                  <div className="fc-sub-nav">
                    <NavLink 
                      to="/tasks" 
                      className={({ isActive }) => `fc-nav-item ${isActive ? 'active' : ''}`}
                    >
                      <span>Tasks Board</span>
                    </NavLink>
                    <NavLink 
                      to="/schedule" 
                      className={({ isActive }) => `fc-nav-item ${isActive ? 'active' : ''}`}
                    >
                      <span>Schedule</span>
                      <span className="fc-badge fc-badge-red" title="1 Conflict Detected">1</span>
                    </NavLink>
                  </div>
                )}
              </div>
            )}

            {/* Sponsors (Single Page) */}
            {isModuleEnabled('sponsors') && (
              <div className="fc-module-block">
                <NavLink 
                  to="/sponsors" 
                  className={({ isActive }) => `fc-nav-item ${isActive ? 'active' : ''}`}
                >
                  <span>Sponsors</span>
                  <span className="fc-badge fc-badge-amber">5</span>
                </NavLink>
              </div>
            )}

            {/* Communications (Single Page) */}
            {(isModuleEnabled('comms') || isModuleEnabled('chat')) && (
              <div className="fc-module-block">
                <NavLink 
                  to="/chat" 
                  className={({ isActive }) => `fc-nav-item ${isActive ? 'active' : ''}`}
                >
                  <span>Communications</span>
                </NavLink>
              </div>
            )}

            {/* Guests & Hospitality (Single Page) */}
            {isModuleEnabled('guests') && (
              <div className="fc-module-block">
                <NavLink 
                  to="/guests" 
                  className={({ isActive }) => `fc-nav-item ${isActive ? 'active' : ''}`}
                >
                  <span>Guests & Hospitality</span>
                  <span className="fc-badge fc-badge-red">1</span>
                </NavLink>
              </div>
            )}

            {/* Audience & Voting (Multiple Pages: Audience Settings, Registration & Passes, Gate Attendance, Audience Voting) */}
            {isModuleEnabled('audience') && (
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
                    <NavLink 
                      to="/audience" 
                      className={({ isActive }) => `fc-nav-item ${isActive ? 'active' : ''}`}
                    >
                      <span>Audience Settings</span>
                    </NavLink>
                    <NavLink 
                      to="/registration" 
                      className={({ isActive }) => `fc-nav-item ${isActive ? 'active' : ''}`}
                    >
                      <span>Registration & Passes</span>
                    </NavLink>
                    <NavLink 
                      to="/attendance" 
                      className={({ isActive }) => `fc-nav-item ${isActive ? 'active' : ''}`}
                    >
                      <span>Gate Attendance</span>
                      <span className="fc-badge fc-badge-blue">Live</span>
                    </NavLink>
                    <NavLink 
                      to="/voting" 
                      className={({ isActive }) => `fc-nav-item ${isActive ? 'active' : ''}`}
                    >
                      <span>Audience Voting</span>
                      <span className="fc-badge fc-badge-amber">Awards</span>
                    </NavLink>
                  </div>
                )}
              </div>
            )}

            {/* Marketing (Multiple Pages if enabled: Submission Buttons, Laurel Studio) */}
            {isModuleEnabled('marketing') && (
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
                    <NavLink 
                      to="/submission-buttons" 
                      className={({ isActive }) => `fc-nav-item ${isActive ? 'active' : ''}`}
                    >
                      <span>Submission Buttons</span>
                    </NavLink>
                    <NavLink 
                      to="/laurel" 
                      className={({ isActive }) => `fc-nav-item ${isActive ? 'active' : ''}`}
                    >
                      <span>Laurel Studio</span>
                    </NavLink>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </nav>

      {/* User Profile Footer */}
      <div className="fc-user-footer">
        <div className="fc-avatar">{getInitials(displayName)}</div>
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
          {isDark ? '☀️' : '🌙'}
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
