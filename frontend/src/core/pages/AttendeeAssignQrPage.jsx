/**
 * AttendeeAssignQrPage Component (/registration/assign-qr and /registration/assign-qr/:id)
 * Shown as the "Assign QR" tab of Registration (see components/registration/RegistrationHeader).
 * 
 * Dedicated Full-Page Physical QR Badge Assignment Station:
 * - Pairs pre-printed physical badges to registered delegates
 * - Supports 6-digit unique code manual typing with real-time stock verification
 * - Works with USB / Bluetooth barcode scanners (they type into the badge field)
 * - Paperless fallback: Auto-generate digital QR credential on the fly
 * - Zero dialog boxes / completely route-driven
 */

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useSearchParams, useLocation } from 'react-router-dom';
import api from '../services/api';
import useAttendeeSearch from '../hooks/useAttendeeSearch';
import SearchInput from '../components/common/SearchInput';
import RegistrationHeader from '../components/registration/RegistrationHeader';
import { useCanViewRoster } from '../hooks/useCanViewRoster';
import QrCode from '../components/common/QrCode';
import PrintPassesDialog from '../components/print/PrintPassesDialog';
import usePassTemplates from '../hooks/usePassTemplates';
import { passDataFromAttendee } from '../utils/passRenderer';
import {
  ConfirmationNumberIcon, 
  QrCodeScannerIcon, 
  CheckCircleIcon, 
  SearchIcon, 
  PrintIcon,
  PlaceIcon,
  MovieIcon,
  CloseIcon,
  FlashOnIcon
} from '../components/common/Icons';
import { attendeeLabel } from '../utils/attendeeDisplay';

export default function AttendeeAssignQrPage() {
  const navigate = useNavigate();
  const canViewRoster = useCanViewRoster();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const location = useLocation();

  const prefilledCode = searchParams.get('code') || location.state?.prefilledCode || '';

  const [attendees, setAttendees] = useState([]);
  const [selectedAttendee, setSelectedAttendee] = useState(null);
  const [attendeeSearch, setAttendeeSearch] = useState('');
  const { matches: serverMatches, searching: attendeeSearching, updateMatch } = useAttendeeSearch(attendeeSearch);
  const [candidateFilter, setCandidateFilter] = useState('pending'); // 'pending' | 'all'
  const [code, setCode] = useState(prefilledCode);
  const [verifying, setVerifying] = useState(false);
  const [codeStatus, setCodeStatus] = useState(null); // { valid: bool, message: string, status: string }
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState(null);
  const [successResult, setSuccessResult] = useState(null);
  const [printItems, setPrintItems] = useState(null);
  // Categories for the pass print (loaded once a badge is paired; ADR 0005)
  const { categories: passCategories, festival: passFestival } = usePassTemplates({ enabled: Boolean(successResult) });

  const searchInputRef = useRef(null);
  const scannerCardRef = useRef(null);
  const codeInputRef = useRef(null);

  // Select a delegate; on phones jump to the badge box (it sits below the roster there) and focus it
  const pickDelegate = (a) => {
    setSelectedAttendee(a);
    if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 640px)').matches) {
      setTimeout(() => {
        scannerCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        codeInputRef.current?.focus({ preventScroll: true });
      }, 50);
    }
  };

  // Sync prefilled code if route query param changes
  useEffect(() => {
    const qCode = searchParams.get('code') || location.state?.prefilledCode;
    if (qCode && qCode !== code) {
      setCode(qCode);
    }
  }, [searchParams, location.state]);

  // If code is prefilled, auto-focus the delegate search input for fast 1-click pairing
  useEffect(() => {
    if (prefilledCode && searchInputRef.current && !selectedAttendee) {
      searchInputRef.current.focus();
    }
  }, [prefilledCode, selectedAttendee]);

  // Load attendees list and pre-select attendee if id param provided
  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    api.get('/registration/attendees', { params: { limit: 500 } })
      .then((res) => {
        if (!isMounted) return;
        const list = res.data?.attendees || [];
        setAttendees(list);

        if (id) {
          const found = list.find(a => String(a.attendee_id) === String(id));
          if (found) {
            setSelectedAttendee(found);
          } else {
            // Fetch individual if not in recent 500
            api.get(`/registration/attendees/${id}`).then(attRes => {
              if (isMounted && attRes.data?.attendee) {
                setSelectedAttendee(attRes.data.attendee);
              }
            }).catch(() => { });
          }
        }
      })
      .catch((err) => {
        console.error('Failed to load attendees:', err);
        if (isMounted) setErrorMessage('Failed to load delegate list.');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => { isMounted = false; };
  }, [id]);

  // Live verification when code reaches 5+ characters
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

  // Assign physical badge action
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
      // Update local attendees list
      setAttendees(prev => prev.map(a => a.attendee_id === selectedAttendee.attendee_id ? { ...a, ...res.data.attendee } : a));
      updateMatch(selectedAttendee.attendee_id, res.data.attendee);
    } catch (err) {
      console.error('Failed to assign badge:', err);
      setErrorMessage(err.response?.data?.error || 'Failed to assign physical QR badge.');
    } finally {
      setSubmitting(false);
    }
  };

  // Auto-generate paperless digital QR
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
      // Update local attendees list
      setAttendees(prev => prev.map(a => a.attendee_id === selectedAttendee.attendee_id ? { ...a, ...res.data.attendee } : a));
      updateMatch(selectedAttendee.attendee_id, res.data.attendee);
    } catch (err) {
      console.error('Failed to issue digital QR:', err);
      setErrorMessage(err.response?.data?.error || 'Failed to auto-generate QR badge.');
    } finally {
      setSubmitting(false);
    }
  };

  // Filter candidates for list
  // Server search covers the whole event (phone formats, badge numbers); local list is the fallback
  const filteredCandidates = (serverMatches ?? attendees).filter(a => {
    const isIssued = Boolean(a.qr_token || a.status === 'badge_issued');
    if (candidateFilter === 'pending' && isIssued) return false;

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

  const serialNo = selectedAttendee?.serial_no || (selectedAttendee ? ('KB26-' + String(selectedAttendee.attendee_id).padStart(4, '0')) : null);

  return (
    <div className="fc-registration-create-page animate-fade-in" style={{ paddingBottom: '80px', maxWidth: '1100px', margin: '0 auto' }}>
      <RegistrationHeader
        active="assign"
        extraCrumb={selectedAttendee && !successResult ? `${attendeeLabel(selectedAttendee)} (${serialNo})` : null}
      />

      {/* ── Error Banner ──────────────────────────────────────────────────── */}
      {errorMessage && (
        <div style={{
          marginBottom: '16px',
          padding: '12px 18px',
          borderRadius: '8px',
          background: 'var(--fc-danger-bg)',
          border: '1px solid var(--fc-danger-border)',
          color: 'var(--fc-danger-text)',
          fontWeight: 600,
          fontSize: '0.88rem'
        }}>
          {errorMessage}
        </div>
      )}

      {/* ── Success Screen: compact confirmation, next action first ───────── */}
      {successResult ? (() => {
        const paired = { ...(selectedAttendee || {}), ...(successResult.attendee || {}) };
        const ribbon = paired.badge_ribbon || paired.delegate_category;
        const isDigital = successResult.type === 'digital';
        const resetForNext = () => {
          setSuccessResult(null);
          setSelectedAttendee(null);
          setCode('');
          setCodeStatus(null);
        };
        return (
          <div style={{
            maxWidth: '560px',
            margin: '8px auto 0',
            background: 'var(--fc-surface-card)',
            border: '1px solid var(--fc-border)',
            borderRadius: '16px',
            boxShadow: 'var(--shadow-sm)',
            padding: '28px'
          }}>
            {/* Heading */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <span style={{
                width: '44px', height: '44px', flexShrink: 0, borderRadius: '50%',
                background: 'var(--fc-success-bg)', border: '1px solid var(--fc-success-border)',
                color: 'var(--fc-success-text)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <CheckCircleIcon size={24} />
              </span>
              <div style={{ minWidth: 0 }}>
                <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: 'var(--fc-text-main)' }}>
                  {isDigital ? 'Digital pass issued' : 'Badge assigned'}
                </h2>
                <p style={{ margin: '2px 0 0', fontSize: '0.88rem', color: 'var(--fc-text-secondary)' }}>
                  {paired.name || 'The delegate'} can now enter screenings and vote.
                </p>
              </div>
            </div>

            {/* Badge + delegate summary */}
            <div style={{
              display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '20px',
              margin: '22px 0', padding: '18px',
              background: 'var(--fc-surface-subtle)', border: '1px solid var(--fc-border)', borderRadius: '12px'
            }}>
              {/* QR always on white so scanners can read it in both themes */}
              <div style={{ background: '#ffffff', padding: '8px', borderRadius: '10px', border: '1px solid var(--fc-border)', flexShrink: 0 }}>
                <QrCode value={successResult.code} size={112} />
              </div>

              <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--fc-text-muted)' }}>
                  Badge no.
                </div>
                <div className="fc-mono" style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--fc-text-main)', lineHeight: 1.15 }}>
                  {successResult.badge_serial || '—'}
                </div>

                <div style={{ height: '1px', background: 'var(--fc-border)', margin: '12px 0' }} />

                <div style={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--fc-text-muted)' }}>
                  Delegate
                </div>
                <div style={{ fontWeight: 700, color: 'var(--fc-text-main)', marginTop: '2px', overflowWrap: 'anywhere' }}>
                  {attendeeLabel(paired)}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
                  {ribbon && (
                    <span style={{
                      background: paired.badge_color || 'var(--fc-brand)', color: '#fff',
                      fontSize: '0.68rem', fontWeight: 800, padding: '2px 8px', borderRadius: '4px',
                      letterSpacing: '0.05em', textTransform: 'uppercase'
                    }}>
                      {ribbon}
                    </span>
                  )}
                  {paired.phone && <span style={{ fontSize: '0.82rem', color: 'var(--fc-text-muted)' }}>{paired.phone}</span>}
                </div>
              </div>
            </div>

            {/* Actions: next delegate is the desk's main loop */}
            {/* wrap-reverse: side by side on desktop; stacked on phones with the main action on top */}
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap-reverse', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => navigate(canViewRoster ? '/audience' : '/registration/add')}
                style={{
                  flex: '1 1 160px', justifyContent: 'center', display: 'inline-flex', alignItems: 'center',
                  padding: '10px 18px', borderRadius: '8px',
                  border: '1px solid var(--fc-border)', background: 'var(--fc-surface-card)',
                  color: 'var(--fc-text-main)', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--fc-surface-hover)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--fc-surface-card)'; }}
              >
                {canViewRoster ? 'Back to Audience' : 'Back to Registration'}
              </button>
              <button
                type="button"
                onClick={() => {
                  const data = passDataFromAttendee({
                    ...paired,
                    qr_token: successResult.code,
                    badge_serial: successResult.badge_serial || paired.badge_serial,
                    serial_no: successResult.serial_no || paired.serial_no
                  }, passCategories);
                  setPrintItems([{ data, categoryCode: data.category_code }]);
                }}
                style={{
                  flex: '1 1 160px', justifyContent: 'center', display: 'inline-flex', alignItems: 'center', gap: '8px',
                  padding: '10px 18px', borderRadius: '8px',
                  border: '1px solid var(--fc-border)', background: 'var(--fc-surface-card)',
                  color: 'var(--fc-text-main)', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--fc-surface-hover)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--fc-surface-card)'; }}
              >
                <PrintIcon size={16} />
                Print pass
              </button>
              <button
                type="button"
                autoFocus
                onClick={resetForNext}
                style={{
                  flex: '1 1 160px', justifyContent: 'center',
                  padding: '10px 20px', borderRadius: '8px',
                  border: '1px solid var(--fc-brand)', background: 'var(--fc-brand)',
                  color: 'var(--fc-text-on-brand)', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: '8px', boxShadow: 'var(--shadow-sm)'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--fc-brand-hover)'; e.currentTarget.style.borderColor = 'var(--fc-brand-hover)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--fc-brand)'; e.currentTarget.style.borderColor = 'var(--fc-brand)'; }}
              >
                <QrCodeScannerIcon size={16} />
                Pair next delegate
              </button>
            </div>
            {printItems && (
              <PrintPassesDialog
                items={printItems}
                defaultMode="full"
                title={`Pass for ${attendeeLabel(paired)}`}
                jobTitle={`${passFestival?.name || 'Festival'} passes`}
                onClose={() => setPrintItems(null)}
              />
            )}
          </div>
        );
      })() : (
        /* ── Main 2-Column Pairing Console (Matches Attendance Page Layout) ── */
        <div className="fc-console-grid fc-aq-grid" style={{ display: 'grid', gap: '24px', alignItems: 'start' }}>

          {/* Left Column: Badge Scanner Deck & Intake Protocol */}
          <div className="fc-aq-col" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* 1. Badge Scanner Deck Card (Identical to AttendancePage) */}
            <div ref={scannerCardRef} className="fc-card fc-aq-scanner" style={{ background: 'var(--fc-surface-card)', borderRadius: '12px', border: '1px solid var(--fc-border)', padding: '24px', boxShadow: 'var(--shadow-sm)' }}>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 16px 0', color: 'var(--fc-text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <QrCodeScannerIcon size={18} /> Badge Scanner Deck
              </h2>

              {/* Coming from Registration › Lost Badge: the old badge no longer works */}
              {location.state?.lostBadge !== undefined && location.state?.lostBadge !== null && (
                <div className="fc-aq-lost-banner" role="status">
                  Old badge #{location.state.lostBadge} is marked lost and won't work anymore. Scan or type the new badge below.
                </div>
              )}

              {/* Prefilled Banner from Bulk Stock */}
              {prefilledCode && (
                <div style={{
                  marginBottom: '14px',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  background: 'rgba(22, 163, 74, 0.08)',
                  border: '1px solid rgba(22, 163, 74, 0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '0.8rem',
                  color: 'var(--fc-success-text)',
                  fontWeight: 700
                }}>
                  <span>Physical Badge #{code} loaded from Bulk Stock.</span>
                  <button
                    type="button"
                    onClick={() => setCode('')}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--fc-success-text)', fontSize: '0.9rem', padding: '0 4px' }}
                    title="Clear prefilled code"
                  >
                    <CloseIcon size={16} />
                  </button>
                </div>
              )}

              {/* 2. Manual / USB Scanner Input Box - DIRECTLY UNDERNEATH CAMERA LIKE ATTENDANCE PAGE */}
              <form onSubmit={handleAssignPhysicalBadge}>
                <div style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: 'var(--fc-text-secondary)', marginBottom: '6px' }}>
                    Enter 6-digit badge number or scan with USB scanner:
                  </label>
                  <div className="fc-aq-code-row" style={{ display: 'flex', gap: '8px' }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                      <input 
                        ref={codeInputRef}
                        type="text"
                        inputMode="numeric"
                        autoFocus={!prefilledCode}
                        maxLength={40}
                        placeholder="e.g. 849201"
                        value={code}
                        onChange={(e) => setCode(e.target.value.replace(/\s+/g, ''))}
                        style={{
                          width: '100%',
                          padding: '11px 13px',
                          borderRadius: '8px',
                          border: codeStatus?.valid ? '2px solid var(--fc-success)' : (codeStatus && !codeStatus.valid) ? '2px solid var(--fc-danger)' : '1.5px solid var(--fc-border)',
                          background: 'var(--fc-surface)',
                          color: 'var(--fc-text-main)',
                          fontSize: '1.05rem',
                          fontWeight: 800,
                          fontFamily: 'monospace',
                          letterSpacing: '0.08em',
                          boxSizing: 'border-box'
                        }}
                      />
                      {verifying && (
                        <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.74rem', color: 'var(--fc-text-muted)' }}>
                          Checking...
                        </span>
                      )}
                    </div>
                    <button
                      type="submit"
                      disabled={submitting || !code.trim() || !selectedAttendee || (codeStatus && !codeStatus.valid)}
                      style={{
                        padding: '0 20px',
                        borderRadius: '8px',
                        border: 'none',
                        background: 'var(--fc-brand, var(--fc-brand))',
                        color: '#ffffff',
                        fontWeight: 800,
                        fontSize: '0.88rem',
                        cursor: (submitting || !code.trim() || !selectedAttendee || (codeStatus && !codeStatus.valid)) ? 'not-allowed' : 'pointer',
                        opacity: (submitting || !code.trim() || !selectedAttendee || (codeStatus && !codeStatus.valid)) ? 0.6 : 1,
                        boxShadow: '0 2px 8px rgba(168, 47, 47, 0.3)',
                        whiteSpace: 'nowrap',
                        transition: 'background 0.15s ease'
                      }}
                      onMouseEnter={(e) => {
                        if (!submitting && code.trim() && selectedAttendee && (!codeStatus || codeStatus.valid)) {
                          e.currentTarget.style.background = 'var(--fc-brand-hover)';
                        }
                      }}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'var(--fc-brand)'}
                    >
                      {submitting ? 'Pairing...' : 'Pair Badge'}
                    </button>
                  </div>
                </div>

                {/* Real-time Code Status Feedback */}
                {codeStatus && (
                  <div style={{
                    marginBottom: '14px',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    background: codeStatus.valid ? 'var(--fc-success-bg)' : 'var(--fc-danger-bg)',
                    color: codeStatus.valid ? 'var(--fc-success-text)' : 'var(--fc-danger-text)',
                    border: codeStatus.valid ? '1px solid rgba(22, 163, 74, 0.25)' : '1px solid rgba(239, 68, 68, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}>
                    {codeStatus.valid ? (
                      <>
                        <CheckCircleIcon size={14} />
                        <span>Valid Physical Badge (Stock Available)</span>
                      </>
                    ) : (
                      <span>{codeStatus.message}</span>
                    )}
                  </div>
                )}
              </form>

              {/* Paperless Fallback Option */}
              <div style={{ paddingTop: '14px', borderTop: '1px dashed var(--fc-border)', textAlign: 'center' }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--fc-text-muted)', display: 'block', marginBottom: '6px' }}>
                  No pre-printed physical badge in hand?
                </span>
                <button
                  type="button"
                  onClick={handleAutoGenerateDigital}
                  disabled={submitting || !selectedAttendee}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: selectedAttendee ? 'var(--fc-brand, var(--fc-brand-text))' : 'var(--fc-text-muted)',
                    fontWeight: 700,
                    fontSize: '0.82rem',
                    cursor: selectedAttendee ? 'pointer' : 'not-allowed',
                    textDecoration: 'underline'
                  }}
                >
                  <FlashOnIcon size={14} style={{ display: 'inline-block', verticalAlign: '-2px', marginRight: '4px' }} />
                  <span>Issue Instant Digital QR Pass &rarr;</span>
                </button>
              </div>
            </div>

            {/* Registration Desk Operational Info */}
            <div className="fc-aq-protocol" style={{
              background: 'rgba(168, 47, 47, 0.04)',
              border: '1px dashed rgba(168, 47, 47, 0.28)',
              borderRadius: '12px',
              padding: '16px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                <PlaceIcon size={15} style={{ color: 'var(--fc-brand, var(--fc-brand-text))' }} />
                <span style={{ fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.03em', textTransform: 'uppercase', color: 'var(--fc-brand, var(--fc-brand-text))' }}>
                  REGISTRATION INTAKE PROTOCOL
                </span>
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--fc-text-secondary)', lineHeight: 1.5 }}>
                1. Verify photo ID &amp; age proof (18+) document at NGMA desk.<br />
                2. Take a pre-printed physical badge card or sticker.<br />
                3. Scan the badge QR code or type its 6-digit code above to pair.
              </div>
            </div>
          </div>

          {/* Right Column: Delegate Selection & Target Details */}
          <div className="fc-aq-col" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Selected Delegate Card (Target Delegate) */}
            <div className={`fc-card fc-aq-target ${selectedAttendee ? '' : 'is-empty'}`} style={{
              background: 'var(--fc-surface-card)',
              borderRadius: '12px',
              border: selectedAttendee ? '2px solid var(--fc-brand, var(--fc-brand))' : '1px solid var(--fc-border)',
              padding: '20px 24px',
              boxShadow: 'var(--shadow-sm)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <span style={{ fontWeight: 800, fontSize: '0.8rem', letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--fc-brand, var(--fc-brand-text))' }}>
                  TARGET DELEGATE
                </span>
                {selectedAttendee && (
                  <span style={{
                    background: selectedAttendee.badge_color || 'var(--fc-brand)',
                    color: '#fff',
                    fontSize: '0.7rem',
                    fontWeight: 800,
                    padding: '3px 10px',
                    borderRadius: '4px',
                    textTransform: 'uppercase'
                  }}>
                    {selectedAttendee.badge_ribbon || selectedAttendee.delegate_category}
                  </span>
                )}
              </div>

              {selectedAttendee ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
                  <div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--fc-text-main)' }}>
                      {attendeeLabel(selectedAttendee)}
                    </div>
                    <div style={{ fontSize: '0.84rem', color: 'var(--fc-text-secondary)', marginTop: '2px' }}>
                      Badge Serial: <strong style={{ fontFamily: 'monospace' }}>{serialNo}</strong> &bull; {selectedAttendee.phone || selectedAttendee.email || 'No contact'}
                    </div>
                    <div style={{ fontSize: '0.76rem', fontWeight: 700, color: selectedAttendee.qr_token ? 'var(--fc-success-text)' : 'var(--fc-warning-text)', marginTop: '4px' }}>
                      {selectedAttendee.qr_token ? 'QR Badge Already Active' : 'Ready to Pair Physical Badge'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedAttendee(null)}
                    className="fc-btn fc-btn-outline"
                    style={{ padding: '6px 14px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}
                  >
                    Change Delegate
                  </button>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '14px', color: 'var(--fc-text-muted)' }}>
                  <SearchIcon size={24} style={{ opacity: 0.4, marginBottom: '6px' }} />
                  <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--fc-text-main)' }}>No Delegate Selected</div>
                  <div style={{ fontSize: '0.78rem', marginTop: '2px' }}>
                    Pick an attendee from the roster below to pair a physical badge.
                  </div>
                </div>
              )}
            </div>

            {/* Delegate Roster Selection Card */}
            <div className="fc-card fc-aq-roster" style={{ background: 'var(--fc-surface-card)', borderRadius: '12px', border: '1px solid var(--fc-border)', padding: '24px', boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 800, margin: 0, color: 'var(--fc-text-main)' }}>
                  Registered Delegates Roster
                </h3>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    onClick={() => setCandidateFilter('pending')}
                    style={{
                      padding: '4px 12px',
                      borderRadius: '14px',
                      border: candidateFilter === 'pending' ? '1px solid var(--fc-brand)' : '1px solid var(--fc-border)',
                      background: candidateFilter === 'pending' ? 'rgba(168, 47, 47, 0.1)' : 'transparent',
                      color: candidateFilter === 'pending' ? 'var(--fc-brand-text)' : 'var(--fc-text-muted)',
                      fontSize: '0.74rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    Pending Arrival
                  </button>
                  <button
                    type="button"
                    onClick={() => setCandidateFilter('all')}
                    style={{
                      padding: '4px 12px',
                      borderRadius: '14px',
                      border: candidateFilter === 'all' ? '1px solid var(--fc-text-main)' : '1px solid var(--fc-border)',
                      background: candidateFilter === 'all' ? 'var(--fc-surface-subtle)' : 'transparent',
                      color: candidateFilter === 'all' ? 'var(--fc-text-main)' : 'var(--fc-text-muted)',
                      fontSize: '0.74rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    All Delegates
                  </button>
                </div>
              </div>

              {/* Roster Search Bar */}
              <div style={{ display: 'flex', marginBottom: '12px' }}>
                <SearchInput
                  inputRef={searchInputRef}
                  value={attendeeSearch}
                  onChange={setAttendeeSearch}
                  loading={attendeeSearching}
                  placeholder="Search name, phone, email or badge no."
                  maxWidth="none"
                />
              </div>

              {/* Roster List */}
              <div style={{ maxHeight: '380px', overflowY: 'auto', border: '1px solid var(--fc-border)', borderRadius: '8px', background: 'var(--fc-surface)' }}>
                {filteredCandidates.slice(0, 20).map((a) => {
                  const isCurSelected = selectedAttendee?.attendee_id === a.attendee_id;
                  return (
                    <div
                      key={a.attendee_id}
                      onClick={() => pickDelegate(a)}
                      style={{
                        padding: '12px 16px',
                        borderBottom: '1px solid var(--fc-border)',
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        background: isCurSelected ? 'rgba(168, 47, 47, 0.08)' : 'transparent',
                        transition: 'background 0.1s ease'
                      }}
                      onMouseEnter={(e) => { if (!isCurSelected) e.currentTarget.style.background = 'var(--fc-surface-subtle)'; }}
                      onMouseLeave={(e) => { if (!isCurSelected) e.currentTarget.style.background = 'transparent'; }}
                    >
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem', color: isCurSelected ? 'var(--fc-brand, var(--fc-brand-text))' : 'var(--fc-text-main)' }}>
                          {attendeeLabel(a)}
                        </div>
                        <div style={{ fontSize: '0.76rem', color: 'var(--fc-text-muted)', marginTop: '2px' }}>
                          Serial: <strong style={{ fontFamily: 'monospace' }}>{a.serial_no || ('KB26-' + a.attendee_id)}</strong> &bull; {a.phone || a.email || 'No contact'}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="fc-aq-pill" style={{
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: '4px',
                          background: a.qr_token ? 'rgba(22, 163, 74, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                          color: a.qr_token ? 'var(--fc-success-text)' : 'var(--fc-warning-text)'
                        }}>
                          {a.qr_token ? 'QR Active' : 'Pending Arrival'}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); pickDelegate(a); }}
                          style={{
                            padding: '4px 10px',
                            borderRadius: '6px',
                            border: isCurSelected ? '1px solid var(--fc-brand, var(--fc-brand))' : '1px solid var(--fc-border)',
                            background: isCurSelected ? 'var(--fc-brand, var(--fc-brand))' : 'var(--fc-surface)',
                            color: isCurSelected ? '#ffffff' : 'var(--fc-text-main)',
                            fontSize: '0.74rem',
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                        >
                          {isCurSelected ? 'Selected' : 'Select'}
                        </button>
                      </div>
                    </div>
                  );
                })}
                {filteredCandidates.length === 0 && (
                  <div style={{ padding: '32px', textAlign: 'center', fontSize: '0.84rem', color: 'var(--fc-text-muted)' }}>
                    {attendeeSearch.trim()
                      ? `No ${candidateFilter === 'pending' ? 'pending ' : ''}delegates match "${attendeeSearch.trim()}".`
                      : candidateFilter === 'pending' ? 'No delegates are pending arrival.' : 'No registered delegates yet.'}
                    {attendeeSearch.trim() && candidateFilter === 'pending' && (
                      <div style={{ marginTop: '8px' }}>
                        <button type="button" onClick={() => setCandidateFilter('all')} style={{ background: 'none', border: 'none', color: 'var(--fc-brand-text)', fontWeight: 700, cursor: 'pointer', fontSize: '0.84rem', padding: 0 }}>
                          Search all delegates instead
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
              {filteredCandidates.length > 20 && (
                <div style={{ marginTop: '8px', fontSize: '0.76rem', color: 'var(--fc-text-muted)' }}>
                  Showing 20 of {filteredCandidates.length}. Keep typing to narrow the list.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

