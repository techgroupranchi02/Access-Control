/**
 * RegistrationPage Component (/registration)
 * 
 * Attendee Registration & Badge Pass Issuance:
 * - Intake form for Bangalore attendees & spot walk-ins
 * - Bulk CSV / Excel importer with live mapping for Kashish delegates
 * - Searchable attendee directory with category badges
 * - Printable PDF / Lanyard Pass preview (4"x6" standard format)
 */

import React, { useState, useEffect } from 'react';
import api from '../services/api';

export default function RegistrationPage() {
  const [attendees, setAttendees] = useState([]);
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedCat, setSelectedCat] = useState('');
  const [loading, setLoading] = useState(true);

  // New Attendee Intake State
  const [intakeForm, setIntakeForm] = useState({
    name: '',
    email: '',
    phone: '',
    delegate_category: 'bangalore_general',
    registration_type: 'online'
  });
  const [submitting, setSubmitting] = useState(false);

  // Badge Print Preview Modal
  const [badgeModal, setBadgeModal] = useState(null);

  // CSV Bulk Import Modal
  const [showImportModal, setShowImportModal] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [importing, setImporting] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [attRes, catRes] = await Promise.all([
        api.get('/registration/attendees', { params: { search, category: selectedCat } }),
        api.get('/audience/categories')
      ]);
      setAttendees(attRes.data.attendees || []);
      setCategories(catRes.data.categories || []);
    } catch (err) {
      console.error('Failed to load attendees:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedCat]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchData();
  };

  const handleIntakeSubmit = async (e) => {
    e.preventDefault();
    if (!intakeForm.name.trim()) return;

    try {
      setSubmitting(true);
      const res = await api.post('/registration/attendees', intakeForm);
      alert('Attendee registered successfully! Pass QR generated.');
      setBadgeModal(res.data.attendee);
      setIntakeForm({
        name: '',
        email: '',
        phone: '',
        delegate_category: 'bangalore_general',
        registration_type: 'online'
      });
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
      // Simple CSV parser
      const lines = csvText.trim().split('\n');
      const delegates = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        // Skip header if present
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
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to import CSV.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fc-registration-page" style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Page Header */}
      <div className="fc-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 className="fc-page-title" style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0, color: 'var(--fc-text-main)' }}>
            Attendee Registration & Badges
          </h1>
          <p className="fc-page-subtitle" style={{ color: 'var(--fc-text-muted)', marginTop: '4px', fontSize: '0.9rem' }}>
            Onboard Bangalore audience delegates, bulk import Kashish data, and print physical accreditation passes
          </p>
        </div>

        <button
          onClick={() => setShowImportModal(true)}
          style={{
            background: 'var(--fc-surface-card)',
            color: 'var(--fc-text-main)',
            border: '1px solid var(--fc-border)',
            padding: '10px 18px',
            borderRadius: '8px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: 'var(--shadow-sm)'
          }}
        >
          <span>📁 Import Kashish CSV / Data</span>
        </button>
      </div>

      {/* Main Layout: Registration Form + Attendee Roster */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 380px) 1fr', gap: '24px' }}>
        
        {/* Left: Registration Intake Form */}
        <div>
          <div className="fc-card" style={{ background: 'var(--fc-surface-card)', borderRadius: '12px', border: '1px solid var(--fc-border)', padding: '20px', boxShadow: 'var(--shadow-sm)' }}>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 16px 0', color: 'var(--fc-text-main)' }}>
              Bangalore Attendee Intake
            </h2>

            <form onSubmit={handleIntakeSubmit}>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--fc-text-main)', marginBottom: '4px' }}>
                  Full Name *
                </label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. Alex Fernandes"
                  value={intakeForm.name}
                  onChange={(e) => setIntakeForm({ ...intakeForm, name: e.target.value })}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--fc-border)', background: 'var(--fc-surface)', color: 'var(--fc-text-main)' }}
                />
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--fc-text-main)', marginBottom: '4px' }}>
                  Mobile Number
                </label>
                <input 
                  type="tel" 
                  placeholder="+91 98765 43210"
                  value={intakeForm.phone}
                  onChange={(e) => setIntakeForm({ ...intakeForm, phone: e.target.value })}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--fc-border)', background: 'var(--fc-surface)', color: 'var(--fc-text-main)' }}
                />
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--fc-text-main)', marginBottom: '4px' }}>
                  Email Address
                </label>
                <input 
                  type="email" 
                  placeholder="alex@example.com"
                  value={intakeForm.email}
                  onChange={(e) => setIntakeForm({ ...intakeForm, email: e.target.value })}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--fc-border)', background: 'var(--fc-surface)', color: 'var(--fc-text-main)' }}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--fc-text-main)', marginBottom: '4px' }}>
                  Delegate Category
                </label>
                <select 
                  value={intakeForm.delegate_category}
                  onChange={(e) => setIntakeForm({ ...intakeForm, delegate_category: e.target.value })}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--fc-border)', background: 'var(--fc-surface)', color: 'var(--fc-text-main)' }}
                >
                  {categories.map(c => (
                    <option key={c.id} value={c.code}>{c.name} ({c.badge_ribbon_text || c.code})</option>
                  ))}
                  {categories.length === 0 && (
                    <option value="bangalore_general">Bangalore Attendee</option>
                  )}
                </select>
              </div>

              <button 
                type="submit" 
                disabled={submitting}
                style={{
                  width: '100%',
                  padding: '12px',
                  background: 'linear-gradient(135deg, #e11d48 0%, #be123c 100%)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 700,
                  fontSize: '0.95rem',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(225, 29, 72, 0.25)'
                }}
              >
                {submitting ? 'Registering...' : 'Register & Generate Badge Pass'}
              </button>
            </form>
          </div>
        </div>

        {/* Right: Attendee Roster Table */}
        <div>
          <div className="fc-card" style={{ background: 'var(--fc-surface-card)', borderRadius: '12px', border: '1px solid var(--fc-border)', padding: '20px', boxShadow: 'var(--shadow-sm)' }}>
            
            {/* Filter & Search Bar */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
              <form onSubmit={handleSearchSubmit} style={{ flex: 1 }}>
                <input 
                  type="text" 
                  placeholder="Search by name, mobile, email, or badge #..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ width: '100%', padding: '8px 14px', borderRadius: '6px', border: '1px solid var(--fc-border)', background: 'var(--fc-surface)', color: 'var(--fc-text-main)' }}
                />
              </form>

              <select 
                value={selectedCat} 
                onChange={(e) => setSelectedCat(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--fc-border)', background: 'var(--fc-surface)', color: 'var(--fc-text-main)' }}
              >
                <option value="">All Categories</option>
                {categories.map(c => (
                  <option key={c.id} value={c.code}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* Table */}
            {loading ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>Loading delegates...</div>
            ) : attendees.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>
                No attendees found. Register new attendees using the intake form on the left.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--fc-surface)', borderBottom: '1px solid var(--fc-border)', textAlign: 'left', color: 'var(--fc-text-muted)' }}>
                      <th style={{ padding: '10px 12px' }}>Badge #</th>
                      <th style={{ padding: '10px 12px' }}>Delegate</th>
                      <th style={{ padding: '10px 12px' }}>Category</th>
                      <th style={{ padding: '10px 12px' }}>Contact</th>
                      <th style={{ padding: '10px 12px' }}>Screenings</th>
                      <th style={{ padding: '10px 12px' }}>Pass</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attendees.map((a) => (
                      <tr key={a.attendee_id} style={{ borderBottom: '1px solid var(--fc-border-subtle, var(--fc-border))' }}>
                        <td style={{ padding: '10px 12px', fontWeight: 700, color: '#3b82f6' }}>
                          #{a.attendee_id}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ fontWeight: 600, color: 'var(--fc-text-main)' }}>{a.name}</div>
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <span 
                            style={{ 
                              background: a.badge_color || '#6366f1', 
                              color: '#fff', 
                              fontSize: '0.7rem', 
                              fontWeight: 800, 
                              padding: '2px 8px', 
                              borderRadius: '4px',
                              letterSpacing: '0.05em'
                            }}
                          >
                            {a.badge_ribbon || a.delegate_category}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', color: 'var(--fc-text-secondary)' }}>
                          <div>{a.phone || '—'}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--fc-text-muted)' }}>{a.email}</div>
                        </td>
                        <td style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--fc-text-main)' }}>
                          🎬 {a.screenings_attended || 0}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <button
                            onClick={() => setBadgeModal(a)}
                            style={{ background: 'var(--fc-surface)', color: 'var(--fc-text-main)', border: '1px solid var(--fc-border)', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}
                          >
                            🪪 View Pass
                          </button>
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

      {/* ── MODAL: BADGE PASS PREVIEW ───────────────────────────────────────── */}
      {badgeModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
          <div style={{ background: 'var(--fc-surface-card)', color: 'var(--fc-text-main)', border: '1px solid var(--fc-border)', borderRadius: '16px', maxWidth: '380px', width: '90%', padding: '24px', textAlign: 'center', boxShadow: 'var(--shadow-xl)' }}>
            
            {/* Lanyard Punch Hole Indicator */}
            <div style={{ width: '40px', height: '10px', background: 'var(--fc-border)', borderRadius: '5px', margin: '0 auto 16px auto' }}></div>

            {/* Festival Header */}
            <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#e11d48', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              KASHISH PRIDE FILM FESTIVAL
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--fc-text-muted)', marginBottom: '16px' }}>Bangalore Edition · 2026</div>

            {/* Delegate Name */}
            <div style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--fc-text-main)', margin: '0 0 6px 0' }}>
              {badgeModal.name}
            </div>
            <div style={{ fontSize: '0.9rem', color: 'var(--fc-text-secondary)', marginBottom: '16px' }}>
              Badge #{badgeModal.attendee_id}
            </div>

            {/* QR Code Container */}
            <div style={{ background: '#ffffff', padding: '16px', borderRadius: '12px', display: 'inline-block', border: '1px solid var(--fc-border)', marginBottom: '16px' }}>
              <img 
                src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(badgeModal.qr_token || String(badgeModal.attendee_id))}`} 
                alt="Badge QR"
                style={{ width: '160px', height: '160px', display: 'block' }}
              />
            </div>

            {/* Category Ribbon */}
            <div style={{ marginBottom: '20px' }}>
              <div 
                style={{
                  background: badgeModal.badge_color || '#e11d48',
                  color: '#fff',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  fontWeight: 800,
                  fontSize: '0.95rem',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase'
                }}
              >
                {badgeModal.badge_ribbon || badgeModal.delegate_category || 'DELEGATE'}
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                onClick={() => window.print()}
                style={{ flex: 1, padding: '10px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}
              >
                🖨️ Print Pass
              </button>
              <button 
                onClick={() => setBadgeModal(null)}
                style={{ padding: '10px 16px', border: '1px solid var(--fc-border)', background: 'var(--fc-surface)', color: 'var(--fc-text-main)', borderRadius: '8px', cursor: 'pointer' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: CSV BULK IMPORTER ────────────────────────────────────────── */}
      {showImportModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
          <div style={{ background: 'var(--fc-surface-card)', color: 'var(--fc-text-main)', border: '1px solid var(--fc-border)', borderRadius: '16px', maxWidth: '540px', width: '90%', padding: '24px', boxShadow: 'var(--shadow-xl)' }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '1.25rem', fontWeight: 700, color: 'var(--fc-text-main)' }}>Import Kashish Delegates</h3>
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
                  style={{ padding: '8px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 700, cursor: 'pointer' }}
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
