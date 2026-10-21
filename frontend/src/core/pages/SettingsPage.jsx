/**
 * SettingsPage Component — Section-Wise Review Pipeline & Festival Settings
 * 
 * Features:
 * - Review Stages & Sequential Pipeline (Section-Wise Architecture):
 */

import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import api from '../services/api';
import { useFestivalConfig } from '../hooks/useFestivalConfig';
import InPageReviewStateBuilder from '../components/settings/InPageReviewStateBuilder';
import {
  InboxIcon,
  LockIcon,
  CheckCircleIcon,
  ArrowForwardIcon,
  FlashOnIcon,
  PersonIcon,
  EditIcon,
  AddIcon,
  CloseIcon
} from '../components/common/Icons';

export default function SettingsPage() {
  const { currentFestival } = useFestivalConfig();
  const navigate = useNavigate();
  const location = useLocation();

  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState(null);

  // Review States (Sequential Stages)
  const [reviewStates, setReviewStates] = useState([]);
  const [isAddingStage, setIsAddingStage] = useState(false);
  const [editingStageId, setEditingStageId] = useState(null);

  // Flash message notification from redirects
  useEffect(() => {
    if (location.state?.msg) {
      showNotification(location.state.msg);
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  // Show transient alert message
  const showNotification = (msg, type = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => {
      setNotification(null);
    }, 4000);
  };

  const loadAllSettings = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const statesRes = await api.get('/settings/review-states');
      setReviewStates(statesRes.data?.data || []);
    } catch (err) {
      console.error('Failed to load settings:', err);
      showNotification('Failed to load settings. Please try again.', 'error');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadAllSettings();
  }, [currentFestival?.id]);

  // ───────────────────────────────────────────────────────────────────────────
  // NAVIGATION & STAGES HANDLERS (Section-Wise Review Architecture)
  // ───────────────────────────────────────────────────────────────────────────

  const handleGoToCreateStage = () => {
    navigate('/settings/review-stage/create');
  };

  const handleGoToEditStage = (stageId) => {
    navigate(`/settings/review-stage/edit/${stageId}`);
  };

  const handleToggleAddStage = () => {
    handleGoToCreateStage();
  };

  const handleToggleEditStage = (stageId) => {
    handleGoToEditStage(stageId);
  };

  const handleToggleStageStatus = async (stage) => {
    const newStatus = stage.status === 'inactive' ? 'active' : 'inactive';
    try {
      setReviewStates(prev => prev.map(s => s.id === stage.id ? { ...s, status: newStatus } : s));
      await api.put(`/settings/review-states/${stage.id}`, { status: newStatus });
      showNotification(`Stage "${stage.unique_name || stage.name}" is now ${newStatus === 'active' ? 'Active' : 'Inactive'}.`);
      await loadAllSettings(true);
    } catch (err) {
      console.error('Failed to toggle stage status:', err);
      showNotification('Failed to update stage status.', 'error');
      loadAllSettings();
    }
  };

  return (
    <div className="fc-settings-page animate-fade-in" style={{ paddingBottom: '80px' }}>
      {/* Toast Notification */}
      {notification && (
        <div className={`fc-notification-banner ${notification.type === 'error' ? 'fc-notif-error' : 'fc-notif-success'}`} style={{ marginBottom: '16px', padding: '12px 18px', borderRadius: '8px', background: notification.type === 'error' ? '#fee2e2' : '#dcfce7', color: notification.type === 'error' ? '#b91c1c' : '#15803d', fontWeight: 600 }}>
          {notification.msg}
        </div>
      )}

      {/* Breadcrumbs Navigation */}
      <nav style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--fc-text-secondary)', marginBottom: '16px' }}>
        <Link to="/settings" style={{ color: 'var(--fc-text-secondary)', textDecoration: 'none' }}>
          Settings
        </Link>
        <span>/</span>
        <span style={{ color: 'var(--fc-brand, #a82f2f)', fontWeight: 700 }}>
          Review Stage
        </span>
      </nav>

      {/* Page Header */}
      <div className="fc-page-header" style={{ marginBottom: '24px' }}>
        <h1 className="fc-page-title">Settings & Workflow</h1>
        <p className="fc-page-subtitle">Configure sequential review stages, automation cutoffs, and film flags.</p>
      </div>

      {loading ? (
        <div style={{ padding: '60px', textAlign: 'center', color: 'var(--fc-text-muted)' }}>
          Loading festival configurations...
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
          
          {/* ──────────────────────────────────────────────────────────────── */}
          {/* SECTION-WISE REVIEW PIPELINE ARCHITECTURE (6 SEQUENTIAL STAGES)  */}
          {/* ──────────────────────────────────────────────────────────────── */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--fc-text-main)', letterSpacing: '-0.3px' }}>
                  Review Pipeline Architecture
                </h2>
                <p style={{ fontSize: '13px', color: 'var(--fc-text-secondary)', marginTop: '2px' }}>
                  Sequential review stages with scoring configuration and permission scopes.
                </p>
              </div>
              <button
                type="button"
                className="fc-btn-add-review-state"
                onClick={handleToggleAddStage}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                {isAddingStage ? (
                  <>
                    <CloseIcon size={14} />
                    <span>Close Builder</span>
                  </>
                ) : (
                  <>
                    <AddIcon size={16} />
                    <span>Add New Review-State</span>
                  </>
                )}
              </button>
            </div>

            <div className="settings-sections-stack">
              {/* ── STAGE 0: Initial Intake Stage (New Submission) in Disabled Form ── */}
              <div 
                className="state-section-card fc-stage-disabled-card"
                style={{
                  opacity: 0.9,
                  border: '1.5px dashed var(--fc-border, #cbd5e1)',
                  background: 'var(--fc-surface-subtle, rgba(0, 0, 0, 0.02))'
                }}
              >
                {/* Section Header */}
                <div className="state-section-header" style={{ cursor: 'default' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    <span 
                      className="state-badge-num"
                      style={{ 
                        background: 'var(--fc-surface-hover, #64748b)', 
                        color: '#ffffff',
                        boxShadow: 'none'
                      }}
                    >
                      0
                    </span>
                    <strong style={{ fontSize: '15px', color: 'var(--fc-text-main)' }}>
                      New Submission
                    </strong>
                    <span className="criteria-chip" style={{ background: '#f0fdf4', color: '#16a34a', borderColor: '#bbf7d0', display: 'inline-flex', alignItems: 'center' }}>
                      <InboxIcon size={13} style={{ marginRight: '4px' }} /> Initial Intake Stage
                    </span>
                    <span className="criteria-chip" style={{ background: '#f8fafc', color: '#64748b', borderColor: '#e2e8f0', display: 'inline-flex', alignItems: 'center' }}>
                      <LockIcon size={13} style={{ marginRight: '4px' }} /> System Default (Fixed)
                    </span>
                    <span className="criteria-chip" style={{ background: '#eff6ff', color: '#2563eb', borderColor: '#bfdbfe' }}>
                      Non-Scoring Base
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <label
                      className="fc-toggle-switch"
                      title="Initial Intake stage is permanently active as the entry point"
                      style={{ verticalAlign: 'middle', cursor: 'not-allowed', opacity: 0.6 }}
                    >
                      <input
                        type="checkbox"
                        checked={true}
                        disabled={true}
                        readOnly={true}
                      />
                      <span className="fc-toggle-slider" />
                    </label>
                    <button
                      type="button"
                      className="fc-stage-status-btn active"
                      disabled={true}
                      style={{ cursor: 'not-allowed', opacity: 0.85, display: 'inline-flex', alignItems: 'center' }}
                      title="System base stage is permanently active"
                    >
                      <CheckCircleIcon size={13} style={{ marginRight: '4px' }} /> Active (Default)
                    </button>
                    <button
                      type="button"
                      className="fc-btn fc-btn-outline fc-btn-sm"
                      disabled={true}
                      style={{ cursor: 'not-allowed', opacity: 0.55, display: 'inline-flex', alignItems: 'center' }}
                      title="Default intake stage configuration is fixed by the system"
                    >
                      <LockIcon size={13} style={{ marginRight: '4px' }} /> Default Entry
                    </button>
                  </div>
                </div>

                {/* Section Body */}
                <div 
                  className="state-section-body" 
                  style={{ 
                    padding: '16px 24px', 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '32px', 
                    flexWrap: 'wrap', 
                    background: 'var(--fc-surface-card, #faf9f7)', 
                    borderTop: '1px solid var(--fc-border)' 
                  }}
                >
                  <div>
                    <span className="state-sub-col-title" style={{ marginBottom: '4px' }}>STAGE TYPE</span>
                    <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--fc-text-main)' }}>
                      Film Intake & Verification
                    </div>
                  </div>

                  <div style={{ width: '1px', height: '28px', background: 'var(--fc-border)', alignSelf: 'center' }}></div>

                  <div>
                    <span className="state-sub-col-title" style={{ marginBottom: '4px' }}>EVALUATION CRITERIA</span>
                    <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--fc-text-secondary, #64748b)' }}>
                      Awaiting Assignment to Round 1
                    </div>
                  </div>

                  <div style={{ width: '1px', height: '28px', background: 'var(--fc-border)', alignSelf: 'center' }}></div>

                  <div>
                    <span className="state-sub-col-title" style={{ marginBottom: '4px' }}>REVIEW NOTES</span>
                    <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--fc-text-secondary, #64748b)' }}>
                      System Intake Queue
                    </div>
                  </div>
                </div>
              </div>

              {/* Flow Connector from Stage 0 to Stage 1 */}
              <div className="flow-connector-step">
                <ArrowForwardIcon size={13} style={{ marginRight: '5px' }} />
                <span>Sequential Promotion to Stage 1: {reviewStates.filter(s => s.status !== 'inactive')[0]?.unique_name || 'Round 1: Screening'}</span>
              </div>

              {reviewStates.filter(s => s.status !== 'inactive').map((stage, idx, activeStagesList) => {
                const isEditing = editingStageId === stage.id;
                const dynamicOrder = idx + 1;

                return (
                  <React.Fragment key={stage.id || idx}>
                    {isEditing ? (
                      <InPageReviewStateBuilder
                        key={`edit-${stage.id}`}
                        editStage={stage}
                        nextStageOrder={dynamicOrder}
                        allStages={reviewStates}
                        onClose={() => setEditingStageId(null)}
                        onSaved={() => {
                          loadAllSettings();
                          setEditingStageId(null);
                        }}
                        showNotification={showNotification}
                      />
                    ) : (
                      <div className="state-section-card">
                        {/* Section Header */}
                        <div className="state-section-header">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                            <span className="state-badge-num">
                              {dynamicOrder}
                            </span>
                            <strong style={{ fontSize: '15px', color: 'var(--fc-text-main)' }}>
                              {stage.unique_name || stage.name}
                            </strong>
                            <span className="criteria-chip" style={{ background: '#e0f2fe', color: '#0369a1', borderColor: '#bae6fd', display: 'inline-flex', alignItems: 'center' }}>
                              {stage.jury_assignment_mode === 'manual' ? (
                                <>
                                  <PersonIcon size={13} style={{ marginRight: '4px' }} />
                                  <span>Manual Jury Assignment</span>
                                </>
                              ) : (
                                <>
                                  <FlashOnIcon size={13} style={{ marginRight: '4px' }} />
                                  <span>{stage.jury_auto_rule === 'n_jury' ? `Auto: ${stage.jury_count_per_film || 1} Jurors / Film` : 'Auto: All Jurors'}</span>
                                </>
                              )}
                            </span>
                            <span className="criteria-chip" style={{ background: '#f5f3ff', color: '#7c3aed', borderColor: '#ddd6fe' }}>
                              {stage.review_type === 'pass_fail' || (stage.review_type === 'vote_based' && stage.vote_mode === 'single')
                                ? 'Pass / Fail'
                                : (stage.review_type === 'vote_nomination' || stage.review_type === 'vote_based'
                                    ? 'Vote / Nomination'
                                    : `${stage.star_scale || 5}-Star Rating`)}
                            </span>
                            <span className="criteria-chip" style={{ background: (stage.notes_requirement === 'required' || stage.notes_required === 'required') ? '#fef3c7' : '#f1f5f9', color: (stage.notes_requirement === 'required' || stage.notes_required === 'required') ? '#b45309' : '#475569', borderColor: (stage.notes_requirement === 'required' || stage.notes_required === 'required') ? '#fde68a' : '#cbd5e1' }}>
                              Notes: {(stage.notes_requirement === 'required' || stage.notes_required === 'required') ? 'Mandatory Critique' : 'Optional Notes'}
                            </span>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <label
                              className="fc-toggle-switch"
                              title="Click to mark stage as Inactive"
                              style={{ verticalAlign: 'middle', cursor: 'pointer' }}
                            >
                              <input
                                type="checkbox"
                                checked={true}
                                onChange={() => handleToggleStageStatus(stage)}
                              />
                              <span className="fc-toggle-slider" />
                            </label>
                            <button
                              type="button"
                              className="fc-stage-status-btn active"
                              onClick={() => handleToggleStageStatus(stage)}
                              title="Click to deactivate stage"
                              style={{ display: 'inline-flex', alignItems: 'center' }}
                            >
                              <CheckCircleIcon size={13} style={{ marginRight: '4px' }} />
                              <span>Active</span>
                            </button>
                            <button
                              type="button"
                              className="fc-btn fc-btn-outline fc-btn-sm"
                              onClick={() => handleToggleEditStage(stage.id)}
                              style={{ display: 'inline-flex', alignItems: 'center' }}
                            >
                              <EditIcon size={13} style={{ marginRight: '4px' }} />
                              <span>Edit Stage</span>
                            </button>
                          </div>
                        </div>

                        {/* Section Body (Scoring & Scale) */}
                        <div className="state-section-body" style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', gap: '32px', flexWrap: 'wrap', background: 'var(--fc-surface, #faf9f7)', borderTop: '1px solid var(--fc-border)' }}>
                          <div>
                            <span className="state-sub-col-title" style={{ marginBottom: '4px' }}>SCORING MODE</span>
                            <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--fc-text-main)' }}>
                              {stage.review_type === 'pass_fail' || (stage.review_type === 'vote_based' && stage.vote_mode === 'single')
                                ? 'Pass / Fail'
                                : (stage.review_type === 'vote_nomination' || stage.review_type === 'vote_based'
                                    ? 'Vote / Nomination'
                                    : 'Star Rating')}
                            </div>
                          </div>

                          <div style={{ width: '1px', height: '28px', background: 'var(--fc-border)', alignSelf: 'center' }}></div>

                          <div>
                            <span className="state-sub-col-title" style={{ marginBottom: '4px' }}>EVALUATION SCALE</span>
                            <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--fc-text-main)' }}>
                              {stage.review_type === 'pass_fail' || (stage.review_type === 'vote_based' && stage.vote_mode === 'single')
                                ? 'Binary Gate'
                                : (stage.review_type === 'vote_nomination' || stage.review_type === 'vote_based'
                                    ? 'Nominate / Consider'
                                    : `${stage.star_scale || 5} Stars`)}
                            </div>
                          </div>

                          <div style={{ width: '1px', height: '28px', background: 'var(--fc-border)', alignSelf: 'center' }}></div>

                          <div>
                            <span className="state-sub-col-title" style={{ marginBottom: '4px' }}>REVIEW NOTES</span>
                            <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--fc-text-main)' }}>
                              {(stage.notes_requirement === 'required' || stage.notes_required === 'required') ? 'Mandatory Critique' : 'Optional Notes'}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {idx < activeStagesList.length - 1 && (
                      <div className="flow-connector-step">
                        <ArrowForwardIcon size={13} style={{ marginRight: '5px' }} />
                        <span>Sequential Promotion to Stage {dynamicOrder + 1}: {activeStagesList[idx + 1]?.unique_name}</span>
                      </div>
                    )}
                  </React.Fragment>
                );
              })}

              {/* Flow Connector to Next Stage */}
              <div className="flow-connector-step">
                <ArrowForwardIcon size={13} style={{ marginRight: '5px' }} />
                <span>Sequential Promotion to Stage {reviewStates.filter(s => s.status !== 'inactive').length + 1}: {isAddingStage ? 'Dynamic Review-State' : 'New Review-State'}</span>
              </div>

              {/* ── INTERACTIVE IN-PAGE STAGE BUILDER ── */}
              {isAddingStage ? (
                <InPageReviewStateBuilder
                  nextStageOrder={reviewStates.filter(s => s.status !== 'inactive').length + 1}
                  allStages={reviewStates}
                  onClose={() => setIsAddingStage(false)}
                  onCreated={() => {
                    loadAllSettings();
                    setIsAddingStage(false);
                  }}
                  showNotification={showNotification}
                />
              ) : (
                <div
                  className="fc-stage-add-dashed-card animate-fade-in"
                  onClick={handleToggleAddStage}
                  title="Click to add and configure a new review state in the pipeline"
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--fc-brand, #a82f2f)', fontWeight: 800, fontSize: '14px' }}>
                    <span style={{ fontSize: '16px' }}>+</span>
                    <span>Add Dynamic Review-State (Stage #{reviewStates.filter(s => s.status !== 'inactive').length + 1})</span>
                  </div>
                  <p style={{ margin: 0, fontSize: '12px', color: '#78716c' }}>
                    Configure review scoring, jury assignment, and completion rules directly in the page.
                  </p>
                </div>
              )}
            </div>

            {/* ── INACTIVE / BYPASSED REVIEW STAGES ── */}
            {reviewStates.filter(s => s.status === 'inactive').length > 0 && (
              <div style={{ marginTop: '36px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#64748b', letterSpacing: '-0.2px', margin: 0 }}>
                      Inactive / Bypassed Review Stages
                    </h3>
                    <span style={{ background: '#f1f5f9', color: '#64748b', border: '1px solid #cbd5e1', padding: '2px 9px', borderRadius: '999px', fontSize: '11px', fontWeight: 700 }}>
                      {reviewStates.filter(s => s.status === 'inactive').length} {reviewStates.filter(s => s.status === 'inactive').length === 1 ? 'stage' : 'stages'}
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>
                    These stages are excluded from the sequential review pipeline. Toggle to reactivate into the pipeline.
                  </p>
                </div>

                <div className="settings-sections-stack">
                  {reviewStates.filter(s => s.status === 'inactive').map((stage) => {
                    const isEditing = editingStageId === stage.id;

                    return (
                      <React.Fragment key={stage.id}>
                        {isEditing ? (
                          <InPageReviewStateBuilder
                            key={`edit-${stage.id}`}
                            editStage={stage}
                            nextStageOrder={reviewStates.filter(s => s.status !== 'inactive').length + 1}
                            allStages={reviewStates}
                            onClose={() => setEditingStageId(null)}
                            onSaved={() => {
                              loadAllSettings();
                              setEditingStageId(null);
                            }}
                            showNotification={showNotification}
                          />
                        ) : (
                          <div
                            className="state-section-card"
                            style={{ opacity: 0.85, borderColor: '#cbd5e1', background: '#fafaf9', borderStyle: 'dashed' }}
                          >
                            {/* Header */}
                            <div className="state-section-header">
                              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                                <span className="state-badge-num" style={{ background: '#94a3b8', color: '#fff' }}>
                                  —
                                </span>
                                <strong style={{ fontSize: '15px', color: '#64748b' }}>
                                  {stage.unique_name || stage.name}
                                  <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#94a3b8', marginLeft: '6px' }}>
                                    (Inactive)
                                  </span>
                                </strong>
                                <span className="criteria-chip" style={{ background: '#f1f5f9', color: '#64748b', borderColor: '#cbd5e1' }}>
                                  {stage.jury_assignment_mode === 'manual'
                                    ? '👤 Manual Jury Assignment'
                                    : (stage.jury_auto_rule === 'n_jury'
                                        ? `⚡ Auto: ${stage.jury_count_per_film || 1} Jurors / Film`
                                        : '⚡ Auto: All Jurors')}
                                </span>
                                <span className="criteria-chip" style={{ background: '#f1f5f9', color: '#64748b', borderColor: '#cbd5e1' }}>
                                  {stage.review_type === 'pass_fail' || (stage.review_type === 'vote_based' && stage.vote_mode === 'single')
                                    ? 'Pass / Fail'
                                    : (stage.review_type === 'vote_nomination' || stage.review_type === 'vote_based'
                                        ? 'Vote / Nomination'
                                        : `${stage.star_scale || 5}-Star Rating`)}
                                </span>
                                <span className="criteria-chip" style={{ background: '#fef3c7', color: '#b45309', borderColor: '#fde68a' }}>
                                  Bypassed in pipeline
                                </span>
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <label
                                  className="fc-toggle-switch"
                                  title="Click to reactivate this stage into the pipeline"
                                  style={{ verticalAlign: 'middle', cursor: 'pointer' }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={false}
                                    onChange={() => handleToggleStageStatus(stage)}
                                  />
                                  <span className="fc-toggle-slider" />
                                </label>
                                <button
                                  type="button"
                                  className="fc-stage-status-btn inactive"
                                  onClick={() => handleToggleStageStatus(stage)}
                                  title="Click to reactivate into pipeline"
                                >
                                  ○ Inactive
                                </button>
                                <button
                                  type="button"
                                  className="fc-btn fc-btn-outline fc-btn-sm"
                                  onClick={() => handleToggleEditStage(stage.id)}
                                >
                                  ✎ Edit Stage
                                </button>
                              </div>
                            </div>

                            {/* Body */}
                            <div className="state-section-body" style={{ padding: '14px 24px', display: 'flex', alignItems: 'center', gap: '32px', flexWrap: 'wrap', background: 'var(--fc-surface, #f8fafc)', borderTop: '1px solid var(--fc-border, #e2e8f0)' }}>
                              <div>
                                <span className="state-sub-col-title" style={{ marginBottom: '4px' }}>SCORING MODE</span>
                                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--fc-text-secondary, #64748b)' }}>
                                  {stage.review_type === 'pass_fail' || (stage.review_type === 'vote_based' && stage.vote_mode === 'single')
                                    ? 'Pass / Fail'
                                    : (stage.review_type === 'vote_nomination' || stage.review_type === 'vote_based'
                                        ? 'Vote / Nomination'
                                        : 'Star Rating')}
                                </div>
                              </div>
                              <div style={{ width: '1px', height: '24px', background: 'var(--fc-border, #e2e8f0)' }}></div>
                              <div>
                                <span className="state-sub-col-title" style={{ marginBottom: '4px' }}>EVALUATION SCALE</span>
                                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--fc-text-secondary, #64748b)' }}>
                                  {stage.review_type === 'pass_fail' || (stage.review_type === 'vote_based' && stage.vote_mode === 'single')
                                    ? 'Binary Gate'
                                    : (stage.review_type === 'vote_nomination' || stage.review_type === 'vote_based'
                                        ? 'Nominate / Consider'
                                        : `${stage.star_scale || 5} Stars`)}
                                </div>
                              </div>
                              <div style={{ width: '1px', height: '24px', background: 'var(--fc-border, #e2e8f0)' }}></div>
                              <div>
                                <span className="state-sub-col-title" style={{ marginBottom: '4px' }}>PIPELINE STATUS</span>
                                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--fc-text-muted, #94a3b8)' }}>
                                  Removed from active workflow
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
