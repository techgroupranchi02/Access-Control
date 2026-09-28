import React, { useState } from 'react';
import api from '../../services/api';

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

  return (
    <div className="fc-modal-overlay" onClick={onClose}>
      <div className="fc-modal-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="fc-modal-header">
          <div>
            <h3 className="fc-modal-title">Reject Submission</h3>
            <p className="fc-modal-subtitle">
              Provide feedback for <strong>{film.title}</strong> by {film.director || 'Filmmaker'}.
            </p>
          </div>
          <button type="button" className="fc-modal-close" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="fc-modal-body">
            {error && <div className="fc-alert-danger">{error}</div>}
            
            <label className="fc-form-label">
              Rejection Reason <span style={{ color: '#dc2626' }}>*</span>
            </label>
            <textarea
              className="fc-form-textarea"
              rows={4}
              placeholder="Explain the rejection decision for the filmmaker (minimum 10 characters)..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={loading}
              autoFocus
            />
            <div className="fc-form-hint" style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
              <span>Characters: {len} / 10 minimum</span>
              {len >= 10 ? (
                <span style={{ color: '#16a34a', fontWeight: 500 }}>✓ Minimum met</span>
              ) : (
                <span style={{ color: '#94a3b8' }}>{10 - len} more needed</span>
              )}
            </div>
          </div>

          <div className="fc-modal-footer">
            <button type="button" className="fc-btn-secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button
              type="submit"
              className="fc-btn-danger"
              disabled={loading || len < 10}
            >
              {loading ? 'Rejecting...' : 'Confirm Reject'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
