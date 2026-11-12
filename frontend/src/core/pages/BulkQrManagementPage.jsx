/**
 * BulkQrManagementPage Component (/registration/bulk-qr)
 * 
 * Dedicated Full-Page Bulk Physical QR Generator & Pre-Print Stock Station:
 * - Pre-generate collision-free 6-digit physical QR credentials in batches
 * - Track real-time stock levels: Total generated, Ready in Stock, Assigned to Delegates
 * - Printable A4 sticker/badge sheets (@media print) for direct on-site physical printing
 * - CSV export for badge printing factories / vendors
 * - Searchable and filterable badge inventory grid
 * - Zero dialog boxes / completely route-driven
 */

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../services/api';
import SearchInput from '../components/common/SearchInput';
import QrCode from '../components/common/QrCode';
import PrintPassesDialog from '../components/print/PrintPassesDialog';
import { passDataFromBadge, formatSequence, escapeHtml } from '../utils/passRenderer';
import { printInPage } from '../utils/printInPage';
import { useFestivalConfig } from '../hooks/useFestivalConfig';
import Pagination from '../components/common/Pagination';

import {
  ConfirmationNumberIcon, 
  PrintIcon, 
  UploadFileIcon, FileDownloadIcon, ArrowDropDownIcon, DescriptionIcon, 
  CheckCircleIcon,
  QrCodeScannerIcon, CloseIcon, VisibilityIcon
} from '../components/common/Icons';

const STATUS_LABEL = { unassigned: 'In stock', assigned: 'Assigned', lost: 'Lost' };
const PAGE_SIZES = [25, 50, 100];

function formatDay(value) {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function BulkQrManagementPage() {
  const navigate = useNavigate();
  const { currentFestival } = useFestivalConfig();

  const [stats, setStats] = useState({ total: 0, unassigned: 0, assigned: 0, lost: 0 });
  const [qrs, setQrs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [batchCount, setBatchCount] = useState(50);
  const [searchInput, setSearchInput] = useState(''); // what the user is typing
  const [search, setSearch] = useState('');           // debounced value sent to the API
  const [searching, setSearching] = useState(false);
  const poolRequestIdRef = useRef(0);
  const poolLoadedRef = useRef(false);

  // Sequence range filter (#from – #to), ADR 0001 Amendment 3
  const [seqFromInput, setSeqFromInput] = useState('');
  const [seqToInput, setSeqToInput] = useState('');
  const [seqRange, setSeqRange] = useState({ from: '', to: '' });

  // Debounce typing so the pool is fetched once the user pauses, not on every keystroke
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);
  useEffect(() => {
    const clean = (v) => String(v).replace(/\D/g, '').slice(0, 7);
    const t = setTimeout(() => setSeqRange({ from: clean(seqFromInput), to: clean(seqToInput) }), 300);
    return () => clearTimeout(t);
  }, [seqFromInput, seqToInput]);
  const hasSeqRange = Boolean(seqRange.from || seqRange.to);
  const [filterStatus, setFilterStatus] = useState('unassigned'); // 'unassigned' | 'all' | 'assigned'
  const [recentBatch, setRecentBatch] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [successBanner, setSuccessBanner] = useState(null);

  // Table pagination + View QR dialog
  const [pageSize, setPageSize] = useState(25);
  const [currentPage, setCurrentPage] = useState(1);
  const [qrModal, setQrModal] = useState(null);
  const [printJob, setPrintJob] = useState(null);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const downloadRef = useRef(null);

  // Close the Download menu on an outside click or Esc
  useEffect(() => {
    if (!downloadOpen) return undefined;
    const onDown = (e) => { if (downloadRef.current && !downloadRef.current.contains(e.target)) setDownloadOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setDownloadOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [downloadOpen]);
  const tableTopRef = useRef(null);

  useEffect(() => {
    if (!qrModal) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setQrModal(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [qrModal]);

  // Only the newest request updates the grid; after the first load the grid stays visible while refetching
  const fetchPool = async () => {
    const requestId = ++poolRequestIdRef.current;
    try {
      if (poolLoadedRef.current) setSearching(true); else setLoading(true);
      const res = await api.get('/registration/qr/pool', {
        params: { status: filterStatus, search, limit: 1000, seq_from: seqRange.from || undefined, seq_to: seqRange.to || undefined }
      });
      if (requestId !== poolRequestIdRef.current) return;
      if (res.data?.stats) setStats(res.data.stats);
      setQrs(res.data?.qrs || []);
      poolLoadedRef.current = true;
    } catch (err) {
      if (requestId !== poolRequestIdRef.current) return;
      console.error('Failed to load QR pool:', err);
      setErrorMessage('Failed to load physical QR badge pool statistics.');
    } finally {
      if (requestId === poolRequestIdRef.current) {
        setLoading(false);
        setSearching(false);
      }
    }
  };

  useEffect(() => {
    fetchPool();
  }, [filterStatus, search, seqRange]);

  // Reset to first page when filtering, searching, or changing row density
  useEffect(() => {
    setCurrentPage(1);
  }, [filterStatus, search, seqRange, pageSize]);

  // Calculate paginated slices ensuring complete, full rows without blank holes
  const totalFiltered = qrs.length;
  const effectivePageSize = pageSize;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / effectivePageSize));
  const validCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = totalFiltered > 0 ? (validCurrentPage - 1) * effectivePageSize : 0;
  const endIndex = Math.min(startIndex + effectivePageSize, totalFiltered);
  const currentQrs = qrs.slice(startIndex, endIndex);

  const handleGenerate = async () => {
    const qty = parseInt(batchCount, 10);
    if (!qty || qty <= 0) {
      setErrorMessage('Please enter a valid generation count (e.g. 50).');
      return;
    }

    try {
      setGenerating(true);
      setErrorMessage(null);
      const res = await api.post('/registration/qr/bulk-generate', { count: qty });
      if (res.data?.pool_stats) setStats(res.data.pool_stats);
      setRecentBatch(res.data?.sequence_range || null);
      const range = res.data?.sequence_range;
      const rangeText = range?.from ? ` Badge numbers ${formatSequence(range.from)}–${formatSequence(range.to)}.` : '';
      setSuccessBanner(`Generated ${res.data?.generated_count ?? qty} new badges (secure QR + 6-digit badge number).${rangeText}`);
      await fetchPool();
    } catch (err) {
      console.error('Failed to generate bulk QRs:', err);
      setErrorMessage(err.response?.data?.error || 'Failed to generate bulk QR codes.');
    } finally {
      setGenerating(false);
    }
  };

  const handleExportCsv = () => {
    if (!qrs || qrs.length === 0) {
      setErrorMessage('No QR badges available to export.');
      return;
    }
    const headers = ['Sequence', 'QR_ID', 'Badge_Number', 'QR_Payload', 'Status', 'Attendee_ID', 'Attendee_Name', 'Serial_No', 'Category', 'Created_At'];
    const rows = qrs.map(q => [
      q.sequence_no ?? '',
      q.qr_id,
      `"${q.badge_serial || ''}"`,
      `"${q.qr_data}"`,
      q.status,
      q.attendee_id || '',
      `"${q.attendee_name || ''}"`,
      q.attendee_serial || '',
      `"${q.attendee_category || ''}"`,
      q.created_at || ''
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${(currentFestival?.name || 'festival').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-badge-stock-${filterStatus}-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // PDF: a clean A4 list of the badges in view, opened in the print dialog ("Save as PDF")
  const handleExportPdf = () => {
    if (!qrs || qrs.length === 0) {
      setErrorMessage('No QR badges available to export.');
      return;
    }
    const festival = currentFestival?.name || 'Festival';
    const scope = STATUS_LABEL[filterStatus] ? `${STATUS_LABEL[filterStatus]} badges` : 'All badges';
    const date = new Date().toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
    const rows = qrs.map((q) => `
      <tr>
        <td class="seq">${escapeHtml(formatSequence(q.sequence_no))}</td>
        <td class="no">${escapeHtml(q.badge_serial || 'Legacy code')}</td>
        <td>${escapeHtml(STATUS_LABEL[q.status] || q.status)}</td>
        <td>${escapeHtml(q.status === 'unassigned' ? '' : (q.attendee_name || ''))}${q.attendee_serial && q.status === 'assigned' ? ` <span class="muted">${escapeHtml(q.attendee_serial)}</span>` : ''}</td>
        <td class="muted">${escapeHtml(formatDay(q.created_at))}</td>
      </tr>`).join('');
    printInPage(
      `<div class="list">
        <h1>${escapeHtml(festival)}</h1>
        <p class="sub">${escapeHtml(scope)} · ${qrs.length} ${qrs.length === 1 ? 'badge' : 'badges'} · ${escapeHtml(date)}</p>
        <table>
          <thead><tr><th>No.</th><th>Badge no.</th><th>Status</th><th>Delegate</th><th>Added</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`,
      `
        @page { size: A4 portrait; margin: 14mm; }
        #fc-print-root { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; color: #0f172a; }
        #fc-print-root h1 { font-size: 16pt; margin: 0 0 2mm; }
        #fc-print-root .sub { font-size: 9.5pt; color: #475569; margin: 0 0 6mm; }
        #fc-print-root table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
        #fc-print-root thead { display: table-header-group; }
        #fc-print-root th { text-align: left; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.05em; color: #475569; border-bottom: 0.4mm solid #0f172a; padding: 2mm 2mm; }
        #fc-print-root td { border-bottom: 0.2mm solid #e2e8f0; padding: 2mm 2mm; vertical-align: top; }
        #fc-print-root tr { break-inside: avoid; page-break-inside: avoid; }
        #fc-print-root .seq, #fc-print-root .no { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-weight: 700; }
        #fc-print-root .no { letter-spacing: 0.08em; }
        #fc-print-root .muted { color: #64748b; }
      `,
      `${festival} badge list ${new Date().toISOString().slice(0, 10)}`
    );
  };

  // Print dialog: Pass + QR or QR only, template and A4 layout (ADR 0005).
  // Lost badges are never printed (ADR 0001, Amendment 2). Badges print in number order
  // (#001 first), so each A4 page holds a run of numbers.
  const openPrint = (badges, title) => {
    const seq = (q) => (q.sequence_no === null || q.sequence_no === undefined ? Infinity : Number(q.sequence_no));
    const printableBadges = badges.filter(q => q.status !== 'lost').sort((a, b) => seq(a) - seq(b));
    if (printableBadges.length === 0) {
      setErrorMessage('No printable badges in the current view (lost badges are never printed).');
      return;
    }
    setPrintJob({
      title,
      items: printableBadges.map((q, i) => ({ data: passDataFromBadge(q, i + 1), categoryCode: '' }))
    });
  };

  const handlePrintSheet = () => openPrint(qrs, `Export QR: ${STATUS_LABEL[filterStatus] ? STATUS_LABEL[filterStatus].toLowerCase() + ' ' : ''}badges`);

  return (
    <div className="fc-bulk-qr-page animate-fade-in" style={{ paddingBottom: '80px', maxWidth: '1280px', margin: '0 auto' }}>
      {/* ── Breadcrumbs Navigation ────────────────────────────────────────── */}
      <nav style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--fc-text-secondary)', marginBottom: '16px' }}>
        <Link to="/audience" style={{ color: 'var(--fc-text-secondary)', textDecoration: 'none' }}>
          Audience
        </Link>
        <span>/</span>
        <span style={{ color: 'var(--fc-brand, var(--fc-brand-text))', fontWeight: 700 }}>
          Bulk Physical QR Stock
        </span>
      </nav>

      {/* ── Page Header ───────────────────────────────────────────────────── */}
      <div className="fc-bq-header" style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '24px',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0, color: 'var(--fc-text-main)', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <ConfirmationNumberIcon size={26} style={{ color: 'var(--fc-info-text)' }} />
            <span>Bulk Physical QR Generator & Pre-Print Pool</span>
          </h1>
          <p style={{ color: 'var(--fc-text-muted)', marginTop: '4px', fontSize: '0.9rem', margin: '4px 0 0 0' }}>
            Pre-generate, track, export, and print physical badges with guaranteed unique 6-digit codes ready for registration desk pairing.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => navigate('/registration/assign-qr')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '9px 18px',
              borderRadius: '8px',
              fontWeight: 700,
              fontSize: '0.88rem',
              cursor: 'pointer',
              background: 'var(--fc-brand)',
              color: '#ffffff',
              border: 'none',
              boxShadow: '0 2px 8px rgba(168, 47, 47, 0.28)',
              transition: 'background 0.15s ease'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--fc-brand-hover)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'var(--fc-brand)'}
          >
            <QrCodeScannerIcon size={15} />
            <span>Assign QR to Delegate</span>
          </button>

        </div>
      </div>

      {/* ── Flash Notification Banner ───────────────────────────────────────── */}
      {successBanner && (
        <div style={{
          marginBottom: '18px',
          padding: '12px 18px',
          borderRadius: '8px',
          background: 'rgba(22, 163, 74, 0.1)',
          border: '1px solid rgba(22, 163, 74, 0.3)',
          color: 'var(--fc-success-text)',
          fontWeight: 700,
          fontSize: '0.88rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          animation: 'fadeIn 0.2s ease-in-out'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CheckCircleIcon size={16} />
            <span>{successBanner}</span>
            {recentBatch?.from && (
              <button
                type="button"
                className="fc-bq-batch-link"
                onClick={() => { setSeqFromInput(String(recentBatch.from)); setSeqToInput(String(recentBatch.to)); setFilterStatus('all'); }}
              >
                Show this batch
              </button>
            )}
          </div>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setSuccessBanner(null)}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--fc-success-text)', fontSize: '1.1rem', padding: '0 4px' }}
          >
            <CloseIcon size={16} />
          </button>
        </div>
      )}

      {/* ── Error Notification Banner ───────────────────────────────────────── */}
      {errorMessage && (
        <div style={{
          marginBottom: '18px',
          padding: '12px 18px',
          borderRadius: '8px',
          background: 'var(--fc-danger-bg)',
          border: '1px solid var(--fc-danger-border)',
          color: 'var(--fc-danger-text)',
          fontWeight: 600,
          fontSize: '0.88rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div>{errorMessage}</div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--fc-danger-text)', fontSize: '1.1rem' }}
          >
            <CloseIcon size={16} />
          </button>
        </div>
      )}


      {/* ── Bulk Generator Controls & Print Bar ────────────────────────────── */}
      <div className="fc-bq-tools" style={{
        background: 'var(--fc-surface-card)',
        border: '1px solid var(--fc-border)',
        borderRadius: '14px',
        padding: '20px 24px',
        marginBottom: '24px',
        boxShadow: 'var(--shadow-sm)'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px'
        }}>
          {/* Left: Generator Batch Selector */}
          <div className="fc-bq-batch" style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--fc-text-main)' }}>
              Batch Quantity:
            </span>
            {[25, 50, 100, 250, 500].map(qty => (
              <button
                key={qty}
                type="button"
                onClick={() => setBatchCount(qty)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  border: batchCount === qty ? '2px solid var(--fc-brand)' : '1px solid var(--fc-border)',
                  background: batchCount === qty ? 'rgba(168, 47, 47, 0.1)' : 'var(--fc-surface)',
                  color: batchCount === qty ? 'var(--fc-brand-text)' : 'var(--fc-text-main)'
                }}
              >
                +{qty}
              </button>
            ))}

            <input
              type="number"
              min="1"
              max="2000"
              value={batchCount}
              onChange={(e) => setBatchCount(parseInt(e.target.value, 10) || '')}
              style={{
                width: '74px',
                padding: '6px 10px',
                borderRadius: '6px',
                border: '1px solid var(--fc-border)',
                background: 'var(--fc-surface)',
                color: 'var(--fc-text-main)',
                fontSize: '0.85rem',
                fontWeight: 700,
                textAlign: 'center'
              }}
            />

            <button
              type="button"
              disabled={generating || !batchCount}
              onClick={handleGenerate}
              style={{
                padding: '8px 22px',
                borderRadius: '8px',
                border: 'none',
                background: 'var(--fc-brand)',
                color: '#ffffff',
                fontWeight: 800,
                fontSize: '0.88rem',
                cursor: (generating || !batchCount) ? 'not-allowed' : 'pointer',
                opacity: (generating || !batchCount) ? 0.6 : 1,
                boxShadow: '0 2px 8px rgba(168, 47, 47, 0.35)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                whiteSpace: 'nowrap'
              }}
            >
              <ConfirmationNumberIcon size={16} />
              <span>{generating ? 'Generating Pool...' : `Generate ${batchCount} New QRs`}</span>
            </button>
          </div>

          {/* Right: Print & Export Actions */}
          <div className="fc-bq-actions" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              onClick={handlePrintSheet}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: '1px solid var(--fc-border)',
                background: 'var(--fc-surface)',
                color: 'var(--fc-text-main)',
                fontWeight: 700,
                fontSize: '0.85rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: 'var(--shadow-sm)'
              }}
              title="Export the QR codes in view: stickers or passes, on A4 or a card printer"
            >
              <PrintIcon size={16} />
              <span>Export QR</span>
            </button>

            <div className="fc-bq-download" ref={downloadRef}>
              <button
                type="button"
                className="fc-bq-download-btn"
                onClick={() => setDownloadOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={downloadOpen}
                title="Download the badges in view as a CSV file or a PDF list"
              >
                <FileDownloadIcon size={16} />
                <span>Download</span>
                <ArrowDropDownIcon size={18} />
              </button>
              {downloadOpen && (
                <div className="fc-bq-download-menu" role="menu">
                  <button type="button" role="menuitem" onClick={() => { setDownloadOpen(false); handleExportCsv(); }}>
                    <UploadFileIcon size={15} />
                    <span><strong>CSV</strong><small>Spreadsheet, for printing vendors</small></span>
                  </button>
                  <button type="button" role="menuitem" onClick={() => { setDownloadOpen(false); handleExportPdf(); }}>
                    <DescriptionIcon size={15} />
                    <span><strong>PDF</strong><small>Badge list on A4 (choose "Save as PDF")</small></span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Filter Tabs & Search Bar (Submission Page Style) ────────────────── */}
      <div className="fc-bq-filterbar" style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        borderBottom: '1px solid var(--fc-border)',
        marginBottom: '20px',
        gap: '16px',
        flexWrap: 'wrap'
      }}>
        {/* Scope Navigation Tabs */}
        <div className="scope-tabs-bar fc-bq-tabs" style={{ display: 'flex', alignItems: 'center', gap: '28px', borderBottom: 'none', margin: 0, padding: '0 4px' }}>
          <button
            type="button"
            className={`scope-tab-btn ${filterStatus === 'unassigned' ? 'active' : ''}`}
            onClick={() => { setFilterStatus('unassigned'); setCurrentPage(1); }}
          >
            Stock Available <span className="tab-badge">{stats.unassigned}</span>
          </button>
          <button
            type="button"
            className={`scope-tab-btn ${filterStatus === 'all' ? 'active' : ''}`}
            onClick={() => { setFilterStatus('all'); setCurrentPage(1); }}
          >
            All Badges <span className="tab-badge">{stats.total}</span>
          </button>
          <button
            type="button"
            className={`scope-tab-btn ${filterStatus === 'assigned' ? 'active' : ''}`}
            onClick={() => { setFilterStatus('assigned'); setCurrentPage(1); }}
          >
            Assigned <span className="tab-badge">{stats.assigned}</span>
          </button>
          {Number(stats.lost) > 0 && (
            <button
              type="button"
              className={`scope-tab-btn ${filterStatus === 'lost' ? 'active' : ''}`}
              onClick={() => { setFilterStatus('lost'); setCurrentPage(1); }}
            >
              Lost <span className="tab-badge">{stats.lost}</span>
            </button>
          )}
        </div>

        <div className="fc-bq-filters">
        {/* Sequence range: show (and print) badges #from–#to */}
        <div className="fc-bq-seqrange" role="group" aria-label="Badge sequence range">
          <span className="fc-bq-seqrange-label">No.</span>
          <input type="text" inputMode="numeric" placeholder="from" value={seqFromInput} onChange={(e) => setSeqFromInput(e.target.value)} aria-label="From badge number" />
          <span aria-hidden="true">–</span>
          <input type="text" inputMode="numeric" placeholder="to" value={seqToInput} onChange={(e) => setSeqToInput(e.target.value)} aria-label="To badge number" />
          {(seqFromInput || seqToInput) && (
            <button type="button" className="fc-bq-seqrange-clear" onClick={() => { setSeqFromInput(''); setSeqToInput(''); }} aria-label="Clear number range">
              <CloseIcon size={12} />
            </button>
          )}
        </div>

        {/* Search Input on the right */}
        <div className="fc-bq-search" style={{ paddingBottom: '6px', display: 'flex', flex: '0 1 280px', minWidth: '200px' }}>
          <SearchInput
            value={searchInput}
            onChange={setSearchInput}
            loading={searching}
            placeholder="Search badge no., #no., name or phone"
            maxWidth="320px"
          />
        </div>
        </div>
      </div>

      {/* ── Badges Inventory Grid ───────────────────────────────────────────── */}
      <div className="fc-bq-pool" style={{
        background: 'var(--fc-surface-card)',
        border: '1px solid var(--fc-border)',
        borderRadius: '14px',
        padding: '24px',
        boxShadow: 'var(--shadow-sm)',
        minHeight: '360px'
      }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '80px', color: 'var(--fc-text-muted)', fontSize: '0.92rem' }}>
            Loading physical badge pool...
          </div>
        ) : qrs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--fc-text-muted)' }}>
            <div style={{ marginBottom: '12px' }}><ConfirmationNumberIcon size={40} style={{ color: 'var(--fc-text-muted)' }} /></div>
            <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--fc-text-main)', marginBottom: '6px' }}>
              {search ? `No badges match "${search}"` : hasSeqRange ? 'No badges in this number range' : 'No QR badges found for this filter'}
            </div>
            <div style={{ fontSize: '0.85rem', maxWidth: '440px', margin: '0 auto 18px auto' }}>
              {search ? (
                <button type="button" className="fc-btn fc-btn-outline" onClick={() => setSearchInput('')} style={{ padding: '7px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                  Clear search
                </button>
              ) : (
                <>Click <strong>"Generate New QRs"</strong> above to produce pre-printed physical stock, or switch filters to view other badge states.</>
              )}
            </div>
          </div>
        ) : (
          <div>
            <div ref={tableTopRef} className="fc-bq-table-wrap">
              <table className="fc-bq-table">
                <thead>
                  <tr>
                    <th className="fc-bq-th-seq">No.</th>
                    <th>Badge no.</th>
                    <th>Status</th>
                    <th>Delegate</th>
                    <th>Added</th>
                    <th className="fc-bq-th-actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {currentQrs.map((item) => {
                    const isLegacy = !item.badge_serial;
                    const code = item.badge_serial || item.qr_data || '';
                    return (
                      <tr key={item.qr_id} className={`is-${item.status}`}>
                        <td className="fc-bq-c-seq" data-label="No.">
                          <span className="fc-bq-seq" title="Sequence: the order this badge was generated in for this festival">{formatSequence(item.sequence_no) || '—'}</span>
                        </td>
                        <td className="fc-bq-c-badge" data-label="Badge no.">
                          {isLegacy ? (
                            <span className="fc-bq-legacy" title={code}>
                              <span className="fc-bq-legacy-tag">Legacy code</span>
                              <span className="fc-bq-legacy-code">{code}</span>
                            </span>
                          ) : (
                            <span className="fc-bq-serial">{code}</span>
                          )}
                        </td>
                        <td className="fc-bq-c-status" data-label="Status">
                          <span className={`fc-bq-status is-${item.status}`}>{STATUS_LABEL[item.status] || item.status}</span>
                        </td>
                        <td className={`fc-bq-c-delegate ${item.status === 'unassigned' ? 'is-empty' : ''}`} data-label="Delegate">
                          {item.status === 'assigned' ? (
                            <>
                              <span className="fc-bq-del-name">{item.attendee_name || 'Delegate'}</span>
                              {item.attendee_serial && <span className="fc-bq-del-meta">{item.attendee_serial}</span>}
                            </>
                          ) : item.status === 'lost' ? (
                            <>
                              <span className="fc-bq-del-name">{item.attendee_name ? `Was ${item.attendee_name}'s` : 'Not linked'}</span>
                              {item.lost_at && <span className="fc-bq-del-meta">Lost {formatDay(item.lost_at)}</span>}
                            </>
                          ) : (
                            <span className="fc-bq-del-meta">—</span>
                          )}
                        </td>
                        <td className="fc-bq-c-added" data-label="Added">{formatDay(item.created_at)}</td>
                        <td className="fc-bq-c-actions">
                          <button type="button" className="fc-bq-icon-btn" onClick={() => setQrModal(item)} title="View QR" aria-label={`View QR for badge ${code}`}>
                            <VisibilityIcon size={16} />
                          </button>
                          {item.status === 'unassigned' && (
                            <button type="button" className="fc-bq-action is-primary" onClick={() => navigate(`/registration/assign-qr?code=${encodeURIComponent(item.qr_data)}`)}>
                              Pair with delegate
                            </button>
                          )}
                          {item.status === 'assigned' && item.attendee_id && (
                            <button type="button" className="fc-bq-action" onClick={() => navigate(`/registration/edit/${item.attendee_id}`)}>
                              Open delegate
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* ── Pagination ───────────────────────────────────────────── */}
            <div className="fc-pg-bar fc-bq-pager">
              <div className="fc-bq-pager-left">
                <span className="fc-pg-summary">
                  Showing <strong>{totalFiltered > 0 ? startIndex + 1 : 0}</strong>–<strong>{endIndex}</strong> of <strong>{totalFiltered}</strong> badges
                </span>
                <label className="fc-bq-pagesize">
                  Rows per page
                  <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
                    {PAGE_SIZES.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
              </div>
              <Pagination
                page={validCurrentPage}
                totalPages={totalPages}
                onChange={(p) => {
                  setCurrentPage(p);
                  requestAnimationFrame(() => tableTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── View QR dialog ──────────────────────────────────────────────────── */}
      {qrModal && (
        <div className="fc-modal-overlay" onClick={() => setQrModal(null)}>
          <div className="fc-modal-card fc-bq-qr-dialog" role="dialog" aria-modal="true" aria-labelledby="fc-bq-qr-title" onClick={(e) => e.stopPropagation()}>
            <div className="fc-modal-header">
              <div>
                <h2 id="fc-bq-qr-title" style={{ margin: 0, fontSize: '1.05rem', color: 'var(--fc-text-main)' }}>
                  {[qrModal.sequence_no ? `Badge ${formatSequence(qrModal.sequence_no)}` : 'Badge', qrModal.badge_serial].filter(Boolean).join(' · ')}
                </h2>
                <div style={{ fontSize: '0.78rem', color: 'var(--fc-text-muted)', marginTop: '2px' }}>
                  {currentFestival?.name || 'Festival'} · Delegate pass badge
                </div>
              </div>
              <button type="button" className="fc-modal-close" onClick={() => setQrModal(null)} aria-label="Close">
                <CloseIcon size={14} />
              </button>
            </div>
            <div className="fc-bq-qr-body">
              <div className={`fc-bq-qr-box ${qrModal.status === 'lost' ? 'is-lost' : ''}`}>
                <QrCode value={qrModal.qr_data} size={240} />
              </div>
              <div className="fc-bq-qr-code">{qrModal.badge_serial || qrModal.qr_data}</div>
              <span className={`fc-bq-status is-${qrModal.status}`}>{STATUS_LABEL[qrModal.status] || qrModal.status}</span>
              {qrModal.status === 'assigned' && (
                <p className="fc-bq-qr-note">Assigned to <strong>{qrModal.attendee_name || 'a delegate'}</strong>{qrModal.attendee_serial ? ` (${qrModal.attendee_serial})` : ''}</p>
              )}
              {qrModal.status === 'lost' && (
                <p className="fc-bq-qr-note is-lost">
                  Reported lost{qrModal.lost_at ? ` on ${formatDay(qrModal.lost_at)}` : ''}{qrModal.attendee_name ? `, was ${qrModal.attendee_name}'s` : ''}. This badge can't be used or printed.
                </p>
              )}
            </div>
            <div className="fc-modal-footer fc-bq-qr-footer">
              <button type="button" className="fc-bq-action" onClick={() => setQrModal(null)}>Close</button>
              {qrModal.status !== 'lost' && (
                <button type="button" className="fc-bq-action" onClick={() => { const badge = qrModal; setQrModal(null); openPrint([badge], `Print badge ${badge.badge_serial || ''}`.trim()); }}>
                  <PrintIcon size={14} /> Print this badge
                </button>
              )}
              {qrModal.status === 'unassigned' && (
                <button type="button" className="fc-bq-action is-primary" onClick={() => navigate(`/registration/assign-qr?code=${encodeURIComponent(qrModal.qr_data)}`)}>
                  Pair with delegate
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {printJob && (
        <PrintPassesDialog
          items={printJob.items}
          defaultMode="full"
          title={printJob.title}
          jobTitle={`${currentFestival?.name || 'Festival'} badges`}
          onClose={() => setPrintJob(null)}
        />
      )}
    </div>
  );
}

