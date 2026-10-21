import React from 'react';
import { createPortal } from 'react-dom';
import { FilterListIcon, CloseIcon, StarIcon, PeopleIcon, ScheduleIcon } from '../common/Icons';

export default function FilterDrawer({
  isOpen,
  onClose,
  categories = [],
  flags = [],
  countries = [],
  filters,
  onChangeFilter,
  onResetFilters,
  onApplyFilters,
  activeFilterCount = 0
}) {
  if (!isOpen) return null;

  return createPortal(
    <div className="fc-drawer-backdrop" onClick={onClose} style={{ zIndex: 1100 }}>
      <div 
        className="fc-drawer-panel animate-slide-left" 
        onClick={(e) => e.stopPropagation()}
        style={{ width: '420px', display: 'flex', flexDirection: 'column' }}
      >
        {/* Header */}
        <div className="fc-drawer-header" style={{ padding: '18px 24px', borderBottom: '1px solid var(--fc-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div className="fc-drawer-title-area">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h2 className="fc-drawer-title" style={{ fontSize: '1.2rem', margin: 0, display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <FilterListIcon size={18} /> Filters
              </h2>
              {activeFilterCount > 0 && (
                <span style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  background: 'var(--fc-brand-tint)',
                  color: 'var(--fc-brand)',
                  padding: '2px 8px',
                  borderRadius: '999px',
                  border: '1px solid var(--fc-brand-border)'
                }}>
                  {activeFilterCount} active
                </span>
              )}
            </div>
            <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--fc-text-secondary)' }}>
              Filter films by score, jury assignment, category, country & runtime.
            </p>
          </div>
          <button 
            type="button" 
            className="fc-drawer-close-btn" 
            onClick={onClose} 
            title="Close filters"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fc-text-muted)', display: 'flex', alignItems: 'center', padding: '4px' }}
          >
            <CloseIcon size={16} />
          </button>
        </div>

        {/* Scrollable Filter Body */}
        <div className="fc-drawer-body" style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '22px' }}>
          
          {/* 1. Category */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--fc-text-main)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Film Category
            </label>
            <select
              className="fc-select"
              value={filters.category || 'all'}
              onChange={(e) => onChangeFilter('category', e.target.value)}
              style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--fc-border)', background: 'var(--fc-surface-card)', fontSize: '13px' }}
            >
              <option value="all">All Categories</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          {/* 2. Flag */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--fc-text-main)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Flag & Priority
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              <button
                type="button"
                onClick={() => onChangeFilter('flag_id', 'all')}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: '1px solid',
                  background: filters.flag_id === 'all' ? 'var(--fc-brand-tint)' : 'var(--fc-surface-card)',
                  borderColor: filters.flag_id === 'all' ? 'var(--fc-brand)' : 'var(--fc-border)',
                  color: filters.flag_id === 'all' ? 'var(--fc-brand)' : 'var(--fc-text-main)'
                }}
              >
                All Flags
              </button>
              {flags
                .filter((f) => {
                  const isActive = f.is_active === 1 || f.is_active === true || f.is_active === '1' || f.is_active === undefined;
                  return isActive || String(filters.flag_id) === String(f.id);
                })
                .map((f) => {
                  const isSelected = String(filters.flag_id) === String(f.id);
                  const isActive = f.is_active === 1 || f.is_active === true || f.is_active === '1' || f.is_active === undefined;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => onChangeFilter('flag_id', isSelected ? 'all' : f.id)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        border: '1px solid',
                        opacity: isActive ? 1 : 0.6,
                        background: isSelected ? 'rgba(0,0,0,0.06)' : 'var(--fc-surface-card)',
                        borderColor: isSelected ? f.color : 'var(--fc-border)',
                        color: isSelected ? f.color : 'var(--fc-text-main)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: f.color }}></span>
                      {f.label}{!isActive ? ' (Inactive)' : ''}
                    </button>
                  );
                })}
            </div>
          </div>

          {/* 3. Rating & Score */}
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: 'var(--fc-text-main)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              <StarIcon size={14} /> Rating & Evaluation
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {[
                { id: 'all', label: 'All Scores' },
                { id: 'high', label: '≥ 4.0 ★ (High)' },
                { id: 'mid', label: '3.0 – 3.9 ★ (Mid)' },
                { id: 'low', label: '< 3.0 ★ (Cutoff)' },
                { id: 'unrated', label: 'Unrated / Pending' },
              ].map((opt) => {
                const isSelected = (filters.score_range || 'all') === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onChangeFilter('score_range', opt.id)}
                    style={{
                      padding: '8px 10px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 600,
                      textAlign: 'left',
                      cursor: 'pointer',
                      border: '1px solid',
                      background: isSelected ? 'var(--fc-brand-tint)' : 'var(--fc-surface-card)',
                      borderColor: isSelected ? 'var(--fc-brand)' : 'var(--fc-border)',
                      color: isSelected ? 'var(--fc-brand)' : 'var(--fc-text-main)'
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 4. Jury Assignment Status */}
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: 'var(--fc-text-main)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              <PeopleIcon size={14} /> Jury Assignment Status
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {[
                { id: 'all', label: 'All Statuses', desc: 'Show all films regardless of jury assignment' },
                { id: 'unassigned', label: 'Unassigned', desc: 'Films needing reviewers assigned' },
                { id: 'assigned', label: 'Assigned to Jury', desc: 'Has active jury members assigned' },
                { id: 'completed', label: 'Review Completed', desc: 'Has official submitted scorecard' },
              ].map((opt) => {
                const isSelected = (filters.assignment_status || 'all') === opt.id;
                return (
                  <label
                    key={opt.id}
                    onClick={() => onChangeFilter('assignment_status', opt.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid',
                      borderColor: isSelected ? 'var(--fc-brand-border)' : 'var(--fc-border)',
                      background: isSelected ? 'var(--fc-brand-tint)' : 'var(--fc-surface-card)',
                      cursor: 'pointer',
                      transition: 'all 0.12s ease'
                    }}
                  >
                    <input
                      type="radio"
                      name="assignment_status_filter"
                      checked={isSelected}
                      onChange={() => {}}
                      style={{ accentColor: 'var(--fc-brand)', cursor: 'pointer' }}
                    />
                    <div>
                      <div style={{ fontSize: '12.5px', fontWeight: 600, color: isSelected ? 'var(--fc-brand)' : 'var(--fc-text-main)' }}>
                        {opt.label}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--fc-text-muted)' }}>
                        {opt.desc}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* 5. Country of Origin */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--fc-text-main)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Country of Origin
            </label>
            <select
              className="fc-select"
              value={filters.country || 'all'}
              onChange={(e) => onChangeFilter('country', e.target.value)}
              style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--fc-border)', background: 'var(--fc-surface-card)', fontSize: '13px' }}
            >
              <option value="all">All Countries</option>
              {countries.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* 6. Runtime / Duration */}
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: 'var(--fc-text-main)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              <ScheduleIcon size={14} /> Runtime / Length
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {[
                { id: 'all', label: 'Any Runtime' },
                { id: 'short', label: '< 15 mins (Short)' },
                { id: 'medium', label: '15 – 45 mins (Mid)' },
                { id: 'feature', label: '> 45 mins (Feature)' },
              ].map((opt) => {
                const isSelected = (filters.runtime_range || 'all') === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onChangeFilter('runtime_range', opt.id)}
                    style={{
                      padding: '8px 10px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 600,
                      textAlign: 'left',
                      cursor: 'pointer',
                      border: '1px solid',
                      background: isSelected ? 'var(--fc-brand-tint)' : 'var(--fc-surface-card)',
                      borderColor: isSelected ? 'var(--fc-brand)' : 'var(--fc-border)',
                      color: isSelected ? 'var(--fc-brand)' : 'var(--fc-text-main)'
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

        </div>

        {/* Footer Actions */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--fc-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--fc-surface)' }}>
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
            className="fc-btn fc-btn-primary fc-btn-sm"
            onClick={() => {
              onApplyFilters?.();
              onClose();
            }}
            style={{ fontWeight: 700, padding: '8px 20px' }}
          >
            Apply Filters {activeFilterCount > 0 ? `(${activeFilterCount})` : ''}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
