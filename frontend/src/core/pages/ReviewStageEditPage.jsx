import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../services/api';
import InPageReviewStateBuilder from '../components/settings/InPageReviewStateBuilder';
import { ArrowBackIcon, ScheduleIcon, WarningIcon } from '../components/common/Icons';

export default function ReviewStageEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [stage, setStage] = useState(null);
  const [allStages, setAllStages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notification, setNotification] = useState(null);

  const showNotification = (msg, type = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 4000);
  };

  useEffect(() => {
    if (!id) {
      setError('No review state ID provided.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    Promise.all([
      api.get(`/settings/review-states/${id}`),
      api.get('/settings/review-states')
    ])
      .then(([stageRes, statesRes]) => {
        if (stageRes.data?.data) {
          setStage(stageRes.data.data);
        } else {
          setError('Stage configuration not found.');
        }
        if (statesRes.data?.data && Array.isArray(statesRes.data.data)) {
          setAllStages(statesRes.data.data);
        }
      })
      .catch((err) => {
        console.error('Failed to load review state:', err);
        setError(err.response?.data?.error || 'Failed to fetch review state configuration.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [id]);

  const handleSaved = (savedStage) => {
    const stageTitle = savedStage?.unique_name || stage?.unique_name || 'Review stage';
    navigate('/settings/review-stage', {
      state: { msg: `"${stageTitle}" configuration saved and deployed successfully.` }
    });
  };

  const handleClose = () => {
    navigate('/settings/review-stage');
  };

  return (
    <div className="fc-settings-page animate-fade-in" style={{ paddingBottom: '80px' }}>
      {/* Toast Notification */}
      {notification && (
        <div
          className={`fc-notification-banner ${notification.type === 'error' ? 'fc-notif-error' : 'fc-notif-success'}`}
          style={{
            marginBottom: '16px',
            padding: '12px 18px',
            borderRadius: '8px',
            background: notification.type === 'error' ? '#fee2e2' : '#dcfce7',
            color: notification.type === 'error' ? '#b91c1c' : '#15803d',
            fontWeight: 600
          }}
        >
          {notification.msg}
        </div>
      )}

      {/* Breadcrumbs Navigation */}
      <nav style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--fc-text-secondary)', marginBottom: '16px' }}>
        <Link to="/settings" style={{ color: 'var(--fc-text-secondary)', textDecoration: 'none' }}>
          Settings
        </Link>
        <span>/</span>
        <Link to="/settings/review-stage" style={{ color: 'var(--fc-text-secondary)', textDecoration: 'none' }}>
          Review Stage
        </Link>
        <span>/</span>
        <span style={{ color: 'var(--fc-brand, #a82f2f)', fontWeight: 700 }}>
          {stage ? `Edit: ${stage.unique_name}` : `Edit Review Stage #${id}`}
        </span>
      </nav>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--fc-text-main)', letterSpacing: '-0.4px', margin: 0 }}>
              Edit Review Stage
            </h1>
            {stage && (
              <span
                style={{
                  display: 'inline-block',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  fontSize: '11px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  background: stage.status === 'inactive' ? 'var(--fc-surface-hover)' : 'rgba(34, 197, 94, 0.15)',
                  color: stage.status === 'inactive' ? 'var(--fc-text-muted)' : '#22c55e',
                  border: stage.status === 'inactive' ? '1px solid var(--fc-border)' : '1px solid rgba(34, 197, 94, 0.3)'
                }}
              >
                {stage.status === 'inactive' ? 'Inactive Stage' : `Active • Position #${stage.stage_order}`}
              </span>
            )}
          </div>
          <p style={{ fontSize: '13px', color: 'var(--fc-text-secondary)', marginTop: '4px', margin: 0 }}>
            {stage ? `Configure evaluation parameters, rubric criteria, sequence order, and jury permissions for "${stage.unique_name}".` : 'Loading configuration...'}
          </p>
        </div>
        <button
          type="button"
          className="fc-btn fc-btn-outline"
          onClick={handleClose}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <ArrowBackIcon size={14} /> Back to Pipeline
        </button>
      </div>

      {loading && (
        <div style={{ padding: '60px', textAlign: 'center', color: 'var(--fc-text-muted)' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '8px' }}>
            <ScheduleIcon size={24} />
          </div>
          Loading review state configuration...
        </div>
      )}

      {error && !loading && (
        <div style={{ padding: '32px', textAlign: 'center', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', color: '#b91c1c' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '8px' }}>
            <WarningIcon size={28} />
          </div>
          <div style={{ fontWeight: 700, marginBottom: '6px' }}>{error}</div>
          <p style={{ fontSize: '13px', color: '#7f1d1d', marginBottom: '16px' }}>
            Could not retrieve stage #{id}. The stage may have been removed or you might lack permissions.
          </p>
          <button
            type="button"
            className="fc-btn fc-btn-primary"
            onClick={handleClose}
          >
            Return to Review Pipeline
          </button>
        </div>
      )}

      {!loading && !error && stage && (
        <InPageReviewStateBuilder
          editStage={stage}
          nextStageOrder={stage.stage_order || 1}
          allStages={allStages}
          onClose={handleClose}
          onSaved={handleSaved}
          showNotification={showNotification}
        />
      )}
    </div>
  );
}
