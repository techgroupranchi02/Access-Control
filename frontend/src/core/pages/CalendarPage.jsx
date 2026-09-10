/**
 * Calendar & Screenings Page
 * Addon Module: calendar
 * Permissions:
 * - calendar.view
 * - calendar.manage_events
 * - calendar.publish_schedule
 */

import { useState, useEffect } from 'react';
import api from '../services/api';
import PermissionGate from '../components/PermissionGate';
import { usePermissions } from '../hooks/usePermissions';

export default function CalendarPage() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNewModal, setShowNewModal] = useState(false);
  const [newEvent, setNewEvent] = useState({ title: '', venue: '', startTime: '', duration: '90m', type: 'Screening' });
  const [statusMsg, setStatusMsg] = useState('');
  const { can } = usePermissions();

  const loadCalendar = async () => {
    try {
      const res = await api.get('/calendar');
      setEvents(res.data);
    } catch {
      console.error('Failed to load calendar');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCalendar();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await api.post('/calendar', newEvent);
      setStatusMsg(`Event "${newEvent.title}" added to festival schedule.`);
      setShowNewModal(false);
      setNewEvent({ title: '', venue: '', startTime: '', duration: '90m', type: 'Screening' });
      loadCalendar();
    } catch {
      alert('Failed to create calendar event.');
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 className="page-title">📅 Calendar & Screenings</h2>
          <p className="page-description">
            Schedule festival screenings, workshop sessions, and public Q&A events.
          </p>
        </div>
        <PermissionGate permission="calendar.manage_events">
          <button className="btn btn-primary" onClick={() => setShowNewModal(true)}>
            ➕ Schedule Event
          </button>
        </PermissionGate>
      </div>

      {statusMsg && (
        <div className="alert alert-success" style={{ marginBottom: 'var(--space-md)' }}>
          {statusMsg}
        </div>
      )}

      {/* Permissions overview */}
      <div className="alert alert-info" style={{ marginBottom: 'var(--space-lg)', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <span>🔑 <strong>Calendar Permissions:</strong></span>
        <span className={`badge ${can('calendar.view') ? 'badge-success' : 'badge-danger'}`}>calendar.view</span>
        <span className={`badge ${can('calendar.manage_events') ? 'badge-success' : 'badge-danger'}`}>calendar.manage_events</span>
        <span className={`badge ${can('calendar.publish_schedule') ? 'badge-success' : 'badge-danger'}`}>calendar.publish_schedule</span>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Festival Lineup & Screening Schedule</h3>
          <p className="card-subtitle"><span className="permission-section-badge">Requires: calendar.view</span></p>
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
                  <th>Event Title</th>
                  <th>Type</th>
                  <th>Venue</th>
                  <th>Start Time</th>
                  <th>Duration</th>
                </tr>
              </thead>
              <tbody>
                {events.map(ev => (
                  <tr key={ev.id}>
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{ev.title}</td>
                    <td><span className="badge badge-info">{ev.type}</span></td>
                    <td>📍 {ev.venue}</td>
                    <td>🕒 {ev.startTime}</td>
                    <td>⏱️ {ev.duration}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* New Event Modal */}
      {showNewModal && (
        <div className="card" style={{ marginTop: 'var(--space-lg)', border: '1px solid var(--color-primary)' }}>
          <div className="card-header">
            <h3 className="card-title">Schedule New Screening / Event</h3>
            <p className="card-subtitle"><span className="permission-section-badge">Requires: calendar.manage_events</span></p>
          </div>
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
            <div style={{ display: 'flex', gap: 'var(--space-md)', flexWrap: 'wrap' }}>
              <div className="form-group" style={{ flex: 1, minWidth: '220px' }}>
                <label className="form-label">Event Title</label>
                <input
                  required
                  className="form-input"
                  placeholder="e.g. Midnight Shorts Block B"
                  value={newEvent.title}
                  onChange={e => setNewEvent({ ...newEvent, title: e.target.value })}
                />
              </div>
              <div className="form-group" style={{ width: '180px' }}>
                <label className="form-label">Type</label>
                <select
                  className="form-input"
                  value={newEvent.type}
                  onChange={e => setNewEvent({ ...newEvent, type: e.target.value })}
                >
                  <option value="Screening">Screening</option>
                  <option value="Event">Event</option>
                  <option value="Panel">Panel</option>
                  <option value="Gala">Gala</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-md)', flexWrap: 'wrap' }}>
              <div className="form-group" style={{ flex: 1, minWidth: '200px' }}>
                <label className="form-label">Venue</label>
                <input
                  required
                  className="form-input"
                  placeholder="e.g. Main Auditorium Screen 1"
                  value={newEvent.venue}
                  onChange={e => setNewEvent({ ...newEvent, venue: e.target.value })}
                />
              </div>
              <div className="form-group" style={{ width: '200px' }}>
                <label className="form-label">Start Date & Time</label>
                <input
                  required
                  type="text"
                  className="form-input"
                  placeholder="YYYY-MM-DD HH:MM"
                  value={newEvent.startTime}
                  onChange={e => setNewEvent({ ...newEvent, startTime: e.target.value })}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="submit" className="btn btn-success">Save Event</button>
              <button type="button" className="btn btn-secondary" onClick={() => setShowNewModal(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
