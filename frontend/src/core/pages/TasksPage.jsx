/**
 * TasksPage Component
 * Freecomers 14 Operational Tasks:
 * - Scoped: Admin sees all 14 (3 unassigned), Volunteer sees assigned (2 for Amit Sharma)
 * - Status transitions: 'To Do' -> 'In Progress' -> 'Done'
 * - Filter tabs: All, To Do, In Progress, Done, Unassigned
 * - Add Task Modal
 */

import React, { useState, useEffect } from 'react';
import api from '../services/api';

export default function TasksPage() {
  const [tasks, setTasks] = useState([]);
  const [metrics, setMetrics] = useState({});
  const [scope, setScope] = useState('all');
  const [loading, setLoading] = useState(true);

  // Filters
  const [statusFilter, setStatusFilter] = useState('all');
  const [unassignedOnly, setUnassignedOnly] = useState(false);

  // Add Task Modal
  const [showModal, setShowModal] = useState(false);
  const [newTask, setNewTask] = useState({
    title: '',
    department: 'Registration',
    priority: 'medium',
    due_date: '2026-06-05 12:00:00'
  });
  const [actionLoading, setActionLoading] = useState(false);

  const fetchTasks = async () => {
    try {
      setLoading(true);
      const params = {};
      if (unassignedOnly) params.unassigned = 'true';
      const res = await api.get('/tasks', { params });
      setTasks(res.data.data || []);
      setMetrics(res.data.metrics || {});
      setScope(res.data.scope || 'all');
    } catch (err) {
      console.error('Failed to load tasks:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, [unassignedOnly]);

  const handleStatusUpdate = async (taskId, newStatus) => {
    try {
      await api.put(`/tasks/${taskId}/status`, { status: newStatus });
      setTasks(tasks.map(t => t.id === taskId ? { ...t, status: newStatus } : t));
    } catch (err) {
      alert('Failed to update status.');
    }
  };

  const handleCreateTask = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      await api.post('/tasks', newTask);
      setShowModal(false);
      setNewTask({ title: '', department: 'Registration', priority: 'medium', due_date: '2026-06-05 12:00:00' });
      await fetchTasks();
    } catch (err) {
      alert('Failed to create task.');
    } finally {
      setActionLoading(false);
    }
  };

  const filteredTasks = tasks.filter(t => {
    if (statusFilter === 'all') return true;
    return t.status === statusFilter;
  });

  const priorityColor = (p) => {
    if (p === 'urgent') return '#dc2626';
    if (p === 'high') return '#ea580c';
    if (p === 'medium') return '#d97706';
    return '#64748b';
  };

  return (
    <div className="fc-tasks-page">
      {/* Page Header */}
      <div className="fc-page-header">
        <div>
          <h1 className="fc-page-title">Operational Tasks</h1>
          <p className="fc-page-subtitle">
            {scope === 'all' 
              ? `Festival Control Tower · Showing all ${tasks.length} tasks (${metrics.unassignedTasks || 3} unassigned)`
              : `Volunteer Shift View · Showing ${tasks.length} tasks assigned to you`}
          </p>
        </div>
        {scope === 'all' && (
          <button className="fc-btn-primary" onClick={() => setShowModal(true)}>
            + Create Task
          </button>
        )}
      </div>

      {/* Subtabs */}
      <div className="fc-subtabs">
        <button 
          className={`fc-subtab ${!unassignedOnly && statusFilter === 'all' ? 'active' : ''}`}
          onClick={() => { setUnassignedOnly(false); setStatusFilter('all'); }}
        >
          All ({tasks.length})
        </button>
        <button 
          className={`fc-subtab ${!unassignedOnly && statusFilter === 'To Do' ? 'active' : ''}`}
          onClick={() => { setUnassignedOnly(false); setStatusFilter('To Do'); }}
        >
          To Do
        </button>
        <button 
          className={`fc-subtab ${!unassignedOnly && statusFilter === 'In Progress' ? 'active' : ''}`}
          onClick={() => { setUnassignedOnly(false); setStatusFilter('In Progress'); }}
        >
          In Progress
        </button>
        <button 
          className={`fc-subtab ${!unassignedOnly && statusFilter === 'Done' ? 'active' : ''}`}
          onClick={() => { setUnassignedOnly(false); setStatusFilter('Done'); }}
        >
          Done
        </button>
        {scope === 'all' && (
          <button 
            className={`fc-subtab ${unassignedOnly ? 'active' : ''}`}
            onClick={() => { setUnassignedOnly(true); setStatusFilter('all'); }}
          >
            Unassigned ({metrics.unassignedTasks || 3})
          </button>
        )}
      </div>

      {/* Table Card */}
      <div className="fc-card fc-table-card">
        {loading ? (
          <div className="fc-loading-state">
            <div className="fc-spinner"></div>
            <span>Loading operational tasks...</span>
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="fc-empty-state">No tasks found for current filter.</div>
        ) : (
          <table className="fc-table">
            <thead>
              <tr>
                <th>TASK</th>
                <th>DEPARTMENT</th>
                <th>PRIORITY</th>
                <th>ASSIGNEES</th>
                <th>STATUS</th>
                <th style={{ textAlign: 'right', paddingRight: '24px' }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {filteredTasks.map((task) => (
                <tr key={task.id}>
                  {/* Task */}
                  <td>
                    <div className="fc-member-cell">
                      <span className="fc-member-name">{task.title}</span>
                      <span className="fc-member-email">Due: {task.due_date ? String(task.due_date).split('T')[0] : 'Open'}</span>
                    </div>
                  </td>

                  {/* Department */}
                  <td>
                    <span className="fc-dept-tag">{task.department}</span>
                  </td>

                  {/* Priority */}
                  <td>
                    <span 
                      style={{
                        fontSize: '0.725rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        color: priorityColor(task.priority),
                        backgroundColor: `${priorityColor(task.priority)}15`,
                        padding: '2px 8px',
                        borderRadius: '4px'
                      }}
                    >
                      {task.priority}
                    </span>
                  </td>

                  {/* Assignees */}
                  <td>
                    {task.assigneeList && task.assigneeList.length > 0 ? (
                      <span style={{ fontSize: '0.8rem', color: 'var(--fc-text-main)', fontWeight: 500 }}>
                        {task.assigneeList.join(', ')}
                      </span>
                    ) : (
                      <span style={{ fontSize: '0.75rem', color: '#b91c1c', fontWeight: 600 }}>Unassigned</span>
                    )}
                  </td>

                  {/* Status Dropdown */}
                  <td>
                    <select
                      value={task.status}
                      onChange={(e) => handleStatusUpdate(task.id, e.target.value)}
                      style={{
                        padding: '4px 8px',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        border: '1px solid var(--fc-border)',
                        background: task.status === 'Done' ? '#dcfce7' : task.status === 'In Progress' ? '#fef3c7' : '#f0ece6',
                        color: task.status === 'Done' ? '#166534' : task.status === 'In Progress' ? '#92400e' : '#57534e'
                      }}
                    >
                      <option value="To Do">To Do</option>
                      <option value="In Progress">In Progress</option>
                      <option value="Done">Done</option>
                    </select>
                  </td>

                  {/* Quick Action Button */}
                  <td style={{ textAlign: 'right', paddingRight: '24px' }}>
                    {task.status !== 'Done' ? (
                      <button 
                        className="fc-action-btn"
                        onClick={() => handleStatusUpdate(task.id, task.status === 'To Do' ? 'In Progress' : 'Done')}
                      >
                        {task.status === 'To Do' ? 'Start' : 'Mark Done'}
                      </button>
                    ) : (
                      <span style={{ color: '#16a34a', fontSize: '0.75rem', fontWeight: 600 }}>✓ Completed</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add Task Modal */}
      {showModal && (
        <div className="fc-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="fc-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="fc-modal-header">
              <h2>Create Operational Task</h2>
              <button className="fc-modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={handleCreateTask}>
              <div className="fc-modal-body">
                <div className="fc-form-group">
                  <label>Task Title</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. VIP Green Room Setup"
                    value={newTask.title}
                    onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                  />
                </div>
                <div className="fc-form-group">
                  <label>Department</label>
                  <select
                    value={newTask.department}
                    onChange={(e) => setNewTask({ ...newTask, department: e.target.value })}
                  >
                    <option value="Tech">Tech</option>
                    <option value="Venue">Venue</option>
                    <option value="Registration">Registration</option>
                    <option value="Hospitality">Hospitality</option>
                    <option value="Guest Escort">Guest Escort</option>
                  </select>
                </div>
                <div className="fc-form-group">
                  <label>Priority</label>
                  <select
                    value={newTask.priority}
                    onChange={(e) => setNewTask({ ...newTask, priority: e.target.value })}
                  >
                    <option value="urgent">Urgent</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
              </div>
              <div className="fc-modal-footer">
                <button type="button" className="fc-btn-secondary" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="fc-btn-primary" disabled={actionLoading}>
                  {actionLoading ? 'Creating...' : 'Create Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
