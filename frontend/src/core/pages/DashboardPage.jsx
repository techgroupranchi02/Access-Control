/**
 * DashboardPage Component (/dashboard)
 *
 * Placeholder until the real festival overview is built. All earlier demo figures
 * (submission / team / task counts, the sample logistics alert and launchpad) were
 * hard-coded, so the page now shows a "Coming soon" state instead of fake data.
 */

import React from 'react';
import { useFestivalConfig } from '../hooks/useFestivalConfig';
import { DashboardIcon } from '../components/common/Icons';

export default function DashboardPage() {
  const { currentFestival } = useFestivalConfig() || {};

  return (
    <div className="fc-dashboard-page">
      <div className="fc-page-header">
        <div>
          <h1 className="fc-page-title">Dashboard</h1>
          {currentFestival?.name && (
            <p className="fc-page-subtitle">{currentFestival.name}</p>
          )}
        </div>
      </div>

      <div
        className="fc-card"
        style={{
          background: 'var(--fc-surface-card)',
          border: '1px solid var(--fc-border)',
          borderRadius: '14px',
          boxShadow: 'var(--shadow-sm)',
          padding: '72px 24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          gap: '10px'
        }}
      >
        <span
          style={{
            width: '56px',
            height: '56px',
            borderRadius: '14px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--fc-brand-active-bg)',
            color: 'var(--fc-brand-text)',
            marginBottom: '6px'
          }}
        >
          <DashboardIcon size={26} />
        </span>
        <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--fc-text-main)' }}>
          Coming soon
        </h2>
        <p style={{ margin: 0, maxWidth: '420px', fontSize: '0.9rem', lineHeight: 1.5, color: 'var(--fc-text-muted)' }}>
          A live overview of your festival is on its way. Until then, use the sidebar to go to Submissions, Audience, Payouts and Team.
        </p>
      </div>
    </div>
  );
}
