/**
 * CustomA Plugin Page
 * Self-contained plugin page — demonstrates the plugin architecture.
 * 
 * This file lives in src/plugins/customA/ — completely separate from core.
 * It uses PermissionGate for granular access:
 *   customA:read   → Access the whole page
 *   customA:update → Access editable section
 *   customA:delete → Access delete button
 */

import { useState, useEffect } from 'react';
import api from '../../core/services/api';
import PermissionGate from '../../core/components/PermissionGate';
import { usePermissions } from '../../core/hooks/usePermissions';

export default function CustomAPage() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const { can } = usePermissions();

  const loadData = async () => {
    try {
      const res = await api.get('/plugins/customA');
      setData(res.data);
    } catch {
      console.error('Failed to load CustomA data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleEdit = (item) => {
    setEditingId(item.id);
    setEditForm({ title: item.title, description: item.description, priority: item.priority, status: item.status });
  };

  const handleSave = async (id) => {
    try {
      await api.put(`/plugins/customA/${id}`, editForm);
      setEditingId(null);
      loadData();
    } catch {
      console.error('Failed to update');
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/plugins/customA/${id}`);
      loadData();
    } catch {
      console.error('Failed to delete');
    }
  };

  const priorityBadge = (p) => {
    const map = { 'High': 'badge-danger', 'Medium': 'badge-warning', 'Low': 'badge-info' };
    return map[p] || 'badge-muted';
  };

  const statusBadge = (s) => {
    const map = { 'Active': 'badge-success', 'Draft': 'badge-warning', 'Archived': 'badge-muted' };
    return map[s] || 'badge-muted';
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h2 className="page-title">🧩 Custom A</h2>
        <p className="page-description">
          This is a <strong>plugin page</strong> — it exists entirely outside core business logic.
          It was discovered and registered automatically via config.
        </p>
      </div>

      {/* Plugin Architecture Info */}
      <div className="alert alert-info" style={{ marginBottom: 'var(--space-lg)' }}>
        🔌 <strong>Plugin Architecture:</strong> This page was loaded from <code>plugins/customA/</code> —
        no core business logic references it directly. Permission group: <strong>CustomGroupX</strong>.
        <br />
        🔑&nbsp;
        <span className={`badge ${can('customA:read') ? 'badge-success' : 'badge-danger'}`} style={{ marginRight: 4 }}>customA:read</span>
        <span className={`badge ${can('customA:update') ? 'badge-success' : 'badge-danger'}`} style={{ marginRight: 4 }}>customA:update</span>
        <span className={`badge ${can('customA:delete') ? 'badge-success' : 'badge-danger'}`}>customA:delete</span>
      </div>

      {/* Level 1: customA:read — Data Table */}
      <div className="card">
        <div className="card-header">
          <div>
            <h3 className="card-title">Custom Data</h3>
            <p className="card-subtitle">
              <span className="permission-section-badge">Requires: customA:read</span>
            </p>
          </div>
        </div>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: '48px' }}></div>)}
          </div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Description</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Created</th>
                  <PermissionGate permission="customA:update">
                    <th>Actions</th>
                  </PermissionGate>
                </tr>
              </thead>
              <tbody>
                {data.map(item => (
                  <tr key={item.id}>
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{item.title}</td>
                    <td style={{ maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.description}
                    </td>
                    <td><span className={`badge ${priorityBadge(item.priority)}`}>{item.priority}</span></td>
                    <td><span className={`badge ${statusBadge(item.status)}`}>{item.status}</span></td>
                    <td>{item.createdAt}</td>
                    <PermissionGate permission="customA:update">
                      <td>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button className="btn btn-secondary btn-sm" onClick={() => handleEdit(item)}>✏️ Edit</button>
                          <PermissionGate permission="customA:delete">
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

      {/* Level 2: customA:update — Edit Section */}
      <PermissionGate permission="customA:update">
        <div className="permission-section">
          <h3 className="permission-section-title">
            ✏️ Edit Custom Item
            <span className="permission-section-badge">Requires: customA:update</span>
          </h3>
          {editingId ? (
            <div style={{ display: 'flex', gap: 'var(--space-md)', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: '200px' }}>
                <label className="form-label">Title</label>
                <input className="form-input" value={editForm.title || ''} onChange={e => setEditForm({...editForm, title: e.target.value})} />
              </div>
              <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: '120px' }}>
                <label className="form-label">Priority</label>
                <select className="form-input" value={editForm.priority || ''} onChange={e => setEditForm({...editForm, priority: e.target.value})}>
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: '120px' }}>
                <label className="form-label">Status</label>
                <select className="form-input" value={editForm.status || ''} onChange={e => setEditForm({...editForm, status: e.target.value})}>
                  <option value="Active">Active</option>
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
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Click "Edit" on an item to edit it here.</p>
          )}

          {/* Level 3: customA:delete — Danger Zone */}
          <PermissionGate permission="customA:delete">
            <div style={{
              marginTop: 'var(--space-lg)', padding: 'var(--space-md)',
              background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.15)',
              borderRadius: 'var(--radius-md)',
            }}>
              <h4 style={{ fontSize: '0.875rem', color: 'var(--color-danger)' }}>
                🗑️ Danger Zone <span className="permission-section-badge" style={{ marginLeft: 8, background: 'rgba(239,68,68,0.15)', color: 'var(--color-danger)' }}>Requires: customA:delete</span>
              </h4>
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                Delete actions for Custom A items. Only visible with <code>customA:delete</code> permission.
              </p>
            </div>
          </PermissionGate>
        </div>
      </PermissionGate>
    </div>
  );
}
