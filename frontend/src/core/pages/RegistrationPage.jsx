/**
 * RegistrationPage Component (/registration)
 * 
 * Attendee Registration & Badge Pass Issuance:
 * - Full-width searchable attendee roster with category badges & real-time counts
 * - "+ Add Attendee" CTA button launching the dynamic intake form modal (configured via Settings)
 * - Bulk CSV / Excel importer with live mapping for Kashish delegates
 * - Printable PDF / Lanyard Pass preview (4"x6" standard format)
 */

import React, { useState, useEffect, useRef } from 'react';
import api from '../services/api';
import { 
  UploadFileIcon, 
  MovieIcon, 
  ConfirmationNumberIcon, 
  PrintIcon, 
  HelpIcon, 
  PlaceIcon, 
  CheckCircleIcon, 
  InfoIcon,
  CloseIcon,
  AddIcon,
  SearchIcon,
  CalendarTodayIcon,
  QrCodeScannerIcon
} from '../components/common/Icons';

const DEFAULT_FAQS = [
  {
    question: 'Welcome to the KASHISH x BENGALURU 2026 film festival',
    answer: '<p>Celebrate diversity and storytelling with a vibrant community of filmmakers, artists, and allies.</p><p>Get ready to experience <strong>44 spellbinding LGBTQ+ films</strong> from <strong>15 countries</strong>, join engaging panel discussions, participate in interactive Q&amp;A sessions with filmmakers, and enjoy captivating performances at the Opening Ceremony.</p><p>KASHISH Pride Film Festival, South Asia’s biggest LGBTQ+ film festival, comes to Bengaluru for the first time for a 3-day festival from <strong>November 20th to November 22nd, 2026</strong> at the <strong>National Gallery of Modern Art (NGMA)</strong>, Bengaluru.</p>'
  },
  {
    question: 'Important Pass Policy',
    answer: '<p><strong>Only ONE Festival Pass can be booked per person.</strong></p><p>To book multiple passes, please repeat the process for each individual attendee with their respective identification details.</p>'
  },
  {
    question: 'Who Can Attend (Eligibility & Verification)',
    answer: '<ul><li><strong>18+ Only:</strong> Only individuals 18 years and above (as of November 19, 2026) are permitted to attend the festival.</li><li><strong>Mandatory Registration:</strong> Registration is compulsory to access any film screenings, ceremonies, or panel discussions.</li><li><strong>Badge Access:</strong> Admission into all NGMA festival halls is reserved exclusively for pre-registered delegates holding a verified Festival Pass.</li><li><strong>Photo ID:</strong> Please carry a valid government-issued photo ID / age proof document for physical verification at the reception counter.</li></ul>'
  },
  {
    question: 'How to Get Your Festival Pass: Online & Spot Registration',
    answer: '<p><strong>1. ONLINE REGISTRATION</strong><br/>Register conveniently online via <strong>Freecomers</strong> on this page before arriving at the venue.<br/>Please present your digital pass or Serial Number along with a valid age proof document at the counter when collecting your physical pass badge.</p><p><strong>2. SPOT REGISTRATION</strong><br/>For individuals unable to register online beforehand, on-site manual spot registration will be available at the NGMA venue desk:<br/>• NGMA Reception Desk: November 20 – 22 | 10:15 AM – 5:30 PM</p>'
  },
  {
    question: 'Collecting Your Festival Pass (Badge Pickup & Timing)',
    answer: '<p>Physical Festival Passes can be picked up exclusively from the registration desk at <strong>NGMA</strong> during the following operational hours:</p><p><strong>Badge Collection Hours:</strong> November 20 – 22 | 10:15 AM – 6:00 PM</p><p><em>* Please carry your government-issued age proof document to present at the counter.</em></p>'
  },
  {
    question: 'Festival Venue Details: NGMA Bengaluru',
    answer: '<p><strong>National Gallery of Modern Art (NGMA)</strong><br/>49, Manikyavelu Mansion, Palace Road, Vasanth Nagar, Bengaluru, Karnataka 560052</p><p>NGMA is an accessible, premier cultural campus equipped with state-of-the-art auditorium facilities, garden courtyards, and exhibition galleries.</p>'
  },
  {
    question: 'Audience Choice Voting & Check-in',
    answer: '<p>All accredited delegates are eligible to vote for the coveted <strong>KASHISH Audience Choice Award</strong>.<br/>To ensure verified voting, passholders check in via QR scanning at hall entrances prior to screening sessions.</p>'
  },
  {
    question: 'Queries & Support',
    answer: '<p>For any ticketing assistance, pass queries, or accreditation support, write to us at <a href="mailto:support@freecomers.com" style="color: #e11d48; text-decoration: underline;">support@freecomers.com</a> or approach the On-Site Helpdesk at NGMA Bengaluru.</p>'
  }
];

export default function RegistrationPage() {
  const [attendees, setAttendees] = useState([]);
  const [categories, setCategories] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;
  const dobPickerRef = useRef(null);

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
  const searchInputRef = useRef(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [selectedCat, setSelectedCat] = useState('');
  const [loading, setLoading] = useState(true);

  // Debounced search sync (280ms) matching Submissions and Team modules
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setCurrentPage(1);
    }, 280);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Global "/" keyboard shortcut to focus search, and "Escape" to clear & blur
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if (e.key === '/' && document.activeElement !== searchInputRef.current) {
        const tag = document.activeElement?.tagName?.toLowerCase();
        if (tag !== 'input' && tag !== 'textarea' && tag !== 'select') {
          e.preventDefault();
          searchInputRef.current?.focus();
        }
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  // Dynamic Form Schema from Settings
  const [formSchema, setFormSchema] = useState(null);

  // Form State
  const [intakeForm, setIntakeForm] = useState({
    name: '',
    email: '',
    phone: '',
    dob: '',
    gender_identity: 'Male',
    pass_type: 'Full-Festival Pass',
    pass_days: [],
    delegate_category: 'bangalore_general',
    community_identity: 'A Proud LGBTQ+ person',
    attended_mumbai: 'No',
    signature_name: '',
    place: 'Bengaluru',
    registration_date: new Date().toLocaleDateString('en-GB'),
    receive_updates: false,
    appear_in_attendee_list: false,
    certified_18_plus: true,
    custom_data: {}
  });

  const [submitting, setSubmitting] = useState(false);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [badgeModal, setBadgeModal] = useState(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showFaqModal, setShowFaqModal] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [importing, setImporting] = useState(false);
  const [issuingId, setIssuingId] = useState(null);

  const handleIssueQrBadge = async (attendee) => {
    try {
      setIssuingId(attendee.attendee_id);
      const res = await api.post(`/registration/attendees/${attendee.attendee_id}/issue-qr`);
      const updated = res.data.attendee;
      
      // Update local attendees list
      setAttendees(prev => prev.map(a => a.attendee_id === attendee.attendee_id ? { ...a, ...updated, qr_token: res.data.qr_token, status: 'badge_issued' } : a));
      
      // Update modal if currently viewing this attendee
      if (badgeModal && badgeModal.attendee_id === attendee.attendee_id) {
        setBadgeModal(prev => ({ ...prev, ...updated, qr_token: res.data.qr_token, status: 'badge_issued' }));
      }
      
      alert(`Success! Gate QR Badge issued for ${attendee.name} (${res.data.serial_no || '#' + attendee.attendee_id}).`);
    } catch (err) {
      alert('Failed to issue QR badge: ' + (err.response?.data?.error || err.message));
    } finally {
      setIssuingId(null);
    }
  };

  const handleRevokeQrBadge = async (attendee) => {
    if (!window.confirm(`Revoke QR badge credential for ${attendee.name}? This will invalidate their gate pass.`)) return;
    try {
      setIssuingId(attendee.attendee_id);
      await api.post(`/registration/attendees/${attendee.attendee_id}/revoke-qr`);
      
      setAttendees(prev => prev.map(a => a.attendee_id === attendee.attendee_id ? { ...a, qr_token: null, status: 'registered' } : a));
      if (badgeModal && badgeModal.attendee_id === attendee.attendee_id) {
        setBadgeModal(prev => ({ ...prev, qr_token: null, status: 'registered' }));
      }
      alert('QR badge credential revoked. Attendee returned to pre-registered state.');
    } catch (err) {
      alert('Failed to revoke QR badge: ' + (err.response?.data?.error || err.message));
    } finally {
      setIssuingId(null);
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const [attRes, catRes, formRes] = await Promise.all([
        api.get('/registration/attendees', { params: { search, category: selectedCat } }).catch(() => ({ data: { attendees: [] } })),
        api.get('/audience/categories').catch(() => ({ data: { categories: [] } })),
        api.get('/audience/registration-form').catch(() => ({ data: { schema: null } }))
      ]);

      const loadedCats = catRes.data?.categories || [];
      setAttendees(attRes.data?.attendees || []);
      setCategories(loadedCats);

      if (formRes.data?.schema) {
        const schema = formRes.data.schema;
        setFormSchema(schema);

        const passField = schema.fields?.find(f => f.key === 'pass_type');
        if (passField && passField.options?.length > 0) {
          setIntakeForm(prev => ({
            ...prev,
            pass_type: prev.pass_type || passField.options[0],
            delegate_category: prev.delegate_category || (loadedCats.length > 0 ? loadedCats[0].code : 'bangalore_general')
          }));
        }
      } else if (loadedCats.length > 0) {
        setIntakeForm(prev => ({
          ...prev,
          delegate_category: prev.delegate_category || loadedCats[0].code
        }));
      }
    } catch (err) {
      console.error('Failed to load registration data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setCurrentPage(1);
    fetchData();
  }, [search, selectedCat]);

  const handleSearchSubmit = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setSearch(searchInput.trim());
    setCurrentPage(1);
    fetchData();
  };

  const handleCustomFieldChange = (key, value) => {
    setIntakeForm(prev => ({
      ...prev,
      custom_data: {
        ...(prev.custom_data || {}),
        [key]: value
      }
    }));
  };

  const resetIntakeForm = () => {
    const passField = formSchema?.fields?.find(f => f.key === 'pass_type');
    setIntakeForm({
      name: '',
      email: '',
      phone: '',
      dob: '',
      gender_identity: 'Male',
      pass_type: passField?.options?.[0] || 'Full-Festival Pass',
      pass_days: [],
      delegate_category: categories[0]?.code || 'bangalore_general',
      community_identity: 'A Proud LGBTQ+ person',
      attended_mumbai: 'No',
      signature_name: '',
      place: 'Bengaluru',
      registration_date: new Date().toLocaleDateString('en-GB'),
      receive_updates: false,
      appear_in_attendee_list: false,
      certified_18_plus: true,
      custom_data: {}
    });
  };

  const handleIntakeSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!intakeForm.name.trim()) {
      alert('Attendee full name is required.');
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
        signature_name: intakeForm.signature_name || intakeForm.name,
        place: intakeForm.place || 'Bengaluru',
        registration_date: intakeForm.registration_date,
        receive_updates: intakeForm.receive_updates,
        appear_in_attendee_list: intakeForm.appear_in_attendee_list,
        certified_18_plus: intakeForm.certified_18_plus,
        custom_data: intakeForm.custom_data || {}
      };

      const res = await api.post('/registration/attendees', payload);
      alert('Attendee registered successfully! Delegate Pass generated.');
      setShowAddModal(false);
      setBadgeModal(res.data.attendee);
      resetIntakeForm();
      setCurrentPage(1);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to register attendee.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCsvImport = async (e) => {
    e.preventDefault();
    if (!csvText.trim()) return;

    try {
      setImporting(true);
      const lines = csvText.trim().split('\n');
      const delegates = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        if (i === 0 && line.toLowerCase().includes('name')) continue;

        const parts = line.split(',').map(s => s.trim().replace(/^"|"$/g, ''));
        if (parts.length >= 1) {
          delegates.push({
            name: parts[0],
            email: parts[1] || null,
            phone: parts[2] || null,
            category: parts[3] || 'delegate'
          });
        }
      }

      const res = await api.post('/registration/bulk-import', { delegates });
      alert(res.data.message || 'Import successful!');
      setShowImportModal(false);
      setCsvText('');
      setCurrentPage(1);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to import CSV.');
    } finally {
      setImporting(false);
    }
  };

  // Helper field accessors from dynamic schema
  const isEnabled = (key) => {
    if (!formSchema?.fields) return true;
    const f = formSchema.fields.find(x => x.key === key);
    return f ? f.enabled !== false : true;
  };

  const getField = (key) => formSchema?.fields?.find(f => f.key === key && f.enabled !== false);
  const nameField = getField('name');
  const emailField = getField('email');
  const phoneField = getField('phone');
  const dobField = getField('dob');
  const genderField = getField('gender_identity');
  const passTypeField = getField('pass_type');
  const passDaysField = getField('pass_days');
  const delegateCategoryField = getField('delegate_category');
  const commField = getField('community_identity');
  const mumbaiField = getField('attended_mumbai');
  const signField = formSchema?.fields?.find(f => (f.key === 'signature_name' || f.key === 'digital_signature') && f.enabled !== false);
  const placeField = getField('place');
  const dateField = formSchema?.fields?.find(f => (f.key === 'registration_date' || f.key === 'date') && f.enabled !== false);
  const updatesField = getField('receive_updates');
  const directoryField = formSchema?.fields?.find(f => (f.key === 'appear_in_attendee_list' || f.key === 'directory_consent') && f.enabled !== false);
  const certifyField = formSchema?.fields?.find(f => (f.key === 'certified_18_plus' || f.key === 'legal_certification') && f.enabled !== false);

  const standardKeys = [
    'name', 'email', 'phone', 'dob', 'gender_identity', 
    'pass_type', 'pass_days', 'delegate_category', 'community_identity', 'attended_mumbai', 
    'signature_name', 'digital_signature', 'place', 'registration_date', 'date',
    'receive_updates', 'marketing_consent', 'appear_in_attendee_list', 'directory_consent', 
    'certified_18_plus', 'legal_certification'
  ];
  const customOrOtherFields = formSchema?.fields?.filter(f => !standardKeys.includes(f.key) && f.enabled !== false) || [];

  const passOptions = passTypeField?.options && passTypeField.options.length > 0
    ? passTypeField.options
    : ['Full-Festival Pass', 'Day Pass (Choose Days)'];

  const isDayPassActive = intakeForm.pass_type?.toLowerCase().includes('day');
  const currentCategoryObj = categories.find(c => c.code === intakeForm.delegate_category || c.name === intakeForm.delegate_category);

  // Enhanced client-side filter for instantaneous 0ms feedback as user types
  const filteredAttendees = React.useMemo(() => {
    const q = (searchInput || search).trim().toLowerCase();
    if (!q && !selectedCat) return attendees;
    return attendees.filter(att => {
      // Category filter
      if (selectedCat) {
        const catCode = (att.delegate_category || '').toLowerCase();
        if (catCode !== selectedCat.toLowerCase()) return false;
      }
      if (!q) return true;

      const name = (att.name || '').toLowerCase();
      const email = (att.email || '').toLowerCase();
      const phone = (att.phone || '').toLowerCase();
      const serial = (att.serial_no || '').toLowerCase();
      const idStr = String(att.attendee_id || '');
      const ribbon = (att.badge_ribbon || '').toLowerCase();
      const passType = (att.pass_type || '').toLowerCase();
      const place = (att.custom_data?.place || '').toLowerCase();

      return (
        name.includes(q) ||
        email.includes(q) ||
        phone.includes(q) ||
        serial.includes(q) ||
        idStr === q ||
        ribbon.includes(q) ||
        passType.includes(q) ||
        place.includes(q)
      );
    });
  }, [attendees, searchInput, search, selectedCat]);

  // Client-side pagination calculations (10 attendees per page)
  const totalPages = Math.ceil(filteredAttendees.length / pageSize) || 1;
  const validCurrentPage = Math.min(Math.max(currentPage, 1), totalPages);
  const startIndex = (validCurrentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, filteredAttendees.length);
  const paginatedAttendees = filteredAttendees.slice(startIndex, endIndex);

  // Statistics for 2-step registration & issuance tracking
  const totalRegisteredCount = attendees.length;
  const totalIssuedCount = attendees.filter(a => a.qr_token || a.status === 'badge_issued').length;
  const totalPendingArrivalCount = Math.max(0, totalRegisteredCount - totalIssuedCount);
  const totalScreeningCheckins = attendees.reduce((acc, a) => acc + (a.screenings_attended || 0), 0);

  return (
    <div className="fc-registration-page">
      {/* ── Page Header ──────────────────────────────────────────────────────── */}
      <div className="fc-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '14px' }}>
        <div>
          <h1 className="fc-page-title" style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0, color: 'var(--fc-text-main)', letterSpacing: '-0.02em' }}>
            Attendee Registration & Badges
          </h1>
          <p className="fc-page-subtitle" style={{ color: 'var(--fc-text-muted)', marginTop: '4px', fontSize: '0.9rem' }}>
            Two-step delegate lifecycle: Online pre-registration &rarr; Venue reception ID verification &rarr; Physical QR badge issuance
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Primary CTA: + Add Attendee */}
          <button
            onClick={() => setShowAddModal(true)}
            style={{
              background: '#a82f2f',
              color: '#ffffff',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '8px',
              fontWeight: 700,
              fontSize: '0.9rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 4px 14px rgba(168, 47, 47, 0.35)',
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = '#922828'}
            onMouseLeave={(e) => e.currentTarget.style.background = '#a82f2f'}
          >
            <AddIcon size={18} />
            <span>Add Attendee</span>
          </button>

          {/* Secondary CTA: CSV / Bulk Import */}
          <button
            onClick={() => setShowImportModal(true)}
            style={{
              background: 'var(--fc-surface-card)',
              color: 'var(--fc-text-main)',
              border: '1px solid var(--fc-border)',
              padding: '10px 18px',
              borderRadius: '8px',
              fontSize: '0.88rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: 'var(--shadow-sm)'
            }}
          >
            <UploadFileIcon size={16} />
            <span>Import CSV / Data</span>
          </button>
        </div>
      </div>

      {/* ── KPI Stat Banner (2-Step Registration vs Issuance) ─────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '14px', marginBottom: '20px' }}>
        <div className="fc-card" style={{ background: 'var(--fc-surface-card)', borderRadius: '10px', padding: '14px 18px', border: '1px solid var(--fc-border)' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--fc-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Pre-Registered Delegates
          </div>
          <div style={{ fontSize: '1.65rem', fontWeight: 800, color: 'var(--fc-text-main)', marginTop: '2px' }}>
            {totalRegisteredCount}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--fc-text-secondary)', marginTop: '2px' }}>
            Registered online &amp; serial issued
          </div>
        </div>

        <div className="fc-card" style={{ background: 'var(--fc-surface-card)', borderRadius: '10px', padding: '14px 18px', border: '1px solid var(--fc-border)', borderTop: '3px solid #16a34a' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#16a34a', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Badges Issued (At Venue)
          </div>
          <div style={{ fontSize: '1.65rem', fontWeight: 800, color: '#16a34a', marginTop: '2px' }}>
            {totalIssuedCount}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--fc-text-secondary)', marginTop: '2px' }}>
            Verified &amp; active QR credentials
          </div>
        </div>

        <div className="fc-card" style={{ background: 'var(--fc-surface-card)', borderRadius: '10px', padding: '14px 18px', border: '1px solid var(--fc-border)', borderTop: '3px solid #f59e0b' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#d97706', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Pending Venue Arrival
          </div>
          <div style={{ fontSize: '1.65rem', fontWeight: 800, color: '#d97706', marginTop: '2px' }}>
            {totalPendingArrivalCount}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--fc-text-secondary)', marginTop: '2px' }}>
            Not yet turned up at desk
          </div>
        </div>

        <div className="fc-card" style={{ background: 'var(--fc-surface-card)', borderRadius: '10px', padding: '14px 18px', border: '1px solid var(--fc-border)' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--fc-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Gate Check-Ins
          </div>
          <div style={{ fontSize: '1.65rem', fontWeight: 800, color: '#3b82f6', marginTop: '2px' }}>
            {totalScreeningCheckins}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--fc-text-secondary)', marginTop: '2px' }}>
            Admitted into screening halls
          </div>
        </div>
      </div>

      {/* ── Full-Width Attendee Roster Table ─────────────────────────────────── */}
      <div className="fc-card" style={{ background: 'var(--fc-surface-card)', borderRadius: '14px', border: '1px solid var(--fc-border)', padding: '20px', boxShadow: 'var(--shadow-sm)' }}>
        
        {/* Filter & Search Bar with Add CTA */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '14px', marginBottom: (search || selectedCat) ? '12px' : '20px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: '280px', maxWidth: '640px' }}>
            <div style={{ position: 'relative', width: '100%', display: 'flex', alignItems: 'center' }}>
              <span
                style={{
                  position: 'absolute',
                  left: '12px',
                  color: 'var(--fc-text-muted)',
                  pointerEvents: 'none',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <SearchIcon size={15} />
              </span>
              <input
                ref={searchInputRef}
                type="text"
                className="fc-input fc-search-input"
                placeholder="Search delegate, email, phone, badge #..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setSearchInput('');
                    setSearch('');
                    searchInputRef.current?.blur();
                  } else if (e.key === 'Enter') {
                    setSearch(searchInput.trim());
                    setCurrentPage(1);
                  }
                }}
                style={{
                  width: '100%',
                  height: '40px',
                  paddingLeft: '34px',
                  paddingRight: searchInput ? '32px' : '44px',
                  borderRadius: '8px',
                  border: '1px solid var(--fc-border)',
                  background: 'var(--fc-surface)',
                  color: 'var(--fc-text-main)',
                  fontSize: '13px',
                  boxSizing: 'border-box'
                }}
              />
              {searchInput ? (
                <button
                  type="button"
                  onClick={() => {
                    setSearchInput('');
                    setSearch('');
                    searchInputRef.current?.focus();
                  }}
                  style={{
                    position: 'absolute',
                    right: '10px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--fc-text-muted)',
                    fontSize: '13px',
                    padding: '2px 4px',
                    borderRadius: '4px',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                  title="Clear search (Esc)"
                  aria-label="Clear search"
                >
                  <CloseIcon size={13} />
                </button>
              ) : (
                <span
                  style={{
                    position: 'absolute',
                    right: '10px',
                    fontSize: '11px',
                    color: 'var(--fc-text-muted)',
                    border: '1px solid var(--fc-border)',
                    padding: '1px 5px',
                    borderRadius: '4px',
                    pointerEvents: 'none',
                    opacity: 0.7
                  }}
                  title="Press / to search"
                >
                  /
                </span>
              )}
            </div>

            <select
              value={selectedCat}
              onChange={(e) => {
                setSelectedCat(e.target.value);
                setCurrentPage(1);
              }}
              style={{
                height: '40px',
                padding: '0 14px',
                borderRadius: '8px',
                border: '1px solid var(--fc-border)',
                background: 'var(--fc-surface)',
                color: 'var(--fc-text-main)',
                fontSize: '0.88rem',
                boxSizing: 'border-box',
                minWidth: '160px',
                cursor: 'pointer'
              }}
            >
              <option value="">All Categories ({attendees.length})</option>
              {categories.map(c => {
                const count = attendees.filter(a =>
                  (a.delegate_category || '').toLowerCase() === (c.code || '').toLowerCase() ||
                  (a.delegate_category || '').toLowerCase() === (c.name || '').toLowerCase()
                ).length;
                return (
                  <option key={c.id} value={c.code}>
                    {c.name} {count > 0 ? `(${count})` : ''}
                  </option>
                );
              })}
            </select>
          </div>

          <div style={{ fontSize: '0.85rem', color: 'var(--fc-text-muted)', fontWeight: 600 }}>
            Showing <strong>{filteredAttendees.length > 0 ? `${startIndex + 1}–${endIndex}` : 0}</strong> of <strong>{filteredAttendees.length}</strong> registered delegates
          </div>
        </div>

        {/* Active Filter & Search Match Badges */}
        {(search || selectedCat) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '18px' }}>
            {search && (
              <span
                style={{
                  fontSize: '11.5px',
                  fontWeight: 600,
                  color: 'var(--fc-brand, #a82f2f)',
                  background: 'rgba(168, 47, 47, 0.08)',
                  border: '1px solid rgba(168, 47, 47, 0.25)',
                  padding: '3px 8px',
                  borderRadius: '6px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                Matching "{search}" ({filteredAttendees.length})
                <button
                  type="button"
                  onClick={() => {
                    setSearchInput('');
                    setSearch('');
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'inherit',
                    cursor: 'pointer',
                    padding: 0,
                    fontSize: '11px',
                    fontWeight: 800,
                    display: 'flex',
                    alignItems: 'center'
                  }}
                  title="Clear search filter"
                >
                  <CloseIcon size={11} />
                </button>
              </span>
            )}
            {selectedCat && (
              <span
                style={{
                  fontSize: '11.5px',
                  fontWeight: 600,
                  color: 'var(--fc-text-main)',
                  background: 'var(--fc-surface-hover, #f3f4f6)',
                  border: '1px solid var(--fc-border)',
                  padding: '3px 8px',
                  borderRadius: '6px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                Category: {categories.find(c => c.code === selectedCat)?.name || selectedCat}
                <button
                  type="button"
                  onClick={() => setSelectedCat('')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'inherit',
                    cursor: 'pointer',
                    padding: 0,
                    fontSize: '11px',
                    fontWeight: 800,
                    display: 'flex',
                    alignItems: 'center'
                  }}
                  title="Clear category filter"
                >
                  <CloseIcon size={11} />
                </button>
              </span>
            )}
            <button
              type="button"
              onClick={() => {
                setSearchInput('');
                setSearch('');
                setSelectedCat('');
              }}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--fc-text-muted)',
                fontSize: '11.5px',
                textDecoration: 'underline',
                cursor: 'pointer',
                padding: '0 4px'
              }}
            >
              Reset all
            </button>
          </div>
        )}

        {/* Table Content */}
        {loading ? (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: '#9ca3af' }}>
            Loading delegate roster...
          </div>
        ) : filteredAttendees.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--fc-text-muted)' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>
              <ConfirmationNumberIcon size={44} style={{ color: 'var(--fc-text-muted)' }} />
            </div>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--fc-text-main)', marginBottom: '6px' }}>
              {search || selectedCat ? 'No delegates found' : 'No delegates registered yet'}
            </div>
            <p style={{ margin: '0 0 18px 0', fontSize: '0.88rem', color: 'var(--fc-text-secondary)' }}>
              {search || selectedCat
                ? `No delegate matched "${search || selectedCat}". Try checking for spelling or reset filters.`
                : 'Onboard your first attendee using the dynamic registration form.'}
            </p>
            {search || selectedCat ? (
              <button
                type="button"
                onClick={() => {
                  setSearchInput('');
                  setSearch('');
                  setSelectedCat('');
                }}
                className="fc-btn fc-btn-secondary"
                style={{
                  padding: '8px 18px',
                  borderRadius: '8px',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer'
                }}
              >
                Clear Search & Filters
              </button>
            ) : (
              <button
                onClick={() => setShowAddModal(true)}
                style={{
                  background: '#a82f2f',
                  color: '#fff',
                  border: 'none',
                  padding: '10px 22px',
                  borderRadius: '8px',
                  fontWeight: 700,
                  fontSize: '0.88rem',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 14px rgba(168, 47, 47, 0.35)'
                }}
              >
                <AddIcon size={16} />
                <span>Add Attendee</span>
              </button>
            )}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
              <thead>
                <tr style={{ background: 'var(--fc-surface)', borderBottom: '1px solid var(--fc-border)', textAlign: 'left', color: 'var(--fc-text-muted)' }}>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Badge #</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Delegate</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Category Ribbon</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Venue Badge Status</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Contact Info</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Screenings Attended</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'right' }}>Pass Action</th>
                </tr>
              </thead>
              <tbody>
                {paginatedAttendees.map((a) => {
                  const isIssued = Boolean(a.qr_token || a.status === 'badge_issued');
                  return (
                    <tr key={a.attendee_id} style={{ borderBottom: '1px solid var(--fc-border-subtle, var(--fc-border))' }}>
                      <td style={{ padding: '14px 16px', fontWeight: 800, color: '#3b82f6', whiteSpace: 'nowrap' }}>
                        {a.serial_no || (`#${a.attendee_id}`)}
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ fontWeight: 700, color: 'var(--fc-text-main)', fontSize: '0.92rem' }}>{a.name}</div>
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <span 
                          style={{ 
                            background: a.badge_color || '#a82f2f', 
                            color: '#fff', 
                            fontSize: '0.72rem', 
                            fontWeight: 800, 
                            padding: '3px 10px', 
                            borderRadius: '4px',
                            letterSpacing: '0.05em',
                            textTransform: 'uppercase',
                            display: 'inline-block'
                          }}
                        >
                          {a.badge_ribbon || a.delegate_category}
                        </span>
                      </td>
                      <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' }}>
                        {isIssued ? (
                          <span style={{ 
                            padding: '3px 8px', 
                            borderRadius: '5px', 
                            fontSize: '0.72rem', 
                            fontWeight: 800, 
                            background: 'rgba(22, 163, 74, 0.12)', 
                            color: '#16a34a', 
                            border: '1px solid rgba(22, 163, 74, 0.3)', 
                            display: 'inline-flex', 
                            alignItems: 'center', 
                            gap: '4px' 
                          }}>
                            <CheckCircleIcon size={12} /> QR Issued
                          </span>
                        ) : (
                          <span style={{ 
                            padding: '3px 8px', 
                            borderRadius: '5px', 
                            fontSize: '0.72rem', 
                            fontWeight: 700, 
                            background: 'rgba(245, 158, 11, 0.12)', 
                            color: '#d97706', 
                            border: '1px solid rgba(245, 158, 11, 0.3)', 
                            display: 'inline-flex', 
                            alignItems: 'center', 
                            gap: '4px' 
                          }}>
                            Pending Arrival
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '14px 16px', color: 'var(--fc-text-secondary)' }}>
                        <div style={{ fontWeight: 600 }}>{a.phone || '—'}</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--fc-text-muted)' }}>{a.email || '—'}</div>
                      </td>
                      <td style={{ padding: '14px 16px', fontWeight: 700, color: 'var(--fc-text-main)' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'var(--fc-surface)', padding: '4px 10px', borderRadius: '6px', border: '1px solid var(--fc-border)' }}>
                          <MovieIcon size={14} style={{ color: '#a82f2f' }} /> {a.screenings_attended || 0}
                        </span>
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                          {!isIssued && (
                            <button
                              type="button"
                              onClick={() => handleIssueQrBadge(a)}
                              disabled={issuingId === a.attendee_id}
                              style={{
                                background: '#16a34a',
                                color: '#ffffff',
                                border: 'none',
                                padding: '6px 12px',
                                borderRadius: '6px',
                                cursor: issuingId === a.attendee_id ? 'not-allowed' : 'pointer',
                                fontSize: '0.78rem',
                                fontWeight: 700,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                                boxShadow: 'var(--shadow-sm)'
                              }}
                              title="Verify attendee presence at reception and issue gate QR code"
                            >
                              <QrCodeScannerIcon size={13} />
                              <span>{issuingId === a.attendee_id ? 'Issuing...' : 'Issue QR'}</span>
                            </button>
                          )}
                          <button
                            onClick={() => setBadgeModal(a)}
                            style={{ 
                              background: isIssued ? 'rgba(22, 163, 74, 0.08)' : 'var(--fc-surface)', 
                              color: isIssued ? '#16a34a' : 'var(--fc-text-main)', 
                              border: isIssued ? '1px solid rgba(22, 163, 74, 0.3)' : '1px solid var(--fc-border)', 
                              padding: '6px 12px', 
                              borderRadius: '6px', 
                              cursor: 'pointer', 
                              fontSize: '0.78rem', 
                              fontWeight: 700, 
                              display: 'inline-flex', 
                              alignItems: 'center', 
                              gap: '5px',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            {isIssued ? (
                              <>
                                <PrintIcon size={13} /> Print Badge
                              </>
                            ) : (
                              <>
                                <ConfirmationNumberIcon size={13} /> View Pass
                              </>
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Pagination Toolbar (10 per page) ─────────────────────────── */}
        {filteredAttendees.length > 0 && totalPages > 1 && (
          <div 
            style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              marginTop: '18px', 
              paddingTop: '16px', 
              borderTop: '1px solid var(--fc-border)',
              flexWrap: 'wrap',
              gap: '12px'
            }}
          >
            <div style={{ fontSize: '0.85rem', color: 'var(--fc-text-secondary)', fontWeight: 500 }}>
              Showing <strong>{startIndex + 1}</strong>–<strong>{endIndex}</strong> of <strong>{filteredAttendees.length}</strong> delegates (Page {validCurrentPage} of {totalPages})
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {/* Previous Page */}
              <button
                type="button"
                disabled={validCurrentPage <= 1}
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  border: '1px solid var(--fc-border)',
                  background: validCurrentPage <= 1 ? 'var(--fc-surface-hover, #f3f4f6)' : 'var(--fc-surface)',
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

              {/* Page Number Buttons */}
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
                      border: isActive ? '1px solid #a82f2f' : '1px solid var(--fc-border)',
                      background: isActive ? '#a82f2f' : 'var(--fc-surface)',
                      color: isActive ? '#ffffff' : 'var(--fc-text-main)',
                      fontWeight: isActive ? 700 : 600,
                      fontSize: '0.82rem',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {pageNum}
                  </button>
                );
              })}

              {/* Next Page */}
              <button
                type="button"
                disabled={validCurrentPage >= totalPages}
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  border: '1px solid var(--fc-border)',
                  background: validCurrentPage >= totalPages ? 'var(--fc-surface-hover, #f3f4f6)' : 'var(--fc-surface)',
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
          </div>
        )}
      </div>

      {/* ── MODAL: DYNAMIC "ADD ATTENDEE" FORM MODAL ───────────────────────── */}
      {showAddModal && (
        <div 
          style={{ 
            position: 'fixed', 
            top: 0, 
            left: 0, 
            right: 0, 
            bottom: 0, 
            background: 'rgba(0,0,0,0.75)', 
            backdropFilter: 'blur(4px)', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            zIndex: 1000, 
            padding: '16px' 
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowAddModal(false);
          }}
        >
          <div 
            style={{ 
              background: 'var(--fc-surface-card)', 
              color: 'var(--fc-text-main)', 
              borderRadius: '16px', 
              width: '100%', 
              maxWidth: '940px', 
              maxHeight: '92vh', 
              display: 'flex', 
              flexDirection: 'column', 
              boxShadow: '0 25px 60px -12px rgba(0, 0, 0, 0.6)', 
              overflow: 'hidden', 
              border: '1px solid var(--fc-border)' 
            }}
          >
            {/* Modal Header */}
            <div style={{
              background: 'var(--fc-surface-card)',
              padding: '16px 24px',
              borderBottom: '3px solid #a82f2f',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '10px'
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.28rem', fontWeight: 800, color: 'var(--fc-text-main)', letterSpacing: '-0.01em' }}>
                  {formSchema?.form_title || 'Add New Delegate / Attendee'}
                </h3>
                <p style={{ margin: '2px 0 0 0', fontSize: '0.8rem', color: 'var(--fc-text-muted)' }}>
                  {formSchema?.form_subtitle || 'Configured via Audience Settings · Issues verified digital & badge passes'}
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{
                  background: 'var(--fc-surface-subtle)',
                  border: '1px solid var(--fc-border)',
                  color: 'var(--fc-text-secondary)',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  padding: '4px 12px',
                  borderRadius: '16px'
                }}>
                  Live Form Schema
                </span>

                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  style={{
                    background: 'var(--fc-surface)',
                    border: '1px solid var(--fc-border)',
                    borderRadius: '50%',
                    width: '32px',
                    height: '32px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    color: 'var(--fc-text-muted)'
                  }}
                >
                  <CloseIcon size={14} />
                </button>
              </div>
            </div>

            {/* Modal Body: 2 Columns (Policy Left, Dynamic Form Right) */}
            <div style={{
              padding: '24px',
              overflowY: 'auto',
              flex: 1,
              display: 'flex',
              flexDirection: 'row',
              gap: '24px',
              background: 'var(--fc-surface-card)'
            }}>
              {/* Left Column: Policy & Venue */}
              <div style={{ width: '280px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Policy Card */}
                <div style={{
                  background: 'var(--fc-surface-subtle)',
                  border: '1px solid var(--fc-border)',
                  borderRadius: '12px',
                  padding: '16px',
                  color: 'var(--fc-text-main)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                    <ConfirmationNumberIcon size={18} style={{ color: '#a82f2f' }} />
                    <span style={{ fontWeight: 800, fontSize: '0.82rem', letterSpacing: '0.04em', textTransform: 'uppercase', color: '#a82f2f' }}>
                      {formSchema?.policy_info?.title || 'DELEGATE PASS POLICY'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.8rem', lineHeight: 1.4, color: 'var(--fc-text-secondary)' }}>
                    {((formSchema?.policy_info?.points && formSchema.policy_info.points.length > 0)
                      ? formSchema.policy_info.points
                      : [
                          'Full-Festival Pass is valid for all screenings on all days.',
                          'Day Passes are valid only for individual days selected.',
                          'Delegate Pass does NOT guarantee seating, which is first come, first served.',
                          'Entry without Delegate Pass will be denied.'
                        ]
                    ).map((pt, pIdx) => (
                      <div key={pIdx} style={{ display: 'flex', gap: '5px' }}>
                        <span style={{ color: '#a82f2f', fontWeight: 800 }}>•</span>
                        <span>{pt}</span>
                      </div>
                    ))}
                  </div>

                  <div style={{ marginTop: '14px' }}>
                    <span
                      onClick={() => setShowFaqModal(true)}
                      style={{ color: '#a82f2f', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    >
                      <HelpIcon size={14} style={{ color: '#a82f2f' }} /> {formSchema?.policy_info?.faq_text || 'Read all FAQs →'}
                    </span>
                  </div>
                </div>

                {/* Venue Pickup Card */}
                <div style={{
                  background: 'rgba(168, 47, 47, 0.08)',
                  border: '1px dashed rgba(168, 47, 47, 0.35)',
                  borderRadius: '10px',
                  padding: '14px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                    <PlaceIcon size={15} style={{ color: '#a82f2f' }} />
                    <span style={{ fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.03em', textTransform: 'uppercase', color: '#a82f2f' }}>
                      {formSchema?.venue_info?.card_title || 'PASS COLLECTION AT VENUE:'}
                    </span>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--fc-text-main)', lineHeight: 1.3 }}>
                    {formSchema?.venue_info?.venue || 'NGMA Bengaluru'}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--fc-text-secondary)', marginTop: '2px' }}>
                    Dates: <strong>{formSchema?.venue_info?.dates || 'Nov 20-22, 2026'}</strong>
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#a82f2f', fontWeight: 700, marginTop: '2px' }}>
                    Timing: {formSchema?.venue_info?.timing || '10:00 AM to 6:00 PM'}
                  </div>
                </div>
              </div>

              {/* Right Column: Full Dynamic Form Inputs */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <form onSubmit={handleIntakeSubmit}>
                  {/* Full Name */}
                  {isEnabled('name') && (
                    <div style={{ marginBottom: '14px' }}>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--fc-text-secondary)', marginBottom: '4px' }}>
                        {nameField?.label || 'Full Name'} <span style={{ color: '#a82f2f' }}>*</span>
                      </label>
                      <input 
                        type="text" 
                        required
                        placeholder={nameField?.placeholder || 'Enter full name as per Govt ID'}
                        value={intakeForm.name}
                        onChange={(e) => setIntakeForm({ ...intakeForm, name: e.target.value })}
                        style={{ width: '100%', height: '38px', padding: '0 12px', borderRadius: '8px', border: '1px solid var(--fc-border)', background: 'var(--fc-surface)', color: 'var(--fc-text-main)', fontSize: '0.86rem', boxSizing: 'border-box' }}
                      />
                    </div>
                  )}

                  {/* Email & Phone */}
                  {(isEnabled('email') || isEnabled('phone')) && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                      {isEnabled('email') && (
                        <div>
                          <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--fc-text-secondary)', marginBottom: '4px' }}>
                            {emailField?.label || 'Email Address'} {emailField?.required && <span style={{ color: '#a82f2f' }}>*</span>}
                          </label>
                          <input 
                            type="email" 
                            placeholder={emailField?.placeholder || 'name@example.com'}
                            value={intakeForm.email}
                            onChange={(e) => setIntakeForm({ ...intakeForm, email: e.target.value })}
                            style={{ width: '100%', height: '38px', padding: '0 12px', borderRadius: '8px', border: '1px solid var(--fc-border)', background: 'var(--fc-surface)', color: 'var(--fc-text-main)', fontSize: '0.86rem', boxSizing: 'border-box' }}
                          />
                        </div>
                      )}
                      {isEnabled('phone') && (
                        <div>
                          <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--fc-text-secondary)', marginBottom: '4px' }}>
                            {phoneField?.label || 'Mobile Number'} {phoneField?.required && <span style={{ color: '#a82f2f' }}>*</span>}
                          </label>
                          <input 
                            type="tel" 
                            placeholder={phoneField?.placeholder || '+91 98765 43210'}
                            value={intakeForm.phone}
                            onChange={(e) => setIntakeForm({ ...intakeForm, phone: e.target.value })}
                            style={{ width: '100%', height: '38px', padding: '0 12px', borderRadius: '8px', border: '1px solid var(--fc-border)', background: 'var(--fc-surface)', color: 'var(--fc-text-main)', fontSize: '0.86rem', boxSizing: 'border-box' }}
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Date of Birth & Gender Identity - PERFECT HORIZONTAL ALIGNMENT */}
                  {(isEnabled('dob') || isEnabled('gender_identity')) && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.35fr', gap: '12px', marginBottom: '14px', alignItems: 'flex-start' }}>
                      {isEnabled('dob') && (
                        <div>
                          <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--fc-text-secondary)', marginBottom: '4px' }}>
                            {dobField?.label || 'Date of Birth'} {dobField?.required && <span style={{ color: '#a82f2f' }}>*</span>}
                          </label>
                          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                            <input 
                              type="text" 
                              placeholder={dobField?.placeholder || 'DD/MM/YYYY'}
                              value={intakeForm.dob}
                              onChange={(e) => setIntakeForm({ ...intakeForm, dob: e.target.value })}
                              style={{ width: '100%', height: '38px', padding: '0 12px', paddingRight: '38px', borderRadius: '8px', border: '1px solid var(--fc-border)', background: 'var(--fc-surface)', color: 'var(--fc-text-main)', fontSize: '0.86rem', boxSizing: 'border-box' }}
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
                                  const [yyyy, mm, dd] = iso.split('-');
                                  setIntakeForm({ ...intakeForm, dob: `${dd}/${mm}/${yyyy}` });
                                }
                              }}
                              style={{
                                position: 'absolute',
                                right: '6px',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                opacity: 0,
                                width: '28px',
                                height: '28px',
                                pointerEvents: 'none'
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
                                color: '#a82f2f',
                                transition: 'transform 0.15s ease'
                              }}
                              title="Select date from calendar"
                            >
                              <CalendarTodayIcon size={16} />
                            </button>
                          </div>
                        </div>
                      )}

                      {isEnabled('gender_identity') && (
                        <div>
                          <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--fc-text-secondary)', marginBottom: '4px' }}>
                            {genderField?.label || 'Gender Identity'} {genderField?.required && <span style={{ color: '#a82f2f' }}>*</span>}
                          </label>
                          <div style={{ 
                            height: '38px', 
                            border: '1px solid var(--fc-border)', 
                            borderRadius: '8px', 
                            padding: '0 10px', 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '8px', 
                            background: 'var(--fc-surface)',
                            overflowX: 'auto',
                            boxSizing: 'border-box'
                          }}>
                            {(genderField?.options && genderField.options.length > 0 ? genderField.options : ['Male', 'Female', 'Trans*', 'Other']).map((g) => (
                              <label key={g} style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '0.78rem', color: 'var(--fc-text-main)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                <input 
                                  type="radio" 
                                  name="modal_gender" 
                                  value={g} 
                                  checked={intakeForm.gender_identity === g} 
                                  onChange={(e) => setIntakeForm({ ...intakeForm, gender_identity: e.target.value })} 
                                  style={{ accentColor: '#a82f2f', cursor: 'pointer', margin: 0 }}
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
                  {isEnabled('pass_type') && (
                    <div style={{ border: '1px solid var(--fc-border)', borderRadius: '10px', padding: '12px', background: 'var(--fc-surface-subtle)', marginBottom: '14px' }}>
                      <div style={{ fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--fc-text-main)', marginBottom: '8px' }}>
                        {passTypeField?.label || 'SELECT PASS CATEGORY'}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        {passOptions.map((opt) => {
                          const isActive = intakeForm.pass_type === opt;
                          return (
                            <div
                              key={opt}
                              onClick={() => setIntakeForm({ ...intakeForm, pass_type: opt })}
                              style={{
                                border: isActive ? '1px solid #a82f2f' : '1px solid var(--fc-border)',
                                background: isActive ? 'rgba(168, 47, 47, 0.1)' : 'var(--fc-surface)',
                                borderRadius: '8px',
                                padding: '8px 12px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px'
                              }}
                            >
                              <input type="radio" name="modal_pass_type" checked={isActive} onChange={() => setIntakeForm({ ...intakeForm, pass_type: opt })} style={{ accentColor: '#a82f2f' }} />
                              <div>
                                <div style={{ fontWeight: 700, fontSize: '0.84rem' }}>{opt}</div>
                                <div style={{ fontSize: '0.72rem', color: 'var(--fc-text-muted)' }}>
                                  {opt.toLowerCase().includes('full') ? 'All dates pass' : 'Selected dates only'}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {isEnabled('pass_days') && isDayPassActive && (
                        <div style={{ marginTop: '10px', padding: '8px 12px', background: 'var(--fc-surface)', borderRadius: '6px', border: '1px dashed var(--fc-border)' }}>
                          <div style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--fc-text-secondary)', marginBottom: '4px' }}>
                            {passDaysField?.label || 'Select Days Attending'}:
                          </div>
                          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                            {(passDaysField?.options || ['NOV 20th', 'NOV 21st', 'NOV 22nd', 'All Days']).map((d) => (
                              <label key={d} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.78rem', cursor: 'pointer' }}>
                                <input 
                                  type="checkbox"
                                  checked={intakeForm.pass_days.includes(d)}
                                  onChange={(e) => {
                                    if (e.target.checked) setIntakeForm({ ...intakeForm, pass_days: [...intakeForm.pass_days, d] });
                                    else setIntakeForm({ ...intakeForm, pass_days: intakeForm.pass_days.filter(x => x !== d) });
                                  }}
                                  style={{ accentColor: '#a82f2f' }}
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
                  {isEnabled('delegate_category') && (
                    <div style={{ marginBottom: '14px' }}>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--fc-text-secondary)', marginBottom: '4px' }}>
                        {delegateCategoryField?.label || 'Delegate Category'} {delegateCategoryField?.required && <span style={{ color: '#a82f2f' }}>*</span>}
                      </label>
                      <select 
                        value={intakeForm.delegate_category}
                        onChange={(e) => setIntakeForm({ ...intakeForm, delegate_category: e.target.value })}
                        style={{ width: '100%', height: '38px', padding: '0 12px', borderRadius: '8px', border: '1px solid var(--fc-border)', background: 'var(--fc-surface)', color: 'var(--fc-text-main)', fontSize: '0.86rem', boxSizing: 'border-box' }}
                      >
                        {categories.map(c => (
                          <option key={c.id} value={c.code}>{c.name} ({c.badge_ribbon_text || c.code})</option>
                        ))}
                        {categories.length === 0 && (
                          <option value="bangalore_general">Bangalore Attendee (AUDIENCE PASS)</option>
                        )}
                      </select>
                    </div>
                  )}

                  {/* Community Affiliation & Mumbai Attendance */}
                  {(isEnabled('community_identity') || isEnabled('attended_mumbai')) && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '12px', marginBottom: '14px' }}>
                      {isEnabled('community_identity') && (
                        <div>
                          <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--fc-text-secondary)', marginBottom: '4px' }}>
                            {commField?.label || 'I Am:'}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                            {(commField?.options && commField.options.length > 0 ? commField.options : ['A Proud LGBTQ+ person', 'An Ally', 'Still figuring out']).map((item) => (
                              <label key={item} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.76rem', color: 'var(--fc-text-main)', cursor: 'pointer' }}>
                                <input 
                                  type="radio" 
                                  name="intake_community" 
                                  checked={intakeForm.community_identity === item} 
                                  onChange={() => setIntakeForm({ ...intakeForm, community_identity: item })} 
                                  style={{ accentColor: '#a82f2f', cursor: 'pointer' }}
                                />
                                <span>{item}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}

                      {isEnabled('attended_mumbai') && (
                        <div>
                          <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--fc-text-secondary)', marginBottom: '4px' }}>
                            {mumbaiField?.label || 'Attended in Mumbai?'}
                          </div>
                          <div style={{ display: 'flex', gap: '10px' }}>
                            {(mumbaiField?.options && mumbaiField.options.length > 0 ? mumbaiField.options : ['Yes', 'No']).map((ans) => (
                              <label key={ans} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.78rem', color: 'var(--fc-text-main)', cursor: 'pointer' }}>
                                <input 
                                  type="radio" 
                                  name="intake_mumbai" 
                                  checked={intakeForm.attended_mumbai === ans} 
                                  onChange={() => setIntakeForm({ ...intakeForm, attended_mumbai: ans })} 
                                  style={{ accentColor: '#a82f2f', cursor: 'pointer' }}
                                />
                                <span>{ans}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Custom Questions */}
                  {customOrOtherFields.length > 0 && (
                    <div style={{ background: 'var(--fc-surface-subtle)', border: '1px solid var(--fc-border)', borderRadius: '8px', padding: '12px', marginBottom: '14px' }}>
                      <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#a82f2f', marginBottom: '8px' }}>
                        ADDITIONAL QUESTIONS:
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {customOrOtherFields.map(field => (
                          <div key={field.key || field.id}>
                            <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: 'var(--fc-text-secondary)', marginBottom: '2px' }}>
                              {field.label} {field.required && <span style={{ color: '#a82f2f' }}>*</span>}
                            </label>
                            {field.type === 'select' ? (
                              <select
                                value={intakeForm.custom_data?.[field.key] || ''}
                                onChange={(e) => handleCustomFieldChange(field.key, e.target.value)}
                                style={{ width: '100%', height: '34px', padding: '0 8px', borderRadius: '6px', border: '1px solid var(--fc-border)', background: 'var(--fc-surface)', color: 'var(--fc-text-main)', fontSize: '0.8rem' }}
                              >
                                <option value="">Select option...</option>
                                {(field.options || []).map(opt => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                              </select>
                            ) : field.type === 'textarea' ? (
                              <textarea
                                rows={2}
                                placeholder={field.placeholder || ''}
                                value={intakeForm.custom_data?.[field.key] || ''}
                                onChange={(e) => handleCustomFieldChange(field.key, e.target.value)}
                                style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--fc-border)', background: 'var(--fc-surface)', color: 'var(--fc-text-main)', fontSize: '0.8rem' }}
                              />
                            ) : (
                              <input
                                type={field.type === 'number' ? 'number' : 'text'}
                                placeholder={field.placeholder || ''}
                                value={intakeForm.custom_data?.[field.key] || ''}
                                onChange={(e) => handleCustomFieldChange(field.key, e.target.value)}
                                style={{ width: '100%', height: '34px', padding: '0 8px', borderRadius: '6px', border: '1px solid var(--fc-border)', background: 'var(--fc-surface)', color: 'var(--fc-text-main)', fontSize: '0.8rem' }}
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Verification & Signature */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '14px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: 'var(--fc-text-secondary)', marginBottom: '2px' }}>
                        Digital Signature
                      </label>
                      <input 
                        type="text" 
                        placeholder="Full Name"
                        value={intakeForm.signature_name}
                        onChange={(e) => setIntakeForm({ ...intakeForm, signature_name: e.target.value })}
                        style={{ width: '100%', height: '34px', padding: '0 8px', borderRadius: '6px', border: '1px solid var(--fc-border)', background: 'var(--fc-surface)', fontSize: '0.8rem' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: 'var(--fc-text-secondary)', marginBottom: '2px' }}>
                        Place
                      </label>
                      <input 
                        type="text" 
                        value={intakeForm.place}
                        onChange={(e) => setIntakeForm({ ...intakeForm, place: e.target.value })}
                        style={{ width: '100%', height: '34px', padding: '0 8px', borderRadius: '6px', border: '1px solid var(--fc-border)', background: 'var(--fc-surface)', fontSize: '0.8rem' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: 'var(--fc-text-secondary)', marginBottom: '2px' }}>
                        Date
                      </label>
                      <input 
                        type="text" 
                        disabled
                        value={intakeForm.registration_date}
                        style={{ width: '100%', height: '34px', padding: '0 8px', borderRadius: '6px', border: '1px solid var(--fc-border)', background: 'var(--fc-surface-subtle)', color: 'var(--fc-text-muted)', fontSize: '0.8rem' }}
                      />
                    </div>
                  </div>

                  {/* Consents & Age Certification */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '18px', fontSize: '0.78rem' }}>
                    {isEnabled('certified_18_plus') && (
                      <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer', fontWeight: 600, color: 'var(--fc-text-main)' }}>
                        <input 
                          type="checkbox"
                          checked={intakeForm.certified_18_plus}
                          onChange={(e) => setIntakeForm({ ...intakeForm, certified_18_plus: e.target.checked })}
                          style={{ accentColor: '#a82f2f', marginTop: '2px' }}
                        />
                        <span>
                          {certifyField?.label || 'I certify that I am 18 years of age or older and that the information provided above is true and correct.'}
                          {(certifyField?.required !== false) && <span style={{ color: '#a82f2f', marginLeft: '3px' }}>*</span>}
                        </span>
                      </label>
                    )}

                    {isEnabled('receive_updates') && (
                      <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer', color: 'var(--fc-text-secondary)' }}>
                        <input 
                          type="checkbox"
                          checked={intakeForm.receive_updates}
                          onChange={(e) => setIntakeForm({ ...intakeForm, receive_updates: e.target.checked })}
                          style={{ accentColor: '#a82f2f', marginTop: '2px' }}
                        />
                        <span>{updatesField?.label || 'I would like to receive updates about future KASHISH events and festival announcements'}</span>
                      </label>
                    )}

                    {isEnabled('appear_in_attendee_list') && (
                      <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer', color: 'var(--fc-text-secondary)' }}>
                        <input 
                          type="checkbox"
                          checked={intakeForm.appear_in_attendee_list}
                          onChange={(e) => setIntakeForm({ ...intakeForm, appear_in_attendee_list: e.target.checked })}
                          style={{ accentColor: '#a82f2f', marginTop: '2px' }}
                        />
                        <span>{directoryField?.label || 'I agree to appear in the registered festival delegate directory'}</span>
                      </label>
                    )}
                  </div>

                  {/* Modal CTA Buttons */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button
                      type="button"
                      onClick={() => setShowAddModal(false)}
                      style={{
                        padding: '10px 20px',
                        borderRadius: '24px',
                        border: '1px solid var(--fc-border)',
                        background: 'var(--fc-surface)',
                        color: 'var(--fc-text-secondary)',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      style={{
                        padding: '10px 28px',
                        borderRadius: '24px',
                        border: 'none',
                        background: '#a82f2f',
                        color: '#ffffff',
                        fontWeight: 700,
                        fontSize: '0.9rem',
                        cursor: submitting ? 'not-allowed' : 'pointer',
                        boxShadow: '0 4px 14px rgba(168, 47, 47, 0.35)'
                      }}
                    >
                      {submitting ? 'Registering & Generating Pass...' : 'Register & Generate Badge Pass'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
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
              <button onClick={() => setShowFaqModal(false)} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: 'var(--fc-text-muted)' }}>✕</button>
            </div>
            <div style={{ padding: '20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {(formSchema?.policy_info?.faqs || DEFAULT_FAQS).map((faq, idx) => (
                <div key={idx} style={{ background: 'var(--fc-surface)', border: '1px solid var(--fc-border)', borderRadius: '8px', padding: '12px 14px' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#a82f2f', marginBottom: '4px' }}>
                    Q: {faq.question}
                  </div>
                  <div 
                    dangerouslySetInnerHTML={{ __html: faq.answer }} 
                    style={{ fontSize: '0.82rem', color: 'var(--fc-text-secondary)', lineHeight: 1.5 }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: BADGE PASS PREVIEW ───────────────────────────────────────── */}
      {badgeModal && (() => {
        const customData = typeof badgeModal.custom_data === 'string'
          ? (() => { try { return JSON.parse(badgeModal.custom_data); } catch(e) { return {}; } })()
          : (badgeModal.custom_data || {});

        const serialNo = badgeModal.serial_no || customData.serial_no || ('KB26-' + String(badgeModal.attendee_id).padStart(4, '0'));
        const passDaysList = Array.isArray(badgeModal.pass_days) 
          ? badgeModal.pass_days 
          : (customData.pass_days 
              ? (Array.isArray(customData.pass_days) ? customData.pass_days : [customData.pass_days])
              : ['Nov 20–22, 2026 (All Festival Days)']);
        const validDaysStr = passDaysList.length > 0 ? passDaysList.join(', ') : 'Nov 20–22, 2026';
        
        const badgeRibbonText = badgeModal.badge_ribbon || customData.badge_ribbon || 'AUDIENCE PASS';
        const badgeColor = badgeModal.badge_color || customData.badge_color || '#4f46e5';
        const delegateCategoryName = customData.delegate_category || badgeModal.delegate_category_name || badgeModal.delegate_category || 'Bangalore Attendee';
        const passTypeStr = badgeModal.pass_type || customData.pass_type || 'Full-Festival Pass';

        const isIssued = Boolean(badgeModal.qr_token || badgeModal.status === 'badge_issued');
        const regDate = badgeModal.registered_at 
          ? new Date(badgeModal.registered_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
          : (customData.registration_date || '28 Oct 2026');
        const screeningsCount = badgeModal.screenings_attended || 0;

        const handlePrintPass = () => {
          const cardEl = document.getElementById('printable-delegate-pass');
          if (!cardEl) {
            window.print();
            return;
          }

          const clone = cardEl.cloneNode(true);
          // Strip out interactive buttons and close icon
          clone.querySelectorAll('.no-print').forEach(el => el.remove());

          const iframe = document.createElement('iframe');
          iframe.style.position = 'fixed';
          iframe.style.right = '0';
          iframe.style.bottom = '0';
          iframe.style.width = '0';
          iframe.style.height = '0';
          iframe.style.border = '0';
          iframe.style.opacity = '0';
          iframe.style.pointerEvents = 'none';
          document.body.appendChild(iframe);

          const doc = iframe.contentWindow.document;
          doc.open();
          doc.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Accreditation Pass - ${badgeModal?.name || 'Kashish'}</title>
  <style>
    @page {
      size: auto;
      margin: 10mm;
    }
    :root {
      --fc-surface-card: #ffffff;
      --fc-surface: #f8fafc;
      --fc-surface-subtle: #f8fafc;
      --fc-text-main: #0f172a;
      --fc-text-secondary: #475569;
      --fc-text-muted: #64748b;
      --fc-border: #e2e8f0;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      margin: 0;
      padding: 24px;
      background: #ffffff;
      color: #0f172a;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      display: flex;
      justify-content: center;
    }
    .print-pass-container {
      width: 100%;
      max-width: 480px;
      margin: 0 auto;
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 14px;
      padding: 22px;
      box-shadow: none;
    }
    .no-print {
      display: none !important;
    }
  </style>
</head>
<body>
  <div class="print-pass-container">
    ${clone.innerHTML}
  </div>
</body>
</html>`);
          doc.close();

          setTimeout(() => {
            try {
              iframe.contentWindow.focus();
              iframe.contentWindow.print();
            } catch (err) {
              console.error('Print iframe error:', err);
            } finally {
              setTimeout(() => {
                if (iframe && iframe.parentNode) {
                  iframe.parentNode.removeChild(iframe);
                }
              }, 3000);
            }
          }, 250);
        };

        return (
          <div className="fc-print-modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999, padding: '16px', overflowY: 'auto' }}>
            <div id="printable-delegate-pass" className="fc-printable-pass" style={{ background: 'var(--fc-surface-card)', color: 'var(--fc-text-main)', border: '1px solid var(--fc-border)', borderRadius: '16px', maxWidth: '520px', width: '100%', padding: '24px', boxShadow: 'var(--shadow-xl)', position: 'relative' }}>
              
              {/* Close Button */}
              <button 
                type="button"
                className="no-print"
                onClick={() => setBadgeModal(null)}
                style={{ position: 'absolute', right: '16px', top: '16px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--fc-text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '6px', borderRadius: '50%' }}
                title="Close"
              >
                <CloseIcon size={18} />
              </button>

              {/* Modal Administrative Header */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', paddingRight: '36px', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--fc-text-main)', letterSpacing: '-0.02em' }}>
                    Attendee Accreditation &amp; Pass
                  </h3>
                  <p style={{ margin: '3px 0 0 0', fontSize: '0.8rem', color: 'var(--fc-text-muted)' }}>
                    Festival reception desk &amp; onsite credential record
                  </p>
                </div>
                <div>
                  {isIssued ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: 'rgba(22, 163, 74, 0.1)', color: '#16a34a', border: '1px solid rgba(22, 163, 74, 0.25)', padding: '4px 10px', borderRadius: '12px', fontSize: '0.74rem', fontWeight: 700 }}>
                      <CheckCircleIcon size={13} /> Active Gate Credential
                    </span>
                  ) : (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: 'rgba(245, 158, 11, 0.1)', color: '#b45309', border: '1px solid rgba(245, 158, 11, 0.28)', padding: '4px 10px', borderRadius: '12px', fontSize: '0.74rem', fontWeight: 700 }}>
                      <ConfirmationNumberIcon size={13} /> Pending ID Check
                    </span>
                  )}
                </div>
              </div>

              {/* Pass Card Container */}
              <div style={{ border: '1px solid var(--fc-border)', borderRadius: '12px', overflow: 'hidden', background: 'var(--fc-surface)', marginBottom: '16px' }}>
                
                {/* Official Pass Header Ribbon */}
                <div style={{ background: '#701a1e', padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ background: badgeColor, color: '#ffffff', fontWeight: 800, fontSize: '0.7rem', padding: '2px 8px', borderRadius: '4px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                      {badgeRibbonText}
                    </span>
                    <span style={{ color: 'rgba(255, 255, 255, 0.95)', fontWeight: 700, fontSize: '0.78rem', letterSpacing: '0.03em', textTransform: 'uppercase' }}>
                      KASHISH x BENGALURU 2026
                    </span>
                  </div>
                  <span style={{ background: 'rgba(0, 0, 0, 0.28)', border: '1px solid rgba(255, 255, 255, 0.3)', color: '#ffffff', fontWeight: 800, fontSize: '0.76rem', padding: '2px 10px', borderRadius: '6px', fontFamily: 'monospace', letterSpacing: '0.05em' }}>
                    {serialNo}
                  </span>
                </div>

                {/* Attendee Name Header */}
                <div style={{ padding: '16px 16px 12px 16px', borderBottom: '1px solid var(--fc-border)', background: 'var(--fc-surface-card)' }}>
                  <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--fc-text-muted)', marginBottom: '3px' }}>
                    Pass Holder
                  </div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--fc-text-main)', letterSpacing: '-0.01em', lineHeight: 1.2 }}>
                    {badgeModal.name}
                  </div>
                </div>

                {/* Structured Accreditation Details Grid */}
                <div style={{ padding: '14px 16px', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px 16px', fontSize: '0.8rem' }}>
                  <div>
                    <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--fc-text-muted)', marginBottom: '2px' }}>
                      Category &amp; Pass
                    </div>
                    <div style={{ fontWeight: 700, color: '#701a1e' }}>
                      {delegateCategoryName} • {passTypeStr}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--fc-text-muted)', marginBottom: '2px' }}>
                      Valid Dates
                    </div>
                    <div style={{ fontWeight: 700, color: 'var(--fc-text-main)' }}>
                      {validDaysStr}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--fc-text-muted)', marginBottom: '2px' }}>
                      Email Address
                    </div>
                    <div style={{ color: 'var(--fc-text-main)', wordBreak: 'break-all' }}>
                      {badgeModal.email || '—'}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--fc-text-muted)', marginBottom: '2px' }}>
                      Mobile / WhatsApp
                    </div>
                    <div style={{ color: 'var(--fc-text-main)' }}>
                      {badgeModal.phone || '—'}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--fc-text-muted)', marginBottom: '2px' }}>
                      Registration Record
                    </div>
                    <div style={{ color: 'var(--fc-text-secondary)' }}>
                      {regDate} • Online
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--fc-text-muted)', marginBottom: '2px' }}>
                      Screenings Attended
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 700, color: 'var(--fc-text-main)' }}>
                      <MovieIcon size={13} style={{ color: '#701a1e' }} />
                      <span>{screeningsCount} screenings logged</span>
                    </div>
                  </div>

                  {/* Optional Custom Demographic/Intake Details */}
                  {customData.dob && (
                    <div>
                      <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--fc-text-muted)', marginBottom: '2px' }}>
                        Date of Birth / Verification
                      </div>
                      <div style={{ color: 'var(--fc-text-main)' }}>
                        {customData.dob} (18+ Verified)
                      </div>
                    </div>
                  )}

                  {customData.gender_identity && (
                    <div>
                      <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--fc-text-muted)', marginBottom: '2px' }}>
                        Gender Identity
                      </div>
                      <div style={{ color: 'var(--fc-text-main)' }}>
                        {customData.gender_identity}
                      </div>
                    </div>
                  )}

                  {customData.community_identity && (
                    <div style={{ gridColumn: 'span 2' }}>
                      <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--fc-text-muted)', marginBottom: '2px' }}>
                        Community Affiliation
                      </div>
                      <div style={{ color: 'var(--fc-text-main)' }}>
                        {customData.community_identity}
                      </div>
                    </div>
                  )}
                </div>

                {/* QR Code Section: Live QR if Issued, or Reception Issue Action if Pending */}
                {badgeModal.qr_token ? (
                  <div style={{ margin: '0 14px 14px 14px', padding: '14px', background: 'var(--fc-surface-card)', border: '1px solid var(--fc-border)', borderRadius: '10px', textAlign: 'center' }}>
                    <div style={{ display: 'inline-block', background: '#ffffff', padding: '10px', borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: 'var(--shadow-sm)', marginBottom: '8px' }}>
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(badgeModal.qr_token)}`}
                        alt={`QR Badge ${serialNo}`}
                        style={{ width: '140px', height: '140px', display: 'block' }}
                      />
                    </div>
                    <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
                      <CheckCircleIcon size={15} /> Active Verified Gate Credential
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--fc-text-muted)', marginTop: '3px', fontFamily: 'monospace' }}>
                      Token: {badgeModal.qr_token}
                    </div>
                  </div>
                ) : (
                  <div style={{ margin: '0 14px 14px 14px', padding: '14px', background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.28)', borderRadius: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                      <ConfirmationNumberIcon size={16} style={{ color: '#d97706' }} />
                      <span style={{ fontWeight: 800, fontSize: '0.82rem', color: '#b45309' }}>
                        Physical QR Badge Not Yet Issued
                      </span>
                    </div>
                    <div style={{ fontSize: '0.76rem', color: 'var(--fc-text-secondary)', lineHeight: 1.45, marginBottom: '12px' }}>
                      Verify attendee government photo ID (18+) at the NGMA reception desk, then click below to generate and issue their entrance QR badge.
                    </div>
                    <button
                      type="button"
                      className="no-print"
                      onClick={() => handleIssueQrBadge(badgeModal)}
                      disabled={issuingId === badgeModal.attendee_id}
                      style={{
                        width: '100%',
                        padding: '11px 16px',
                        background: '#16a34a',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '8px',
                        fontWeight: 700,
                        fontSize: '0.88rem',
                        cursor: issuingId === badgeModal.attendee_id ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        boxShadow: 'var(--shadow-sm)'
                      }}
                    >
                      <QrCodeScannerIcon size={16} />
                      <span>{issuingId === badgeModal.attendee_id ? 'Issuing QR Badge...' : '✓ Verify ID & Issue Gate QR Badge'}</span>
                    </button>
                  </div>
                )}

                {/* Venue Pickup Info (Compact single-line operational info) */}
                <div style={{ margin: '0 14px 14px 14px', padding: '8px 12px', background: 'var(--fc-surface-subtle)', border: '1px solid var(--fc-border)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px', fontSize: '0.74rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--fc-text-secondary)' }}>
                    <PlaceIcon size={14} style={{ color: '#701a1e' }} />
                    <strong style={{ color: 'var(--fc-text-main)' }}>NGMA, Bengaluru</strong>
                    <span>• Entrance Gate Desk 2</span>
                  </div>
                  <div style={{ color: 'var(--fc-text-muted)' }}>
                    Nov 20–22, 2026 • 10:15 AM to 6:00 PM
                  </div>
                </div>

              </div>

              {/* Actions */}
              <div className="no-print" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <button 
                  type="button"
                  onClick={handlePrintPass}
                  style={{ flex: 1, padding: '10px 18px', background: 'var(--fc-surface)', color: 'var(--fc-text-main)', border: '1px solid var(--fc-border)', borderRadius: '8px', fontWeight: 700, fontSize: '0.86rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                >
                  <PrintIcon size={16} /> Print / Save Confirmation
                </button>
                {badgeModal.qr_token && (
                  <button
                    type="button"
                    onClick={() => handleRevokeQrBadge(badgeModal)}
                    disabled={issuingId === badgeModal.attendee_id}
                    style={{ padding: '10px 14px', background: 'transparent', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer' }}
                    title="Revoke QR credential if physical pass was lost"
                  >
                    Revoke QR
                  </button>
                )}
                <button 
                  type="button"
                  onClick={() => setBadgeModal(null)}
                  style={{ padding: '10px 24px', border: 'none', background: '#701a1e', color: '#fff', borderRadius: '8px', fontWeight: 700, fontSize: '0.86rem', cursor: 'pointer' }}
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── MODAL: CSV BULK IMPORTER ────────────────────────────────────────── */}
      {showImportModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
          <div style={{ background: 'var(--fc-surface-card)', color: 'var(--fc-text-main)', border: '1px solid var(--fc-border)', borderRadius: '16px', maxWidth: '540px', width: '90%', padding: '24px', boxShadow: 'var(--shadow-xl)' }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '1.25rem', fontWeight: 700, color: 'var(--fc-text-main)' }}>Import CSV / Data</h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '0.85rem', color: 'var(--fc-text-muted)' }}>
              Paste comma-separated delegate rows in the format: <code>Name, Email, Mobile, Category</code>
            </p>

            <form onSubmit={handleCsvImport}>
              <textarea 
                rows="8"
                required
                placeholder="Rohan Verma, rohan@example.com, +91 9876543210, delegate&#10;Priya Sharma, priya@example.com, +91 9123456780, vip"
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--fc-border)', background: 'var(--fc-surface)', color: 'var(--fc-text-main)', fontFamily: 'monospace', fontSize: '0.85rem', marginBottom: '16px' }}
              ></textarea>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button 
                  type="button" 
                  onClick={() => setShowImportModal(false)}
                  style={{ padding: '8px 16px', border: '1px solid var(--fc-border)', background: 'var(--fc-surface)', color: 'var(--fc-text-main)', borderRadius: '6px', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={importing}
                  style={{ padding: '8px 20px', background: '#a82f2f', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 700, cursor: 'pointer' }}
                >
                  {importing ? 'Importing...' : 'Start Ingestion'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
