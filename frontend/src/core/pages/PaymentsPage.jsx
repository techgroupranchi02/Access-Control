/**
 * Payments & Payouts Page
 * Matches https://ffestiplus.autovertest.com/payouts with full data fidelity,
 * metric cards, tab navigation, search/sort, CSV export, and PDF Tax Invoice downloads.
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import api from '../services/api';
import { useFestivalConfig } from '../hooks/useFestivalConfig';
import {
  SearchIcon,
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
  const [ledger, setLedger] = useState([]);
  const [totalItems, setTotalItems] = useState(0);
  const [page, setPage] = useState(1);
  const perPage = 10;

  // Tabs: 0: Settled, 1: Pending, 2: Refunded
  const [tabIndex, setTabIndex] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('recent');
  const [viewMode, setViewMode] = useState('list'); // 'list' or 'grid'

  // Fetch Payouts data based on current tab & search
  const fetchPayoutsData = useCallback(async (tabIdx, searchVal = '', pageNum = 1, sortVal = 'recent') => {
    setLoading(true);
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
      console.error('Failed to load payouts:', err);
    } finally {
      setLoading(false);
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
    fetchPayoutsData(newIndex, searchTerm, 1, sortBy);
  };

  // Search input handler
  const handleSearchChange = (e) => {
    const val = e.target.value;
    setSearchTerm(val);
    setPage(1);
    fetchPayoutsData(tabIndex, val, 1, sortBy);
  };

  // Sort dropdown
  const handleSortChange = (e) => {
    const val = e.target.value;
    setSortBy(val);
    fetchPayoutsData(tabIndex, searchTerm, page, val);
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

  const festivalName = currentFestival?.name || currentFestival?.title || 'KASHISH x BENGALURU 2026';
  const hasBank = Boolean(bankInfo && (bankInfo.bank_name || bankInfo.account_number_masked));
  const bankName = bankInfo?.bank_name || 'State Bank of India';
  const maskedAcc = bankInfo?.account_number_masked || '••••8399';

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
              background: '#881337',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '18px',
              flexShrink: 0,
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
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              background: 'rgba(34, 197, 94, 0.1)',
              padding: '7px 16px',
              borderRadius: '20px',
              border: '1px solid #bbf7d0',
              color: '#15803d',
              fontWeight: 700,
              fontSize: '13px',
            }}
          >
            <BankIcon size={16} style={{ color: '#16a34a' }} />
            <span>Settlement: {bankName} ({maskedAcc})</span>
          </div>
        )}
      </div>

      {/* ── 4 Metric KPI Summary Cards ──────────────────────────────── */}
      <div
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
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#16a34a' }}>
              100% Completed
            </div>
          </div>
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '50%',
              background: '#e0f2fe',
              color: '#0284c7',
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
              borderRadius: '50%',
              background: '#dcfce7',
              color: '#16a34a',
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
            <div style={{ fontSize: '28px', fontWeight: 800, color: '#dc2626', margin: '4px 0' }}>
              -₹{Number(kpis.total_deductions || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
            <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--fc-text-muted, #64748b)' }}>
              Freecomers Fee, Gateway & Taxes
            </div>
          </div>
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '50%',
              background: '#ffedd5',
              color: '#ea580c',
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
            border: '1.5px solid #22c55e',
            background: 'var(--fc-surface-card, #ffffff)',
            padding: '20px',
            boxShadow: '0 2px 8px rgba(34, 197, 94, 0.08)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
          }}
        >
          <div>
            <div style={{ fontSize: '13px', color: '#16a34a', fontWeight: 700 }}>
              Net Settled to Bank
            </div>
            <div style={{ fontSize: '28px', fontWeight: 800, color: '#16a34a', margin: '4px 0' }}>
              ₹{Number(kpis.net_settled_to_bank || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
            <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--fc-text-muted, #64748b)' }}>
              {hasBank ? `${bankName} ${maskedAcc}` : 'No bank account linked'}
            </div>
          </div>
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '50%',
              background: '#f3e8ff',
              color: '#9333ea',
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
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px', width: '100%' }}>
        <div
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
              color: tabIndex === 0 ? '#881337' : 'var(--fc-text-muted, #64748b)',
              borderBottom: tabIndex === 0 ? '2.5px solid #881337' : '2.5px solid transparent',
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
              color: tabIndex === 1 ? '#881337' : 'var(--fc-text-muted, #64748b)',
              borderBottom: tabIndex === 1 ? '2.5px solid #881337' : '2.5px solid transparent',
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
              color: tabIndex === 2 ? '#dc2626' : 'var(--fc-text-muted, #64748b)',
              borderBottom: tabIndex === 2 ? '2.5px solid #dc2626' : '2.5px solid transparent',
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
                  background: '#fee2e2',
                  color: '#dc2626',
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

          {/* Controls: Search, Sort, CSV Export, View Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            {/* Search Input */}
            <div style={{ position: 'relative', width: '260px' }}>
              <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--fc-text-muted, #94a3b8)', display: 'flex' }}>
                <SearchIcon size={16} />
              </span>
              <input
                type="text"
                placeholder="Search by name, email, or phone"
                value={searchTerm}
                onChange={handleSearchChange}
                style={{
                  width: '100%',
                  padding: '8px 12px 8px 36px',
                  borderRadius: '30px',
                  border: '1px solid var(--fc-border, #e2e8f0)',
                  background: 'var(--fc-surface-card, #ffffff)',
                  fontSize: '13px',
                  outline: 'none',
                  color: 'var(--fc-text-main, #0f172a)',
                }}
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('');
                    fetchPayoutsData(tabIndex, '', 1, sortBy);
                  }}
                  style={{
                    position: 'absolute',
                    right: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--fc-text-muted, #94a3b8)',
                    padding: 0,
                  }}
                >
                  <CloseIcon size={14} />
                </button>
              )}
            </div>

            {/* Sort Dropdown */}
            <select
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
              onClick={handleExportCsv}
              style={{
                background: '#881337',
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
                boxShadow: 'none',
                transition: 'background 0.15s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#9f1239')}
              onMouseLeave={(e) => (e.currentTarget.style.background = '#881337')}
            >
              <FileDownloadIcon size={16} />
              <span>CSV Export</span>
            </button>

            {/* View Mode Toggle: Grid vs List */}
            <div
              style={{
                display: 'flex',
                background: '#f8fafc',
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
                  background: viewMode === 'grid' ? '#ffffff' : 'transparent',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '5px 8px',
                  cursor: 'pointer',
                  color: viewMode === 'grid' ? '#881337' : '#94a3b8',
                  boxShadow: viewMode === 'grid' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
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
                  background: viewMode === 'list' ? '#ffffff' : 'transparent',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '5px 8px',
                  cursor: 'pointer',
                  color: viewMode === 'list' ? '#881337' : '#94a3b8',
                  boxShadow: viewMode === 'list' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <ListIcon size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Content Section */}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
            <div className="skeleton" style={{ width: '40px', height: '40px', borderRadius: '50%' }}></div>
          </div>
        ) : sortedLedger.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--fc-text-muted, #64748b)' }}>
            <div style={{ fontSize: '15px', fontWeight: 600 }}>
              {tabIndex === 2
                ? 'No refunded submissions found for this festival.'
                : 'No submission payouts found for this filter.'}
            </div>
          </div>
        ) : viewMode === 'list' ? (
          /* ── Table View Mode ───────────────────────────────────────── */
          <div className="table-container" style={{ overflowX: 'auto', width: '100%' }}>
            <table className="table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#fafafa', borderBottom: '1px solid #f1f5f9' }}>
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
                    <span title="6% Freecomers Fee + Razorpay Route fee & taxes" style={{ marginLeft: '4px', cursor: 'pointer', verticalAlign: 'middle' }}>
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
                      style={{
                        borderBottom: '1px solid #f1f5f9',
                        background: isRefunded ? 'rgba(254, 242, 242, 0.5)' : 'inherit',
                      }}
                    >
                      <td style={{ padding: '14px 16px', color: 'var(--fc-text-muted, #64748b)', fontWeight: 600, fontSize: '13px' }}>
                        {(page - 1) * perPage + idx + 1}
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ fontWeight: 700, color: 'var(--fc-text-main, #0f172a)', fontSize: '13px' }}>
                          {row.filmmaker_name || '—'}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--fc-text-muted, #94a3b8)', marginTop: '2px' }}>
                          {row.filmmaker_email || ''}
                        </div>
                      </td>
                      <td style={{ padding: '14px 16px', fontWeight: 700, color: 'var(--fc-text-main, #0f172a)', fontSize: '13px' }}>
                        {row.film_title || '—'}
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <span
                          style={{
                            background: '#e0f2fe',
                            color: '#0284c7',
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
                      <td style={{ padding: '14px 16px', fontWeight: 700, color: 'var(--fc-text-main, #0f172a)', fontSize: '13px' }}>
                        ₹{fee.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: '14px 16px', fontWeight: 700, color: '#dc2626', fontSize: '13px' }}>
                        <span
                          title={`Freecomers Platform Fee (6%): ₹${platformFee.toFixed(2)} | Route Transfer Fee (0.25%) + GST: ₹${routeTotal.toFixed(2)}`}
                          style={{ cursor: 'pointer', textDecoration: 'underline dotted' }}
                        >
                          -₹{deductions.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                      </td>
                      <td style={{ padding: '14px 16px', fontWeight: 800, fontSize: '13px' }}>
                        {isRefunded ? (
                          <div>
                            <span style={{ textDecoration: 'line-through', color: 'var(--fc-text-muted, #94a3b8)', display: 'block', fontSize: '11px' }}>
                              ₹{netPayout.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </span>
                            <span style={{ fontWeight: 800, color: '#dc2626' }}>
                              -₹{netPayout.toLocaleString('en-IN', { minimumFractionDigits: 2 })} (Reversed)
                            </span>
                          </div>
                        ) : (
                          <span style={{ color: '#16a34a' }}>
                            ₹{netPayout.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <span
                          style={{
                            color: '#0284c7',
                            fontWeight: 600,
                            fontSize: '12px',
                            fontFamily: 'monospace',
                            background: '#f0f9ff',
                            border: '1px solid #e0f2fe',
                            padding: '2px 8px',
                            borderRadius: '6px',
                            display: 'inline-block',
                          }}
                        >
                          {transferId}
                        </span>
                        {isRefunded && row.reverse_transfer_id && (
                          <div style={{ color: '#dc2626', fontWeight: 700, fontSize: '11px', fontFamily: 'monospace', marginTop: '4px' }}>
                            ↺ Reversal: {row.reverse_transfer_id}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() => handleDownloadReceipt(row)}
                          disabled={downloadingId === (row.id || row.transaction_record_id)}
                          style={{
                            border: '1px solid #fecdd3',
                            color: '#9f1239',
                            background: '#fff1f2',
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
                            e.currentTarget.style.background = '#ffe4e6';
                            e.currentTarget.style.borderColor = '#fb7185';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = '#fff1f2';
                            e.currentTarget.style.borderColor = '#fecdd3';
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
          <div style={{ padding: '24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
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
                    border: isRefunded ? '1.5px solid #fca5a5' : '1px solid var(--fc-border, #e2e8f0)',
                    background: isRefunded ? '#fffbfb' : 'var(--fc-surface-card, #ffffff)',
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
                          background: '#f0f9ff',
                          color: '#0284c7',
                          border: '1px solid #bae6fd',
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
                        background: '#f8fafc',
                        border: '1px solid #edf2f7',
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
                        <span style={{ fontWeight: 700, color: '#dc2626' }}>
                          -₹{deductions.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '8px', display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontWeight: 700, color: isRefunded ? '#dc2626' : '#16a34a' }}>
                          {isRefunded ? 'Net Reversed' : 'Net Payout'}
                        </span>
                        <span style={{ fontWeight: 800, color: isRefunded ? '#dc2626' : '#16a34a' }}>
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
                          color: '#0284c7',
                          fontWeight: 700,
                          fontFamily: 'monospace',
                          background: '#f0f9ff',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          border: '1px solid #e0f2fe',
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
                        border: '1px solid #fecdd3',
                        color: '#9f1239',
                        background: '#fff1f2',
                        borderRadius: '10px',
                        padding: '8px',
                        fontWeight: 700,
                        fontSize: '13px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
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
    </div>
  );
}
