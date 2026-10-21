import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import api from '../../services/api';
import { CloseIcon, FlashOnIcon } from '../common/Icons';

export default function BulkAssignModal({
  isOpen,
  onClose,
  selectedFilmIds = [],
  selectedFilms = [],
  stages = [],
  availableJury = [],
  initialJuryIds = [],
  roundNumber,
  stageId,
  onSuccess
}) {
  const [selectedJuryIds, setSelectedJuryIds] = useState(initialJuryIds || []);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Sync initialJuryIds when opening modal
  React.useEffect(() => {
    if (isOpen) {
      setSelectedJuryIds(initialJuryIds || []);
      setError('');
    }
  }, [isOpen, initialJuryIds]);

  if (!isOpen) return null;

  const selectedFilmsList = Array.isArray(selectedFilms) && selectedFilms.length > 0
    ? selectedFilms
    : [];

  const hasSubmittedFilms = selectedFilmsList.some(
    f => !f.review_state_id || f.current_stage_name === 'Submitted' || f.status === 'Submitted'
  );

  const stage1Name = stages && stages.length > 0 ? (stages[0].unique_name || stages[0].name) : 'Round 1: Screening';
  const singleFilmTitle = selectedFilmsList.length === 1 ? selectedFilmsList[0].title : null;

  const toggleJury = (juryId) => {
    setSelectedJuryIds(prev =>
      prev.includes(juryId) ? prev.filter(id => id !== juryId) : [...prev, juryId]
    );
  };

  const selectAll = () => {
    if (selectedJuryIds.length === availableJury.length) {
      setSelectedJuryIds([]);
    } else {
      setSelectedJuryIds(availableJury.map(j => j.id));
    }
  };

  const handleAssign = async (e) => {
    e.preventDefault();
    if (selectedJuryIds.length === 0 && selectedFilmIds.length > 1) {
      setError('Please select at least one jury member to assign.');
      return;
    }

    try {
      setSubmitting(true);
      setError('');
      await api.post('/submissions/bulk-assign', {
        film_ids: selectedFilmIds,
        submission_ids: selectedFilmIds,
        jury_user_ids: selectedJuryIds,
        jury_ids: selectedJuryIds,
        round_number: roundNumber,
        stage_id: stageId,
        replace: selectedFilmIds.length === 1
      });

      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      console.error('Bulk assign error:', err);
      setError(err.response?.data?.error || 'Failed to assign jury members.');
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    <div className="fc-modal-overlay" onClick={onClose}>
      <div className="fc-modal-card fc-modal-box" style={{ maxWidth: '530px' }} onClick={e => e.stopPropagation()}>
        <div className="fc-modal-header modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {hasSubmittedFilms && (
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background: 'rgba(168, 47, 47, 0.1)',
                  color: 'var(--fc-brand, #a82f2f)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}
              >
                <FlashOnIcon size={18} />
              </div>
            )}
            <div>
              <h3 className="fc-modal-title modal-title" style={{ margin: 0, fontSize: '16px', fontWeight: 750, color: 'var(--fc-text-main)' }}>
                {hasSubmittedFilms
                  ? `Advance & Assign to ${stage1Name}`
                  : 'Assign Reviewers'
                }
              </h3>
              <p className="fc-modal-subtitle" style={{ fontSize: '13px', color: 'var(--fc-text-secondary)', marginTop: '2px', margin: 0 }}>
                {hasSubmittedFilms
                  ? (singleFilmTitle
                      ? `Promote "${singleFilmTitle}" from Submitted to ${stage1Name} and assign reviewers`
                      : `Promote ${selectedFilmIds.length} submitted films to ${stage1Name} and assign reviewers`
                    )
                  : `Assign reviewers to ${selectedFilmIds.length} selected films`
                }
              </p>
            </div>
          </div>
          <button type="button" className="fc-modal-close modal-close-btn" onClick={onClose} aria-label="Close modal">
            <CloseIcon size={14} />
          </button>
        </div>

        <form onSubmit={handleAssign} style={{ margin: 0 }}>
          <div className="fc-modal-body modal-body" style={{ padding: '20px 24px' }}>
            {error && (
              <div
                className="fc-alert-danger"
                style={{
                  marginBottom: '14px',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  background: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: 'var(--fc-rejected-title, #ef4444)',
                  fontSize: '13px'
                }}
              >
                {error}
              </div>
            )}

            {/* Option 3 Unified Workflow Notice for Submitted Films */}
            {hasSubmittedFilms && (
              <div className="fc-unified-notice-banner">
                <FlashOnIcon size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                <div className="fc-unified-notice-text">
                  <strong>Unified Stage Advance:</strong> Because {selectedFilmIds.length > 1 ? 'these films are' : 'this film is'} currently in <em>Submitted (Intake)</em>, assigning reviewers will automatically transition {selectedFilmIds.length > 1 ? 'them' : 'it'} to <strong>{stage1Name}</strong> and activate each reviewer's scorecard.
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--fc-text-muted, #64748b)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                AVAILABLE REVIEWERS ({availableJury.length})
              </span>
              <button
                type="button"
                onClick={selectAll}
                className="fc-btn-subtle"
                style={{ fontSize: '12px', cursor: 'pointer', background: 'none', border: 'none', color: 'var(--fc-brand, #a82f2f)', fontWeight: 600 }}
              >
                {selectedJuryIds.length === availableJury.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>

            <div
              style={{
                maxHeight: '260px',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                border: '1px solid var(--fc-border)',
                borderRadius: '8px',
                padding: '8px'
              }}
            >
              {availableJury.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--fc-text-muted, #64748b)', fontSize: '13px' }}>
                  No active jury members found. Please configure jury users first.
                </div>
              ) : (
                availableJury.map(jury => {
                  const isChecked = selectedJuryIds.includes(jury.id);
                  const displayName = jury.name || jury.email || `Jury #${jury.id}`;
                  return (
                    <label
                      key={jury.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '9px 12px',
                        borderRadius: '6px',
                        background: isChecked ? 'rgba(225, 29, 72, 0.12)' : 'var(--fc-surface-card)',
                        border: isChecked ? '1px solid rgba(225, 29, 72, 0.35)' : '1px solid var(--fc-border)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleJury(jury.id)}
                        style={{ accentColor: 'var(--fc-brand)', width: '16px', height: '16px', cursor: 'pointer' }}
                      />
                      <div
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '50%',
                          overflow: 'hidden',
                          flexShrink: 0,
                          background: 'var(--fc-brand, #a82f2f)',
                          color: '#ffffff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '11px',
                          fontWeight: 700,
                          position: 'relative'
                        }}
                      >
                        {(jury.thumbnailPic || jury.thumbnail) ? (
                          <img
                            src={jury.thumbnailPic || jury.thumbnail}
                            alt={displayName}
                            style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                              if (e.currentTarget.nextSibling) e.currentTarget.nextSibling.style.display = 'flex';
                            }}
                          />
                        ) : null}
                        <span style={{ display: (jury.thumbnailPic || jury.thumbnail) ? 'none' : 'flex', width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
                          {(displayName || 'U').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
                        </span>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 650, fontSize: '13px', color: 'var(--fc-text-main)' }}>
                          {displayName}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--fc-text-muted)' }}>
                          {jury.role || 'Screening Jury'} · {jury.email}
                        </div>
                      </div>
                    </label>
                  );
                })
              )}
            </div>

            <p style={{ marginTop: '12px', marginBottom: 0, fontSize: '12px', color: 'var(--fc-text-secondary, #64748b)', lineHeight: 1.4 }}>
              Assigned jury members will have these films visible in their personal evaluation queue under <code>scope_key: assigned</code>.
            </p>
          </div>

          <div
            className="fc-modal-footer modal-footer"
            style={{
              padding: '16px 24px',
              background: 'var(--fc-surface)',
              borderTop: '1px solid var(--fc-border)',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px'
            }}
          >
            <button
              type="button"
              className="fc-btn fc-btn-outline"
              onClick={onClose}
              disabled={submitting}
              style={{ minWidth: '80px', padding: '8px 16px', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="fc-btn fc-btn-primary"
              disabled={submitting || selectedJuryIds.length === 0}
              style={{
                minWidth: '150px',
                padding: '8px 18px',
                borderRadius: '6px',
                fontWeight: 600,
                cursor: (submitting || selectedJuryIds.length === 0) ? 'not-allowed' : 'pointer',
                background: 'var(--fc-brand, #a82f2f)',
                color: '#ffffff',
                border: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px'
              }}
            >
              {submitting
                ? (hasSubmittedFilms ? 'Promoting & Assigning...' : 'Assigning...')
                : (hasSubmittedFilms
                    ? (<><FlashOnIcon size={15} /> Move to Round 1 & Assign ({selectedJuryIds.length})</>)
                    : `Assign (${selectedJuryIds.length}) Jurors`
                  )
              }
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
