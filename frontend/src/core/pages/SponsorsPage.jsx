/**
 * SponsorsPage Component
 * Commercial partners & deliverable tracking:
 * - 3 Canonical Sponsors (Netflix, Kodak, Sony)
 * - Deliverables list with status tags
 */

import React, { useState, useEffect } from 'react';
import api from '../services/api';

export default function SponsorsPage() {
  const [sponsors, setSponsors] = useState([]);
  const [deliverables, setDeliverables] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchSponsors = async () => {
    try {
      setLoading(true);
      const res = await api.get('/sponsors');
      setSponsors(res.data.sponsors || []);
      setDeliverables(res.data.deliverables || []);
    } catch (err) {
      console.error('Failed to load sponsors:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSponsors();
  }, []);

  const totalContract = sponsors.reduce((acc, s) => acc + parseFloat(s.contract_amount || 0), 0);

  return (
    <div className="fc-sponsors-page">
      {/* Page Header */}
      <div className="fc-page-header">
        <div>
          <h1 className="fc-page-title">Sponsors & Deliverables</h1>
          <p className="fc-page-subtitle">
            {sponsors.length} commercial partners · ${totalContract.toLocaleString()} total committed funding
          </p>
        </div>
      </div>

      {/* Sponsor Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        {sponsors.map((s) => (
          <div key={s.id} className="fc-card" style={{ padding: '18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="fc-dept-tag" style={{ background: '#fef3c7', color: '#92400e', fontWeight: 700 }}>
                {s.tier} Partner
              </span>
              <span style={{ fontWeight: 800, color: '#16a34a', fontSize: '1.1rem' }}>
                ${parseFloat(s.contract_amount).toLocaleString()}
              </span>
            </div>
            <div style={{ fontWeight: 700, fontSize: '1.1rem', color: '#1a1a1a', marginTop: '12px' }}>
              {s.name}
            </div>
          </div>
        ))}
      </div>

      {/* Deliverables Table */}
      <div className="fc-card fc-table-card">
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--fc-border-subtle)', fontWeight: 700, fontSize: '0.9rem' }}>
          Contractual Deliverables ({deliverables.length})
        </div>
        {loading ? (
          <div className="fc-loading-state"><div className="fc-spinner"></div>Loading deliverables...</div>
        ) : (
          <table className="fc-table">
            <thead>
              <tr>
                <th>DELIVERABLE</th>
                <th>SPONSOR</th>
                <th>DUE DATE</th>
                <th>STATUS</th>
              </tr>
            </thead>
            <tbody>
              {deliverables.map((d) => (
                <tr key={d.id}>
                  <td><span className="fc-member-name">{d.title}</span></td>
                  <td><span style={{ fontSize: '0.8rem', fontWeight: 500 }}>{d.sponsor_name}</span></td>
                  <td><span style={{ fontSize: '0.8rem', color: 'var(--fc-text-muted)' }}>{d.due_date}</span></td>
                  <td>
                    <span 
                      className="fc-dept-tag"
                      style={{
                        background: d.status === 'Completed' ? '#dcfce7' : d.status === 'In Progress' ? '#fef3c7' : '#f0ece6',
                        color: d.status === 'Completed' ? '#166534' : d.status === 'In Progress' ? '#92400e' : '#57534e',
                        fontWeight: 600
                      }}
                    >
                      {d.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
