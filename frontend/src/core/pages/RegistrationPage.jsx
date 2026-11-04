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
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../services/api';
import {
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
  QrCodeScannerIcon,
  EditIcon,
  FilterListIcon,
  FileDownloadIcon
} from '../components/common/Icons';
import AttendeeFilterDrawer from '../components/registration/AttendeeFilterDrawer';
import { useFestivalConfig } from '../hooks/useFestivalConfig';

import QrCode from '../components/common/QrCode';
// ── CSV export helpers ─────────────────────────────────────────────────────
// Neutralise spreadsheet formulas in user-entered text (=, @, or +/- followed by a non-number)
function csvCell(value) {
  let v = value === null || value === undefined ? '' : String(value);
  if (/^[=@\t\r]/.test(v) || /^[+-][^\d\s]/.test(v)) v = `'${v}`;
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function csvValue(value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.join('; ');
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return JSON.stringify(value);
  return value;
}

/** Compact icon-only row action; the label is shown as a tooltip and read by screen readers. */
function IconAction({ icon, label, onClick, tone }) {
  const isBrand = tone === 'brand';
  const restBorder = isBrand ? 'var(--fc-brand)' : 'var(--fc-border)';
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      style={{
        width: '32px',
        height: '32px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'transparent',
        color: isBrand ? 'var(--fc-brand-text)' : 'var(--fc-text-secondary)',
        border: `1px solid ${restBorder}`,
        borderRadius: '8px',
        cursor: 'pointer',
        padding: 0,
        transition: 'background 0.15s ease, border-color 0.15s ease, color 0.15s ease'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--fc-surface-hover)';
        e.currentTarget.style.borderColor = 'var(--fc-brand)';
        e.currentTarget.style.color = 'var(--fc-brand-text)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.borderColor = restBorder;
        e.currentTarget.style.color = isBrand ? 'var(--fc-brand-text)' : 'var(--fc-text-secondary)';
      }}
    >
      {icon}
    </button>
  );
}

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
    answer: '<ul><li><strong>18+ Only:</strong> Only individuals 18 years and above (as of November 19, 2026) are permitted to attend the festival.</li><li><strong>Mandatory Registration:</strong> Registration is compulsory to access any film screenings, ceremonies, or panel discussions.</li><li><strong>Badge Access:</strong> Admission into all NGMA festival halls is reserved exclusively for pre-registered delegates holding a verified Festival Pass.</li><li><strong>Photo ID:</strong> Please carry a valid photo ID / age proof document for physical verification at the registration counter.</li></ul>'
  },
  {
    question: 'How to Get Your Festival Pass: Online & Spot Registration',
    answer: '<p><strong>1. ONLINE REGISTRATION</strong><br/>Register conveniently online via <strong>Freecomers</strong> on this page before arriving at the venue.<br/>Please present your digital pass or Serial Number along with a valid age proof document at the counter when collecting your physical pass badge.</p><p><strong>2. SPOT REGISTRATION</strong><br/>For individuals unable to register online beforehand, on-site manual spot registration will be available at the NGMA venue desk:<br/>• NGMA Registration Desk: November 20 – 22 | 10:15 AM – 5:30 PM</p>'
  },
  {
    question: 'Collecting Your Festival Pass (Badge Pickup & Timing)',
    answer: '<p>Physical Festival Passes can be picked up exclusively from the registration desk at <strong>NGMA</strong> during the following operational hours:</p><p><strong>Badge Collection Hours:</strong> November 20 – 22 | 10:15 AM – 6:00 PM</p><p><em>* Please carry a valid age proof document to present at the counter.</em></p>'
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
    answer: '<p>For any ticketing assistance, pass queries, or accreditation support, write to us at <a href="mailto:support@freecomers.com" style="color: var(--fc-brand-text); text-decoration: underline;">support@freecomers.com</a> or approach the On-Site Helpdesk at NGMA Bengaluru.</p>'
  }
];

export default function RegistrationPage() {
  const { currentFestival } = useFestivalConfig();
  const navigate = useNavigate();
  const location = useLocation();

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
  const initialFilters = {
    status: 'all',
    category: 'all',
    passType: 'all',
    attendance: 'all',
    sortBy: 'newest'
  };
  const [filters, setFilters] = useState(initialFilters);
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  // Active filter count for badge indicator
  const activeFilterCount = React.useMemo(() => {
    let count = 0;
    if (filters.status && filters.status !== 'all') count++;
    if (filters.category && filters.category !== 'all') count++;
    if (filters.passType && filters.passType !== 'all') count++;
    if (filters.attendance && filters.attendance !== 'all') count++;
    if (filters.sortBy && filters.sortBy !== 'newest') count++;
    return count;
  }, [filters]);

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

  // Bulk QR Stock counter
  const [qrStockStats, setQrStockStats] = useState({ total: 0, unassigned: 0, assigned: 0 });

  const fetchQrStockStats = async () => {
    try {
      const res = await api.get('/registration/qr/pool', { params: { limit: 1 } });
      if (res.data?.stats) {
        setQrStockStats(res.data.stats);
      }
    } catch (e) { }
  };

  const handleIssueQrBadge = async (attendee) => {
    try {
      setIssuingId(attendee.attendee_id);
      const res = await api.post(`/registration/attendees/${attendee.attendee_id}/issue-qr`);
      const updated = res.data.attendee;

      // Update local attendees list
      setAttendees(prev => prev.map(a => a.attendee_id === attendee.attendee_id ? { ...a, ...updated, qr_token: res.data.qr_token, status: 'badge_issued' } : a));

      // Update modal if currently viewing this attendee
      if (badgeModal && badgeModal.attendee_id === attendee.attendee_id) {
        setBadgeModal(prev => ({ ...prev, ...updated, qr_token: res.data.qr_token, badge_serial: res.data.badge_serial, status: 'badge_issued' }));
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
      // (Previously a 4th, unused attendee request shifted every result by one: categories and the
      // form schema never loaded on this page.)
      const [attRes, catRes, formRes] = await Promise.all([
        api.get('/registration/attendees', { params: { search, category: selectedCat, limit: 5000 } }).catch(() => ({ data: { attendees: [] } })),
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
      fetchQrStockStats();
    } catch (err) {
      console.error('Failed to load registration data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setCurrentPage(1);
    fetchData();
  }, [search]);

const [successBanner, setSuccessBanner] = useState(null);

useEffect(() => {
  if (location.state?.newlyAddedAttendee) {
    setBadgeModal(location.state.newlyAddedAttendee);
    if (location.state?.successMessage) {
      setSuccessBanner(location.state.successMessage);
    }
    fetchData();
    window.history.replaceState({}, document.title);
  } else if (location.state?.updatedAttendee) {
    if (location.state?.successMessage) {
      setSuccessBanner(location.state.successMessage);
    }
    fetchData();
    window.history.replaceState({}, document.title);
  }
}, [location.state]);

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
// Tab & summary counts
const pendingArrivalCount = React.useMemo(() => {
  return attendees.filter(a => !a.qr_token && a.status !== 'badge_issued').length;
}, [attendees]);

const qrIssuedCount = React.useMemo(() => {
  return attendees.filter(a => Boolean(a.qr_token || a.status === 'badge_issued')).length;
}, [attendees]);

// Enhanced client-side filter for instantaneous 0ms feedback as user filters/searches
  const filteredAttendees = React.useMemo(() => {
    const q = (searchInput || search).trim().toLowerCase();

    const list = attendees.filter(att => {
      // 1. Status filter (Pending Arrival vs QR Issued)
      if (filters.status === 'pending') {
        if (att.qr_token || att.status === 'badge_issued') return false;
      } else if (filters.status === 'issued') {
        if (!att.qr_token && att.status !== 'badge_issued') return false;
      }

      // 2. Category filter
      if (filters.category && filters.category !== 'all') {
        const catCode = (att.delegate_category || '').toLowerCase();
        const catRibbon = (att.badge_ribbon || '').toLowerCase();
        const targetCat = filters.category.toLowerCase();
        if (catCode !== targetCat && catRibbon !== targetCat) return false;
      }

      // 3. Pass Type filter
      if (filters.passType && filters.passType !== 'all') {
        const pType = (att.pass_type || '').toLowerCase();
        if (!pType.includes(filters.passType.toLowerCase())) return false;
      }

      // 4. Gate / Venue attendance check-in filter
      if (filters.attendance === 'checked_in') {
        if ((Number(att.screenings_attended) || 0) <= 0) return false;
      } else if (filters.attendance === 'not_checked_in') {
        if ((Number(att.screenings_attended) || 0) > 0) return false;
      }

      // 5. Search query filter
      if (q) {
        const name = (att.name || '').toLowerCase();
        const email = (att.email || '').toLowerCase();
        const phone = (att.phone || '').toLowerCase();
        const serial = (att.serial_no || '').toLowerCase();
        const idStr = String(att.attendee_id || '');
        const ribbon = (att.badge_ribbon || '').toLowerCase();
        const passType = (att.pass_type || '').toLowerCase();
        const place = (att.custom_data?.place || '').toLowerCase();

        const matches =
          name.includes(q) ||
          email.includes(q) ||
          phone.includes(q) ||
          serial.includes(q) ||
          idStr === q ||
          ribbon.includes(q) ||
          passType.includes(q) ||
          place.includes(q);
        if (!matches) return false;
      }

      return true;
    });

    // Sorting
    return list.sort((a, b) => {
      if (filters.sortBy === 'oldest') {
        return a.attendee_id - b.attendee_id;
      } else if (filters.sortBy === 'name_asc') {
        return (a.name || '').localeCompare(b.name || '');
      } else if (filters.sortBy === 'serial_asc') {
        return (a.serial_no || '').localeCompare(b.serial_no || '', undefined, { numeric: true });
      } else {
        // Default newest first
        return b.attendee_id - a.attendee_id;
      }
    });
  }, [attendees, searchInput, search, filters]);

// Client-side pagination calculations (10 attendees per page)
const totalPages = Math.ceil(filteredAttendees.length / pageSize) || 1;
const validCurrentPage = Math.min(Math.max(currentPage, 1), totalPages);
const startIndex = (validCurrentPage - 1) * pageSize;
const endIndex = Math.min(startIndex + pageSize, filteredAttendees.length);
const paginatedAttendees = filteredAttendees.slice(startIndex, endIndex);

// ── CSV export: column definitions (core fields + this festival's registration form questions) ──
const exportColumns = React.useMemo(() => {
  const coreKeys = new Set(['name', 'email', 'phone', 'delegate_category', 'serial_no']);
  const core = [
    { key: 'serial_no', label: 'Delegate ID', get: a => a.serial_no || a.attendee_id },
    { key: 'name', label: 'Name', get: a => a.name },
    { key: 'email', label: 'Email', get: a => a.email },
    { key: 'phone', label: 'Phone', get: a => a.phone },
    { key: 'category', label: 'Category', get: a => a.badge_ribbon || a.delegate_category },
    { key: 'badge_status', label: 'Badge Status', get: a => (a.qr_token || a.status === 'badge_issued') ? 'QR Issued' : 'Pending Arrival' },
    { key: 'badge_serial', label: 'Badge No.', get: a => a.badge_serial || '' },
    { key: 'screenings_attended', label: 'Screenings Attended', get: a => Number(a.screenings_attended) || 0 },
    { key: 'registered_at', label: 'Registered At', get: a => (a.registered_at ? new Date(a.registered_at).toLocaleString('en-IN') : '') }
  ];
  const formCols = (formSchema?.fields || [])
    .filter(fld => fld && fld.key && !coreKeys.has(fld.key))
    .map(fld => ({
      key: `form:${fld.key}`,
      label: fld.label || fld.key,
      group: 'form',
      get: a => csvValue((a.custom_data || {})[fld.key] !== undefined ? a.custom_data[fld.key] : a[fld.key])
    }));
  return [...core, ...formCols];
}, [formSchema]);

const exportPrefKey = `fc_delegate_export_cols_${currentFestival?.id || 'default'}`;
const [showExportModal, setShowExportModal] = useState(false);
const [exportSelected, setExportSelected] = useState(() => new Set());

const openExportModal = () => {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(exportPrefKey) || 'null'); } catch { saved = null; }
  const valid = new Set(exportColumns.map(c => c.key));
  const initial = Array.isArray(saved) ? saved.filter(k => valid.has(k)) : [];
  setExportSelected(new Set(initial.length ? initial : exportColumns.map(c => c.key)));
  setShowExportModal(true);
};

const toggleExportColumn = (key) => {
  setExportSelected(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
};

// Download exactly what is listed (current tab, search and filters; all pages) with the chosen columns
const handleExportCsv = () => {
  const cols = exportColumns.filter(c => exportSelected.has(c.key));
  if (cols.length === 0) return;
  try { localStorage.setItem(exportPrefKey, JSON.stringify(cols.map(c => c.key))); } catch { /* storage unavailable */ }
  const header = cols.map(c => c.label);
  const rows = filteredAttendees.map(a => cols.map(c => c.get(a)));
  const csv = '﻿' + [header, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n');
  const slug = (currentFestival?.name || 'festival').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${slug}-delegates-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  setShowExportModal(false);
};


return (
  <div className="fc-registration-page">
    {/* ── Page Header ──────────────────────────────────────────────────────── */}
    <div className="fc-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '14px' }}>
      <div>
        <h1 className="fc-page-title" style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0, color: 'var(--fc-text-main)', letterSpacing: '-0.02em' }}>
          Registration & Passes
        </h1>
        <p className="fc-page-subtitle" style={{ color: 'var(--fc-text-muted)', marginTop: '4px', fontSize: '0.9rem' }}>
          Two-step delegate lifecycle: Online pre-registration &rarr; Venue registration ID verification &rarr; Physical QR badge issuance
        </p>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        {/* Primary CTA: + Add Attendee */}
        <button
          onClick={() => navigate('/registration/add')}
          style={{
            background: 'var(--fc-brand)',
            color: '#ffffff',
            border: 'none',
            padding: '10px 18px',
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
          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--fc-brand-hover)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'var(--fc-brand)'}
        >
          <AddIcon size={18} />
          <span>Add Attendee</span>
        </button>

        {/* Bulk QR stock (Assign QR now lives under Registration → Assign QR tab) */}
        <button
          type="button"
          onClick={() => navigate('/registration/bulk-qr')}
          style={{
            background: 'var(--fc-surface-card)',
            color: 'var(--fc-text-main)',
            border: '1px solid var(--fc-border)',
            padding: '10px 16px',
            borderRadius: '8px',
            fontSize: '0.88rem',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: 'var(--shadow-sm)',
            transition: 'background 0.15s ease'
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--fc-surface-hover)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--fc-surface-card)'; }}
        >
          <ConfirmationNumberIcon size={16} />
          <span>Bulk QR Stock</span>
          <span style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--fc-text-muted)' }}>{qrStockStats.unassigned} in stock</span>
        </button>
      </div>
    </div>

    {/* ── Flash Notification Banner ───────────────────────────────────────── */}
    {successBanner && (
      <div style={{
        marginBottom: '16px',
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
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--fc-success-text)', fontSize: '1rem', padding: '0 4px' }}
        >
          <CloseIcon size={16} />
        </button>
      </div>
    )}


    {/* ── Full-Width Attendee Roster Table ─────────────────────────────────── */}
    <div className="fc-card" style={{ background: 'var(--fc-surface-card)', borderRadius: '14px', border: '1px solid var(--fc-border)', padding: '20px', boxShadow: 'var(--shadow-sm)' }}>

      {/* Scope Navigation Tabs (Submissions Hub Design: All Delegates, Pending Arrival, QR Issued) */}
      <div className="fc-scope-tabs-container" style={{ marginBottom: '18px', borderBottom: '1px solid var(--fc-border)' }}>
        <div className="scope-tabs-bar" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={filters.status === 'all'}
            className={`scope-tab-btn ${filters.status === 'all' ? 'active' : ''}`}
            onClick={() => {
              setFilters(prev => ({ ...prev, status: 'all' }));
              setCurrentPage(1);
            }}
          >
            All Delegates <span className="tab-badge">{attendees.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filters.status === 'pending'}
            className={`scope-tab-btn ${filters.status === 'pending' ? 'active' : ''}`}
            onClick={() => {
              setFilters(prev => ({ ...prev, status: 'pending' }));
              setCurrentPage(1);
            }}
          >
            Pending Arrival <span className="tab-badge">{pendingArrivalCount}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filters.status === 'issued'}
            className={`scope-tab-btn ${filters.status === 'issued' ? 'active' : ''}`}
            onClick={() => {
              setFilters(prev => ({ ...prev, status: 'issued' }));
              setCurrentPage(1);
            }}
          >
            QR Issued <span className="tab-badge">{qrIssuedCount}</span>
          </button>
        </div>
      </div>

      {/* Filter & Search Bar with Add CTA */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '14px', marginBottom: (search || activeFilterCount > 0) ? '12px' : '20px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '280px', maxWidth: '640px' }}>
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

            {/* Filter Trigger Button */}
            <button
              type="button"
              onClick={() => setFilterDrawerOpen(true)}
              style={{
                height: '40px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '7px',
                padding: '0 16px',
                borderRadius: '8px',
                border: '1px solid',
                background: activeFilterCount > 0 ? 'rgba(168, 47, 47, 0.08)' : 'var(--fc-surface)',
                borderColor: activeFilterCount > 0 ? 'var(--fc-brand)' : 'var(--fc-border)',
                color: activeFilterCount > 0 ? 'var(--fc-brand-text)' : 'var(--fc-text-main)',
                fontWeight: 600,
                fontSize: '0.88rem',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap'
              }}
              title="Open advanced delegate filters"
            >
              <FilterListIcon size={16} />
              <span>Filters</span>
              {activeFilterCount > 0 && (
                <span
                  style={{
                    background: 'var(--fc-brand)',
                    color: '#ffffff',
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '1px 6px',
                    borderRadius: '999px',
                    lineHeight: 1.2
                  }}
                >
                  {activeFilterCount}
                </span>
              )}
            </button>

            {/* Export the delegates currently listed (tab + search + filters, all pages) */}
            <button
              type="button"
              onClick={openExportModal}
              disabled={filteredAttendees.length === 0}
              title={`Download ${filteredAttendees.length} delegate${filteredAttendees.length === 1 ? '' : 's'} as CSV`}
              style={{
                height: '40px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '7px',
                padding: '0 16px',
                borderRadius: '8px',
                border: '1px solid var(--fc-border)',
                background: 'var(--fc-surface)',
                color: 'var(--fc-text-main)',
                fontWeight: 600,
                fontSize: '0.88rem',
                cursor: filteredAttendees.length === 0 ? 'not-allowed' : 'pointer',
                opacity: filteredAttendees.length === 0 ? 0.55 : 1,
                transition: 'background 0.15s ease',
                whiteSpace: 'nowrap'
              }}
              onMouseEnter={(e) => { if (filteredAttendees.length) e.currentTarget.style.background = 'var(--fc-surface-hover)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--fc-surface)'; }}
            >
              <FileDownloadIcon size={16} />
              <span>Export CSV</span>
            </button>
          </div>

          <div style={{ fontSize: '0.85rem', color: 'var(--fc-text-muted)', fontWeight: 600 }}>
            Showing <strong>{filteredAttendees.length > 0 ? `${startIndex + 1}–${endIndex}` : 0}</strong> of <strong>{filteredAttendees.length}</strong> registered delegates
          </div>
        </div>

        {/* Active Filter & Search Match Badges */}
        {(search || activeFilterCount > 0) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '18px', fontSize: '12px' }}>
            <span style={{ color: 'var(--fc-text-muted)', fontWeight: 600 }}>Active filters:</span>
            {search && (
              <span
                style={{
                  fontSize: '11.5px',
                  fontWeight: 600,
                  color: 'var(--fc-brand-text)',
                  background: 'rgba(168, 47, 47, 0.08)',
                  border: '1px solid rgba(168, 47, 47, 0.25)',
                  padding: '3px 8px',
                  borderRadius: '6px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                Search: "{search}"
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
                    display: 'flex',
                    alignItems: 'center'
                  }}
                  title="Clear search filter"
                >
                  <CloseIcon size={11} />
                </button>
              </span>
            )}
            {filters.status !== 'all' && (
              <span
                style={{
                  fontSize: '11.5px',
                  fontWeight: 600,
                  color: 'var(--fc-text-main)',
                  background: 'var(--fc-surface-hover, var(--fc-surface-subtle))',
                  border: '1px solid var(--fc-border)',
                  padding: '3px 8px',
                  borderRadius: '6px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                Status: {filters.status === 'pending' ? 'Pending Arrival' : 'QR Issued'}
                <button
                  type="button"
                  onClick={() => {
                    setFilters(prev => ({ ...prev, status: 'all' }));
                    setCurrentPage(1);
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
                  title="Clear status filter"
                >
                  <CloseIcon size={11} />
                </button>
              </span>
            )}
            {filters.category !== 'all' && (
              <span
                style={{
                  fontSize: '11.5px',
                  fontWeight: 600,
                  color: 'var(--fc-text-main)',
                  background: 'var(--fc-surface-hover, var(--fc-surface-subtle))',
                  border: '1px solid var(--fc-border)',
                  padding: '3px 8px',
                  borderRadius: '6px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                Category: {categories.find(c => c.code === filters.category || c.name === filters.category)?.name || filters.category}
                <button
                  type="button"
                  onClick={() => {
                    setFilters(prev => ({ ...prev, category: 'all' }));
                    setCurrentPage(1);
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
                  title="Clear category filter"
                >
                  <CloseIcon size={11} />
                </button>
              </span>
            )}
            {filters.passType !== 'all' && (
              <span
                style={{
                  fontSize: '11.5px',
                  fontWeight: 600,
                  color: 'var(--fc-text-main)',
                  background: 'var(--fc-surface-hover, var(--fc-surface-subtle))',
                  border: '1px solid var(--fc-border)',
                  padding: '3px 8px',
                  borderRadius: '6px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                Pass: {filters.passType}
                <button
                  type="button"
                  onClick={() => {
                    setFilters(prev => ({ ...prev, passType: 'all' }));
                    setCurrentPage(1);
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
                  title="Clear pass type filter"
                >
                  <CloseIcon size={11} />
                </button>
              </span>
            )}
            {filters.attendance !== 'all' && (
              <span
                style={{
                  fontSize: '11.5px',
                  fontWeight: 600,
                  color: 'var(--fc-text-main)',
                  background: 'var(--fc-surface-hover, var(--fc-surface-subtle))',
                  border: '1px solid var(--fc-border)',
                  padding: '3px 8px',
                  borderRadius: '6px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                Entrance: {filters.attendance === 'checked_in' ? 'Checked In' : 'Not Checked In'}
                <button
                  type="button"
                  onClick={() => {
                    setFilters(prev => ({ ...prev, attendance: 'all' }));
                    setCurrentPage(1);
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
                  title="Clear entrance filter"
                >
                  <CloseIcon size={11} />
                </button>
              </span>
            )}
            {filters.sortBy !== 'newest' && (
              <span
                style={{
                  fontSize: '11.5px',
                  fontWeight: 600,
                  color: 'var(--fc-text-main)',
                  background: 'var(--fc-surface-hover, var(--fc-surface-subtle))',
                  border: '1px solid var(--fc-border)',
                  padding: '3px 8px',
                  borderRadius: '6px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                Sort: {filters.sortBy === 'oldest' ? 'Oldest First' : filters.sortBy === 'name_asc' ? 'Name A–Z' : 'Badge #'}
                <button
                  type="button"
                  onClick={() => {
                    setFilters(prev => ({ ...prev, sortBy: 'newest' }));
                    setCurrentPage(1);
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
                  title="Reset sort order"
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
                setFilters(initialFilters);
                setCurrentPage(1);
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
          <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--fc-text-muted)' }}>
            Loading delegate roster...
          </div>
        ) : filteredAttendees.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--fc-text-muted)' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>
              <ConfirmationNumberIcon size={44} style={{ color: 'var(--fc-text-muted)' }} />
            </div>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--fc-text-main)', marginBottom: '6px' }}>
              {search || activeFilterCount > 0 ? 'No delegates found' : 'No delegates registered yet'}
            </div>
            <p style={{ margin: '0 0 18px 0', fontSize: '0.88rem', color: 'var(--fc-text-secondary)' }}>
              {search || activeFilterCount > 0
                ? 'No delegate matched your current search or active filters. Try resetting filters.'
                : 'Onboard your first attendee using the dynamic registration form.'}
            </p>
            {search || activeFilterCount > 0 ? (
              <button
                type="button"
                onClick={() => {
                  setSearchInput('');
                  setSearch('');
                  setFilters(initialFilters);
                  setCurrentPage(1);
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
                onClick={() => navigate('/registration/add')}
                style={{
                  background: 'var(--fc-brand)',
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
                      <th style={{ padding: '12px 16px', fontWeight: 700 }}>Delegate</th>
                      <th style={{ padding: '12px 16px', fontWeight: 700 }}>Category Ribbon</th>
                      <th style={{ padding: '12px 16px', fontWeight: 700 }}>Venue Badge Status</th>
                      <th style={{ padding: '12px 16px', fontWeight: 700 }}>Contact Info</th>
                      <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedAttendees.map((a) => {
                      const isIssued = Boolean(a.qr_token || a.status === 'badge_issued');
                      return (
                        <tr key={a.attendee_id} style={{ borderBottom: '1px solid var(--fc-border-subtle, var(--fc-border))' }}>
                          <td style={{ padding: '14px 16px' }}>
                            <div style={{ fontWeight: 700, color: 'var(--fc-text-main)', fontSize: '0.92rem' }}>{a.name}</div>
                          </td>
                          <td style={{ padding: '14px 16px' }}>
                            <span
                              style={{
                                background: a.badge_color || 'var(--fc-brand)',
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
                            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: isIssued ? 'var(--fc-success-text)' : 'var(--fc-warning-text)' }}>
                              {isIssued ? 'QR Issued' : 'Pending Arrival'}
                            </span>
                          </td>
                          <td style={{ padding: '14px 16px', color: 'var(--fc-text-secondary)' }}>
                            <div style={{ fontWeight: 600 }}>{a.phone || '—'}</div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--fc-text-muted)' }}>{a.email || '—'}</div>
                          </td>
                          <td style={{ padding: '14px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                              <IconAction
                                icon={<EditIcon size={15} />}
                                label="Edit attendee"
                                onClick={() => navigate(`/registration/edit/${a.attendee_id}`)}
                              />
                              {!isIssued && (
                                <IconAction
                                  icon={<QrCodeScannerIcon size={15} />}
                                  label="Assign QR badge"
                                  tone="brand"
                                  onClick={() => navigate(`/registration/assign-qr/${a.attendee_id}`)}
                                />
                              )}
                              <IconAction
                                icon={isIssued ? <PrintIcon size={15} /> : <ConfirmationNumberIcon size={15} />}
                                label={isIssued ? 'Print badge' : 'View pass'}
                                onClick={() => setBadgeModal(a)}
                              />
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
                          border: isActive ? '1px solid var(--fc-brand)' : '1px solid var(--fc-border)',
                          background: isActive ? 'var(--fc-brand)' : 'var(--fc-surface)',
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
            ? (() => { try { return JSON.parse(badgeModal.custom_data); } catch (e) { return {}; } })()
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
                      Festival registration desk &amp; onsite credential record
                    </p>
                  </div>
                  <div>
                    {isIssued ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: 'rgba(22, 163, 74, 0.1)', color: 'var(--fc-success-text)', border: '1px solid rgba(22, 163, 74, 0.25)', padding: '4px 10px', borderRadius: '12px', fontSize: '0.74rem', fontWeight: 700 }}>
                        <CheckCircleIcon size={13} /> Active Gate Credential
                      </span>
                    ) : (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: 'rgba(245, 158, 11, 0.1)', color: 'var(--fc-warning-text)', border: '1px solid rgba(245, 158, 11, 0.28)', padding: '4px 10px', borderRadius: '12px', fontSize: '0.74rem', fontWeight: 700 }}>
                        <ConfirmationNumberIcon size={13} /> Pending ID Check
                      </span>
                    )}
                  </div>
                </div>

                {/* Pass Card Container */}
                <div style={{ border: '1px solid var(--fc-border)', borderRadius: '12px', overflow: 'hidden', background: 'var(--fc-surface)', marginBottom: '16px' }}>

                  {/* Official Pass Header Ribbon */}
                  <div style={{ background: 'var(--fc-brand-active)', padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
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
                      <div style={{ fontWeight: 700, color: 'var(--fc-brand-text)' }}>
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
                        <MovieIcon size={13} style={{ color: 'var(--fc-brand-text)' }} />
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

                  {/* QR Code Section: Live QR if Issued, or Registration Issue Action if Pending */}
                  {badgeModal.qr_token ? (
                    <div style={{ margin: '0 14px 14px 14px', padding: '14px', background: 'var(--fc-surface-card)', border: '1px solid var(--fc-border)', borderRadius: '10px', textAlign: 'center' }}>
                      <div style={{ display: 'inline-block', background: '#ffffff', padding: '10px', borderRadius: '10px', border: '1px solid var(--fc-border)', boxShadow: 'var(--shadow-sm)', marginBottom: '8px' }}>
                        <QrCode value={badgeModal.qr_token} size={140} />
                      </div>
                      <div style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--fc-success-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
                        <CheckCircleIcon size={15} /> Active Verified Gate Credential
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--fc-text-muted)', marginTop: '3px', fontFamily: 'monospace' }}>
                        {badgeModal.badge_serial
                          ? <>Badge No: <strong style={{ fontSize: '0.95rem', letterSpacing: '0.12em', color: 'var(--fc-text-main)' }}>{badgeModal.badge_serial}</strong></>
                          : <>Token: {badgeModal.qr_token}</>}
                      </div>
                    </div>
                  ) : (
                    <div style={{ margin: '0 14px 14px 14px', padding: '14px', background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.28)', borderRadius: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                        <ConfirmationNumberIcon size={16} style={{ color: 'var(--fc-warning-text)' }} />
                        <span style={{ fontWeight: 800, fontSize: '0.82rem', color: 'var(--fc-warning-text)' }}>
                          Physical QR Badge Not Yet Assigned
                        </span>
                      </div>
                      <div style={{ fontSize: '0.76rem', color: 'var(--fc-text-secondary)', lineHeight: 1.45, marginBottom: '12px' }}>
                        Verify attendee photo ID (18+) at the NGMA registration desk, then proceed to pair a pre-printed physical badge or issue a digital pass.
                      </div>
                      <button
                        type="button"
                        className="no-print"
                        onClick={() => {
                          const targetId = badgeModal.attendee_id;
                          setBadgeModal(null);
                          navigate(`/registration/assign-qr/${targetId}`);
                        }}
                        style={{
                          width: '100%',
                          padding: '11px 16px',
                          background: 'var(--fc-brand)',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '8px',
                          fontWeight: 700,
                          fontSize: '0.88rem',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
                          boxShadow: '0 3px 10px rgba(168, 47, 47, 0.3)',
                          transition: 'background 0.15s ease'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--fc-brand-hover)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'var(--fc-brand)'}
                      >
                        <QrCodeScannerIcon size={16} />
                        <span>Proceed to Assign QR Badge →</span>
                      </button>
                    </div>
                  )}

                  {/* Venue Pickup Info (Compact single-line operational info) */}
                  <div style={{ margin: '0 14px 14px 14px', padding: '8px 12px', background: 'var(--fc-surface-subtle)', border: '1px solid var(--fc-border)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px', fontSize: '0.74rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--fc-text-secondary)' }}>
                      <PlaceIcon size={14} style={{ color: 'var(--fc-brand-text)' }} />
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
                    onClick={() => {
                      const id = badgeModal.attendee_id;
                      setBadgeModal(null);
                      navigate(`/registration/edit/${id}`);
                    }}
                    style={{
                      padding: '10px 16px',
                      background: 'var(--fc-surface)',
                      color: 'var(--fc-text-main)',
                      border: '1px solid var(--fc-border)',
                      borderRadius: '8px',
                      fontWeight: 700,
                      fontSize: '0.86rem',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                    title="Edit attendee registration details"
                  >
                    <EditIcon size={14} /> Edit
                  </button>
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
                      style={{ padding: '10px 14px', background: 'transparent', color: 'var(--fc-danger-text)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer' }}
                      title="Revoke QR credential if physical pass was lost"
                    >
                      Revoke QR
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setBadgeModal(null)}
                    style={{ padding: '10px 24px', border: 'none', background: 'var(--fc-brand-active)', color: '#fff', borderRadius: '8px', fontWeight: 700, fontSize: '0.86rem', cursor: 'pointer' }}
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── MODAL: CSV EXPORT, CHOOSE COLUMNS ─────────────────────────────── */}
        {showExportModal && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="export-cols-title"
            onClick={(e) => { if (e.target === e.currentTarget) setShowExportModal(false); }}
            onKeyDown={(e) => { if (e.key === 'Escape') setShowExportModal(false); }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '16px' }}
          >
            <div style={{ background: 'var(--fc-surface-card)', color: 'var(--fc-text-main)', border: '1px solid var(--fc-border)', borderRadius: '14px', boxShadow: 'var(--shadow-xl)', width: '100%', maxWidth: '560px', maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>
              {/* Header */}
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--fc-border)', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 id="export-cols-title" style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Export CSV: choose columns</h3>
                  <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--fc-text-muted)' }}>
                    {filteredAttendees.length} delegate{filteredAttendees.length === 1 ? '' : 's'} from the current view (tab, search and filters).
                  </p>
                </div>
                <button type="button" onClick={() => setShowExportModal(false)} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fc-text-muted)', padding: '4px', display: 'inline-flex' }}>
                  <CloseIcon size={16} />
                </button>
              </div>

              {/* Select all / clear */}
              <div style={{ padding: '10px 20px', display: 'flex', alignItems: 'center', gap: '14px', borderBottom: '1px solid var(--fc-border)', fontSize: '0.8rem' }}>
                <span style={{ color: 'var(--fc-text-secondary)', fontWeight: 600 }}>{exportSelected.size} of {exportColumns.length} selected</span>
                <span style={{ flex: 1 }} />
                <button type="button" onClick={() => setExportSelected(new Set(exportColumns.map(c => c.key)))} style={{ background: 'none', border: 'none', color: 'var(--fc-brand-text)', fontWeight: 700, cursor: 'pointer', padding: 0 }}>Select all</button>
                <button type="button" onClick={() => setExportSelected(new Set())} style={{ background: 'none', border: 'none', color: 'var(--fc-text-secondary)', fontWeight: 700, cursor: 'pointer', padding: 0 }}>Clear all</button>
              </div>

              {/* Column list */}
              <div style={{ padding: '12px 20px', overflowY: 'auto', flex: 1 }}>
                {[
                  { title: 'Delegate details', cols: exportColumns.filter(c => c.group !== 'form') },
                  { title: 'Registration form answers', cols: exportColumns.filter(c => c.group === 'form') }
                ].filter(g => g.cols.length > 0).map(g => (
                  <div key={g.title} style={{ marginBottom: '14px' }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--fc-text-muted)', marginBottom: '6px' }}>{g.title}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '4px 12px' }}>
                      {g.cols.map(c => (
                        <label key={c.key} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '6px 4px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--fc-text-main)' }}>
                          <input
                            type="checkbox"
                            checked={exportSelected.has(c.key)}
                            onChange={() => toggleExportColumn(c.key)}
                            style={{ marginTop: '2px', accentColor: 'var(--fc-brand)', flexShrink: 0 }}
                          />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }} title={c.label}>{c.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Footer */}
              <div style={{ padding: '12px 20px', borderTop: '1px solid var(--fc-border)', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" onClick={() => setShowExportModal(false)} style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--fc-border)', background: 'var(--fc-surface-card)', color: 'var(--fc-text-main)', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleExportCsv}
                  disabled={exportSelected.size === 0 || filteredAttendees.length === 0}
                  style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--fc-brand)', background: 'var(--fc-brand)', color: 'var(--fc-text-on-brand)', fontWeight: 700, fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: exportSelected.size === 0 ? 'not-allowed' : 'pointer', opacity: exportSelected.size === 0 || filteredAttendees.length === 0 ? 0.55 : 1 }}
                >
                  <FileDownloadIcon size={15} />
                  Download CSV
                </button>
              </div>
            </div>
          </div>
        )}

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
                    style={{ padding: '8px 20px', background: 'var(--fc-brand)', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 700, cursor: 'pointer' }}
                  >
                    {importing ? 'Importing...' : 'Start Ingestion'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── Advanced Delegate Filter Drawer ─────────────────────────── */}
        <AttendeeFilterDrawer
          isOpen={filterDrawerOpen}
          onClose={() => setFilterDrawerOpen(false)}
          filters={filters}
          onChangeFilter={(key, val) => {
            setFilters(prev => ({ ...prev, [key]: val }));
            setCurrentPage(1);
          }}
          onResetFilters={() => {
            setFilters(initialFilters);
            setCurrentPage(1);
          }}
          onApplyFilters={() => {
            setCurrentPage(1);
          }}
          categories={categories}
          attendees={attendees}
          activeFilterCount={activeFilterCount}
        />

      </div>
      );
}
