/**
 * GuestsPage Component
 * VIP Guest & Hospitality Desk:
 * - Scoped: Admin sees all 4, Volunteer sees assigned (2 for Amit Sharma)
 * - Check-in & Badge printing
 * - Hotel & Flight arrival coordination
 */

import React, { useState, useEffect } from 'react';
import api from '../services/api';

export default function GuestsPage() {
  const [guests, setGuests] = useState([]);
  const [metrics, setMetrics] = useState({});
  const [scope, setScope] = useState('all');
  const [loading, setLoading] = useState(true);

  const fetchGuests = async () => {
    try {
      setLoading(true);
      const res = await api.get('/guests');
      setGuests(res.data.data || []);
      setMetrics(res.data.metrics || {});
      setScope(res.data.scope || 'all');
    } catch (err) {
      console.error('Failed to load guests:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGuests();
  }, []);

  const handleCheckIn = async (guestId) => {
    try {
      await api.post(`/guests/${guestId}/checkin`);
      setGuests(guests.map(g => g.id === guestId ? { ...g, rsvp_status: 'Arrived', badge_issued: 1 } : g));
    } catch (err) {
      alert('Failed to check in guest.');
    }
  };

  const handlePrintBadge = async (guestId) => {
    try {
      await api.post(`/guests/${guestId}/print-badge`);
      setGuests(guests.map(g => g.id === guestId ? { ...g, badge_issued: 1 } : g));
      alert('Badge sent to printer!');
    } catch (err) {
      alert('Failed to print badge.');
    }
  };

  return (
    <div className="fc-guests-page">
      {/* Page Header */}
      <div className="fc-page-header">
        <div>
          <h1 className="fc-page-title">VIP Guests & Hospitality</h1>
          <p className="fc-page-subtitle">
            {scope === 'all'
              ? `Hospitality Desk · Showing all ${guests.length} VIP delegates`
              : `Volunteer Escort View · Showing ${guests.length} delegates assigned to you`}
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '20px' }}>
        <div className="fc-card" style={{ padding: '16px' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--fc-text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
            Total Delegates
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#1a1a1a', marginTop: '4px' }}>
            {guests.length}
          </div>
        </div>
        <div className="fc-card" style={{ padding: '16px' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--fc-text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
            Arrived & Checked In
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#16a34a', marginTop: '4px' }}>
            {guests.filter(g => g.rsvp_status === 'Arrived').length}
          </div>
        </div>
        <div className="fc-card" style={{ padding: '16px' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--fc-text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
            Badges Issued
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#2563eb', marginTop: '4px' }}>
            {guests.filter(g => g.badge_issued).length}
          </div>
        </div>
      </div>

      {/* Table Card */}
      <div className="fc-card fc-table-card">
        {loading ? (
          <div className="fc-loading-state">
            <div className="fc-spinner"></div>
            <span>Loading guests...</span>
          </div>
        ) : guests.length === 0 ? (
          <div className="fc-empty-state">No guests assigned.</div>
        ) : (
          <table className="fc-table">
            <thead>
              <tr>
                <th>DELEGATE</th>
                <th>RSVP STATUS</th>
                <th>HOTEL</th>
                <th>FLIGHT ARRIVAL</th>
                <th>ASSIGNED ESCORT</th>
                <th style={{ textAlign: 'right', paddingRight: '24px' }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {guests.map((g) => (
                <tr key={g.id}>
                  {/* Delegate */}
                  <td>
                    <div className="fc-member-cell">
                      <span className="fc-member-name">{g.name}</span>
                      <span className="fc-member-email">{g.role}</span>
                    </div>
                  </td>

                  {/* RSVP */}
                  <td>
                    <span 
                      className="fc-dept-tag"
                      style={{
                        backgroundColor: g.rsvp_status === 'Arrived' ? '#dcfce7' : g.rsvp_status === 'Confirmed' ? '#dbeafe' : '#fef3c7',
                        color: g.rsvp_status === 'Arrived' ? '#166534' : g.rsvp_status === 'Confirmed' ? '#1e40af' : '#92400e',
                        fontWeight: 600
                      }}
                    >
                      {g.rsvp_status}
                    </span>
                  </td>

                  {/* Hotel */}
                  <td>
                    <span style={{ fontSize: '0.8rem', color: 'var(--fc-text-main)' }}>
                      {g.hotel_details || 'TBD'}
                    </span>
                  </td>

                  {/* Flight */}
                  <td>
                    <span style={{ fontSize: '0.8rem', color: g.flight_details?.includes('19:00') ? '#b91c1c' : 'var(--fc-text-secondary)', fontWeight: g.flight_details?.includes('19:00') ? 700 : 500 }}>
                      ✈️ {g.flight_details || 'Not provided'}
                    </span>
                  </td>

                  {/* Escort */}
                  <td>
                    <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>
                      {g.volunteer_name || 'Unassigned'}
                    </span>
                  </td>

                  {/* Actions */}
                  <td style={{ textAlign: 'right', paddingRight: '24px' }}>
                    <div className="fc-actions-group">
                      {g.rsvp_status !== 'Arrived' && (
                        <button
                          className="fc-action-btn"
                          onClick={() => handleCheckIn(g.id)}
                        >
                          Check In
                        </button>
                      )}
                      <button
                        className="fc-action-btn"
                        onClick={() => handlePrintBadge(g.id)}
                      >
                        {g.badge_issued ? 'Reprint Badge' : 'Print Badge'}
                      </button>
                    </div>
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
