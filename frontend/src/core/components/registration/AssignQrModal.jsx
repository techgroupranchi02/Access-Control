/**
 * AssignQrModal Component
 * 
 * Interactive QR Badge Assignment Station:
 * - Assigns pre-printed physical badges to registered delegates
 * - Supports 6-digit unique code manual typing with real-time stock check
 * - Supports camera scanner via Html5Qrcode to scan physical badge card
 * - Supports auto-generating digital credential on the fly
 */

import React, { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import api from '../../services/api';
import useAttendeeSearch from '../../hooks/useAttendeeSearch';
import QrCode from '../common/QrCode';
import { 
  ConfirmationNumberIcon, 
  QrCodeScannerIcon, 
  CheckCircleIcon, 
  SearchIcon, 
  CloseIcon, 
  PrintIcon 
} from '../common/Icons';
import { attendeeLabel } from '../../utils/attendeeDisplay';

export default function AssignQrModal({ 
  open, 
  onClose, 
  initialAttendee = null, 
  attendees = [], 
  onAssigned 
}) {
  const [selectedAttendee, setSelectedAttendee] = useState(initialAttendee);
  const [attendeeSearch, setAttendeeSearch] = useState('');
  const { matches: serverMatches } = useAttendeeSearch(attendeeSearch);
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [codeStatus, setCodeStatus] = useState(null); // { valid: bool, message: string, status: string }
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [successResult, setSuccessResult] = useState(null);

  const scannerRef = useRef(null);

  // Sync initialAttendee
  useEffect(() => {
    if (open) {
      setSelectedAttendee(initialAttendee || null);
      setAttendeeSearch('');
      setCode('');
      setCodeStatus(null);
      setScanning(false);
      setCameraError(null);
      setErrorMessage(null);
      setSuccessResult(null);
    }
  }, [open, initialAttendee]);

  // Clean up scanner on unmount or close
  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        try {
          if (scannerRef.current.isScanning) {
            scannerRef.current.stop().then(() => {
              try { scannerRef.current.clear(); } catch { }
            }).catch(() => { });
          } else {
            try { scannerRef.current.clear(); } catch { }
          }
        } catch { }
        scannerRef.current = null;
      }
    };
  }, []);

  // Live validation debounced when user enters 6 digits
  useEffect(() => {
    const clean = code.trim();
    if (clean.length < 5) {
      setCodeStatus(null);
      return;
    }

    let isMounted = true;
    const timer = setTimeout(async () => {
      try {
        setVerifying(true);
        const res = await api.get(`/registration/qr/check/${encodeURIComponent(clean)}`);
        if (isMounted) {
          setCodeStatus(res.data);
        }
      } catch (err) {
        if (isMounted) {
          setCodeStatus({ valid: false, message: 'Failed to verify code availability.' });
        }
      } finally {
        if (isMounted) setVerifying(false);
      }
    }, 250);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [code]);

  // Handle Camera Scanner Toggle
  const toggleCameraScanner = () => {
    if (scanning) {
      stopCameraScanner();
    } else {
      startCameraScanner();
    }
  };

  const startCameraScanner = () => {
    setScanning(true);
    setCameraError(null);

    setTimeout(() => {
      try {
        const html5Qr = new Html5Qrcode('desk-badge-camera-scanner-view');
        scannerRef.current = html5Qr;

        const config = {
          fps: 10,
          qrbox: { width: 200, height: 200 },
          aspectRatio: 1.0
        };

        html5Qr.start(
          { facingMode: 'environment' },
          config,
          (decodedText) => {
            let extractedCode = decodedText.trim();
            if (extractedCode.includes('code=')) {
              const match = extractedCode.match(/code=([a-zA-Z0-9-]+)/);
              if (match) extractedCode = match[1];
            }
            setCode(extractedCode);
            stopCameraScanner();
          },
          () => { }
        ).catch((err) => {
          console.error('Camera init error:', err);
          setCameraError(err?.message || 'Unable to access camera.');
          setScanning(false);
        });
      } catch (err) {
        console.error('Scanner init exception:', err);
        setCameraError('Camera initialization failed.');
        setScanning(false);
      }
    }, 120);
  };

  const stopCameraScanner = () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          scannerRef.current.stop().then(() => {
            try { scannerRef.current.clear(); } catch { }
          }).catch(() => { });
        } else {
          try { scannerRef.current.clear(); } catch { }
        }
      } catch { }
      scannerRef.current = null;
    }
    setScanning(false);
  };

  const handleAutoGenerateDigital = async () => {
    if (!selectedAttendee) {
      setErrorMessage('Please select a delegate first.');
      return;
    }
    try {
      setSubmitting(true);
      setErrorMessage(null);
      const res = await api.post(`/registration/attendees/${selectedAttendee.attendee_id}/issue-qr`);
      setSuccessResult({
        attendee: res.data.attendee,
        code: res.data.qr_token,
        badge_serial: res.data.badge_serial,
        serial_no: res.data.serial_no,
        type: 'digital'
      });
      if (onAssigned) onAssigned(res.data.attendee);
    } catch (err) {
      console.error('Failed to issue digital QR:', err);
      setErrorMessage(err.response?.data?.error || 'Failed to auto-generate QR badge.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAssignPhysicalBadge = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!selectedAttendee) {
      setErrorMessage('Please select a delegate first.');
      return;
    }
    const cleanCode = code.trim();
    if (!cleanCode) {
      setErrorMessage('Please scan the badge QR or enter its 6-digit badge number.');
      return;
    }

    try {
      setSubmitting(true);
      setErrorMessage(null);
      const res = await api.post(`/registration/attendees/${selectedAttendee.attendee_id}/assign-qr`, {
        qr_code: cleanCode
      });
      setSuccessResult({
        attendee: res.data.attendee,
        code: res.data.qr_token || cleanCode,
        badge_serial: res.data.badge_serial,
        serial_no: res.data.serial_no,
        type: 'physical'
      });
      if (onAssigned) onAssigned(res.data.attendee);
    } catch (err) {
      console.error('Failed to assign badge:', err);
      setErrorMessage(err.response?.data?.error || 'Failed to assign physical QR badge.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  // Filter pending or unissued attendees for the search picker
  // Server search covers the whole event (phone formats, badge numbers); local list is the fallback
  const filteredCandidates = (serverMatches ?? attendees).filter(a => {
    if (serverMatches || !attendeeSearch.trim()) return true;
    const q = attendeeSearch.toLowerCase();
    const cd = typeof a.custom_data === 'string' ? (() => { try { return JSON.parse(a.custom_data); } catch { return {}; } })() : (a.custom_data || {});
    const serial = (a.serial_no || cd.serial_no || ('KB26-' + a.attendee_id)).toLowerCase();
    return (
      (a.name || '').toLowerCase().includes(q) ||
      (a.phone || '').toLowerCase().includes(q) ||
      (a.email || '').toLowerCase().includes(q) ||
      serial.includes(q)
    );
  });

  return (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.78)',
        backdropFilter: 'blur(5px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1250,
        padding: '16px'
      }}
      onClick={(e) => { if (e.target === e.currentTarget) { stopCameraScanner(); onClose(); } }}
    >
      <div 
        style={{
          background: 'var(--fc-surface-card)',
          borderRadius: '16px',
          border: '1px solid var(--fc-border)',
          width: '100%',
          maxWidth: '680px',
          maxHeight: '94vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 24px 48px rgba(0, 0, 0, 0.25)',
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
            <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: 'var(--fc-text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <QrCodeScannerIcon size={20} style={{ color: 'var(--fc-brand-text)' }} />
              <span>Assign Physical QR Badge to Delegate</span>
            </h2>
            <p style={{ margin: '3px 0 0 0', fontSize: '0.8rem', color: 'var(--fc-text-muted)' }}>
              Scan physical card or enter the 6-digit code to pair delegate credentials instantly.
            </p>
          </div>
          <button 
            type="button" 
            onClick={() => { stopCameraScanner(); onClose(); }}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--fc-text-muted)', fontSize: '1.2rem', padding: '4px' }}
          >
            <CloseIcon size={16} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Error Banner */}
          {errorMessage && (
            <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'var(--fc-danger-bg)', border: '1px solid var(--fc-danger-border)', color: 'var(--fc-danger-text)', fontSize: '0.84rem', fontWeight: 600 }}>
              {errorMessage}
            </div>
          )}

          {/* Success Screen after assignment */}
          {successResult ? (
            <div style={{ textAlign: 'center', padding: '24px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
              <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(22, 163, 74, 0.12)', border: '2px solid var(--fc-success)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fc-success-text)' }}>
                <CheckCircleIcon size={32} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--fc-text-main)' }}>
                  Badge Credential Active!
                </h3>
                <p style={{ margin: '6px 0 0 0', fontSize: '0.86rem', color: 'var(--fc-text-secondary)' }}>
                  Physical Badge <strong>#{successResult.badge_serial || successResult.code}</strong> is now linked to <strong>{successResult.attendee?.name}</strong> ({successResult.serial_no}).
                </p>
              </div>

              <div style={{ background: '#ffffff', padding: '10px', borderRadius: '10px', border: '1px solid var(--fc-border)', boxShadow: 'var(--shadow-sm)' }}>
                <QrCode value={successResult.code} size={140} />
                <div style={{ fontFamily: 'monospace', fontWeight: 900, fontSize: '1.1rem', color: 'var(--fc-text-main)', marginTop: '6px' }}>
                  {successResult.badge_serial ? `BADGE NO: ${successResult.badge_serial}` : `CODE: ${successResult.code}`}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => {
                    setSuccessResult(null);
                    setSelectedAttendee(null);
                    setCode('');
                    setCodeStatus(null);
                  }}
                  style={{ padding: '9px 18px', borderRadius: '8px', border: '1px solid var(--fc-border)', background: 'var(--fc-surface)', fontWeight: 700, fontSize: '0.86rem', cursor: 'pointer', color: 'var(--fc-text-main)' }}
                >
                  Pair Another Delegate
                </button>
                <button
                  type="button"
                  onClick={() => { stopCameraScanner(); onClose(); }}
                  style={{ padding: '9px 24px', borderRadius: '8px', border: 'none', background: 'var(--fc-brand)', color: '#ffffff', fontWeight: 700, fontSize: '0.86rem', cursor: 'pointer' }}
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* ── STEP 1: SELECT ATTENDEE ────────────────────────────────────────── */}
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: 'var(--fc-brand-text)', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: '6px' }}>
                  1. Select Registered Delegate
                </label>

                {selectedAttendee ? (
                  <div style={{
                    padding: '12px 16px',
                    borderRadius: '10px',
                    border: '1.5px solid var(--fc-brand)',
                    background: 'rgba(168, 47, 47, 0.05)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontWeight: 800, fontSize: '0.96rem', color: 'var(--fc-text-main)' }}>
                          {attendeeLabel(selectedAttendee)}
                        </span>
                        <span style={{
                          background: selectedAttendee.badge_color || 'var(--fc-brand)',
                          color: '#fff',
                          fontSize: '0.66rem',
                          fontWeight: 800,
                          padding: '2px 8px',
                          borderRadius: '4px',
                          textTransform: 'uppercase'
                        }}>
                          {selectedAttendee.badge_ribbon || selectedAttendee.delegate_category}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--fc-text-secondary)', marginTop: '3px' }}>
                        {selectedAttendee.serial_no || ('KB26-' + selectedAttendee.attendee_id)} • Phone: {selectedAttendee.phone || '—'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedAttendee(null)}
                      style={{
                        padding: '4px 10px',
                        borderRadius: '6px',
                        border: '1px solid var(--fc-border)',
                        background: 'var(--fc-surface)',
                        color: 'var(--fc-text-secondary)',
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <div>
                    <div style={{ position: 'relative', marginBottom: '8px' }}>
                      <input 
                        type="text"
                        placeholder="Search attendee by name, phone, email, or #KB26-0021..."
                        value={attendeeSearch}
                        onChange={(e) => setAttendeeSearch(e.target.value)}
                        style={{
                          width: '100%',
                          height: '40px',
                          padding: '0 12px 0 34px',
                          borderRadius: '8px',
                          border: '1px solid var(--fc-border)',
                          background: 'var(--fc-surface)',
                          color: 'var(--fc-text-main)',
                          fontSize: '0.86rem',
                          boxSizing: 'border-box'
                        }}
                      />
                      <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', display: 'flex', color: 'var(--fc-text-muted)' }}>
                        <SearchIcon size={16} />
                      </span>
                    </div>

                    <div style={{ maxHeight: '150px', overflowY: 'auto', border: '1px solid var(--fc-border)', borderRadius: '8px', background: 'var(--fc-surface-subtle)' }}>
                      {filteredCandidates.slice(0, 10).map((a) => (
                        <div
                          key={a.attendee_id}
                          onClick={() => setSelectedAttendee(a)}
                          style={{
                            padding: '8px 12px',
                            borderBottom: '1px solid var(--fc-border)',
                            cursor: 'pointer',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            transition: 'background 0.1s ease'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--fc-surface)'}
                          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                        >
                          <div>
                            <span style={{ fontWeight: 700, fontSize: '0.86rem', color: 'var(--fc-text-main)' }}>{attendeeLabel(a)}</span>
                            <span style={{ fontSize: '0.74rem', color: 'var(--fc-text-muted)', marginLeft: '6px' }}>
                              ({a.serial_no || ('KB26-' + a.attendee_id)})
                            </span>
                          </div>
                          <span style={{
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: '4px',
                            background: a.qr_token ? 'rgba(22, 163, 74, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                            color: a.qr_token ? 'var(--fc-success-text)' : 'var(--fc-warning-text)'
                          }}>
                            {a.qr_token ? 'QR Issued' : 'Pending Arrival'}
                          </span>
                        </div>
                      ))}
                      {filteredCandidates.length === 0 && (
                        <div style={{ padding: '16px', textAlign: 'center', fontSize: '0.8rem', color: 'var(--fc-text-muted)' }}>
                          No matching delegate found.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* ── STEP 2: SCAN OR ENTER 6-DIGIT BADGE CODE ───────────────────────── */}
              <div style={{ borderTop: '1px solid var(--fc-border)', paddingTop: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--fc-brand-text)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                    2. Scan or Enter Physical 6-Digit Badge Code
                  </label>
                  <button
                    type="button"
                    onClick={toggleCameraScanner}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '6px',
                      border: scanning ? '1px solid var(--fc-danger)' : '1px solid var(--fc-border)',
                      background: scanning ? 'rgba(239, 68, 68, 0.1)' : 'var(--fc-surface)',
                      color: scanning ? 'var(--fc-danger-text)' : 'var(--fc-text-main)',
                      fontSize: '0.76rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px'
                    }}
                  >
                    <QrCodeScannerIcon size={14} />
                    <span>{scanning ? 'Close Camera' : 'Scan with Camera'}</span>
                  </button>
                </div>

                {/* Camera Scanner Container */}
                {scanning && (
                  <div style={{ marginBottom: '14px', borderRadius: '12px', overflow: 'hidden', border: '2px dashed var(--fc-brand)', background: '#000', textAlign: 'center', position: 'relative' }}>
                    <div id="desk-badge-camera-scanner-view" style={{ width: '100%', minHeight: '220px' }}></div>
                    {cameraError && (
                      <div style={{ padding: '10px', background: 'var(--fc-danger-bg)', color: 'var(--fc-danger-text)', fontSize: '0.8rem' }}>
                        {cameraError}
                      </div>
                    )}
                    <div style={{ padding: '6px', background: 'rgba(0,0,0,0.7)', color: '#fff', fontSize: '0.74rem' }}>
                      Position pre-printed badge QR inside the viewfinder
                    </div>
                  </div>
                )}

                {/* Big 6-Digit Input Box */}
                <form onSubmit={handleAssignPhysicalBadge}>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                      <input 
                        type="text"
                        autoFocus
                        maxLength={40}
                        placeholder="Enter 6-digit code (e.g. 849201)"
                        value={code}
                        onChange={(e) => setCode(e.target.value.replace(/\s+/g, ''))}
                        style={{
                          width: '100%',
                          height: '48px',
                          padding: '0 16px',
                          fontFamily: 'monospace',
                          fontSize: '1.25rem',
                          fontWeight: 800,
                          letterSpacing: '0.12em',
                          borderRadius: '8px',
                          border: codeStatus?.valid ? '2px solid var(--fc-success)' : (codeStatus && !codeStatus.valid) ? '2px solid var(--fc-danger)' : '1.5px solid var(--fc-border)',
                          background: 'var(--fc-surface)',
                          color: 'var(--fc-text-main)',
                          boxSizing: 'border-box'
                        }}
                      />
                      {verifying && (
                        <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.76rem', color: 'var(--fc-text-muted)' }}>
                          Checking...
                        </span>
                      )}
                    </div>

                    <button
                      type="submit"
                      disabled={submitting || !code.trim() || !selectedAttendee || (codeStatus && !codeStatus.valid)}
                      style={{
                        height: '48px',
                        padding: '0 24px',
                        borderRadius: '8px',
                        border: 'none',
                        background: 'var(--fc-brand)',
                        color: '#ffffff',
                        fontWeight: 800,
                        fontSize: '0.9rem',
                        cursor: (submitting || !code.trim() || !selectedAttendee || (codeStatus && !codeStatus.valid)) ? 'not-allowed' : 'pointer',
                        opacity: (submitting || !code.trim() || !selectedAttendee || (codeStatus && !codeStatus.valid)) ? 0.6 : 1,
                        boxShadow: '0 4px 12px rgba(168, 47, 47, 0.3)',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {submitting ? 'Pairing...' : 'Pair & Issue Badge'}
                    </button>
                  </div>

                  {/* Real-time Code Status Feedback */}
                  {codeStatus && (
                    <div style={{
                      marginTop: '8px',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      background: codeStatus.valid ? 'rgba(22, 163, 74, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                      color: codeStatus.valid ? 'var(--fc-success-text)' : 'var(--fc-danger-text)',
                      border: codeStatus.valid ? '1px solid rgba(22, 163, 74, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)'
                    }}>
                      {codeStatus.message}
                    </div>
                  )}
                </form>

                {/* Paperless Fallback Option */}
                <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px dashed var(--fc-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.76rem', color: 'var(--fc-text-muted)' }}>
                    No physical card on hand? Issue a paperless digital badge:
                  </span>
                  <button
                    type="button"
                    onClick={handleAutoGenerateDigital}
                    disabled={submitting || !selectedAttendee}
                    style={{
                      background: 'transparent',
                      border: '1px dashed var(--fc-border)',
                      color: 'var(--fc-brand-text)',
                      padding: '5px 12px',
                      borderRadius: '6px',
                      fontWeight: 700,
                      fontSize: '0.76rem',
                      cursor: (submitting || !selectedAttendee) ? 'not-allowed' : 'pointer'
                    }}
                  >
                    Auto-Generate Digital QR Pass
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Modal Footer */}
        {!successResult && (
          <div style={{
            padding: '12px 24px',
            borderTop: '1px solid var(--fc-border)',
            background: 'var(--fc-surface-subtle)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px'
          }}>
            <button
              type="button"
              onClick={() => { stopCameraScanner(); onClose(); }}
              style={{
                padding: '8px 18px',
                borderRadius: '8px',
                border: '1px solid var(--fc-border)',
                background: 'var(--fc-surface)',
                color: 'var(--fc-text-secondary)',
                fontWeight: 600,
                fontSize: '0.84rem',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

