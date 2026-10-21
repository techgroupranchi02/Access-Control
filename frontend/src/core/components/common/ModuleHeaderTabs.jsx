import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

/**
 * ModuleHeaderTabs Component
 * Reusable header tabs for any core, addon, or plugin module.
 * Adheres to Format B architecture by surfacing operational views
 * alongside administrative module settings.
 */
export default function ModuleHeaderTabs({
  moduleKey = 'team',
  activeTab = 'roster',
  customTabs = null
}) {
  const { user, permissions = {} } = useAuth();

  const isSuperAdmin = user?.isSuperAdmin || user?.role === 'admin' || user?.role === 'Admin';
  const hasManagePerm = isSuperAdmin || 
    Boolean(permissions[`${moduleKey}:manage`] || permissions[`${moduleKey}.manage`] || permissions['settings:manage'] || permissions['settings.manage'] || permissions['*']);

  const defaultTabs = [
    {
      key: 'roster',
      label: 'Team Roster',
      route: '/team',
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
          <circle cx="9" cy="7" r="4"></circle>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
        </svg>
      )
    },
    {
      key: 'settings',
      label: 'Team Settings',
      route: '/team/settings',
      requiresManage: true,
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3"></circle>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
        </svg>
      )
    }
  ];

  const tabsToRender = (customTabs || defaultTabs).filter(tab => {
    if (tab.requiresManage && !hasManagePerm) return false;
    return true;
  });

  return (
    <div className="fc-module-header-tabs" style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '4px',
      padding: '4px',
      borderRadius: '8px',
      background: 'var(--fc-surface-subtle, rgba(0, 0, 0, 0.04))',
      border: '1px solid var(--fc-border, rgba(0, 0, 0, 0.08))',
      marginBottom: '16px'
    }}>
      {tabsToRender.map((tab) => {
        const isActive = activeTab === tab.key;
        return (
          <NavLink
            key={tab.key}
            to={tab.route}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: isActive ? 600 : 500,
              textDecoration: 'none',
              transition: 'all 0.15s ease',
              color: isActive 
                ? 'var(--fc-text-primary, #111827)' 
                : 'var(--fc-text-muted, #6b7280)',
              background: isActive 
                ? 'var(--fc-surface-card, #ffffff)' 
                : 'transparent',
              boxShadow: isActive 
                ? '0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04)' 
                : 'none',
              border: isActive 
                ? '1px solid var(--fc-border, rgba(0, 0, 0, 0.08))' 
                : '1px solid transparent'
            }}
          >
            {tab.icon && <span>{tab.icon}</span>}
            <span>{tab.label}</span>
          </NavLink>
        );
      })}
    </div>
  );
}
