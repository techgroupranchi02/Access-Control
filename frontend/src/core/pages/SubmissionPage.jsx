/**
 * Submission Page — Core Page with Granular Permission Control
 * 
 * Demonstrates nested PermissionGate usage:
 *   submission:read   → See the page (data table)
 *   submission:update → See the "Edit" section
 *   submission:delete → See the "Delete" button
 */

import { useState, useEffect } from 'react';
import api from '../services/api';
import PermissionGate from '../components/PermissionGate';
import { usePermissions } from '../hooks/usePermissions';

export default function SubmissionPage() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const { can } = usePermissions();

  const canView = can('submission.view') || can('submission:read');
  const canEdit = can('submission.edit') || can('submission:update');
  const canDelete = can('submission.delete') || can('submission:delete');

  const [activeScope, setActiveScope] = useState('all');

  const loadData = async () => {
    try {
      const res = await api.get('/submissions');
      const items = Array.isArray(res.data) ? res.data : (res.data.data || []);
      setData(items);
      if (res.data.activeScope) {
        setActiveScope(res.data.activeScope);
      }
    } catch {
      console.error('Failed to load submissions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleEdit = (item) => {
    setEditingId(item.id);
    setEditForm({ title: item.title, category: item.category, status: item.status });
  };

  const handleSave = async (id) => {
    try {
      await api.put(`/submissions/${id}`, editForm);
      setEditingId(null);
      loadData();
    } catch {
      console.error('Failed to update');
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/submissions/${id}`);
      loadData();
    } catch {
      console.error('Failed to delete');
    }
  };

  const statusBadge = (status) => {
    const map = {
      'Accepted': 'badge-success',
      'Rejected': 'badge-danger',
      'Under Review': 'badge-warning',
      'Pending': 'badge-info',
    };
    return map[status] || 'badge-muted';
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h2 className="page-title">📄 Submissions Intake</h2>
        <p className="page-description">
          Manage festival edition submissions with declarative scopes and permissions.
        </p>
      </div>

      {/* Permission Info Banner */}
      <div className="alert alert-info" style={{ marginBottom: 'var(--space-lg)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          🔑 <strong>Permissions Active:</strong>&nbsp;
          <span className={`badge ${canView ? 'badge-success' : 'badge-danger'}`} style={{ marginRight: 4 }}>submission.view</span>
          <span className={`badge ${canEdit ? 'badge-success' : 'badge-danger'}`} style={{ marginRight: 4 }}>submission.edit</span>
          <span className={`badge ${canDelete ? 'badge-success' : 'badge-danger'}`}>submission.delete</span>
        </div>
        <div>
          🛡️ <strong>Active Scope:</strong>&nbsp;
          <span className="badge badge-info" style={{ textTransform: 'uppercase' }}>
            {activeScope === 'assigned' ? 'Assigned Scope (Assigned Reviewer Only)' : activeScope === 'jury_panel' ? 'Jury Panel Scope (Panel Categories)' : 'All Submissions (Unrestricted / Wildcard)'}
          </span>
        </div>
      </div>

      {/* Level 1: submission:read — Data Table */}
      <div className="card">
        <div className="card-header">
          <div>
            <h3 className="card-title">Submission List</h3>
            <p className="card-subtitle">
              <span className="permission-section-badge">Requires: submission:read</span>
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
                  <th>Category</th>
                  <th>Submitted By</th>
                  <th>Date</th>
                  <th>Status</th>
                  {/* Level 2: submission:update — Show actions column */}
                  <PermissionGate permission="submission:update">
                    <th>Actions</th>
                  </PermissionGate>
                </tr>
              </thead>
              <tbody>
                {data.map(item => (
                  <tr key={item.id}>
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{item.title}</td>
                    <td>{item.category}</td>
                    <td>{item.submittedBy}</td>
                    <td>{item.submittedAt}</td>
                    <td><span className={`badge ${statusBadge(item.status)}`}>{item.status}</span></td>
                    {/* Level 2: submission:update — Edit button */}
                    <PermissionGate permission="submission:update">
                      <td>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button className="btn btn-secondary btn-sm" onClick={() => handleEdit(item)}>
                            ✏️ Edit
                          </button>
                          {/* Level 3: submission:delete — Delete button */}
                          <PermissionGate permission="submission:delete">
                            <button className="btn btn-danger btn-sm" onClick={() => handleDelete(item.id)}>
                              🗑️ Delete
                            </button>
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

      {/* Level 2: submission:update — Edit Section */}
      <PermissionGate permission="submission:update">
        <div className="permission-section">
          <h3 className="permission-section-title">
            ✏️ Edit Submission
            <span className="permission-section-badge">Requires: submission:update</span>
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: 'var(--space-md)' }}>
            This section is only visible to users with <code>submission:update</code> permission.
          </p>

          {editingId ? (
            <div style={{ display: 'flex', gap: 'var(--space-md)', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: '200px' }}>
                <label className="form-label">Title</label>
                <input
                  className="form-input"
                  value={editForm.title || ''}
                  onChange={e => setEditForm({...editForm, title: e.target.value})}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: '150px' }}>
                <label className="form-label">Status</label>
                <select
                  className="form-input"
                  value={editForm.status || ''}
                  onChange={e => setEditForm({...editForm, status: e.target.value})}
                >
                  <option value="Pending">Pending</option>
                  <option value="Under Review">Under Review</option>
                  <option value="Accepted">Accepted</option>
                  <option value="Rejected">Rejected</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-success btn-sm" onClick={() => handleSave(editingId)}>💾 Save</button>
                <button className="btn btn-secondary btn-sm" onClick={() => setEditingId(null)}>Cancel</button>
              </div>
            </div>
          ) : (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              Click "Edit" on a submission to edit it here.
            </p>
          )}

          {/* Level 3: submission:delete — Delete zone within edit section */}
          <PermissionGate permission="submission:delete">
            <div style={{
              marginTop: 'var(--space-lg)',
              padding: 'var(--space-md)',
              background: 'rgba(239, 68, 68, 0.05)',
              border: '1px solid rgba(239, 68, 68, 0.15)',
              borderRadius: 'var(--radius-md)',
            }}>
              <h4 style={{ fontSize: '0.875rem', color: 'var(--color-danger)', marginBottom: 'var(--space-xs)' }}>
                🗑️ Danger Zone
                <span className="permission-section-badge" style={{ marginLeft: 8, background: 'rgba(239, 68, 68, 0.15)', color: 'var(--color-danger)' }}>
                  Requires: submission:delete
                </span>
              </h4>
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                This delete zone is only visible to users with <code>submission:delete</code> permission.
              </p>
            </div>
          </PermissionGate>
        </div>
      </PermissionGate>
    </div>
  );
}
