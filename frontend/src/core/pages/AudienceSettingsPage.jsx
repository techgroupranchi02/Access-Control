/**
 * AudienceSettingsPage Component (/audience)
 * 
 * Audience Settings, Delegate Category Manager & Venue Directory:
 * - Delegate category creation with custom color swatches and ribbon badges
 * - Category quotas and voting eligibility configuration
 * - Physical venue & screening hall directory with capacities
 * - Global voting rules & Option 3 screening check-in verification enforcement
 */

import React, { useState, useEffect } from 'react';
import api from '../services/api';

export default function AudienceSettingsPage() {
  const [categories, setCategories] = useState([]);
  const [venues, setVenues] = useState([]);
  const [settings, setSettings] = useState({
    voting_window_minutes: 30,
    minimum_quorum_threshold: 25,
    require_screening_checkin: true,
    enable_did_not_watch_skip: true,
    festival_name: 'Kashish Pride Film Festival (Bangalore Edition)'
  });
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);

  // New Category Modal State
  const [showCatModal, setShowCatModal] = useState(false);
  const [catForm, setCatForm] = useState({
    name: '',
    code: '',
    badge_color: '#e11d48',
    badge_ribbon_text: '',
    can_vote: true,
    voting_weight: 1.00,
    quota: ''
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      const [catRes, venueRes, setRes] = await Promise.all([
        api.get('/audience/categories'),
        api.get('/audience/venues'),
        api.get('/audience/settings')
      ]);
      setCategories(catRes.data.categories || []);
      setVenues(venueRes.data.venues || []);
      if (setRes.data.settings) setSettings(setRes.data.settings);
    } catch (err) {
      console.error('Failed to load audience settings data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateCategory = async (e) => {
    e.preventDefault();
    try {
      await api.post('/audience/categories', catForm);
      setShowCatModal(false);
      setCatForm({
        name: '',
        code: '',
        badge_color: '#e11d48',
        badge_ribbon_text: '',
        can_vote: true,
        voting_weight: 1.00,
        quota: ''
      });
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to create category.');
    }
  };

  const handleDeleteCategory = async (id) => {
    if (!window.confirm('Are you sure you want to remove this category?')) return;
    try {
      await api.delete(`/audience/categories/${id}`);
      setCategories(categories.filter(c => c.id !== id));
    } catch (err) {
      alert('Failed to delete category.');
    }
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    try {
      setSavingSettings(true);
      await api.put('/audience/settings', settings);
      alert('Audience settings saved successfully!');
    } catch (err) {
      alert('Failed to save settings.');
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <div className="fc-audience-page" style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Page Header */}
      <div className="fc-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 className="fc-page-title" style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0, color: 'var(--fc-text, #111827)' }}>
            Audience & Delegate Settings
          </h1>
          <p className="fc-page-subtitle" style={{ color: 'var(--fc-text-muted, #6b7280)', marginTop: '4px', fontSize: '0.9rem' }}>
            Manage delegate accreditation tiers, venue allocations, and audience voting parameters
          </p>
        </div>
        <button 
          className="fc-btn fc-btn-primary" 
          onClick={() => setShowCatModal(true)}
          style={{
            background: 'linear-gradient(135deg, #e11d48 0%, #be123c 100%)',
            color: '#fff',
            border: 'none',
            padding: '10px 18px',
            borderRadius: '8px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 4px 12px rgba(225, 29, 72, 0.25)'
          }}
        >
          <span>+ Add Delegate Category</span>
        </button>
      </div>

      {/* Grid: Categories & Settings */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px', marginBottom: '32px' }}>
        
        {/* Categories Panel */}
        <div style={{ gridColumn: 'span 2' }}>
          <div className="fc-card" style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 16px 0', color: '#1f2937' }}>
              Delegate Categories & Accreditation Tiers
            </h2>

            {loading ? (
              <div style={{ padding: '30px', textAlign: 'center', color: '#9ca3af' }}>Loading categories...</div>
            ) : categories.length === 0 ? (
              <div style={{ padding: '30px', textAlign: 'center', color: '#9ca3af' }}>No categories created yet. Click "+ Add Delegate Category" above.</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '14px' }}>
                {categories.map((cat) => (
                  <div 
                    key={cat.id} 
                    style={{
                      border: '1px solid #e5e7eb',
                      borderRadius: '10px',
                      padding: '14px',
                      background: '#fafafa',
                      position: 'relative',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span 
                          style={{
                            background: cat.badge_color || '#6366f1',
                            color: '#fff',
                            fontSize: '0.7rem',
                            fontWeight: 800,
                            padding: '3px 8px',
                            borderRadius: '4px',
                            letterSpacing: '0.05em'
                          }}
                        >
                          {cat.badge_ribbon_text || cat.name.toUpperCase()}
                        </span>
                        <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                          Code: <code>{cat.code}</code>
                        </span>
                      </div>
                      <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#111827', marginTop: '4px' }}>
                        {cat.name}
                      </div>
                      <div style={{ display: 'flex', gap: '12px', marginTop: '10px', fontSize: '0.8rem', color: '#4b5563' }}>
                        <span>👥 <strong>{cat.attendee_count || 0}</strong> Registered</span>
                        <span>🗳️ {cat.can_vote ? 'Can Vote' : 'Voting Disabled'}</span>
                      </div>
                    </div>

                    <div style={{ marginTop: '14px', display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #f3f4f6', paddingTop: '8px' }}>
                      <button
                        onClick={() => handleDeleteCategory(cat.id)}
                        style={{ background: 'transparent', border: 'none', color: '#ef4444', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 600 }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Global Voting & Eligibility Rules */}
        <div>
          <div className="fc-card" style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 16px 0', color: '#1f2937' }}>
              Voting & Eligibility Rules
            </h2>
            <form onSubmit={handleSaveSettings}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
                  Option 3 Screening Check-in Enforcement
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input 
                    type="checkbox" 
                    id="reqCheckin" 
                    checked={settings.require_screening_checkin}
                    onChange={(e) => setSettings({ ...settings, require_screening_checkin: e.target.checked })}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                  <label htmlFor="reqCheckin" style={{ fontSize: '0.85rem', color: '#4b5563', cursor: 'pointer' }}>
                    Require verified attendance at screening door before unlocking ballot
                  </label>
                </div>
                <small style={{ display: 'block', color: '#6b7280', marginTop: '4px', fontSize: '0.75rem' }}>
                  Prevents non-attendees from scanning shared QR screenshots online.
                </small>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
                  Minimum Quorum Threshold (m)
                </label>
                <input 
                  type="number" 
                  value={settings.minimum_quorum_threshold}
                  onChange={(e) => setSettings({ ...settings, minimum_quorum_threshold: parseInt(e.target.value, 10) || 0 })}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                />
                <small style={{ display: 'block', color: '#6b7280', marginTop: '4px', fontSize: '0.75rem' }}>
                  Minimum votes required for a film to qualify for Audience Choice Award (Bayesian penalty applied below this).
                </small>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
                  Default Voting Window (Minutes)
                </label>
                <input 
                  type="number" 
                  value={settings.voting_window_minutes}
                  onChange={(e) => setSettings({ ...settings, voting_window_minutes: parseInt(e.target.value, 10) || 0 })}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                />
                <small style={{ display: 'block', color: '#6b7280', marginTop: '4px', fontSize: '0.75rem' }}>
                  Time window balloting remains active after end credits roll.
                </small>
              </div>

              <button 
                type="submit" 
                disabled={savingSettings}
                style={{
                  width: '100%',
                  padding: '10px',
                  background: '#2563eb',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                {savingSettings ? 'Saving Settings...' : 'Save Settings'}
              </button>
            </form>
          </div>
        </div>

      </div>

      {/* Venues Section */}
      <div className="fc-card" style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 16px 0', color: '#1f2937' }}>
          Screening Venues & Auditoriums
        </h2>
        {venues.length === 0 ? (
          <div style={{ color: '#9ca3af' }}>No venues registered.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
            {venues.map((v) => (
              <div key={v.id} style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '16px', background: '#fdfdfd' }}>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#111827' }}>{v.name}</div>
                <div style={{ display: 'flex', gap: '16px', marginTop: '8px', fontSize: '0.85rem', color: '#4b5563' }}>
                  <span>💺 Capacity: <strong>{v.capacity}</strong> seats</span>
                  <span>🎬 Screenings: <strong>{v.total_screenings || 0}</strong></span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal: Add Category */}
      {showCatModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: '12px', width: '90%', maxWidth: '480px', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '1.25rem', fontWeight: 700 }}>Add Delegate Category</h3>
            <form onSubmit={handleCreateCategory}>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px' }}>Category Name *</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. VIP Delegate, Press, Student"
                  value={catForm.name} 
                  onChange={(e) => {
                    const name = e.target.value;
                    const code = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
                    setCatForm({ ...catForm, name, code: catForm.code ? catForm.code : code, badge_ribbon_text: catForm.badge_ribbon_text ? catForm.badge_ribbon_text : name.toUpperCase() });
                  }}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                />
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px' }}>Category Code * (Unique slug)</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. vip, press, delegate"
                  value={catForm.code} 
                  onChange={(e) => setCatForm({ ...catForm, code: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px' }}>Badge Color</label>
                  <input 
                    type="color" 
                    value={catForm.badge_color} 
                    onChange={(e) => setCatForm({ ...catForm, badge_color: e.target.value })}
                    style={{ width: '100%', height: '40px', padding: '2px', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px' }}>Ribbon Text</label>
                  <input 
                    type="text" 
                    placeholder="DELEGATE"
                    value={catForm.badge_ribbon_text} 
                    onChange={(e) => setCatForm({ ...catForm, badge_ribbon_text: e.target.value.toUpperCase() })}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input 
                    type="checkbox" 
                    checked={catForm.can_vote} 
                    onChange={(e) => setCatForm({ ...catForm, can_vote: e.target.checked })}
                    style={{ width: '16px', height: '16px' }}
                  />
                  <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Enable Audience Choice Voting for this Category</span>
                </label>
              </div>

              {/* Badge Preview */}
              <div style={{ background: '#f3f4f6', padding: '12px', borderRadius: '8px', marginBottom: '16px', textAlign: 'center' }}>
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '6px' }}>LIVE BADGE PREVIEW</div>
                <span style={{ background: catForm.badge_color, color: '#fff', padding: '4px 12px', borderRadius: '4px', fontWeight: 800, fontSize: '0.8rem', letterSpacing: '0.05em' }}>
                  {catForm.badge_ribbon_text || 'RIBBON TEXT'}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button 
                  type="button" 
                  onClick={() => setShowCatModal(false)}
                  style={{ padding: '8px 16px', border: '1px solid #d1d5db', background: '#fff', borderRadius: '6px', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  style={{ padding: '8px 16px', background: '#e11d48', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
                >
                  Create Category
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
