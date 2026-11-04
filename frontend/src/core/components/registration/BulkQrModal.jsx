/**
 * BulkQrModal Component
 * 
 * Bulk QR Generation & Printable Badge Sheets:
 * - Generate batches of physical QR codes with 6-digit unique codes (e.g. 50, 100, 250, 500)
 * - View pool statistics (Total, Unassigned in stock, Assigned)
 * - Printable sticker/badge sheet layout (@media print) with QR image & 6-digit readable code
 * - CSV export for physical badge manufacturers
 */

import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import QrCode, { qrSvgMarkup } from '../common/QrCode';
import { 
  ConfirmationNumberIcon, 
  PrintIcon, 
  UploadFileIcon, 
  SearchIcon, 
  CheckCircleIcon, 
  CloseIcon 
} from '../common/Icons';

export default function BulkQrModal({ open, onClose, onUpdated }) {
  const [stats, setStats] = useState({ total: 0, unassigned: 0, assigned: 0 });
  const [qrs, setQrs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [batchCount, setBatchCount] = useState(50);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('unassigned'); // 'unassigned' | 'all' | 'assigned'
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'print'
  const [recentBatch, setRecentBatch] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);

  const fetchPool = async () => {
    try {
      setLoading(true);
      const res = await api.get('/registration/qr/pool', {
        params: { status: filterStatus, search, limit: 300 }
      });
      if (res.data?.stats) setStats(res.data.stats);
      setQrs(res.data?.qrs || []);
    } catch (err) {
      console.error('Failed to load QR pool:', err);
      setErrorMessage('Failed to load QR pool statistics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchPool();
    }
  }, [open, filterStatus, search]);

  const handleGenerate = async () => {
    try {
      setGenerating(true);
      setErrorMessage(null);
      const res = await api.post('/registration/qr/bulk-generate', { count: batchCount });
      if (res.data?.pool_stats) setStats(res.data.pool_stats);
      setRecentBatch(res.data?.batch || []);
      if (onUpdated) onUpdated();
      await fetchPool();
    } catch (err) {
      console.error('Failed to generate bulk QRs:', err);
      setErrorMessage(err.response?.data?.error || 'Failed to generate bulk QR codes.');
    } finally {
      setGenerating(false);
    }
  };

  const handleExportCsv = () => {
    if (!qrs || qrs.length === 0) return;
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
    const printArea = document.getElementById('printable-bulk-qr-sheet');
    if (!printArea) {
      window.print();
      return;
    }
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow popups to print badge sheets.');
      return;
    }
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Print Physical QR Badges - KASHISH</title>
          <style>
            @page {
              size: A4 portrait;
              margin: 8mm;
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
              padding: 10px;
              text-align: center;
              box-sizing: border-box;
              page-break-inside: avoid;
            }
            .festival-title {
              font-size: 9px;
              font-weight: 800;
              letter-spacing: 0.05em;
              color: #a82f2f;
              text-transform: uppercase;
              margin-bottom: 4px;
            }
            .badge-type {
              font-size: 8px;
              font-weight: 700;
              color: #64748b;
              margin-bottom: 6px;
            }
            .qr-img {
              width: 130px;
              height: 130px;
              display: block;
              margin: 0 auto 6px auto;
            }
            .qr-img svg {
              width: 100%;
              height: 100%;
              display: block;
            }
            .code-text {
              font-family: monospace;
              font-size: 13px;
              font-weight: 900;
              letter-spacing: 0.12em;
              color: #0f172a;
              background: #f1f5f9;
              padding: 4px 8px;
              border-radius: 4px;
              display: inline-block;
            }
            .footer-text {
              font-size: 7.5px;
              color: #94a3b8;
              margin-top: 4px;
            }
          </style>
        </head>
        <body>
          <div class="grid">
            ${qrs.map((q, idx) => `
              <div class="badge-card">
                <div class="festival-title">KASHISH x BENGALURU 2026</div>
                <div class="badge-type">OFFICIAL PHYSICAL DELEGATE BADGE</div>
                <div class="qr-img">${qrSvgMarkup(q.qr_data, 160)}</div>
                <div class="code-text">${q.badge_serial ? 'BADGE NO: ' + q.badge_serial : 'CODE: ' + q.qr_data}</div>
                <div class="footer-text">Scan at the registration desk or hall entry gate</div>
                <div class="footer-text">#${String(idx + 1).padStart(3, '0')}</div>
              </div>
            `).join('')}
          </div>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(() => { window.close(); }, 500);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  if (!open) return null;

  return (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(5px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1200,
        padding: '16px'
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div 
        style={{
          background: 'var(--fc-surface-card)',
          borderRadius: '16px',
          border: '1px solid var(--fc-border)',
          width: '100%',
          maxWidth: '1050px',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.2)',
          overflow: 'hidden'
        }}
      >
        {/* Modal Header */}
        <div style={{
          padding: '18px 24px',
          borderBottom: '1px solid var(--fc-border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'var(--fc-surface-subtle)'
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--fc-text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ConfirmationNumberIcon size={20} style={{ color: '#a82f2f' }} />
              <span>Bulk Physical QR Generator &amp; Pre-Print Pool</span>
            </h2>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: 'var(--fc-text-muted)' }}>
              Generate, track, and print physical badges with guaranteed unique 6-digit codes ready for registration pairing.
            </p>
          </div>
          <button 
            type="button" 
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--fc-text-muted)', fontSize: '1.2rem', padding: '4px' }}
          >
            <CloseIcon size={16} />
          </button>
        </div>

        {/* Stock KPI Summary Banner */}
        <div style={{
          padding: '14px 24px',
          background: 'var(--fc-surface)',
          borderBottom: '1px solid var(--fc-border)',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '12px'
        }}>
          <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'var(--fc-surface-card)', border: '1px solid var(--fc-border)' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--fc-text-muted)', textTransform: 'uppercase' }}>
              Total Pre-Printed QRs
            </div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--fc-text-main)', marginTop: '2px' }}>
              {stats.total}
            </div>
          </div>

          <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(22, 163, 74, 0.08)', border: '1px solid rgba(22, 163, 74, 0.25)' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#16a34a', textTransform: 'uppercase' }}>
              Available in Stock (Unassigned)
            </div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#16a34a', marginTop: '2px' }}>
              {stats.unassigned}
            </div>
          </div>

          <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.25)' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#2563eb', textTransform: 'uppercase' }}>
              Assigned to Delegates
            </div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#2563eb', marginTop: '2px' }}>
              {stats.assigned}
            </div>
          </div>
        </div>

        {/* Generator Controls Section */}
        <div style={{
          padding: '16px 24px',
          borderBottom: '1px solid var(--fc-border)',
          background: 'var(--fc-surface-card)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          {/* Generation Count Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--fc-text-secondary)' }}>
              Batch Quantity:
            </span>
            {[25, 50, 100, 250, 500].map(cnt => (
              <button
                key={cnt}
                type="button"
                onClick={() => setBatchCount(cnt)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: batchCount === cnt ? '1.5px solid #a82f2f' : '1px solid var(--fc-border)',
                  background: batchCount === cnt ? 'rgba(168, 47, 47, 0.1)' : 'var(--fc-surface)',
                  color: batchCount === cnt ? '#a82f2f' : 'var(--fc-text-main)',
                  fontWeight: 700,
                  fontSize: '0.8rem',
                  cursor: 'pointer'
                }}
              >
                +{cnt}
              </button>
            ))}
            <input 
              type="number"
              min="1"
              max="2000"
              value={batchCount}
              onChange={(e) => setBatchCount(parseInt(e.target.value, 10) || 10)}
              style={{
                width: '75px',
                height: '32px',
                padding: '0 8px',
                borderRadius: '6px',
                border: '1px solid var(--fc-border)',
                background: 'var(--fc-surface)',
                color: 'var(--fc-text-main)',
                fontSize: '0.82rem',
                fontWeight: 700
              }}
            />
            <button
              type="button"
              onClick={handleGenerate}
              disabled={generating}
              style={{
                padding: '7px 18px',
                borderRadius: '6px',
                border: 'none',
                background: '#a82f2f',
                color: '#ffffff',
                fontWeight: 700,
                fontSize: '0.84rem',
                cursor: generating ? 'not-allowed' : 'pointer',
                boxShadow: '0 2px 8px rgba(168, 47, 47, 0.3)'
              }}
            >
              {generating ? 'Generating...' : `Generate ${batchCount} New QRs`}
            </button>
          </div>

          {/* Action Tools (Print & Export) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={handlePrintSheet}
              disabled={qrs.length === 0}
              style={{
                padding: '7px 14px',
                borderRadius: '6px',
                border: '1px solid var(--fc-border)',
                background: 'var(--fc-surface)',
                color: 'var(--fc-text-main)',
                fontWeight: 700,
                fontSize: '0.82rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <PrintIcon size={14} />
              <span>Print Sticker Sheets</span>
            </button>

            <button
              type="button"
              onClick={handleExportCsv}
              disabled={qrs.length === 0}
              style={{
                padding: '7px 14px',
                borderRadius: '6px',
                border: '1px solid var(--fc-border)',
                background: 'var(--fc-surface)',
                color: 'var(--fc-text-main)',
                fontWeight: 700,
                fontSize: '0.82rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <UploadFileIcon size={14} />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div style={{
          padding: '10px 24px',
          background: 'var(--fc-surface-subtle)',
          borderBottom: '1px solid var(--fc-border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '10px'
        }}>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              type="button"
              onClick={() => setFilterStatus('unassigned')}
              style={{
                padding: '5px 12px',
                borderRadius: '20px',
                border: filterStatus === 'unassigned' ? '1px solid #16a34a' : '1px solid var(--fc-border)',
                background: filterStatus === 'unassigned' ? 'rgba(22, 163, 74, 0.12)' : 'transparent',
                color: filterStatus === 'unassigned' ? '#16a34a' : 'var(--fc-text-muted)',
                fontWeight: 700,
                fontSize: '0.78rem',
                cursor: 'pointer'
              }}
            >
              Stock Available ({stats.unassigned})
            </button>
            <button
              type="button"
              onClick={() => setFilterStatus('all')}
              style={{
                padding: '5px 12px',
                borderRadius: '20px',
                border: filterStatus === 'all' ? '1px solid #a82f2f' : '1px solid var(--fc-border)',
                background: filterStatus === 'all' ? 'rgba(168, 47, 47, 0.1)' : 'transparent',
                color: filterStatus === 'all' ? '#a82f2f' : 'var(--fc-text-muted)',
                fontWeight: 700,
                fontSize: '0.78rem',
                cursor: 'pointer'
              }}
            >
              All Badges ({stats.total})
            </button>
            <button
              type="button"
              onClick={() => setFilterStatus('assigned')}
              style={{
                padding: '5px 12px',
                borderRadius: '20px',
                border: filterStatus === 'assigned' ? '1px solid #2563eb' : '1px solid var(--fc-border)',
                background: filterStatus === 'assigned' ? 'rgba(59, 130, 246, 0.12)' : 'transparent',
                color: filterStatus === 'assigned' ? '#2563eb' : 'var(--fc-text-muted)',
                fontWeight: 700,
                fontSize: '0.78rem',
                cursor: 'pointer'
              }}
            >
              Assigned ({stats.assigned})
            </button>
          </div>

          <div style={{ position: 'relative', width: '220px' }}>
            <input 
              type="text"
              placeholder="Search 6-digit code..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                height: '30px',
                padding: '0 10px 0 28px',
                borderRadius: '6px',
                border: '1px solid var(--fc-border)',
                background: 'var(--fc-surface)',
                color: 'var(--fc-text-main)',
                fontSize: '0.8rem',
                boxSizing: 'border-box'
              }}
            />
            <span style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', display: 'flex', color: 'var(--fc-text-muted)' }}>
              <SearchIcon size={14} />
            </span>
          </div>
        </div>

        {/* Error message */}
        {errorMessage && (
          <div style={{ padding: '8px 24px', background: '#fee2e2', color: '#b91c1c', fontSize: '0.82rem', fontWeight: 600 }}>
            {errorMessage}
          </div>
        )}

        {/* Recently Generated Notification */}
        {recentBatch && recentBatch.length > 0 && (
          <div style={{ padding: '8px 24px', background: 'rgba(22, 163, 74, 0.1)', color: '#16a34a', fontSize: '0.82rem', fontWeight: 700, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Batch of {recentBatch.length} physical QRs generated successfully! Sample: <strong>#{recentBatch[0].badge_serial || recentBatch[0].code}</strong></span>
            <button type="button" onClick={() => setRecentBatch(null)} style={{ background: 'transparent', border: 'none', color: '#16a34a', cursor: 'pointer', fontWeight: 700 }}>Dismiss</button>
          </div>
        )}

        {/* QR Code Cards Grid (Scrollable) */}
        <div id="printable-bulk-qr-sheet" style={{
          padding: '20px 24px',
          overflowY: 'auto',
          flex: 1,
          background: 'var(--fc-surface)'
        }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px', color: 'var(--fc-text-muted)', fontSize: '0.9rem' }}>
              Loading physical badges pool...
            </div>
          ) : qrs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px', color: 'var(--fc-text-muted)', fontSize: '0.9rem' }}>
              No QR badges found for this filter. Click <strong>"Generate New QRs"</strong> above to stock pre-printed cards.
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              gap: '16px'
            }}>
              {qrs.map((item) => {
                const isAssigned = Boolean(item.attendee_id);
                return (
                  <div
                    key={item.qr_id}
                    style={{
                      background: 'var(--fc-surface-card)',
                      border: isAssigned ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid var(--fc-border)',
                      borderRadius: '10px',
                      padding: '14px',
                      textAlign: 'center',
                      boxShadow: 'var(--shadow-sm)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      transition: 'transform 0.1s ease'
                    }}
                  >
                    <div style={{ fontSize: '0.66rem', fontWeight: 800, color: '#a82f2f', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: '2px' }}>
                      KASHISH 2026
                    </div>
                    <div style={{ fontSize: '0.62rem', fontWeight: 600, color: 'var(--fc-text-muted)', marginBottom: '8px' }}>
                      DELEGATE PASS BADGE
                    </div>

                    <div style={{ background: '#ffffff', padding: '6px', borderRadius: '6px', border: '1px solid #e2e8f0', marginBottom: '8px' }}>
                      <QrCode value={item.qr_data} size={120} />
                    </div>

                    <div style={{
                      fontFamily: 'monospace',
                      fontSize: '1rem',
                      fontWeight: 900,
                      letterSpacing: '0.1em',
                      color: 'var(--fc-text-main)',
                      background: 'var(--fc-surface-subtle)',
                      border: '1px solid var(--fc-border)',
                      padding: '3px 8px',
                      borderRadius: '4px',
                      marginBottom: '6px'
                    }}>
                      {item.badge_serial || item.qr_data}
                    </div>

                    {isAssigned ? (
                      <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#2563eb', lineHeight: 1.3 }}>
                        Assigned: {item.attendee_name || 'Delegate'}<br/>
                        <span style={{ color: 'var(--fc-text-muted)' }}>{item.attendee_serial}</span>
                      </div>
                    ) : (
                      <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#16a34a' }}>
                        Ready in Stock
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div style={{
          padding: '12px 24px',
          borderTop: '1px solid var(--fc-border)',
          background: 'var(--fc-surface-card)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--fc-text-muted)' }}>
            Showing {qrs.length} badges • Physical QR credentials for NGMA Bengaluru desk
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 20px',
              borderRadius: '8px',
              border: '1px solid var(--fc-border)',
              background: 'var(--fc-surface)',
              color: 'var(--fc-text-main)',
              fontWeight: 700,
              fontSize: '0.86rem',
              cursor: 'pointer'
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

