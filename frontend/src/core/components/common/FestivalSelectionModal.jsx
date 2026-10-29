/**
 * FestivalSelectionModal Component
 * Interactive workspace chooser for users who administer or own multiple festivals.
 * Displays each festival as an interactive workspace card with edition, role, and live status.
 */

import React from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon, MovieIcon, CheckCircleIcon } from './Icons';

export default function FestivalSelectionModal({
  isOpen,
  onClose,
  festivals = [],
  currentFestival,
  onSelectFestival,
  user
}) {
  if (!isOpen) return null;

  const canDismiss = Boolean(currentFestival);

  const getFestivalInitials = (name) => {
    if (!name) return 'FF';
    const words = name.trim().split(/\s+/).filter(w => !['and', '&', 'of', 'the', 'for', 'in'].includes(w.toLowerCase()));
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
  };

  return createPortal(
    <div
      className="fc-festival-modal-overlay"
      onClick={() => {
        if (canDismiss) onClose();
      }}
    >
      <div
        className="fc-festival-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="fc-festival-modal-header">
          <div>
            <div className="fc-festival-modal-tag">
              <MovieIcon size={14} />
              <span>ffesti Plus Festival Operating System</span>
            </div>
            <h2 className="fc-festival-modal-title">
              {currentFestival ? 'Switch Festival Workspace' : 'Select Festival Workspace'}
            </h2>
            <p className="fc-festival-modal-subtitle">
              {currentFestival
                ? `Currently working in ${currentFestival.name}. Choose another festival workspace:`
                : (user?.email
                  ? `Logged in as ${user.name || user.email}. Choose which festival workspace to enter:`
                  : 'Choose the festival operating system you want to manage:')
              }
            </p>
          </div>

          {canDismiss && (
            <button
              type="button"
              onClick={onClose}
              className="fc-festival-modal-close-btn"
              aria-label="Close modal"
            >
              <CloseIcon size={16} />
            </button>
          )}
        </div>

        {/* Festival Cards List */}
        <div className="fc-festival-modal-body">
          {festivals.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '36px 0', color: 'var(--fc-text-muted)' }}>
              No festivals registered for this account yet.
            </div>
          ) : (
            festivals.map((fest) => {
              const isCurrent = currentFestival?.id === fest.id;
              const initials = getFestivalInitials(fest.name);

              return (
                <div
                  key={fest.id}
                  onClick={() => onSelectFestival(fest)}
                  className={`fc-festival-workspace-item ${isCurrent ? 'is-active' : ''}`}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', minWidth: 0, flex: 1 }}>
                    {/* Visual Badge / Initials */}
                    <div className="fc-festival-avatar-box">
                      {initials}
                    </div>

                    {/* Metadata */}
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="fc-festival-item-name">
                        {fest.name}
                      </div>

                      <div className="fc-festival-item-meta">
                        <span>{fest.edition || '2026 Edition'}</span>
                        <span>•</span>
                        <span className="fc-festival-item-role">
                          {fest.role_label || (fest.is_owner ? 'Festival Owner · Admin' : 'Team Member')}
                        </span>
                      </div>

                      <div className="fc-festival-live-row">
                        <span className="fc-festival-live-dot" />
                        <span className="fc-festival-live-text">
                          Live · Accepting Submissions
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right Action Button / Status */}
                  <div style={{ marginLeft: '16px', flexShrink: 0 }}>
                    {isCurrent ? (
                      <span className="fc-festival-active-pill">
                        <CheckCircleIcon size={14} /> Active
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="fc-festival-enter-btn"
                      >
                        {currentFestival ? 'Switch to →' : 'Enter →'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="fc-festival-modal-footer">
          <span>You can switch between festivals anytime from the sidebar.</span>
          <span className="fc-festival-modal-footer-count">{festivals.length} Workspaces Available</span>
        </div>
      </div>
    </div>,
    document.body
  );
}
