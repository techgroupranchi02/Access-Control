import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import api from '../../services/api';
import { CloseIcon, FlashOnIcon, StarIcon, CancelIcon } from '../common/Icons';

export default function StageCompletionModal({
  isOpen,
  onClose,
  stage,
  qualifyingCount = 0,
  rejectCount = 0,
  totalCount = 0,
  onSuccess
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen || !stage) return null;

  const stageName = stage.unique_name || stage.name || `Stage ${stage.stage_order}`;
  const advanceCutoff = parseFloat(stage.auto_advance_cutoff) || 3.8;
  const rejectCutoff = parseFloat(stage.auto_reject_cutoff) || 2.5;

  const handleExecute = async () => {
    try {
      setSubmitting(true);
      setError('');
      const res = await api.post('/reviews/complete-stage', {
        stage_id: stage.id,
        stage_order: stage.stage_order
      });

      if (onSuccess) {
        onSuccess(res.data);
      }
      onClose();
    } catch (err) {
      console.error('Stage completion error:', err);
      setError(err.response?.data?.error || 'Failed to complete review stage.');
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    <div className="fc-modal-overlay" onClick={onClose}>
      <div className="fc-modal-card fc-modal-box" style={{ maxWidth: '540px' }} onClick={e => e.stopPropagation()}>
        <div className="fc-modal-header modal-header">
          <div>
            <h3 className="fc-modal-title modal-title">Complete Stage & Advance</h3>
            <p className="fc-modal-subtitle" style={{ fontSize: '13px', color: 'var(--fc-text-secondary)', marginTop: '2px' }}>
              Execution for <strong>{stageName}</strong> (Stage {stage.stage_order} of 6)
            </p>
          </div>
          <button type="button" className="fc-modal-close modal-close-btn" onClick={onClose} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CloseIcon size={14} />
          </button>
        </div>

        <div className="fc-modal-body modal-body">
          {error && (
            <div className="fc-alert-danger" style={{ marginBottom: '14px', padding: '10px', borderRadius: '6px', background: '#fee2e2', color: '#b91c1c' }}>
              {error}
            </div>
          )}

          <div style={{ background: 'var(--fc-surface, #faf8f5)', border: '1px solid var(--fc-border)', borderRadius: '10px', padding: '16px', marginBottom: '16px' }}>
            <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--fc-text-muted)', textTransform: 'uppercase', marginBottom: '10px' }}>
              AUTOMATED TRANSITION RULES
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: '8px', background: 'rgba(34, 197, 94, 0.12)', border: '1px solid rgba(34, 197, 94, 0.3)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FlashOnIcon size={18} style={{ color: '#86efac' }} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '13px', color: '#86efac' }}>
                      Auto-Advancement Cutoff
                    </div>
                    <div style={{ fontSize: '11px', color: '#4ade80', display: 'flex', alignItems: 'center', gap: '2px' }}>
                      Films scoring <strong>≥ {advanceCutoff.toFixed(1)}</strong> <StarIcon size={11} style={{ color: '#eab308' }} /> advance to Stage {stage.stage_order + 1}
                    </div>
                  </div>
                </div>
                <span style={{ fontWeight: 800, fontSize: '14px', color: '#86efac' }}>
                  {qualifyingCount} films
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <CancelIcon size={18} style={{ color: '#fca5a5' }} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '13px', color: '#fca5a5' }}>
                      Auto-Rejection Threshold
                    </div>
                    <div style={{ fontSize: '11px', color: '#f87171', display: 'flex', alignItems: 'center', gap: '2px' }}>
                      Films scoring <strong>&lt; {rejectCutoff.toFixed(1)}</strong> <StarIcon size={11} style={{ color: '#eab308' }} /> marked as Rejected
                    </div>
                  </div>
                </div>
                <span style={{ fontWeight: 800, fontSize: '14px', color: '#fca5a5' }}>
                  {rejectCount} films
                </span>
              </div>
            </div>
          </div>

          <p style={{ fontSize: '13px', color: 'var(--fc-text-secondary)', lineHeight: 1.5 }}>
            Executing this action will transition this stage to <strong>Completed</strong> and activate the next sequential stage in the pipeline. All status updates and audit logs will be permanently recorded.
          </p>
        </div>

        <div className="fc-modal-footer modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button
            type="button"
            className="fc-btn fc-btn-outline"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="fc-btn fc-btn-primary"
            onClick={handleExecute}
            disabled={submitting}
          >
            {submitting ? 'Executing Transition...' : 'Confirm & Execute Stage Advancement'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
