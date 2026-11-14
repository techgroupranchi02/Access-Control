/**
 * AttendeeCreatePage Component (/registration/add)
 * 
 * Dedicated Full-Page Attendee Intake & Registration Form:
 * - 100% Dynamic form schema strictly synced from Audience Settings
 * - Left column: Pass Policy & NGMA Venue Pickup Information (data-driven)
 * - Right column: Full interactive delegate registration with dynamic field validation
 * - Dynamic consent & legal checkboxes (no hardcoded fields or labels)
 * - Dynamic signature/place/date inputs (only rendered if configured in schema)
 * - Instant Pass issuance & redirection back to /registration roster
 */

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import useAttendeeSearch from '../hooks/useAttendeeSearch';
import RegistrationHeader from '../components/registration/RegistrationHeader';
import { useCanViewRoster } from '../hooks/useCanViewRoster';
import { attendeeLabel, isValidMobile, phoneDigitsOf } from '../utils/attendeeDisplay';
import {
  CalendarTodayIcon,
  CloseIcon
} from '../components/common/Icons';

export default function AttendeeCreatePage() {
  const navigate = useNavigate();
  const dobPickerRef = useRef(null);

  const [categories, setCategories] = useState([]);
  const [formSchema, setFormSchema] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  // Optional: pair a pre-printed pass in the same step (spot registration)
  const [badgeCode, setBadgeCode] = useState('');
  const [badgeStatus, setBadgeStatus] = useState(null);

  // Users without the full delegate list (desk volunteers) stay on this page after saving
  const canViewRoster = useCanViewRoster();
  const [successInfo, setSuccessInfo] = useState(null); // { message, attendeeId, paired }
  // Set when the server refuses the mobile number as already registered (409)
  const [serverDuplicate, setServerDuplicate] = useState(null);
  const formDefaultsRef = useRef({}); // schema/category-driven defaults applied after load

  // Form State
  const makeBlankForm = () => ({
    name: '',
    email: '',
    phone: '',
    dob: '',
    gender_identity: '',
    pass_type: 'Full-Festival Pass',
    pass_days: [],
    delegate_category: 'bangalore_general',
    community_identity: '',
    attended_mumbai: '',
    signature_name: '',
    place: 'Bengaluru',
    registration_date: new Date().toLocaleDateString('en-GB'),
    receive_updates: false,
    appear_in_attendee_list: false,
    certified_18_plus: false,
    custom_data: {}
  });
  const [intakeForm, setIntakeForm] = useState(makeBlankForm);

  const resetForm = () => {
    setIntakeForm({ ...makeBlankForm(), ...formDefaultsRef.current });
    setBadgeCode('');
    setBadgeStatus(null);
    setErrorMessage(null);
    setServerDuplicate(null);
  };

  const convertToIsoDate = (val) => {
    if (!val) return '';
    if (val.includes('-')) return val;
    const parts = val.split('/');
    if (parts.length === 3) {
      const [d, m, y] = parts;
      if (y && y.length === 4) return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    return '';
  };

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    Promise.all([
      api.get('/audience/categories').catch(() => ({ data: { categories: [] } })),
      api.get('/audience/registration-form').catch(() => ({ data: { schema: null } }))
    ])
      .then(([catRes, formRes]) => {
        if (!isMounted) return;
        const loadedCats = catRes.data?.categories || [];
        setCategories(loadedCats);

        if (formRes.data?.schema) {
          const schema = formRes.data.schema;
          setFormSchema(schema);

          const passField = schema.fields?.find(f => f.key === 'pass_type');
          if (passField?.options?.[0]) formDefaultsRef.current.pass_type = passField.options[0];
          if (loadedCats.length > 0) formDefaultsRef.current.delegate_category = loadedCats[0].code;
          setIntakeForm(prev => ({ ...prev, ...formDefaultsRef.current }));
        } else if (loadedCats.length > 0) {
          formDefaultsRef.current.delegate_category = loadedCats[0].code;
          setIntakeForm(prev => ({ ...prev, ...formDefaultsRef.current }));
        }
      })
      .catch((err) => {
        console.error('Failed to load form schema:', err);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => { isMounted = false; };
  }, []);

  // Helper field accessors - strictly dynamic from formSchema.fields
  // If not found in schema or enabled === false, returns null
  const getField = (key) => {
    if (!formSchema?.fields || !Array.isArray(formSchema.fields)) return null;
    return formSchema.fields.find(f => (f.key === key || f.id === key) && f.enabled !== false) || null;
  };

  const nameField = getField('name');
  const emailField = getField('email');
  // Mobile is the one required field at the desk, so it is always shown
  const phoneField = getField('phone') || { key: 'phone', label: 'Mobile / WhatsApp Number' };
  const dobField = getField('dob');
  const genderField = getField('gender_identity');
  const passTypeField = getField('pass_type');
  const passDaysField = getField('pass_days');
  const delegateCategoryField = getField('delegate_category') || getField('category');
  const commField = getField('community_identity');
  const mumbaiField = getField('attended_mumbai');

  // Verification & Signatures: only present if configured in settings
  const signField = getField('signature_name') || getField('digital_signature');
  const placeField = getField('place');
  const dateField = getField('registration_date') || getField('date');
  const hasVerificationBox = Boolean(signField || placeField || dateField);

  // Dynamic Consent & Legal Checkboxes strictly from formSchema.fields
  // No hardcoded checkboxes or labels: if removed from Settings, they are not rendered!
  const checkboxFields = (formSchema?.fields || []).filter(f => {
    if (f.enabled === false) return false;
    return (
      f.type === 'checkbox' ||
      f.type === 'legal_checkbox' ||
      ['certified_18_plus', 'legal_certification', 'receive_updates', 'marketing_consent', 'appear_in_attendee_list', 'directory_consent'].includes(f.key)
    );
  });

  // Dynamic custom / additional fields
  const standardAndCheckboxKeys = [
    'name', 'email', 'phone', 'dob', 'gender_identity', 
    'pass_type', 'pass_days', 'delegate_category', 'category', 'community_identity', 'attended_mumbai', 
    'signature_name', 'digital_signature', 'place', 'registration_date', 'date',
    ...checkboxFields.map(f => f.key)
  ];
  const customOrOtherFields = (formSchema?.fields || []).filter(
    f => !standardAndCheckboxKeys.includes(f.key) && f.enabled !== false
  );

  const passOptions = passTypeField?.options && passTypeField.options.length > 0
    ? passTypeField.options
    : ['Full-Festival Pass', 'Day Pass (Choose Days)'];

  const isDayPassActive = intakeForm.pass_type?.toLowerCase().includes('day');

  const handleCustomFieldChange = (key, value) => {
    setIntakeForm(prev => ({
      ...prev,
      custom_data: {
        ...(prev.custom_data || {}),
        [key]: value
      }
    }));
  };

  const handleCheckboxToggle = (field, checked) => {
    if (field.key === 'certified_18_plus' || field.key === 'legal_certification') {
      setIntakeForm(prev => ({ ...prev, certified_18_plus: checked }));
    } else if (field.key === 'receive_updates' || field.key === 'marketing_consent') {
      setIntakeForm(prev => ({ ...prev, receive_updates: checked }));
    } else if (field.key === 'appear_in_attendee_list' || field.key === 'directory_consent') {
      setIntakeForm(prev => ({ ...prev, appear_in_attendee_list: checked }));
    } else {
      setIntakeForm(prev => ({
        ...prev,
        custom_data: {
          ...(prev.custom_data || {}),
          [field.key]: checked
        }
      }));
    }
  };

  const getCheckboxValue = (field) => {
    if (field.key === 'certified_18_plus' || field.key === 'legal_certification') {
      return Boolean(intakeForm.certified_18_plus);
    }
    if (field.key === 'receive_updates' || field.key === 'marketing_consent') {
      return Boolean(intakeForm.receive_updates);
    }
    if (field.key === 'appear_in_attendee_list' || field.key === 'directory_consent') {
      return Boolean(intakeForm.appear_in_attendee_list);
    }
    return Boolean(intakeForm.custom_data?.[field.key]);
  };

  // Live stock check for the optional badge number
  useEffect(() => {
    const clean = badgeCode.trim();
    if (clean.length < 5) {
      setBadgeStatus(null);
      return undefined;
    }
    let alive = true;
    const timer = setTimeout(() => {
      api.get(`/registration/qr/check/${encodeURIComponent(clean)}`)
        .then((res) => { if (alive) setBadgeStatus(res.data); })
        .catch(() => { if (alive) setBadgeStatus({ valid: false, message: 'Could not verify this badge number.' }); });
    }, 250);
    return () => { alive = false; clearTimeout(timer); };
  }, [badgeCode]);

  // Duplicates: the same mobile (formatting ignored, last 10 digits) blocks the save; the same email only warns
  const phoneDigits = phoneDigitsOf(intakeForm.phone);
  const emailQuery = (intakeForm.email || '').trim();
  const { matches: phoneMatches } = useAttendeeSearch(phoneDigits.length >= 8 ? phoneDigits : '', { minLength: 8, limit: 5, delay: 400 });
  const { matches: emailMatches } = useAttendeeSearch(emailQuery.includes('@') && emailQuery.length >= 6 ? emailQuery : '', { minLength: 6, limit: 5, delay: 400 });
  const phoneDuplicates = (() => {
    const seen = new Map();
    if (phoneDigits.length >= 10) {
      for (const a of (phoneMatches || [])) {
        if (a.status === 'cancelled') continue;
        if (phoneDigitsOf(a.phone).slice(-10) === phoneDigits.slice(-10)) seen.set(a.attendee_id, a);
      }
    }
    if (serverDuplicate?.attendee_id && phoneDigitsOf(serverDuplicate.phone).slice(-10) === phoneDigits.slice(-10)) {
      seen.set(serverDuplicate.attendee_id, serverDuplicate);
    }
    return [...seen.values()];
  })();
  const emailDuplicates = (emailMatches || []).filter(a =>
    (a.email || '').toLowerCase() === emailQuery.toLowerCase() && !phoneDuplicates.some(p => p.attendee_id === a.attendee_id)
  );

  const handleSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setErrorMessage(null);

    // Desk registration needs only the mobile number; the rest of the paper form can be added later
    if (!phoneDigits) {
      setErrorMessage('Mobile number is required.');
      return;
    }
    if (!isValidMobile(intakeForm.phone)) {
      setErrorMessage('Enter a valid mobile number (10 to 15 digits).');
      return;
    }
    if (phoneDuplicates.length > 0) {
      setErrorMessage('This mobile number is already registered. Open that delegate instead.');
      return;
    }

    const cleanBadge = badgeCode.trim();
    if (cleanBadge && badgeStatus && badgeStatus.valid === false) {
      setErrorMessage(badgeStatus.message || 'This badge number cannot be assigned. Clear it or use another pass.');
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        name: intakeForm.name.trim(),
        email: intakeForm.email ? intakeForm.email.trim() : null,
        phone: intakeForm.phone ? intakeForm.phone.trim() : null,
        delegate_category: intakeForm.delegate_category || 'bangalore_general',
        registration_type: 'desk',
        dob: intakeForm.dob,
        gender_identity: intakeForm.gender_identity,
        pass_type: intakeForm.pass_type,
        pass_days: intakeForm.pass_days,
        community_identity: intakeForm.community_identity,
        attended_mumbai: intakeForm.attended_mumbai,
        signature_name: intakeForm.signature_name.trim(),
        place: intakeForm.place || 'Bengaluru',
        registration_date: intakeForm.registration_date,
        receive_updates: intakeForm.receive_updates,
        appear_in_attendee_list: intakeForm.appear_in_attendee_list,
        certified_18_plus: intakeForm.certified_18_plus,
        custom_data: intakeForm.custom_data || {}
      };

      const res = await api.post('/registration/attendees', payload);
      let newAttendee = res.data?.attendee;
      const who = attendeeLabel({ name: intakeForm.name, phone: intakeForm.phone.trim() });
      let successMessage = `Success! Attendee registered and Delegate Pass generated for ${who}.`;

      // Pair the pre-printed pass right away (spot registration in one step)
      let paired = false;
      if (cleanBadge && newAttendee?.attendee_id) {
        try {
          const assignRes = await api.post(`/registration/attendees/${newAttendee.attendee_id}/assign-qr`, { qr_code: cleanBadge });
          newAttendee = { ...newAttendee, ...assignRes.data?.attendee };
          paired = true;
          successMessage = `Success! ${who} registered and pass ${assignRes.data?.badge_serial || cleanBadge} assigned.`;
        } catch (assignErr) {
          successMessage = `${who} was registered, but the pass could not be assigned: ${assignErr.response?.data?.error || 'unknown error'}. Assign it from the delegate's badge.`;
        }
      }

      if (canViewRoster) {
        navigate('/audience', {
          state: {
            newlyAddedAttendee: newAttendee,
            successMessage
          }
        });
      } else {
        // Desk volunteer: stay here, clear the form for the next delegate
        resetForm();
        setSuccessInfo({ message: successMessage, attendeeId: newAttendee?.attendee_id, paired });
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch (err) {
      if (err.response?.status === 409 && err.response.data?.existing) setServerDuplicate(err.response.data.existing);
      setErrorMessage(err.response?.data?.error || 'Failed to register attendee. Please verify inputs.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fc-registration-create-page animate-fade-in" style={{ paddingBottom: '80px', maxWidth: '1100px', margin: '0 auto' }}>
      <RegistrationHeader active="spot" />

      {successInfo && (
        <div role="status" style={{
          marginBottom: '16px', padding: '12px 16px', borderRadius: '10px',
          background: 'var(--fc-success-bg)', border: '1px solid var(--fc-success-border)', color: 'var(--fc-success-text)',
          display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap'
        }}>
          <span style={{ flex: '1 1 260px', fontWeight: 600, fontSize: '0.88rem' }}>{successInfo.message}</span>
          {!successInfo.paired && successInfo.attendeeId && (
            <button
              type="button"
              onClick={() => navigate(`/registration/assign-qr/${successInfo.attendeeId}`)}
              style={{ padding: '7px 14px', borderRadius: '8px', border: '1px solid var(--fc-brand)', background: 'var(--fc-brand)', color: 'var(--fc-text-on-brand)', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}
            >
              Assign QR now
            </button>
          )}
          <button
            type="button"
            onClick={() => setSuccessInfo(null)}
            aria-label="Dismiss"
            style={{ background: 'transparent', border: 'none', color: 'var(--fc-success-text)', cursor: 'pointer', padding: '4px', display: 'inline-flex' }}
          >
            <CloseIcon size={14} />
          </button>
        </div>
      )}

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

      {loading ? (
        <div style={{ padding: '80px', textAlign: 'center', color: 'var(--fc-text-muted)' }}>
          Loading registration schema and categories...
        </div>
      ) : (
        /* ── Main Form Card ─────────────────────────────────────────────────── */
        <div style={{
          background: 'var(--fc-surface-card)',
          borderRadius: '16px',
          border: '1px solid var(--fc-border)',
          borderTop: '3px solid var(--fc-brand)',
          boxShadow: 'var(--shadow-sm, 0 4px 20px rgba(0, 0, 0, 0.04))',
          padding: '28px',
          display: 'flex',
          flexDirection: 'row',
          gap: '28px',
          flexWrap: 'wrap'
        }}>
          {/* Registration form fields (driven by the form schema) */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Form heading from the festival's form schema */}
            <div style={{ paddingBottom: '14px', borderBottom: '1px solid var(--fc-border)' }}>
              <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'var(--fc-text-main)' }}>
                {formSchema?.form_title || 'Delegate Registration Form'}
              </h2>
              <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--fc-text-muted)' }}>
                {formSchema?.form_subtitle || 'Every person wishing to attend the festival HAS to register as a delegate by filling out the Festival Registration Form to obtain a Festival Pass.'}
              </p>
              <p style={{ margin: '8px 0 0', fontSize: '0.8rem', fontWeight: 600, color: 'var(--fc-text-secondary)' }}>
                Only the mobile number is needed at the desk. The rest can be added later from the paper form (the delegate shows as "Details pending" until then).
              </p>
            </div>
            <form onSubmit={handleSubmit}>
              {/* Full Name */}
              {nameField && (
                <div style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--fc-text-secondary)', marginBottom: '4px' }}>
                    {nameField.label || 'Full Name'}
                  </label>
                  <input 
                    type="text" 
                    placeholder={nameField.placeholder || 'Enter your full name as per Photo ID'}
                    value={intakeForm.name}
                    onChange={(e) => setIntakeForm({ ...intakeForm, name: e.target.value })}
                    style={{
                      width: '100%',
                      height: '40px',
                      padding: '0 12px',
                      borderRadius: '8px',
                      border: '1px solid var(--fc-border)',
                      background: 'var(--fc-surface)',
                      color: 'var(--fc-text-main)',
                      fontSize: '0.88rem',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              )}

              {/* Email & Phone */}
              {(emailField || phoneField) && (
                <div style={{ display: 'grid', gridTemplateColumns: (emailField && phoneField) ? 'repeat(auto-fit, minmax(220px, 1fr))' : '1fr', gap: '12px', marginBottom: '14px' }}>
                  {emailField && (
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--fc-text-secondary)', marginBottom: '4px' }}>
                        {emailField.label || 'Email Address'}
                      </label>
                      <input 
                        type="email" 
                        placeholder={emailField.placeholder || 'name@example.com'}
                        value={intakeForm.email}
                        onChange={(e) => setIntakeForm({ ...intakeForm, email: e.target.value })}
                        style={{
                          width: '100%',
                          height: '40px',
                          padding: '0 12px',
                          borderRadius: '8px',
                          border: '1px solid var(--fc-border)',
                          background: 'var(--fc-surface)',
                          color: 'var(--fc-text-main)',
                          fontSize: '0.88rem',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                  )}
                  {phoneField && (
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--fc-text-secondary)', marginBottom: '4px' }}>
                        {phoneField.label || 'Mobile / WhatsApp Number'} <span style={{ color: 'var(--fc-brand-text)' }}>*</span>
                      </label>
                      <input 
                        type="tel" 
                        required
                        placeholder={phoneField.placeholder || '+91 98765 43210'}
                        value={intakeForm.phone}
                        onChange={(e) => setIntakeForm({ ...intakeForm, phone: e.target.value })}
                        style={{
                          width: '100%',
                          height: '40px',
                          padding: '0 12px',
                          borderRadius: '8px',
                          border: '1px solid var(--fc-border)',
                          background: 'var(--fc-surface)',
                          color: 'var(--fc-text-main)',
                          fontSize: '0.88rem',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Mobile already registered: blocks the save */}
              {phoneDuplicates.length > 0 && (
                <div role="alert" style={{ marginBottom: '14px', padding: '10px 12px', borderRadius: '8px', background: 'var(--fc-danger-bg)', border: '1px solid var(--fc-danger-border)', fontSize: '0.82rem', color: 'var(--fc-text-main)' }}>
                  <strong style={{ color: 'var(--fc-danger-text)' }}>This mobile number is already registered.</strong> One delegate per mobile number; open the existing record instead:
                  <ul style={{ margin: '6px 0 0 18px', padding: 0 }}>
                    {phoneDuplicates.map(a => (
                      <li key={a.attendee_id} style={{ marginBottom: '2px' }}>
                        {attendeeLabel(a)} · {a.phone} · {a.status}{' '}
                        <button
                          type="button"
                          onClick={() => navigate(`/registration/assign-qr/${a.attendee_id}`)}
                          style={{ border: 'none', background: 'none', color: 'var(--fc-brand-text)', fontWeight: 700, cursor: 'pointer', padding: 0, fontSize: '0.82rem' }}
                        >
                          Assign pass to this delegate instead →
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Same email (warning only) */}
              {emailDuplicates.length > 0 && (
                <div style={{ marginBottom: '14px', padding: '10px 12px', borderRadius: '8px', background: 'var(--fc-warning-bg)', border: '1px solid var(--fc-warning-border)', fontSize: '0.82rem', color: 'var(--fc-text-main)' }}>
                  <strong style={{ color: 'var(--fc-warning-text)' }}>Already registered?</strong> This email matches:
                  <ul style={{ margin: '6px 0 0 18px', padding: 0 }}>
                    {emailDuplicates.map(a => (
                      <li key={a.attendee_id} style={{ marginBottom: '2px' }}>
                        {attendeeLabel(a)} · {a.phone || a.email} · {a.status}{' '}
                        <button
                          type="button"
                          onClick={() => navigate(`/registration/assign-qr/${a.attendee_id}`)}
                          style={{ border: 'none', background: 'none', color: 'var(--fc-brand-text)', fontWeight: 700, cursor: 'pointer', padding: 0, fontSize: '0.82rem' }}
                        >
                          Assign pass to this delegate instead →
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Optional: pre-printed pass (spot registration in one step) */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--fc-text-secondary)', marginBottom: '4px' }}>
                  Physical Pass Badge Number <span style={{ fontWeight: 500 }}>(optional — type the 6-digit number or scan the sticker)</span>
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={40}
                  placeholder="e.g. 418312"
                  value={badgeCode}
                  onChange={(e) => setBadgeCode(e.target.value.replace(/\s+/g, ''))}
                  style={{
                    width: '100%',
                    height: '40px',
                    padding: '0 12px',
                    borderRadius: '8px',
                    border: badgeStatus ? (badgeStatus.valid ? '2px solid var(--fc-success)' : '2px solid var(--fc-danger)') : '1px solid var(--fc-border)',
                    background: 'var(--fc-surface)',
                    color: 'var(--fc-text-main)',
                    fontSize: '0.95rem',
                    fontFamily: 'monospace',
                    letterSpacing: '0.08em',
                    boxSizing: 'border-box'
                  }}
                />
                {badgeStatus && (
                  <div style={{ marginTop: '4px', fontSize: '0.78rem', fontWeight: 600, color: badgeStatus.valid ? 'var(--fc-success-text)' : 'var(--fc-danger-text)' }}>
                    {badgeStatus.message}
                  </div>
                )}
              </div>

              {/* Date of Birth & Gender Identity */}
              {(dobField || genderField) && (
                <div style={{ display: 'grid', gridTemplateColumns: (dobField && genderField) ? 'repeat(auto-fit, minmax(220px, 1fr))' : '1fr', gap: '12px', marginBottom: '14px', alignItems: 'flex-start' }}>
                  {dobField && (
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--fc-text-secondary)', marginBottom: '4px' }}>
                        {dobField.label || 'Date of Birth'}
                      </label>
                      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                        <input 
                          type="text" 
                          placeholder={dobField.placeholder || 'DD/MM/YYYY'}
                          value={intakeForm.dob}
                          onChange={(e) => setIntakeForm({ ...intakeForm, dob: e.target.value })}
                          style={{
                            width: '100%',
                            height: '40px',
                            padding: '0 12px',
                            paddingRight: '38px',
                            borderRadius: '8px',
                            border: '1px solid var(--fc-border)',
                            background: 'var(--fc-surface)',
                            color: 'var(--fc-text-main)',
                            fontSize: '0.88rem',
                            boxSizing: 'border-box'
                          }}
                        />
                        <input
                          ref={dobPickerRef}
                          type="date"
                          tabIndex={-1}
                          aria-hidden="true"
                          value={convertToIsoDate(intakeForm.dob)}
                          onChange={(e) => {
                            const iso = e.target.value;
                            if (iso) {
                              const [y, m, d] = iso.split('-');
                              setIntakeForm({ ...intakeForm, dob: `${d}/${m}/${y}` });
                            }
                          }}
                          style={{
                            position: 'absolute',
                            opacity: 0,
                            pointerEvents: 'none',
                            width: 0,
                            height: 0,
                            bottom: 0,
                            right: 0
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (dobPickerRef.current) {
                              try {
                                dobPickerRef.current.showPicker();
                              } catch {
                                dobPickerRef.current.focus();
                              }
                            }
                          }}
                          style={{
                            position: 'absolute',
                            right: '8px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            padding: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--fc-brand-text)',
                            transition: 'transform 0.15s ease'
                          }}
                          title="Select date from calendar"
                        >
                          <CalendarTodayIcon size={16} />
                        </button>
                      </div>
                    </div>
                  )}

                  {genderField && (
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--fc-text-secondary)', marginBottom: '4px' }}>
                        {genderField.label || 'Gender Identity'}
                      </label>
                      <div style={{ 
                        height: '40px', 
                        border: '1px solid var(--fc-border)', 
                        borderRadius: '8px', 
                        padding: '0 10px', 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '10px', 
                        background: 'var(--fc-surface)',
                        overflowX: 'auto',
                        boxSizing: 'border-box'
                      }}>
                        {(genderField.options && genderField.options.length > 0 ? genderField.options : ['Male', 'Female', 'Trans*', 'Other']).map((g) => (
                          <label key={g} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', color: 'var(--fc-text-main)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                            <input 
                              type="radio" 
                              name="page_gender" 
                              value={g} 
                              checked={intakeForm.gender_identity === g} 
                              onChange={(e) => setIntakeForm({ ...intakeForm, gender_identity: e.target.value })} 
                              style={{ accentColor: 'var(--fc-brand)', cursor: 'pointer', margin: 0 }}
                            />
                            <span>{g}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Pass Type Selector */}
              {passTypeField && (
                <div style={{ border: '1px solid var(--fc-border)', borderRadius: '10px', padding: '14px', background: 'var(--fc-surface-subtle)', marginBottom: '14px' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--fc-text-main)', marginBottom: '8px' }}>
                    {passTypeField.label || 'PASS TYPE'}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
                    {passOptions.map((opt) => {
                      const isActive = intakeForm.pass_type === opt;
                      return (
                        <div
                          key={opt}
                          onClick={() => setIntakeForm({ ...intakeForm, pass_type: opt })}
                          style={{
                            border: isActive ? '1.5px solid var(--fc-brand)' : '1px solid var(--fc-border)',
                            background: isActive ? 'rgba(168, 47, 47, 0.08)' : 'var(--fc-surface)',
                            borderRadius: '8px',
                            padding: '10px 14px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <input type="radio" name="page_pass_type" checked={isActive} onChange={() => setIntakeForm({ ...intakeForm, pass_type: opt })} style={{ accentColor: 'var(--fc-brand)' }} />
                          <div>
                            <div style={{ fontWeight: 700, fontSize: '0.86rem', color: 'var(--fc-text-main)' }}>{opt}</div>
                            <div style={{ fontSize: '0.74rem', color: 'var(--fc-text-muted)' }}>
                              {opt.toLowerCase().includes('full') ? 'All dates pass' : 'Selected dates only'}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {passDaysField && isDayPassActive && (
                    <div style={{ marginTop: '10px', padding: '10px 14px', background: 'var(--fc-surface)', borderRadius: '6px', border: '1px dashed var(--fc-border)' }}>
                      <div style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--fc-text-secondary)', marginBottom: '6px' }}>
                        {passDaysField.label || 'Select Days Attending'}:
                      </div>
                      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                        {(passDaysField.options || ['NOV 20th', 'NOV 21st', 'NOV 22nd', 'All Days']).map((d) => (
                          <label key={d} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.8rem', cursor: 'pointer' }}>
                            <input 
                              type="checkbox"
                              checked={intakeForm.pass_days.includes(d)}
                              onChange={(e) => {
                                if (e.target.checked) setIntakeForm({ ...intakeForm, pass_days: [...intakeForm.pass_days, d] });
                                else setIntakeForm({ ...intakeForm, pass_days: intakeForm.pass_days.filter(x => x !== d) });
                              }}
                              style={{ accentColor: 'var(--fc-brand)' }}
                            />
                            <span>{d}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Delegate Category */}
              {delegateCategoryField && (
                <div style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--fc-text-secondary)', marginBottom: '4px' }}>
                    {delegateCategoryField.label || 'Delegate Category'}
                  </label>
                  <select 
                    value={intakeForm.delegate_category}
                    onChange={(e) => setIntakeForm({ ...intakeForm, delegate_category: e.target.value })}
                    style={{
                      width: '100%',
                      height: '40px',
                      padding: '0 12px',
                      borderRadius: '8px',
                      border: '1px solid var(--fc-border)',
                      background: 'var(--fc-surface)',
                      color: 'var(--fc-text-main)',
                      fontSize: '0.88rem',
                      boxSizing: 'border-box'
                    }}
                  >
                    {categories.map(c => (
                      <option key={c.id} value={c.code}>{c.name} ({c.badge_ribbon_text || c.code})</option>
                    ))}
                    {categories.length === 0 && (
                      <option value="bangalore_general">Festival Delegate (DELEGATE)</option>
                    )}
                  </select>
                </div>
              )}

              {/* Community Affiliation & Mumbai Attendance */}
              {(commField || mumbaiField) && (
                <div style={{ display: 'grid', gridTemplateColumns: (commField && mumbaiField) ? 'repeat(auto-fit, minmax(220px, 1fr))' : '1fr', gap: '14px', marginBottom: '14px' }}>
                  {commField && (
                    <div>
                      <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--fc-text-secondary)', marginBottom: '6px' }}>
                        {commField.label || 'Community Affiliation'}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {(commField.options && commField.options.length > 0
                          ? commField.options
                          : ['A Proud LGBTQ+ person', 'An Ally', 'Still figuring out']
                        ).map((item) => (
                          <label key={item} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', color: 'var(--fc-text-main)', cursor: 'pointer' }}>
                            <input 
                              type="radio" 
                              name="page_community" 
                              checked={intakeForm.community_identity === item} 
                              onChange={() => setIntakeForm({ ...intakeForm, community_identity: item })} 
                              style={{ accentColor: 'var(--fc-brand)', cursor: 'pointer' }}
                            />
                            <span>{item}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {mumbaiField && (
                    <div>
                      <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--fc-text-secondary)', marginBottom: '6px' }}>
                        {mumbaiField.label || 'Attended KASHISH in Mumbai?'}
                      </div>
                      <div style={{ display: 'flex', gap: '16px' }}>
                        {(mumbaiField.options && mumbaiField.options.length > 0 ? mumbaiField.options : ['Yes', 'No']).map((ans) => (
                          <label key={ans} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.82rem', color: 'var(--fc-text-main)', cursor: 'pointer' }}>
                            <input 
                              type="radio" 
                              name="page_mumbai" 
                              checked={intakeForm.attended_mumbai === ans} 
                              onChange={() => setIntakeForm({ ...intakeForm, attended_mumbai: ans })} 
                              style={{ accentColor: 'var(--fc-brand)', cursor: 'pointer' }}
                            />
                            <span>{ans}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Dynamic Additional / Custom Questions */}
              {customOrOtherFields.length > 0 && (
                <div style={{ background: 'var(--fc-surface-subtle)', border: '1px solid var(--fc-border)', borderRadius: '8px', padding: '14px', marginBottom: '14px' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--fc-brand-text)', marginBottom: '8px' }}>
                    ADDITIONAL QUESTIONS:
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {customOrOtherFields.map(field => (
                      <div key={field.key || field.id}>
                        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--fc-text-secondary)', marginBottom: '4px' }}>
                          {field.label}
                        </label>
                        {field.type === 'select' ? (
                          <select
                            value={intakeForm.custom_data?.[field.key] || ''}
                            onChange={(e) => handleCustomFieldChange(field.key, e.target.value)}
                            style={{ width: '100%', height: '36px', padding: '0 8px', borderRadius: '6px', border: '1px solid var(--fc-border)', background: 'var(--fc-surface)', color: 'var(--fc-text-main)', fontSize: '0.84rem' }}
                          >
                            <option value="">Select option...</option>
                            {(field.options || []).map(opt => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        ) : field.type === 'radio' ? (
                          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                            {(field.options || []).map(opt => (
                              <label key={opt} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.82rem', color: 'var(--fc-text-main)', cursor: 'pointer' }}>
                                <input
                                  type="radio"
                                  name={`custom_${field.key}`}
                                  value={opt}
                                  checked={intakeForm.custom_data?.[field.key] === opt}
                                  onChange={() => handleCustomFieldChange(field.key, opt)}
                                  style={{ accentColor: 'var(--fc-brand)' }}
                                />
                                <span>{opt}</span>
                              </label>
                            ))}
                          </div>
                        ) : field.type === 'multi_checkbox' ? (
                          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                            {(field.options || []).map(opt => {
                              const arr = Array.isArray(intakeForm.custom_data?.[field.key]) ? intakeForm.custom_data[field.key] : [];
                              return (
                                <label key={opt} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.82rem', color: 'var(--fc-text-main)', cursor: 'pointer' }}>
                                  <input
                                    type="checkbox"
                                    checked={arr.includes(opt)}
                                    onChange={(e) => {
                                      if (e.target.checked) handleCustomFieldChange(field.key, [...arr, opt]);
                                      else handleCustomFieldChange(field.key, arr.filter(x => x !== opt));
                                    }}
                                    style={{ accentColor: 'var(--fc-brand)' }}
                                  />
                                  <span>{opt}</span>
                                </label>
                              );
                            })}
                          </div>
                        ) : field.type === 'textarea' ? (
                          <textarea
                            rows={2}
                            placeholder={field.placeholder || ''}
                            value={intakeForm.custom_data?.[field.key] || ''}
                            onChange={(e) => handleCustomFieldChange(field.key, e.target.value)}
                            style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--fc-border)', background: 'var(--fc-surface)', color: 'var(--fc-text-main)', fontSize: '0.84rem' }}
                          />
                        ) : (
                          <input
                            type={field.type === 'number' ? 'number' : 'text'}
                            placeholder={field.placeholder || ''}
                            value={intakeForm.custom_data?.[field.key] || ''}
                            onChange={(e) => handleCustomFieldChange(field.key, e.target.value)}
                            style={{ width: '100%', height: '36px', padding: '0 8px', borderRadius: '6px', border: '1px solid var(--fc-border)', background: 'var(--fc-surface)', color: 'var(--fc-text-main)', fontSize: '0.84rem' }}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Verification & Signature - Strictly data-driven: ONLY rendered if present in Settings */}
              {hasVerificationBox && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '16px' }}>
                  {signField && (
                    <div>
                      <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--fc-text-secondary)', marginBottom: '4px' }}>
                        {signField.label || 'Digital Signature'}
                      </label>
                      <input 
                        type="text" 
                        placeholder={signField.placeholder || 'Full Name'}
                        value={intakeForm.signature_name}
                        onChange={(e) => setIntakeForm({ ...intakeForm, signature_name: e.target.value })}
                        style={{ width: '100%', height: '36px', padding: '0 10px', borderRadius: '6px', border: '1px solid var(--fc-border)', background: 'var(--fc-surface)', color: 'var(--fc-text-main)', fontSize: '0.84rem', boxSizing: 'border-box' }}
                      />
                    </div>
                  )}
                  {placeField && (
                    <div>
                      <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--fc-text-secondary)', marginBottom: '4px' }}>
                        {placeField.label || 'Place'}
                      </label>
                      <input 
                        type="text" 
                        value={intakeForm.place}
                        onChange={(e) => setIntakeForm({ ...intakeForm, place: e.target.value })}
                        style={{ width: '100%', height: '36px', padding: '0 10px', borderRadius: '6px', border: '1px solid var(--fc-border)', background: 'var(--fc-surface)', color: 'var(--fc-text-main)', fontSize: '0.84rem', boxSizing: 'border-box' }}
                      />
                    </div>
                  )}
                  {dateField && (
                    <div>
                      <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--fc-text-secondary)', marginBottom: '4px' }}>
                        {dateField.label || 'Date'}
                      </label>
                      <input 
                        type="text" 
                        disabled
                        value={intakeForm.registration_date}
                        style={{ width: '100%', height: '36px', padding: '0 10px', borderRadius: '6px', border: '1px solid var(--fc-border)', background: 'var(--fc-surface-subtle)', color: 'var(--fc-text-muted)', fontSize: '0.84rem', boxSizing: 'border-box' }}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Dynamic Consents & Legal Checkboxes strictly from formSchema.fields */}
              {/* If removed from Settings, NO hardcoded fallbacks are rendered! */}
              {checkboxFields.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px', fontSize: '0.82rem' }}>
                  {checkboxFields.map((field) => {
                    const isChecked = getCheckboxValue(field);
                    const isLegal = field.type === 'legal_checkbox' || field.key === 'certified_18_plus' || field.key === 'legal_certification';
                    return (
                      <label 
                        key={field.key || field.id} 
                        style={{ 
                          display: 'flex', 
                          alignItems: 'flex-start', 
                          gap: '8px', 
                          cursor: 'pointer', 
                          color: isLegal ? 'var(--fc-text-main)' : 'var(--fc-text-secondary)',
                          fontWeight: isLegal ? 600 : 'normal'
                        }}
                      >
                        <input 
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => handleCheckboxToggle(field, e.target.checked)}
                          style={{ accentColor: 'var(--fc-brand)', marginTop: '3px' }}
                        />
                        <span>
                          {field.label}
                         
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}

              {/* Form Action Buttons */}
              <div className="fc-form-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', paddingTop: '16px', borderTop: '1px solid var(--fc-border)' }}>
                <button
                  type="button"
                  onClick={() => (canViewRoster ? navigate('/audience') : resetForm())}
                  style={{
                    padding: '10px 22px',
                    borderRadius: '8px',
                    border: '1px solid var(--fc-border)',
                    background: 'var(--fc-surface)',
                    color: 'var(--fc-text-secondary)',
                    fontWeight: 600,
                    fontSize: '0.88rem',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || phoneDuplicates.length > 0}
                  style={{
                    padding: '10px 32px',
                    borderRadius: '8px',
                    border: 'none',
                    background: 'var(--fc-brand)',
                    color: '#ffffff',
                    fontWeight: 700,
                    fontSize: '0.92rem',
                    cursor: (submitting || phoneDuplicates.length > 0) ? 'not-allowed' : 'pointer',
                    opacity: phoneDuplicates.length > 0 ? 0.55 : 1,
                    boxShadow: '0 4px 14px rgba(168, 47, 47, 0.35)',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={(e) => { if (!submitting) e.currentTarget.style.background = 'var(--fc-brand-hover)'; }}
                  onMouseLeave={(e) => { if (!submitting) e.currentTarget.style.background = 'var(--fc-brand)'; }}
                >
                  {submitting ? 'Registering...' : (badgeCode.trim() ? 'Register & Assign Pass' : 'Register & Generate Badge Pass')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
