/**
 * SettingsPage Component
 * 100% Dynamic Database-backed Settings matching Mockup:
 * - Sub-navigation tabs: Festival | Billing
 * - Card 1: Film Flags (CRUD, color swatches direct toggle, active switch from submission_flags)
 * - Card 2: Review Rounds:
 *    - Max screening rounds selector (1, 2, 3, 4 rounds) with review lock banner
 *    - Round 1 & Round 2 sections:
 *      - Lock banner if reviews submitted
 *      - Scoring Mode (Star rating / Vote nomination)
 *      - Maximum Rating Points (3, 5, 10 Stars)
 *      - Review Notes (Optional / Required)
 *      - Categories list (CRUD from festival_review_criteria)
 */

import React, { useState, useEffect } from 'react';
import api from '../services/api';

const PRESET_SWATCHES = [
  '#e0f2fe', '#d1fae5', '#fef3c7', '#ffedd5', '#fee2e2',
  '#fbcfe8', '#e05252', '#d97706', '#10b981', '#3b82f6', '#8b5cf6'
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('festival'); // 'festival' | 'billing'
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState(null);


  // Flags State
  const [flags, setFlags] = useState([]);
  const [flagModal, setFlagModal] = useState({
    open: false,
    mode: 'add',
    item: null,
    label: '',
    color: '#e05252',
    is_active: true
  });

  // Review Rounds State
  const [roundsConfig, setRoundsConfig] = useState({
    max_screening_rounds: 2,
    is_rounds_locked: false,
    lock_message: null,
    rounds: []
  });
  const [categoryModal, setCategoryModal] = useState({
    open: false,
    mode: 'add',
    roundNumber: 1,
    item: null,
    label: '',
    key: ''
  });

  // Show transient alert message
  const showNotification = (msg, type = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => {
      setNotification(null);
    }, 4000);
  };

  const loadAllSettings = async () => {
    try {
      setLoading(true);
      const [flagRes, roundsRes] = await Promise.all([
        api.get('/settings/flags'),
        api.get('/settings/review-rounds')
      ]);

      setFlags(flagRes.data.data || []);
      setRoundsConfig(roundsRes.data || { max_screening_rounds: 2, rounds: [] });
    } catch (err) {
      console.error('Failed to load settings:', err);
      showNotification('Failed to load settings. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllSettings();
  }, []);



  // ───────────────────────────────────────────────────────────────────────────
  // FLAGS HANDLERS
  // ───────────────────────────────────────────────────────────────────────────

  const handleOpenAddFlag = () => {
    setFlagModal({
      open: true,
      mode: 'add',
      item: null,
      label: '',
      color: '#e05252',
      is_active: true
    });
  };

  const handleOpenEditFlag = (flag) => {
    setFlagModal({
      open: true,
      mode: 'edit',
      item: flag,
      label: flag.label,
      color: flag.color,
      is_active: Boolean(flag.is_active)
    });
  };

  const handleSaveFlag = async (e) => {
    e.preventDefault();
    if (!flagModal.label.trim()) return;

    try {
      if (flagModal.mode === 'add') {
        const res = await api.post('/settings/flags', {
          label: flagModal.label.trim(),
          color: flagModal.color,
          is_active: flagModal.is_active
        });
        setFlags(prev => [...prev, res.data.data]);
        showNotification(`Flag "${res.data.data.label}" created successfully.`);
      } else {
        const res = await api.put(`/settings/flags/${flagModal.item.id}`, {
          label: flagModal.label.trim(),
          color: flagModal.color,
          is_active: flagModal.is_active
        });
        setFlags(prev => prev.map(f => f.id === flagModal.item.id ? res.data.data : f));
        showNotification(`Flag "${res.data.data.label}" updated.`);
      }
      setFlagModal({ open: false, mode: 'add', item: null, label: '', color: '#e05252', is_active: true });
    } catch (err) {
      console.error('Failed to save flag:', err);
      showNotification(err.response?.data?.error || 'Failed to save flag.', 'error');
    }
  };

  const handleQuickColorChange = async (flag, color) => {
    try {
      // Optimistic update
      setFlags(prev => prev.map(f => f.id === flag.id ? { ...f, color } : f));
      await api.put(`/settings/flags/${flag.id}`, { color });
      showNotification(`Flag "${flag.label}" color updated.`);
    } catch (err) {
      console.error('Failed to change flag color:', err);
      loadAllSettings();
    }
  };

  const handleToggleFlagActive = async (flag) => {
    const newStatus = !flag.is_active;
    try {
      setFlags(prev => prev.map(f => f.id === flag.id ? { ...f, is_active: newStatus } : f));
      await api.put(`/settings/flags/${flag.id}`, { is_active: newStatus });
      showNotification(`Flag "${flag.label}" is now ${newStatus ? 'Active' : 'Inactive'}.`);
    } catch (err) {
      console.error('Failed to toggle flag active state:', err);
      loadAllSettings();
    }
  };

  const handleDeleteFlag = async (flag) => {
    if (!window.confirm(`Are you sure you want to delete the flag "${flag.label}"?`)) return;

    try {
      await api.delete(`/settings/flags/${flag.id}`);
      setFlags(prev => prev.filter(f => f.id !== flag.id));
      showNotification(`Flag "${flag.label}" deleted.`);
    } catch (err) {
      console.error('Failed to delete flag:', err);
      showNotification(err.response?.data?.error || 'Failed to delete flag.', 'error');
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // REVIEW ROUNDS HANDLERS
  // ───────────────────────────────────────────────────────────────────────────

  const handleSelectMaxRounds = async (roundsCount) => {
    if (roundsConfig.is_rounds_locked) {
      alert('Round count is locked because one or more round reviews have already been submitted.');
      return;
    }
    try {
      await api.put('/settings/review-rounds/max-rounds', { max_screening_rounds: roundsCount });
      showNotification(`Max screening rounds set to ${roundsCount}.`);
      loadAllSettings();
    } catch (err) {
      console.error('Failed to update max rounds:', err);
      showNotification(err.response?.data?.error || 'Failed to update max rounds.', 'error');
    }
  };

  const handleUpdateRoundField = async (roundNumber, field, value) => {
    const round = roundsConfig.rounds.find(r => r.round_number === roundNumber);
    if (!round) return;

    if (round.is_locked) {
      alert('Configuration is locked because reviews have already been submitted for this round.');
      return;
    }

    try {
      const payload = {
        scoring_mode: field === 'scoring_mode' ? value : round.scoring_mode,
        max_rating_points: field === 'max_rating_points' ? value : round.max_rating_points,
        notes_required: field === 'notes_required' ? value : round.notes_required
      };

      // Optimistic update
      setRoundsConfig(prev => ({
        ...prev,
        rounds: prev.rounds.map(r => r.round_number === roundNumber ? { ...r, [field]: value } : r)
      }));

      await api.put(`/settings/review-rounds/${roundNumber}`, payload);
      showNotification(`Round ${roundNumber} configuration saved.`);
    } catch (err) {
      console.error('Failed to update round config:', err);
      showNotification(err.response?.data?.error || 'Failed to update round config.', 'error');
      loadAllSettings();
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // CRITERIA CATEGORIES HANDLERS
  // ───────────────────────────────────────────────────────────────────────────

  const handleOpenAddCategory = (roundNumber) => {
    const round = roundsConfig.rounds.find(r => r.round_number === roundNumber);
    if (round && round.is_locked) {
      alert('Configuration is locked because reviews have already been submitted for this round.');
      return;
    }
    setCategoryModal({
      open: true,
      mode: 'add',
      roundNumber,
      item: null,
      label: '',
      key: ''
    });
  };

  const handleOpenEditCategory = (roundNumber, category) => {
    const round = roundsConfig.rounds.find(r => r.round_number === roundNumber);
    if (round && round.is_locked) {
      alert('Configuration is locked because reviews have already been submitted for this round.');
      return;
    }
    setCategoryModal({
      open: true,
      mode: 'edit',
      roundNumber,
      item: category,
      label: category.label,
      key: category.criterion_key
    });
  };

  const handleSaveCategory = async (e) => {
    e.preventDefault();
    if (!categoryModal.label.trim()) return;

    const roundNum = categoryModal.roundNumber;
    try {
      if (categoryModal.mode === 'add') {
        const res = await api.post(`/settings/review-rounds/${roundNum}/categories`, {
          label: categoryModal.label.trim(),
          key: categoryModal.key.trim()
        });
        setRoundsConfig(prev => ({
          ...prev,
          rounds: prev.rounds.map(r =>
            r.round_number === roundNum
              ? { ...r, categories: [...(r.categories || []), res.data.data] }
              : r
          )
        }));
        showNotification(`Category "${res.data.data.label}" added to Round ${roundNum}.`);
      } else {
        const res = await api.put(`/settings/review-rounds/${roundNum}/categories/${categoryModal.item.id}`, {
          label: categoryModal.label.trim(),
          key: categoryModal.key.trim()
        });
        setRoundsConfig(prev => ({
          ...prev,
          rounds: prev.rounds.map(r =>
            r.round_number === roundNum
              ? {
                  ...r,
                  categories: (r.categories || []).map(c =>
                    c.id === categoryModal.item.id ? { ...c, ...res.data.data } : c
                  )
                }
              : r
          )
        }));
        showNotification(`Category updated.`);
      }
      setCategoryModal({ open: false, mode: 'add', roundNumber: 1, item: null, label: '', key: '' });
    } catch (err) {
      console.error('Failed to save category:', err);
      showNotification(err.response?.data?.error || 'Failed to save criteria category.', 'error');
    }
  };

  const handleDeleteCategory = async (roundNumber, category) => {
    const round = roundsConfig.rounds.find(r => r.round_number === roundNumber);
    if (round && round.is_locked) {
      alert('Configuration is locked because reviews have already been submitted for this round.');
      return;
    }

    if (!window.confirm(`Are you sure you want to delete category "${category.label}" from Round ${roundNumber}?`)) {
      return;
    }

    try {
      await api.delete(`/settings/review-rounds/${roundNumber}/categories/${category.id}`);
      setRoundsConfig(prev => ({
        ...prev,
        rounds: prev.rounds.map(r =>
          r.round_number === roundNumber
            ? { ...r, categories: (r.categories || []).filter(c => c.id !== category.id) }
            : r
        )
      }));
      showNotification(`Category "${category.label}" deleted.`);
    } catch (err) {
      console.error('Failed to delete category:', err);
      showNotification(err.response?.data?.error || 'Failed to delete category.', 'error');
    }
  };

  return (
    <div className="fc-settings-page animate-fade-in">
      {/* Top Header Matching Screenshot 3 */}
      <div className="fc-page-header">
        <h1 className="fc-page-title">Settings</h1>
        <p className="fc-page-subtitle">Manage festival configuration and account settings.</p>
      </div>

      {/* Floating Notification */}
      {notification && (
        <div className={`fc-settings-toast ${notification.type === 'error' ? 'toast-error' : 'toast-success'}`}>
          {notification.msg}
        </div>
      )}

      {/* Sub-Navigation Tabs: Festival | Billing (Matching Screenshot 3) */}
      <div className="fc-settings-tabs-bar">
        <button
          type="button"
          className={`fc-settings-tab-btn ${activeTab === 'festival' ? 'active' : ''}`}
          onClick={() => setActiveTab('festival')}
        >
          Festival
        </button>
        <button
          type="button"
          className={`fc-settings-tab-btn ${activeTab === 'billing' ? 'active' : ''}`}
          onClick={() => setActiveTab('billing')}
        >
          Billing
        </button>
      </div>

      {loading ? (
        <div className="fc-loading-skeleton-container">
          <div className="fc-skeleton-card" />
          <div className="fc-skeleton-card" />
          <div className="fc-skeleton-card" />
        </div>
      ) : activeTab === 'festival' ? (
        <div className="fc-settings-content">

          {/* ──────────────────────────────────────────────────────────────── */}
          {/* CARD 2: FILM FLAGS (Matching Screenshot 3)                      */}
          {/* ──────────────────────────────────────────────────────────────── */}
          <div className="fc-settings-card">
            <div className="fc-card-header-row">
              <div>
                <h2 className="fc-card-title">Film Flags</h2>
                <p className="fc-card-subtitle">
                  Configure operational labels staff can assign to films alongside lifecycle status.
                </p>
              </div>
              <button
                type="button"
                className="fc-btn-primary-action"
                onClick={handleOpenAddFlag}
              >
                + Add Flag
              </button>
            </div>

            <div className="fc-flags-list">
              {flags.length === 0 ? (
                <div className="fc-empty-state-text">No film flags configured.</div>
              ) : (
                flags.map(flag => (
                  <div key={flag.id} className="fc-flag-row">
                    {/* Left: Drag Handle & Label */}
                    <div className="fc-flag-left-meta">
                      <span className="fc-drag-handle">⠿</span>
                      <span className="fc-flag-label-text">{flag.label}</span>
                      <span
                        className="fc-flag-badge-pill"
                        style={{
                          backgroundColor: `${flag.color}22`,
                          color: flag.color,
                          borderColor: `${flag.color}44`
                        }}
                      >
                        {flag.label}
                      </span>
                    </div>

                    {/* Right: Color Swatches, Active Switch, Edit, Delete */}
                    <div className="fc-flag-controls-right">
                      {/* Swatches Palette */}
                      <div className="fc-swatches-palette">
                        {PRESET_SWATCHES.map(color => {
                          const isSelected = flag.color.toLowerCase() === color.toLowerCase();
                          return (
                            <button
                              key={color}
                              type="button"
                              className={`fc-color-circle ${isSelected ? 'selected' : ''}`}
                              style={{ backgroundColor: color }}
                              onClick={() => handleQuickColorChange(flag, color)}
                              title={color}
                            />
                          );
                        })}
                      </div>

                      {/* Active Toggle Switch */}
                      <label className="fc-toggle-switch">
                        <input
                          type="checkbox"
                          checked={Boolean(flag.is_active)}
                          onChange={() => handleToggleFlagActive(flag)}
                        />
                        <span className="fc-toggle-slider" />
                      </label>

                      {/* Actions */}
                      <button
                        type="button"
                        className="fc-btn-subtle"
                        onClick={() => handleOpenEditFlag(flag)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="fc-btn-subtle"
                        onClick={() => handleDeleteFlag(flag)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* ──────────────────────────────────────────────────────────────── */}
          {/* CARD 3: REVIEW ROUNDS & CRITERIA (Matching Screenshots 3, 4, 5) */}
          {/* ──────────────────────────────────────────────────────────────── */}
          <div className="fc-settings-card">
            <div className="fc-card-header-row">
              <div>
                <h2 className="fc-card-title">Review Rounds</h2>
                <p className="fc-card-subtitle">
                  Configure per-round screening criteria, scoring mode, scale, and note requirements.
                </p>
              </div>
            </div>

            {/* Max Screening Rounds Control */}
            <div className="fc-max-rounds-block">
              <div className="fc-control-label-row">
                <span className="fc-control-label">Max screening rounds</span>
                <div className="fc-pill-group">
                  {[1, 2, 3, 4].map(r => (
                    <button
                      key={r}
                      type="button"
                      className={`fc-pill-btn ${roundsConfig.max_screening_rounds === r ? 'active' : ''}`}
                      onClick={() => handleSelectMaxRounds(r)}
                    >
                      {r} {r === 1 ? 'round' : 'rounds'}
                    </button>
                  ))}
                </div>
              </div>
              <p className="fc-control-helptext">
                Sets the edition ceiling for how many screening rounds you can add in the Review Dashboard. Actual rounds grow dynamically as you complete each round.
              </p>

              {/* Dynamic Round Count Lock Banner */}
              {roundsConfig.is_rounds_locked && (
                <div className="fc-lock-notice-banner">
                  Round count is locked because one or more round reviews have already been submitted.
                </div>
              )}
            </div>

            {/* Round Sections (Round 1, Round 2, etc.) */}
            {roundsConfig.rounds.map(round => (
              <div key={round.round_number} className="fc-round-section-block">
                <div className="fc-round-header">
                  <h3 className="fc-round-title">{round.round_name}</h3>
                  <p className="fc-round-description">{round.description}</p>
                </div>

                {/* Round Configuration Lock Banner */}
                {round.is_locked && (
                  <div className="fc-lock-notice-banner">
                    Configuration is locked because reviews have already been submitted for this round. Existing reviews must be cleared to make changes.
                  </div>
                )}

                {/* Scoring Mode */}
                <div className="fc-setting-field-row">
                  <span className="fc-setting-field-label">Scoring Mode</span>
                  <div className="fc-pill-group">
                    <button
                      type="button"
                      className={`fc-pill-btn ${round.scoring_mode === 'star_rating' ? 'active' : ''}`}
                      onClick={() => handleUpdateRoundField(round.round_number, 'scoring_mode', 'star_rating')}
                    >
                      Star rating
                    </button>
                    <button
                      type="button"
                      className={`fc-pill-btn ${round.scoring_mode === 'vote_nomination' ? 'active' : ''}`}
                      onClick={() => handleUpdateRoundField(round.round_number, 'scoring_mode', 'vote_nomination')}
                    >
                      Vote / nomination
                    </button>
                  </div>
                </div>

                {/* Maximum Rating Points */}
                <div className="fc-setting-field-row">
                  <span className="fc-setting-field-label">Maximum Rating Points</span>
                  <div className="fc-pill-group">
                    {[3, 5, 10].map(pts => (
                      <button
                        key={pts}
                        type="button"
                        className={`fc-pill-btn ${round.max_rating_points === pts ? 'active' : ''}`}
                        onClick={() => handleUpdateRoundField(round.round_number, 'max_rating_points', pts)}
                      >
                        {pts} Stars
                      </button>
                    ))}
                  </div>
                </div>

                {/* Review Notes */}
                <div className="fc-setting-field-row">
                  <span className="fc-setting-field-label">Review Notes</span>
                  <div className="fc-pill-group">
                    <button
                      type="button"
                      className={`fc-pill-btn ${round.notes_required === 'optional' ? 'active' : ''}`}
                      onClick={() => handleUpdateRoundField(round.round_number, 'notes_required', 'optional')}
                    >
                      Optional
                    </button>
                    <button
                      type="button"
                      className={`fc-pill-btn ${round.notes_required === 'required' ? 'active' : ''}`}
                      onClick={() => handleUpdateRoundField(round.round_number, 'notes_required', 'required')}
                    >
                      Required
                    </button>
                  </div>
                </div>

                {/* Categories Subsection */}
                <div className="fc-categories-subsection">
                  <div className="fc-categories-header-row">
                    <h4 className="fc-subsection-title">Categories</h4>
                    <button
                      type="button"
                      className="fc-btn-primary-action"
                      onClick={() => handleOpenAddCategory(round.round_number)}
                    >
                      + Add Category
                    </button>
                  </div>

                  <div className="fc-categories-list">
                    {(round.categories || []).length === 0 ? (
                      <div className="fc-empty-state-text">No review categories configured for this round.</div>
                    ) : (
                      (round.categories || []).map(cat => (
                        <div key={cat.id} className="fc-category-row">
                          <div className="fc-category-meta">
                            <span className="fc-category-label">{cat.label}</span>
                            <span className="fc-category-key">Key: {cat.criterion_key}</span>
                          </div>
                          <div className="fc-row-actions">
                            <button
                              type="button"
                              className="fc-btn-subtle"
                              onClick={() => handleOpenEditCategory(round.round_number, cat)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="fc-btn-subtle"
                              onClick={() => handleDeleteCategory(round.round_number, cat)}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* ────────────────────────────────────────────────────────────────── */
        /* BILLING TAB                                                        */
        /* ────────────────────────────────────────────────────────────────── */
        <div className="fc-settings-content">
          <div className="fc-settings-card">
            <div className="fc-card-header-row">
              <div>
                <h2 className="fc-card-title">Edition Subscription & Billing</h2>
                <p className="fc-card-subtitle">Manage festival edition tier, add-ons, and payment receipts.</p>
              </div>
              <span className="fc-billing-badge-active">Plan: Enterprise Active</span>
            </div>

            <div className="fc-billing-grid">
              <div className="fc-billing-item">
                <span className="fc-billing-label">Festival Edition</span>
                <span className="fc-billing-value">Indie Film Festival Bangalore · Edition 4 (2026)</span>
              </div>
              <div className="fc-billing-item">
                <span className="fc-billing-label">Billing Cycle</span>
                <span className="fc-billing-value">Annual Multi-Edition License</span>
              </div>
              <div className="fc-billing-item">
                <span className="fc-billing-label">Submissions Quota</span>
                <span className="fc-billing-value">Unlimited Film Submissions</span>
              </div>
              <div className="fc-billing-item">
                <span className="fc-billing-label">Review Pipeline</span>
                <span className="fc-billing-value">Multi-Round Screening & Automated Juries</span>
              </div>
            </div>

            <div className="fc-billing-receipts-section">
              <h3 className="fc-subsection-title">Recent Invoices</h3>
              <div className="fc-invoice-row">
                <span className="fc-invoice-num">INV-2026-0812</span>
                <span className="fc-invoice-date">Sep 01, 2026</span>
                <span className="fc-invoice-amount">$1,450.00 USD</span>
                <span className="fc-invoice-status">Paid</span>
              </div>
            </div>
          </div>
        </div>
      )}


      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* MODAL: ADD / EDIT FILM FLAG                                          */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      {flagModal.open && (
        <div className="fc-modal-overlay">
          <div className="fc-settings-modal-card">
            <h3 className="fc-modal-title">
              {flagModal.mode === 'add' ? 'Add Film Flag' : 'Edit Film Flag'}
            </h3>
            <form onSubmit={handleSaveFlag}>
              <div className="fc-form-group">
                <label className="fc-form-label">Flag Label</label>
                <input
                  type="text"
                  className="fc-form-input"
                  placeholder="e.g. Needs Review, High Priority"
                  value={flagModal.label}
                  onChange={(e) => setFlagModal(prev => ({ ...prev, label: e.target.value }))}
                  autoFocus
                  required
                />
              </div>

              <div className="fc-form-group">
                <label className="fc-form-label">Color Preset</label>
                <div className="fc-modal-swatches">
                  {PRESET_SWATCHES.map(color => (
                    <button
                      key={color}
                      type="button"
                      className={`fc-color-circle ${flagModal.color === color ? 'selected' : ''}`}
                      style={{ backgroundColor: color }}
                      onClick={() => setFlagModal(prev => ({ ...prev, color }))}
                    />
                  ))}
                </div>
              </div>

              <div className="fc-form-group">
                <label className="fc-form-label">Hex Color Code</label>
                <input
                  type="text"
                  className="fc-form-input"
                  value={flagModal.color}
                  onChange={(e) => setFlagModal(prev => ({ ...prev, color: e.target.value }))}
                />
              </div>

              <div className="fc-form-checkbox-row">
                <label className="fc-checkbox-label">
                  <input
                    type="checkbox"
                    checked={flagModal.is_active}
                    onChange={(e) => setFlagModal(prev => ({ ...prev, is_active: e.target.checked }))}
                  />
                  <span>Active (Available for film assignment)</span>
                </label>
              </div>

              <div className="fc-modal-actions">
                <button
                  type="button"
                  className="fc-btn-subtle"
                  onClick={() => setFlagModal({ open: false, mode: 'add', item: null, label: '', color: '#e05252', is_active: true })}
                >
                  Cancel
                </button>
                <button type="submit" className="fc-btn-primary-action">
                  Save Flag
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* MODAL: ADD / EDIT CRITERIA CATEGORY                                  */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      {categoryModal.open && (
        <div className="fc-modal-overlay">
          <div className="fc-settings-modal-card">
            <h3 className="fc-modal-title">
              {categoryModal.mode === 'add'
                ? `Add Category to Round ${categoryModal.roundNumber}`
                : `Edit Category (Round ${categoryModal.roundNumber})`}
            </h3>
            <form onSubmit={handleSaveCategory}>
              <div className="fc-form-group">
                <label className="fc-form-label">Category Label</label>
                <input
                  type="text"
                  className="fc-form-input"
                  placeholder="e.g. Screenplay, Sound Design, Inspiration"
                  value={categoryModal.label}
                  onChange={(e) => {
                    const val = e.target.value;
                    const autoKey = val.toLowerCase().replace(/[^a-z0-9_]/g, '_');
                    setCategoryModal(prev => ({
                      ...prev,
                      label: val,
                      key: prev.mode === 'add' ? autoKey : prev.key
                    }));
                  }}
                  autoFocus
                  required
                />
              </div>

              <div className="fc-form-group">
                <label className="fc-form-label">Category Key</label>
                <input
                  type="text"
                  className="fc-form-input"
                  placeholder="e.g. screenplay, sound_design"
                  value={categoryModal.key}
                  onChange={(e) => setCategoryModal(prev => ({ ...prev, key: e.target.value }))}
                  required
                />
                <small className="fc-field-helptext">Identifier used in review scorecards and ratings.</small>
              </div>

              <div className="fc-modal-actions">
                <button
                  type="button"
                  className="fc-btn-subtle"
                  onClick={() => setCategoryModal({ open: false, mode: 'add', roundNumber: 1, item: null, label: '', key: '' })}
                >
                  Cancel
                </button>
                <button type="submit" className="fc-btn-primary-action">
                  Save Category
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
