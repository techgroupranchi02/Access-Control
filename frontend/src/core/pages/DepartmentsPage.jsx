/**
 * Department Management Page
 * Addon Module: departments
 * Permissions:
 * - department.view
 * - department.manage
 * - department.assign_leads
 */

import { useState, useEffect } from 'react';
import api from '../services/api';
import PermissionGate from '../components/PermissionGate';
import { usePermissions } from '../hooks/usePermissions';

export default function DepartmentsPage() {
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const { can } = usePermissions();

  const loadDepts = async () => {
    try {
      const res = await api.get('/departments');
      setDepartments(res.data);
    } catch {
      console.error('Failed to load departments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDepts();
  }, []);

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h2 className="page-title">🏢 Department Management</h2>
        <p className="page-description">
          Organize festival workforce, assign departmental leads, and balance task distribution.
        </p>
      </div>

      <div className="alert alert-info" style={{ marginBottom: 'var(--space-lg)', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <span>🔑 <strong>Department Permissions:</strong></span>
        <span className={`badge ${can('department.view') ? 'badge-success' : 'badge-danger'}`}>department.view</span>
        <span className={`badge ${can('department.manage') ? 'badge-success' : 'badge-danger'}`}>department.manage</span>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Festival Operational Divisions</h3>
          <p className="card-subtitle"><span className="permission-section-badge">Requires: department.view</span></p>
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
                  <th>Department Name</th>
                  <th>Department Lead</th>
                  <th>Staff Count</th>
                  <th>Active Tasks</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {departments.map(d => (
                  <tr key={d.id}>
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{d.name}</td>
                    <td>⭐ {d.lead}</td>
                    <td>👥 {d.staffCount} members</td>
                    <td><span className="badge badge-info">{d.activeTasks} tasks</span></td>
                    <td>
                      <PermissionGate permission="department.manage">
                        <button className="btn btn-secondary btn-sm" onClick={() => alert(`Managing department: ${d.name}`)}>
                          ⚙️ Manage
                        </button>
                      </PermissionGate>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
