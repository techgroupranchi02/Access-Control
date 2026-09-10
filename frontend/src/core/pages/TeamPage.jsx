/**
 * Team Page — Core Page with Simple Access Control
 * Page-level access only (no granular sections).
 */

import { useState, useEffect } from 'react';
import api from '../services/api';

export default function TeamPage() {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      const res = await api.get('/team');
      setMembers(res.data);
    } catch {
      console.error('Failed to load team');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const departmentColor = (dept) => {
    const map = {
      'Management': 'badge-primary',
      'Technology': 'badge-info',
      'Marketing': 'badge-warning',
      'Operations': 'badge-success',
    };
    return map[dept] || 'badge-muted';
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h2 className="page-title">👥 Team Management</h2>
        <p className="page-description">
          View and manage team members. This page has simple page-level access control.
        </p>
      </div>

      <div className="alert alert-info" style={{ marginBottom: 'var(--space-lg)' }}>
        🔑 <strong>Access Model:</strong> Page-level access — if you can see this, you have <code>team:read</code> permission.
      </div>

      {loading ? (
        <div className="page-grid page-grid-2">
          {[1,2,3,4].map(i => (
            <div key={i} className="skeleton" style={{ height: '160px', borderRadius: 'var(--radius-lg)' }}></div>
          ))}
        </div>
      ) : (
        <div className="page-grid page-grid-2">
          {members.map((member, i) => (
            <div key={member.id} className="card" style={{ animationDelay: `${i * 0.1}s` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', marginBottom: 'var(--space-md)' }}>
                <div style={{
                  width: '48px', height: '48px', borderRadius: 'var(--radius-full)',
                  background: 'var(--gradient-secondary)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1.25rem', fontWeight: 700, flexShrink: 0,
                }}>
                  {member.name.charAt(0)}
                </div>
                <div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>{member.name}</h3>
                  <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{member.role}</p>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>{member.email}</span>
                <span className={`badge ${departmentColor(member.department)}`}>{member.department}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
