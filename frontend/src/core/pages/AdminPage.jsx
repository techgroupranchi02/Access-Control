/**
 * Admin Page
 * Manage roles, permissions, users, and festival feature toggles.
 * Only accessible to users with admin:access permission.
 */

import { useState, useEffect } from 'react';
import api from '../services/api';
import { useFestivalConfig } from '../hooks/useFestivalConfig';

export default function AdminPage() {
  const [viewMode, setViewMode] = useState('hierarchy'); // 'hierarchy' | 'matrix'
  const [activeTab, setActiveTab] = useState('roles');
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [users, setUsers] = useState([]);
  const [festivals, setFestivals] = useState([]);
  const [festivalConfigs, setFestivalConfigs] = useState({});
  const [selectedFestId, setSelectedFestId] = useState(1);
  const [expandedGroups, setExpandedGroups] = useState({ 1: true, 2: true, 3: true, 4: true, 5: true });
  const [selectedUsersToAdd, setSelectedUsersToAdd] = useState({});
  const [showModules, setShowModules] = useState(true);
  const [editingPerms, setEditingPerms] = useState({});
  const [permSearch, setPermSearch] = useState({});
  const [loading, setLoading] = useState(true);
  const { refreshConfig } = useFestivalConfig();

  const loadAll = async () => {
    try {
      const [rolesRes, permsRes, usersRes, festRes] = await Promise.all([
        api.get('/admin/groups'),
        api.get('/admin/permissions'),
        api.get('/admin/users'),
        api.get('/admin/events'),
      ]);
      setRoles(rolesRes.data);
      setPermissions(permsRes.data);
      setUsers(usersRes.data);
      setFestivals(festRes.data);
      if (festRes.data.length > 0) {
        setSelectedFestId(prev => festRes.data.some(f => f.id === prev) ? prev : festRes.data[0].id);
      }

      // Load festival configs
      const configs = {};
      for (const fest of festRes.data) {
        const configRes = await api.get(`/events/${fest.id}/config`, {
          headers: { 'X-Festival-Id': fest.id },
        });
        configs[fest.id] = configRes.data.modules || configRes.data.features || [];
      }
      setFestivalConfigs(configs);
    } catch {
      console.error('Failed to load admin data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleToggleFeature = async (festivalId, featureId, currentState) => {
    try {
      await api.put(`/events/${festivalId}/features/${featureId}/toggle`, {
        isEnabled: !currentState,
      }, { headers: { 'X-Festival-Id': festivalId } });
      await loadAll();
      await refreshConfig();
    } catch {
      console.error('Failed to toggle feature');
    }
  };

  const handleAssignRole = async (userId, festivalId, roleId) => {
    try {
      await api.post(`/admin/users/${userId}/groups`, { festivalId, roleId });
      await loadAll();
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to assign group.';
      alert(msg);
      console.error('Failed to assign group:', msg);
    }
  };

  const handleRemoveRole = async (userId, festivalId, roleId) => {
    try {
      await api.delete(`/admin/users/${userId}/groups`, { data: { festivalId, roleId } });
      await loadAll();
    } catch {
      console.error('Failed to remove group');
    }
  };

  const handleUpdateRolePermissions = async (roleId, permIds) => {
    try {
      await api.put(`/admin/groups/${roleId}/permissions`, { permissionIds: permIds });
      await loadAll();
      await refreshConfig();
    } catch {
      console.error('Failed to update role permissions');
    }
  };

  const getGroupIcon = (groupKey) => {
    switch (groupKey) {
      case 'admin': return '👑';
      case 'lead': return '🎯';
      case 'reviewer': return '📝';
      case 'jury': return '⚖️';
      case 'volunteer': return '🤝';
      default: return '👥';
    }
  };

  const tabs = [
    { key: 'roles', label: '🎭 Groups & Roles' },
    { key: 'users', label: '👤 User Group Assignments' },
    { key: 'festivals', label: '🎪 Editions & Modules' },
    { key: 'permissions', label: '🔑 Permissions & Scopes' },
  ];

  if (loading) {
    return (
      <div className="animate-fade-in">
        <div className="page-header"><h2 className="page-title">⚙️ Admin Panel</h2></div>
        <div className="card">
          {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: '48px', marginBottom: 8 }}></div>)}
        </div>
      </div>
    );
  }

  const currentFestival = festivals.find(f => f.id === selectedFestId) || festivals[0];
  const totalEditionUsers = users.filter(u =>
    (u.eventGroups || []).some(eg => eg.event_id === selectedFestId)
  ).length;
  const activeModulesCount = (festivalConfigs[selectedFestId] || []).filter(m => m.is_enabled).length;

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h2 className="page-title">🛡️ Admin & Access Control Panel</h2>
        <p className="page-description">Manage hierarchical edition groups, scoped permissions, quotas, and modules.</p>
      </div>

      {/* Top View Mode Switcher */}
      <div className="view-mode-toggle">
        <button
          className={`view-mode-btn ${viewMode === 'hierarchy' ? 'active' : ''}`}
          onClick={() => setViewMode('hierarchy')}
        >
          <span>🌲</span> Hierarchical Tree View
        </button>
        <button
          className={`view-mode-btn ${viewMode === 'matrix' ? 'active' : ''}`}
          onClick={() => setViewMode('matrix')}
        >
          <span>📊</span> Matrix & Tabs View
        </button>
      </div>

      {/* ─── HIERARCHICAL TREE VIEW ─────────────────────────────────────── */}
      {viewMode === 'hierarchy' && (
        <div className="animate-fade-in">
          {/* Level 1: Edition Context Selector Bar */}
          <div className="hierarchy-edition-bar">
            <div>
              <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: '0.4rem', fontWeight: 600 }}>
                Select Active Edition
              </div>
              <div className="hierarchy-edition-chips">
                {festivals.map(fest => (
                  <button
                    key={fest.id}
                    className={`hierarchy-edition-chip ${selectedFestId === fest.id ? 'selected' : ''}`}
                    onClick={() => setSelectedFestId(fest.id)}
                  >
                    <span>🎪</span>
                    <span>{fest.name}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="hierarchy-stats-badge">
              <div><strong>{totalEditionUsers}</strong> Total Members</div>
              <div>•</div>
              <div><strong>{roles.length}</strong> Groups</div>
              <div>•</div>
              <div><strong>{activeModulesCount}</strong> Active Modules</div>
            </div>
          </div>

          {/* Level 2: Interactive Group Tree Cards */}
          <div className="hierarchy-group-tree">
            {roles.map(role => {
              const assignedUsers = users.filter(u =>
                (u.eventGroups || []).some(eg => eg.event_id === selectedFestId && eg.group_id === role.id)
              );
              const unassignedUsers = users.filter(u =>
                !assignedUsers.some(au => au.id === u.id)
              );
              const isFull = role.user_limit !== null && role.user_limit !== undefined && assignedUsers.length >= role.user_limit;
              const isUnlimited = role.user_limit === null || role.user_limit === undefined;
              const isExpanded = !!expandedGroups[role.id];

              return (
                <div key={role.id} className={`hierarchy-group-card ${isExpanded ? 'expanded' : ''}`}>
                  {/* Group Header */}
                  <div
                    className="hierarchy-group-header"
                    onClick={() => setExpandedGroups({ ...expandedGroups, [role.id]: !isExpanded })}
                  >
                    <div className="hierarchy-group-info">
                      <div className="hierarchy-group-icon">
                        {getGroupIcon(role.group_key || role.slug)}
                      </div>
                      <div>
                        <div className="hierarchy-group-title">
                          <span>{role.name}</span>
                          <span className={`hierarchy-quota-pill ${isFull ? 'quota-full' : isUnlimited ? 'quota-unlimited' : 'quota-ok'}`}>
                            {isFull ? '🔴 Full' : isUnlimited ? '♾️ Unlimited' : '🟢 Available'}: {assignedUsers.length} {role.user_limit ? `/ ${role.user_limit}` : 'members'}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                          {role.description}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {assignedUsers.length} assigned
                      </span>
                      <span style={{ color: 'var(--text-muted)', fontSize: '1rem' }}>
                        {isExpanded ? '▲' : '▼'}
                      </span>
                    </div>
                  </div>

                  {/* Group Expanded Body */}
                  {isExpanded && (
                    <div className="hierarchy-group-body">
                      {/* Level 2A: Group Permissions & Interactive Checkbox Editor */}
                      <div style={{ marginBottom: '1.4rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                          <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 600 }}>
                            🔑 Group Permissions & Scopes ({role.permissions?.length || 0} active / {permissions.length} total)
                          </div>
                          <button
                            type="button"
                            className={`btn btn-sm ${editingPerms[role.id] ? 'btn-primary' : 'btn-secondary'}`}
                            style={{ padding: '0.25rem 0.75rem', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingPerms(prev => ({ ...prev, [role.id]: !prev[role.id] }));
                            }}
                          >
                            {editingPerms[role.id] ? '✓ Done Editing' : '✏️ Edit Permissions (Checkbox Grid)'}
                          </button>
                        </div>

                        {editingPerms[role.id] ? (
                          /* Interactive Checkbox Grid Editor (identical to Tab View with search & quick actions) */
                          <div style={{
                            background: 'rgba(15, 23, 42, 0.7)',
                            border: '1px solid rgba(139, 92, 246, 0.35)',
                            borderRadius: '12px',
                            padding: '1rem',
                            animation: 'fadeIn 0.2s ease',
                            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                              <input
                                type="text"
                                placeholder="🔍 Filter permissions (e.g. custom, submission, review)..."
                                className="form-input"
                                style={{ maxWidth: '320px', padding: '0.4rem 0.75rem', fontSize: '0.825rem' }}
                                value={permSearch[role.id] || ''}
                                onChange={(e) => setPermSearch(prev => ({ ...prev, [role.id]: e.target.value }))}
                              />
                              <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                                <button
                                  type="button"
                                  className="btn btn-sm btn-ghost"
                                  style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
                                  onClick={() => {
                                    const q = (permSearch[role.id] || '').toLowerCase().trim();
                                    const matching = q
                                      ? permissions.filter(p => p.permission_key.toLowerCase().includes(q))
                                      : permissions;
                                    const current = role.permissions?.map(p => p.id) || [];
                                    const combined = Array.from(new Set([...current, ...matching.map(p => p.id)]));
                                    handleUpdateRolePermissions(role.id, combined);
                                  }}
                                >
                                  {permSearch[role.id] ? 'Select Filtered' : 'Select All'}
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-sm btn-ghost"
                                  style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem', color: '#f87171' }}
                                  onClick={() => {
                                    handleUpdateRolePermissions(role.id, []);
                                  }}
                                >
                                  Clear All
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-sm btn-primary"
                                  style={{ fontSize: '0.75rem', padding: '0.3rem 0.75rem' }}
                                  onClick={() => setEditingPerms(prev => ({ ...prev, [role.id]: false }))}
                                >
                                  Close
                                </button>
                              </div>
                            </div>

                            {/* Checkbox Group */}
                            <div className="checkbox-group">
                              {permissions
                                .filter(perm => {
                                  const q = (permSearch[role.id] || '').toLowerCase().trim();
                                  if (!q) return true;
                                  return perm.permission_key.toLowerCase().includes(q) || (perm.name && perm.name.toLowerCase().includes(q));
                                })
                                .map(perm => {
                                  const isChecked = role.permissions?.some(rp => rp.id === perm.id);
                                  return (
                                    <label key={perm.id} className={`checkbox-label ${isChecked ? 'checked' : ''}`}>
                                      <input
                                        type="checkbox"
                                        checked={isChecked}
                                        onChange={() => {
                                          const currentPermIds = role.permissions?.map(p => p.id) || [];
                                          const newPermIds = isChecked
                                            ? currentPermIds.filter(id => id !== perm.id)
                                            : [...currentPermIds, perm.id];
                                          handleUpdateRolePermissions(role.id, newPermIds);
                                        }}
                                      />
                                      {perm.permission_key}
                                    </label>
                                  );
                                })}
                            </div>
                            <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              💡 Click any permission pill to toggle it on or off. Changes are saved automatically.
                            </div>
                          </div>
                        ) : (
                          /* Compact Badges Preview with One-Click Revoke & Open Editor */
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center' }}>
                            {(role.permissions || []).map(p => (
                              <span key={p.id} className="badge badge-muted" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', padding: '3px 8px' }}>
                                <code>{p.permission_key}</code>
                                <button
                                  type="button"
                                  title={`Revoke ${p.permission_key}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const currentPermIds = role.permissions?.map(rp => rp.id) || [];
                                    handleUpdateRolePermissions(role.id, currentPermIds.filter(id => id !== p.id));
                                  }}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    color: 'var(--text-muted)',
                                    cursor: 'pointer',
                                    fontSize: '0.75rem',
                                    padding: '0 2px',
                                    marginLeft: '2px',
                                    lineHeight: 1,
                                  }}
                                  onMouseOver={(e) => e.currentTarget.style.color = '#ef4444'}
                                  onMouseOut={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                                >
                                  ✕
                                </button>
                              </span>
                            ))}
                            {(!role.permissions || role.permissions.length === 0) && (
                              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                No permissions assigned.
                              </span>
                            )}
                            <button
                              type="button"
                              className="btn btn-sm btn-ghost"
                              style={{ fontSize: '0.75rem', padding: '2px 8px', border: '1px dashed rgba(255,255,255,0.2)', color: 'var(--color-primary-light)' }}
                              onClick={() => setEditingPerms(prev => ({ ...prev, [role.id]: true }))}
                            >
                              + Add / Edit Permissions
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Level 3: Assigned Members */}
                      <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.6rem', fontWeight: 600 }}>
                        👥 Assigned Members ({assignedUsers.length})
                      </div>

                      {assignedUsers.length === 0 ? (
                        <div style={{ padding: '0.85rem 1rem', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '8px', border: '1px dashed rgba(255, 255, 255, 0.08)', color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', marginBottom: '1rem' }}>
                          No members currently assigned to {role.name} in {currentFestival?.name || 'this edition'}.
                        </div>
                      ) : (
                        <div className="hierarchy-members-grid">
                          {assignedUsers.map(user => (
                            <div key={user.id} className="hierarchy-member-item">
                              <div className="hierarchy-member-info">
                                <div className="hierarchy-avatar">
                                  {user.name?.charAt(0).toUpperCase() || 'U'}
                                </div>
                                <div>
                                  <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                                    {user.name}
                                  </div>
                                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                                    {user.email}
                                  </div>
                                </div>
                              </div>
                              <button
                                className="btn btn-sm btn-ghost"
                                title={`Remove ${user.name} from ${role.name}`}
                                onClick={() => handleRemoveRole(user.id, selectedFestId, role.id)}
                                style={{ color: 'var(--color-danger)', padding: '4px 8px', fontSize: '0.8rem' }}
                              >
                                ✕ Remove
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Inline Member Assign Bar */}
                      <div className="hierarchy-add-bar">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flex: 1, minWidth: '260px' }}>
                          <select
                            className="form-input admin-role-select"
                            style={{ flex: 1, minWidth: '220px' }}
                            value={selectedUsersToAdd[role.id] || ''}
                            disabled={isFull}
                            onChange={(e) => setSelectedUsersToAdd({ ...selectedUsersToAdd, [role.id]: e.target.value })}
                          >
                            <option value="">
                              {isFull ? `Capacity full (${role.user_limit} max)` : `Select user to assign to ${role.name}...`}
                            </option>
                            {unassignedUsers.map(u => (
                              <option key={u.id} value={u.id}>
                                {u.name} ({u.email})
                              </option>
                            ))}
                          </select>
                          <button
                            className="btn btn-sm btn-primary"
                            disabled={isFull || !selectedUsersToAdd[role.id]}
                            onClick={() => {
                              const uid = parseInt(selectedUsersToAdd[role.id], 10);
                              if (uid) {
                                handleAssignRole(uid, selectedFestId, role.id);
                                setSelectedUsersToAdd({ ...selectedUsersToAdd, [role.id]: '' });
                              }
                            }}
                          >
                            + Assign Member
                          </button>
                        </div>
                        {isFull && (
                          <span style={{ fontSize: '0.78rem', color: '#f87171', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                            ⚠️ Group capacity limit reached ({role.user_limit} max)
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Level 2B: Edition Modules Accordion */}
          <div className="hierarchy-group-card" style={{ marginTop: '1.5rem', marginBottom: '2rem' }}>
            <div
              className="hierarchy-group-header"
              onClick={() => setShowModules(!showModules)}
            >
              <div className="hierarchy-group-info">
                <div className="hierarchy-group-icon" style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa' }}>
                  🧩
                </div>
                <div>
                  <div className="hierarchy-group-title">
                    <span>{currentFestival?.name}: Modules & Add-ons</span>
                    <span className="badge badge-info" style={{ fontSize: '0.72rem' }}>
                      {activeModulesCount} Enabled
                    </span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Configure core capabilities and addon features enabled for this edition
                  </div>
                </div>
              </div>
              <span style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>
                {showModules ? '▲' : '▼'}
              </span>
            </div>

            {showModules && (
              <div className="hierarchy-group-body">
                <div className="table-container">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Module</th>
                        <th>Type</th>
                        <th>Route</th>
                        <th>Status</th>
                        <th>Toggle</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(festivalConfigs[selectedFestId] || []).map(feat => (
                        <tr key={feat.feature_key}>
                          <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{feat.name}</td>
                          <td>
                            <span className={`badge ${feat.feature_type === 'core' ? 'badge-info' : 'badge-warning'}`}>
                              {feat.feature_type}
                            </span>
                          </td>
                          <td style={{ fontFamily: 'monospace', fontSize: '0.8125rem' }}>{feat.route}</td>
                          <td>
                            <span className={`badge ${feat.is_enabled ? 'badge-success' : 'badge-muted'}`}>
                              {feat.is_enabled ? 'Enabled' : 'Disabled'}
                            </span>
                          </td>
                          <td>
                            <label className="toggle">
                              <input
                                type="checkbox"
                                checked={!!feat.is_enabled}
                                onChange={() => handleToggleFeature(selectedFestId, feat.feature_id, feat.is_enabled)}
                              />
                              <span className="toggle-slider"></span>
                            </label>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── MATRIX & TABS VIEW (CLASSIC) ───────────────────────────────── */}
      {viewMode === 'matrix' && (
        <div className="animate-fade-in">
          {/* Tabs */}
          <div className="tabs">
            {tabs.map(t => (
              <button key={t.key} className={`tab ${activeTab === t.key ? 'active' : ''}`} onClick={() => setActiveTab(t.key)}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Roles Tab */}
          {activeTab === 'roles' && (
            <div className="card animate-fade-in">
              <div className="card-header">
                <h3 className="card-title">Roles & Permissions</h3>
              </div>
              {roles.map(role => (
                <div key={role.id} style={{
                  marginBottom: 'var(--space-lg)', padding: 'var(--space-lg)',
                  background: 'var(--bg-glass)', borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-color)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
                    <div>
                      <h4 style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{role.name}</h4>
                      <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{role.description}</p>
                    </div>
                    {role.is_system ? <span className="badge badge-warning">System Role</span> : null}
                  </div>
                  <div className="checkbox-group">
                    {permissions.map(perm => {
                      const isChecked = role.permissions?.some(rp => rp.id === perm.id);
                      return (
                        <label key={perm.id} className={`checkbox-label ${isChecked ? 'checked' : ''}`}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              const currentPermIds = role.permissions?.map(p => p.id) || [];
                              const newPermIds = isChecked
                                ? currentPermIds.filter(id => id !== perm.id)
                                : [...currentPermIds, perm.id];
                              handleUpdateRolePermissions(role.id, newPermIds);
                            }}
                          />
                          {perm.permission_key}
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Users Tab */}
          {activeTab === 'users' && (
            <div className="card animate-fade-in">
              <div className="card-header">
                <h3 className="card-title">User Role Assignments</h3>
              </div>
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Email</th>
                      <th>Festival Roles</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map(user => (
                      <tr key={user.id}>
                        <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{user.name}</td>
                        <td>{user.email}</td>
                        <td>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                            {(user.eventGroups || []).map((eg, i) => (
                              <span key={i} className="badge badge-primary" style={{ fontSize: '0.7rem' }}>
                                {eg.event_name}: {eg.group_name}
                                <button
                                  onClick={() => handleRemoveRole(user.id, eg.event_id, eg.group_id)}
                                  style={{
                                    marginLeft: 4, background: 'none', border: 'none',
                                    color: 'inherit', cursor: 'pointer', fontSize: '0.8rem',
                                  }}
                                >✕</button>
                              </span>
                            ))}
                          </div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            {festivals.map(fest => (
                              <select
                                key={fest.id}
                                className="form-input admin-role-select"
                                defaultValue=""
                                onChange={(e) => {
                                  if (e.target.value) {
                                    handleAssignRole(user.id, fest.id, parseInt(e.target.value, 10));
                                    e.target.value = '';
                                  }
                                }}
                              >
                                <option value="" disabled>{fest.name}: Assign Group...</option>
                                {roles.map(r => (
                                  <option key={r.id} value={r.id}>{r.name} {r.user_limit ? `(Limit: ${r.user_limit})` : ''}</option>
                                ))}
                              </select>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Festivals Tab */}
          {activeTab === 'festivals' && (
            <div className="animate-fade-in">
              {festivals.map(fest => (
                <div key={fest.id} className="card" style={{ marginBottom: 'var(--space-lg)' }}>
                  <div className="card-header">
                    <div>
                      <h3 className="card-title">{fest.name}</h3>
                      <p className="card-subtitle">{fest.description}</p>
                    </div>
                  </div>
                  <div className="table-container">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Feature</th>
                          <th>Type</th>
                          <th>Route</th>
                          <th>Enabled</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(festivalConfigs[fest.id] || []).map(feat => (
                          <tr key={feat.feature_key}>
                            <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{feat.name}</td>
                            <td><span className={`badge ${feat.feature_type === 'core' ? 'badge-info' : 'badge-warning'}`}>{feat.feature_type}</span></td>
                            <td style={{ fontFamily: 'monospace', fontSize: '0.8125rem' }}>{feat.route}</td>
                            <td>
                              <label className="toggle">
                                <input
                                  type="checkbox"
                                  checked={!!feat.is_enabled}
                                  onChange={() => handleToggleFeature(fest.id, feat.feature_id, feat.is_enabled)}
                                />
                                <span className="toggle-slider"></span>
                              </label>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Permissions Tab */}
          {activeTab === 'permissions' && (
            <div className="card animate-fade-in">
              <div className="card-header">
                <h3 className="card-title">All Permissions</h3>
                <p className="card-subtitle">System-wide permission registry</p>
              </div>
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Permission Key</th>
                      <th>Label</th>
                      <th>Match Action</th>
                      <th>Unmatch Action</th>
                      <th>Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {permissions.map(p => (
                      <tr key={p.id}>
                        <td style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--color-primary-light)' }}>{p.permission_key}</td>
                        <td>{p.label || p.name}</td>
                        <td><span className="badge badge-success">{p.actions_match || 'view'}</span></td>
                        <td><span className="badge badge-muted">{p.actions_unmatch || 'hide'}</span></td>
                        <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{p.description || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
