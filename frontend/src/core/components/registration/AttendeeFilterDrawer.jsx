import React from 'react';
import { createPortal } from 'react-dom';
import { FilterListIcon, CloseIcon, CheckCircleIcon, QrCodeScannerIcon, PeopleIcon } from '../common/Icons';
import { isDetailsPending } from '../../utils/attendeeDisplay';

export default function AttendeeFilterDrawer({
  isOpen,
  onClose,
  filters,
  onChangeFilter,
  onResetFilters,
  onApplyFilters,
  categories = [],
  attendees = [],
  activeFilterCount = 0
}) {
  // Compute unique categories with counts and colors from both attendees and categories master
  const dynamicCategories = React.useMemo(() => {
    const catMap = new Map();

    (categories || []).forEach(c => {
      const codeKey = (c.code || c.name || '').toLowerCase();
      if (codeKey) {
        catMap.set(codeKey, {
          code: c.code || codeKey,
          name: c.name || c.code || codeKey,
          color: c.badge_color || 'var(--fc-brand-text)'
        });
      }
    });

    (attendees || []).forEach(a => {
      const raw = a.delegate_category || a.badge_ribbon;
      if (raw) {
        const key = raw.toLowerCase();
        if (!catMap.has(key)) {
          catMap.set(key, {
            code: raw,
            name: a.badge_ribbon || raw.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
            color: a.badge_color || 'var(--fc-brand-text)'
          });
        }
      }
    });

    return Array.from(catMap.values());
  }, [categories, attendees]);

  // Unique pass types from attendees
  const passTypeOptions = React.useMemo(() => {
    const set = new Set();
    (attendees || []).forEach(a => {
      if (a.pass_type) set.add(a.pass_type);
    });
    if (set.size === 0) {
      set.add('Full-Festival Pass');
      set.add('Day Pass');
    }
    return Array.from(set);
  }, [attendees]);

  // Hooks above must run on every render; bail out only after them
  if (!isOpen) return null;

  // Counts for statuses
  const pendingCount = attendees.filter(a => !a.qr_token && a.status !== 'badge_issued').length;
  const issuedCount = attendees.filter(a => Boolean(a.qr_token || a.status === 'badge_issued')).length;
  const detailsPendingCount = attendees.filter(isDetailsPending).length;
  const checkedInCount = attendees.filter(a => (Number(a.screenings_attended) || 0) > 0).length;
  const notCheckedInCount = attendees.length - checkedInCount;

  return createPortal(
    <div className="fc-drawer-backdrop" onClick={onClose} style={{ zIndex: 1100 }}>
      <div
        className="fc-drawer-panel animate-slide-left"
        onClick={(e) => e.stopPropagation()}
        style={{ width: '420px', display: 'flex', flexDirection: 'column' }}
      >
        {/* Header */}
        <div
          className="fc-drawer-header"
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid var(--fc-border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start'
          }}
        >
          <div className="fc-drawer-title-area">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h2
                className="fc-drawer-title"
                style={{ fontSize: '1.2rem', margin: 0, display: 'inline-flex', alignItems: 'center', gap: '8px' }}
              >
                <FilterListIcon size={18} /> Filters
              </h2>
              {activeFilterCount > 0 && (
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    background: 'rgba(168, 47, 47, 0.1)',
                    color: 'var(--fc-brand-text)',
                    padding: '2px 8px',
                    borderRadius: '999px',
                    border: '1px solid rgba(168, 47, 47, 0.25)'
                  }}
                >
                  {activeFilterCount} active
                </span>
              )}
            </div>
            <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--fc-text-secondary)' }}>
              Filter delegates by badge status, category, pass type, gate check-in & sort order.
            </p>
          </div>
          <button
            type="button"
            className="fc-drawer-close-btn"
            onClick={onClose}
            title="Close filters"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--fc-text-muted)',
              display: 'flex',
              alignItems: 'center',
              padding: '4px'
            }}
          >
            <CloseIcon size={16} />
          </button>
        </div>

        {/* Scrollable Body */}
        <div
          className="fc-drawer-body"
          style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '22px' }}
        >
          {/* 1. Venue Badge & Arrival Status */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 700,
                color: 'var(--fc-text-main)',
                marginBottom: '8px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}
            >
              Venue Badge & Arrival Status
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }}>
              {[
                { id: 'all', label: 'All Delegates', count: attendees.length },
                { id: 'pending', label: 'Pending Venue Arrival (Need Badge)', count: pendingCount },
                { id: 'issued', label: 'QR Badge Issued (Verified)', count: issuedCount },
                { id: 'details_pending', label: 'Details Pending (mobile only, paper form to enter)', count: detailsPendingCount }
              ].map(opt => {
                const isSelected = (filters.status || 'all') === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onChangeFilter('status', opt.id)}
                    style={{
                      padding: '9px 12px',
                      borderRadius: '8px',
                      fontSize: '12.5px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      border: '1px solid',
                      textAlign: 'left',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      background: isSelected ? 'rgba(168, 47, 47, 0.08)' : 'var(--fc-surface-card)',
                      borderColor: isSelected ? 'var(--fc-brand)' : 'var(--fc-border)',
                      color: isSelected ? 'var(--fc-brand-text)' : 'var(--fc-text-main)'
                    }}
                  >
                    <span>{opt.label}</span>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: '1px 7px',
                        borderRadius: '999px',
                        background: isSelected ? 'var(--fc-brand)' : 'var(--fc-surface)',
                        color: isSelected ? '#fff' : 'var(--fc-text-muted)',
                        border: '1px solid var(--fc-border)'
                      }}
                    >
                      {opt.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Delegate Category */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 700,
                color: 'var(--fc-text-main)',
                marginBottom: '8px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}
            >
              Delegate Category
            </label>
            <select
              className="fc-select"
              value={filters.category || 'all'}
              onChange={(e) => onChangeFilter('category', e.target.value)}
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '8px',
                border: '1px solid var(--fc-border)',
                background: 'var(--fc-surface-card)',
                color: 'var(--fc-text-main)',
                fontSize: '13px'
              }}
            >
              <option value="all">All Categories ({attendees.length})</option>
              {dynamicCategories.map(cat => {
                const count = attendees.filter(a => {
                  const cCode = (a.delegate_category || '').toLowerCase();
                  const cRibbon = (a.badge_ribbon || '').toLowerCase();
                  const target = cat.code.toLowerCase();
                  return cCode === target || cRibbon === target;
                }).length;
                return (
                  <option key={cat.code} value={cat.code}>
                    {cat.name} ({count})
                  </option>
                );
              })}
            </select>
          </div>

          {/* 3. Pass Type */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 700,
                color: 'var(--fc-text-main)',
                marginBottom: '8px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}
            >
              Pass Type
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              <button
                type="button"
                onClick={() => onChangeFilter('passType', 'all')}
                style={{
                  padding: '7px 12px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: '1px solid',
                  background: (filters.passType || 'all') === 'all' ? 'rgba(168, 47, 47, 0.08)' : 'var(--fc-surface-card)',
                  borderColor: (filters.passType || 'all') === 'all' ? 'var(--fc-brand)' : 'var(--fc-border)',
                  color: (filters.passType || 'all') === 'all' ? 'var(--fc-brand-text)' : 'var(--fc-text-main)'
                }}
              >
                All Passes
              </button>
              {passTypeOptions.map(pType => {
                const isSelected = filters.passType === pType;
                const count = attendees.filter(a => (a.pass_type || '').toLowerCase() === pType.toLowerCase()).length;
                return (
                  <button
                    key={pType}
                    type="button"
                    onClick={() => onChangeFilter('passType', pType)}
                    style={{
                      padding: '7px 12px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      border: '1px solid',
                      background: isSelected ? 'rgba(168, 47, 47, 0.08)' : 'var(--fc-surface-card)',
                      borderColor: isSelected ? 'var(--fc-brand)' : 'var(--fc-border)',
                      color: isSelected ? 'var(--fc-brand-text)' : 'var(--fc-text-main)'
                    }}
                  >
                    {pType} ({count})
                  </button>
                );
              })}
            </div>
          </div>

          {/* 4. Gate / Venue Hall Attendance */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 700,
                color: 'var(--fc-text-main)',
                marginBottom: '8px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}
            >
              Auditorium Entrance & Check-In
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {[
                { id: 'all', label: 'All', count: attendees.length },
                { id: 'checked_in', label: 'Checked In', count: checkedInCount },
                { id: 'not_checked_in', label: 'Not Checked In', count: notCheckedInCount }
              ].map(opt => {
                const isSelected = (filters.attendance || 'all') === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onChangeFilter('attendance', opt.id)}
                    style={{
                      padding: '8px 10px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      border: '1px solid',
                      textAlign: 'left',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      background: isSelected ? 'rgba(168, 47, 47, 0.08)' : 'var(--fc-surface-card)',
                      borderColor: isSelected ? 'var(--fc-brand)' : 'var(--fc-border)',
                      color: isSelected ? 'var(--fc-brand-text)' : 'var(--fc-text-main)'
                    }}
                  >
                    <span>{opt.label}</span>
                    <span style={{ fontSize: '11px', opacity: 0.8 }}>({opt.count})</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 5. Sort By */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 700,
                color: 'var(--fc-text-main)',
                marginBottom: '8px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}
            >
              Sort Order
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {[
                { id: 'newest', label: 'Newest First' },
                { id: 'oldest', label: 'Oldest First' },
                { id: 'name_asc', label: 'Name (A – Z)' },
                { id: 'serial_asc', label: 'Badge # (Ascending)' }
              ].map(opt => {
                const isSelected = (filters.sortBy || 'newest') === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onChangeFilter('sortBy', opt.id)}
                    style={{
                      padding: '8px 10px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      border: '1px solid',
                      textAlign: 'left',
                      background: isSelected ? 'rgba(168, 47, 47, 0.08)' : 'var(--fc-surface-card)',
                      borderColor: isSelected ? 'var(--fc-brand)' : 'var(--fc-border)',
                      color: isSelected ? 'var(--fc-brand-text)' : 'var(--fc-text-main)'
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid var(--fc-border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'var(--fc-surface)'
          }}
        >
          <button
            type="button"
            className="fc-btn fc-btn-secondary fc-btn-sm"
            onClick={onResetFilters}
            disabled={activeFilterCount === 0}
            style={{ fontWeight: 600, opacity: activeFilterCount === 0 ? 0.5 : 1 }}
          >
            Reset All
          </button>
          <button
            type="button"
            onClick={() => {
              onApplyFilters?.();
              onClose();
            }}
            style={{
              background: 'var(--fc-brand)',
              color: '#ffffff',
              border: 'none',
              padding: '9px 22px',
              borderRadius: '8px',
              fontWeight: 700,
              fontSize: '0.88rem',
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(168, 47, 47, 0.3)'
            }}
          >
            Apply Filters {activeFilterCount > 0 ? `(${activeFilterCount})` : ''}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

