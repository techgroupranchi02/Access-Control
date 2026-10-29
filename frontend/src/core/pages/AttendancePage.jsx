/**
 * AttendancePage Component (/attendance)
 * 
 * Gate Check-In & Attendance Verification:
 * - Select current screening block/session
 * - Fast barcode/QR scanner with sound/haptic feedback
 * - Real-time duplicate scan prevention
 * - Live attendance feed with category ribbons
 * - Attendance summary metrics and CSV export
 */

import React, { useState, useEffect, useRef } from 'react';
import api from '../services/api';
import { Html5Qrcode } from 'html5-qrcode';
import {
  QrCodeScannerIcon,
  WarningIcon,
  CheckCircleIcon,
  CancelIcon,
  ScheduleIcon,
  SyncIcon,
  CameraAltIcon,
  CloseIcon
} from '../components/common/Icons';

export default function AttendancePage() {
  const [screenings, setScreenings] = useState([]);
  const [selectedScreening, setSelectedScreening] = useState('');
  const [scanInput, setScanInput] = useState('');
  const [scanning, setScanning] = useState(false);
  const [lastScanResult, setLastScanResult] = useState(null);
  const [logs, setLogs] = useState([]);
  const [metrics, setMetrics] = useState({ totalCheckins: 0, uniqueAttendeesCheckedIn: 0 });
  const [loading, setLoading] = useState(true);

  // Camera Live QR Scanner State
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [scanCooldown, setScanCooldown] = useState(false);
  const scannerInstanceRef = useRef(null);
  const isProcessingRef = useRef(false);
  const lastScannedRef = useRef({ code: '', timestamp: 0 });

  // Web Audio chime feedback on successful/failed scans
  const playBeep = (isSuccess) => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(isSuccess ? 880 : 330, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.16);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.16);
    } catch { }
  };

  const fetchScreenings = async () => {
    try {
      setLoading(true);
      const res = await api.get('/audience/screenings');
      const list = res.data.screenings || [];
      setScreenings(list);
      if (list.length > 0 && !selectedScreening) {
        setSelectedScreening(list[0].id);
      }
    } catch (err) {
      console.error('Failed to load screenings:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchLogs = async (screeningId) => {
    try {
      const res = await api.get('/attendance/logs', {
        params: { screening_id: screeningId || undefined, limit: 50 }
      });
      setLogs(res.data.logs || []);
      setMetrics(res.data.metrics || { totalCheckins: 0, uniqueAttendeesCheckedIn: 0 });
    } catch (err) {
      console.error('Failed to fetch attendance logs:', err);
    }
  };

  useEffect(() => {
    fetchScreenings();
  }, []);

  useEffect(() => {
    if (selectedScreening) {
      fetchLogs(selectedScreening);
    }
  }, [selectedScreening]);

  const executeCheckin = async (rawInput, isFromCamera = false) => {
    let clean = (rawInput || '').trim();
    if (!clean || !selectedScreening) return;

    // If scanned text is a full URL, extract the token / badge ID from the last path segment
    if (clean.includes('/')) {
      const segments = clean.split('/').filter(Boolean);
      clean = segments[segments.length - 1].trim();
    }

    const now = Date.now();

    // Guard against continuous rapid frame firing while holding QR in camera view
    if (isFromCamera) {
      if (isProcessingRef.current) return;
      // If exact same QR code is held in front of the camera, ignore duplicate scans for 3.5 seconds
      if (lastScannedRef.current.code === clean && now - lastScannedRef.current.timestamp < 3500) {
        return;
      }
      // Enforce at least 1.5 seconds between any two distinct badge scans
      if (now - lastScannedRef.current.timestamp < 1500) {
        return;
      }
    }

    try {
      isProcessingRef.current = true;
      lastScannedRef.current = { code: clean, timestamp: now };
      setScanning(true);
      setScanCooldown(true);

      const res = await api.post('/attendance/scan', {
        qr_token: clean,
        screening_block_id: selectedScreening
      });

      setLastScanResult({
        success: true,
        isDuplicate: res.data.is_duplicate,
        message: res.data.message,
        attendee: res.data.attendee,
        timestamp: new Date().toLocaleTimeString()
      });

      setScanInput('');
      fetchLogs(selectedScreening);
      playBeep(!res.data.is_duplicate);

      // Mobile haptic feedback
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(res.data.is_duplicate ? [100, 50, 100] : 150);
      }
    } catch (err) {
      setLastScanResult({
        success: false,
        message: err.response?.data?.error || 'Invalid badge or check-in failed.',
        timestamp: new Date().toLocaleTimeString()
      });
      playBeep(false);
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([200, 100, 200]);
      }
    } finally {
      isProcessingRef.current = false;
      setScanning(false);
      setTimeout(() => {
        setScanCooldown(false);
      }, 2000);
    }
  };

  const handleScanSubmit = async (e) => {
    e.preventDefault();
    await executeCheckin(scanInput, false);
  };

  // Live Camera Scanner Lifecycle
  useEffect(() => {
    let html5QrCode = null;

    if (isCameraActive) {
      setCameraError(null);
      // Brief timeout to ensure the DOM element #gate-camera-scanner-view is mounted
      const timer = setTimeout(() => {
        try {
          html5QrCode = new Html5Qrcode("gate-camera-scanner-view");
          scannerInstanceRef.current = html5QrCode;

          const config = {
            fps: 10,
            qrbox: { width: 220, height: 220 },
            aspectRatio: 1.0
          };

          html5QrCode.start(
            { facingMode: "environment" },
            config,
            (decodedText) => {
              // Pass isFromCamera = true to apply 3.5s cooldown debounce
              executeCheckin(decodedText, true);
            },
            () => {
              // Ignore frame errors
            }
          ).catch((err) => {
            console.error("Camera start error:", err);
            setCameraError(err?.message || String(err) || "Failed to access camera.");
          });
        } catch (e) {
          console.error("Camera init error:", e);
          setCameraError(e?.message || "Failed to initialize camera scanner.");
        }
      }, 100);

        return () => {
          clearTimeout(timer);
          if (html5QrCode) {
            try {
              if (html5QrCode.isScanning) {
                html5QrCode.stop().then(() => {
                  try { html5QrCode.clear(); } catch { }
                }).catch(() => { });
              } else {
                try { html5QrCode.clear(); } catch { }
              }
            } catch { }
          }
          scannerInstanceRef.current = null;
        };
      } else {
        if (scannerInstanceRef.current) {
          try {
            if (scannerInstanceRef.current.isScanning) {
              scannerInstanceRef.current.stop().then(() => {
                try { scannerInstanceRef.current.clear(); } catch { }
              }).catch(() => { });
            } else {
              try { scannerInstanceRef.current.clear(); } catch { }
            }
          } catch { }
          scannerInstanceRef.current = null;
        }
      }
    }, [isCameraActive, selectedScreening]);

    const currentScreeningObj = screenings.find(s => String(s.id) === String(selectedScreening));

    return (
      <div className="fc-attendance-page">
        {/* Page Header */}
        <div className="fc-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <h1 className="fc-page-title" style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0, color: 'var(--fc-text-main)' }}>
              Gate Check-In & Attendance
            </h1>
            <p className="fc-page-subtitle" style={{ color: 'var(--fc-text-muted)', marginTop: '4px', fontSize: '0.9rem' }}>
              Scan delegate badge passes to verify auditorium entrance and unlock audience voting eligibility
            </p>
          </div>

          {/* Screening Session Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--fc-text-secondary)' }}>ACTIVE SCREENING:</label>
            <select
              value={selectedScreening}
              onChange={(e) => setSelectedScreening(e.target.value)}
              style={{
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid var(--fc-border)',
                background: 'var(--fc-surface-card)',
                fontWeight: 600,
                fontSize: '0.9rem',
                color: 'var(--fc-text-main)',
                boxShadow: 'var(--shadow-sm)'
              }}
            >
              {screenings.map(s => (
                <option key={s.id} value={s.id}>
                  {s.title} ({s.start_time} - {s.venue_name})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Summary KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
          <div className="fc-card" style={{ background: 'var(--fc-surface-card)', borderRadius: '10px', padding: '16px', border: '1px solid var(--fc-border)' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--fc-text-muted)', textTransform: 'uppercase' }}>Screening Checked-In</div>
            <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#2563eb', marginTop: '4px' }}>
              {currentScreeningObj?.checked_in_count || logs.length}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--fc-text-muted)', marginTop: '4px' }}>
              Venue: {currentScreeningObj?.venue_name || 'Auditorium'}
            </div>
          </div>

          <div className="fc-card" style={{ background: 'var(--fc-surface-card)', borderRadius: '10px', padding: '16px', border: '1px solid var(--fc-border)' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--fc-text-muted)', textTransform: 'uppercase' }}>Total Festival Scans</div>
            <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#16a34a', marginTop: '4px' }}>
              {metrics.totalCheckins}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--fc-text-muted)', marginTop: '4px' }}>Across all screening doors</div>
          </div>

          <div className="fc-card" style={{ background: 'var(--fc-surface-card)', borderRadius: '10px', padding: '16px', border: '1px solid var(--fc-border)' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--fc-text-muted)', textTransform: 'uppercase' }}>Unique Delegates Attended</div>
            <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#7c3aed', marginTop: '4px' }}>
              {metrics.uniqueAttendeesCheckedIn}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--fc-text-muted)', marginTop: '4px' }}>Unique badge holders onsite</div>
          </div>
        </div>

        {/* Main Grid: Scanner Console + Live Log Feed */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 420px) 1fr', gap: '24px' }}>

          {/* Scanner Deck */}
          <div>
            <div className="fc-card" style={{ background: 'var(--fc-surface-card)', borderRadius: '12px', border: '1px solid var(--fc-border)', padding: '24px', boxShadow: 'var(--shadow-sm)' }}>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 16px 0', color: 'var(--fc-text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <QrCodeScannerIcon size={18} /> Badge Scanner Deck
              </h2>

              {/* 1. Live Camera QR Scanner Section */}
              <div style={{ marginBottom: '18px' }}>
                {!isCameraActive ? (
                  <button
                    type="button"
                    onClick={() => setIsCameraActive(true)}
                    style={{
                      width: '100%',
                      padding: '11px 16px',
                      background: '#16a34a',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '8px',
                      fontWeight: 700,
                      fontSize: '0.9rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      boxShadow: '0 2px 8px rgba(22, 163, 74, 0.25)',
                      transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#15803d'}
                    onMouseLeave={(e) => e.currentTarget.style.background = '#16a34a'}
                  >
                    <CameraAltIcon size={18} />
                    <span>Open Live Camera QR Scanner</span>
                  </button>
                ) : (
                  <div style={{ background: '#090d16', borderRadius: '12px', padding: '14px', border: '1px solid var(--fc-border)', textAlign: 'center' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <div style={{ color: scanCooldown ? '#38bdf8' : '#22c55e', fontSize: '0.8rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: scanCooldown ? '#38bdf8' : '#22c55e', display: 'inline-block' }}></span>
                        {scanCooldown ? '✓ Badge Scanned!' : 'Camera Scanner Active'}
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsCameraActive(false)}
                        style={{
                          background: 'rgba(255,255,255,0.15)',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '6px',
                          padding: '4px 10px',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        <CloseIcon size={12} /> Close Camera
                      </button>
                    </div>

                    {/* HTML5 QR Scanner Mount Container */}
                    <div
                      id="gate-camera-scanner-view"
                      style={{
                        width: '100%',
                        maxWidth: '360px',
                        margin: '0 auto',
                        borderRadius: '8px',
                        overflow: 'hidden',
                        background: '#000'
                      }}
                    />

                    {cameraError && (
                      <div style={{ marginTop: '10px', color: '#f87171', fontSize: '0.78rem', background: 'rgba(239, 68, 68, 0.1)', padding: '6px', borderRadius: '6px' }}>
                        {cameraError}
                      </div>
                    )}

                    <div style={{ color: '#94a3b8', fontSize: '0.74rem', marginTop: '8px' }}>
                      Point camera at delegate's badge QR code or mobile screen to check in automatically.
                    </div>
                  </div>
                )}
              </div>

              {/* 2. Manual / USB Scanner Input Box */}
              <form onSubmit={handleScanSubmit}>
                <div style={{ marginBottom: '14px' }}>
                    <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: 'var(--fc-text-secondary)', marginBottom: '6px' }}>
                      Or Enter Badge # / Scan with USB Gun:
                    </label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type="text"
                        placeholder="e.g. KB26-0011 or paste QR Token..."
                        value={scanInput}
                        onChange={(e) => setScanInput(e.target.value)}
                        autoFocus={!isCameraActive}
                        style={{
                          flex: 1,
                          padding: '11px 13px',
                          borderRadius: '8px',
                          border: '2px solid #3b82f6',
                          background: 'var(--fc-surface)',
                          color: 'var(--fc-text-main)',
                          fontSize: '0.95rem',
                          fontWeight: 600
                        }}
                      />
                      <button
                        type="submit"
                        disabled={scanning}
                        style={{
                          background: '#2563eb',
                          color: '#fff',
                          border: 'none',
                          padding: '0 20px',
                          borderRadius: '8px',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        {scanning ? '...' : 'Verify'}
                      </button>
                    </div>
                    <small style={{ display: 'block', color: 'var(--fc-text-muted)', marginTop: '6px', fontSize: '0.75rem' }}>
                      Works instantly with USB / Bluetooth physical barcode scanners and manual typing.
                    </small>
                </div>
              </form>

              {/* Scan Feedback Banner */}
              {lastScanResult && (
                <div
                  style={{
                    marginTop: '16px',
                    padding: '16px',
                    borderRadius: '10px',
                    background: lastScanResult.success
                      ? (lastScanResult.isDuplicate ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 129, 0.15)')
                      : 'var(--fc-alert-bg, rgba(220, 38, 38, 0.15))',
                    border: `1px solid ${lastScanResult.success
                        ? (lastScanResult.isDuplicate ? '#f59e0b' : '#10b981')
                        : 'var(--fc-alert-border, #ef4444)'
                      }`
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ display: 'flex', alignItems: 'center' }}>
                      {lastScanResult.success
                        ? (lastScanResult.isDuplicate ? <WarningIcon size={20} style={{ color: '#f59e0b' }} /> : <CheckCircleIcon size={20} style={{ color: '#10b981' }} />)
                        : <CancelIcon size={20} style={{ color: '#ef4444' }} />}
                    </span>
                    <strong style={{ color: lastScanResult.success ? (lastScanResult.isDuplicate ? '#f59e0b' : '#10b981') : '#ef4444' }}>
                      {lastScanResult.message}
                    </strong>
                  </div>

                  {lastScanResult.attendee && (
                    <div style={{ marginTop: '8px', fontSize: '0.9rem', color: 'var(--fc-text-main)' }}>
                      <div>Delegate: <strong>{lastScanResult.attendee.name}</strong></div>
                      <div>Category: <span style={{ fontWeight: 700, textTransform: 'uppercase' }}>{lastScanResult.attendee.delegate_category}</span></div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--fc-text-muted)', marginTop: '4px' }}>Time: {lastScanResult.timestamp}</div>
                    </div>
                  )}
                </div>
              )}

              {/* Active Screening Details */}
              {currentScreeningObj && (
                <div style={{ marginTop: '20px', padding: '14px', background: 'var(--fc-surface)', borderRadius: '8px', border: '1px solid var(--fc-border)', fontSize: '0.85rem' }}>
                  <div style={{ fontWeight: 700, color: 'var(--fc-text-secondary)', marginBottom: '6px' }}>SELECTED RUN-OF-SHOW</div>
                  <div style={{ color: 'var(--fc-text-main)', fontWeight: 600 }}>{currentScreeningObj.title}</div>
                  <div style={{ color: 'var(--fc-text-muted)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <ScheduleIcon size={14} /> {currentScreeningObj.start_time} - {currentScreeningObj.end_time} · {currentScreeningObj.block_type === 'short_block' ? 'Short Film Block' : 'Feature Film'}
                  </div>
                  {currentScreeningObj.films && currentScreeningObj.films.length > 0 && (
                    <div style={{ marginTop: '8px', borderTop: '1px dashed var(--fc-border)', paddingTop: '6px' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--fc-text-muted)' }}>Films in this block ({currentScreeningObj.films.length}):</div>
                      <ul style={{ margin: '4px 0 0 16px', padding: 0, color: 'var(--fc-text-secondary)' }}>
                        {currentScreeningObj.films.map(f => (
                          <li key={f.film_id}>{f.title} ({f.runtime}m - {f.director})</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Live Attendance Log Feed */}
          <div>
            <div className="fc-card" style={{ background: 'var(--fc-surface-card)', borderRadius: '12px', border: '1px solid var(--fc-border)', padding: '20px', boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: 'var(--fc-text-main)' }}>
                  Auditorium Entrance Feed ({logs.length})
                </h2>
                <button
                  onClick={() => fetchLogs(selectedScreening)}
                  style={{ background: 'var(--fc-surface)', border: '1px solid var(--fc-border)', color: 'var(--fc-text-main)', padding: '6px 12px', borderRadius: '6px', fontSize: '0.8rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                >
                  <SyncIcon size={13} /> Refresh
                </button>
              </div>

              {logs.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--fc-text-muted)' }}>
                  No check-ins recorded yet for this screening session. Scan attendee badges to begin intake.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ background: 'var(--fc-surface)', borderBottom: '1px solid var(--fc-border)', textAlign: 'left', color: 'var(--fc-text-muted)' }}>
                        <th style={{ padding: '10px 12px' }}>Attendee</th>
                        <th style={{ padding: '10px 12px' }}>Category</th>
                        <th style={{ padding: '10px 12px' }}>Time</th>
                        <th style={{ padding: '10px 12px' }}>Status</th>
                        <th style={{ padding: '10px 12px' }}>Scanned By</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map((log) => (
                        <tr key={log.id} style={{ borderBottom: '1px solid var(--fc-border)' }}>
                          <td style={{ padding: '10px 12px' }}>
                            <div style={{ fontWeight: 600, color: 'var(--fc-text-main)' }}>{log.attendee_name}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--fc-text-muted)' }}>ID #{log.attendee_id} · {log.attendee_phone || log.attendee_email}</div>
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            <span
                              style={{
                                background: log.badge_color || '#6366f1',
                                color: '#fff',
                                fontSize: '0.7rem',
                                fontWeight: 800,
                                padding: '2px 8px',
                                borderRadius: '4px',
                                letterSpacing: '0.05em'
                              }}
                            >
                              {log.badge_ribbon || log.delegate_category}
                            </span>
                          </td>
                          <td style={{ padding: '10px 12px', color: 'var(--fc-text-secondary)' }}>
                            {new Date(log.scanned_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            <span style={{ color: '#16a34a', fontWeight: 600 }}>Verified ✓</span>
                          </td>
                          <td style={{ padding: '10px 12px', color: 'var(--fc-text-muted)' }}>
                            {log.scanned_by_name || 'Volunteer'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    );
  }
