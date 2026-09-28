/**
 * TeamPage Component
 * Manages festival team members with Groups and Permissions model.
 * - Title "Team", subtext "N members · internal coordination"
 * - "+ Add User" burgundy button
 * - Real-time individual user search against freecomers individuals directory
 * - Selection verification: only registered users from individuals table can be added
 * - Group filter pills: All, Admin, Judge, Volunteer
 * - Elevated card table: MEMBER, GROUP, PERMISSIONS, ACTIONS
 * - Add/Edit modal with group selection and permissions preview
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import api from '../services/api';
import { useAuth } from '../hooks/useAuth';

const GROUP_FILTERS = ['All', 'Admin', 'Judge', 'Volunteer'];

const GROUP_PERMISSIONS_MAP = {
  admin: [
    { key: '*', label: 'All Permissions' },
    { key: 'admin:access', label: 'Admin Access' },
    { key: 'submissions:*', label: 'Submissions Control' },
    { key: 'reviews:*', label: 'Review Pipeline' },
    { key: 'tasks:*', label: 'Task Management' },
    { key: 'payouts:*', label: 'Payouts Control' },
  ],
  judge: [
    { key: 'jury:view_panel', label: 'View Jury Panel' },
    { key: 'jury:score', label: 'Score Submissions' },
    { key: 'jury:submit_decision', label: 'Submit Ballots' },
    { key: 'review:evaluate', label: 'Evaluate Reviews' },
    { key: 'submission:view', label: 'View Submissions' },
  ],
  volunteer: [
    { key: 'task:view', label: 'View Tasks' },
    { key: 'task:update_status', label: 'Update Progress' },
    { key: 'calendar:view', label: 'View Screenings' },
    { key: 'submission:view', label: 'View Submissions' },
  ],
};

const MODULE_ICON_MAP = {
  submissions: '🎬',
  film: '🎬',
  jury: '⚖️',
  award: '🏆',
  team: '🛡️',
  users: '👥',
  tasks: '📋',
  'check-square': '📋',
  schedule: '🗓️',
  calendar: '🗓️',
  guests: '🛎️',
  'user-check': '🛎️',
  chat: '💬',
  'message-square': '💬',
  dashboard: '📊',
  layout: '📊',
  sponsors: '🤝',
  'dollar-sign': '🤝',
  comms: '📢',
  mail: '📢',
  payouts: '💳',
  'credit-card': '💳',
  settings: '⚙️',
  discovery: '🔍',
  compass: '🔍',
  marketing: '📣',
  'share-2': '📣',
};

const GROUP_DESCRIPTIONS = {
  admin: 'Full Control — Festival Director & Control Tower governance',
  judge: 'Jury & Scoring — Screening reviews, scorecards and jury ballots',
  volunteer: 'Assigned Only — Shift operations, task execution and check-in',
};

const getInitials = (name) => {
  if (!name) return 'U';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

/**
 * Component: Multi-Group Picker for Team Members
 * Allows selecting multiple groups (Standard: Admin, Judge, Volunteer + Custom Groups).
 */
function MultiGroupPicker({
  selectedGroupKeys,
  onChange,
  customGroups = [],
  groupDefaults = {},
  catalog = []
}) {
  const standardGroups = [
    {
      key: 'admin',
      label: 'Admin',
      type: 'standard',
      desc: 'Festival Director & Control Tower governance (Full Access)',
      permCount: catalog.reduce((acc, m) => acc + (m.permissions?.length || 0), 0)
    },
    {
      key: 'judge',
      label: 'Judge',
      type: 'standard',
      desc: 'Screening reviews, 5-criteria scorecards and jury ballots',
      permCount: (groupDefaults['judge'] || []).length
    },
    {
      key: 'volunteer',
      label: 'Volunteer',
      type: 'standard',
      desc: 'Shift operations, task execution and check-in desk',
      permCount: (groupDefaults['volunteer'] || []).length
    }
  ];

  const formattedCustomGroups = customGroups.map((cg) => ({
    key: `custom_${cg.id}`,
    label: cg.name,
    type: 'custom',
    desc: cg.description || 'Custom festival group role',
    permCount: cg.permissions?.length || 0
  }));

  const allGroups = [...standardGroups, ...formattedCustomGroups];

  const toggleGroup = (key) => {
    const next = new Set(selectedGroupKeys);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    onChange(next);
  };

  const removeGroup = (key, e) => {
    e.stopPropagation();
    const next = new Set(selectedGroupKeys);
    next.delete(key);
    onChange(next);
  };

  return (
    <div className="fc-multi-group-picker">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <label style={{ margin: 0, fontWeight: 700, fontSize: '0.85rem' }}>
          Assigned Groups <span style={{ color: 'var(--fc-brand)', fontSize: '0.8rem' }}>({selectedGroupKeys.size} selected)</span>
        </label>
        <span style={{ fontSize: '0.72rem', color: 'var(--fc-text-muted)' }}>
          Select multiple groups to combine permissions
        </span>
      </div>

      {/* Selected Chips */}
      {selectedGroupKeys.size > 0 ? (
        <div className="fc-group-chips-row">
          {Array.from(selectedGroupKeys).map((key) => {
            const g = allGroups.find((item) => item.key === key) || { label: key };
            return (
              <span key={key} className="fc-group-chip">
                <span>✓ {g.label}</span>
                <button
                  type="button"
                  className="fc-group-chip-remove"
                  onClick={(e) => removeGroup(key, e)}
                  title={`Remove ${g.label}`}
                >
                  ×
                </button>
              </span>
            );
          })}
        </div>
      ) : (
        <div style={{ fontSize: '0.75rem', color: '#b91c1c', fontStyle: 'italic', padding: '4px 0' }}>
          No groups selected. Please select at least one group below.
        </div>
      )}

      {/* Selectable Cards Grid */}
      <div className="fc-group-cards-grid">
        {allGroups.map((g) => {
          const isSelected = selectedGroupKeys.has(g.key);
          return (
            <div
              key={g.key}
              className={`fc-group-card ${isSelected ? 'selected' : ''}`}
              onClick={() => toggleGroup(g.key)}
              title={`Click to ${isSelected ? 'unassign' : 'assign'} ${g.label}`}
            >
              <input
                type="checkbox"
                className="fc-group-card-check"
                checked={isSelected}
                onChange={() => toggleGroup(g.key)}
                onClick={(e) => e.stopPropagation()}
              />
              <div className="fc-group-card-content">
                <div className="fc-group-card-title-row">
                  <span className="fc-group-card-label">{g.label}</span>
                  <div className="fc-group-card-meta">
                    <span className={`fc-group-type-tag ${g.type}`}>{g.type}</span>
                    <span className="fc-group-perms-badge">{g.permCount} perms</span>
                  </div>
                </div>
                <span className="fc-group-card-desc">{g.desc}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Helper: Group catalog permissions by prefix domain (e.g. submission, review, jury, team, task, etc.)
 * Matches Screenshot 2 where 'submission' and 'review' are separate cards.
 */
function getDomainGroups(catalog) {
  const map = new Map();
  for (const mod of catalog) {
    for (const p of (mod.permissions || [])) {
      const prefix = p.key && p.key.includes(':')
        ? p.key.split(':')[0]
        : (mod.key || 'other');
      
      if (!map.has(prefix)) {
        map.set(prefix, {
          key: prefix,
          label: prefix,
          moduleKey: mod.key,
          moduleLabel: mod.label,
          icon: MODULE_ICON_MAP[prefix] || MODULE_ICON_MAP[mod.key] || '📁',
          permissions: []
        });
      }
      map.get(prefix).permissions.push({
        ...p,
        moduleKey: mod.key,
        moduleLabel: mod.label
      });
    }
  }
  return Array.from(map.values());
}

/**
 * Reusable Component: Permissions Grouped by Module
 * In read-only mode: Displays effective inherited permissions immutably in Screenshot 2 tree cards.
 * In interactive mode (Add Custom Group): Supports checkboxes, Select All, Deselect All.
 */
function PermissionsByModuleSection({
  catalog,
  permissions,
  onTogglePermission,
  onToggleModule,
  onSelectAll,
  onDeselectAll,
  onResetDefaults,
  groupKey,
  groupDefaults,
  expandedModules,
  onToggleExpandModule,
  onExpandAll,
  onCollapseAll,
  searchQuery = '',
  onSearchChange,
  isCustomGroupCreation = false,
  readOnly = false,
  permissionSourceMap = null,
  selectedGroupsSummary = null,
  defaultFilterMode = null,
}) {
  const [filterMode, setFilterMode] = useState(defaultFilterMode || (readOnly ? 'granted' : 'all'));
  const domainGroups = useMemo(() => getDomainGroups(catalog), [catalog]);
  const totalCatalogPermsCount = catalog.reduce((acc, m) => acc + (m.permissions?.length || 0), 0);

  const [internalExpanded, setInternalExpanded] = useState(() => {
    if (expandedModules && expandedModules instanceof Set && expandedModules.size > 0) {
      return new Set(expandedModules);
    }
    return new Set(domainGroups.map((g) => g.key));
  });

  useEffect(() => {
    if (expandedModules && expandedModules instanceof Set && expandedModules.size > 0) {
      setInternalExpanded(new Set(expandedModules));
    } else {
      setInternalExpanded(new Set(domainGroups.map((g) => g.key)));
    }
  }, [domainGroups, expandedModules]);

  const handleToggle = (key) => {
    setInternalExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
    if (onToggleExpandModule) onToggleExpandModule(key);
  };

  const handleExpandAll = () => {
    const all = new Set(domainGroups.map((g) => g.key));
    setInternalExpanded(all);
    if (onExpandAll) onExpandAll();
  };

  const handleCollapseAll = () => {
    setInternalExpanded(new Set());
    if (onCollapseAll) onCollapseAll();
  };

  const filteredGroups = useMemo(() => {
    const q = (searchQuery || '').trim().toLowerCase();
    return domainGroups
      .map((group) => {
        const filteredPerms = group.permissions.filter((p) => {
          if (filterMode === 'granted' && !permissions.has(p.key)) return false;
          if (!q) return true;
          return (
            group.label.toLowerCase().includes(q) ||
            p.label.toLowerCase().includes(q) ||
            p.key.toLowerCase().includes(q) ||
            (p.description && p.description.toLowerCase().includes(q))
          );
        });
        return {
          ...group,
          filteredPerms,
          activeCount: group.permissions.filter((p) => permissions.has(p.key)).length
        };
      })
      .filter((group) => {
        if (filterMode === 'granted' && group.activeCount === 0) return false;
        if (!q) return true;
        return group.filteredPerms.length > 0;
      });
  }, [domainGroups, searchQuery, filterMode, permissions]);

  return (
    <div className="fc-perm-section">
      <div className="fc-perm-section-header">
        <div className="fc-perm-title-row">
          <span className="fc-perm-section-title">Permissions Grouped by Module</span>
          <span className="fc-perm-counter-badge">
            {permissions.size} / {totalCatalogPermsCount} {readOnly ? 'Granted' : 'Allowed'}
          </span>
          {readOnly ? (
            <span className="fc-perm-custom-tag" style={{ background: '#f8fafc', color: '#475569', borderColor: '#cbd5e1' }}>
              🔒 Inherited & Read-Only
            </span>
          ) : isCustomGroupCreation ? (
            <span className="fc-perm-custom-tag" style={{ background: '#fdf4ff', color: '#86198f', borderColor: '#f0abfc' }}>
              Custom Group Config
            </span>
          ) : null}
        </div>
      </div>

      {readOnly && (
        <div className="fc-perm-readonly-banner">
          <span>🔒</span>
          <div>
            <strong>Inherited Permissions:</strong> Granted according to the assigned groups selected above.
            Permissions are immutable (read-only) and cannot be added or removed here.
          </div>
        </div>
      )}

      {/* Selected Group Summary (Screenshot 2 Top Box) */}
      {selectedGroupsSummary && (
        <div className="fc-perm-group-summary-card">
          <div className="fc-perm-group-summary-left">
            <span className="fc-perm-group-summary-icon">{selectedGroupsSummary.icon || '⚖️'}</span>
            <div>
              <div className="fc-perm-group-summary-title">{selectedGroupsSummary.title}</div>
              <div className="fc-perm-group-summary-sub">{selectedGroupsSummary.subtitle}</div>
            </div>
          </div>
          <span className="fc-perm-group-summary-chevron">^</span>
        </div>
      )}

      {/* Toolbar with Actions (Search & filters removed in read-only mode, only Expand All and Collapse All) */}
      <div className="fc-perm-toolbar" style={readOnly ? { justifyContent: 'flex-end' } : {}}>
        {!readOnly && (
          <div className="fc-perm-search-box">
            <span>🔍</span>
            <input
              type="text"
              placeholder="Search permissions, modules or keys..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--fc-text-muted)', fontSize: '0.8rem' }}
              >
                ✕
              </button>
            )}
          </div>
        )}
        <div className="fc-perm-actions-row">
          <button
            type="button"
            className="fc-btn-perm-tool"
            onClick={handleExpandAll}
            title="Expand all module sections"
          >
            Expand All
          </button>
          <button
            type="button"
            className="fc-btn-perm-tool"
            onClick={handleCollapseAll}
            title="Collapse all module sections"
          >
            Collapse All
          </button>
          {!readOnly && (
            <>
              <button
                type="button"
                className="fc-btn-perm-tool"
                onClick={onSelectAll}
                title="Allow all permissions across all modules"
              >
                Select All
              </button>
              <button
                type="button"
                className="fc-btn-perm-tool"
                onClick={onDeselectAll}
                title="Remove all permissions"
              >
                Deselect All
              </button>
              {!isCustomGroupCreation && onResetDefaults && (
                <button
                  type="button"
                  className="fc-btn-perm-tool fc-btn-perm-reset"
                  onClick={onResetDefaults}
                  title="Reset permissions to standard defaults"
                >
                  ↺ Defaults
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* One Unified Tree Container */}
      <div className="fc-perm-modules-container">
        {filteredGroups.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--fc-text-muted)', fontSize: '0.85rem' }}>
            No permissions granted.
          </div>
        ) : (
          <div className="fc-single-tree-card">
            {filteredGroups.map((group, groupIdx) => {
              const isExpanded = internalExpanded.has(group.key);
              const allGroupSelected = group.permissions.length > 0 && group.permissions.every((p) => permissions.has(p.key));
              const isLast = groupIdx === filteredGroups.length - 1;

              return (
                <div
                  key={group.key}
                  className="fc-tree-domain-branch"
                  style={{
                    borderBottom: isLast ? 'none' : '1px solid #f1f5f9',
                    paddingBottom: isLast ? 0 : '14px',
                    marginBottom: isLast ? 0 : '14px',
                  }}
                >
                  <div
                    className="fc-perm-card-header"
                    onClick={() => handleToggle(group.key)}
                  >
                    <div className="fc-perm-card-title-left">
                      <button
                        type="button"
                        className="fc-perm-minus-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggle(group.key);
                        }}
                        title={isExpanded ? 'Collapse section' : 'Expand section'}
                      >
                        {isExpanded ? '−' : '+'}
                      </button>
                      <span className="fc-perm-card-title">{group.label}</span>
                    </div>
                    <div className="fc-perm-card-meta-right">
                      <span className={`fc-perm-card-badge ${group.activeCount > 0 ? 'active' : ''}`}>
                        {group.activeCount} / {group.permissions.length}
                      </span>
                      {!readOnly && (
                        <label
                          className="fc-perm-card-select-all"
                          onClick={(e) => e.stopPropagation()}
                          title="Select / deselect all permissions in this section"
                        >
                          <input
                            type="checkbox"
                            checked={allGroupSelected}
                            onChange={() => onToggleModule && onToggleModule({ permissions: group.permissions })}
                          />
                          <span>All</span>
                        </label>
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="fc-perm-tree-container">
                      {group.filteredPerms.map((perm) => {
                        const isChecked = permissions.has(perm.key);
                        return (
                          <div
                            key={perm.key}
                            className={`fc-perm-tree-item ${isChecked ? 'is-granted' : 'is-not-granted'} ${readOnly ? 'read-only' : 'interactive'}`}
                            onClick={readOnly ? undefined : () => onTogglePermission(perm.key)}
                            title={perm.description ? `${perm.key} — ${perm.description}` : perm.key}
                          >
                            <span className="fc-perm-tree-bullet">-</span>
                            {!readOnly && (
                              <div className="fc-perm-tree-box-wrapper">
                                {isChecked ? (
                                  <span className="fc-perm-box-checked">✓</span>
                                ) : (
                                  <span className="fc-perm-box-unchecked" />
                                )}
                              </div>
                            )}
                            <div className="fc-perm-tree-content">
                              <div className="fc-perm-tree-key-row">
                                <span className="fc-perm-tree-key">{perm.key}</span>
                                {readOnly && isChecked && permissionSourceMap && permissionSourceMap.has(perm.key) && (
                                  <span className="fc-perm-source-tag">
                                    via {permissionSourceMap.get(perm.key).join(', ')}
                                  </span>
                                )}
                              </div>
                              {perm.description && (
                                <div className="fc-perm-tree-desc">{perm.description}</div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function TeamPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [groupDefaults, setGroupDefaults] = useState({ admin: [], judge: [], volunteer: [] });
  const [customGroups, setCustomGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Festival Admin check (strictly for Festival Administrators)
  const isFestivalAdmin = Boolean(
    user && (
      user.isSuperAdmin ||
      (typeof user.role === 'string' && user.role.toLowerCase() === 'admin') ||
      (typeof user.current_group === 'string' && user.current_group.toLowerCase() === 'admin') ||
      (Array.isArray(user.eventGroups) && user.eventGroups.some(eg => eg.group_key === 'admin')) ||
      Boolean(user.permissions && (user.permissions['team:manage'] || user.permissions['team.manage']))
    )
  );

  // Group filter
  const [selectedGroup, setSelectedGroup] = useState('All');
  // Search query in table
  const [search, setSearch] = useState('');
  // Expanded member sub-row in table for inline preview
  const [expandedMemberId, setExpandedMemberId] = useState(null);

  // Add Member Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [addSelectedGroups, setAddSelectedGroups] = useState(new Set(['judge']));
  const [addExpandedModules, setAddExpandedModules] = useState(new Set());
  const [addPermSearch, setAddPermSearch] = useState('');

  // Edit Member Modal states
  const [editingUser, setEditingUser] = useState(null);
  const [editSelectedGroups, setEditSelectedGroups] = useState(new Set(['volunteer']));
  const [editExpandedModules, setEditExpandedModules] = useState(new Set());
  const [editPermSearch, setEditPermSearch] = useState('');

  // Create Custom Group Modal states (Festival Admin Only)
  const [showCustomGroupModal, setShowCustomGroupModal] = useState(false);
  const [cgName, setCgName] = useState('');
  const [cgDescription, setCgDescription] = useState('');
  const [cgPermissions, setCgPermissions] = useState(new Set());
  const [cgExpandedModules, setCgExpandedModules] = useState(new Set());
  const [cgPermSearch, setCgPermSearch] = useState('');
  const [cgLoading, setCgLoading] = useState(false);
  
  const [actionLoading, setActionLoading] = useState(false);

  // User search states in Add Modal
  const [userQuery, setUserQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchFeedback, setSearchFeedback] = useState(null);
  const dropdownRef = useRef(null);

  const fetchTeam = async () => {
    try {
      setLoading(true);
      const res = await api.get('/team');
      setUsers(res.data.users || []);
      if (res.data.catalog) {
        setCatalog(res.data.catalog);
      }
      if (res.data.groupDefaults) {
        setGroupDefaults(res.data.groupDefaults);
      }
      if (res.data.customGroups) {
        setCustomGroups(res.data.customGroups);
      }
    } catch (err) {
      console.error('Failed to load team:', err);
      setError('Unable to load team members.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTeam();
  }, []);

  // Debounced search for individuals in Add Modal
  useEffect(() => {
    if (!showAddModal) {
      setUserQuery('');
      setSearchResults([]);
      setIsSearching(false);
      setSelectedUser(null);
      setIsDropdownOpen(false);
      setSearchFeedback(null);
      return;
    }

    if (selectedUser) {
      setIsDropdownOpen(false);
      return;
    }

    const trimmed = userQuery.trim();
    if (trimmed.length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      setIsDropdownOpen(false);
      setSearchFeedback(null);
      return;
    }

    setIsSearching(true);
    setIsDropdownOpen(true);
    const timer = setTimeout(async () => {
      try {
        const res = await api.get('/team/search', { params: { q: trimmed } });
        setSearchResults(res.data.users || []);
      } catch (err) {
        console.error('Error searching users:', err);
        setSearchFeedback('Search failed. Please try again.');
      } finally {
        setIsSearching(false);
      }
    }, 280);

    return () => clearTimeout(timer);
  }, [userQuery, showAddModal, selectedUser]);

  // Click outside listener to close search dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Effective permissions for Add Member (union of permissions from addSelectedGroups)
  const addEffectivePermissions = useMemo(() => {
    const union = new Set();
    for (const gKey of addSelectedGroups) {
      if (gKey === 'admin') {
        catalog.forEach((m) => (m.permissions || []).forEach((p) => union.add(p.key)));
      } else if (gKey.startsWith('custom_')) {
        const cId = parseInt(gKey.replace('custom_', ''), 10);
        const cg = customGroups.find((c) => c.id === cId);
        if (cg?.permissions) {
          cg.permissions.forEach((k) => union.add(k));
        }
      } else {
        const defs = groupDefaults[gKey] || [];
        defs.forEach((k) => union.add(k));
      }
    }
    return union;
  }, [addSelectedGroups, catalog, groupDefaults, customGroups]);

  // Source map for Add Member (which group granted each permission)
  const addSourceMap = useMemo(() => {
    const map = new Map();
    for (const gKey of addSelectedGroups) {
      let gName = gKey === 'admin' ? 'Admin' : gKey === 'judge' ? 'Judge' : gKey === 'volunteer' ? 'Volunteer' : gKey;
      if (gKey.startsWith('custom_')) {
        const cId = parseInt(gKey.replace('custom_', ''), 10);
        const cg = customGroups.find((c) => c.id === cId);
        if (cg) gName = cg.name;
      }

      let perms = [];
      if (gKey === 'admin') {
        perms = catalog.flatMap((m) => (m.permissions || []).map((p) => p.key));
      } else if (gKey.startsWith('custom_')) {
        const cId = parseInt(gKey.replace('custom_', ''), 10);
        const cg = customGroups.find((c) => c.id === cId);
        perms = cg?.permissions || [];
      } else {
        perms = groupDefaults[gKey] || [];
      }

      for (const pk of perms) {
        if (!map.has(pk)) map.set(pk, []);
        if (!map.get(pk).includes(gName)) map.get(pk).push(gName);
      }
    }
    return map;
  }, [addSelectedGroups, catalog, groupDefaults, customGroups]);

  // Effective permissions for Edit Member (union of permissions from editSelectedGroups)
  const editEffectivePermissions = useMemo(() => {
    const union = new Set();
    for (const gKey of editSelectedGroups) {
      if (gKey === 'admin') {
        catalog.forEach((m) => (m.permissions || []).forEach((p) => union.add(p.key)));
      } else if (gKey.startsWith('custom_')) {
        const cId = parseInt(gKey.replace('custom_', ''), 10);
        const cg = customGroups.find((c) => c.id === cId);
        if (cg?.permissions) {
          cg.permissions.forEach((k) => union.add(k));
        }
      } else {
        const defs = groupDefaults[gKey] || [];
        defs.forEach((k) => union.add(k));
      }
    }
    return union;
  }, [editSelectedGroups, catalog, groupDefaults, customGroups]);

  // Source map for Edit Member (which group granted each permission)
  const editSourceMap = useMemo(() => {
    const map = new Map();
    for (const gKey of editSelectedGroups) {
      let gName = gKey === 'admin' ? 'Admin' : gKey === 'judge' ? 'Judge' : gKey === 'volunteer' ? 'Volunteer' : gKey;
      if (gKey.startsWith('custom_')) {
        const cId = parseInt(gKey.replace('custom_', ''), 10);
        const cg = customGroups.find((c) => c.id === cId);
        if (cg) gName = cg.name;
      }

      let perms = [];
      if (gKey === 'admin') {
        perms = catalog.flatMap((m) => (m.permissions || []).map((p) => p.key));
      } else if (gKey.startsWith('custom_')) {
        const cId = parseInt(gKey.replace('custom_', ''), 10);
        const cg = customGroups.find((c) => c.id === cId);
        perms = cg?.permissions || [];
      } else {
        perms = groupDefaults[gKey] || [];
      }

      for (const pk of perms) {
        if (!map.has(pk)) map.set(pk, []);
        if (!map.get(pk).includes(gName)) map.get(pk).push(gName);
      }
    }
    return map;
  }, [editSelectedGroups, catalog, groupDefaults, customGroups]);

  const ALL_DOMAIN_KEYS = [
    'submission', 'review', 'jury', 'team', 'task', 'calendar', 'schedule',
    'guest', 'hospitality', 'chat', 'sponsor', 'comms', 'payout', 'festival',
    'laurel', 'marketing'
  ];

  // Group summary for Add Member (matches Screenshot 2 top card)
  const addGroupSummary = useMemo(() => {
    if (addSelectedGroups.size === 0) return null;
    const names = [];
    let icon = '⚖️';
    for (const gKey of addSelectedGroups) {
      if (gKey === 'admin') {
        names.push('Admin');
        icon = '🛡️';
      } else if (gKey === 'judge') {
        names.push('Judge');
        icon = '⚖️';
      } else if (gKey === 'volunteer') {
        names.push('Volunteer');
        icon = '👥';
      } else if (gKey.startsWith('custom_')) {
        const cId = parseInt(gKey.replace('custom_', ''), 10);
        const cg = customGroups.find((c) => c.id === cId);
        if (cg) names.push(cg.name);
        icon = '⭐';
      }
    }
    return {
      title: names.join(' + ') || 'Assigned Group',
      subtitle: `${names.length === 1 && names[0] === 'Judge' ? '1 assigned members' : `${addEffectivePermissions.size} permissions granted from ${names.length} group${names.length > 1 ? 's' : ''}`}`,
      icon: names.length > 1 ? '✨' : icon,
    };
  }, [addSelectedGroups, customGroups, addEffectivePermissions]);

  // Group summary for Edit Member (matches Screenshot 2 top card)
  const editGroupSummary = useMemo(() => {
    if (editSelectedGroups.size === 0) return null;
    const names = [];
    let icon = '⚖️';
    for (const gKey of editSelectedGroups) {
      if (gKey === 'admin') {
        names.push('Admin');
        icon = '🛡️';
      } else if (gKey === 'judge') {
        names.push('Judge');
        icon = '⚖️';
      } else if (gKey === 'volunteer') {
        names.push('Volunteer');
        icon = '👥';
      } else if (gKey.startsWith('custom_')) {
        const cId = parseInt(gKey.replace('custom_', ''), 10);
        const cg = customGroups.find((c) => c.id === cId);
        if (cg) names.push(cg.name);
        icon = '⭐';
      }
    }
    return {
      title: names.join(' + ') || 'Assigned Group',
      subtitle: `${editingUser?.name || 'Member'} · ${editEffectivePermissions.size} permissions granted from ${names.length} group${names.length > 1 ? 's' : ''}`,
      icon: names.length > 1 ? '✨' : icon,
    };
  }, [editSelectedGroups, customGroups, editEffectivePermissions, editingUser]);

  // Count members per group (Standard groups + Custom groups)
  const groupCounts = {
    All: users.length,
    Admin: users.filter((u) => u.roleKeys?.includes('admin') || u.role?.toLowerCase().includes('admin')).length,
    Judge: users.filter((u) => u.roleKeys?.includes('judge') || u.role?.toLowerCase().includes('judge')).length,
    Volunteer: users.filter((u) => u.roleKeys?.includes('volunteer') || u.role?.toLowerCase().includes('volunteer')).length,
  };
  customGroups.forEach((cg) => {
    groupCounts[cg.name] = users.filter((u) =>
      u.roleKeys?.includes(`custom_${cg.id}`) ||
      u.role?.includes(cg.name) ||
      (Array.isArray(u.groups) && u.groups.some((g) => g.id === cg.id || g.label === cg.name))
    ).length;
  });

  // Filtered users based on group & search
  const filteredUsers = users.filter((u) => {
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchesSearch =
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q);
      if (!matchesSearch) return false;
    }

    if (selectedGroup === 'All') return true;
    if (selectedGroup === 'Admin') {
      return u.roleKeys?.includes('admin') || u.role?.toLowerCase().includes('admin');
    }
    if (selectedGroup === 'Judge') {
      return u.roleKeys?.includes('judge') || u.role?.toLowerCase().includes('judge');
    }
    if (selectedGroup === 'Volunteer') {
      return u.roleKeys?.includes('volunteer') || u.role?.toLowerCase().includes('volunteer');
    }
    const cg = customGroups.find((c) => c.name === selectedGroup);
    if (cg) {
      return (
        u.roleKeys?.includes(`custom_${cg.id}`) ||
        u.role?.includes(cg.name) ||
        (Array.isArray(u.groups) && u.groups.some((g) => g.id === cg.id || g.label === cg.name))
      );
    }
    return true;
  });

  const handleSelectUser = (user) => {
    if (user.isAlreadyMember) return;
    setSelectedUser(user);
    setUserQuery('');
    setSearchResults([]);
    setIsDropdownOpen(false);
  };

  const handleClearSelectedUser = () => {
    setSelectedUser(null);
    setUserQuery('');
    setSearchResults([]);
  };

  // Open Add Modal
  const handleOpenAdd = () => {
    setSelectedUser(null);
    setUserQuery('');
    setAddSelectedGroups(new Set(['judge']));
    setAddExpandedModules(new Set(ALL_DOMAIN_KEYS.concat(catalog.map((m) => m.key || m.id))));
    setAddPermSearch('');
    setShowAddModal(true);
  };

  const toggleAddExpandModule = (key) => {
    setAddExpandedModules((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleAddExpandAll = () => {
    setAddExpandedModules(new Set(ALL_DOMAIN_KEYS.concat(catalog.map((m) => m.key || m.id))));
  };

  const handleAddCollapseAll = () => {
    setAddExpandedModules(new Set());
  };

  // Open Create Custom Group Modal (Festival Admin Only)
  const handleOpenCreateCustomGroup = () => {
    setCgName('');
    setCgDescription('');
    setCgPermissions(new Set());
    setCgExpandedModules(new Set(ALL_DOMAIN_KEYS.concat(catalog.map((m) => m.key || m.id))));
    setCgPermSearch('');
    setShowCustomGroupModal(true);
  };

  const toggleCgPermission = (key) => {
    setCgPermissions((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleCgModule = (module) => {
    const modPermKeys = (module.permissions || []).map((p) => p.key);
    const allSelected = modPermKeys.length > 0 && modPermKeys.every((k) => cgPermissions.has(k));
    setCgPermissions((prev) => {
      const next = new Set(prev);
      if (allSelected) modPermKeys.forEach((k) => next.delete(k));
      else modPermKeys.forEach((k) => next.add(k));
      return next;
    });
  };

  const handleCgSelectAll = () => {
    setCgPermissions(new Set(catalog.flatMap((m) => (m.permissions || []).map((p) => p.key))));
  };

  const handleCgDeselectAll = () => {
    setCgPermissions(new Set());
  };

  const toggleCgExpandModule = (key) => {
    setCgExpandedModules((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleCgExpandAll = () => {
    setCgExpandedModules(new Set(ALL_DOMAIN_KEYS.concat(catalog.map((m) => m.key || m.id))));
  };

  const handleCgCollapseAll = () => {
    setCgExpandedModules(new Set());
  };

  // Submit Create Custom Group
  const handleCreateCustomGroupSubmit = async (e) => {
    e.preventDefault();
    if (!cgName.trim()) {
      alert('Please enter a group name.');
      return;
    }

    setCgLoading(true);
    try {
      const res = await api.post('/team/custom-groups', {
        name: cgName.trim(),
        description: cgDescription.trim(),
        permissions: Array.from(cgPermissions),
      });
      setShowCustomGroupModal(false);
      setCgName('');
      setCgDescription('');
      setCgPermissions(new Set());
      await fetchTeam();
      alert(res.data.message || `Custom group "${cgName.trim()}" created successfully.`);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to create custom group.');
    } finally {
      setCgLoading(false);
    }
  };

  // Handle Add Member Submit
  const handleAddSubmit = async (e) => {
    e.preventDefault();
    if (!selectedUser) {
      alert('Please search and select a registered individual user from the database.');
      return;
    }
    if (addSelectedGroups.size === 0) {
      alert('Please select at least one group for this team member.');
      return;
    }

    setActionLoading(true);
    try {
      await api.post('/team', {
        userId: selectedUser.userId,
        groups: Array.from(addSelectedGroups)
      });
      setShowAddModal(false);
      setSelectedUser(null);
      setUserQuery('');
      setAddSelectedGroups(new Set(['volunteer']));
      await fetchTeam();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to add team member.');
    } finally {
      setActionLoading(false);
    }
  };

  // Open Edit Modal for a member
  const handleStartEdit = (member) => {
    const initialKeys = new Set();
    if (Array.isArray(member.groups) && member.groups.length > 0) {
      member.groups.forEach((g) => initialKeys.add(g.key));
    } else if (Array.isArray(member.roleKeys) && member.roleKeys.length > 0) {
      member.roleKeys.forEach((k) => initialKeys.add(k));
    } else {
      const fallback = (member.roleKey || member.role || 'volunteer').toLowerCase();
      if (fallback.includes('admin')) initialKeys.add('admin');
      else if (fallback.includes('judge')) initialKeys.add('judge');
      else initialKeys.add('volunteer');
    }
    setEditingUser(member);
    setEditSelectedGroups(initialKeys);
    setEditExpandedModules(new Set(ALL_DOMAIN_KEYS.concat(catalog.map((m) => m.key || m.id))));
    setEditPermSearch('');
  };

  const toggleEditExpandModule = (key) => {
    setEditExpandedModules((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleEditExpandAll = () => {
    setEditExpandedModules(new Set(ALL_DOMAIN_KEYS.concat(catalog.map((m) => m.key || m.id))));
  };

  const handleEditCollapseAll = () => {
    setEditExpandedModules(new Set());
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editingUser) return;
    if (editSelectedGroups.size === 0) {
      alert('Please select at least one group for this team member.');
      return;
    }

    setActionLoading(true);
    try {
      await api.put(`/team/${editingUser.id}`, {
        groups: Array.from(editSelectedGroups)
      });
      setEditingUser(null);
      await fetchTeam();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update team member.');
    } finally {
      setActionLoading(false);
    }
  };


  // Handle Delete Member
  const handleDelete = async (id, name) => {
    if (user && (user.id === id || user.email?.toLowerCase() === name?.toLowerCase())) {
      alert('You cannot remove yourself from the festival team.');
      return;
    }
    if (!window.confirm(`Are you sure you want to remove ${name} from this festival edition?`)) return;
    try {
      await api.delete(`/team/${id}`);
      await fetchTeam();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to remove team member.');
    }
  };

  return (
    <div className="fc-team-page">
      {/* Top Header */}
      <div className="fc-page-header">
        <div>
          <h1 className="fc-page-title">Team</h1>
          <p className="fc-page-subtitle">{users.length} members · internal coordination</p>
        </div>
        <div className="fc-header-actions" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {isFestivalAdmin && (
            <button 
              type="button"
              className="fc-btn-custom-group" 
              onClick={handleOpenCreateCustomGroup}
              id="create-custom-group-btn"
              title="Create a custom group with modular permissions (Festival Admin only)"
            >
              <span>+ Add Custom Group</span>
            </button>
          )}
          <button 
            className="fc-btn-primary" 
            onClick={handleOpenAdd}
            id="add-user-btn"
          >
            + Add User
          </button>
        </div>
      </div>

      {/* Group Filter Pills */}
      <div className="fc-dept-pills">
        {GROUP_FILTERS.map((group) => (
          <button
            key={group}
            className={`fc-dept-pill ${selectedGroup === group ? 'active' : ''}`}
            onClick={() => setSelectedGroup(group)}
          >
            {group} ({groupCounts[group] || 0})
          </button>
        ))}
        {customGroups.map((cg) => (
          <button
            key={cg.id}
            className={`fc-dept-pill ${selectedGroup === cg.name ? 'active' : ''}`}
            onClick={() => setSelectedGroup(cg.name)}
          >
            {cg.name} ({groupCounts[cg.name] || 0})
          </button>
        ))}
      </div>

      {/* Table Card */}
      <div className="fc-card fc-table-card">
        {loading ? (
          <div className="fc-loading-state">
            <div className="fc-spinner"></div>
            <span>Loading festival team...</span>
          </div>
        ) : error ? (
          <div className="fc-error-state">{error}</div>
        ) : filteredUsers.length === 0 ? (
          <div className="fc-empty-state">
            No team members found{selectedGroup !== 'All' ? ` in the "${selectedGroup}" group` : ''}.
          </div>
        ) : (
          <table className="fc-table">
            <thead>
              <tr>
                <th>MEMBER</th>
                <th>GROUP</th>
                <th>PERMISSIONS</th>
                <th style={{ textAlign: 'right', paddingRight: '24px' }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((member) => {
                const isCurrentUser = user && (user.id === member.id || user.email?.toLowerCase() === member.email?.toLowerCase());
                return (
                  <React.Fragment key={member.id}>
                    <tr>
                      {/* MEMBER */}
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div className="fc-avatar" style={{ width: '32px', height: '32px', fontSize: '0.75rem', flexShrink: 0 }}>
                            {getInitials(member.name)}
                          </div>
                          <div className="fc-member-cell">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span className="fc-member-name">{member.name}</span>
                              {isCurrentUser && (
                                <span className="fc-selected-verified-tag" style={{ fontSize: '0.62rem', padding: '1px 5px', borderRadius: '6px' }}>
                                  You
                                </span>
                              )}
                            </div>
                            <span className="fc-member-email">{member.email}</span>
                          </div>
                        </div>
                      </td>

                      {/* GROUP */}
                      <td>
                        {member.groups && member.groups.length > 0 ? (
                          <div className="fc-member-groups-list">
                            {member.groups.map((g) => {
                              const badgeClass = g.key === 'admin' ? 'admin' : g.key === 'judge' ? 'judge' : g.key === 'volunteer' ? 'volunteer' : 'custom';
                              return (
                                <span key={g.key} className={`fc-group-badge ${badgeClass}`}>
                                  {g.label}
                                </span>
                              );
                            })}
                          </div>
                        ) : (
                          <span className="fc-group-badge volunteer">{member.group || member.role || 'Volunteer'}</span>
                        )}
                      </td>

                      {/* PERMISSIONS */}
                      <td>
                        <div
                          className="fc-dept-tags"
                          style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px', cursor: 'pointer' }}
                          onClick={() => setExpandedMemberId(expandedMemberId === member.id ? null : member.id)}
                          title="Click to view full effective permissions"
                        >
                          {member.hasCustomPermissions && (
                            <span className="fc-custom-badge" title="Custom permissions configured for this member">
                              Custom
                            </span>
                          )}
                          {member.permissions && member.permissions.length > 0 ? (
                            member.permissions.slice(0, 3).map((p) => (
                              <span key={p.key || p.id} className="fc-dept-tag">
                                {p.label}
                              </span>
                            ))
                          ) : (
                            <span className="fc-dept-tag">General</span>
                          )}
                          {member.permissions && member.permissions.length > 3 && (
                            <span className="fc-dept-tag" style={{ opacity: 0.7 }} title={member.permissions.map((p) => p.label).join(', ')}>
                              +{member.permissions.length - 3} more
                            </span>
                          )}
                          <span style={{ fontSize: '0.68rem', color: 'var(--fc-brand)', marginLeft: '4px', fontWeight: 600 }}>
                            {expandedMemberId === member.id ? '▲ Hide' : '▼ View'}
                          </span>
                        </div>
                      </td>

                      {/* ACTIONS */}
                      <td style={{ textAlign: 'right', paddingRight: '24px' }}>
                        <div className="fc-actions-group">
                          <button
                            className="fc-action-btn"
                            onClick={() => handleStartEdit(member)}
                          >
                            Edit
                          </button>
                          {isCurrentUser ? (
                            <button
                              className="fc-action-btn"
                              disabled
                              title="You cannot remove yourself from the festival team"
                              style={{ opacity: 0.45, cursor: 'not-allowed' }}
                            >
                              Delete
                            </button>
                          ) : (
                            <button
                              className="fc-action-btn fc-action-delete"
                              onClick={() => handleDelete(member.id, member.name)}
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* Inline Expanded Permissions Row (Screenshot 2 Style) */}
                    {expandedMemberId === member.id && (
                      <tr className="fc-member-expanded-row">
                        <td colSpan={4} style={{ padding: '16px 20px', background: 'var(--fc-surface-card)', borderBottom: '2px solid var(--fc-border)' }}>
                          <div style={{ marginBottom: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--fc-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                              Effective Permissions for {member.name} ({member.permissions?.length || 0} granted)
                            </span>
                            <button
                              type="button"
                              className="fc-btn-perm-tool"
                              onClick={() => setExpandedMemberId(null)}
                            >
                              Close Preview ✕
                            </button>
                          </div>
                          <PermissionsByModuleSection
                            catalog={catalog}
                            permissions={new Set((member.permissions || []).map((p) => p.key))}
                            readOnly={true}
                            selectedGroupsSummary={{
                              icon: (member.groups?.[0]?.key === 'judge' || member.roleKey === 'judge') ? '⚖️' : (member.groups?.[0]?.key === 'admin' || member.roleKey === 'admin') ? '🛡️' : '👥',
                              title: member.groups?.map((g) => g.label).join(', ') || member.role || 'Volunteer',
                              subtitle: `${member.name} (${member.email}) · ${member.permissions?.length || 0} granted permissions`
                            }}
                          />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Add User Modal */}
      {showAddModal && (
        <div className="fc-modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="fc-modal-card fc-modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="fc-modal-header">
              <div>
                <h2>Add Team Member</h2>
                <div style={{ fontSize: '0.75rem', color: 'var(--fc-text-muted)', marginTop: '2px' }}>
                  Select from registered users of next.autovertest.com/signin
                </div>
              </div>
              <button className="fc-modal-close" onClick={() => setShowAddModal(false)}>✕</button>
            </div>
            <form onSubmit={handleAddSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
              <div className="fc-modal-body">
                {/* User Search & Selection */}
                <div className="fc-form-group" ref={dropdownRef}>
                  <label>Search Registered Individual User</label>
                  {!selectedUser ? (
                    <div className="fc-search-user-wrapper">
                      <div className="fc-search-input-box">
                        <span className="fc-search-input-icon">🔍</span>
                        <input
                          type="text"
                          autoFocus
                          placeholder="Type name or email to search database..."
                          value={userQuery}
                          onChange={(e) => setUserQuery(e.target.value)}
                          onFocus={() => {
                            if (searchResults.length > 0 || userQuery.trim().length >= 2) {
                              setIsDropdownOpen(true);
                            }
                          }}
                        />
                        {isSearching && <div className="fc-search-input-spinner"></div>}
                      </div>

                      {isDropdownOpen && userQuery.trim().length >= 2 && (
                        <div className="fc-user-search-dropdown">
                          {isSearching ? (
                            <div className="fc-user-search-empty">
                              <div className="fc-spinner" style={{ width: '16px', height: '16px', margin: '0 auto 6px' }}></div>
                              Searching individuals directory...
                            </div>
                          ) : searchResults.length > 0 ? (
                            searchResults.map((u) => (
                              <div
                                key={u.userId}
                                className={`fc-user-search-item ${u.isAlreadyMember ? 'disabled' : ''}`}
                                onClick={() => handleSelectUser(u)}
                                title={u.isAlreadyMember ? 'This user is already a team member' : 'Click to select user'}
                              >
                                <div className="fc-user-search-avatar">
                                  {getInitials(u.name)}
                                </div>
                                <div className="fc-user-search-info">
                                  <div className="fc-user-search-name-row">
                                    <span className="fc-user-search-name">{u.name}</span>
                                    {u.username && (
                                      <span className="fc-user-search-handle">@{u.username}</span>
                                    )}
                                  </div>
                                  <span className="fc-user-search-email">{u.email}</span>
                                </div>
                                {u.isAlreadyMember ? (
                                  <span className="fc-user-search-badge in-team">Already in Team</span>
                                ) : (
                                  <span className="fc-dept-tag" style={{ background: 'var(--fc-brand-active-bg)', color: 'var(--fc-brand)', cursor: 'pointer' }}>
                                    Select
                                  </span>
                                )}
                              </div>
                            ))
                          ) : (
                            <div className="fc-user-search-empty">
                              No registered individual found matching &ldquo;{userQuery}&rdquo;.
                              <div style={{ marginTop: '5px', fontSize: '0.72rem', color: '#b91c1c' }}>
                                Team members must be registered users from next.autovertest.com/signin.
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="fc-selected-user-card">
                      <div className="fc-selected-user-left">
                        <div className="fc-user-search-avatar" style={{ width: '38px', height: '38px', fontSize: '0.85rem' }}>
                          {getInitials(selectedUser.name)}
                        </div>
                        <div className="fc-selected-user-meta">
                          <div className="fc-selected-user-name">
                            {selectedUser.name}
                            <span className="fc-selected-verified-tag">✓ Freecomers User</span>
                          </div>
                          <span className="fc-selected-user-email">{selectedUser.email}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="fc-btn-change-user"
                        onClick={handleClearSelectedUser}
                      >
                        Change
                      </button>
                    </div>
                  )}
                  {searchFeedback && (
                    <span style={{ fontSize: '0.75rem', color: '#b91c1c', marginTop: '4px' }}>
                      {searchFeedback}
                    </span>
                  )}
                </div>

                {/* Multi-Group Picker for Add Member */}
                <div className="fc-form-group">
                  <MultiGroupPicker
                    selectedGroupKeys={addSelectedGroups}
                    onChange={setAddSelectedGroups}
                    customGroups={customGroups}
                    groupDefaults={groupDefaults}
                    catalog={catalog}
                  />
                </div>

                {/* Permissions Grouped by Module for Add User (Immutable & Read-Only) */}
                <PermissionsByModuleSection
                  catalog={catalog}
                  permissions={addEffectivePermissions}
                  expandedModules={addExpandedModules}
                  onToggleExpandModule={toggleAddExpandModule}
                  onExpandAll={handleAddExpandAll}
                  onCollapseAll={handleAddCollapseAll}
                  searchQuery={addPermSearch}
                  onSearchChange={setAddPermSearch}
                  readOnly={true}
                  permissionSourceMap={addSourceMap}
                  selectedGroupsSummary={addGroupSummary}
                />

                <div className="fc-quota-notice">
                  <span className="fc-quota-notice-icon">👥</span>
                  <span>Current Allocation: <strong>{users.length} / 25</strong> available seats.</span>
                </div>
              </div>
              <div className="fc-modal-footer">
                <button type="button" className="fc-btn-secondary" onClick={() => setShowAddModal(false)}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="fc-btn-primary"
                  disabled={actionLoading || !selectedUser}
                  style={!selectedUser ? { opacity: 0.6, cursor: 'not-allowed' } : {}}
                  title={!selectedUser ? 'Please search and select a user first' : ''}
                >
                  {actionLoading ? 'Saving...' : 'Add Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {editingUser && (
        <div className="fc-modal-overlay" onClick={() => setEditingUser(null)}>
          <div className="fc-modal-card fc-modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="fc-modal-header">
              <div>
                <h2>Edit Member: {editingUser.name}</h2>
                <div style={{ fontSize: '0.75rem', color: 'var(--fc-text-muted)', marginTop: '2px' }}>
                  Manage group assignment and granular festival permissions
                </div>
              </div>
              <button className="fc-modal-close" onClick={() => setEditingUser(null)}>✕</button>
            </div>
            <form onSubmit={handleEditSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
              <div className="fc-modal-body">
                <div className="fc-form-group">
                  <label>User Profile</label>
                  <div className="fc-selected-user-card" style={{ borderColor: 'var(--fc-border)', backgroundColor: 'var(--fc-surface-subtle)' }}>
                    <div className="fc-selected-user-left">
                      <div className="fc-user-search-avatar" style={{ width: '38px', height: '38px', fontSize: '0.85rem' }}>
                        {getInitials(editingUser.name)}
                      </div>
                      <div className="fc-selected-user-meta">
                        <span className="fc-selected-user-name" style={{ color: 'var(--fc-text-main)' }}>
                          {editingUser.name}
                        </span>
                        <span className="fc-selected-user-email" style={{ color: 'var(--fc-text-muted)' }}>
                          {editingUser.email}
                        </span>
                      </div>
                    </div>
                    <span className="fc-selected-verified-tag">✓ Individual Account</span>
                  </div>
                </div>

                {/* Multi-Group Picker for Edit Member */}
                <div className="fc-form-group">
                  <MultiGroupPicker
                    selectedGroupKeys={editSelectedGroups}
                    onChange={setEditSelectedGroups}
                    customGroups={customGroups}
                    groupDefaults={groupDefaults}
                    catalog={catalog}
                  />
                </div>

                {/* Permissions Grouped by Module for Edit User (Immutable & Read-Only) */}
                <PermissionsByModuleSection
                  catalog={catalog}
                  permissions={editEffectivePermissions}
                  expandedModules={editExpandedModules}
                  onToggleExpandModule={toggleEditExpandModule}
                  onExpandAll={handleEditExpandAll}
                  onCollapseAll={handleEditCollapseAll}
                  searchQuery={editPermSearch}
                  onSearchChange={setEditPermSearch}
                  readOnly={true}
                  permissionSourceMap={editSourceMap}
                  selectedGroupsSummary={editGroupSummary}
                />
              </div>
              <div className="fc-modal-footer">
                <button type="button" className="fc-btn-secondary" onClick={() => setEditingUser(null)}>
                  Cancel
                </button>
                <button type="submit" className="fc-btn-primary" disabled={actionLoading}>
                  {actionLoading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Custom Group Modal (Festival Admin Only) */}
      {showCustomGroupModal && (
        <div className="fc-modal-overlay" onClick={() => setShowCustomGroupModal(false)}>
          <div className="fc-modal-card fc-modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="fc-modal-header">
              <div>
                <h2>Add Custom Group</h2>
                <div style={{ fontSize: '0.75rem', color: 'var(--fc-text-muted)', marginTop: '2px' }}>
                  Define a reusable festival group with modular permissions (Festival Admin only)
                </div>
              </div>
              <button className="fc-modal-close" onClick={() => setShowCustomGroupModal(false)}>✕</button>
            </div>
            <form onSubmit={handleCreateCustomGroupSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
              <div className="fc-modal-body">
                <div className="fc-form-group">
                  <label>Group Name <span style={{ color: '#b91c1c' }}>*</span></label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Hospitality Lead, Programmer, Operations Lead"
                    value={cgName}
                    onChange={(e) => setCgName(e.target.value)}
                    autoFocus
                  />
                </div>

                <div className="fc-form-group">
                  <label>Description (Optional)</label>
                  <input
                    type="text"
                    placeholder="Brief summary of duties and festival access level..."
                    value={cgDescription}
                    onChange={(e) => setCgDescription(e.target.value)}
                  />
                </div>

                {/* Permissions Grouped by Module for Custom Group */}
                <PermissionsByModuleSection
                  catalog={catalog}
                  permissions={cgPermissions}
                  onTogglePermission={toggleCgPermission}
                  onToggleModule={toggleCgModule}
                  onSelectAll={handleCgSelectAll}
                  onDeselectAll={handleCgDeselectAll}
                  onResetDefaults={handleCgDeselectAll}
                  groupKey="custom"
                  groupDefaults={{ custom: [] }}
                  expandedModules={cgExpandedModules}
                  onToggleExpandModule={toggleCgExpandModule}
                  onExpandAll={handleCgExpandAll}
                  onCollapseAll={handleCgCollapseAll}
                  searchQuery={cgPermSearch}
                  onSearchChange={setCgPermSearch}
                  isCustomGroupCreation={true}
                />
              </div>
              <div className="fc-modal-footer">
                <button
                  type="button"
                  className="fc-btn-secondary"
                  onClick={() => setShowCustomGroupModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="fc-btn-primary"
                  disabled={cgLoading || !cgName.trim()}
                >
                  {cgLoading ? 'Saving...' : 'Save Custom Group'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

