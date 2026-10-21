/**
 * ActivityLogBoard Component — Submissions Hub Audit & Activity Log
 *
 * Implements:
 * - Admin view: Cross-group activity audit log (all actions, jury evaluations, stage advancements, winners, assignments).
 * - Jury view: Strict personal activity log (evaluations, scores, and personal submissions).
 * - Full date and time formatting (e.g. "Oct 17, 2026, 03:06 PM" + relative time).
 * - Advanced filters: Action type, Actor group (Admin vs Jury for admins), Date range, and live Search.
 * - Admin CSV Export: One-click immutable audit trail download.
 * - Interactive film click: Opens FilmDetailDrawer for rich film metadata inspection.
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import api from '../../services/api';
import {
  SearchIcon,
  FileDownloadIcon,
  ScheduleIcon,
  LockIcon,
  CheckCircleIcon,
  CloseIcon
} from '../common/Icons';

export function StreamViewIcon({ size = 15, className = '', style = {} }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={{ flexShrink: 0, ...style }}>
      <line x1="8" y1="6" x2="21" y2="6"></line>
      <line x1="8" y1="12" x2="21" y2="12"></line>
      <line x1="8" y1="18" x2="21" y2="18"></line>
      <circle cx="4" cy="6" r="1.5" fill="currentColor"></circle>
      <circle cx="4" cy="12" r="1.5" fill="currentColor"></circle>
      <circle cx="4" cy="18" r="1.5" fill="currentColor"></circle>
    </svg>
  );
}

export function TableViewIcon({ size = 15, className = '', style = {} }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={{ flexShrink: 0, ...style }}>
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
      <line x1="3" y1="9" x2="21" y2="9"></line>
      <line x1="3" y1="15" x2="21" y2="15"></line>
      <line x1="9" y1="3" x2="9" y2="21"></line>
    </svg>
  );
}

export function SystemGearIcon({ size = 18, className = '', style = {} }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={{ flexShrink: 0, ...style }}>
      <circle cx="12" cy="12" r="3"></circle>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
    </svg>
  );
}

export const ACTION_CONFIG = {
  STAGE_ADVANCE: {
    label: 'Stage Advanced',
    color: '#818cf8',
    bg: 'rgba(99, 102, 241, 0.12)',
    border: 'rgba(99, 102, 241, 0.28)',
    icon: '🚀'
  },
  STAGE_CHANGE: {
    label: 'Stage Changed',
    color: '#a78bfa',
    bg: 'rgba(167, 139, 250, 0.12)',
    border: 'rgba(167, 139, 250, 0.28)',
    icon: '🔄'
  },
  AUTO_ADVANCE: {
    label: 'Auto Promoted',
    color: '#38bdf8',
    bg: 'rgba(56, 189, 248, 0.12)',
    border: 'rgba(56, 189, 248, 0.28)',
    icon: '⚡'
  },
  WINNER_SELECTED: {
    label: 'Winner Declared',
    color: '#f59e0b',
    bg: 'rgba(245, 158, 11, 0.12)',
    border: 'rgba(245, 158, 11, 0.35)',
    icon: '🏆'
  },
  WINNER_REVOKED: {
    label: 'Winner Revoked',
    color: '#ef4444',
    bg: 'rgba(239, 68, 68, 0.12)',
    border: 'rgba(239, 68, 68, 0.28)',
    icon: '↩️'
  },
  REVIEW_SUBMITTED: {
    label: 'Scorecard Submitted',
    color: '#10b981',
    bg: 'rgba(16, 185, 129, 0.12)',
    border: 'rgba(16, 185, 129, 0.28)',
    icon: '⭐'
  },
  JURY_ASSIGNED: {
    label: 'Jury Assigned',
    color: '#3b82f6',
    bg: 'rgba(59, 130, 246, 0.12)',
    border: 'rgba(59, 130, 246, 0.28)',
    icon: '👤'
  },
  JURY_REMOVED: {
    label: 'Jury Removed',
    color: '#94a3b8',
    bg: 'rgba(148, 163, 184, 0.12)',
    border: 'rgba(148, 163, 184, 0.28)',
    icon: '✖️'
  },
  DECISION: {
    label: 'Pipeline Decision',
    color: '#f43f5e',
    bg: 'rgba(244, 63, 94, 0.12)',
    border: 'rgba(244, 63, 94, 0.28)',
    icon: '⚖️'
  },
  FLAG_UPDATE: {
    label: 'Flag Updated',
    color: '#eab308',
    bg: 'rgba(234, 179, 8, 0.12)',
    border: 'rgba(234, 179, 8, 0.28)',
    icon: '🚩'
  },
  CATEGORY_UPDATE: {
    label: 'Category Updated',
    color: '#06b6d4',
    bg: 'rgba(6, 182, 212, 0.12)',
    border: 'rgba(6, 182, 212, 0.28)',
    icon: '🏷️'
  },
  STATUS_UPDATE: {
    label: 'Status Updated',
    color: '#cbd5e1',
    bg: 'rgba(203, 213, 225, 0.12)',
    border: 'rgba(203, 213, 225, 0.28)',
    icon: '📝'
  },
  DEFAULT: {
    label: 'Activity',
    color: '#94a3b8',
    bg: 'rgba(148, 163, 184, 0.12)',
    border: 'rgba(148, 163, 184, 0.28)',
    icon: '📌'
  }
};

export const formatDateTime = (timestamp) => {
  if (!timestamp) return { dateStr: '—', timeStr: '', relativeStr: '' };
  const d = new Date(timestamp);
  if (isNaN(d.getTime())) return { dateStr: String(timestamp), timeStr: '', relativeStr: '' };

  const dateStr = d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });

  const timeStr = d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });

  const now = new Date();
  const diffSec = Math.floor((now.getTime() - d.getTime()) / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  let relativeStr = '';
  if (diffSec < 45) {
    relativeStr = 'Just now';
  } else if (diffMin < 60) {
    relativeStr = `${diffMin}m ago`;
  } else if (diffHour < 24) {
    relativeStr = `${diffHour}h ago`;
  } else if (diffDay < 7) {
    relativeStr = `${diffDay}d ago`;
  } else {
    relativeStr = dateStr;
  }

  return { dateStr, timeStr, relativeStr, fullFormatted: `${dateStr} at ${timeStr}` };
};

export const getActivitySentence = (log, onViewFilm) => {
  const filmTitle = log.film_title || (log.submission_id ? `Film #${log.submission_id}` : 'film submission');

  const filmLink = (
    <span
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        if (typeof onViewFilm === 'function' && log.submission_id) {
          onViewFilm({ id: log.submission_id, title: log.film_title });
        }
      }}
      style={{
        fontWeight: 700,
        color: 'var(--fc-brand, #a82f2f)',
        cursor: 'pointer',
        textDecoration: 'none'
      }}
      onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline'; }}
      onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none'; }}
      title={`Click to view film details for "${filmTitle}"`}
    >
      "{filmTitle}"
    </span>
  );

  switch (log.action) {
    case 'STAGE_ADVANCE':
      return (
        <span>
          advanced {filmLink} to <strong>{log.current_stage_name || 'the next stage'}</strong>
        </span>
      );
    case 'STAGE_CHANGE':
      return (
        <span>
          moved {filmLink} to <strong>{log.current_stage_name || 'stage'}</strong>
        </span>
      );
    case 'AUTO_ADVANCE':
      return (
        <span>
          auto-promoted {filmLink} to <strong>{log.current_stage_name || 'the next stage'}</strong>
        </span>
      );
    case 'WINNER_SELECTED':
      return (
        <span>
          declared {filmLink} as <strong>Official Award Winner</strong> 🏆
        </span>
      );
    case 'WINNER_REVOKED':
      return (
        <span>
          revoked winner award status for {filmLink}
        </span>
      );
    case 'REVIEW_SUBMITTED':
      return (
        <span>
          evaluated and submitted scorecard for {filmLink}
        </span>
      );
    case 'JURY_ASSIGNED':
      return (
        <span>
          assigned review jury member for {filmLink}
        </span>
      );
    case 'JURY_REMOVED':
      return (
        <span>
          removed jury assignment from {filmLink}
        </span>
      );
    case 'DECISION':
      return (
        <span>
          recorded pipeline decision for {filmLink}
        </span>
      );
    case 'FLAG_UPDATE':
      return (
        <span>
          updated evaluation flag / priority for {filmLink}
        </span>
      );
    case 'CATEGORY_UPDATE':
      return (
        <span>
          updated competition category for {filmLink}
        </span>
      );
    case 'STATUS_UPDATE':
      return (
        <span>
          updated submission status for {filmLink}
        </span>
      );
    default:
      return (
        <span>
          updated {filmLink}
        </span>
      );
  }
};

export default function ActivityLogBoard({ isJuryUser = false, onViewFilm }) {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [actionCounts, setActionCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  // Filters
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [actionFilter, setActionFilter] = useState('ALL');
  const [groupFilter, setGroupFilter] = useState('all'); // 'all' | 'admin' | 'jury'
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // View Mode Switcher: 'stream' (default) | 'table'
  const [viewMode, setViewMode] = useState(() => {
    try {
      return localStorage.getItem('fc_activity_view_mode') || 'stream';
    } catch (e) {
      return 'stream';
    }
  });

  const handleSetViewMode = (mode) => {
    setViewMode(mode);
    try {
      localStorage.setItem('fc_activity_view_mode', mode);
    } catch (e) {
      // Ignore localStorage errors
    }
  };

  // Live debounced search (250ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchTerm(searchInput.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Fetch Activity Logs
  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      const params = {
        page,
        limit
      };

      if (actionFilter !== 'ALL') params.action = actionFilter;
      if (!isJuryUser && groupFilter !== 'all') params.group = groupFilter;
      if (searchTerm) params.search = searchTerm;
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;

      const res = await api.get('/submissions/activity-logs', { params });
      if (res.data?.success) {
        setLogs(res.data.logs || []);
        setTotal(res.data.total || 0);
        setTotalPages(res.data.totalPages || 1);
        setActionCounts(res.data.actionCounts || {});
      }
    } catch (err) {
      console.error('Failed to load activity logs:', err);
    } finally {
      setLoading(false);
    }
  }, [page, limit, actionFilter, groupFilter, searchTerm, startDate, endDate, isJuryUser]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // CSV Export Handler (Admin Only)
  const handleExportCsv = async () => {
    if (isJuryUser) return;
    try {
      setExporting(true);
      const params = {};
      if (actionFilter !== 'ALL') params.action = actionFilter;
      if (groupFilter !== 'all') params.group = groupFilter;
      if (searchTerm) params.search = searchTerm;
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;

      const res = await api.get('/submissions/activity-logs/export', {
        params,
        responseType: 'blob'
      });

      const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Festival_Activity_Audit_Log_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export activity logs CSV:', err);
      alert('Failed to export activity log CSV.');
    } finally {
      setExporting(false);
    }
  };

  const clearAllFilters = () => {
    setActionFilter('ALL');
    setGroupFilter('all');
    setSearchInput('');
    setSearchTerm('');
    setStartDate('');
    setEndDate('');
    setPage(1);
  };

  const hasActiveFilters = actionFilter !== 'ALL' || groupFilter !== 'all' || searchTerm !== '' || startDate !== '' || endDate !== '';

  // Helper to get initials
  const getInitials = (name) => {
    if (!name) return 'U';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  return (
    <div className="activity-log-board" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* ── TOP STATS & COMPLIANCE BANNER ────────────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '14px'
        }}
      >
        <div
          style={{
            background: 'var(--fc-surface)',
            border: '1px solid var(--fc-border)',
            borderRadius: '10px',
            padding: '16px 18px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
          }}
        >
          <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--fc-text-muted)', marginBottom: '6px' }}>
            {isJuryUser ? 'My Recorded Actions' : 'Total Logged Events'}
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--fc-text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>{total}</span>
            <span style={{ fontSize: '12px', fontWeight: 500, color: '#10b981', background: 'rgba(16, 185, 129, 0.12)', padding: '2px 8px', borderRadius: '12px' }}>
              Immutable
            </span>
          </div>
        </div>

        <div
          style={{
            background: 'var(--fc-surface)',
            border: '1px solid var(--fc-border)',
            borderRadius: '10px',
            padding: '16px 18px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
          }}
        >
          <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--fc-text-muted)', marginBottom: '6px' }}>
            Stage Promotions
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#818cf8' }}>
            {actionCounts['STAGE_ADVANCE'] || 0}
          </div>
        </div>

        <div
          style={{
            background: 'var(--fc-surface)',
            border: '1px solid var(--fc-border)',
            borderRadius: '10px',
            padding: '16px 18px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
          }}
        >
          <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--fc-text-muted)', marginBottom: '6px' }}>
            Awards & Winners
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#f59e0b' }}>
            {actionCounts['WINNER_SELECTED'] || 0}
          </div>
        </div>

        <div
          style={{
            background: 'var(--fc-surface)',
            border: '1px solid var(--fc-border)',
            borderRadius: '10px',
            padding: '16px 18px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--fc-text-muted)' }}>
              Audit Integrity
            </div>
            <LockIcon size={14} style={{ color: '#10b981' }} />
          </div>
          <div style={{ fontSize: '12px', color: 'var(--fc-text-secondary)', marginTop: '8px', lineHeight: 1.4 }}>
            {isJuryUser
              ? 'Personal evaluator audit trail. Visible exclusively to you.'
              : 'Permanent, tamper-proof festival governance audit log.'}
          </div>
        </div>
      </div>

      {/* ── FILTER TOOLBAR ───────────────────────────────────────────────────────── */}
      <div
        style={{
          background: 'var(--fc-surface)',
          border: '1px solid var(--fc-border)',
          borderRadius: '10px',
          padding: '14px 18px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          {/* Left: Search input */}
          <div style={{ position: 'relative', minWidth: '260px', flex: '1', maxWidth: '420px' }}>
            <span
              style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--fc-text-muted)',
                display: 'flex',
                alignItems: 'center',
                pointerEvents: 'none'
              }}
            >
              <SearchIcon size={16} />
            </span>
            <input
              type="text"
              className="fc-input"
              placeholder="Search by film title, actor, or activity..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              style={{ paddingLeft: '36px', height: '38px', width: '100%' }}
            />
          </div>

          {/* Right: Actions & Export Button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {/* Start Date */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '12px', color: 'var(--fc-text-muted)' }}>From:</span>
              <input
                type="date"
                className="fc-input"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setPage(1);
                }}
                style={{ height: '36px', fontSize: '13px', padding: '4px 8px' }}
              />
            </div>

            {/* End Date */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '12px', color: 'var(--fc-text-muted)' }}>To:</span>
              <input
                type="date"
                className="fc-input"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setPage(1);
                }}
                style={{ height: '36px', fontSize: '13px', padding: '4px 8px' }}
              />
            </div>

            {/* Clear Filters */}
            {hasActiveFilters && (
              <button
                type="button"
                className="fc-btn fc-btn-ghost"
                onClick={clearAllFilters}
                style={{ height: '36px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                <CloseIcon size={14} /> Clear
              </button>
            )}

            {/* View Mode Switcher Toggle */}
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                background: 'var(--fc-surface-subtle, rgba(255,255,255,0.06))',
                border: '1px solid var(--fc-border)',
                borderRadius: '8px',
                padding: '2px',
                gap: '2px',
                height: '36px'
              }}
            >
              <button
                type="button"
                onClick={() => handleSetViewMode('stream')}
                title="Timeline Stream Feed View"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '0 11px',
                  height: '30px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: viewMode === 'stream' ? 650 : 500,
                  border: 'none',
                  cursor: 'pointer',
                  background: viewMode === 'stream' ? 'var(--fc-surface, #ffffff)' : 'transparent',
                  color: viewMode === 'stream' ? 'var(--fc-brand, #a82f2f)' : 'var(--fc-text-muted, #64748b)',
                  boxShadow: viewMode === 'stream' ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
                  transition: 'all 0.15s ease'
                }}
              >
                <StreamViewIcon size={14} />
                <span>Stream</span>
              </button>
              <button
                type="button"
                onClick={() => handleSetViewMode('table')}
                title="Tabular Audit Log View"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '0 11px',
                  height: '30px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: viewMode === 'table' ? 650 : 500,
                  border: 'none',
                  cursor: 'pointer',
                  background: viewMode === 'table' ? 'var(--fc-surface, #ffffff)' : 'transparent',
                  color: viewMode === 'table' ? 'var(--fc-brand, #a82f2f)' : 'var(--fc-text-muted, #64748b)',
                  boxShadow: viewMode === 'table' ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
                  transition: 'all 0.15s ease'
                }}
              >
                <TableViewIcon size={14} />
                <span>Table</span>
              </button>
            </div>

            {/* Export CSV Button (Admin Only) */}
            {!isJuryUser && (
              <button
                type="button"
                className="fc-btn fc-btn-primary"
                onClick={handleExportCsv}
                disabled={exporting || loading || total === 0}
                style={{
                  height: '36px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontWeight: 600,
                  fontSize: '13px',
                  padding: '0 14px'
                }}
                title="Download complete immutable activity log CSV"
              >
                <FileDownloadIcon size={15} />
                <span>{exporting ? 'Exporting...' : 'Export Activity CSV'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Action Type & Group Filter Tabs */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', paddingTop: '8px', borderTop: '1px solid var(--fc-border)' }}>
          {/* Action Filter Pills */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--fc-text-muted)', marginRight: '4px' }}>
              Action:
            </span>
            <button
              type="button"
              className={`fc-btn fc-btn-sm ${actionFilter === 'ALL' ? 'fc-btn-primary' : 'fc-btn-ghost'}`}
              onClick={() => {
                setActionFilter('ALL');
                setPage(1);
              }}
              style={{ borderRadius: '16px', fontSize: '12px', padding: '3px 10px' }}
            >
              All Actions
            </button>
            <button
              type="button"
              className={`fc-btn fc-btn-sm ${actionFilter === 'STAGE_ADVANCE' ? 'fc-btn-primary' : 'fc-btn-ghost'}`}
              onClick={() => {
                setActionFilter('STAGE_ADVANCE');
                setPage(1);
              }}
              style={{ borderRadius: '16px', fontSize: '12px', padding: '3px 10px' }}
            >
              🚀 Stage Advance {actionCounts['STAGE_ADVANCE'] ? `(${actionCounts['STAGE_ADVANCE']})` : ''}
            </button>
            <button
              type="button"
              className={`fc-btn fc-btn-sm ${actionFilter === 'WINNER_SELECTED' ? 'fc-btn-primary' : 'fc-btn-ghost'}`}
              onClick={() => {
                setActionFilter('WINNER_SELECTED');
                setPage(1);
              }}
              style={{ borderRadius: '16px', fontSize: '12px', padding: '3px 10px' }}
            >
              🏆 Winners {actionCounts['WINNER_SELECTED'] ? `(${actionCounts['WINNER_SELECTED']})` : ''}
            </button>
            <button
              type="button"
              className={`fc-btn fc-btn-sm ${actionFilter === 'REVIEW_SUBMITTED' ? 'fc-btn-primary' : 'fc-btn-ghost'}`}
              onClick={() => {
                setActionFilter('REVIEW_SUBMITTED');
                setPage(1);
              }}
              style={{ borderRadius: '16px', fontSize: '12px', padding: '3px 10px' }}
            >
              ⭐ Reviews {actionCounts['REVIEW_SUBMITTED'] ? `(${actionCounts['REVIEW_SUBMITTED']})` : ''}
            </button>
            <button
              type="button"
              className={`fc-btn fc-btn-sm ${actionFilter === 'DECISION' ? 'fc-btn-primary' : 'fc-btn-ghost'}`}
              onClick={() => {
                setActionFilter('DECISION');
                setPage(1);
              }}
              style={{ borderRadius: '16px', fontSize: '12px', padding: '3px 10px' }}
            >
              ⚖️ Decisions {actionCounts['DECISION'] ? `(${actionCounts['DECISION']})` : ''}
            </button>
            <button
              type="button"
              className={`fc-btn fc-btn-sm ${actionFilter === 'JURY_ASSIGNED' ? 'fc-btn-primary' : 'fc-btn-ghost'}`}
              onClick={() => {
                setActionFilter('JURY_ASSIGNED');
                setPage(1);
              }}
              style={{ borderRadius: '16px', fontSize: '12px', padding: '3px 10px' }}
            >
              👤 Jury Assignments {actionCounts['JURY_ASSIGNED'] ? `(${actionCounts['JURY_ASSIGNED']})` : ''}
            </button>
          </div>

          {/* Group Filter (Admin Only) */}
          {!isJuryUser && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--fc-text-muted)' }}>Group:</span>
              <div
                style={{
                  display: 'flex',
                  background: 'var(--fc-surface-subtle)',
                  borderRadius: '6px',
                  padding: '2px',
                  border: '1px solid var(--fc-border)'
                }}
              >
                <button
                  type="button"
                  style={{
                    border: 'none',
                    background: groupFilter === 'all' ? 'var(--fc-surface)' : 'transparent',
                    color: groupFilter === 'all' ? 'var(--fc-text-primary)' : 'var(--fc-text-muted)',
                    fontWeight: groupFilter === 'all' ? 600 : 400,
                    fontSize: '11px',
                    padding: '3px 9px',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                  onClick={() => {
                    setGroupFilter('all');
                    setPage(1);
                  }}
                >
                  All
                </button>
                <button
                  type="button"
                  style={{
                    border: 'none',
                    background: groupFilter === 'admin' ? 'var(--fc-surface)' : 'transparent',
                    color: groupFilter === 'admin' ? '#f43f5e' : 'var(--fc-text-muted)',
                    fontWeight: groupFilter === 'admin' ? 600 : 400,
                    fontSize: '11px',
                    padding: '3px 9px',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                  onClick={() => {
                    setGroupFilter('admin');
                    setPage(1);
                  }}
                >
                  Admin Only
                </button>
                <button
                  type="button"
                  style={{
                    border: 'none',
                    background: groupFilter === 'jury' ? 'var(--fc-surface)' : 'transparent',
                    color: groupFilter === 'jury' ? '#3b82f6' : 'var(--fc-text-muted)',
                    fontWeight: groupFilter === 'jury' ? 600 : 400,
                    fontSize: '11px',
                    padding: '3px 9px',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                  onClick={() => {
                    setGroupFilter('jury');
                    setPage(1);
                  }}
                >
                  Jury Only
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── MAIN LOG CONTENT (STREAM FEED VS AUDIT TABLE) ─────────────────────────── */}
      {viewMode === 'stream' ? (
        /* ── STREAM FEED VIEW (Screenshots 1 & 2 style) ───────────────────────────── */
        <div
          className="fc-stream-container"
          style={{
            background: 'var(--fc-surface)',
            border: '1px solid var(--fc-border)',
            borderRadius: '10px',
            overflow: 'hidden',
            boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          {loading ? (
            <div style={{ padding: '54px 20px', textAlign: 'center', color: 'var(--fc-text-muted)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                <div className="spinner" style={{ width: '28px', height: '28px', borderWidth: '3px' }} />
                <span style={{ fontSize: '13px' }}>Loading activity stream...</span>
              </div>
            </div>
          ) : logs.length === 0 ? (
            <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--fc-text-muted)' }}>
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>📋</div>
              <div style={{ fontWeight: 600, fontSize: '15px', color: 'var(--fc-text-primary)' }}>No Activity Recorded</div>
              <div style={{ fontSize: '13px', maxWidth: '400px', margin: '6px auto 0' }}>
                {hasActiveFilters
                  ? 'No events match your selected filters. Try clearing some filters or searching for another term.'
                  : isJuryUser
                    ? 'You have not submitted any reviews or evaluations yet.'
                    : 'No activity logs have been recorded for this festival edition yet.'}
              </div>
              {hasActiveFilters && (
                <button
                  type="button"
                  className="fc-btn fc-btn-secondary"
                  onClick={clearAllFilters}
                  style={{ marginTop: '14px', fontSize: '12px' }}
                >
                  Clear Active Filters
                </button>
              )}
            </div>
          ) : (
            logs.map((log, idx) => {
              const cfg = ACTION_CONFIG[log.action] || ACTION_CONFIG.DEFAULT;
              const { dateStr, timeStr, relativeStr, fullFormatted } = formatDateTime(log.created_at);
              const isJuryActor = log.actor_group_key === 'jury' || log.action === 'REVIEW_SUBMITTED';
              const isSystem = !log.actor_user_id || log.actor_name === 'System';

              return (
                <div
                  key={log.id}
                  className="fc-stream-item"
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '16px',
                    padding: '18px 22px',
                    borderBottom: idx < logs.length - 1 ? '1px solid var(--fc-border)' : 'none',
                    transition: 'background 0.15s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--fc-surface-hover, rgba(255,255,255,0.025))';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  {/* Left: Avatar / System Gear */}
                  <div
                    style={{
                      width: '42px',
                      height: '42px',
                      borderRadius: '50%',
                      background: isSystem
                        ? 'var(--fc-surface-sunken, #e2e8f0)'
                        : isJuryActor
                          ? 'rgba(59, 130, 246, 0.16)'
                          : 'rgba(225, 29, 72, 0.16)',
                      color: isSystem
                        ? 'var(--fc-text-secondary, #64748b)'
                        : isJuryActor
                          ? '#3b82f6'
                          : 'var(--fc-brand, #a82f2f)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 750,
                      fontSize: '13px',
                      flexShrink: 0,
                      overflow: 'hidden',
                      position: 'relative',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.07)'
                    }}
                  >
                    {isSystem ? (
                      <SystemGearIcon size={20} />
                    ) : log.actor_thumbnail_pic ? (
                      <img
                        src={log.actor_thumbnail_pic}
                        alt={log.actor_name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          if (e.currentTarget.nextSibling) {
                            e.currentTarget.nextSibling.style.display = 'flex';
                          }
                        }}
                      />
                    ) : null}
                    {!isSystem && (
                      <span
                        style={{
                          display: log.actor_thumbnail_pic ? 'none' : 'flex',
                          width: '100%',
                          height: '100%',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        {getInitials(log.actor_name)}
                      </span>
                    )}
                  </div>

                  {/* Right: Event Story & Details */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Top row: Sentence + Timestamp */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        gap: '12px'
                      }}
                    >
                      <div style={{ fontSize: '13.5px', color: 'var(--fc-text-primary)', lineHeight: 1.55 }}>
                        <span style={{ fontWeight: 700, color: 'var(--fc-text-primary)' }}>
                          {log.actor_name || 'System'}
                        </span>
                        {!isSystem && (
                          <span
                            style={{
                              marginLeft: '6px',
                              marginRight: '6px',
                              fontSize: '10px',
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              letterSpacing: '0.04em',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              background: isJuryActor ? 'rgba(59, 130, 246, 0.12)' : 'rgba(225, 29, 72, 0.12)',
                              color: isJuryActor ? '#3b82f6' : 'var(--fc-brand, #a82f2f)'
                            }}
                          >
                            {isJuryActor ? 'Jury' : 'Admin'}
                          </span>
                        )}
                        <span style={{ color: 'var(--fc-text-secondary)', marginLeft: '2px' }}>
                          {getActivitySentence(log, onViewFilm)}
                        </span>
                      </div>

                      {/* Timestamp on right */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '12px',
                          color: 'var(--fc-text-muted)',
                          whiteSpace: 'nowrap',
                          flexShrink: 0
                        }}
                        title={fullFormatted}
                      >
                        <ScheduleIcon size={12} />
                        <span>{relativeStr}</span>
                      </div>
                    </div>

                    {/* Notes / Critique Callout Block */}
                    {log.notes && (
                      <div
                        style={{
                          marginTop: '8px',
                          marginBottom: '10px',
                          padding: '9px 14px',
                          borderRadius: '6px',
                          background: 'var(--fc-surface-subtle, rgba(255,255,255,0.03))',
                          borderLeft: `3.5px solid ${cfg.color}`,
                          fontSize: '13px',
                          color: 'var(--fc-text-secondary)',
                          lineHeight: 1.55,
                          wordBreak: 'break-word',
                          fontStyle: log.action === 'REVIEW_SUBMITTED' ? 'italic' : 'normal'
                        }}
                      >
                        {log.action === 'REVIEW_SUBMITTED' ? `“${log.notes}”` : log.notes}
                      </div>
                    )}

                    {/* Footer / Meta Pills & Micro-Actions */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '8px',
                        marginTop: log.notes ? '4px' : '8px'
                      }}
                    >
                      {/* Action Badge */}
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontSize: '11px',
                          fontWeight: 650,
                          background: cfg.bg,
                          color: cfg.color,
                          border: `1px solid ${cfg.border}`
                        }}
                      >
                        <span>{cfg.icon}</span>
                        <span>{cfg.label}</span>
                      </span>

                      {/* Category Pill */}
                      {log.category_name && (
                        <span
                          style={{
                            fontSize: '11px',
                            padding: '2px 8px',
                            borderRadius: '12px',
                            background: 'var(--fc-surface-subtle, rgba(255,255,255,0.05))',
                            color: 'var(--fc-text-muted)',
                            border: '1px solid var(--fc-border)'
                          }}
                        >
                          📁 {log.category_name}
                        </span>
                      )}

                      {/* Current Stage Pill */}
                      {log.current_stage_name && (
                        <span
                          style={{
                            fontSize: '11px',
                            padding: '2px 8px',
                            borderRadius: '12px',
                            background: 'var(--fc-surface-subtle, rgba(255,255,255,0.05))',
                            color: 'var(--fc-text-muted)',
                            border: '1px solid var(--fc-border)'
                          }}
                        >
                          Stage: {log.current_stage_name}
                        </span>
                      )}

                      {/* Quick Link: View Film */}
                      {log.submission_id && (
                        <button
                          type="button"
                          onClick={() => {
                            if (typeof onViewFilm === 'function') {
                              onViewFilm({ id: log.submission_id, title: log.film_title });
                            }
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--fc-brand, #a82f2f)',
                            fontSize: '11.5px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '2px 6px',
                            borderRadius: '4px'
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none'; }}
                        >
                          🎬 View Film Details
                        </button>
                      )}

                      {/* Quick Link: Filter by actor */}
                      {!isSystem && log.actor_name && (
                        <button
                          type="button"
                          onClick={() => {
                            setSearchInput(log.actor_name);
                          }}
                          title={`Filter events performed by ${log.actor_name}`}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--fc-text-muted)',
                            fontSize: '11.5px',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px',
                            padding: '2px 6px',
                            borderRadius: '4px'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.color = 'var(--fc-text-primary)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.color = 'var(--fc-text-muted)';
                          }}
                        >
                          👤 {log.actor_name}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        /* ── AUDIT TABLE VIEW ─────────────────────────────────────────────────────── */
        <div
          className="fc-table-container"
          style={{
            background: 'var(--fc-surface)',
            border: '1px solid var(--fc-border)',
            borderRadius: '10px',
            overflow: 'hidden',
            boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
          }}
        >
          <table className="fc-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'var(--fc-surface-subtle)', borderBottom: '1px solid var(--fc-border)' }}>
                <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: 600, color: 'var(--fc-text-muted)', width: '220px' }}>
                  Date & Time
                </th>
                <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: 600, color: 'var(--fc-text-muted)', width: '170px' }}>
                  Action
                </th>
                <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: 600, color: 'var(--fc-text-muted)', width: '240px' }}>
                  Film Project
                </th>
                <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: 600, color: 'var(--fc-text-muted)', width: '200px' }}>
                  Performed By
                </th>
                <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: 600, color: 'var(--fc-text-muted)' }}>
                  Activity Details
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} style={{ padding: '48px', textAlign: 'center', color: 'var(--fc-text-muted)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                      <div className="spinner" style={{ width: '28px', height: '28px', borderWidth: '3px' }} />
                      <span style={{ fontSize: '13px' }}>Loading activity logs...</span>
                    </div>
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--fc-text-muted)' }}>
                    <div style={{ fontSize: '32px', marginBottom: '8px' }}>📋</div>
                    <div style={{ fontWeight: 600, fontSize: '15px', color: 'var(--fc-text-primary)' }}>No Activity Recorded</div>
                    <div style={{ fontSize: '13px', maxWidth: '400px', margin: '6px auto 0' }}>
                      {hasActiveFilters
                        ? 'No events match your selected filters. Try clearing some filters or searching for another term.'
                        : isJuryUser
                          ? 'You have not submitted any reviews or evaluations yet.'
                          : 'No activity logs have been recorded for this festival edition yet.'}
                    </div>
                    {hasActiveFilters && (
                      <button
                        type="button"
                        className="fc-btn fc-btn-secondary"
                        onClick={clearAllFilters}
                        style={{ marginTop: '14px', fontSize: '12px' }}
                      >
                        Clear Active Filters
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const cfg = ACTION_CONFIG[log.action] || ACTION_CONFIG.DEFAULT;
                  const { dateStr, timeStr, relativeStr } = formatDateTime(log.created_at);
                  const isJuryActor = log.actor_group_key === 'jury' || log.action === 'REVIEW_SUBMITTED';

                  return (
                    <tr
                      key={log.id}
                      style={{
                        borderBottom: '1px solid var(--fc-border)',
                        transition: 'background 0.15s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'var(--fc-surface-hover, rgba(255,255,255,0.03))';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      {/* 1. Prominent Date & Time */}
                      <td style={{ padding: '14px 16px', verticalAlign: 'middle' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                          <ScheduleIcon size={14} style={{ color: 'var(--fc-text-muted)', marginTop: '2px', flexShrink: 0 }} />
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--fc-text-primary)', whiteSpace: 'nowrap' }}>
                              {dateStr}
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--fc-text-muted)', marginTop: '1px', display: 'flex', gap: '6px' }}>
                              <span>{timeStr}</span>
                              <span>•</span>
                              <span style={{ color: 'var(--fc-text-secondary)' }}>{relativeStr}</span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* 2. Action Type Badge */}
                      <td style={{ padding: '14px 16px', verticalAlign: 'middle' }}>
                        <div
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '4px 9px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: 600,
                            background: cfg.bg,
                            color: cfg.color,
                            border: `1px solid ${cfg.border}`,
                            whiteSpace: 'nowrap'
                          }}
                        >
                          <span>{cfg.icon}</span>
                          <span>{cfg.label}</span>
                        </div>
                      </td>

                      {/* 3. Film Project */}
                      <td style={{ padding: '14px 16px', verticalAlign: 'middle' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={() => {
                              if (typeof onViewFilm === 'function') {
                                onViewFilm({ id: log.submission_id, title: log.film_title });
                              }
                            }}
                            style={{
                              fontWeight: 600,
                              fontSize: '13px',
                              color: 'var(--fc-primary, #e11d48)',
                              cursor: 'pointer',
                              textDecoration: 'none',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              maxWidth: '220px'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.textDecoration = 'underline';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.textDecoration = 'none';
                            }}
                            title={`Click to view film details for "${log.film_title || 'Untitled'}"`}
                          >
                            {log.film_title || `Submission #${log.submission_id}`}
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--fc-text-muted)' }}>
                            {log.category_name && (
                              <span style={{ background: 'var(--fc-surface-subtle)', padding: '1px 6px', borderRadius: '4px' }}>
                                {log.category_name}
                              </span>
                            )}
                            {log.current_stage_name && (
                              <span style={{ color: 'var(--fc-text-muted)' }}>
                                Stage: {log.current_stage_name}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* 4. Performed By */}
                      <td style={{ padding: '14px 16px', verticalAlign: 'middle' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                          <div
                            style={{
                              width: '28px',
                              height: '28px',
                              borderRadius: '50%',
                              background: isJuryActor ? 'rgba(59, 130, 246, 0.2)' : 'rgba(225, 29, 72, 0.2)',
                              color: isJuryActor ? '#3b82f6' : '#f43f5e',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 700,
                              fontSize: '11px',
                              flexShrink: 0,
                              overflow: 'hidden',
                              position: 'relative'
                            }}
                          >
                            {log.actor_thumbnail_pic ? (
                              <img
                                src={log.actor_thumbnail_pic}
                                alt={log.actor_name}
                                style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                  if (e.currentTarget.nextSibling) {
                                    e.currentTarget.nextSibling.style.display = 'flex';
                                  }
                                }}
                              />
                            ) : null}
                            <span style={{ display: log.actor_thumbnail_pic ? 'none' : 'flex', width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
                              {getInitials(log.actor_name)}
                            </span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0 }}>
                            <span
                              style={{
                                fontWeight: 600,
                                fontSize: '12px',
                                color: 'var(--fc-text-primary)',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis'
                              }}
                            >
                              {log.actor_name || 'System'}
                            </span>
                            <span
                              style={{
                                fontSize: '10px',
                                fontWeight: 600,
                                textTransform: 'uppercase',
                                letterSpacing: '0.04em',
                                color: isJuryActor ? '#3b82f6' : '#f43f5e'
                              }}
                            >
                              {isJuryActor ? 'Jury' : 'Admin'}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* 5. Activity Details / Notes */}
                      <td style={{ padding: '14px 16px', verticalAlign: 'middle' }}>
                        <div
                          style={{
                            fontSize: '12.5px',
                            color: 'var(--fc-text-secondary)',
                            lineHeight: 1.45,
                            maxWidth: '520px',
                            wordBreak: 'break-word'
                          }}
                        >
                          {log.notes || '—'}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── PAGINATION BAR ──────────────────────────────────────────────────────── */}
      {total > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
            padding: '10px 4px'
          }}
        >
          <div style={{ fontSize: '13px', color: 'var(--fc-text-muted)' }}>
            Showing{' '}
            <strong style={{ color: 'var(--fc-text-primary)' }}>
              {Math.min((page - 1) * limit + 1, total)}
            </strong>{' '}
            to{' '}
            <strong style={{ color: 'var(--fc-text-primary)' }}>
              {Math.min(page * limit, total)}
            </strong>{' '}
            of <strong style={{ color: 'var(--fc-text-primary)' }}>{total}</strong> entries
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '12px', color: 'var(--fc-text-muted)' }}>Per page:</span>
              <select
                className="fc-input"
                value={limit}
                onChange={(e) => {
                  setLimit(Number(e.target.value));
                  setPage(1);
                }}
                style={{ height: '32px', fontSize: '12px', padding: '0 8px' }}
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <button
                type="button"
                className="fc-btn fc-btn-secondary"
                disabled={page <= 1 || loading}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                style={{ height: '32px', padding: '0 10px', fontSize: '12px' }}
              >
                Previous
              </button>
              <span style={{ fontSize: '12px', padding: '0 8px', color: 'var(--fc-text-secondary)' }}>
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                className="fc-btn fc-btn-secondary"
                disabled={page >= totalPages || loading}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                style={{ height: '32px', padding: '0 10px', fontSize: '12px' }}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
