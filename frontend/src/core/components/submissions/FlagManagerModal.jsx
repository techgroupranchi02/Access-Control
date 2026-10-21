import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import api from '../../services/api';
import { CloseIcon, CheckIcon, AddIcon } from '../common/Icons';

const FESTIVAL_PALETTE = [
  { name: 'Crimson Red', hex: '#e05252' },
  { name: 'Coral Orange', hex: '#ea580c' },
  { name: 'Amber Gold', hex: '#d97706' },
  { name: 'Emerald Green', hex: '#10b981' },
  { name: 'Teal', hex: '#0d9488' },
  { name: 'Cyan Blue', hex: '#0284c7' },
  { name: 'Sapphire Blue', hex: '#2563eb' },
  { name: 'Indigo', hex: '#4f46e5' },
  { name: 'Royal Violet', hex: '#7c3aed' },
  { name: 'Magenta Pink', hex: '#db2777' },
  { name: 'Slate Gray', hex: '#64748b' },
  { name: 'Charcoal Black', hex: '#1c1917' }
];

export default function FlagManagerModal({
  isOpen,
  onClose,
  flags = [],
  onFlagsUpdated,
  showToast
}) {
  const [localFlags, setLocalFlags] = useState(flags);
  const [activeColorPickerId, setActiveColorPickerId] = useState(null);
  const [formModal, setFormModal] = useState({
    open: false,
    mode: 'add', // 'add' | 'edit'
    item: null,
    label: '',
    color: '#e05252',
    is_active: true
  });
  const [saving, setSaving] = useState(false);

  // Authoritative fetch from database when modal opens
  useEffect(() => {
    if (isOpen) {
      api.get('/settings/flags')
        .then(res => {
          if (res.data?.data && Array.isArray(res.data.data)) {
            const normalized = res.data.data.map(f => ({
              ...f,
              is_active: f.is_active === 0 || f.is_active === false || f.is_active === '0' ? 0 : 1
            }));
            setLocalFlags(normalized);
            if (onFlagsUpdated) onFlagsUpdated(normalized);
          }
        })
        .catch(err => {
          console.error('Failed to load authoritative flags:', err);
          if (Array.isArray(flags)) {
            const normalized = flags.map(f => ({
              ...f,
              is_active: f.is_active === 0 || f.is_active === false || f.is_active === '0' ? 0 : 1
            }));
            setLocalFlags(normalized);
          }
        });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const notify = (msg, type = 'success') => {
    if (showToast) showToast(msg, type);
  };

  const handleOpenAdd = () => {
    setActiveColorPickerId(null);
    setFormModal({
      open: true,
      mode: 'add',
      item: null,
      label: '',
      color: '#e05252',
      is_active: true
    });
  };

  const handleOpenEdit = (flag) => {
    setActiveColorPickerId(null);
    const flagIsActive = Boolean(flag.is_active === 1 || flag.is_active === true || flag.is_active === '1');
    setFormModal({
      open: true,
      mode: 'edit',
      item: flag,
      label: flag.label,
      color: flag.color || '#e05252',
      is_active: flagIsActive
    });
  };

  const handleQuickColorChange = async (flag, color) => {
    try {
      const updatedList = localFlags.map(f => (f.id === flag.id ? { ...f, color } : f));
      setLocalFlags(updatedList);
      if (onFlagsUpdated) onFlagsUpdated(updatedList);

      await api.put(`/settings/flags/${flag.id}`, { color });
      notify(`Flag "${flag.label}" color updated.`);
    } catch (err) {
      console.error('Failed to update flag color:', err);
      notify('Failed to update color.', 'error');
    }
  };

  const handleToggleActive = async (flag) => {
    const isCurrentlyActive = Boolean(flag.is_active === 1 || flag.is_active === true || flag.is_active === '1');
    const nextActive = !isCurrentlyActive;
    const nextActiveNum = nextActive ? 1 : 0;

    // Immediate optimistic UI update
    setLocalFlags(prev => {
      const next = prev.map(f => (f.id === flag.id ? { ...f, is_active: nextActiveNum } : f));
      if (onFlagsUpdated) onFlagsUpdated(next);
      return next;
    });

    try {
      const res = await api.put(`/settings/flags/${flag.id}`, { is_active: nextActive });
      const serverActive = res.data?.data?.is_active !== undefined
        ? (Boolean(res.data.data.is_active === 1 || res.data.data.is_active === true || res.data.data.is_active === '1') ? 1 : 0)
        : nextActiveNum;

      setLocalFlags(prev => {
        const next = prev.map(f => (f.id === flag.id ? { ...f, ...res.data?.data, is_active: serverActive } : f));
        if (onFlagsUpdated) onFlagsUpdated(next);
        return next;
      });
      notify(`Flag "${flag.label}" set to ${nextActive ? 'Active' : 'Inactive'}.`);
    } catch (err) {
      console.error('Failed to toggle flag active:', err);
      // Revert optimistic update
      setLocalFlags(prev => {
        const next = prev.map(f => (f.id === flag.id ? { ...f, is_active: isCurrentlyActive ? 1 : 0 } : f));
        if (onFlagsUpdated) onFlagsUpdated(next);
        return next;
      });
      notify('Failed to update flag status.', 'error');
    }
  };

  const handleDeleteFlag = async (flag) => {
    if (!window.confirm(`Are you sure you want to delete the flag "${flag.label}"?`)) return;

    try {
      await api.delete(`/settings/flags/${flag.id}`);
      const updatedList = localFlags.filter(f => f.id !== flag.id);
      setLocalFlags(updatedList);
      if (onFlagsUpdated) onFlagsUpdated(updatedList);
      notify(`Flag "${flag.label}" deleted.`);
    } catch (err) {
      console.error('Failed to delete flag:', err);
      notify('Failed to delete flag.', 'error');
    }
  };

  const handleSaveForm = async (e) => {
    e.preventDefault();
    if (!formModal.label.trim()) return;

    setSaving(true);
    try {
      if (formModal.mode === 'add') {
        const res = await api.post('/settings/flags', {
          label: formModal.label.trim(),
          color: formModal.color,
          is_active: formModal.is_active
        });
        const created = res.data.data;
        const updatedList = [...localFlags, created];
        setLocalFlags(updatedList);
        if (onFlagsUpdated) onFlagsUpdated(updatedList);
        notify(`Flag "${created.label}" created successfully.`);
      } else {
        const res = await api.put(`/settings/flags/${formModal.item.id}`, {
          label: formModal.label.trim(),
          color: formModal.color,
          is_active: formModal.is_active
        });
        const updated = res.data.data;
        const updatedList = localFlags.map(f => (f.id === formModal.item.id ? updated : f));
        setLocalFlags(updatedList);
        if (onFlagsUpdated) onFlagsUpdated(updatedList);
        notify(`Flag "${updated.label}" updated.`);
      }
      setFormModal({ open: false, mode: 'add', item: null, label: '', color: '#e05252', is_active: true });
    } catch (err) {
      console.error('Failed to save flag:', err);
      notify(err.response?.data?.error || 'Failed to save flag.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fc-modal-overlay" onClick={onClose} style={{ zIndex: 1100 }}>
      <div
        className="fc-modal-card fc-modal-box animate-scale-up"
        style={{
          maxWidth: '680px',
          width: '95%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          overflow: 'visible'
        }}
        onClick={(e) => {
          e.stopPropagation();
          setActiveColorPickerId(null);
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--fc-border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'var(--fc-surface-card)',
            borderTopLeftRadius: '14px',
            borderTopRightRadius: '14px'
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '18px' }}>🏷</span>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--fc-text-main)' }}>
                Film Flags Settings
              </h2>
            </div>
            <p style={{ margin: '4px 0 0 0', fontSize: '12.5px', color: 'var(--fc-text-muted)' }}>
              Configure festival labels and color codes applied across the submissions catalog.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              className="fc-btn fc-btn-primary fc-btn-sm"
              onClick={handleOpenAdd}
              style={{ fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}
            >
              <AddIcon size={14} /> Add Flag
            </button>
            <button
              type="button"
              className="fc-modal-close modal-close-btn"
              onClick={onClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fc-text-muted)', display: 'flex', alignItems: 'center', padding: '4px' }}
            >
              <CloseIcon size={16} />
            </button>
          </div>
        </div>

        {/* Content Body: Flags List */}
        <div style={{ padding: '16px 24px', overflowY: localFlags.length > 6 ? 'auto' : 'visible', flex: 1, minHeight: '300px' }}>
          <div className="fc-flags-list" style={{ overflow: 'visible' }}>
            {localFlags.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--fc-text-muted)', fontSize: '13px' }}>
                No film flags configured. Click "+ Add Flag" to create your first flag tag.
              </div>
            ) : (
              localFlags.map((flag, index) => {
                const isActive = Boolean(flag.is_active === 1 || flag.is_active === true || flag.is_active === '1');
                const isNearBottom = index >= Math.max(1, localFlags.length - 2);

                return (
                  <div
                    key={flag.id}
                    className="fc-flag-row"
                    style={{
                      padding: '12px 0',
                      alignItems: 'center',
                      opacity: isActive ? 1 : 0.6,
                      transition: 'opacity 0.2s ease',
                      position: 'relative',
                      overflow: 'visible'
                    }}
                  >
                    {/* Left Meta: Drag Handle, Name & Clickable Badge (Option A) */}
                    <div className="fc-flag-left-meta" style={{ minWidth: '260px', position: 'relative', display: 'flex', alignItems: 'center', gap: '12px', overflow: 'visible' }}>
                      <span className="fc-drag-handle">⠿</span>
                      <span
                        className="fc-flag-label-text"
                        style={{
                          fontWeight: 600,
                          color: isActive ? 'var(--fc-text-main)' : 'var(--fc-text-muted)'
                        }}
                      >
                        {flag.label}
                      </span>

                      {/* ── OPTION A: Interactive Badge that triggers Color Dropdown ── */}
                      <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
                        <button
                          type="button"
                          className="fc-flag-badge-pill fc-flag-badge-clickable"
                          style={{
                            backgroundColor: `${flag.color}18`,
                            color: flag.color,
                            borderColor: `${flag.color}40`,
                            fontSize: '11px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '3px 10px',
                            borderRadius: '12px',
                            border: '1px solid',
                            transition: 'all 0.15s ease'
                          }}
                          onClick={() => setActiveColorPickerId(activeColorPickerId === flag.id ? null : flag.id)}
                          title="Click to change flag color"
                        >
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: flag.color, boxShadow: `0 0 0 2px ${flag.color}30` }} />
                          <span>{flag.label}</span>
                          {!isActive && <span style={{ fontSize: '9px', opacity: 0.7 }}>(Inactive)</span>}
                          <span style={{ fontSize: '9px', opacity: 0.5 }}>▾</span>
                        </button>

                        {/* Modern Palette Swatch Grid Popover */}
                        {activeColorPickerId === flag.id && (
                          <div
                            className={`fc-color-popover ${isNearBottom ? 'popover-up' : 'popover-down'}`}
                            style={{
                              left: 0,
                              right: 'auto',
                              ...(isNearBottom
                                ? { bottom: 'calc(100% + 8px)', top: 'auto' }
                                : { top: 'calc(100% + 8px)', bottom: 'auto' })
                            }}
                            onClick={e => e.stopPropagation()}
                          >
                            <div className="fc-color-popover-header">
                              <span className="fc-color-popover-title">Flag Color</span>
                              <button
                                type="button"
                                className="fc-color-popover-close"
                                onClick={() => setActiveColorPickerId(null)}
                                title="Close"
                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                              >
                                <CloseIcon size={12} />
                              </button>
                            </div>

                            <div className="fc-color-popover-grid">
                              {FESTIVAL_PALETTE.map(item => {
                                const isSelected = (flag.color || '').toLowerCase() === item.hex.toLowerCase();
                                return (
                                  <button
                                    key={item.hex}
                                    type="button"
                                    className={`fc-color-swatch-btn ${isSelected ? 'selected' : ''}`}
                                    style={{
                                      backgroundColor: item.hex,
                                      color: item.hex
                                    }}
                                    onClick={() => {
                                      handleQuickColorChange(flag, item.hex);
                                      setActiveColorPickerId(null);
                                    }}
                                    title={item.name}
                                  >
                                    {isSelected && (
                                      <span className="fc-color-swatch-check" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <CheckIcon size={12} />
                                      </span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>

                            <div className="fc-color-popover-footer">
                              <label className="fc-color-custom-trigger" title="Pick custom color">
                                <div className="fc-color-rainbow-disc">
                                  <div className="fc-color-rainbow-inner" style={{ backgroundColor: flag.color || '#e05252' }} />
                                </div>
                                <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569' }}>Custom</span>
                                <input
                                  type="color"
                                  value={flag.color || '#e05252'}
                                  onChange={(e) => handleQuickColorChange(flag, e.target.value)}
                                  className="fc-native-color-hidden"
                                />
                              </label>

                              <div className="fc-color-hex-box" title="Hex Color Code">
                                <span className="fc-color-hex-hash">#</span>
                                <input
                                  type="text"
                                  value={(flag.color || '').replace(/^#/, '')}
                                  placeholder="E05252"
                                  onChange={(e) => {
                                    const val = e.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 6);
                                    if (val.length === 6 || val.length === 3) {
                                      handleQuickColorChange(flag, `#${val}`);
                                    } else {
                                      setLocalFlags(prev => prev.map(f => f.id === flag.id ? { ...f, color: `#${val}` } : f));
                                    }
                                  }}
                                  onBlur={(e) => {
                                    const val = e.target.value.replace(/[^0-9a-fA-F]/g, '');
                                    if (/^([0-9a-f]{3}|[0-9a-f]{6})$/i.test(val)) {
                                      handleQuickColorChange(flag, `#${val}`);
                                    }
                                  }}
                                  className="fc-color-hex-field"
                                  maxLength={6}
                                />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Right Controls: Clean Toggle, Edit & Delete */}
                    <div className="fc-flag-controls-right" style={{ gap: '14px', alignItems: 'center' }}>
                      {/* Active Toggle Switch with Visual Status Label */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <label className="fc-toggle-switch" style={{ cursor: 'pointer' }} title={isActive ? 'Active (click to deactivate)' : 'Inactive (click to activate)'}>
                          <input
                            type="checkbox"
                            checked={isActive}
                            onChange={() => handleToggleActive(flag)}
                          />
                          <span className="fc-toggle-slider" />
                        </label>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            color: isActive ? '#15803d' : '#94a3b8',
                            width: '46px',
                            userSelect: 'none',
                            cursor: 'pointer',
                            transition: 'color 0.2s ease'
                          }}
                          onClick={() => handleToggleActive(flag)}
                          title="Click to toggle status"
                        >
                          {isActive ? 'Active' : 'Inactive'}
                        </span>
                      </div>

                      {/* Actions */}
                      <button
                        type="button"
                        className="fc-btn-subtle"
                        onClick={() => handleOpenEdit(flag)}
                        style={{ fontSize: '12px', padding: '3px 8px' }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="fc-btn-subtle"
                        onClick={() => handleDeleteFlag(flag)}
                        style={{ fontSize: '12px', padding: '3px 8px', color: '#b91c1c' }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 24px',
            borderTop: '1px solid var(--fc-border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'var(--fc-surface, #faf9f7)',
            borderBottomLeftRadius: '14px',
            borderBottomRightRadius: '14px'
          }}
        >
          <span style={{ fontSize: '12px', color: 'var(--fc-text-secondary)' }}>
            {localFlags.length} {localFlags.length === 1 ? 'flag' : 'flags'} configured · Inactive flags are hidden from new assignments
          </span>
          <button
            type="button"
            className="fc-btn fc-btn-outline fc-btn-sm"
            onClick={onClose}
          >
            Done
          </button>
        </div>

        {/* ── SUB-MODAL: ADD / EDIT FLAG FORM ───────────────────────────── */}
        {formModal.open && (
          <div
            className="fc-modal-overlay"
            style={{ zIndex: 1200 }}
            onClick={() => setFormModal({ open: false, mode: 'add', item: null, label: '', color: '#e05252', is_active: true })}
          >
            <div
              className="fc-settings-modal-card animate-scale-up"
              onClick={e => e.stopPropagation()}
              style={{ maxWidth: '420px', width: '90%' }}
            >
              <h3 className="fc-modal-title" style={{ fontSize: '16px', fontWeight: 800, marginBottom: '16px' }}>
                {formModal.mode === 'add' ? 'Add Film Flag' : 'Edit Film Flag'}
              </h3>

              <form onSubmit={handleSaveForm}>
                <div className="fc-form-group">
                  <label className="fc-form-label">Flag Name</label>
                  <input
                    type="text"
                    className="fc-form-input"
                    placeholder="e.g. Needs Review, High Priority"
                    value={formModal.label}
                    onChange={(e) => setFormModal(prev => ({ ...prev, label: e.target.value }))}
                    autoFocus
                    required
                  />
                </div>

                <div className="fc-form-group">
                  <label className="fc-form-label">Color Preset</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '8px', marginTop: '6px' }}>
                    {FESTIVAL_PALETTE.map(item => {
                      const isSelected = (formModal.color || '').toLowerCase() === item.hex.toLowerCase();
                      return (
                        <button
                          key={item.hex}
                          type="button"
                          className={`fc-color-circle ${isSelected ? 'selected' : ''}`}
                          style={{
                            backgroundColor: item.hex,
                            width: '26px',
                            height: '26px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: '50%',
                            border: isSelected ? '2px solid #0f172a' : '2px solid transparent',
                            cursor: 'pointer'
                          }}
                          onClick={() => setFormModal(prev => ({ ...prev, color: item.hex }))}
                          title={item.name}
                        >
                          {isSelected && (
                            <CheckIcon size={12} style={{ color: '#fff' }} />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="fc-form-group">
                  <label className="fc-form-label">Custom Color</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <input
                      type="color"
                      value={formModal.color || '#e05252'}
                      onChange={(e) => setFormModal(prev => ({ ...prev, color: e.target.value }))}
                      style={{
                        width: '38px',
                        height: '38px',
                        padding: '2px',
                        border: '1px solid var(--fc-border)',
                        borderRadius: '6px',
                        background: 'var(--fc-surface-card, #fff)',
                        cursor: 'pointer'
                      }}
                      title="Pick custom color"
                    />
                    <input
                      type="text"
                      className="fc-form-input"
                      value={formModal.color}
                      onChange={(e) => setFormModal(prev => ({ ...prev, color: e.target.value }))}
                      placeholder="#e05252"
                      style={{ flex: 1, fontFamily: 'monospace', fontWeight: 600 }}
                      required
                    />
                  </div>
                </div>

                <div className="fc-form-group" style={{ marginTop: '12px' }}>
                  <label className="fc-form-label">Live Preview</label>
                  <div style={{ marginTop: '4px' }}>
                    <span
                      className="fc-flag-badge-pill"
                      style={{
                        backgroundColor: `${formModal.color}22`,
                        color: formModal.color,
                        borderColor: `${formModal.color}44`,
                        fontSize: '12px',
                        padding: '4px 12px',
                        fontWeight: 700
                      }}
                    >
                      {formModal.label.trim() || 'Preview Flag'}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '22px' }}>
                  <button
                    type="button"
                    className="fc-btn fc-btn-outline fc-btn-sm"
                    onClick={() => setFormModal({ open: false, mode: 'add', item: null, label: '', color: '#e05252', is_active: true })}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="fc-btn fc-btn-primary fc-btn-sm"
                    disabled={saving}
                  >
                    {saving ? 'Saving...' : formModal.mode === 'add' ? 'Create Flag' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
