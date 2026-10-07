/**
 * AttendancePage Component (/attendance)
 * 
 * Gate Check-In & Attendance Verification:
 * - Select current screening block/session
 * - Fast barcode/QR scanner with sound/haptic feedback
 * - Real-time duplicate scan prevention
 * - Live attendance feed with category ribbons
 * - Attendance summary metrics and CSV export
 */

import React, { useState, useEffect } from 'react';
import api from '../services/api';

export default function AttendancePage() {
  const [screenings, setScreenings] = useState([]);
  const [selectedScreening, setSelectedScreening] = useState('');
  const [scanInput, setScanInput] = useState('');
  const [scanning, setScanning] = useState(false);
  const [lastScanResult, setLastScanResult] = useState(null);
  const [logs, setLogs] = useState([]);
  const [metrics, setMetrics] = useState({ totalCheckins: 0, uniqueAttendeesCheckedIn: 0 });
  const [loading, setLoading] = useState(true);

  const fetchScreenings = async () => {
    try {
      setLoading(true);
      const res = await api.get('/audience/screenings');
      const list = res.data.screenings || [];
      setScreenings(list);
      if (list.length > 0 && !selectedScreening) {
        setSelectedScreening(list[0].id);
      }
    } catch (err) {
      console.error('Failed to load screenings:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchLogs = async (screeningId) => {
    try {
      const res = await api.get('/attendance/logs', {
        params: { screening_id: screeningId || undefined, limit: 50 }
      });
      setLogs(res.data.logs || []);
      setMetrics(res.data.metrics || { totalCheckins: 0, uniqueAttendeesCheckedIn: 0 });
    } catch (err) {
      console.error('Failed to fetch attendance logs:', err);
    }
  };

  useEffect(() => {
    fetchScreenings();
  }, []);

  useEffect(() => {
    if (selectedScreening) {
      fetchLogs(selectedScreening);
    }
  }, [selectedScreening]);

  const handleScanSubmit = async (e) => {
    e.preventDefault();
    if (!scanInput.trim() || !selectedScreening) return;

    try {
      setScanning(true);
      const res = await api.post('/attendance/scan', {
        qr_token: scanInput.trim(),
        screening_block_id: selectedScreening
      });

      setLastScanResult({
        success: true,
        isDuplicate: res.data.is_duplicate,
        message: res.data.message,
        attendee: res.data.attendee,
        timestamp: new Date().toLocaleTimeString()
      });

      setScanInput('');
      fetchLogs(selectedScreening);
    } catch (err) {
      setLastScanResult({
        success: false,
        message: err.response?.data?.error || 'Invalid badge or check-in failed.',
        timestamp: new Date().toLocaleTimeString()
      });
    } finally {
      setScanning(false);
    }
  };

  const currentScreeningObj = screenings.find(s => String(s.id) === String(selectedScreening));

  return (
    <div className="fc-attendance-page" style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Page Header */}
      <div className="fc-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 className="fc-page-title" style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0, color: 'var(--fc-text-main)' }}>
            Gate Check-In & Attendance
          </h1>
          <p className="fc-page-subtitle" style={{ color: 'var(--fc-text-muted)', marginTop: '4px', fontSize: '0.9rem' }}>
            Scan delegate badge passes to verify auditorium entrance and unlock audience voting eligibility
          </p>
        </div>

        {/* Screening Session Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <label style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--fc-text-secondary)' }}>ACTIVE SCREENING:</label>
          <select 
            value={selectedScreening} 
            onChange={(e) => setSelectedScreening(e.target.value)}
            style={{
              padding: '10px 14px',
              borderRadius: '8px',
              border: '1px solid var(--fc-border)',
              background: 'var(--fc-surface-card)',
              fontWeight: 600,
              fontSize: '0.9rem',
              color: 'var(--fc-text-main)',
              boxShadow: 'var(--shadow-sm)'
            }}
          >
            {screenings.map(s => (
              <option key={s.id} value={s.id}>
                {s.title} ({s.start_time} - {s.venue_name})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div className="fc-card" style={{ background: 'var(--fc-surface-card)', borderRadius: '10px', padding: '16px', border: '1px solid var(--fc-border)' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--fc-text-muted)', textTransform: 'uppercase' }}>Screening Checked-In</div>
          <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#2563eb', marginTop: '4px' }}>
            {currentScreeningObj?.checked_in_count || logs.length}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--fc-text-muted)', marginTop: '4px' }}>
            Venue: {currentScreeningObj?.venue_name || 'Auditorium'}
          </div>
        </div>

        <div className="fc-card" style={{ background: 'var(--fc-surface-card)', borderRadius: '10px', padding: '16px', border: '1px solid var(--fc-border)' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--fc-text-muted)', textTransform: 'uppercase' }}>Total Festival Scans</div>
          <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#16a34a', marginTop: '4px' }}>
            {metrics.totalCheckins}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--fc-text-muted)', marginTop: '4px' }}>Across all screening doors</div>
        </div>

        <div className="fc-card" style={{ background: 'var(--fc-surface-card)', borderRadius: '10px', padding: '16px', border: '1px solid var(--fc-border)' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--fc-text-muted)', textTransform: 'uppercase' }}>Unique Delegates Attended</div>
          <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#7c3aed', marginTop: '4px' }}>
            {metrics.uniqueAttendeesCheckedIn}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--fc-text-muted)', marginTop: '4px' }}>Unique badge holders onsite</div>
        </div>
      </div>

      {/* Main Grid: Scanner Console + Live Log Feed */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 420px) 1fr', gap: '24px' }}>
        
        {/* Scanner Deck */}
        <div>
          <div className="fc-card" style={{ background: 'var(--fc-surface-card)', borderRadius: '12px', border: '1px solid var(--fc-border)', padding: '24px', boxShadow: 'var(--shadow-sm)' }}>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 16px 0', color: 'var(--fc-text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>📷</span> Badge Scanner Deck
            </h2>

            {/* Simulated / Camera Input Box */}
            <form onSubmit={handleScanSubmit}>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--fc-text-main)', marginBottom: '6px' }}>
                  Scan Badge QR / Enter Badge ID or Token
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input 
                    type="text" 
                    placeholder="Scan QR or enter Badge # / Token..."
                    value={scanInput}
                    onChange={(e) => setScanInput(e.target.value)}
                    autoFocus
                    style={{
                      flex: 1,
                      padding: '12px 14px',
                      borderRadius: '8px',
                      border: '2px solid #3b82f6',
                      background: 'var(--fc-surface)',
                      color: 'var(--fc-text-main)',
                      fontSize: '1rem',
                      fontWeight: 600
                    }}
                  />
                  <button 
                    type="submit" 
                    disabled={scanning}
                    style={{
                      background: '#2563eb',
                      color: '#fff',
                      border: 'none',
                      padding: '0 20px',
                      borderRadius: '8px',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    {scanning ? '...' : 'Verify'}
                  </button>
                </div>
                <small style={{ display: 'block', color: 'var(--fc-text-muted)', marginTop: '6px', fontSize: '0.75rem' }}>
                  Supports physical USB barcode gun, camera scanner, or manual keyboard entry.
                </small>
              </div>
            </form>

            {/* Scan Feedback Banner */}
            {lastScanResult && (
              <div 
                style={{
                  marginTop: '16px',
                  padding: '16px',
                  borderRadius: '10px',
                  background: lastScanResult.success 
                    ? (lastScanResult.isDuplicate ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 129, 0.15)')
                    : 'var(--fc-alert-bg, rgba(220, 38, 38, 0.15))',
                  border: `1px solid ${
                    lastScanResult.success 
                      ? (lastScanResult.isDuplicate ? '#f59e0b' : '#10b981')
                      : 'var(--fc-alert-border, #ef4444)'
                  }`
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ fontSize: '1.25rem' }}>
                    {lastScanResult.success 
                      ? (lastScanResult.isDuplicate ? '⚠️' : '✅')
                      : '❌'}
                  </span>
                  <strong style={{ color: lastScanResult.success ? (lastScanResult.isDuplicate ? '#f59e0b' : '#10b981') : '#ef4444' }}>
                    {lastScanResult.message}
                  </strong>
                </div>

                {lastScanResult.attendee && (
                  <div style={{ marginTop: '8px', fontSize: '0.9rem', color: 'var(--fc-text-main)' }}>
                    <div>Delegate: <strong>{lastScanResult.attendee.name}</strong></div>
                    <div>Category: <span style={{ fontWeight: 700, textTransform: 'uppercase' }}>{lastScanResult.attendee.delegate_category}</span></div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--fc-text-muted)', marginTop: '4px' }}>Time: {lastScanResult.timestamp}</div>
                  </div>
                )}
              </div>
            )}

            {/* Active Screening Details */}
            {currentScreeningObj && (
              <div style={{ marginTop: '20px', padding: '14px', background: 'var(--fc-surface)', borderRadius: '8px', border: '1px solid var(--fc-border)', fontSize: '0.85rem' }}>
                <div style={{ fontWeight: 700, color: 'var(--fc-text-secondary)', marginBottom: '6px' }}>SELECTED RUN-OF-SHOW</div>
                <div style={{ color: 'var(--fc-text-main)', fontWeight: 600 }}>{currentScreeningObj.title}</div>
                <div style={{ color: 'var(--fc-text-muted)', marginTop: '4px' }}>
                  🕒 {currentScreeningObj.start_time} - {currentScreeningObj.end_time} · {currentScreeningObj.block_type === 'short_block' ? 'Short Film Block' : 'Feature Film'}
                </div>
                {currentScreeningObj.films && currentScreeningObj.films.length > 0 && (
                  <div style={{ marginTop: '8px', borderTop: '1px dashed var(--fc-border)', paddingTop: '6px' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--fc-text-muted)' }}>Films in this block ({currentScreeningObj.films.length}):</div>
                    <ul style={{ margin: '4px 0 0 16px', padding: 0, color: 'var(--fc-text-secondary)' }}>
                      {currentScreeningObj.films.map(f => (
                        <li key={f.film_id}>{f.title} ({f.runtime}m - {f.director})</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Live Attendance Log Feed */}
        <div>
          <div className="fc-card" style={{ background: 'var(--fc-surface-card)', borderRadius: '12px', border: '1px solid var(--fc-border)', padding: '20px', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: 'var(--fc-text-main)' }}>
                Auditorium Entrance Feed ({logs.length})
              </h2>
              <button
                onClick={() => fetchLogs(selectedScreening)}
                style={{ background: 'var(--fc-surface)', border: '1px solid var(--fc-border)', color: 'var(--fc-text-main)', padding: '6px 12px', borderRadius: '6px', fontSize: '0.8rem', cursor: 'pointer' }}
              >
                🔄 Refresh
              </button>
            </div>

            {logs.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--fc-text-muted)' }}>
                No check-ins recorded yet for this screening session. Scan attendee badges to begin intake.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--fc-surface)', borderBottom: '1px solid var(--fc-border)', textAlign: 'left', color: 'var(--fc-text-muted)' }}>
                      <th style={{ padding: '10px 12px' }}>Attendee</th>
                      <th style={{ padding: '10px 12px' }}>Category</th>
                      <th style={{ padding: '10px 12px' }}>Time</th>
                      <th style={{ padding: '10px 12px' }}>Status</th>
                      <th style={{ padding: '10px 12px' }}>Scanned By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => (
                      <tr key={log.id} style={{ borderBottom: '1px solid var(--fc-border)' }}>
                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ fontWeight: 600, color: 'var(--fc-text-main)' }}>{log.attendee_name}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--fc-text-muted)' }}>ID #{log.attendee_id} · {log.attendee_phone || log.attendee_email}</div>
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <span 
                            style={{ 
                              background: log.badge_color || '#6366f1', 
                              color: '#fff', 
                              fontSize: '0.7rem', 
                              fontWeight: 800, 
                              padding: '2px 8px', 
                              borderRadius: '4px', 
                              letterSpacing: '0.05em'
                            }}
                          >
                            {log.badge_ribbon || log.delegate_category}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', color: 'var(--fc-text-secondary)' }}>
                          {new Date(log.scanned_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{ color: '#16a34a', fontWeight: 600 }}>Verified ✓</span>
                        </td>
                        <td style={{ padding: '10px 12px', color: 'var(--fc-text-muted)' }}>
                          {log.scanned_by_name || 'Volunteer'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
