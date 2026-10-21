import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import api from '../../services/api';
import { CloseIcon, CheckCircleIcon, InfoIcon } from '../common/Icons';

export default function RejectFilmModal({ film, onClose, onSuccess }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!film) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!reason || reason.trim().length < 10) {
      setError('Rejection reason must be at least 10 characters long to maintain filmmaker transparency.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      await api.post(`/submissions/${film.id}/reject`, { reason: reason.trim() });
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to reject submission.');
    } finally {
      setLoading(false);
    }
  };

  const len = reason.trim().length;

  return createPortal(
    <div className="fc-modal-overlay" onClick={onClose}>
      <div className="fc-modal-card fc-modal-box" style={{ maxWidth: '520px' }} onClick={(e) => e.stopPropagation()}>
        <div className="fc-modal-header modal-header">
          <div>
            <h3 className="fc-modal-title modal-title" style={{ margin: 0, fontSize: '17px', fontWeight: 750, color: 'var(--fc-text-main, #111827)' }}>
              Reject Submission
            </h3>
            <p className="fc-modal-subtitle" style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--fc-text-secondary, #6b7280)' }}>
              Provide feedback for <strong>{film.title}</strong> by {film.director || 'Filmmaker'}.
            </p>
          </div>
          <button type="button" className="fc-modal-close modal-close-btn" onClick={onClose} aria-label="Close modal">
            <CloseIcon size={14} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ margin: 0 }}>
          <div className="fc-modal-body modal-body" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {error && (
              <div className="fc-alert-danger" style={{ padding: '10px 14px', borderRadius: '8px', background: '#fee2e2', border: '1px solid #fca5a5', color: '#b91c1c', fontSize: '13px' }}>
                {error}
              </div>
            )}
            
            <div className="fc-form-group" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label className="fc-form-label" style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--fc-text-secondary, #475569)' }}>
                Rejection Reason <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <textarea
                className="fc-form-input fc-input"
                rows={4}
                placeholder="Explain the rejection decision for the filmmaker (minimum 10 characters)..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={loading}
                autoFocus
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--fc-border-strong, #cbd5e1)',
                  fontFamily: 'inherit',
                  fontSize: '14px',
                  lineHeight: '1.5',
                  resize: 'vertical',
                  boxSizing: 'border-box'
                }}
              />
              <div className="fc-form-hint" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px', fontSize: '12px' }}>
                <span style={{ color: 'var(--fc-text-muted, #64748b)' }}>Characters: {len} / 10 minimum</span>
                {len >= 10 ? (
                  <span style={{ color: '#16a34a', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <CheckCircleIcon size={13} /> Minimum met
                  </span>
                ) : (
                  <span style={{ color: '#94a3b8' }}>{10 - len} more needed</span>
                )}
              </div>
            </div>

            <div style={{ background: 'var(--fc-surface, #f8fafc)', border: '1px solid var(--fc-border, #e2e8f0)', borderRadius: '8px', padding: '10px 12px', fontSize: '12px', color: 'var(--fc-text-secondary, #64748b)', lineHeight: 1.4, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <InfoIcon size={16} style={{ color: 'var(--fc-brand, #a82f2f)', flexShrink: 0 }} />
              <span>This reason will be recorded on the submission timeline and shared with the filmmaker for full transparency.</span>
            </div>
          </div>

          <div className="fc-modal-footer modal-footer" style={{ padding: '16px 24px', background: 'var(--fc-surface, #faf8f5)', borderTop: '1px solid var(--fc-border, #e5e7eb)', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
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
              type="submit"
              className="fc-btn fc-btn-danger"
              disabled={loading || len < 10}
              style={{
                minWidth: '120px',
                padding: '8px 16px',
                borderRadius: '6px',
                fontWeight: 600,
                cursor: (loading || len < 10) ? 'not-allowed' : 'pointer',
                opacity: (loading || len < 10) ? 0.6 : 1,
                background: '#dc2626',
                color: '#ffffff',
                border: 'none'
              }}
            >
              {loading ? 'Rejecting...' : 'Confirm Reject'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
