import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import api from '../../services/api';
import { CloseIcon, FlashOnIcon, ArrowForwardIcon } from '../common/Icons';

export default function AdvanceFilmModal({ film, stages = [], onClose, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!film) return null;

  // Determine current stage and next sequential stage
  const currentStageName =
    film.current_stage_name ||
    film.stage_name ||
    (film.status && film.status !== 'Submitted' && film.status !== 'Under Review' && film.status !== 'Rejected'
      ? film.status
      : 'Submitted');

  let currentOrder = film.stage_order || 0;
  if (!currentOrder && stages && stages.length > 0) {
    const match = stages.find(
      (s) =>
        s.id === film.review_state_id ||
        s.unique_name === film.current_stage_name ||
        s.name === film.current_stage_name
    );
    if (match) currentOrder = match.stage_order;
  }

  const nextStage = stages.find((s) => s.stage_order > currentOrder && s.status !== 'inactive');
  const nextStageName = nextStage ? (nextStage.unique_name || nextStage.name) : 'Next Review Stage';

  const handleConfirm = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.post(`/submissions/${film.id}/advance`);
      if (onSuccess) {
        onSuccess(res.data);
      }
      onClose();
    } catch (err) {
      console.error('Failed to advance film:', err);
      setError(err.response?.data?.error || 'Failed to advance film.');
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div className="fc-modal-overlay" onClick={onClose}>
      <div
        className="fc-modal-card fc-modal-box"
        style={{ maxWidth: '490px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="fc-modal-header modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
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
            <div>
              <h3
                className="fc-modal-title modal-title"
                style={{ margin: 0, fontSize: '17px', fontWeight: 750, color: 'var(--fc-text-main, #111827)' }}
              >
                Advance Submission
              </h3>
              <p
                className="fc-modal-subtitle"
                style={{ margin: '2px 0 0 0', fontSize: '13px', color: 'var(--fc-text-secondary, #6b7280)' }}
              >
                Confirm stage promotion for this submission
              </p>
            </div>
          </div>
          <button
            type="button"
            className="fc-modal-close modal-close-btn"
            onClick={onClose}
            aria-label="Close modal"
          >
            <CloseIcon size={14} />
          </button>
        </div>

        <div className="fc-modal-body modal-body" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {error && (
            <div
              className="fc-alert-danger"
              style={{
                padding: '10px 14px',
                borderRadius: '8px',
                background: '#fee2e2',
                border: '1px solid #fca5a5',
                color: '#b91c1c',
                fontSize: '13px'
              }}
            >
              {error}
            </div>
          )}

          {/* Film Summary Box */}
          <div
            style={{
              padding: '12px 14px',
              borderRadius: '8px',
              background: 'var(--fc-surface, #f8fafc)',
              border: '1px solid var(--fc-border, #e2e8f0)',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px'
            }}
          >
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--fc-text-main, #1e293b)' }}>
              {film.title}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--fc-text-secondary, #64748b)' }}>
              Dir. {film.director || 'Filmmaker'} · {film.category || 'Standard'} {film.country ? `· ${film.country}` : ''}
            </div>
          </div>

          {/* Stage Progression Visual */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 16px',
              background: 'var(--fc-surface-card, #ffffff)',
              borderRadius: '8px',
              border: '1px solid var(--fc-border, #e5e7eb)',
              boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 700, color: 'var(--fc-text-muted, #94a3b8)', marginBottom: '4px' }}>
                Current Stage
              </div>
              <span
                style={{
                  display: 'inline-block',
                  padding: '3px 8px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 600,
                  background: 'var(--fc-surface-hover, #f1f5f9)',
                  color: 'var(--fc-text-secondary, #475569)'
                }}
              >
                {currentStageName}
              </span>
            </div>

            <div style={{ padding: '0 12px', color: 'var(--fc-brand, #a82f2f)', display: 'flex', alignItems: 'center' }}>
              <ArrowForwardIcon size={18} />
            </div>

            <div style={{ flex: 1, textAlign: 'right' }}>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 700, color: 'var(--fc-brand, #a82f2f)', marginBottom: '4px' }}>
                Next Stage
              </div>
              <span
                style={{
                  display: 'inline-block',
                  padding: '3px 8px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 600,
                  background: 'rgba(168, 47, 47, 0.08)',
                  color: 'var(--fc-brand, #a82f2f)',
                  border: '1px solid rgba(168, 47, 47, 0.2)'
                }}
              >
                {nextStageName}
              </span>
            </div>
          </div>

          {/* Explanatory text */}
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--fc-text-secondary, #475569)', lineHeight: 1.5 }}>
            Are you sure you want to advance this film? It will transition to the next review stage, and any configured jury auto-assignments will be automatically triggered.
          </p>
        </div>

        <div
          className="fc-modal-footer modal-footer"
          style={{
            padding: '16px 24px',
            background: 'var(--fc-surface, #faf8f5)',
            borderTop: '1px solid var(--fc-border, #e5e7eb)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px'
          }}
        >
          <button
            type="button"
            className="fc-btn fc-btn-outline"
            onClick={onClose}
            disabled={loading}
            style={{ minWidth: '80px', padding: '8px 16px', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            type="button"
            className="fc-btn fc-btn-primary"
            onClick={handleConfirm}
            disabled={loading}
            style={{
              minWidth: '130px',
              padding: '8px 18px',
              borderRadius: '6px',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              background: 'var(--fc-brand, #a82f2f)',
              color: '#ffffff',
              border: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px'
            }}
          >
            {loading ? 'Advancing...' : (<><FlashOnIcon size={14} /> Confirm Advance</>)}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
