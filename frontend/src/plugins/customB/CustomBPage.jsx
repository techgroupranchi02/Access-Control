/**
 * CustomB Plugin Page
 * Self-contained plugin page — demonstrates the plugin architecture for Custom B.
 * 
 * This file lives in src/plugins/customB/ — completely separate from core.
 * It uses PermissionGate for granular access:
 *   customB:read   → Access the whole page & data table
 *   customB:update → Access editable section
 *   customB:delete → Access delete button & danger zone
 */

import { useState, useEffect } from 'react';
import api from '../../core/services/api';
import PermissionGate from '../../core/components/PermissionGate';
import { usePermissions } from '../../core/hooks/usePermissions';

export default function CustomBPage() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const { can } = usePermissions();

  const loadData = async () => {
    try {
      const res = await api.get('/plugins/customB');
      setData(res.data);
    } catch {
      console.error('Failed to load CustomB data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleEdit = (item) => {
    setEditingId(item.id);
    setEditForm({
      title: item.title,
      topic: item.topic,
      instructor: item.instructor,
      capacity: item.capacity,
      status: item.status,
    });
  };

  const handleSave = async (id) => {
    try {
      await api.put(`/plugins/customB/${id}`, editForm);
      setEditingId(null);
      loadData();
    } catch {
      console.error('Failed to update Custom B');
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/plugins/customB/${id}`);
      loadData();
    } catch {
      console.error('Failed to delete Custom B');
    }
  };

  const statusBadge = (s) => {
    const map = { 'Active': 'badge-success', 'Upcoming': 'badge-info', 'Draft': 'badge-warning', 'Archived': 'badge-muted' };
    return map[s] || 'badge-muted';
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h2 className="page-title">📚 Custom B — Workshop Sessions</h2>
        <p className="page-description">
          This is a <strong>dynamically registered plugin page (Custom B)</strong> — running completely outside core business logic.
          It was discovered and mounted automatically via the plugin registry and database configuration.
        </p>
      </div>

      {/* Plugin Architecture Info */}
      <div className="alert alert-info" style={{ marginBottom: 'var(--space-lg)' }}>
        🔌 <strong>Plugin Architecture:</strong> Loaded from <code>plugins/customB/</code> —
        zero core code changes required. Permission group: <strong>CustomGroupY</strong>.
        <br />
        🔑 Permissions:&nbsp;
        <span className={`badge ${can('customB:read') ? 'badge-success' : 'badge-danger'}`} style={{ marginRight: 4 }}>customB:read</span>
        <span className={`badge ${can('customB:update') ? 'badge-success' : 'badge-danger'}`} style={{ marginRight: 4 }}>customB:update</span>
        <span className={`badge ${can('customB:delete') ? 'badge-success' : 'badge-danger'}`}>customB:delete</span>
      </div>

      {/* Level 1: customB:read — Data Table */}
      <div className="card">
        <div className="card-header">
          <div>
            <h3 className="card-title">Workshop Sessions</h3>
            <p className="card-subtitle">
              <span className="permission-section-badge">Requires: customB:read</span>
            </p>
          </div>
        </div>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: '48px' }}></div>)}
          </div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Session Title</th>
                  <th>Topic</th>
                  <th>Instructor</th>
                  <th>Capacity</th>
                  <th>Date</th>
                  <th>Status</th>
                  <PermissionGate permission="customB:update">
                    <th>Actions</th>
                  </PermissionGate>
                </tr>
              </thead>
              <tbody>
                {data.map(item => (
                  <tr key={item.id}>
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{item.title}</td>
                    <td>{item.topic}</td>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        🎓 {item.instructor}
                      </span>
                    </td>
                    <td><span className="badge badge-info">{item.capacity} seats</span></td>
                    <td>{item.scheduleDate}</td>
                    <td><span className={`badge ${statusBadge(item.status)}`}>{item.status}</span></td>
                    <PermissionGate permission="customB:update">
                      <td>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button className="btn btn-secondary btn-sm" onClick={() => handleEdit(item)}>✏️ Edit</button>
                          <PermissionGate permission="customB:delete">
                            <button className="btn btn-danger btn-sm" onClick={() => handleDelete(item.id)}>🗑️ Delete</button>
                          </PermissionGate>
                        </div>
                      </td>
                    </PermissionGate>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Level 2: customB:update — Edit Section */}
      <PermissionGate permission="customB:update">
        <div className="permission-section">
          <h3 className="permission-section-title">
            ✏️ Edit Workshop Session
            <span className="permission-section-badge">Requires: customB:update</span>
          </h3>
          {editingId ? (
            <div style={{ display: 'flex', gap: 'var(--space-md)', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: '200px' }}>
                <label className="form-label">Session Title</label>
                <input
                  className="form-input"
                  value={editForm.title || ''}
                  onChange={e => setEditForm({ ...editForm, title: e.target.value })}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: '180px' }}>
                <label className="form-label">Topic</label>
                <input
                  className="form-input"
                  value={editForm.topic || ''}
                  onChange={e => setEditForm({ ...editForm, topic: e.target.value })}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: '150px' }}>
                <label className="form-label">Instructor</label>
                <input
                  className="form-input"
                  value={editForm.instructor || ''}
                  onChange={e => setEditForm({ ...editForm, instructor: e.target.value })}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0, width: '100px' }}>
                <label className="form-label">Capacity</label>
                <input
                  type="number"
                  className="form-input"
                  value={editForm.capacity || ''}
                  onChange={e => setEditForm({ ...editForm, capacity: parseInt(e.target.value, 10) || 0 })}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0, width: '130px' }}>
                <label className="form-label">Status</label>
                <select
                  className="form-input"
                  value={editForm.status || ''}
                  onChange={e => setEditForm({ ...editForm, status: e.target.value })}
                >
                  <option value="Active">Active</option>
                  <option value="Upcoming">Upcoming</option>
                  <option value="Draft">Draft</option>
                  <option value="Archived">Archived</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-success btn-sm" onClick={() => handleSave(editingId)}>💾 Save</button>
                <button className="btn btn-secondary btn-sm" onClick={() => setEditingId(null)}>Cancel</button>
              </div>
            </div>
          ) : (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              Click "Edit" on a session to modify details in this section.
            </p>
          )}

          {/* Level 3: customB:delete — Danger Zone */}
          <PermissionGate permission="customB:delete">
            <div style={{
              marginTop: 'var(--space-lg)',
              padding: 'var(--space-md)',
              background: 'rgba(239, 68, 68, 0.05)',
              border: '1px solid rgba(239, 68, 68, 0.15)',
              borderRadius: 'var(--radius-md)',
            }}>
              <h4 style={{ fontSize: '0.875rem', color: 'var(--color-danger)' }}>
                🗑️ Danger Zone
                <span className="permission-section-badge" style={{ marginLeft: 8, background: 'rgba(239,68,68,0.15)', color: 'var(--color-danger)' }}>
                  Requires: customB:delete
                </span>
              </h4>
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                Delete actions for Custom B sessions. Only visible to roles with <code>customB:delete</code> permission.
              </p>
            </div>
          </PermissionGate>
        </div>
      </PermissionGate>
    </div>
  );
}
