/**
 * Jury Page — Feature-Toggled Core Page with Granular Permissions
 * 
 * This page is only accessible when the 'jury' feature is enabled for the festival.
 * Uses the same PermissionGate pattern as Submission:
 *   jury:read   → See the page
 *   jury:update → See edit section
 *   jury:delete → See delete button
 */

import { useState, useEffect } from 'react';
import api from '../services/api';
import PermissionGate from '../components/PermissionGate';
import { usePermissions } from '../hooks/usePermissions';

export default function JuryPage() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const { can } = usePermissions();

  const loadData = async () => {
    try {
      const res = await api.get('/jury');
      setData(res.data);
    } catch {
      console.error('Failed to load jury');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleEdit = (item) => {
    setEditingId(item.id);
    setEditForm({ name: item.name, expertise: item.expertise, status: item.status });
  };

  const handleSave = async (id) => {
    try {
      await api.put(`/jury/${id}`, editForm);
      setEditingId(null);
      loadData();
    } catch {
      console.error('Failed to update');
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/jury/${id}`);
      loadData();
    } catch {
      console.error('Failed to delete');
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h2 className="page-title">🏆 Jury Panel</h2>
        <p className="page-description">
          Manage jury members. This page is feature-toggled (only visible when jury is enabled for the festival)
          and has granular permission control.
        </p>
      </div>

      <div className="alert alert-info" style={{ marginBottom: 'var(--space-lg)' }}>
        🔑 <strong>Feature-Toggled + Granular:</strong>&nbsp;
        <span className="badge badge-success" style={{ marginRight: 4 }}>Feature: jury ✓</span>
        <span className={`badge ${can('jury:read') ? 'badge-success' : 'badge-danger'}`} style={{ marginRight: 4 }}>read</span>
        <span className={`badge ${can('jury:update') ? 'badge-success' : 'badge-danger'}`} style={{ marginRight: 4 }}>update</span>
        <span className={`badge ${can('jury:delete') ? 'badge-success' : 'badge-danger'}`}>delete</span>
      </div>

      {/* Data Table */}
      <div className="card">
        <div className="card-header">
          <div>
            <h3 className="card-title">Jury Members</h3>
            <p className="card-subtitle">
              <span className="permission-section-badge">Requires: jury:read</span>
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
                  <th>Name</th>
                  <th>Expertise</th>
                  <th>Category</th>
                  <th>Rating</th>
                  <th>Status</th>
                  <PermissionGate permission="jury:update">
                    <th>Actions</th>
                  </PermissionGate>
                </tr>
              </thead>
              <tbody>
                {data.map(item => (
                  <tr key={item.id}>
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{item.name}</td>
                    <td>{item.expertise}</td>
                    <td>{item.assignedCategory}</td>
                    <td>
                      <span style={{ color: 'var(--color-warning)' }}>{'⭐'.repeat(Math.round(item.rating))}</span>
                      <span style={{ marginLeft: 4, fontSize: '0.8rem', color: 'var(--text-muted)' }}>{item.rating}</span>
                    </td>
                    <td>
                      <span className={`badge ${item.status === 'Active' ? 'badge-success' : 'badge-muted'}`}>
                        {item.status}
                      </span>
                    </td>
                    <PermissionGate permission="jury:update">
                      <td>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button className="btn btn-secondary btn-sm" onClick={() => handleEdit(item)}>✏️ Edit</button>
                          <PermissionGate permission="jury:delete">
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

      {/* Edit Section */}
      <PermissionGate permission="jury:update">
        <div className="permission-section">
          <h3 className="permission-section-title">
            ✏️ Jury Member Editor
            <span className="permission-section-badge">Requires: jury:update</span>
          </h3>
          {editingId ? (
            <div style={{ display: 'flex', gap: 'var(--space-md)', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: '200px' }}>
                <label className="form-label">Name</label>
                <input className="form-input" value={editForm.name || ''} onChange={e => setEditForm({...editForm, name: e.target.value})} />
              </div>
              <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: '150px' }}>
                <label className="form-label">Status</label>
                <select className="form-input" value={editForm.status || ''} onChange={e => setEditForm({...editForm, status: e.target.value})}>
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-success btn-sm" onClick={() => handleSave(editingId)}>💾 Save</button>
                <button className="btn btn-secondary btn-sm" onClick={() => setEditingId(null)}>Cancel</button>
              </div>
            </div>
          ) : (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Click "Edit" on a jury member to edit here.</p>
          )}

          <PermissionGate permission="jury:delete">
            <div style={{
              marginTop: 'var(--space-lg)', padding: 'var(--space-md)',
              background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.15)',
              borderRadius: 'var(--radius-md)',
            }}>
              <h4 style={{ fontSize: '0.875rem', color: 'var(--color-danger)' }}>
                🗑️ Danger Zone <span className="permission-section-badge" style={{ marginLeft: 8, background: 'rgba(239,68,68,0.15)', color: 'var(--color-danger)' }}>Requires: jury:delete</span>
              </h4>
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>Jury delete actions are only visible with <code>jury:delete</code> permission.</p>
            </div>
          </PermissionGate>
        </div>
      </PermissionGate>
    </div>
  );
}
