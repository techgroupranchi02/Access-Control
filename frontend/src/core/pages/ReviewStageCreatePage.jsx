import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../services/api';
import InPageReviewStateBuilder from '../components/settings/InPageReviewStateBuilder';
import { ArrowBackIcon } from '../components/common/Icons';

export default function ReviewStageCreatePage() {
  const navigate = useNavigate();
  const [activeStagesCount, setActiveStagesCount] = useState(6);
  const [allStages, setAllStages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState(null);

  const showNotification = (msg, type = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 4000);
  };

  useEffect(() => {
    api.get('/settings/review-states')
      .then((res) => {
        const states = res.data?.data || [];
        setAllStages(states);
        const activeCount = states.filter(s => s.status !== 'inactive').length;
        setActiveStagesCount(activeCount);
      })
      .catch((err) => {
        console.error('Failed to load review states:', err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const handleCreated = () => {
    navigate('/settings/review-stage', {
      state: { msg: 'New dynamic review-stage created and deployed successfully.' }
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
          Create Review Stage
        </span>
      </nav>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--fc-text-main)', letterSpacing: '-0.4px', margin: 0 }}>
            Create New Review Stage
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--fc-text-secondary)', marginTop: '4px', margin: 0 }}>
            Configure scoring rubric, evaluation scale, jury permissions, and automated promotion logic.
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

      {loading ? (
        <div style={{ padding: '60px', textAlign: 'center', color: 'var(--fc-text-muted)' }}>
          Preparing stage builder...
        </div>
      ) : (
        <InPageReviewStateBuilder
          nextStageOrder={activeStagesCount + 1}
          allStages={allStages}
          onClose={handleClose}
          onCreated={handleCreated}
          showNotification={showNotification}
        />
      )}
    </div>
  );
}
