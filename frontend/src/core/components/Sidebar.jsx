/**
 * Sidebar Component
 * Dynamic navigation based on edition modules and user group permissions.
 * Supports:
 * - Core Modules
 * - Addon Modules
 * - Custom Plugin Extensions
 * - Role/Group aware permission checks with wildcard support
 */

import { NavLink } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useFestivalConfig } from '../hooks/useFestivalConfig';
import { usePermissions } from '../hooks/usePermissions';

// Comprehensive Icon Map for all 13 modules + custom plugins
const ICONS = {
  // Core Modules
  'dashboard': '🏠',
  'submissions': '📄',
  'review_dashboard': '⚖️',
  'team_management': '👥',
  'payments': '💳',
  'edition_settings': '⚙️',
  // Addon Modules
  'calendar': '📅',
  'tasks': '📋',
  'departments': '🏢',
  'jury': '🏆',
  'discovery': '🧭',
  'news': '📰',
  'analytics': '📊',
  // Custom Plugins
  'customA': '🧩',
  'customB': '📚',
  'customC': '🔌',
  // Legacy icons
  'file-text': '📄',
  'users': '👥',
  'award': '🏆',
  'puzzle': '🧩',
  'layers': '📚',
  'settings': '⚙️',
  'shield': '🛡️',
  'home': '🏠',
  'check-square': '⚖️',
  'credit-card': '💳',
  'list-todo': '📋',
  'building': '🏢',
  'compass': '🧭',
  'newspaper': '📰',
  'bar-chart': '📊',
};

// Module permission requirements (supports arrays of permission aliases)
const MODULE_PERMISSIONS = {
  dashboard: ['dashboard.view', 'dashboard:read'],
  submissions: ['submission.view', 'submission:read'],
  review_dashboard: ['review.view', 'review:read'],
  team_management: ['team.view', 'team:read'],
  payments: ['payment.view', 'payment:read'],
  edition_settings: ['settings.view', 'settings:read'],
  calendar: ['calendar.view', 'calendar:read'],
  tasks: ['task.view', 'task:read'],
  departments: ['department.view', 'department:read'],
  jury: ['jury.view_panel', 'jury.view_assignments', 'jury:read'],
  discovery: ['discovery.view_public', 'discovery.browse', 'discovery:read'],
  news: ['news.view', 'news:read'],
  analytics: ['analytics.view_basic', 'analytics.view_advanced', 'analytics.view', 'analytics:read'],
  customA: ['customA.view', 'customA:read'],
  customB: ['customB.view', 'customB:read'],
  customC: ['customC.view', 'customC:read'],
};

export default function Sidebar() {
  const { user, logout } = useAuth();
  const { editions, festivals, currentFestival, currentEdition, selectFestival, getEnabledModules, isSuperAdmin } = useFestivalConfig();
  const { can } = usePermissions();

  const allEditions = editions || festivals || [];
  const activeEdition = currentEdition || currentFestival;
  const enabledModules = getEnabledModules ? getEnabledModules() : [];

  // Categorize modules
  const coreModules = enabledModules.filter(m => (m.module_type || m.feature_type) === 'core' && (m.module_key || m.feature_key) !== 'dashboard');
  const addonModules = enabledModules.filter(m => (m.module_type || m.feature_type) === 'addon');
  const customModules = enabledModules.filter(m => (m.module_type || m.feature_type) === 'custom');

  const handleEditionChange = (e) => {
    const fest = allEditions.find(f => f.id === parseInt(e.target.value, 10));
    if (fest) selectFestival(fest);
  };

  const renderModuleItem = (item) => {
    const key = item.module_key || item.feature_key;
    const reqPerms = MODULE_PERMISSIONS[key] || [`${key}.view`, `${key}:read`];

    // Only show if user has permission (or super admin wildcard)
    if (!isSuperAdmin && !reqPerms.some(p => can(p))) {
      return null;
    }

    const iconKey = item.icon || key;
    const icon = ICONS[iconKey] || ICONS[key] || '📋';

    return (
      <NavLink
        key={key}
        to={item.route}
        className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`}
      >
        <span className="sidebar-nav-icon">{icon}</span>
        <span>{item.name}</span>
      </NavLink>
    );
  };

  return (
    <aside className="sidebar">
      {/* Brand */}
      <div className="sidebar-header">
        <div className="sidebar-brand">
          <div className="sidebar-brand-icon">🔐</div>
          <div>
            <span className="sidebar-brand-text">Access Control</span>
            <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
              Declarative Edition
            </div>
          </div>
        </div>
      </div>

      {/* Active Edition Selector */}
      <div className="sidebar-festival-selector">
        <label style={{ display: 'block', fontSize: '0.6875rem', color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase' }}>
          Active Edition
        </label>
        <select
          className="sidebar-festival-select"
          value={activeEdition?.id || ''}
          onChange={handleEditionChange}
        >
          <option value="" disabled>Select Edition</option>
          {allEditions.map(f => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        {/* Overview Dashboard */}
        <NavLink
          to="/dashboard"
          className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`}
        >
          <span className="sidebar-nav-icon">{ICONS['dashboard']}</span>
          <span>Dashboard</span>
        </NavLink>

        {/* Core Modules Section */}
        {coreModules.length > 0 && (
          <>
            <div className="sidebar-section-title">Core Modules</div>
            {coreModules.map(renderModuleItem)}
          </>
        )}

        {/* Addon Modules Section */}
        {addonModules.length > 0 && (
          <>
            <div className="sidebar-section-title">Addon Modules</div>
            {addonModules.map(renderModuleItem)}
          </>
        )}

        {/* Custom Plugin Extensions */}
        {customModules.length > 0 && (
          <>
            <div className="sidebar-section-title">Custom Extensions</div>
            {customModules.map(renderModuleItem)}
          </>
        )}

        {/* System Administration */}
        {(isSuperAdmin || can('admin:access') || can('*')) && (
          <>
            <div className="sidebar-section-title">Administration</div>
            <NavLink
              to="/admin"
              className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`}
            >
              <span className="sidebar-nav-icon">{ICONS['shield']}</span>
              <span>Admin Panel</span>
            </NavLink>
          </>
        )}
      </nav>

      {/* User Info */}
      <div className="sidebar-user">
        <div className="sidebar-user-avatar">
          {user?.name?.charAt(0)?.toUpperCase() || 'U'}
        </div>
        <div className="sidebar-user-info">
          <div className="sidebar-user-name">
            {user?.name || 'User'}
            {isSuperAdmin && (
              <span className="badge badge-warning" style={{ fontSize: '0.65rem', padding: '1px 4px', marginLeft: 4 }}>
                Admin
              </span>
            )}
          </div>
          <div className="sidebar-user-email">{user?.email || ''}</div>
        </div>
        <button className="sidebar-logout-btn" onClick={logout} title="Logout">
          🚪
        </button>
      </div>
    </aside>
  );
}
