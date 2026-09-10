/**
 * Review & Scoring Pipeline Page
 * Core Module: review_dashboard
 * Permissions:
 * - review.view
 * - review.evaluate
 * - review.assign
 * - review.flag_dispute
 * - review.override_decision
 */

import { useState, useEffect } from 'react';
import api from '../services/api';
import PermissionGate from '../components/PermissionGate';
import { usePermissions } from '../hooks/usePermissions';

export default function ReviewPage() {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeReview, setActiveReview] = useState(null);
  const [evalScore, setEvalScore] = useState('');
  const [evalNotes, setEvalNotes] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const { can } = usePermissions();

  const loadReviews = async () => {
    try {
      const res = await api.get('/reviews');
      setReviews(res.data);
    } catch {
      console.error('Failed to load reviews');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReviews();
  }, []);

  const handleEvaluate = async (id) => {
    try {
      await api.put(`/reviews/${id}/evaluate`, { score: evalScore, notes: evalNotes });
      setStatusMsg(`Evaluation saved for submission #${id}.`);
      setActiveReview(null);
      setEvalScore('');
      setEvalNotes('');
      loadReviews();
    } catch {
      alert('Failed to evaluate review.');
    }
  };

  const handleDispute = async (id) => {
    try {
      await api.post(`/reviews/${id}/dispute`);
      setStatusMsg(`Review #${id} dispute flagged for committee.`);
      loadReviews();
    } catch {
      alert('Failed to flag dispute.');
    }
  };

  const handleOverride = async (id, decision) => {
    try {
      await api.post(`/reviews/${id}/override`, { decision });
      setStatusMsg(`Review #${id} decision overridden to ${decision}.`);
      loadReviews();
    } catch {
      alert('Failed to override decision.');
    }
  };

  const statusBadge = (status) => {
    const map = {
      'Completed': 'badge-success',
      'Disputed': 'badge-danger',
      'In Review': 'badge-warning',
      'Accepted': 'badge-success',
    };
    return map[status] || 'badge-muted';
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h2 className="page-title">⚖️ Review & Scoring Pipeline</h2>
        <p className="page-description">
          Evaluate submitted films, manage scoring disputes, and enforce committee decisions.
        </p>
      </div>

      {statusMsg && (
        <div className="alert alert-success" style={{ marginBottom: 'var(--space-md)' }}>
          {statusMsg}
        </div>
      )}

      {/* Permissions active overview */}
      <div className="alert alert-info" style={{ marginBottom: 'var(--space-lg)', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <span>🔑 <strong>Pipeline Permissions:</strong></span>
        <span className={`badge ${can('review.view') ? 'badge-success' : 'badge-danger'}`}>review.view</span>
        <span className={`badge ${can('review.evaluate') ? 'badge-success' : 'badge-danger'}`}>review.evaluate</span>
        <span className={`badge ${can('review.assign') ? 'badge-success' : 'badge-danger'}`}>review.assign</span>
        <span className={`badge ${can('review.flag_dispute') ? 'badge-success' : 'badge-danger'}`}>review.flag_dispute</span>
        <span className={`badge ${can('review.override_decision') ? 'badge-success' : 'badge-danger'}`}>review.override_decision</span>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <h3 className="card-title">Reviews Queue</h3>
            <p className="card-subtitle">Active submissions assigned for evaluation</p>
          </div>
        </div>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: '48px' }}></div>)}
          </div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Submission</th>
                  <th>Reviewer</th>
                  <th>Score</th>
                  <th>Status</th>
                  <th>Notes</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {reviews.map(item => (
                  <tr key={item.id}>
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{item.title}</td>
                    <td>Reviewer #{item.reviewerId}</td>
                    <td><span className="badge badge-info">{item.score !== null ? `${item.score}/10` : 'Not Scored'}</span></td>
                    <td><span className={`badge ${statusBadge(item.status)}`}>{item.status}</span></td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{item.notes || '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                        <PermissionGate permission="review.evaluate">
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => {
                              setActiveReview(item);
                              setEvalScore(item.score || '');
                              setEvalNotes(item.notes || '');
                            }}
                          >
                            ⭐ Score
                          </button>
                        </PermissionGate>

                        <PermissionGate permission="review.flag_dispute">
                          <button
                            className="btn btn-warning btn-sm"
                            onClick={() => handleDispute(item.id)}
                            disabled={item.disputeFlag}
                          >
                            ⚠️ Dispute
                          </button>
                        </PermissionGate>

                        <PermissionGate permission="review.override_decision">
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => handleOverride(item.id, 'Accepted')}
                          >
                            ⚡ Override
                          </button>
                        </PermissionGate>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Evaluate Modal/Card */}
      {activeReview && (
        <div className="card" style={{ marginTop: 'var(--space-lg)', border: '1px solid var(--color-primary)' }}>
          <div className="card-header">
            <div>
              <h3 className="card-title">Score Evaluation: {activeReview.title}</h3>
              <p className="card-subtitle"><span className="permission-section-badge">Requires: review.evaluate</span></p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-md)', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="form-group" style={{ marginBottom: 0, width: '120px' }}>
              <label className="form-label">Score (0-10)</label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="10"
                className="form-input"
                value={evalScore}
                onChange={e => setEvalScore(e.target.value)}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: '220px' }}>
              <label className="form-label">Feedback / Critique</label>
              <input
                className="form-input"
                placeholder="Enter scoring rationale..."
                value={evalNotes}
                onChange={e => setEvalNotes(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn-success btn-sm" onClick={() => handleEvaluate(activeReview.id)}>💾 Submit Score</button>
              <button className="btn btn-secondary btn-sm" onClick={() => setActiveReview(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
