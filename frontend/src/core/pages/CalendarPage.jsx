/**
 * CalendarPage (Festival Schedule) Component
 * Freecomers 4-Day Timetable & Venue Grid
 * Displays venue screening slots and the Day 1 director arrival conflict alert.
 */

import React, { useState, useEffect } from 'react';
import api from '../services/api';

const DAYS = [
  { index: 0, label: 'Day 1 · Opening Night', hasConflict: true },
  { index: 1, label: 'Day 2 · Indie Showcase', hasConflict: false },
  { index: 2, label: 'Day 3 · Documentary Day', hasConflict: false },
  { index: 3, label: 'Day 4 · Awards Gala', hasConflict: false },
];

export default function CalendarPage() {
  const [venues, setVenues] = useState([]);
  const [slots, setSlots] = useState([]);
  const [conflicts, setConflicts] = useState([]);
  const [selectedDay, setSelectedDay] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchSchedule = async () => {
    try {
      setLoading(true);
      const res = await api.get('/calendar');
      setVenues(res.data.venues || []);
      setSlots(res.data.slots || []);
      setConflicts(res.data.conflicts || []);
    } catch (err) {
      console.error('Failed to load schedule:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSchedule();
  }, []);

  const daySlots = slots.filter(s => s.day_index === selectedDay);

  return (
    <div className="fc-schedule-page">
      {/* Page Header */}
      <div className="fc-page-header">
        <div>
          <h1 className="fc-page-title">Festival Schedule</h1>
          <p className="fc-page-subtitle">
            4 days · 3 venues · 6 official screening slots
          </p>
        </div>
      </div>

      {/* Subtabs: Days */}
      <div className="fc-subtabs">
        {DAYS.map((day) => (
          <button
            key={day.index}
            className={`fc-subtab ${selectedDay === day.index ? 'active' : ''}`}
            onClick={() => setSelectedDay(day.index)}
          >
            {day.label}
            {day.hasConflict && (
              <span 
                style={{ 
                  display: 'inline-block', 
                  width: '7px', 
                  height: '7px', 
                  borderRadius: '50%', 
                  backgroundColor: '#dc2626', 
                  marginLeft: '6px' 
                }} 
              />
            )}
          </button>
        ))}
      </div>

      {/* Critical Conflict Alert (if on Day 1) */}
      {selectedDay === 0 && conflicts.length > 0 && (
        <div 
          style={{
            backgroundColor: '#fef2f2',
            border: '1px solid #fca5a5',
            borderRadius: '8px',
            padding: '14px 18px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px'
          }}
        >
          <span style={{ fontSize: '1.25rem' }}>⚠️</span>
          <div>
            <div style={{ fontWeight: 700, color: '#991b1b', fontSize: '0.875rem' }}>
              CRITICAL LOGISTICS CONFLICT DETECTED
            </div>
            <div style={{ color: '#7f1d1d', fontSize: '0.8125rem', marginTop: '2px' }}>
              Director <strong>Deepa Rao</strong> arrives at 19:00 (Flight AI 302), but her film <strong>"The Long Walk"</strong> is scheduled at 17:30 in Main Auditorium.
            </div>
            <div style={{ marginTop: '8px' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#b91c1c', background: '#fee2e2', padding: '2px 8px', borderRadius: '4px' }}>
                Action Required: Reschedule slot to 20:00 or shift to Day 2
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Venue Slots Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
        {venues.map((venue) => {
          const venueSlots = daySlots.filter(s => s.venue_name === venue.name);

          return (
            <div key={venue.id} className="fc-card" style={{ padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '1px solid var(--fc-border-subtle)', paddingBottom: '10px' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#1a1a1a' }}>{venue.name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--fc-text-muted)' }}>Capacity: {venue.capacity} seats</div>
                </div>
                <span className="fc-badge fc-badge-subtle">{venueSlots.length} slots</span>
              </div>

              {venueSlots.length === 0 ? (
                <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--fc-text-muted)', fontSize: '0.8rem' }}>
                  No screenings scheduled for this venue.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {venueSlots.map((slot) => {
                    const isConflicted = conflicts.some(c => c.slotId === slot.id);

                    return (
                      <div 
                        key={slot.id}
                        style={{
                          backgroundColor: isConflicted ? '#fff5f5' : 'var(--fc-surface)',
                          border: `1px solid ${isConflicted ? '#fca5a5' : 'var(--fc-border)'}`,
                          borderRadius: '8px',
                          padding: '12px'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: isConflicted ? '#b91c1c' : 'var(--fc-text-muted)', fontWeight: 600 }}>
                          <span>{slot.start_time?.slice(0, 5)} - {slot.end_time?.slice(0, 5)}</span>
                          {isConflicted && <span>⚠️ Conflict</span>}
                        </div>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1a1a1a', marginTop: '4px' }}>
                          {slot.film_title}
                        </div>
                        <div style={{ fontSize: '0.775rem', color: 'var(--fc-text-secondary)', marginTop: '2px' }}>
                          Dir. {slot.film_director} · {slot.film_runtime}m
                        </div>
                        <div style={{ marginTop: '8px' }}>
                          <span className="fc-dept-tag">{slot.film_category}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
