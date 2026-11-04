/**
 * RegistrationHeader — shared header for the Registration sub-module.
 *
 * Breadcrumb, page title, and two route-backed tabs:
 *   On Spot Registration → /registration/add
 *   Assign QR            → /registration/assign-qr (also /assign-qr/:id and ?code=)
 * Each tab keeps its own URL, so deep links from the Audience list and Bulk QR stock keep working.
 */
import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AddIcon, QrCodeScannerIcon } from '../common/Icons';

const TABS = [
  { key: 'spot', label: 'On Spot Registration', to: '/registration/add', Icon: AddIcon },
  { key: 'assign', label: 'Assign QR', to: '/registration/assign-qr', Icon: QrCodeScannerIcon }
];

export default function RegistrationHeader({ active, extraCrumb = null }) {
  const navigate = useNavigate();
  const activeTab = TABS.find(t => t.key === active) || TABS[0];

  return (
    <>
      {/* Breadcrumbs */}
      <nav aria-label="Breadcrumb" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', fontSize: '13px', color: 'var(--fc-text-secondary)', marginBottom: '16px' }}>
        <Link to="/audience" style={{ color: 'var(--fc-text-secondary)', textDecoration: 'none' }}>Audience</Link>
        <span>/</span>
        <span style={{ color: extraCrumb ? 'var(--fc-text-secondary)' : 'var(--fc-brand-text)', fontWeight: extraCrumb ? 500 : 700 }}>
          Registration · {activeTab.label}
        </span>
        {extraCrumb && (
          <>
            <span>/</span>
            <span style={{ color: 'var(--fc-text-main)', fontWeight: 600 }}>{extraCrumb}</span>
          </>
        )}
      </nav>

      {/* Title */}
      <div style={{ marginBottom: '14px' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0, color: 'var(--fc-text-main)', letterSpacing: '-0.02em' }}>
          Registration
        </h1>
        <p style={{ color: 'var(--fc-text-muted)', margin: '4px 0 0', fontSize: '0.9rem' }}>
          Register delegates at the venue desk and pair their pre-printed QR badges.
        </p>
      </div>

      {/* Tabs (same underline style as the Audience / Submissions scope tabs) */}
      <div className="fc-scope-tabs-container" style={{ marginBottom: '20px' }}>
        <div className="scope-tabs-bar" role="tablist" aria-label="Registration">
          {TABS.map(({ key, label, to, Icon }) => {
            const isActive = key === activeTab.key;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`scope-tab-btn ${isActive ? 'active' : ''}`}
                onClick={() => { if (!isActive) navigate(to); }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <Icon size={15} />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
