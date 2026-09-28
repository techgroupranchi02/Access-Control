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
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useFestivalConfig } from '../hooks/useFestivalConfig';
import { useTheme } from '../context/ThemeContext';
import api from '../services/api';

export default function Sidebar() {
  const { user, logout, switchPersona } = useAuth();
  const { currentFestival, currentEdition, isModuleEnabled, isSaasEnabled, isSuperAdmin } = useFestivalConfig();
  const { theme, toggleTheme, isDark } = useTheme();
  const navigate = useNavigate();
  const [switching, setSwitching] = useState(false);
  const [submissionCount, setSubmissionCount] = useState(null);

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
  const roleKey = user?.current_group || (user?.isSuperAdmin ? 'admin' : 'admin');

  const handleRoleChange = async (e) => {
    const newRole = e.target.value;
    setSwitching(true);
    try {
      await switchPersona(newRole);
      if (newRole === 'judge') {
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
  const displayRole = roleKey === 'judge' ? 'Judge · Jury Member' : roleKey === 'volunteer' ? 'Volunteer · Operations' : 'Admin · Festival Director';

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
            <option value="judge">Judge</option>
            <option value="volunteer">Volunteer</option>
          </select>
          <span className="fc-select-chevron">▾</span>
        </div>
      </div>

      {/* Festival Edition Card */}
      <div className="fc-festival-card">
        <div className="fc-festival-name">
          {currentFestival?.name || 'Indie Film Festival Bangalore'}
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
        {/* Dashboard */}
        {isModuleEnabled('dashboard') && (
          <NavLink 
            to="/dashboard" 
            className={({ isActive }) => `fc-nav-item ${isActive ? 'active' : ''}`}
          >
            <span>Dashboard</span>
          </NavLink>
        )}

        {/* Section: Submissions (Core) — Contains 2 pages: All Submissions & Review Dashboard */}
        {isModuleEnabled('submissions') && (
          <>
            <div className="fc-nav-section-title">SUBMISSIONS</div>
            <NavLink 
              to="/submissions" 
              className={({ isActive }) => `fc-nav-item ${isActive ? 'active' : ''}`}
            >
              <span>All Submissions</span>
              <span className="fc-badge fc-badge-blue">{submissionCount !== null ? submissionCount : (currentFestival?.id === 1 ? 23 : 4)}</span>
            </NavLink>
            <NavLink 
              to="/review-dashboard" 
              className={({ isActive }) => `fc-nav-item ${isActive ? 'active' : ''}`}
            >
              <span>Review Dashboard</span>
            </NavLink>
          </>
        )}

        {/* Section: Manage Festival (Addons) */}
        {(isModuleEnabled('tasks') || isModuleEnabled('schedule') || isModuleEnabled('calendar') || isModuleEnabled('sponsors') || isModuleEnabled('chat') || isModuleEnabled('comms') || isModuleEnabled('guests') || isModuleEnabled('payouts') || isModuleEnabled('payments')) && (
          <>
            <div className="fc-nav-section-title">MANAGE FESTIVAL</div>
            {isModuleEnabled('tasks') && (
              <NavLink 
                to="/tasks" 
                className={({ isActive }) => `fc-nav-item ${isActive ? 'active' : ''}`}
              >
                <span>Tasks</span>
              </NavLink>
            )}
            {(isModuleEnabled('schedule') || isModuleEnabled('calendar')) && (
              <NavLink 
                to="/schedule" 
                className={({ isActive }) => `fc-nav-item ${isActive ? 'active' : ''}`}
              >
                <span>Schedule</span>
                <span className="fc-badge fc-badge-red" title="1 Conflict Detected">1</span>
              </NavLink>
            )}
            {isModuleEnabled('sponsors') && (
              <NavLink 
                to="/sponsors" 
                className={({ isActive }) => `fc-nav-item ${isActive ? 'active' : ''}`}
              >
                <span>Sponsors</span>
                <span className="fc-badge fc-badge-amber">5</span>
              </NavLink>
            )}
            {(isModuleEnabled('comms') || isModuleEnabled('chat')) && (
              <NavLink 
                to="/chat" 
                className={({ isActive }) => `fc-nav-item ${isActive ? 'active' : ''}`}
              >
                <span>Communications</span>
              </NavLink>
            )}
            {isModuleEnabled('guests') && (
              <NavLink 
                to="/guests" 
                className={({ isActive }) => `fc-nav-item ${isActive ? 'active' : ''}`}
              >
                <span>Guests & Hospitality</span>
                <span className="fc-badge fc-badge-red">1</span>
              </NavLink>
            )}
            {(isModuleEnabled('payouts') || isModuleEnabled('payments')) && (
              <NavLink 
                to="/payouts" 
                className={({ isActive }) => `fc-nav-item ${isActive ? 'active' : ''}`}
              >
                <span>Payouts</span>
              </NavLink>
            )}
          </>
        )}

        {/* Section: Discovery */}
        {isModuleEnabled('discovery') && (
          <>
            <div className="fc-nav-section-title">DISCOVERY</div>
            <NavLink 
              to="/discovery" 
              className={({ isActive }) => `fc-nav-item ${isActive ? 'active' : ''}`}
            >
              <span>Discovery</span>
            </NavLink>
          </>
        )}

        {/* Direct Links */}
        {(isModuleEnabled('team') || isModuleEnabled('team_management')) && (
          <NavLink 
            to="/team" 
            className={({ isActive }) => `fc-nav-item ${isActive ? 'active' : ''}`}
          >
            <span>Team</span>
            <span className="fc-badge fc-badge-burgundy">3</span>
          </NavLink>
        )}
        <div className="fc-nav-item disabled">
          <span>Tickets</span>
          <span className="fc-badge fc-badge-subtle">Soon</span>
        </div>
        {(isModuleEnabled('settings') || isModuleEnabled('edition_settings')) && (
          <NavLink 
            to="/settings" 
            className={({ isActive }) => `fc-nav-item ${isActive ? 'active' : ''}`}
          >
            <span>Settings</span>
          </NavLink>
        )}

        {/* Festival Admin (Local) */}
        <NavLink 
          to="/freecomers-admin" 
          className={({ isActive }) => `fc-nav-item ${isActive ? 'active' : ''}`}
        >
          <span>Festival Roles</span>
          <span className="fc-badge fc-badge-subtle">👥</span>
        </NavLink>
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
