/**
 * Dashboard Page
 * Festival selector + overview of enabled features.
 */

import { useFestivalConfig } from '../hooks/useFestivalConfig';
import { usePermissions } from '../hooks/usePermissions';
import { useAuth } from '../hooks/useAuth';

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

export default function DashboardPage() {
  const { user } = useAuth();
  const { festivals, currentFestival, selectFestival, getEnabledFeatures, isSuperAdmin } = useFestivalConfig();
  const { permissions, permissionMap, can } = usePermissions();

  const enabledFeatures = getEnabledFeatures();

  const userCanAccess = (moduleKey) => {
    if (isSuperAdmin) return true;
    const reqPerms = MODULE_PERMISSIONS[moduleKey] || [`${moduleKey}.view`, `${moduleKey}:read`];
    return reqPerms.some(p => can(p));
  };

  const accessibleFeatures = enabledFeatures.filter(f => userCanAccess(f.module_key || f.feature_key));

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h2 className="page-title">Welcome back, {user?.name || 'User'} 👋</h2>
        <p className="page-description">
          Select a festival edition to manage, and explore your accessible modules.
        </p>
      </div>

      {/* Festival / Edition Selector Cards */}
      <div className="page-grid page-grid-2" style={{ marginBottom: 'var(--space-2xl)' }}>
        {festivals.map((fest, i) => (
          <div
            key={fest.id}
            className={`festival-card ${currentFestival?.id === fest.id ? 'selected' : ''}`}
            onClick={() => selectFestival(fest)}
            style={{ animationDelay: `${i * 0.1}s` }}
          >
            <h3 className="festival-card-name">{fest.name}</h3>
            <p className="festival-card-desc">{fest.description}</p>
            {currentFestival?.id === fest.id && (
              <span className="badge badge-primary">Active Edition</span>
            )}
          </div>
        ))}
      </div>

      {currentFestival && (
        <>
          {/* Stats */}
          <div className="page-grid page-grid-4" style={{ marginBottom: 'var(--space-2xl)' }}>
            <div className="stat-card animate-fade-in">
              <div className="stat-icon" style={{ background: 'rgba(139, 92, 246, 0.15)' }}>🎪</div>
              <div>
                <div className="stat-value">{enabledFeatures.length}</div>
                <div className="stat-label">Edition Modules</div>
              </div>
            </div>
            <div className="stat-card animate-fade-in" style={{ animationDelay: '0.1s' }}>
              <div className="stat-icon" style={{ background: 'rgba(16, 185, 129, 0.15)' }}>🔓</div>
              <div>
                <div className="stat-value">{accessibleFeatures.length}</div>
                <div className="stat-label">Accessible by You</div>
              </div>
            </div>
            <div className="stat-card animate-fade-in" style={{ animationDelay: '0.2s' }}>
              <div className="stat-icon" style={{ background: 'rgba(59, 130, 246, 0.15)' }}>🔑</div>
              <div>
                <div className="stat-value">{Array.isArray(permissions) ? permissions.length : Object.keys(permissions || {}).length}</div>
                <div className="stat-label">Your Permissions</div>
              </div>
            </div>
            <div className="stat-card animate-fade-in" style={{ animationDelay: '0.3s' }}>
              <div className="stat-icon" style={{ background: 'rgba(244, 114, 182, 0.15)' }}>📦</div>
              <div>
                <div className="stat-value">
                  {enabledFeatures.filter(f => (f.module_type || f.feature_type) === 'core').length} Core • {enabledFeatures.filter(f => (f.module_type || f.feature_type) === 'addon').length} Addon
                </div>
                <div className="stat-label">Module Types</div>
              </div>
            </div>
          </div>

          {/* Enabled Modules List */}
          <div className="card">
            <div className="card-header">
              <div>
                <h3 className="card-title">Enabled Modules for {currentFestival.name}</h3>
                <p className="card-subtitle">Active modules configured for this festival edition vs your role access</p>
              </div>
            </div>

            {/* RBAC Explanatory Callout */}
            <div style={{
              background: 'rgba(59, 130, 246, 0.08)',
              border: '1px solid rgba(59, 130, 246, 0.25)',
              borderRadius: '10px',
              padding: '0.85rem 1.15rem',
              marginBottom: '1.25rem',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1rem',
              flexWrap: 'wrap',
            }}>
              <div>
                <strong>🛡️ Role-Based Access Control (RBAC):</strong> <em>{currentFestival.name}</em> has <strong>{enabledFeatures.length} active modules</strong> configured. Based on your assigned role (<strong>{user?.name || 'User'}</strong>), you are authorized to access <strong>{accessibleFeatures.length} modules</strong>, shown in your sidebar navigation.
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                {enabledFeatures.length - accessibleFeatures.length} modules restricted for your role
              </div>
            </div>

            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Module</th>
                    <th>Type</th>
                    <th>Route</th>
                    <th>Edition Status</th>
                    <th>Your Access (Sidebar)</th>
                  </tr>
                </thead>
                <tbody>
                  {enabledFeatures.map(f => {
                    const type = f.module_type || f.feature_type;
                    const typeBadge = type === 'core' ? 'badge-info' : type === 'addon' ? 'badge-primary' : 'badge-warning';
                    const key = f.module_key || f.feature_key;
                    const isAllowed = userCanAccess(key);

                    return (
                      <tr key={key}>
                        <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{f.name}</td>
                        <td>
                          <span className={`badge ${typeBadge}`}>
                            {type}
                          </span>
                        </td>
                        <td style={{ fontFamily: 'monospace', fontSize: '0.8125rem' }}>{f.route}</td>
                        <td><span className="badge badge-success">Enabled</span></td>
                        <td>
                          {isAllowed ? (
                            <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem' }}>
                              ✓ Permitted (In Sidebar)
                            </span>
                          ) : (
                            <span className="badge badge-muted" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', opacity: 0.75, fontSize: '0.75rem' }}>
                              🔒 Restricted (Role)
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Your Permissions */}
          <div className="card" style={{ marginTop: 'var(--space-lg)' }}>
            <div className="card-header">
              <div>
                <h3 className="card-title">Your Permissions</h3>
                <p className="card-subtitle">Permissions granted to you for {currentFestival.name}</p>
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-sm)' }}>
              {Array.isArray(permissions) ? permissions.map(p => {
                const details = permissionMap?.[p];
                return (
                  <span
                    key={p}
                    className="badge badge-primary"
                    style={{ fontSize: '0.8rem', padding: '0.3rem 0.75rem' }}
                    title={details?.description || p}
                  >
                    {p}
                    {details?.description && (
                      <span style={{ opacity: 0.75, marginLeft: '0.35rem', fontSize: '0.72rem' }}>
                        ({details.description})
                      </span>
                    )}
                  </span>
                );
              }) : null}
              {(!permissions || (Array.isArray(permissions) && permissions.length === 0)) && (
                <div className="empty-state">
                  <p className="empty-state-text">No permissions assigned</p>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {!currentFestival && (
        <div className="card" style={{ textAlign: 'center', padding: 'var(--space-2xl)' }}>
          <div className="empty-state-icon">🎪</div>
          <p className="empty-state-text">Select a festival above to get started</p>
        </div>
      )}
    </div>
  );
}
