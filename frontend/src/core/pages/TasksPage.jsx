/**
 * Departmental Tasks Page
 * Addon Module: tasks
 * Permissions:
 * - task.view
 * - task.create
 * - task.assign
 * - task.update_status
 * - task.delete
 * Scopes:
 * - department (resource.department_id in user.department_ids)
 */

import { useState, useEffect } from 'react';
import api from '../services/api';
import PermissionGate from '../components/PermissionGate';
import { usePermissions } from '../hooks/usePermissions';

export default function TasksPage() {
  const [tasks, setTasks] = useState([]);
  const [scope, setScope] = useState('all');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [newTask, setNewTask] = useState({ title: '', department: 'Programming', assignee: '' });
  const [statusMsg, setStatusMsg] = useState('');
  const { can } = usePermissions();

  const loadTasks = async () => {
    try {
      const res = await api.get('/tasks');
      setTasks(res.data.data || res.data || []);
      setScope(res.data.scope || 'all');
    } catch {
      console.error('Failed to load tasks');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await api.post('/tasks', newTask);
      setStatusMsg(`Task "${newTask.title}" assigned successfully.`);
      setShowModal(false);
      setNewTask({ title: '', department: 'Programming', assignee: '' });
      loadTasks();
    } catch {
      alert('Failed to create task.');
    }
  };

  const handleStatusChange = async (taskId, newStatus) => {
    try {
      await api.put(`/tasks/${taskId}/status`, { status: newStatus });
      setStatusMsg(`Task status updated to ${newStatus}.`);
      loadTasks();
    } catch {
      alert('Failed to update task status.');
    }
  };

  const statusBadge = (st) => {
    const map = {
      'Completed': 'badge-success',
      'In Progress': 'badge-warning',
      'Pending': 'badge-muted',
    };
    return map[st] || 'badge-muted';
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 className="page-title">📋 Departmental Tasks</h2>
          <p className="page-description">
            Coordinate operations across Festival Departments with department-scoped access.
          </p>
        </div>
        <PermissionGate permission="task.create">
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            ➕ Add Task
          </button>
        </PermissionGate>
      </div>

      {statusMsg && (
        <div className="alert alert-success" style={{ marginBottom: 'var(--space-md)' }}>
          {statusMsg}
        </div>
      )}

      {/* Permissions and Scope details */}
      <div className="alert alert-info" style={{ marginBottom: 'var(--space-lg)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <span>🔑 <strong>Task Permissions:</strong></span>
          <span className={`badge ${can('task.view') ? 'badge-success' : 'badge-danger'}`}>task.view</span>
          <span className={`badge ${can('task.create') ? 'badge-success' : 'badge-danger'}`}>task.create</span>
          <span className={`badge ${can('task.update_status') ? 'badge-success' : 'badge-danger'}`}>task.update_status</span>
        </div>
        <div>
          <span>🛡️ <strong>Active Scope:</strong> </span>
          <span className="badge badge-info" style={{ textTransform: 'uppercase' }}>
            All Tasks (Active Scope: All)
          </span>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Operational Task Queue</h3>
          <p className="card-subtitle"><span className="permission-section-badge">Requires: task.view</span></p>
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
                  <th>Task</th>
                  <th>Department</th>
                  <th>Assignee</th>
                  <th>Status</th>
                  <th>Update</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map(t => (
                  <tr key={t.id}>
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{t.title}</td>
                    <td>🏢 {t.department}</td>
                    <td>👤 {t.assignee}</td>
                    <td><span className={`badge ${statusBadge(t.status)}`}>{t.status}</span></td>
                    <td>
                      <PermissionGate permission="task.update_status">
                        <select
                          className="form-input"
                          style={{ padding: '0.25rem 0.5rem', fontSize: '0.8125rem', width: 'auto' }}
                          value={t.status}
                          onChange={e => handleStatusChange(t.id, e.target.value)}
                        >
                          <option value="Pending">Pending</option>
                          <option value="In Progress">In Progress</option>
                          <option value="Completed">Completed</option>
                        </select>
                      </PermissionGate>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="card" style={{ marginTop: 'var(--space-lg)', border: '1px solid var(--color-primary)' }}>
          <div className="card-header">
            <h3 className="card-title">Create Operational Task</h3>
            <p className="card-subtitle"><span className="permission-section-badge">Requires: task.create</span></p>
          </div>
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
            <div className="form-group">
              <label className="form-label">Task Description</label>
              <input
                required
                className="form-input"
                placeholder="e.g. Inspect DCP files for Auditorium 1"
                value={newTask.title}
                onChange={e => setNewTask({ ...newTask, title: e.target.value })}
              />
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-md)', flexWrap: 'wrap' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Department</label>
                <select
                  className="form-input"
                  value={newTask.department}
                  onChange={e => setNewTask({ ...newTask, department: e.target.value })}
                >
                  <option value="Programming">Programming</option>
                  <option value="Hospitality">Hospitality</option>
                  <option value="Marketing">Marketing</option>
                </select>
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Assignee</label>
                <input
                  required
                  className="form-input"
                  placeholder="e.g. Elena Rostova"
                  value={newTask.assignee}
                  onChange={e => setNewTask({ ...newTask, assignee: e.target.value })}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="submit" className="btn btn-success">Assign Task</button>
              <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
