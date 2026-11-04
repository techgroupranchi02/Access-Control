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
import QrCode, { qrSvgMarkup } from '../components/common/QrCode';
import {
  ConfirmationNumberIcon, 
  PrintIcon, 
  UploadFileIcon, 
  CheckCircleIcon,
  QrCodeScannerIcon, CloseIcon
} from '../components/common/Icons';

export default function BulkQrManagementPage() {
  const navigate = useNavigate();

  const [stats, setStats] = useState({ total: 0, unassigned: 0, assigned: 0 });
  const [qrs, setQrs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [batchCount, setBatchCount] = useState(50);
  const [searchInput, setSearchInput] = useState(''); // what the user is typing
  const [search, setSearch] = useState('');           // debounced value sent to the API
  const [searching, setSearching] = useState(false);
  const poolRequestIdRef = useRef(0);
  const poolLoadedRef = useRef(false);

  // Debounce typing so the pool is fetched once the user pauses, not on every keystroke
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);
  const [filterStatus, setFilterStatus] = useState('unassigned'); // 'unassigned' | 'all' | 'assigned'
  const [recentBatch, setRecentBatch] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [successBanner, setSuccessBanner] = useState(null);

  // Dynamic full-row pagination states
  const gridContainerRef = useRef(null);
  const [columnsCount, setColumnsCount] = useState(7);
  const [rowsPerPage, setRowsPerPage] = useState(3); // 3 complete rows by default
  const [currentPage, setCurrentPage] = useState(1);

  // Dynamically compute how many card columns fit in the container to always display 100% full rows
  useEffect(() => {
    const el = gridContainerRef.current;
    if (!el) return;

    const updateColumns = () => {
      const width = el.clientWidth;
      if (!width) return;
      // Each card has min 190px + 18px gap = ~208px per column slot
      const cols = Math.max(1, Math.floor((width + 18) / 208));
      setColumnsCount(cols);
    };

    updateColumns();

    let ro;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => updateColumns());
      ro.observe(el);
    } else {
      window.addEventListener('resize', updateColumns);
    }

    return () => {
      if (ro) ro.disconnect();
      else window.removeEventListener('resize', updateColumns);
    };
  }, []);

  // Only the newest request updates the grid; after the first load the grid stays visible while refetching
  const fetchPool = async () => {
    const requestId = ++poolRequestIdRef.current;
    try {
      if (poolLoadedRef.current) setSearching(true); else setLoading(true);
      const res = await api.get('/registration/qr/pool', {
        params: { status: filterStatus, search, limit: 1000 }
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
  }, [filterStatus, search]);

  // Reset to first page when filtering, searching, or changing row density
  useEffect(() => {
    setCurrentPage(1);
  }, [filterStatus, search, rowsPerPage]);

  // Calculate paginated slices ensuring complete, full rows without blank holes
  const totalFiltered = qrs.length;
  const isAll = rowsPerPage === 'all';
  const effectivePageSize = isAll ? Math.max(1, totalFiltered) : Math.max(1, columnsCount * rowsPerPage);
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
      setRecentBatch(res.data?.batch || []);
      setSuccessBanner(`Successfully generated ${res.data?.generated_count ?? qty} new physical badges (secure QR + 6-digit badge number).`);
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
    const headers = ['QR_ID', 'Badge_Number', 'QR_Payload', 'Status', 'Attendee_ID', 'Attendee_Name', 'Serial_No', 'Category', 'Created_At'];
    const rows = qrs.map(q => [
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
    link.setAttribute('download', `kashish_physical_qr_pool_${filterStatus}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrintSheet = () => {
    const badgesToPrint = qrs.slice(0, 120);
    if (badgesToPrint.length === 0) {
      setErrorMessage('No badges to print in current view.');
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow popups to print physical badge sheets.');
      return;
    }

    const badgeCardsHtml = badgesToPrint.map((item, idx) => `
      <div class="badge-card">
        <div class="festival-title">KASHISH 2026</div>
        <div class="badge-subtitle">DELEGATE PASS BADGE</div>
        <div class="qr-container">
          <div class="qr-wrap">
            <div>${qrSvgMarkup(item.qr_data, 180)}</div>
            <div class="stock-index">#${String(idx + 1).padStart(3, '0')}</div>
          </div>
        </div>
        <div class="code-box">${item.badge_serial ? 'BADGE NO: ' + item.badge_serial : 'CODE: ' + item.qr_data}</div>
      </div>
    `).join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Print Physical QR Badges - KASHISH 2026</title>
          <style>
            @page {
              size: A4 portrait;
              margin: 10mm;
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              margin: 0;
              padding: 0;
              color: #0f172a;
              background: #fff;
            }
            .grid {
              display: grid;
              grid-template-columns: repeat(3, 1fr);
              gap: 8mm;
            }
            .badge-card {
              border: 1.5px dashed #cbd5e1;
              border-radius: 8px;
              padding: 12px 10px;
              text-align: center;
              box-sizing: border-box;
              page-break-inside: avoid;
            }
            .festival-title {
              font-size: 10px;
              font-weight: 800;
              letter-spacing: 0.05em;
              color: #a82f2f;
              text-transform: uppercase;
              margin-bottom: 2px;
            }
            .badge-subtitle {
              font-size: 8px;
              font-weight: 700;
              color: #64748b;
              margin-bottom: 8px;
              letter-spacing: 0.02em;
            }
            .qr-container {
              display: flex;
              justify-content: center;
              margin-bottom: 8px;
            }
            .qr-container svg {
              width: 125px;
              height: 125px;
              display: block;
            }
            /* QR + stock number: the number sits vertically on the right, centred on the QR */
            .qr-wrap {
              position: relative;
              display: inline-block;
            }
            .stock-index {
              position: absolute;
              left: 100%;
              top: 50%;
              transform: translateY(-50%);
              margin-left: 4px;
              writing-mode: vertical-rl;
              font-size: 7pt;
              font-weight: 700;
              color: #64748b;
              letter-spacing: 0.08em;
              white-space: nowrap;
            }
            .code-box {
              font-family: monospace;
              font-size: 13px;
              font-weight: 800;
              background: #f1f5f9;
              padding: 4px 6px;
              border-radius: 4px;
              display: inline-block;
              letter-spacing: 0.12em;
              margin-bottom: 4px;
            }
          </style>
        </head>
        <body>
          <div class="grid">
            ${badgeCardsHtml}
          </div>
          <script>
            window.onload = function() {
              window.print();
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

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
      <div style={{
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
          </div>
          <button
            type="button"
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
      <div style={{
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
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
              title="Print standard A4 3-column sticker sheets"
            >
              <PrintIcon size={16} />
              <span>Print Sticker Sheets</span>
            </button>

            <button
              type="button"
              onClick={handleExportCsv}
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
              title="Export CSV for physical badge printing vendors"
            >
              <UploadFileIcon size={16} />
              <span>Export CSV</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Filter Tabs & Search Bar (Submission Page Style) ────────────────── */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        borderBottom: '1px solid var(--fc-border)',
        marginBottom: '20px',
        gap: '16px',
        flexWrap: 'wrap'
      }}>
        {/* Scope Navigation Tabs */}
        <div className="scope-tabs-bar" style={{ display: 'flex', alignItems: 'center', gap: '28px', borderBottom: 'none', margin: 0, padding: '0 4px' }}>
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
        </div>

        {/* Search Input on the right */}
        <div style={{ paddingBottom: '6px', display: 'flex', flex: '0 1 320px', minWidth: '220px' }}>
          <SearchInput
            value={searchInput}
            onChange={setSearchInput}
            loading={searching}
            placeholder="Search badge no., name, phone or email"
            maxWidth="320px"
          />
        </div>
      </div>

      {/* ── Badges Inventory Grid ───────────────────────────────────────────── */}
      <div style={{
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
              {search ? `No badges match "${search}"` : 'No QR badges found for this filter'}
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
            <div 
              ref={gridContainerRef}
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))',
                gap: '18px'
              }}
            >
              {currentQrs.map((item) => {
                const isAssigned = Boolean(item.attendee_id);
                const codeStr = String(item.badge_serial || item.qr_data || '');
                const isCompactCode = codeStr.length <= 8;

                return (
                  <div
                    key={item.qr_id}
                    style={{
                      background: 'var(--fc-surface)',
                      border: isAssigned ? '1px solid rgba(59, 130, 246, 0.35)' : '1px solid var(--fc-border)',
                      borderRadius: '12px',
                      padding: '16px 14px',
                      textAlign: 'center',
                      boxShadow: 'var(--shadow-sm)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      minHeight: '280px',
                      boxSizing: 'border-box',
                      overflow: 'hidden',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--fc-brand-text)', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: '2px' }}>
                        KASHISH 2026
                      </div>
                      <div style={{ fontSize: '0.64rem', fontWeight: 600, color: 'var(--fc-text-muted)', marginBottom: '10px' }}>
                        DELEGATE PASS BADGE
                      </div>

                      <div style={{ background: '#ffffff', padding: '8px', borderRadius: '8px', border: '1px solid var(--fc-border)', marginBottom: '10px', boxShadow: 'inset 0 0 4px rgba(0,0,0,0.05)' }}>
                        <QrCode value={item.qr_data} size={120} />
                      </div>
                    </div>

                    <div style={{ width: '100%', boxSizing: 'border-box' }}>
                      <div 
                        title={codeStr}
                        style={{
                          width: '100%',
                          maxWidth: '100%',
                          boxSizing: 'border-box',
                          fontFamily: 'monospace',
                          fontSize: isCompactCode ? '1.05rem' : '0.8rem',
                          fontWeight: 900,
                          letterSpacing: isCompactCode ? '0.12em' : '0.02em',
                          color: 'var(--fc-text-main)',
                          background: 'var(--fc-surface-card)',
                          border: '1px solid var(--fc-border)',
                          padding: '4px 8px',
                          borderRadius: '6px',
                          marginBottom: '8px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          textAlign: 'center'
                        }}
                      >
                        {codeStr}
                      </div>

                      {isAssigned ? (
                        <div style={{
                          width: '100%',
                          boxSizing: 'border-box',
                          background: 'rgba(37, 99, 235, 0.06)',
                          border: '1px solid rgba(37, 99, 235, 0.2)',
                          borderRadius: '6px',
                          padding: '6px 8px',
                          textAlign: 'center',
                          overflow: 'hidden'
                        }}>
                          <div 
                            style={{ 
                              fontSize: '0.76rem', 
                              fontWeight: 700, 
                              color: 'var(--fc-info-text)', 
                              overflow: 'hidden', 
                              textOverflow: 'ellipsis', 
                              whiteSpace: 'nowrap' 
                            }}
                            title={`Assigned to ${item.attendee_name || 'Delegate'}`}
                          >
                            Assigned: {item.attendee_name || 'Delegate'}
                          </div>
                          <div style={{ 
                            fontSize: '0.68rem', 
                            fontWeight: 600, 
                            color: 'var(--fc-text-muted)', 
                            fontFamily: 'monospace', 
                            marginTop: '2px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}>
                            {item.attendee_serial || '—'}
                          </div>
                        </div>
                      ) : (
                        <div style={{ width: '100%' }}>
                          <button
                            type="button"
                            onClick={() => navigate(`/registration/assign-qr?code=${encodeURIComponent(item.qr_data)}`)}
                            style={{
                              width: '100%',
                              padding: '6px 10px',
                              borderRadius: '6px',
                              border: '1px solid var(--fc-border)',
                              background: 'var(--fc-surface-card)',
                              color: 'var(--fc-brand, var(--fc-brand-text))',
                              fontSize: '0.76rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                              transition: 'all 0.15s ease'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.borderColor = 'var(--fc-brand)';
                              e.currentTarget.style.background = 'rgba(168, 47, 47, 0.08)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.borderColor = 'var(--fc-border)';
                              e.currentTarget.style.background = 'var(--fc-surface-card)';
                            }}
                          >
                            Pair with Delegate
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ── Pagination Controls Toolbar ────────────────────────────── */}
            <div style={{
              marginTop: '28px',
              paddingTop: '18px',
              borderTop: '1px solid var(--fc-border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '14px'
            }}>
              {/* Left Info & Per Page Options */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                <div style={{ fontSize: '0.84rem', color: 'var(--fc-text-secondary)', fontWeight: 500 }}>
                  Showing <strong>{totalFiltered > 0 ? startIndex + 1 : 0}</strong>–<strong>{endIndex}</strong> of <strong>{totalFiltered}</strong> physical badges
                  {totalPages > 1 && <span> (Page <strong>{validCurrentPage}</strong> of <strong>{totalPages}</strong>)</span>}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: 'var(--fc-text-muted)' }}>
                  <span>Rows:</span>
                  {[
                    { label: '3 Rows', val: 3 },
                    { label: '4 Rows', val: 4 },
                    { label: '5 Rows', val: 5 },
                    { label: 'All', val: 'all' }
                  ].map(opt => {
                    const isSelected = rowsPerPage === opt.val;
                    return (
                      <button
                        key={opt.label}
                        type="button"
                        onClick={() => { setRowsPerPage(opt.val); setCurrentPage(1); }}
                        style={{
                          padding: '3px 9px',
                          borderRadius: '6px',
                          border: isSelected ? '1px solid var(--fc-brand)' : '1px solid var(--fc-border)',
                          background: isSelected ? 'rgba(168, 47, 47, 0.1)' : 'var(--fc-surface)',
                          color: isSelected ? 'var(--fc-brand-text)' : 'var(--fc-text-main)',
                          fontWeight: isSelected ? 800 : 600,
                          fontSize: '0.76rem',
                          cursor: 'pointer'
                        }}
                        title={opt.val === 'all' ? 'Show all cards' : `Display ${opt.val * columnsCount} cards (${opt.val} full rows)`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Right: Page Navigation Buttons */}
              {totalPages > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {/* Previous Button */}
                  <button
                    type="button"
                    disabled={validCurrentPage <= 1}
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    style={{
                      padding: '6px 14px',
                      borderRadius: '6px',
                      border: '1px solid var(--fc-border)',
                      background: validCurrentPage <= 1 ? 'var(--fc-surface-subtle)' : 'var(--fc-surface)',
                      color: validCurrentPage <= 1 ? 'var(--fc-text-muted)' : 'var(--fc-text-main)',
                      cursor: validCurrentPage <= 1 ? 'not-allowed' : 'pointer',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      opacity: validCurrentPage <= 1 ? 0.5 : 1,
                      transition: 'all 0.15s ease'
                    }}
                  >
                    Previous
                  </button>

                  {/* Page Numbers */}
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => {
                    const isActive = pageNum === validCurrentPage;
                    return (
                      <button
                        key={pageNum}
                        type="button"
                        onClick={() => setCurrentPage(pageNum)}
                        style={{
                          minWidth: '34px',
                          height: '34px',
                          padding: '0 8px',
                          borderRadius: '6px',
                          border: isActive ? '1px solid var(--fc-brand)' : '1px solid var(--fc-border)',
                          background: isActive ? 'var(--fc-brand)' : 'var(--fc-surface)',
                          color: isActive ? '#ffffff' : 'var(--fc-text-main)',
                          fontWeight: isActive ? 800 : 600,
                          fontSize: '0.82rem',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        {pageNum}
                      </button>
                    );
                  })}

                  {/* Next Button */}
                  <button
                    type="button"
                    disabled={validCurrentPage >= totalPages}
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    style={{
                      padding: '6px 14px',
                      borderRadius: '6px',
                      border: '1px solid var(--fc-border)',
                      background: validCurrentPage >= totalPages ? 'var(--fc-surface-subtle)' : 'var(--fc-surface)',
                      color: validCurrentPage >= totalPages ? 'var(--fc-text-muted)' : 'var(--fc-text-main)',
                      cursor: validCurrentPage >= totalPages ? 'not-allowed' : 'pointer',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      opacity: validCurrentPage >= totalPages ? 0.5 : 1,
                      transition: 'all 0.15s ease'
                    }}
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

