/**
 * Analytics & Reporting Page
 * Addon Module: analytics
 * Permissions:
 * - analytics.view
 * - analytics.export
 */

import { useState, useEffect } from 'react';
import api from '../services/api';
import PermissionGate from '../components/PermissionGate';
import { usePermissions } from '../hooks/usePermissions';

export default function AnalyticsPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const { can } = usePermissions();

  const loadAnalytics = async () => {
    try {
      const res = await api.get('/analytics');
      setStats(res.data);
    } catch {
      console.error('Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnalytics();
  }, []);

  return (
    <div className="animate-fade-in">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 className="page-title">📊 Analytics & Reporting</h2>
          <p className="page-description">
            Monitor submission intake metrics, screening reservations, and jury evaluation throughput.
          </p>
        </div>
        <PermissionGate permission="analytics.export">
          <button className="btn btn-secondary" onClick={() => alert('Exporting analytics CSV...')}>
            📥 Export Report
          </button>
        </PermissionGate>
      </div>

      <div className="alert alert-info" style={{ marginBottom: 'var(--space-lg)', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <span>🔑 <strong>Analytics Permissions:</strong></span>
        <span className={`badge ${can('analytics.view') ? 'badge-success' : 'badge-danger'}`}>analytics.view</span>
        <span className={`badge ${can('analytics.export') ? 'badge-success' : 'badge-danger'}`}>analytics.export</span>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: '48px' }}></div>)}
        </div>
      ) : (
        <>
          <div className="dashboard-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-md)', marginBottom: 'var(--space-xl)' }}>
            <div className="card">
              <div className="stat-value" style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--color-primary)' }}>{stats?.totalSubmissions || 0}</div>
              <div className="stat-label" style={{ color: 'var(--text-secondary)' }}>Total Submissions</div>
            </div>
            <div className="card">
              <div className="stat-value" style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--color-success)' }}>{stats?.acceptanceRate || '0%'}</div>
              <div className="stat-label" style={{ color: 'var(--text-secondary)' }}>Acceptance Rate</div>
            </div>
            <div className="card">
              <div className="stat-value" style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--color-warning)' }}>{stats?.activeJurors || 0}</div>
              <div className="stat-label" style={{ color: 'var(--text-secondary)' }}>Active Jurors</div>
            </div>
            <div className="card">
              <div className="stat-value" style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--color-info)' }}>{stats?.ticketsReserved || 0}</div>
              <div className="stat-label" style={{ color: 'var(--text-secondary)' }}>Screening Passes</div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Submissions by Category</h3>
              <p className="card-subtitle"><span className="permission-section-badge">Requires: analytics.view</span></p>
            </div>
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Submissions</th>
                    <th>Share</th>
                  </tr>
                </thead>
                <tbody>
                  {stats?.breakdown?.map(item => (
                    <tr key={item.category}>
                      <td style={{ fontWeight: 600 }}>{item.category}</td>
                      <td>{item.count}</td>
                      <td>
                        <span className="badge badge-info">
                          {((item.count / (stats.totalSubmissions || 1)) * 100).toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
