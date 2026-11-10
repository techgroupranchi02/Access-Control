/**
 * Payments & Payouts Page
 * Matches https://ffestiplus.autovertest.com/payouts with full data fidelity,
 * metric cards, tab navigation, search/sort, CSV export, and PDF Tax Invoice downloads.
 */
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import api from '../services/api';
import { useFestivalConfig } from '../hooks/useFestivalConfig';
import { useTheme } from '../context/ThemeContext';
import SearchInput from '../components/common/SearchInput';
import {
  FileDownloadIcon,
  PeopleIcon,
  CheckCircleIcon,
  CloseIcon,
} from '../components/common/Icons';

// Crisp SVG Icons matching FestEase / Material Icons
function BankIcon({ size = 18, style = {} }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0, ...style }}>
      <path d="M4 10v7h3v-7H4zm6 0v7h3v-7h-3zM2 22h19v-3H2v3zm14-12v7h3v-7h-3zm-4.5-9L2 6v2h19V6l-9.5-5z" />
    </svg>
  );
}

// PAN / long IDs: keep only the last 4 characters visible
function maskTail(value, visible = 4) {
  const v = String(value || '').trim();
  if (!v) return '';
  if (v.length <= visible) return v;
  return '•'.repeat(Math.min(v.length - visible, 6)) + v.slice(-visible);
}

function titleCase(value) {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

const BANK_STATUS_STYLES = {
  verified: { label: 'Verified', color: 'var(--fc-success-text)', bg: 'var(--fc-success-bg)', border: 'var(--fc-success-border)' },
  pending: { label: 'Verification pending', color: 'var(--fc-warning-text)', bg: 'var(--fc-warning-bg)', border: 'var(--fc-warning-border)' },
  failed: { label: 'Verification failed', color: 'var(--fc-danger-text)', bg: 'var(--fc-danger-bg)', border: 'var(--fc-danger-border)' },
  rejected: { label: 'Rejected', color: 'var(--fc-danger-text)', bg: 'var(--fc-danger-bg)', border: 'var(--fc-danger-border)' },
};

function BankDetailsDialog({ bank, onClose }) {
  const closeRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const statusKey = String(bank?.verification_status || '').toLowerCase();
  const status = statusKey
    ? (BANK_STATUS_STYLES[statusKey] || { label: titleCase(statusKey), color: 'var(--fc-text-secondary)', bg: 'var(--fc-surface-subtle)', border: 'var(--fc-border)' })
    : null;

  // Only rows that have a value are shown — nothing is filled in by the UI
  const rows = [
    { label: 'Account holder', value: bank?.beneficiary_name },
    { label: 'Legal entity', value: bank?.legal_entity_name },
    { label: 'Bank', value: bank?.bank_name },
    { label: 'Branch', value: bank?.branch_name },
    { label: 'Account number', value: bank?.account_number_masked, mono: true },
    { label: 'IFSC', value: bank?.ifsc_code, mono: true },
    { label: 'Account type', value: titleCase(bank?.account_type) },
    { label: 'PAN', value: maskTail(bank?.pan_number), mono: true },
  ].filter((r) => r.value);

  return (
    <div className="fc-modal-overlay" onClick={onClose}>
      <div
        className="fc-modal-card fc-pay-bank-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fc-pay-bank-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="fc-modal-header" style={{ gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
            <div className="fc-pay-bank-icon">
              <BankIcon size={20} />
            </div>
            <div style={{ minWidth: 0 }}>
              <h2 id="fc-pay-bank-title" style={{ margin: 0, fontSize: '1.05rem', color: 'var(--fc-text-main)' }}>
                Settlement Bank Account
              </h2>
              <div style={{ fontSize: '0.78rem', color: 'var(--fc-text-muted)', marginTop: '2px' }}>
                Net payouts for this festival are deposited here
              </div>
            </div>
          </div>
          <button ref={closeRef} type="button" className="fc-modal-close" onClick={onClose} aria-label="Close">
            <CloseIcon size={14} />
          </button>
        </div>

        <div className="fc-pay-bank-body">
          {status && (
            <span
              className="fc-pay-bank-status"
              style={{ color: status.color, background: status.bg, borderColor: status.border }}
            >
              {statusKey === 'verified' && <CheckCircleIcon size={14} />}
              {status.label}
            </span>
          )}

          <dl className="fc-pay-bank-list">
            {rows.map((r) => (
              <div key={r.label} className="fc-pay-bank-row">
                <dt>{r.label}</dt>
                <dd className={r.mono ? 'is-mono' : undefined}>{r.value}</dd>
              </div>
            ))}
          </dl>

          <p className="fc-pay-bank-note">
            For security, only the last 4 digits of the account number and PAN are shown.
          </p>
        </div>

        <div className="fc-modal-footer" style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" className="fc-pay-bank-close" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function SavingsIcon({ size = 18, style = {} }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0, ...style }}>
      <path d="M19.83 7.5l-2.27-2.23c.36-.5.59-1.09.59-1.77 0-1.66-1.34-3-3-3s-3 1.34-3 3c0 .68.23 1.27.59 1.77L10.47 7.5H4c-1.1 0-2 .9-2 2v9c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2v-9c0-1.1-.9-2-2-2h-.17zM15.15 3.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5-1.5-.67-1.5-1.5.67-1.5 1.5-1.5zM20 18.5H4v-9h16v9zm-8-7c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" />
    </svg>
  );
}

function ReceiptIcon({ size = 16, style = {} }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0, ...style }}>
      <path d="M18 17H6v-2h12v2zm0-4H6v-2h12v2zm0-4H6V7h12v2zM3 22l1.5-1.5L6 22l1.5-1.5L9 22l1.5-1.5L12 22l1.5-1.5L15 22l1.5-1.5L18 22l1.5-1.5L21 22V2l-1.5 1.5L18 2l-1.5 1.5L15 2l-1.5 1.5L12 2l-1.5 1.5L9 2 7.5 3.5 6 2 4.5 3.5 3 2v20z" />
    </svg>
  );
}

function GridViewIcon({ size = 18, style = {} }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0, ...style }}>
      <path d="M3 3v8h8V3H3zm2 2h4v4H5V5zm8-2v8h8V3h-8zm2 2h4v4h-4V5zM3 13v8h8v-8H3zm2 2h4v4H5v-4zm8-2v8h8v-8h-8zm2 2h4v4h-4v-4z" />
    </svg>
  );
}

function ListIcon({ size = 18, style = {} }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0, ...style }}>
      <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z" />
    </svg>
  );
}

function InfoIcon({ size = 13, style = {} }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0, ...style }}>
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
    </svg>
  );
}

export default function PaymentsPage() {
  const { currentFestival } = useFestivalConfig();
  const { isDark } = useTheme();

  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState(null);
  const [kpis, setKpis] = useState({
    total_submissions: 0,
    gross_revenue: 0,
    total_platform_fees: 0,
    total_deductions: 0,
    net_settled_to_bank: 0,
    pending_amount: 0,
    settled_count: 0,
    pending_count: 0,
    refunded_count: 0,
    total_refunded_amount: 0,
    total_reversed_amount: 0,
  });
  const [bankInfo, setBankInfo] = useState(null);
  const [showBankDialog, setShowBankDialog] = useState(false);
  const closeBankDialog = useCallback(() => setShowBankDialog(false), []);
  const [ledger, setLedger] = useState([]);
  const [totalItems, setTotalItems] = useState(0);
  const [page, setPage] = useState(1);
  const perPage = 10;

  // Tabs: 0: Settled, 1: Pending, 2: Refunded
  const [tabIndex, setTabIndex] = useState(1);

  // Phones: the tab row scrolls sideways, so bring the active tab fully into view
  useEffect(() => {
    const row = document.querySelector('.fc-pay-tabs');
    const btn = row?.children?.[tabIndex];
    if (!row || !btn || row.scrollWidth <= row.clientWidth) return;
    const offset = btn.getBoundingClientRect().left - row.getBoundingClientRect().left + row.scrollLeft;
    row.scrollTo({ left: offset - (row.clientWidth - btn.offsetWidth) / 2, behavior: 'smooth' });
  }, [tabIndex]);
  const [searchTerm, setSearchTerm] = useState('');
  const [searching, setSearching] = useState(false);
  const requestIdRef = useRef(0);
  const searchDidMountRef = useRef(false);
  const [sortBy, setSortBy] = useState('recent');
  const [viewMode, setViewMode] = useState('list'); // 'list' or 'grid' (desktop choice)

  // Phones always use the grid (card) view; the list/grid toggle is desktop only
  const [isPhone, setIsPhone] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    const onChange = (e) => setIsPhone(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  const effectiveView = isPhone ? 'grid' : viewMode;

  // Fetch Payouts data based on current tab & search
  // `quiet` keeps the current table on screen (used while typing a search) instead of the full loader.
  // Only the newest request may update state, so out-of-order responses can't overwrite fresher results.
  const fetchPayoutsData = useCallback(async (tabIdx, searchVal = '', pageNum = 1, sortVal = 'recent', { quiet = false } = {}) => {
    const requestId = ++requestIdRef.current;
    if (quiet) setSearching(true); else setLoading(true);
    try {
      let status = 'settled';
      if (tabIdx === 1) status = 'pending';
      else if (tabIdx === 2) status = 'refunded';

      const res = await api.get('/payouts', {
        params: {
          status,
          search: searchVal,
          page: pageNum,
          per_page: perPage,
          sort: sortVal,
        },
      });

      if (requestId !== requestIdRef.current) return;
      const payload = res.data?.data || {};
      if (payload.kpis) {
        setKpis(payload.kpis);
      }
      if (payload.bank_account) {
        setBankInfo(payload.bank_account);
      }
      if (payload.ledger) {
        setLedger(payload.ledger.data || []);
        setTotalItems(payload.ledger.total || 0);
      }
    } catch (err) {
      if (requestId === requestIdRef.current) console.error('Failed to load payouts:', err);
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setSearching(false);
      }
    }
  }, []);

  // Initial load
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        const res = await api.get('/payouts', {
          params: { status: 'all', page: 1, per_page: perPage },
        });
        const payload = res.data?.data || {};
        if (payload.kpis) {
          setKpis(payload.kpis);
          const hasSettled = Number(payload.kpis.settled_count || 0) > 0;
          const hasPending = Number(payload.kpis.pending_count || 0) > 0;
          const initialTab = (!hasSettled && hasPending) ? 1 : 0;
          setTabIndex(initialTab);
          await fetchPayoutsData(initialTab, '', 1, sortBy);
        }
        if (payload.bank_account) {
          setBankInfo(payload.bank_account);
        }
      } catch (err) {
        console.error('Initial payout load error:', err);
      } finally {
        setLoading(false);
      }
    };

    init();
  }, [currentFestival?.id, fetchPayoutsData, sortBy]);

  // Tab change
  const handleTabChange = (newIndex) => {
    setTabIndex(newIndex);
    setPage(1);
    fetchPayoutsData(newIndex, searchTerm.trim(), 1, sortBy);
  };

  // Search: debounced server search (name, email, phone, film, category, transfer / payment ID)
  useEffect(() => {
    if (!searchDidMountRef.current) { searchDidMountRef.current = true; return undefined; }
    const t = setTimeout(() => {
      setPage(1);
      fetchPayoutsData(tabIndex, searchTerm.trim(), 1, sortBy, { quiet: true });
    }, 300);
    return () => clearTimeout(t);
    // Only re-run when the search text changes; tab / sort changes fetch on their own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm]);

  // Sort dropdown
  const handleSortChange = (e) => {
    const val = e.target.value;
    setSortBy(val);
    fetchPayoutsData(tabIndex, searchTerm.trim(), page, val);
  };

  // CSV Export handler
  const handleExportCsv = async () => {
    try {
      const res = await api.get('/payouts/export-csv', {
        responseType: 'blob',
      });
      const blob = new Blob([res.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Submissions_Payouts_${currentFestival?.id || 'festival'}_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => window.URL.revokeObjectURL(url), 5000);
    } catch (e) {
      console.error('CSV Export error:', e);
      alert('Failed to export CSV.');
    }
  };

  // PDF Tax Invoice Download handler
  const handleDownloadReceipt = async (row) => {
    const targetId = row.id || row.transaction_record_id;
    if (!targetId) return;

    setDownloadingId(targetId);
    try {
      const res = await api.get(`/payouts/${targetId}/receipt`, {
        responseType: 'blob',
      });
      const blob = res.data instanceof Blob ? res.data : new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const invoiceNum = String(targetId).padStart(6, '0');
      a.download = `Tax_Invoice_FC-FEST-${invoiceNum}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => window.URL.revokeObjectURL(url), 10000);
    } catch (err) {
      console.error('Tax invoice download error:', err);
      alert('Failed to download tax invoice PDF.');
    } finally {
      setDownloadingId(null);
    }
  };

  // Sorted ledger
  const sortedLedger = useMemo(() => {
    let items = [...ledger];
    if (sortBy === 'amount_high') {
      items.sort((a, b) => Number(b.net_settled_amount || 0) - Number(a.net_settled_amount || 0));
    } else if (sortBy === 'amount_low') {
      items.sort((a, b) => Number(a.net_settled_amount || 0) - Number(b.net_settled_amount || 0));
    }
    return items;
  }, [ledger, sortBy]);

  const festivalName = currentFestival?.name || currentFestival?.title || 'Festival';
  const hasBank = Boolean(bankInfo && (bankInfo.bank_name || bankInfo.account_number_masked));
  const bankName = bankInfo?.bank_name || 'Bank account';
  const maskedAcc = bankInfo?.account_number_masked || '';

  return (
    <div className="animate-fade-in" style={{ width: '100%', padding: '0 0 32px 0' }}>
      {/* ── Page Header ────────────────────────────────────────────── */}
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 800, margin: '0 0 4px 0', color: 'var(--fc-text-main, #0f172a)' }}>
          Payouts
        </h1>
        <p style={{ margin: 0, fontSize: '14px', color: 'var(--fc-text-muted, #64748b)' }}>
          Manage your festival finances and payout settlements efficiently.
        </p>
      </div>

      {/* ── Festival & Bank Settlement Banner Card ──────────────────── */}
      <div
        className="fc-pay-banner"
        style={{
          border: '1px solid var(--fc-border, #e2e8f0)',
          borderRadius: '16px',
          background: 'var(--fc-surface-card, #ffffff)',
          padding: '16px 24px',
          marginBottom: '20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '50%',
              background: 'var(--fc-brand)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '18px',
              flexShrink: 0,
              boxShadow: '0 2px 8px rgba(168, 47, 47, 0.35)',
            }}
          >
            {festivalName.charAt(0).toUpperCase()}
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '16px', color: 'var(--fc-text-main, #0f172a)', lineHeight: 1.25 }}>
              {festivalName}
            </div>
            <div style={{ fontSize: '13px', color: 'var(--fc-text-muted, #64748b)', fontWeight: 500, marginTop: '2px' }}>
              Festival Dashboard • Payouts & Settlement Ledger
            </div>
          </div>
        </div>

        {hasBank && (
          <button
            type="button"
            className="fc-pay-bank-pill"
            onClick={() => setShowBankDialog(true)}
            aria-haspopup="dialog"
            title="View settlement bank account details"
          >
            <BankIcon size={16} style={{ flexShrink: 0 }} />
            <span>Settlement: {bankName}{maskedAcc ? ` (${maskedAcc})` : ''}</span>
          </button>
        )}
      </div>

      {/* ── 4 Metric KPI Summary Cards ──────────────────────────────── */}
      <div
        className="fc-pay-kpis"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '18px',
          marginBottom: '24px',
          width: '100%',
        }}
      >
        {/* Card 1: Total Submissions */}
        <div
          style={{
            borderRadius: '16px',
            border: '1px solid var(--fc-border, #e2e8f0)',
            background: 'var(--fc-surface-card, #ffffff)',
            padding: '20px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
          }}
        >
          <div>
            <div style={{ fontSize: '13px', color: 'var(--fc-text-muted, #64748b)', fontWeight: 500 }}>
              Total Submissions
            </div>
            <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--fc-text-main, #0f172a)', margin: '4px 0' }}>
              {Number(kpis.total_submissions || 0).toLocaleString()}
            </div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--fc-success-text)' }}>
              100% Completed
            </div>
          </div>
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              background: 'var(--fc-surface-subtle)',
              border: '1px solid var(--fc-border)',
              color: 'var(--fc-text-secondary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <PeopleIcon size={20} />
          </div>
        </div>

        {/* Card 2: Gross Revenue */}
        <div
          style={{
            borderRadius: '16px',
            border: '1px solid var(--fc-border, #e2e8f0)',
            background: 'var(--fc-surface-card, #ffffff)',
            padding: '20px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
          }}
        >
          <div>
            <div style={{ fontSize: '13px', color: 'var(--fc-text-muted, #64748b)', fontWeight: 500 }}>
              Gross Revenue
            </div>
            <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--fc-text-main, #0f172a)', margin: '4px 0' }}>
              ₹{Number(kpis.gross_revenue || 0).toLocaleString('en-IN')}
            </div>
            <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--fc-text-muted, #64748b)' }}>
              {Number(kpis.refunded_count || 0) > 0
                ? `Excl. ₹${Number(kpis.total_refunded_amount || 0).toLocaleString('en-IN')} Refunded`
                : 'Total Submissions Fees'}
            </div>
          </div>
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              background: 'var(--fc-surface-subtle)',
              border: '1px solid var(--fc-border)',
              color: 'var(--fc-text-secondary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <CheckCircleIcon size={20} />
          </div>
        </div>

        {/* Card 3: Total Deductions */}
        <div
          style={{
            borderRadius: '16px',
            border: '1px solid var(--fc-border, #e2e8f0)',
            background: 'var(--fc-surface-card, #ffffff)',
            padding: '20px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
          }}
        >
          <div>
            <div style={{ fontSize: '13px', color: 'var(--fc-text-muted, #64748b)', fontWeight: 500 }}>
              Total Deductions
            </div>
            <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--fc-danger-text)', margin: '4px 0' }}>
              -₹{Number(kpis.total_deductions || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
            <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--fc-text-muted, #64748b)' }}>
              ffesti Plus Fee, Gateway & Taxes
            </div>
          </div>
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              background: 'var(--fc-surface-subtle)',
              border: '1px solid var(--fc-border)',
              color: 'var(--fc-text-secondary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <SavingsIcon size={20} />
          </div>
        </div>

        {/* Card 4: Net Settled to Bank */}
        <div
          style={{
            borderRadius: '16px',
            border: '1px solid var(--fc-border, #e2e8f0)',
            background: 'var(--fc-surface-card, #ffffff)',
            padding: '20px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
          }}
        >
          <div>
            <div style={{ fontSize: '13px', color: 'var(--fc-text-muted, #64748b)', fontWeight: 500 }}>
              Net Settled to Bank
            </div>
            <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--fc-success-text)', margin: '4px 0' }}>
              ₹{Number(kpis.net_settled_to_bank || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
            <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--fc-text-muted, #64748b)' }}>
              {hasBank ? [bankName, maskedAcc].filter(Boolean).join(' ') : 'No bank account linked'}
            </div>
          </div>
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              background: 'var(--fc-surface-subtle)',
              border: '1px solid var(--fc-border)',
              color: 'var(--fc-text-secondary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <BankIcon size={20} />
          </div>
        </div>
      </div>

      {/* ── Centered Tabs Bar ───────────────────────────────────────── */}
      <div className="fc-pay-tabs-wrap" style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px', width: '100%' }}>
        <div
          className="fc-pay-tabs"
          style={{
            display: 'inline-flex',
            gap: '8px',
            borderBottom: '1px solid var(--fc-border, #e2e8f0)',
            paddingBottom: '2px',
          }}
        >
          <button
            type="button"
            onClick={() => handleTabChange(0)}
            style={{
              background: 'none',
              border: 'none',
              padding: '8px 18px',
              cursor: 'pointer',
              fontWeight: tabIndex === 0 ? 800 : 600,
              fontSize: '14px',
              color: tabIndex === 0 ? 'var(--fc-brand-text)' : ('var(--fc-text-muted, #64748b)'),
              borderBottom: tabIndex === 0 ? '2.5px solid var(--fc-brand)' : '2.5px solid transparent',
              transition: 'all 0.15s ease',
            }}
          >
            Settled Payouts ({kpis.settled_count || 0})
          </button>

          <button
            type="button"
            onClick={() => handleTabChange(1)}
            style={{
              background: 'none',
              border: 'none',
              padding: '8px 18px',
              cursor: 'pointer',
              fontWeight: tabIndex === 1 ? 800 : 600,
              fontSize: '14px',
              color: tabIndex === 1 ? 'var(--fc-brand-text)' : ('var(--fc-text-muted, #64748b)'),
              borderBottom: tabIndex === 1 ? '2.5px solid var(--fc-brand)' : '2.5px solid transparent',
              transition: 'all 0.15s ease',
            }}
          >
            Pending Transfers ({kpis.pending_count || 0})
          </button>

          <button
            type="button"
            onClick={() => handleTabChange(2)}
            style={{
              background: 'none',
              border: 'none',
              padding: '8px 18px',
              cursor: 'pointer',
              fontWeight: tabIndex === 2 ? 800 : 600,
              fontSize: '14px',
              color: tabIndex === 2 ? ('var(--fc-danger-text)') : ('var(--fc-text-muted, #64748b)'),
              borderBottom: tabIndex === 2 ? ('2.5px solid var(--fc-danger)') : '2.5px solid transparent',
              transition: 'all 0.15s ease',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>Refunded ({kpis.refunded_count || 0})</span>
            {Number(kpis.refunded_count || 0) > 0 && (
              <span
                style={{
                  background: 'var(--fc-danger-bg)',
                  color: 'var(--fc-danger-text)',
                  border: 'none',
                  fontSize: '10px',
                  fontWeight: 800,
                  borderRadius: '4px',
                  padding: '1px 6px',
                }}
              >
                Reversed
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ── Main Ledger Card ────────────────────────────────────────── */}
      <div
        style={{
          borderRadius: '16px',
          border: '1px solid var(--fc-border, #e2e8f0)',
          background: 'var(--fc-surface-card, #ffffff)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
          overflow: 'hidden',
          width: '100%',
        }}
      >
        {/* Card Toolbar Bar */}
        <div
          className="fc-pay-toolbar"
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--fc-border, #f1f5f9)',
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '16px',
          }}
        >
          {/* Section Title */}
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 800, margin: '0 0 2px 0', color: 'var(--fc-text-main, #0f172a)' }}>
              {tabIndex === 0
                ? 'Settled Submissions & Payouts'
                : tabIndex === 1
                ? 'Pending Submission Transfers'
                : 'Refunded Submissions & Transfer Reversals'}
            </h3>
            <div style={{ fontSize: '13px', color: 'var(--fc-text-muted, #64748b)' }}>
              {tabIndex === 0
                ? `Total Settled Payouts: ₹${Number(kpis.net_settled_to_bank || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
                : tabIndex === 1
                ? `Total Pending Amount: ₹${Number(kpis.pending_amount !== undefined ? kpis.pending_amount : (kpis.gross_revenue || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
                : `Total Refunded: ₹${Number(kpis.total_refunded_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })} (Route Net Reversed: ₹${Number(kpis.total_reversed_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })})`}
            </div>
          </div>

          {/* Controls: Search, Sort, CSV Export, View Toggle (one row, right-aligned; wraps only on narrow screens) */}
          <div className="fc-pay-controls" style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', justifyContent: 'flex-end', flex: '1 1 auto' }}>
            {/* Search Input */}
            <SearchInput
              value={searchTerm}
              onChange={setSearchTerm}
              loading={searching}
              placeholder="Search name, phone, film or ID"
              maxWidth="280px"
              style={{ flex: '0 1 280px', minWidth: '200px' }}
            />

            {/* Sort Dropdown */}
            <select
              className="fc-pay-sort"
              value={sortBy}
              onChange={handleSortChange}
              style={{
                borderRadius: '30px',
                border: '1px solid var(--fc-border, #e2e8f0)',
                background: 'var(--fc-surface-card, #ffffff)',
                padding: '8px 16px',
                fontSize: '13px',
                outline: 'none',
                color: 'var(--fc-text-main, #0f172a)',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              <option value="recent">Recently Settled</option>
              <option value="amount_high">Amount: High to Low</option>
              <option value="amount_low">Amount: Low to High</option>
            </select>

            {/* CSV Export Button */}
            <button
              type="button"
              className="fc-pay-export"
              onClick={handleExportCsv}
              style={{
                background: 'var(--fc-brand)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '30px',
                padding: '8px 20px',
                fontWeight: 700,
                fontSize: '13px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 2px 8px rgba(168, 47, 47, 0.3)',
                transition: 'background 0.15s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--fc-brand-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--fc-brand)')}
            >
              <FileDownloadIcon size={16} />
              <span>CSV Export</span>
            </button>

            {/* View Mode Toggle: Grid vs List (desktop only; phones always show the grid) */}
            {!isPhone && (
            <div
              className="fc-pay-view"
              style={{
                display: 'flex',
                flexShrink: 0,
                background: 'var(--fc-surface-subtle)',
                border: '1px solid var(--fc-border, #e2e8f0)',
                borderRadius: '10px',
                padding: '3px',
                gap: '2px',
              }}
            >
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                title="Grid View"
                style={{
                  background: viewMode === 'grid' ? ('var(--fc-surface-card)') : 'transparent',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '5px 8px',
                  cursor: 'pointer',
                  color: viewMode === 'grid' ? 'var(--fc-brand-text)' : 'var(--fc-text-muted)',
                  boxShadow: viewMode === 'grid' ? ('0 1px 3px rgba(0,0,0,0.08)') : 'none',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <GridViewIcon size={16} />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                title="List View"
                style={{
                  background: viewMode === 'list' ? ('var(--fc-surface-card)') : 'transparent',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '5px 8px',
                  cursor: 'pointer',
                  color: viewMode === 'list' ? 'var(--fc-brand-text)' : 'var(--fc-text-muted)',
                  boxShadow: viewMode === 'list' ? ('0 1px 3px rgba(0,0,0,0.08)') : 'none',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <ListIcon size={16} />
              </button>
            </div>
            )}
          </div>
        </div>

        {/* Content Section */}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
            <div className="skeleton" style={{ width: '40px', height: '40px', borderRadius: '50%' }}></div>
          </div>
        ) : sortedLedger.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--fc-text-muted)' }}>
            <div style={{ fontSize: '15px', fontWeight: 600 }}>
              {searchTerm.trim()
                ? `No payouts match "${searchTerm.trim()}" in this tab.`
                : tabIndex === 2
                  ? 'No refunded submissions found for this festival.'
                  : 'No submission payouts found for this filter.'}
            </div>
            {searchTerm.trim() && (
              <button
                type="button"
                className="fc-btn fc-btn-outline"
                onClick={() => setSearchTerm('')}
                style={{ marginTop: '14px', padding: '7px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
              >
                Clear search
              </button>
            )}
          </div>
        ) : effectiveView === 'list' ? (
          /* ── Table View Mode ───────────────────────────────────────── */
          <div className="table-container fc-pay-table-wrap" style={{ overflowX: 'auto', width: '100%' }}>
            <table className="table fc-pay-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: 'var(--fc-surface-subtle)', borderBottom: '1px solid var(--fc-border-subtle)' }}>
                  <th style={{ padding: '12px 16px', fontWeight: 600, fontSize: '12px', color: 'var(--fc-text-muted, #64748b)' }}>#</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600, fontSize: '12px', color: 'var(--fc-text-muted, #64748b)' }}>Name</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600, fontSize: '12px', color: 'var(--fc-text-muted, #64748b)' }}>Film Title</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600, fontSize: '12px', color: 'var(--fc-text-muted, #64748b)' }}>Category</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600, fontSize: '12px', color: 'var(--fc-text-muted, #64748b)' }}>
                    Submission Fee
                    <span title="Base submission fee before platform & gateway charges" style={{ marginLeft: '4px', cursor: 'pointer', verticalAlign: 'middle' }}>
                      <InfoIcon size={12} style={{ color: 'var(--fc-text-muted, #94a3b8)' }} />
                    </span>
                  </th>
                  <th style={{ padding: '12px 16px', fontWeight: 600, fontSize: '12px', color: 'var(--fc-text-muted, #64748b)' }}>
                    Deductions
                    <span title="6% ffesti Plus Fee + Razorpay Route fee & taxes" style={{ marginLeft: '4px', cursor: 'pointer', verticalAlign: 'middle' }}>
                      <InfoIcon size={12} style={{ color: 'var(--fc-text-muted, #94a3b8)' }} />
                    </span>
                  </th>
                  <th style={{ padding: '12px 16px', fontWeight: 600, fontSize: '12px', color: 'var(--fc-text-muted, #64748b)' }}>
                    Net Payout
                    <span title="Direct net settlement to festival bank account" style={{ marginLeft: '4px', cursor: 'pointer', verticalAlign: 'middle' }}>
                      <InfoIcon size={12} style={{ color: 'var(--fc-text-muted, #94a3b8)' }} />
                    </span>
                  </th>
                  <th style={{ padding: '12px 16px', fontWeight: 600, fontSize: '12px', color: 'var(--fc-text-muted, #64748b)' }}>
                    {tabIndex === 2 ? 'Route & Reversal IDs' : 'Transfer ID'}
                    <span title="Razorpay Route settlement & transfer references" style={{ marginLeft: '4px', cursor: 'pointer', verticalAlign: 'middle' }}>
                      <InfoIcon size={12} style={{ color: 'var(--fc-text-muted, #94a3b8)' }} />
                    </span>
                  </th>
                  <th style={{ padding: '12px 16px', fontWeight: 600, fontSize: '12px', color: 'var(--fc-text-muted, #64748b)', textAlign: 'center' }}>
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedLedger.map((row, idx) => {
                  const fee = Number(row.base_fee_amount || 0);
                  const platformFee = row.commission_amount !== undefined && row.commission_amount !== null
                    ? Number(row.commission_amount)
                    : Number((fee * 0.06).toFixed(2));
                  const routeFee = Number(row.route_fee_amount || 0);
                  const routeGst = Number(row.route_gst_amount || 0);
                  const routeTotal = (row.route_fee_amount !== undefined && row.route_gst_amount !== undefined)
                    ? Number((routeFee + routeGst).toFixed(2))
                    : Number(((fee - platformFee) * 0.0025 * 1.18).toFixed(2));
                  const deductions = Number(row.total_deductions || (platformFee + routeTotal));
                  const netPayout = Number(row.net_settled_amount || (fee - deductions));
                  const transferId = row.razorpay_transfer_id || row.razorpay_payment_id || 'trf_TR12345678';
                  const isRefunded = row.settlement_status === 'refunded';

                  return (
                    <tr
                      key={row.id || idx}
                      className={`fc-pay-row${isRefunded ? ' is-refunded' : ''}`}
                      style={{
                        borderBottom: '1px solid var(--fc-border-subtle)',
                        background: isRefunded
                          ? ('rgba(254, 242, 242, 0.5)')
                          : 'inherit',
                      }}
                    >
                      <td className="fc-pd-no" style={{ padding: '14px 16px', color: 'var(--fc-text-muted, #64748b)', fontWeight: 600, fontSize: '13px' }}>
                        {(page - 1) * perPage + idx + 1}
                      </td>
                      <td className="fc-pd-name" style={{ padding: '14px 16px' }}>
                        <div style={{ fontWeight: 700, color: 'var(--fc-text-main, #0f172a)', fontSize: '13px' }}>
                          {row.filmmaker_name || '—'}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--fc-text-muted, #94a3b8)', marginTop: '2px' }}>
                          {row.filmmaker_email || ''}
                        </div>
                      </td>
                      <td className="fc-pd-film" data-label="Film" style={{ padding: '14px 16px', fontWeight: 700, color: 'var(--fc-text-main, #0f172a)', fontSize: '13px' }}>
                        {row.film_title || '—'}
                      </td>
                      <td className="fc-pd-cat" style={{ padding: '14px 16px' }}>
                        <span
                          style={{
                            background: 'var(--fc-info-bg)',
                            color: 'var(--fc-info-text)',
                            border: 'none',
                            fontWeight: 700,
                            fontSize: '11px',
                            borderRadius: '6px',
                            padding: '3px 8px',
                            display: 'inline-block',
                          }}
                        >
                          {row.category_name || 'Short Film'}
                        </span>
                      </td>
                      <td className="fc-pd-fee" data-label="Submission fee" style={{ padding: '14px 16px', fontWeight: 700, color: 'var(--fc-text-main, #0f172a)', fontSize: '13px' }}>
                        ₹{fee.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="fc-pd-ded" data-label="Deductions" style={{ padding: '14px 16px', fontWeight: 700, color: 'var(--fc-danger-text)', fontSize: '13px' }}>
                        <span
                          title={`ffesti Plus Platform Fee (6%): ₹${platformFee.toFixed(2)} | Route Transfer Fee (0.25%) + GST: ₹${routeTotal.toFixed(2)}`}
                          style={{ cursor: 'pointer', textDecoration: 'underline dotted' }}
                        >
                          -₹{deductions.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                      </td>
                      <td className="fc-pd-net" data-label="Net payout" style={{ padding: '14px 16px', fontWeight: 800, fontSize: '13px' }}>
                        {isRefunded ? (
                          <div>
                            <span style={{ textDecoration: 'line-through', color: 'var(--fc-text-muted, #94a3b8)', display: 'block', fontSize: '11px' }}>
                              ₹{netPayout.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </span>
                            <span style={{ fontWeight: 800, color: 'var(--fc-danger-text)' }}>
                              -₹{netPayout.toLocaleString('en-IN', { minimumFractionDigits: 2 })} (Reversed)
                            </span>
                          </div>
                        ) : (
                          <span style={{ color: 'var(--fc-success-text)' }}>
                            ₹{netPayout.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </span>
                        )}
                      </td>
                      <td className="fc-pd-trf" data-label={tabIndex === 2 ? 'Route & reversal IDs' : 'Transfer ID'} style={{ padding: '14px 16px' }}>
                        <span
                          style={{
                            color: 'var(--fc-info-text)',
                            fontWeight: 600,
                            fontSize: '12px',
                            fontFamily: 'monospace',
                            background: 'var(--fc-info-bg)',
                            border: '1px solid var(--fc-info-border)',
                            padding: '2px 8px',
                            borderRadius: '6px',
                            display: 'inline-block',
                          }}
                        >
                          {transferId}
                        </span>
                        {isRefunded && row.reverse_transfer_id && (
                          <div style={{ color: 'var(--fc-danger-text)', fontWeight: 700, fontSize: '11px', fontFamily: 'monospace', marginTop: '4px' }}>
                            ↺ Reversal: {row.reverse_transfer_id}
                          </div>
                        )}
                      </td>
                      <td className="fc-pd-act" style={{ padding: '14px 16px', textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() => handleDownloadReceipt(row)}
                          disabled={downloadingId === (row.id || row.transaction_record_id)}
                          style={{
                            border: '1px solid var(--fc-danger-border)',
                            color: 'var(--fc-brand-text)',
                            background: 'var(--fc-danger-bg)',
                            borderRadius: '8px',
                            padding: '6px 14px',
                            fontWeight: 700,
                            fontSize: '12px',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            transition: 'all 0.15s ease',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'var(--fc-danger-bg)';
                            e.currentTarget.style.borderColor = 'var(--fc-brand)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'var(--fc-danger-bg)';
                            e.currentTarget.style.borderColor = 'var(--fc-danger-border)';
                          }}
                        >
                          <ReceiptIcon size={14} />
                          <span>
                            {downloadingId === (row.id || row.transaction_record_id) ? 'Downloading...' : 'Tax Invoice'}
                          </span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          /* ── Grid View Mode ────────────────────────────────────────── */
          <div className="fc-pay-grid" style={{ padding: '24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
            {sortedLedger.map((row, idx) => {
              const fee = Number(row.base_fee_amount || 0);
              const platformFee = row.commission_amount !== undefined && row.commission_amount !== null
                ? Number(row.commission_amount)
                : Number((fee * 0.06).toFixed(2));
              const routeFee = Number(row.route_fee_amount || 0);
              const routeGst = Number(row.route_gst_amount || 0);
              const routeTotal = (row.route_fee_amount !== undefined && row.route_gst_amount !== undefined)
                ? Number((routeFee + routeGst).toFixed(2))
                : Number(((fee - platformFee) * 0.0025 * 1.18).toFixed(2));
              const deductions = Number(row.total_deductions || (platformFee + routeTotal));
              const netPayout = Number(row.net_settled_amount || (fee - deductions));
              const transferId = row.razorpay_transfer_id || row.razorpay_payment_id || 'trf_TR12345678';
              const isRefunded = row.settlement_status === 'refunded';

              return (
                <div
                  key={row.id || idx}
                  style={{
                    borderRadius: '14px',
                    border: isRefunded
                      ? '1.5px solid var(--fc-danger-border)'
                      : ('1px solid var(--fc-border, #e2e8f0)'),
                    background: isRefunded
                      ? 'var(--fc-danger-bg)'
                      : ('var(--fc-surface-card, #ffffff)'),
                    padding: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                  }}
                >
                  <div>
                    {/* Top Row: Category */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                      <span
                        style={{
                          background: 'var(--fc-info-bg)',
                          color: 'var(--fc-info-text)',
                          border: '1px solid var(--fc-info-border)',
                          fontWeight: 700,
                          fontSize: '11px',
                          borderRadius: '6px',
                          padding: '3px 8px',
                        }}
                      >
                        {row.category_name || 'Short Film'}
                      </span>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--fc-text-muted, #94a3b8)' }}>
                        #{(page - 1) * perPage + idx + 1}
                      </span>
                    </div>

                    <div style={{ fontWeight: 800, fontSize: '15px', color: 'var(--fc-text-main, #0f172a)', marginBottom: '4px' }}>
                      {row.film_title || 'Untitled Film'}
                    </div>
                    <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--fc-text-main, #475569)' }}>
                      {row.filmmaker_name || '—'}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--fc-text-muted, #94a3b8)', marginBottom: '14px' }}>
                      {row.filmmaker_email || ''}
                    </div>

                    {/* Breakdown box */}
                    <div
                      style={{
                        padding: '12px 14px',
                        borderRadius: '10px',
                        background: 'var(--fc-surface-subtle)',
                        border: '1px solid var(--fc-border-subtle)',
                        marginBottom: '16px',
                        fontSize: '12px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <span style={{ color: 'var(--fc-text-muted, #64748b)' }}>Submission Fee</span>
                        <span style={{ fontWeight: 700, color: 'var(--fc-text-main, #0f172a)' }}>
                          ₹{fee.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span style={{ color: 'var(--fc-text-muted, #64748b)' }}>Deductions</span>
                        <span style={{ fontWeight: 700, color: 'var(--fc-danger-text)' }}>
                          -₹{deductions.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div style={{ borderTop: '1px solid var(--fc-border)', paddingTop: '8px', display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontWeight: 700, color: isRefunded ? ('var(--fc-danger-text)') : ('var(--fc-success-text)') }}>
                          {isRefunded ? 'Net Reversed' : 'Net Payout'}
                        </span>
                        <span style={{ fontWeight: 800, color: isRefunded ? ('var(--fc-danger-text)') : ('var(--fc-success-text)') }}>
                          ₹{netPayout.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--fc-text-muted, #94a3b8)' }}>TRANSFER ID</span>
                      <span
                        style={{
                          fontSize: '12px',
                          color: 'var(--fc-info-text)',
                          fontWeight: 700,
                          fontFamily: 'monospace',
                          background: 'var(--fc-info-bg)',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          border: '1px solid var(--fc-info-border)',
                        }}
                      >
                        {transferId}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDownloadReceipt(row)}
                      disabled={downloadingId === (row.id || row.transaction_record_id)}
                      style={{
                        width: '100%',
                        border: '1px solid var(--fc-danger-border)',
                        color: 'var(--fc-brand-text)',
                        background: 'var(--fc-danger-bg)',
                        borderRadius: '10px',
                        padding: '8px',
                        fontWeight: 700,
                        fontSize: '13px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'var(--fc-danger-bg)';
                        e.currentTarget.style.borderColor = 'var(--fc-brand)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'var(--fc-danger-bg)';
                        e.currentTarget.style.borderColor = 'var(--fc-danger-border)';
                      }}
                    >
                      <ReceiptIcon size={14} />
                      <span>
                        {downloadingId === (row.id || row.transaction_record_id) ? 'Downloading...' : 'Tax Invoice'}
                      </span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showBankDialog && hasBank && (
        <BankDetailsDialog bank={bankInfo} onClose={closeBankDialog} />
      )}
    </div>
  );
}
