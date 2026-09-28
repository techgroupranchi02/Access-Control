/**
 * DashboardPage Component
 * Freecomers Control Tower Overview:
 * - Key metric counters (23 Submissions, 16 Members, 14 Tasks, 4 Days)
 * - Logistics & Schedule Alert widget (Day 1 Director Deepa Rao arrival conflict)
 * - Quick action launchpad
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import api from '../services/api';

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    submissions: 23,
    members: 16,
    tasks: 14,
    unassignedTasks: 3,
    guests: 4,
    slots: 6
  });

  useEffect(() => {
    async function loadStats() {
      try {
        const [subRes, teamRes, taskRes] = await Promise.all([
          api.get('/submissions'),
          api.get('/team'),
          api.get('/tasks')
        ]);
        setStats({
          submissions: subRes.data.total || 23,
          members: teamRes.data.totalCount || 16,
          tasks: taskRes.data.totalCount || 14,
          unassignedTasks: taskRes.data.metrics?.unassignedTasks || 3,
          guests: 4,
          slots: 6
        });
      } catch (e) {
        // use canonical fallback
      }
    }
    loadStats();
  }, []);

  return (
    <div className="fc-dashboard-page">
      {/* Header */}
      <div className="fc-page-header">
        <div>
          <h1 className="fc-page-title">Control Tower Dashboard</h1>
          <p className="fc-page-subtitle">
            Indie Film Festival Bangalore · Edition 4 · 2026 Live Operations
          </p>
        </div>
      </div>

      {/* Critical Alert Widget */}
      <div 
        style={{
          backgroundColor: '#fef2f2',
          border: '1px solid #fca5a5',
          borderRadius: '10px',
          padding: '16px 20px',
          marginBottom: '24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '14px'
        }}
      >
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <span style={{ fontSize: '1.5rem' }}>⚠️</span>
          <div>
            <div style={{ fontWeight: 800, color: '#991b1b', fontSize: '0.9rem' }}>
              Action Required: 1 Logistics Conflict on Day 1
            </div>
            <div style={{ color: '#7f1d1d', fontSize: '0.8rem', marginTop: '2px' }}>
              Director Deepa Rao flight arrival at 19:00 conflicts with "The Long Walk" 17:30 Main Auditorium screening.
            </div>
          </div>
        </div>
        <button 
          className="fc-btn-primary" 
          style={{ backgroundColor: '#dc2626' }}
          onClick={() => navigate('/calendar')}
        >
          View Schedule Timetable
        </button>
      </div>

      {/* Metric Stat Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        {/* Submissions */}
        <div className="fc-card" style={{ padding: '18px', cursor: 'pointer' }} onClick={() => navigate('/submissions')}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--fc-text-muted)', textTransform: 'uppercase' }}>
              Submissions Intake
            </span>
            <span className="fc-badge fc-badge-blue">23</span>
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: '#1a1a1a', marginTop: '6px' }}>
            {stats.submissions}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#16a34a', fontWeight: 600, marginTop: '4px' }}>
            8 in Official Selection
          </div>
        </div>

        {/* Team Members */}
        <div className="fc-card" style={{ padding: '18px', cursor: 'pointer' }} onClick={() => navigate('/team')}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--fc-text-muted)', textTransform: 'uppercase' }}>
              Team & Staff
            </span>
            <span className="fc-badge fc-badge-burgundy">3</span>
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: '#1a1a1a', marginTop: '6px' }}>
            {stats.members}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--fc-text-muted)', marginTop: '4px' }}>
            16 of 25 seats utilized
          </div>
        </div>

        {/* Operational Tasks */}
        <div className="fc-card" style={{ padding: '18px', cursor: 'pointer' }} onClick={() => navigate('/tasks')}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--fc-text-muted)', textTransform: 'uppercase' }}>
              Operational Tasks
            </span>
            <span className="fc-badge fc-badge-amber">{stats.unassignedTasks} unassigned</span>
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: '#1a1a1a', marginTop: '6px' }}>
            {stats.tasks}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#ea580c', fontWeight: 600, marginTop: '4px' }}>
            Across 3 groups
          </div>
        </div>

        {/* VIP Guests */}
        <div className="fc-card" style={{ padding: '18px', cursor: 'pointer' }} onClick={() => navigate('/guests')}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--fc-text-muted)', textTransform: 'uppercase' }}>
              VIP Guests
            </span>
            <span className="fc-badge fc-badge-red">1</span>
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: '#1a1a1a', marginTop: '6px' }}>
            {stats.guests}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--fc-text-muted)', marginTop: '4px' }}>
            Airport escorts assigned
          </div>
        </div>
      </div>

      {/* Quick Launchpad Grid */}
      <div className="fc-card" style={{ padding: '20px' }}>
        <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '14px' }}>
          Operations Launchpad
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
          {[
            { label: 'Review Dashboard', path: '/reviews', desc: 'Screening evaluations & scoring' },
            { label: 'Schedule Timetable', path: '/calendar', desc: 'Screening slots & venues' },
            { label: 'Team Management', path: '/team', desc: 'Staff, juries & volunteers' },
            { label: 'Communications', path: '/chat', desc: 'Role-scoped messaging' },
            { label: 'Sponsors & Funding', path: '/sponsors', desc: 'Deliverables & contracts' },
            { label: 'Edition Settings', path: '/settings', desc: 'Governance & permissions' },
          ].map((item) => (
            <div
              key={item.label}
              onClick={() => navigate(item.path)}
              style={{
                backgroundColor: 'var(--fc-surface)',
                border: '1px solid var(--fc-border)',
                borderRadius: '8px',
                padding: '12px',
                cursor: 'pointer',
                transition: 'all 0.12s ease'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--fc-brand)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--fc-border)'; }}
            >
              <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#1a1a1a' }}>{item.label}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--fc-text-muted)', marginTop: '2px' }}>{item.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
