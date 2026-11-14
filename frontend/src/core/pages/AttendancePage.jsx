/**
 * AttendancePage Component (/attendance)
 * 
 * Gate Check-In & Attendance Verification:
 * - Select the venue (screening block) inside the Badge Scanner Deck
 * - Fast barcode/QR scanner with sound/haptic feedback
 * - Real-time duplicate scan prevention
 * - Live attendance feed with category ribbons
 */

import React, { useState, useEffect, useRef } from 'react';
import api from '../services/api';
import SearchInput from '../components/common/SearchInput';
import { Html5Qrcode } from 'html5-qrcode';
import {
  QrCodeScannerIcon,
  WarningIcon,
  CheckCircleIcon,
  CancelIcon,
  ScheduleIcon,
  CameraAltIcon,
  CloseIcon,
  CheckIcon,
  ExpandMoreIcon
} from '../components/common/Icons';
import { attendeeLabel } from '../utils/attendeeDisplay';

/** '13:45' → '1:45 PM' */
function clock(hhmm) {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm || '');
  if (!m) return hhmm || '';
  const h = Number(m[1]) % 24;
  return `${((h + 11) % 12) + 1}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
}
const showDay = (iso) => {
  const d = iso ? new Date(`${iso}T00:00:00`) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) : '';
};
/** Where a show's attendance window stands right now: { state: 'open'|'soon'|'closed', text }. */
function windowState(show, now) {
  const w = show?.attendance_window;
  if (!w) return null;
  const opens = new Date(w.opens_at);
  const closes = new Date(w.closes_at);
  if (now < opens) return { state: 'soon', text: `Attendance opens ${clock(w.opens)}${opens.toDateString() !== now.toDateString() ? `, ${showDay(show.screening_date)}` : ''}` };
  if (now > closes) return { state: 'closed', text: `Attendance closed at ${clock(w.closes)}` };
  return { state: 'open', text: `Attendance open until ${clock(w.closes)}` };
}

export default function AttendancePage() {
  const [screenings, setScreenings] = useState([]);
  const [selectedScreening, setSelectedScreening] = useState('');
  const [scanInput, setScanInput] = useState('');
  const [scanning, setScanning] = useState(false);
  const [lastScanResult, setLastScanResult] = useState(null);
  const [logs, setLogs] = useState([]);
  const [logSearchInput, setLogSearchInput] = useState('');
  const [logSearch, setLogSearch] = useState('');
  const [logsSearching, setLogsSearching] = useState(false);
  const logsRequestIdRef = useRef(0);
  const logSearchRef = useRef(''); // read by scan callbacks, which may hold a stale closure
  const [loading, setLoading] = useState(true);
  const [venueMenuOpen, setVenueMenuOpen] = useState(false);
  const venueMenuRef = useRef(null);
  // Re-render every 30 s so the attendance window status stays current
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!venueMenuOpen) return undefined;
    const onDown = (e) => {
      if (venueMenuRef.current && !venueMenuRef.current.contains(e.target)) setVenueMenuOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setVenueMenuOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [venueMenuOpen]);

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
      // Start on the show whose attendance window is open now (else the next one)
      if (list.length > 0 && !selectedScreening) {
        setSelectedScreening(res.data.current_screening_id || list[0].id);
      }
    } catch (err) {
      console.error('Failed to load screenings:', err);
    } finally {
      setLoading(false);
    }
  };

  // Only the newest request updates the list, so a slow response can't overwrite a newer search
  const fetchLogs = async (screeningId, searchText = logSearchRef.current, { silent = false } = {}) => {
    const requestId = ++logsRequestIdRef.current;
    try {
      if (!silent) setLogsSearching(true);
      const res = await api.get('/attendance/logs', {
        params: { screening_id: screeningId || undefined, limit: 50, search: searchText || undefined }
      });
      if (requestId !== logsRequestIdRef.current) return;
      setLogs(res.data.logs || []);
    } catch (err) {
      if (requestId === logsRequestIdRef.current) console.error('Failed to fetch attendance logs:', err);
    } finally {
      if (requestId === logsRequestIdRef.current) setLogsSearching(false);
    }
  };

  // Debounce the check-in search box
  useEffect(() => {
    const t = setTimeout(() => {
      logSearchRef.current = logSearchInput.trim();
      setLogSearch(logSearchInput.trim());
    }, 300);
    return () => clearTimeout(t);
  }, [logSearchInput]);

  useEffect(() => {
    fetchScreenings();
  }, []);

  useEffect(() => {
    if (selectedScreening) {
      fetchLogs(selectedScreening, logSearch);
    }
  }, [selectedScreening, logSearch]);

  // Keep the check-in list current (scans from other volunteers' devices) without a Refresh button:
  // refresh quietly every 15s while this tab is visible, and right away when the tab comes back.
  useEffect(() => {
    if (!selectedScreening) return undefined;
    const refresh = () => {
      if (document.visibilityState === 'visible') fetchLogs(selectedScreening, logSearchRef.current, { silent: true });
    };
    const timer = setInterval(refresh, 15000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
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

      // Outside the show's attendance window: recorded, but shown as a warning
      const outside = res.data.in_window === false;
      setLastScanResult({
        success: true,
        isDuplicate: res.data.is_duplicate || outside,
        message: res.data.message,
        attendee: res.data.attendee,
        timestamp: new Date().toLocaleTimeString()
      });

      setScanInput('');
      fetchLogs(selectedScreening);
      playBeep(!res.data.is_duplicate && !outside);

      // Mobile haptic feedback
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(res.data.is_duplicate || outside ? [100, 50, 100] : 150);
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
              Attendance
            </h1>
            <p className="fc-page-subtitle" style={{ color: 'var(--fc-text-muted)', marginTop: '4px', fontSize: '0.9rem' }}>
              Scan delegate badge passes to verify venue entry and unlock audience voting eligibility
            </p>
          </div>
        </div>

        {/* Main Grid: Scanner Console + Live Log Feed */}
        <div className="fc-console-grid" style={{ display: 'grid', gap: '24px' }}>

          {/* Scanner Deck (overflow visible: the show list opens past the card's edge) */}
          <div>
            <div className="fc-card" style={{ background: 'var(--fc-surface-card)', borderRadius: '12px', border: '1px solid var(--fc-border)', padding: '24px', boxShadow: 'var(--shadow-sm)', overflow: 'visible' }}>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 16px 0', color: 'var(--fc-text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <QrCodeScannerIcon size={18} /> Badge Scanner Deck
              </h2>

              {/* Venue picker: which hall this gate device is checking delegates into */}
              <div ref={venueMenuRef} style={{ marginBottom: '18px', position: 'relative' }}>
                <div id="gate-venue-label" style={{ fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--fc-text-muted)', marginBottom: '6px' }}>
                  Show
                </div>

                {screenings.length === 0 ? (
                  <div style={{ padding: '12px 14px', borderRadius: '10px', border: '1px dashed var(--fc-border)', color: 'var(--fc-text-muted)', fontSize: '0.85rem' }}>
                    {loading ? 'Loading shows…' : 'No shows scheduled. Add them in Settings → Audience → Screenings.'}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => screenings.length > 1 && setVenueMenuOpen(o => !o)}
                    aria-haspopup="listbox"
                    aria-expanded={venueMenuOpen}
                    aria-labelledby="gate-venue-label"
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '10px',
                      textAlign: 'left',
                      padding: '12px 14px',
                      borderRadius: '10px',
                      border: `1px solid ${venueMenuOpen ? 'var(--fc-brand)' : 'var(--fc-border)'}`,
                      background: 'var(--fc-surface)',
                      color: 'var(--fc-text-main)',
                      cursor: screenings.length > 1 ? 'pointer' : 'default',
                      transition: 'border-color 0.15s ease'
                    }}
                  >
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontWeight: 700, fontSize: '0.95rem', lineHeight: 1.35, overflowWrap: 'anywhere' }}>
                        {currentScreeningObj?.title}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px', color: 'var(--fc-text-secondary)', fontSize: '0.8rem', marginTop: '3px' }}>
                        <ScheduleIcon size={13} />
                        {showDay(currentScreeningObj?.screening_date)}{' · '}
                        {clock(currentScreeningObj?.start_time)}{currentScreeningObj?.end_time ? ` – ${clock(currentScreeningObj.end_time)}` : ''}
                        {currentScreeningObj?.venue_name ? ` · ${currentScreeningObj.venue_name}` : ''}
                      </span>
                      {windowState(currentScreeningObj, now) && (
                        <span className={`fc-att-window is-${windowState(currentScreeningObj, now).state}`}>
                          Attendance {clock(currentScreeningObj.attendance_window.opens)}–{clock(currentScreeningObj.attendance_window.closes)}
                          {' · '}{{ open: 'open now', soon: 'not open yet', closed: 'closed' }[windowState(currentScreeningObj, now).state]}
                        </span>
                      )}
                    </span>
                    {screenings.length > 1 && (
                      <ExpandMoreIcon size={20} style={{ color: 'var(--fc-text-muted)', flexShrink: 0, marginTop: '1px', transform: venueMenuOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }} />
                    )}
                  </button>
                )}

                {venueMenuOpen && (
                  <div
                    role="listbox"
                    aria-labelledby="gate-venue-label"
                    style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      top: 'calc(100% + 6px)',
                      zIndex: 40,
                      maxHeight: '320px',
                      overflowY: 'auto',
                      background: 'var(--fc-surface-elevated)',
                      border: '1px solid var(--fc-border)',
                      borderRadius: '10px',
                      boxShadow: 'var(--shadow-lg)',
                      padding: '6px'
                    }}
                  >
                    {screenings.map(s => {
                      const isSelected = String(s.id) === String(selectedScreening);
                      return (
                        <button
                          key={s.id}
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          onClick={() => { setSelectedScreening(s.id); setVenueMenuOpen(false); }}
                          style={{
                            width: '100%',
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '10px',
                            textAlign: 'left',
                            padding: '10px 10px',
                            border: 'none',
                            borderRadius: '8px',
                            background: isSelected ? 'var(--fc-brand-active-bg)' : 'transparent',
                            color: 'var(--fc-text-main)',
                            cursor: 'pointer'
                          }}
                          onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'var(--fc-surface-hover)'; }}
                          onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                        >
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ display: 'block', fontWeight: 700, fontSize: '0.88rem', lineHeight: 1.35, overflowWrap: 'anywhere', color: isSelected ? 'var(--fc-brand-text)' : 'var(--fc-text-main)' }}>
                              {s.title}
                            </span>
                            <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--fc-text-secondary)', marginTop: '2px' }}>
                              {showDay(s.screening_date)} · {clock(s.start_time)}{s.end_time ? ` – ${clock(s.end_time)}` : ''}{s.venue_name ? ` · ${s.venue_name}` : ''}
                            </span>
                            {windowState(s, now) && (
                              <span className={`fc-att-window is-${windowState(s, now).state}`}>{windowState(s, now).text}</span>
                            )}
                          </span>
                          {isSelected && <CheckIcon size={16} style={{ color: 'var(--fc-brand-text)', flexShrink: 0, marginTop: '2px' }} />}
                        </button>
                      );
                    })}
                  </div>
                )}

                {(() => {
                  const films = currentScreeningObj?.films?.length ? currentScreeningObj.films.map(f => f.title) : (currentScreeningObj?.kashish_films || []).map(f => f.title || f.id);
                  return films.length > 0 && (
                    <div style={{ marginTop: '8px', fontSize: '0.78rem', color: 'var(--fc-text-muted)', lineHeight: 1.45 }}>
                      <span style={{ fontWeight: 700 }}>Films ({films.length}): </span>
                      {films.join(', ')}
                    </div>
                  );
                })()}
              </div>

              {/* 1. Live Camera QR Scanner Section */}
              <div style={{ marginBottom: '18px' }}>
                {!isCameraActive ? (
                  <button
                    type="button"
                    onClick={() => setIsCameraActive(true)}
                    style={{
                      width: '100%',
                      padding: '11px 16px',
                      background: 'var(--fc-brand)',
                      color: 'var(--fc-text-on-brand)',
                      border: '1px solid var(--fc-brand)',
                      borderRadius: '8px',
                      fontWeight: 700,
                      fontSize: '0.9rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      boxShadow: 'var(--shadow-sm)',
                      transition: 'background 0.15s ease, border-color 0.15s ease'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--fc-brand-hover)'; e.currentTarget.style.borderColor = 'var(--fc-brand-hover)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--fc-brand)'; e.currentTarget.style.borderColor = 'var(--fc-brand)'; }}
                  >
                    <CameraAltIcon size={18} />
                    <span>Open Live Camera QR Scanner</span>
                  </button>
                ) : (
                  <div style={{ background: '#090d16', borderRadius: '12px', padding: '14px', border: '1px solid var(--fc-border)', textAlign: 'center' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <div style={{ color: scanCooldown ? '#7dd3fc' : '#4ade80', fontSize: '0.8rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: scanCooldown ? '#38bdf8' : '#22c55e', display: 'inline-block' }}></span>
                        {scanCooldown ? 'Badge scanned' : 'Camera scanner active'}
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
                      <div style={{ marginTop: '10px', color: 'var(--fc-danger-text)', fontSize: '0.78rem', background: 'rgba(239, 68, 68, 0.1)', padding: '6px', borderRadius: '6px' }}>
                        {cameraError}
                      </div>
                    )}

                    <div style={{ color: 'var(--fc-text-muted)', fontSize: '0.74rem', marginTop: '8px' }}>
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
                        placeholder="Badge no. or scan QR"
                        value={scanInput}
                        onChange={(e) => setScanInput(e.target.value)}
                        autoFocus={!isCameraActive}
                        style={{
                          flex: 1,
                          minWidth: 0,
                          padding: '11px 13px',
                          borderRadius: '8px',
                          border: '1px solid var(--fc-border)',
                          background: 'var(--fc-surface)',
                          color: 'var(--fc-text-main)',
                          fontSize: '0.95rem',
                          fontWeight: 600,
                          outline: 'none',
                          transition: 'border-color 0.15s ease, box-shadow 0.15s ease'
                        }}
                        onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--fc-brand)'; e.currentTarget.style.boxShadow = '0 0 0 3px var(--fc-focus-ring)'; }}
                        onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--fc-border)'; e.currentTarget.style.boxShadow = 'none'; }}
                      />
                      <button
                        type="submit"
                        disabled={scanning}
                        style={{
                          background: 'var(--fc-surface-card)',
                          color: 'var(--fc-text-main)',
                          border: '1px solid var(--fc-border)',
                          padding: '0 20px',
                          borderRadius: '8px',
                          fontWeight: 700,
                          cursor: scanning ? 'not-allowed' : 'pointer',
                          opacity: scanning ? 0.55 : 1,
                          transition: 'background 0.15s ease, border-color 0.15s ease'
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--fc-surface-hover)'; e.currentTarget.style.borderColor = 'var(--fc-border-hover, var(--fc-border))'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--fc-surface-card)'; e.currentTarget.style.borderColor = 'var(--fc-border)'; }}
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
                      ? (lastScanResult.isDuplicate ? 'var(--fc-warning-bg)' : 'var(--fc-success-bg)')
                      : 'var(--fc-danger-bg)',
                    border: `1px solid ${lastScanResult.success
                        ? (lastScanResult.isDuplicate ? 'var(--fc-warning-border)' : 'var(--fc-success-border)')
                        : 'var(--fc-danger-border)'
                      }`
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ display: 'flex', alignItems: 'center' }}>
                      {lastScanResult.success
                        ? (lastScanResult.isDuplicate ? <WarningIcon size={20} style={{ color: 'var(--fc-warning-text)' }} /> : <CheckCircleIcon size={20} style={{ color: 'var(--fc-success-text)' }} />)
                        : <CancelIcon size={20} style={{ color: 'var(--fc-danger-text)' }} />}
                    </span>
                    <strong style={{ color: lastScanResult.success ? (lastScanResult.isDuplicate ? 'var(--fc-warning-text)' : 'var(--fc-success-text)') : 'var(--fc-danger-text)' }}>
                      {lastScanResult.message}
                    </strong>
                  </div>

                  {lastScanResult.attendee && (
                    <div style={{ marginTop: '8px', fontSize: '0.9rem', color: 'var(--fc-text-main)' }}>
                      <div>Delegate: <strong>{attendeeLabel(lastScanResult.attendee)}</strong></div>
                      <div>Category: <span style={{ fontWeight: 700, textTransform: 'uppercase' }}>{lastScanResult.attendee.delegate_category}</span></div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--fc-text-muted)', marginTop: '4px' }}>Time: {lastScanResult.timestamp}</div>
                    </div>
                  )}
                </div>
              )}

            </div>
          </div>

          {/* Live Attendance Log Feed */}
          <div>
            <div className="fc-card" style={{ background: 'var(--fc-surface-card)', borderRadius: '12px', border: '1px solid var(--fc-border)', padding: '20px', boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
                <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: 'var(--fc-text-main)', marginRight: 'auto' }}>
                  Venue Checkins ({logs.length}{logSearch ? ' found' : ''})
                </h2>
                <SearchInput
                  value={logSearchInput}
                  onChange={setLogSearchInput}
                  loading={logsSearching && Boolean(logSearchInput)}
                  placeholder="Search name, phone or badge no."
                  maxWidth="300px"
                  style={{ flex: '1 1 220px' }}
                />
              </div>

              {logs.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--fc-text-muted)' }}>
                  {logSearch ? (
                    <>
                      <div>No check-ins at this venue match "{logSearch}".</div>
                      <button
                        type="button"
                        onClick={() => setLogSearchInput('')}
                        style={{ marginTop: '12px', background: 'var(--fc-surface-card)', border: '1px solid var(--fc-border)', color: 'var(--fc-text-main)', padding: '7px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                      >
                        Clear search
                      </button>
                    </>
                  ) : 'No check-ins recorded yet for this venue. Scan attendee badges to begin intake.'}
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="fc-checkin-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
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
                          <td className="fc-ct-name" style={{ padding: '10px 12px' }}>
                            <div style={{ fontWeight: 600, color: 'var(--fc-text-main)' }}>{log.attendee_name}</div>
                          </td>
                          <td className="fc-ct-cat" style={{ padding: '10px 12px' }}>
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
                          <td className="fc-ct-time" style={{ padding: '10px 12px', color: 'var(--fc-text-secondary)' }}>
                            {new Date(log.scanned_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </td>
                          <td className="fc-ct-status" style={{ padding: '10px 12px' }}>
                            {log.scan_status === 'outside_window'
                              ? <span style={{ color: 'var(--fc-warning-text)', fontWeight: 600 }}>Outside window</span>
                              : <span style={{ color: 'var(--fc-success-text)', fontWeight: 600 }}>In window</span>}
                          </td>
                          <td className="fc-ct-by" style={{ padding: '10px 12px', color: 'var(--fc-text-muted)' }}>
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
