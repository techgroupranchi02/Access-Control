/**
 * AttendeeEditPage Component (/registration/edit/:id)
 * 
 * Dedicated Full-Page Attendee Edit Form:
 * - 100% Dynamic form schema strictly synced from Audience Settings
 * - Pre-populates all existing attendee registration and custom schema data
 * - Left column: Live Badge credential summary (QR status, Category ribbon, Venue pickup)
 * - Right column: Interactive editing for all schema fields with validation
 * - Instant update via PUT /api/registration/attendees/:id & redirection back to roster
 */

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import api from '../services/api';
import { useCanViewRoster } from '../hooks/useCanViewRoster';

// A Day Pass is any pass type containing "Day Pass"; only it keeps chosen days (same rule as the backend)
const isDayPass = (passType) => /\bday\s*pass/i.test(String(passType || ''));
// Fields shown on the Delegate Registration Confirmation: a change offers to email it again
const CONFIRMATION_FIELDS = ['name', 'email', 'phone', 'pass_type', 'pass_days', 'delegate_category'];
const confirmationSnapshot = (f) => JSON.stringify(CONFIRMATION_FIELDS.map((k) => (k === 'pass_days' ? (isDayPass(f.pass_type) ? [...(f.pass_days || [])].sort() : []) : String(f[k] ?? '').trim())));
import QrCode from '../components/common/QrCode';
import {
  ConfirmationNumberIcon, 
  HelpIcon, 
  PlaceIcon, 
  CheckCircleIcon,
  CloseIcon, 
  CalendarTodayIcon,
  EditIcon,
  MovieIcon
} from '../components/common/Icons';
import { attendeeLabel } from '../utils/attendeeDisplay';

const DEFAULT_FAQS = [
  {
    question: 'Welcome to the KASHISH x BENGALURU 2026 film festival',
    answer: '<p>Celebrate diversity and storytelling with a vibrant community of filmmakers, artists, and allies.</p><p>Get ready to experience <strong>44 spellbinding LGBTQ+ films</strong> from <strong>15 countries</strong>, join engaging panel discussions, participate in interactive Q&amp;A sessions with filmmakers, and enjoy captivating performances at the Opening Ceremony.</p>'
  },
  {
    question: 'Pass Modification Policy',
    answer: '<p>Delegate passes are personalized and tied to the individual delegate. Corrections to names or email contacts can be made by authorized festival coordinators prior to the screening dates.</p>'
  }
];

export default function AttendeeEditPage() {
  const navigate = useNavigate();
  const canViewRoster = useCanViewRoster();
  const { id } = useParams();
  const dobPickerRef = useRef(null);

  const [attendee, setAttendee] = useState(null);
  const [categories, setCategories] = useState([]);
  const [formSchema, setFormSchema] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [showFaqModal, setShowFaqModal] = useState(false);

  // Form State
  const [loadedSnapshot, setLoadedSnapshot] = useState(null);
  const [sendConfirmationChoice, setSendConfirmationChoice] = useState(null); // null = follow the default
  const [intakeForm, setIntakeForm] = useState({
    name: '',
    email: '',
    phone: '',
    dob: '',
    gender_identity: 'Male',
    pass_type: 'Full-Festival Pass',
    pass_days: [],
    delegate_category: 'bangalore_general',
    community_identity: '',
    attended_mumbai: 'No',
    signature_name: '',
    place: 'Bengaluru',
    registration_date: '',
    status: 'registered',
    receive_updates: false,
    appear_in_attendee_list: false,
    certified_18_plus: true,
    custom_data: {}
  });

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
      api.get('/audience/registration-form').catch(() => ({ data: { schema: null } })),
      api.get(`/registration/attendees/${id}`).catch((err) => {
        console.error('Failed to load attendee:', err);
        return { data: { attendee: null, error: err.response?.data?.error || 'Failed to load attendee' } };
      })
    ])
      .then(([catRes, formRes, attendeeRes]) => {
        if (!isMounted) return;

        const loadedCats = catRes.data?.categories || [];
        setCategories(loadedCats);

        const loadedSchema = formRes.data?.schema || null;
        setFormSchema(loadedSchema);

        const att = attendeeRes.data?.attendee;
        if (!att) {
          setErrorMessage(attendeeRes.data?.error || 'Attendee not found.');
          return;
        }

        setAttendee(att);

        const cd = att.custom_data || {};
        const passDays = Array.isArray(att.pass_days) 
          ? att.pass_days 
          : (Array.isArray(cd.pass_days) ? cd.pass_days : (cd.pass_days ? [cd.pass_days] : []));

        const loadedForm = {
          name: att.name || '',
          email: att.email || '',
          phone: att.phone || '',
          dob: cd.dob || '',
          gender_identity: cd.gender_identity || 'Male',
          pass_type: att.pass_type || cd.pass_type || 'Full-Festival Pass',
          pass_days: passDays,
          delegate_category: att.delegate_category || (loadedCats.length > 0 ? loadedCats[0].code : 'bangalore_general'),
          community_identity: cd.community_identity || '',
          attended_mumbai: cd.attended_mumbai || 'No',
          signature_name: cd.signature_name || att.name || '',
          place: cd.place || 'Bengaluru',
          registration_date: cd.registration_date || (att.registered_at ? new Date(att.registered_at).toLocaleDateString('en-GB') : new Date().toLocaleDateString('en-GB')),
          status: att.status || 'registered',
          receive_updates: Boolean(cd.receive_updates),
          appear_in_attendee_list: Boolean(cd.appear_in_attendee_list),
          certified_18_plus: cd.certified_18_plus !== undefined ? Boolean(cd.certified_18_plus) : true,
          custom_data: { ...cd }
        };
        setIntakeForm(loadedForm);
        setLoadedSnapshot(confirmationSnapshot(loadedForm));
      })
      .catch((err) => {
        console.error('Failed to load attendee edit data:', err);
        setErrorMessage('Failed to load attendee details.');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => { isMounted = false; };
  }, [id]);

  // Helper field accessors - strictly dynamic from formSchema.fields
  const getField = (key) => {
    if (!formSchema?.fields || !Array.isArray(formSchema.fields)) return null;
    return formSchema.fields.find(f => (f.key === key || f.id === key) && f.enabled !== false) || null;
  };

  const nameField = getField('name');
  const emailField = getField('email');
  const phoneField = getField('phone');
  const dobField = getField('dob');
  const genderField = getField('gender_identity');
  const passTypeField = getField('pass_type');
  const passDaysField = getField('pass_days');
  const delegateCategoryField = getField('delegate_category') || getField('category');
  const commField = getField('community_identity');
  const mumbaiField = getField('attended_mumbai');

  // Verification & Signatures: only rendered if enabled in Settings
  const signField = getField('signature_name') || getField('digital_signature');
  const placeField = getField('place');
  const dateField = getField('registration_date') || getField('date');
  const hasVerificationBox = Boolean(signField || placeField || dateField);

  // Dynamic Consent & Legal Checkboxes strictly from formSchema.fields
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

  const isDayPassActive = isDayPass(intakeForm.pass_type);
  // Email the updated confirmation: ticked by default once something on it changes
  const confirmationChanged = loadedSnapshot !== null && confirmationSnapshot(intakeForm) !== loadedSnapshot;
  const hasEmail = Boolean(intakeForm.email && intakeForm.email.trim());
  const sendConfirmation = hasEmail && (sendConfirmationChoice ?? confirmationChanged);

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

  const handleSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setErrorMessage(null);

    if (nameField && nameField.required !== false && !intakeForm.name.trim()) {
      setErrorMessage('Attendee full name is required.');
      return;
    }

    // Dynamic verification of required checkboxes
    for (const cb of checkboxFields) {
      if (cb.required) {
        const val = getCheckboxValue(cb);
        if (!val) {
          setErrorMessage(`Please check the required consent: "${cb.label || cb.key}".`);
          return;
        }
      }
    }

    try {
      setSubmitting(true);
      const payload = {
        name: intakeForm.name.trim(),
        email: intakeForm.email ? intakeForm.email.trim() : null,
        phone: intakeForm.phone ? intakeForm.phone.trim() : null,
        delegate_category: intakeForm.delegate_category || 'bangalore_general',
        status: intakeForm.status,
        dob: intakeForm.dob,
        gender_identity: intakeForm.gender_identity,
        pass_type: intakeForm.pass_type,
        // Only a Day Pass keeps chosen days (they stay ticked, hidden, after switching to a full pass)
        pass_days: isDayPassActive ? intakeForm.pass_days : [],
        send_confirmation: sendConfirmation,
        community_identity: intakeForm.community_identity,
        attended_mumbai: intakeForm.attended_mumbai,
        signature_name: intakeForm.signature_name || intakeForm.name,
        place: intakeForm.place || 'Bengaluru',
        registration_date: intakeForm.registration_date,
        receive_updates: intakeForm.receive_updates,
        appear_in_attendee_list: intakeForm.appear_in_attendee_list,
        certified_18_plus: intakeForm.certified_18_plus,
        custom_data: intakeForm.custom_data || {}
      };

      const res = await api.put(`/registration/attendees/${id}`, payload);
      const mail = res.data?.confirmation_email;
      const mailNote = !mail ? ''
        : mail.sent ? ` The updated confirmation was emailed to ${mail.to}.`
          : ` The updated confirmation couldn't be emailed: ${mail.reason || 'unknown error'}`;
      navigate(canViewRoster ? '/audience' : '/registration/assign-qr', {
        state: {
          updatedAttendee: res.data?.attendee,
          successMessage: `Success! Attendee details for ${intakeForm.name.trim()} updated successfully.${mailNote}`
        }
      });
    } catch (err) {
      setErrorMessage(err.response?.data?.error || 'Failed to update attendee. Please verify inputs.');
    } finally {
      setSubmitting(false);
    }
  };

  const isIssued = Boolean(attendee?.qr_token || attendee?.status === 'badge_issued');
  const serialNo = attendee?.serial_no || ('KB26-' + String(id).padStart(4, '0'));

  return (
    <div className="fc-registration-create-page animate-fade-in" style={{ paddingBottom: '80px', maxWidth: '1100px', margin: '0 auto' }}>
      {/* ── Breadcrumbs Navigation ────────────────────────────────────────── */}
      <nav style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--fc-text-secondary)', marginBottom: '16px' }}>
        {canViewRoster ? (
          <Link to="/audience" style={{ color: 'var(--fc-text-secondary)', textDecoration: 'none' }}>
            Audience
          </Link>
        ) : (
          <Link to="/registration/add" style={{ color: 'var(--fc-text-secondary)', textDecoration: 'none' }}>
            Registration
          </Link>
        )}
        <span>/</span>
        <span style={{ color: 'var(--fc-text-muted)' }}>
          Edit Attendee
        </span>
        <span>/</span>
        <span style={{ color: 'var(--fc-brand, var(--fc-brand-text))', fontWeight: 700 }}>
          {serialNo}
        </span>
      </nav>

      {/* ── Page Header ───────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '20px',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0, color: 'var(--fc-text-main)', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span>Edit Attendee: {attendee ? attendeeLabel(attendee) : 'Loading...'}</span>
          </h1>
          <p style={{ color: 'var(--fc-text-muted)', marginTop: '4px', fontSize: '0.9rem', margin: '4px 0 0 0' }}>
            Update attendee registration credentials, badge category, pass type, or dynamic responses.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{
            background: 'var(--fc-surface-subtle)',
            border: '1px solid var(--fc-border)',
            color: 'var(--fc-text-secondary)',
            fontSize: '0.78rem',
            fontWeight: 700,
            padding: '6px 12px',
            borderRadius: '16px'
          }}>
            {serialNo}
          </span>

          {isIssued ? (
            <span style={{
              background: 'rgba(22, 163, 74, 0.12)',
              border: '1px solid rgba(22, 163, 74, 0.3)',
              color: 'var(--fc-success-text)',
              fontSize: '0.78rem',
              fontWeight: 800,
              padding: '6px 12px',
              borderRadius: '16px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px'
            }}>
              <CheckCircleIcon size={12} /> QR Issued
            </span>
          ) : (
            <span style={{
              background: 'rgba(245, 158, 11, 0.12)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              color: 'var(--fc-warning-text)',
              fontSize: '0.78rem',
              fontWeight: 700,
              padding: '6px 12px',
              borderRadius: '16px'
            }}>
              Pending Arrival
            </span>
          )}

        </div>
      </div>

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
          Loading attendee records and registration schema...
        </div>
      ) : (
        /* ── Main Form Card (2 Columns: Badge Card Left, Form Right) ───────────── */
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
          {/* Left Column: Delegate Badge Overview & Venue Information */}
          <div style={{ width: '290px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Live Badge Status Card */}
            <div style={{
              background: 'var(--fc-surface-subtle)',
              border: '1px solid var(--fc-border)',
              borderRadius: '12px',
              padding: '18px',
              color: 'var(--fc-text-main)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <span style={{ fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--fc-brand-text)' }}>
                  DELEGATE CREDENTIAL
                </span>
                <span style={{
                  background: attendee?.badge_color || 'var(--fc-brand)',
                  color: '#fff',
                  fontSize: '0.68rem',
                  fontWeight: 800,
                  padding: '2px 8px',
                  borderRadius: '4px',
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase'
                }}>
                  {attendee?.badge_ribbon || attendee?.delegate_category}
                </span>
              </div>

              {attendee?.qr_token ? (
                <div style={{ textAlign: 'center', marginBottom: '12px' }}>
                  <div style={{ display: 'inline-block', background: '#ffffff', padding: '8px', borderRadius: '8px', border: '1px solid var(--fc-border)', boxShadow: 'var(--shadow-sm)' }}>
                    <QrCode value={attendee.qr_token} size={120} />
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--fc-success-text)', fontWeight: 800, marginTop: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                    <CheckCircleIcon size={12} /> Active Gate Credential
                  </div>
                  {attendee?.badge_serial && (
                    <div style={{ fontSize: '0.8rem', fontFamily: 'monospace', fontWeight: 800, letterSpacing: '0.12em', marginTop: '2px' }}>
                      Badge No: {attendee.badge_serial}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ padding: '10px 12px', background: 'rgba(245, 158, 11, 0.08)', border: '1px dashed rgba(245, 158, 11, 0.35)', borderRadius: '8px', marginBottom: '12px', fontSize: '0.76rem', color: 'var(--fc-warning-text)' }}>
                  <strong>QR Badge Pending Arrival:</strong><br />
                  Will be issued at the NGMA registration desk upon physical check-in.
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.78rem', borderTop: '1px solid var(--fc-border)', paddingTop: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--fc-text-muted)' }}>Serial No:</span>
                  <strong style={{ color: 'var(--fc-text-main)' }}>{serialNo}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--fc-text-muted)' }}>Screenings Logged:</span>
                  <span style={{ fontWeight: 700, color: 'var(--fc-text-main)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <MovieIcon size={12} style={{ color: 'var(--fc-brand-text)' }} />
                    {attendee?.screenings_attended || 0}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--fc-text-muted)' }}>Registered:</span>
                  <span style={{ color: 'var(--fc-text-secondary)' }}>
                    {attendee?.registered_at ? new Date(attendee.registered_at).toLocaleDateString('en-GB') : '—'}
                  </span>
                </div>
              </div>
            </div>

            {/* Venue Pickup Card */}
            <div style={{
              background: 'rgba(168, 47, 47, 0.08)',
              border: '1px dashed rgba(168, 47, 47, 0.35)',
              borderRadius: '10px',
              padding: '16px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                <PlaceIcon size={15} style={{ color: 'var(--fc-brand-text)' }} />
                <span style={{ fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.03em', textTransform: 'uppercase', color: 'var(--fc-brand-text)' }}>
                  {formSchema?.venue_info?.card_title || 'PASS COLLECTION AT VENUE:'}
                </span>
              </div>
              <div style={{ fontWeight: 700, fontSize: '0.84rem', color: 'var(--fc-text-main)', lineHeight: 1.35 }}>
                {formSchema?.venue_info?.venue || 'National Gallery of Modern Art (NGMA), Bengaluru'}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--fc-text-secondary)', marginTop: '4px' }}>
                Dates: <strong>{formSchema?.venue_info?.dates || 'Friday November 20 – Sunday November 22, 2026'}</strong>
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--fc-brand-text)', fontWeight: 700, marginTop: '2px' }}>
                Timing: {formSchema?.venue_info?.timing || '10:15 AM to 6:00 PM'}
              </div>
            </div>
          </div>

          {/* Right Column: Full Dynamic Form Inputs strictly from schema */}
          <div style={{ flex: 1, minWidth: '320px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <form onSubmit={handleSubmit}>
              {/* Full Name */}
              {nameField && (
                <div style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--fc-text-secondary)', marginBottom: '4px' }}>
                    {nameField.label || 'Full Name'} {nameField.required !== false && <span style={{ color: 'var(--fc-brand-text)' }}>*</span>}
                  </label>
                  <input 
                    type="text" 
                    required={nameField.required !== false}
                    placeholder={nameField.placeholder || 'Enter full name'}
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
                        {emailField.label || 'Email Address'} {emailField.required && <span style={{ color: 'var(--fc-brand-text)' }}>*</span>}
                      </label>
                      <input 
                        type="email" 
                        required={emailField.required}
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
                        {phoneField.label || 'Mobile / WhatsApp Number'} {phoneField.required && <span style={{ color: 'var(--fc-brand-text)' }}>*</span>}
                      </label>
                      <input 
                        type="tel" 
                        required={phoneField.required}
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

              {/* Date of Birth & Gender Identity */}
              {(dobField || genderField) && (
                <div style={{ display: 'grid', gridTemplateColumns: (dobField && genderField) ? 'repeat(auto-fit, minmax(220px, 1fr))' : '1fr', gap: '12px', marginBottom: '14px', alignItems: 'flex-start' }}>
                  {dobField && (
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--fc-text-secondary)', marginBottom: '4px' }}>
                        {dobField.label || 'Date of Birth'} {dobField.required && <span style={{ color: 'var(--fc-brand-text)' }}>*</span>}
                      </label>
                      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                        <input 
                          type="text" 
                          required={dobField.required}
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
                        {genderField.label || 'Gender Identity'} {genderField.required && <span style={{ color: 'var(--fc-brand-text)' }}>*</span>}
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
                              name="edit_gender" 
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
                    {passTypeField.label || 'PASS TYPE'} {passTypeField.required && <span style={{ color: 'var(--fc-brand-text)' }}>*</span>}
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
                          <input type="radio" name="edit_pass_type" checked={isActive} onChange={() => setIntakeForm({ ...intakeForm, pass_type: opt })} style={{ accentColor: 'var(--fc-brand)' }} />
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

              {/* Delegate Category & Registration Status Row */}
              <div style={{ display: 'grid', gridTemplateColumns: delegateCategoryField ? 'repeat(auto-fit, minmax(220px, 1fr))' : '1fr', gap: '12px', marginBottom: '14px' }}>
                {delegateCategoryField && (
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--fc-text-secondary)', marginBottom: '4px' }}>
                      {delegateCategoryField.label || 'Delegate Category'} {delegateCategoryField.required && <span style={{ color: 'var(--fc-brand-text)' }}>*</span>}
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

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--fc-text-secondary)', marginBottom: '4px' }}>
                    Registration Status
                  </label>
                  <select 
                    value={intakeForm.status}
                    onChange={(e) => setIntakeForm({ ...intakeForm, status: e.target.value })}
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
                    <option value="registered">registered (Pending Arrival)</option>
                    <option value="badge_issued">badge_issued (QR Badge Issued)</option>
                    <option value="cancelled">cancelled (Pass Cancelled)</option>
                  </select>
                </div>
              </div>

              {/* Community Affiliation & Mumbai Attendance */}
              {(commField || mumbaiField) && (
                <div style={{ display: 'grid', gridTemplateColumns: (commField && mumbaiField) ? 'repeat(auto-fit, minmax(220px, 1fr))' : '1fr', gap: '14px', marginBottom: '14px' }}>
                  {commField && (
                    <div>
                      <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--fc-text-secondary)', marginBottom: '6px' }}>
                        {commField.label || 'Community Affiliation'} {commField.required && <span style={{ color: 'var(--fc-brand-text)' }}>*</span>}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {(commField.options && commField.options.length > 0
                          ? commField.options
                          : ['A Proud LGBTQ+ person', 'An Ally', 'Still figuring out']
                        ).map((item) => (
                          <label key={item} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', color: 'var(--fc-text-main)', cursor: 'pointer' }}>
                            <input 
                              type="radio" 
                              name="edit_community" 
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
                        {mumbaiField.label || 'Attended KASHISH in Mumbai?'} {mumbaiField.required && <span style={{ color: 'var(--fc-brand-text)' }}>*</span>}
                      </div>
                      <div style={{ display: 'flex', gap: '16px' }}>
                        {(mumbaiField.options && mumbaiField.options.length > 0 ? mumbaiField.options : ['Yes', 'No']).map((ans) => (
                          <label key={ans} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.82rem', color: 'var(--fc-text-main)', cursor: 'pointer' }}>
                            <input 
                              type="radio" 
                              name="edit_mumbai" 
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
                          {field.label} {field.required && <span style={{ color: 'var(--fc-brand-text)' }}>*</span>}
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
                                  name={`edit_custom_${field.key}`}
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

              {/* Verification & Signature - strictly data-driven */}
              {hasVerificationBox && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '16px' }}>
                  {signField && (
                    <div>
                      <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--fc-text-secondary)', marginBottom: '4px' }}>
                        {signField.label || 'Digital Signature'} {signField.required && <span style={{ color: 'var(--fc-brand-text)' }}>*</span>}
                      </label>
                      <input 
                        type="text" 
                        required={signField.required}
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
                        {placeField.label || 'Place'} {placeField.required && <span style={{ color: 'var(--fc-brand-text)' }}>*</span>}
                      </label>
                      <input 
                        type="text" 
                        required={placeField.required}
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
                          required={field.required}
                          checked={isChecked}
                          onChange={(e) => handleCheckboxToggle(field, e.target.checked)}
                          style={{ accentColor: 'var(--fc-brand)', marginTop: '3px' }}
                        />
                        <span>
                          {field.label}
                          {field.required && <span style={{ color: 'var(--fc-brand-text)', marginLeft: '3px' }}>*</span>}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}

              {/* Email the updated Delegate Registration Confirmation (docs/adr/0006) */}
              <label className={`fc-ae-send-confirmation ${hasEmail ? '' : 'is-disabled'}`}>
                <input
                  type="checkbox"
                  checked={sendConfirmation}
                  disabled={!hasEmail}
                  onChange={(e) => setSendConfirmationChoice(e.target.checked)}
                />
                <span>
                  <strong>{hasEmail ? `Email the updated confirmation to ${intakeForm.email.trim()}` : 'Email the updated confirmation'}</strong>
                  <small>
                    {!hasEmail
                      ? 'Add an email address to send the delegate their updated Delegate Registration Confirmation.'
                      : confirmationChanged
                        ? (sendConfirmation
                          ? 'Their pass details changed, so this is ticked. Untick it to save without emailing.'
                          : 'Their pass details changed. Tick it to email them the updated confirmation.')
                        : 'Nothing on their confirmation has changed. Tick it to resend it anyway.'}
                  </small>
                </span>
              </label>

              {/* Form Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', paddingTop: '16px', borderTop: '1px solid var(--fc-border)' }}>
                <button
                  type="button"
                  onClick={() => navigate(canViewRoster ? '/audience' : '/registration/assign-qr')}
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
                  disabled={submitting}
                  style={{
                    padding: '10px 32px',
                    borderRadius: '8px',
                    border: 'none',
                    background: 'var(--fc-brand)',
                    color: '#ffffff',
                    fontWeight: 700,
                    fontSize: '0.92rem',
                    cursor: submitting ? 'not-allowed' : 'pointer',
                    boxShadow: '0 4px 14px rgba(168, 47, 47, 0.35)',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={(e) => { if (!submitting) e.currentTarget.style.background = 'var(--fc-brand-hover)'; }}
                  onMouseLeave={(e) => { if (!submitting) e.currentTarget.style.background = 'var(--fc-brand)'; }}
                >
                  {submitting ? 'Saving Changes...' : 'Save Changes & Update Attendee'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: FESTIVAL FAQS DIALOG ─────────────────────────────────────── */}
      {showFaqModal && (
        <div 
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '16px' }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowFaqModal(false); }}
        >
          <div style={{ background: 'var(--fc-surface-card)', color: 'var(--fc-text-main)', borderRadius: '16px', width: '100%', maxWidth: '800px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid var(--fc-border)' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--fc-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>Festival Pass FAQs</h3>
              <button onClick={() => setShowFaqModal(false)} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: 'var(--fc-text-muted)' }}><CloseIcon size={16} /></button>
            </div>
            <div style={{ padding: '20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {(formSchema?.policy_info?.faqs || DEFAULT_FAQS).map((faq, idx) => (
                <div key={idx} style={{ background: 'var(--fc-surface)', border: '1px solid var(--fc-border)', borderRadius: '8px', padding: '12px 14px' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--fc-brand-text)', marginBottom: '4px' }}>
                    Q: {faq.question}
                  </div>
                  <div 
                    style={{ fontSize: '0.84rem', color: 'var(--fc-text-secondary)', lineHeight: 1.5 }}
                    dangerouslySetInnerHTML={{ __html: faq.answer }}
                  />
                </div>
              ))}
            </div>
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--fc-border)', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowFaqModal(false)}
                className="fc-btn fc-btn-secondary"
                style={{ padding: '6px 16px', borderRadius: '6px' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

