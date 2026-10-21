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
      className="fc-modal-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(10, 11, 15, 0.72)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        animation: 'fcFadeIn 0.2s ease-out'
      }}
      onClick={() => {
        if (canDismiss) onClose();
      }}
    >
      <div
        className="fc-modal-card fc-modal-box"
        style={{
          width: '100%',
          maxWidth: '560px',
          background: 'var(--fc-surface, #ffffff)',
          border: '1px solid var(--fc-border, #e2d8cb)',
          borderRadius: '16px',
          boxShadow: '0 20px 45px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '24px 28px 18px',
            borderBottom: '1px solid var(--fc-border, #e2d8cb)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            background: 'var(--fc-surface-subtle, #faf8f5)'
          }}
        >
          <div>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'var(--fc-brand, #a82f2f)',
                marginBottom: '6px'
              }}
            >
              <MovieIcon size={14} />
              <span>Freecomers Festival Operating System</span>
            </div>
            <h2
              style={{
                fontSize: '20px',
                fontWeight: 800,
                color: 'var(--fc-text-primary, #1e293b)',
                margin: '0 0 4px',
                letterSpacing: '-0.02em'
              }}
            >
              {currentFestival ? 'Switch Festival Workspace' : 'Select Festival Workspace'}
            </h2>
            <p
              style={{
                fontSize: '13px',
                color: 'var(--fc-text-secondary, #64748b)',
                margin: 0,
                lineHeight: 1.4
              }}
            >
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
              className="fc-modal-close"
              aria-label="Close modal"
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--fc-text-muted, #94a3b8)',
                cursor: 'pointer',
                padding: '4px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--fc-text-primary)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--fc-text-muted)'; }}
            >
              <CloseIcon size={16} />
            </button>
          )}
        </div>

        {/* Festival Cards List */}
        <div
          style={{
            padding: '20px 28px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}
        >
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
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '16px 20px',
                    borderRadius: '12px',
                    border: isCurrent
                      ? '2px solid var(--fc-brand, #a82f2f)'
                      : '1.5px solid var(--fc-border, #e2d8cb)',
                    background: isCurrent
                      ? 'var(--fc-brand-subtle, rgba(168, 47, 47, 0.05))'
                      : 'var(--fc-surface, #ffffff)',
                    cursor: 'pointer',
                    transition: 'all 0.18s ease',
                    boxShadow: isCurrent ? '0 4px 14px rgba(168, 47, 47, 0.12)' : '0 1px 3px rgba(0,0,0,0.04)'
                  }}
                  onMouseEnter={(e) => {
                    if (!isCurrent) {
                      e.currentTarget.style.borderColor = 'var(--fc-brand, #a82f2f)';
                      e.currentTarget.style.transform = 'translateY(-1px)';
                      e.currentTarget.style.boxShadow = '0 6px 18px rgba(0,0,0,0.08)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isCurrent) {
                      e.currentTarget.style.borderColor = 'var(--fc-border, #e2d8cb)';
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)';
                    }
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', minWidth: 0, flex: 1 }}>
                    {/* Visual Badge / Initials */}
                    <div
                      style={{
                        width: '46px',
                        height: '46px',
                        borderRadius: '12px',
                        background: isCurrent
                          ? 'linear-gradient(135deg, #a82f2f 0%, #6b1414 100%)'
                          : 'linear-gradient(135deg, #475569 0%, #1e293b 100%)',
                        color: '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '15px',
                        fontWeight: 800,
                        letterSpacing: '0.04em',
                        flexShrink: 0,
                        boxShadow: '0 3px 8px rgba(0,0,0,0.15)'
                      }}
                    >
                      {initials}
                    </div>

                    {/* Metadata */}
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          fontSize: '15.5px',
                          fontWeight: 750,
                          color: 'var(--fc-text-primary, #0f172a)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          lineHeight: 1.3
                        }}
                      >
                        {fest.name}
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          marginTop: '4px',
                          fontSize: '12px',
                          color: 'var(--fc-text-secondary, #64748b)'
                        }}
                      >
                        <span>{fest.edition || '2026 Edition'}</span>
                        <span>•</span>
                        <span style={{ fontWeight: 600, color: 'var(--fc-brand, #a82f2f)' }}>
                          {fest.role_label || (fest.is_owner ? 'Festival Owner · Admin' : 'Team Member')}
                        </span>
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          marginTop: '6px'
                        }}
                      >
                        <span
                          style={{
                            width: '7px',
                            height: '7px',
                            borderRadius: '50%',
                            background: '#10b981',
                            display: 'inline-block'
                          }}
                        />
                        <span style={{ fontSize: '11px', fontWeight: 600, color: '#10b981' }}>
                          Live · Accepting Submissions
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right Action Button / Status */}
                  <div style={{ marginLeft: '16px', flexShrink: 0 }}>
                    {isCurrent ? (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          fontSize: '12px',
                          fontWeight: 700,
                          color: 'var(--fc-brand, #a82f2f)',
                          background: 'rgba(168, 47, 47, 0.12)',
                          padding: '6px 12px',
                          borderRadius: '20px'
                        }}
                      >
                        <CheckCircleIcon size={14} /> Active
                      </span>
                    ) : (
                      <button
                        type="button"
                        style={{
                          background: 'var(--fc-brand, #a82f2f)',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '8px',
                          padding: '8px 16px',
                          fontSize: '13px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          transition: 'all 0.15s ease'
                        }}
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
        <div
          style={{
            padding: '14px 28px',
            borderTop: '1px solid var(--fc-border, #e2d8cb)',
            background: 'var(--fc-surface-subtle, #faf8f5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '12px',
            color: 'var(--fc-text-muted, #64748b)'
          }}
        >
          <span>You can switch between festivals anytime from the sidebar.</span>
          <span style={{ fontWeight: 600 }}>{festivals.length} Workspaces Available</span>
        </div>
      </div>
    </div>,
    document.body
  );
}
