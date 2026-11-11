/**
 * LostBadgePage (/registration/lost-badge): Registration › Lost Badge tab (docs/adr/0001, Amendment 2)
 *
 * Desk flow for a delegate who lost their badge:
 *   1. Find the delegate by name, phone, email or badge number (whole-event server search).
 *   2. Confirm identity with the last 4 digits of their registered mobile; the server checks them
 *      and marks the badge lost. A lost badge is refused at check-in and voting and never goes
 *      back into stock.
 *   3. Assign a new badge: opens Assign QR for that delegate.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../services/api';
import RegistrationHeader from '../components/registration/RegistrationHeader';
import useAttendeeSearch from '../hooks/useAttendeeSearch';
import {
  SearchIcon,
  WarningIcon,
  CheckCircleIcon,
  QrCodeScannerIcon,
  CloseIcon
} from '../components/common/Icons';

function maskPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length < 6) return digits ? '••••' : '—';
  return `${digits.slice(0, digits.length - 6)}${'•'.repeat(6)}`;
}

function maskEmail(email) {
  if (!email || !email.includes('@')) return email || '—';
  const [user, domain] = email.split('@');
  return `${user.slice(0, 2)}${'•'.repeat(Math.max(user.length - 2, 2))}@${domain}`;
}

function formatDate(value) {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString([], { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function badgeState(a) {
  if (!a) return { key: 'none', label: 'No badge' };
  if (a.badge_serial || a.qr_token) return { key: 'active', label: a.badge_serial ? `Badge #${a.badge_serial}` : 'Digital pass' };
  if (Number(a.lost_badge_count) > 0) return { key: 'lost', label: 'Badge lost' };
  return { key: 'none', label: 'No badge' };
}

export default function LostBadgePage() {
  const navigate = useNavigate();
  const { id: routeId } = useParams();
  const [search, setSearch] = useState('');
  const { matches, searching, updateMatch } = useAttendeeSearch(search, { minLength: 2, limit: 30 });
  const [selected, setSelected] = useState(null); // full attendee from GET /registration/attendees/:id
  const [loadingSelected, setLoadingSelected] = useState(false);
  const [digits, setDigits] = useState('');
  const [marking, setMarking] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null); // { lost_badges, message }
  const [digitCheck, setDigitCheck] = useState({ state: 'idle', message: '' }); // idle | checking | ok | bad
  const detailRef = useRef(null);
  const digitsRef = useRef(null);

  const loadAttendee = async (attendeeId) => {
    setLoadingSelected(true);
    setError('');
    try {
      const res = await api.get(`/registration/attendees/${attendeeId}`);
      setSelected(res.data?.attendee || null);
    } catch (err) {
      setError(err?.response?.data?.error || 'Could not load this delegate.');
      setSelected(null);
    } finally {
      setLoadingSelected(false);
    }
  };

  // Deep link: /registration/lost-badge/:id
  useEffect(() => {
    if (routeId) loadAttendee(routeId);
  }, [routeId]);

  const pickDelegate = (a) => {
    setResult(null);
    setDigits('');
    loadAttendee(a.attendee_id);
    if (window.matchMedia && window.matchMedia('(max-width: 860px)').matches) {
      setTimeout(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
    }
  };

  useEffect(() => {
    if (selected && !result) digitsRef.current?.focus({ preventScroll: true });
  }, [selected, result]);

  const state = useMemo(() => badgeState(selected), [selected]);
  const hasPhone = String(selected?.phone || '').replace(/\D/g, '').length >= 4;

  // Check the digits on the server as soon as the 4th one is typed (the real digits never reach the browser)
  useEffect(() => {
    if (!selected || !hasPhone || digits.length !== 4) {
      setDigitCheck({ state: 'idle', message: '' });
      return undefined;
    }
    let alive = true;
    setDigitCheck({ state: 'checking', message: '' });
    api.post(`/registration/attendees/${selected.attendee_id}/verify-phone`, { phone_last4: digits })
      .then(() => { if (alive) setDigitCheck({ state: 'ok', message: 'Matches the registered mobile number.' }); })
      .catch((err) => {
        if (alive) setDigitCheck({ state: 'bad', message: err?.response?.data?.error || 'Could not check the digits.' });
      });
    return () => { alive = false; };
  }, [digits, selected, hasPhone]);

  const handleMarkLost = async (e) => {
    e.preventDefault();
    if (!selected) return;
    if (hasPhone && digits.length !== 4) {
      setError('Enter the last 4 digits of the delegate\'s mobile number.');
      return;
    }
    const label = selected.badge_serial ? `badge #${selected.badge_serial}` : 'the badge';
    if (!window.confirm(`Mark ${label} of ${selected.name} as lost? It will stop working everywhere and can't be used again.`)) return;
    setMarking(true);
    setError('');
    try {
      const res = await api.post(`/registration/attendees/${selected.attendee_id}/report-lost`, { phone_last4: digits });
      const lostNow = res.data?.lost_badges || [];
      setResult({ lost_badges: lostNow, message: res.data?.message });
      setDigits('');
      updateMatch(selected.attendee_id, {
        badge_serial: null,
        qr_token: null,
        lost_badge_count: Number(selected.lost_badges?.length || 0) + lostNow.length
      });
      await loadAttendee(selected.attendee_id);
    } catch (err) {
      setError(err?.response?.data?.error || 'Could not mark the badge as lost.');
    } finally {
      setMarking(false);
    }
  };

  const goAssign = () => {
    const lostSerial = result?.lost_badges?.[0] || selected?.lost_badges?.[0]?.badge_serial || null;
    navigate(`/registration/assign-qr/${selected.attendee_id}`, { state: { lostBadge: lostSerial } });
  };

  const clearSelection = () => {
    setSelected(null);
    setResult(null);
    setDigits('');
    setError('');
    if (routeId) navigate('/registration/lost-badge', { replace: true });
  };

  const list = matches || [];

  return (
    <div className="fc-registration-create-page fc-lost-page" style={{ maxWidth: '1100px', margin: '0 auto', padding: '24px' }}>
      <RegistrationHeader active="lost" extraCrumb={selected?.name || null} />

      <div className="fc-console-grid fc-lost-grid">
        {/* 1. Find the delegate */}
        <section className="fc-card fc-lost-card fc-lost-search">
          <div className="fc-lost-step"><span className="fc-lost-step-no">1</span> Find the delegate</div>
          <div className="fc-lost-search-box">
            <SearchIcon size={16} />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, phone, email or badge number"
              aria-label="Search delegates"
              autoFocus
            />
            {search && (
              <button type="button" className="fc-lost-clear" onClick={() => setSearch('')} aria-label="Clear search">
                <CloseIcon size={12} />
              </button>
            )}
          </div>

          {search.trim().length < 2 ? (
            <p className="fc-lost-muted">Type at least 2 characters. A delegate can also be found by the number on the badge they lost.</p>
          ) : searching && !matches ? (
            <p className="fc-lost-muted">Searching…</p>
          ) : list.length === 0 ? (
            <p className="fc-lost-muted">No delegate matches “{search.trim()}”.</p>
          ) : (
            <ul className="fc-lost-results">
              {list.map(a => {
                const st = badgeState(a);
                const isSel = selected?.attendee_id === a.attendee_id;
                return (
                  <li key={a.attendee_id}>
                    <button type="button" className={`fc-lost-result ${isSel ? 'is-selected' : ''}`} onClick={() => pickDelegate(a)}>
                      <span className="fc-lost-result-main">
                        <strong>{a.name}</strong>
                        <span>{[a.badge_ribbon, maskPhone(a.phone)].filter(Boolean).join(' · ')}</span>
                      </span>
                      <span className={`fc-lost-pill is-${st.key}`}>{st.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* 2 + 3. Confirm, mark lost, assign new */}
        <section ref={detailRef} className={`fc-card fc-lost-card fc-lost-detail ${selected ? '' : 'is-empty'}`}>
          {loadingSelected ? (
            <p className="fc-lost-muted">Loading delegate…</p>
          ) : !selected ? (
            <div className="fc-lost-empty">
              <QrCodeScannerIcon size={28} />
              <p>Select a delegate to report a lost badge and give them a new one.</p>
            </div>
          ) : (
            <>
              <div className="fc-lost-person">
                <div>
                  <h2>{selected.name}</h2>
                  <p>{[selected.delegate_category, selected.serial_no].filter(Boolean).join(' · ')}</p>
                </div>
                <button type="button" className="fc-lost-icon-btn" onClick={clearSelection} aria-label="Close">
                  <CloseIcon size={14} />
                </button>
              </div>

              <dl className="fc-lost-facts">
                <div><dt>Mobile</dt><dd>{maskPhone(selected.phone)}</dd></div>
                <div><dt>Email</dt><dd>{maskEmail(selected.email)}</dd></div>
                <div><dt>Current badge</dt><dd><span className={`fc-lost-pill is-${state.key}`}>{state.label}</span></dd></div>
              </dl>

              {selected.lost_badges?.length > 0 && (
                <div className="fc-lost-history">
                  <strong>Lost earlier</strong>
                  <ul>
                    {selected.lost_badges.map(l => (
                      <li key={`${l.badge_serial}-${l.lost_at}`}>
                        Badge #{l.badge_serial || '—'} · {formatDate(l.lost_at)}{l.lost_by ? ` · by ${l.lost_by}` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {error && (
                <div className="fc-lost-alert is-error" role="alert"><WarningIcon size={16} /> <span>{error}</span></div>
              )}

              {result && (
                <div className="fc-lost-alert is-success" role="status"><CheckCircleIcon size={16} /> <span>{result.message}</span></div>
              )}

              {state.key === 'active' ? (
                <form className="fc-lost-form" onSubmit={handleMarkLost}>
                  <div className="fc-lost-step"><span className="fc-lost-step-no">2</span> Confirm it's them, then mark the badge lost</div>
                  {hasPhone ? (
                    <>
                      <label htmlFor="lost-digits">Last 4 digits of the delegate's mobile number</label>
                      <input
                        id="lost-digits"
                        className={digitCheck.state === 'bad' ? 'is-bad' : digitCheck.state === 'ok' ? 'is-ok' : undefined}
                        aria-invalid={digitCheck.state === 'bad'}
                        aria-describedby="lost-digits-msg"
                        ref={digitsRef}
                        inputMode="numeric"
                        autoComplete="off"
                        maxLength={4}
                        value={digits}
                        onChange={(e) => { setError(''); setDigits(e.target.value.replace(/\D/g, '').slice(0, 4)); }}
                        placeholder="••••"
                      />
                      <div id="lost-digits-msg" className={`fc-lost-digit-msg is-${digitCheck.state}`} aria-live="polite">
                        {digitCheck.state === 'checking' && 'Checking…'}
                        {digitCheck.state === 'ok' && <><CheckCircleIcon size={14} /> {digitCheck.message}</>}
                        {digitCheck.state === 'bad' && <><WarningIcon size={14} /> {digitCheck.message}</>}
                      </div>
                      <small>Ask the delegate to tell you the digits. Don't read them out.</small>
                    </>
                  ) : (
                    <p className="fc-lost-muted">No mobile number on file, so only an admin can mark this badge lost.</p>
                  )}
                  <button type="submit" className="fc-lost-btn fc-lost-btn--danger" disabled={marking || (hasPhone && digitCheck.state !== 'ok')}>
                    <WarningIcon size={15} /> {marking ? 'Marking…' : 'Mark badge as lost'}
                  </button>
                </form>
              ) : (
                <div className="fc-lost-form">
                  <div className="fc-lost-step"><span className="fc-lost-step-no">{result ? 3 : 2}</span> Give the delegate a new badge</div>
                  <p className="fc-lost-muted">
                    {state.key === 'lost' || result
                      ? 'The old badge no longer works. Pair a new pre-printed badge or issue a digital pass.'
                      : 'This delegate has no badge yet. Pair a pre-printed badge or issue a digital pass.'}
                  </p>
                  <button type="button" className="fc-lost-btn fc-lost-btn--primary" onClick={goAssign}>
                    <QrCodeScannerIcon size={15} /> Assign new badge
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
