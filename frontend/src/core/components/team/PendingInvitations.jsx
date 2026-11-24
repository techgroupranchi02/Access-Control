/**
 * PendingInvitations: people invited to the festival team who don't have a usable Freecomers account yet
 * (docs/adr/0008-team-invitations.md). They join the team automatically the first time they sign in to
 * FestiPlus with the invited email.
 *
 * Staff with team:manage can resend the email, copy the invite as text (to share another way), change the
 * groups the person will get, or cancel the invite. Data: GET /api/team (invitations) and
 * /api/team/invitations/:id.
 */

import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import { MailIcon, ContentCopyIcon, EditIcon, CloseIcon, WarningIcon, HourglassIcon, CheckIcon } from '../common/Icons';

const STANDARD_GROUPS = [
  { key: 'admin', label: 'Admin' },
  { key: 'jury', label: 'Jury' },
  { key: 'volunteer', label: 'Volunteer' }
];

function formatWhen(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

function formatDay(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
}

const errorText = (err, fallback) => err?.response?.data?.error || fallback;

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older browsers / non-secure contexts
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

function EditGroupsDialog({ invitation, customGroups, onClose, onSaved }) {
  const [selected, setSelected] = useState(() => new Set(invitation.groups || []));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const toggle = (key) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await api.put(`/team/invitations/${invitation.id}`, { groups: Array.from(selected) });
      onSaved(res.data.invitation);
    } catch (err) {
      setError(errorText(err, 'Could not save the groups.'));
      setSaving(false);
    }
  };

  const options = [...STANDARD_GROUPS, ...customGroups.map((c) => ({ key: `custom_${c.id}`, label: c.name }))];

  return (
    <div className="fc-modal-overlay" onClick={onClose}>
      <div className="fc-modal-card fc-tinv-dialog" role="dialog" aria-modal="true" aria-labelledby="fc-tinv-edit-title" onClick={(e) => e.stopPropagation()}>
        <div className="fc-tinv-dialog-head">
          <div>
            <h2 id="fc-tinv-edit-title">Groups for {invitation.email}</h2>
            <p>They get these groups when they first sign in.</p>
          </div>
          <button type="button" className="fc-modal-close" onClick={onClose} aria-label="Close"><CloseIcon size={16} /></button>
        </div>
        <div className="fc-tinv-options">
          {options.map((o) => (
            <label key={o.key} className={`fc-tinv-option ${selected.has(o.key) ? 'is-on' : ''}`}>
              <input type="checkbox" checked={selected.has(o.key)} onChange={() => toggle(o.key)} />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
        {error && <p className="fc-tinv-error" role="alert">{error}</p>}
        <div className="fc-tinv-dialog-foot">
          <button type="button" className="fc-team-add-cancel" onClick={onClose}>Cancel</button>
          <button type="button" className="fc-btn-primary" onClick={save} disabled={saving || selected.size === 0}>
            {saving ? 'Saving…' : 'Save groups'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PendingInvitations({ invitations, customGroups = [], canManage, onChanged, onNotice }) {
  const [busy, setBusy] = useState(null); // `${action}-${id}`
  const [editing, setEditing] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  if (!invitations?.length) return null;

  const run = async (key, fn) => {
    setBusy(key);
    try { await fn(); } finally { setBusy(null); }
  };

  const resend = (inv) => run(`resend-${inv.id}`, async () => {
    try {
      const res = await api.post(`/team/invitations/${inv.id}/resend`);
      const mail = res.data.email || {};
      onNotice(mail.sent
        ? { tone: 'success', text: `Invite sent again to ${inv.email}.` }
        : { tone: 'warning', text: `The invite for ${inv.email} is still valid, but the email wasn't sent: ${mail.reason || 'unknown error'}. Use Copy invite to share it another way.` });
      await onChanged();
    } catch (err) {
      onNotice({ tone: 'warning', text: errorText(err, 'Could not resend the invite.') });
    }
  });

  const copy = (inv) => run(`copy-${inv.id}`, async () => {
    try {
      const res = await api.get(`/team/invitations/${inv.id}/text`);
      if (await copyText(res.data.text)) {
        setCopiedId(inv.id);
        setTimeout(() => setCopiedId((c) => (c === inv.id ? null : c)), 2000);
      } else {
        onNotice({ tone: 'warning', text: 'Could not copy to the clipboard.' });
      }
    } catch (err) {
      onNotice({ tone: 'warning', text: errorText(err, 'Could not prepare the invite text.') });
    }
  });

  const cancel = (inv) => {
    if (!window.confirm(`Cancel the invite for ${inv.email}? They won't get access when they sign in.`)) return;
    run(`cancel-${inv.id}`, async () => {
      try {
        await api.delete(`/team/invitations/${inv.id}`);
        onNotice({ tone: 'success', text: `Invite for ${inv.email} cancelled.` });
        await onChanged();
      } catch (err) {
        onNotice({ tone: 'warning', text: errorText(err, 'Could not cancel the invite.') });
      }
    });
  };

  return (
    <section className="fc-card fc-tinv" aria-labelledby="fc-tinv-title">
      <div className="fc-tinv-head">
        <h2 id="fc-tinv-title"><MailIcon size={16} /> Pending invitations <span className="fc-tinv-count">({invitations.length})</span></h2>
        <p>They don't have a Freecomers account yet. They join the team the first time they sign in to FestiPlus with this email. Each invite holds a team seat.</p>
      </div>
      <ul className="fc-tinv-list">
        {invitations.map((inv) => {
          const cooling = Boolean(inv.resendAvailableAt) && !inv.lastSendError;
          return (
            <li key={inv.id} className="fc-tinv-row">
              <div className="fc-tinv-main">
                <div className="fc-tinv-email">{inv.email}</div>
                <div className="fc-tinv-chips">
                  {(inv.groupNames || []).map((n) => <span key={n} className="fc-tas-chip">{n}</span>)}
                </div>
                <div className="fc-tinv-meta">
                  {inv.expired ? (
                    <span className="fc-tinv-state is-danger"><HourglassIcon size={13} /> Expired on {formatDay(inv.expiresAt)}. Resend to renew it.</span>
                  ) : inv.lastSendError ? (
                    <span className="fc-tinv-state is-warning"><WarningIcon size={13} /> Email not sent: {inv.lastSendError}</span>
                  ) : (
                    <span className="fc-tinv-state"><HourglassIcon size={13} /> Waiting for sign-up · expires {formatDay(inv.expiresAt)}</span>
                  )}
                  <span className="fc-tinv-sub">
                    {inv.invitedBy ? `Invited by ${inv.invitedBy}` : 'Invited'}
                    {inv.lastSentAt ? ` · last sent ${formatWhen(inv.lastSentAt)}` : ''}
                    {inv.sendCount > 1 ? ` (${inv.sendCount} times)` : ''}
                  </span>
                  {inv.accountState === 'unverified' && (
                    <span className="fc-tinv-sub">Started a Freecomers account but hasn't verified the email yet.</span>
                  )}
                </div>
              </div>
              {canManage && (
                <div className="fc-tinv-actions">
                  <button
                    type="button"
                    className="fc-tinv-btn"
                    onClick={() => resend(inv)}
                    disabled={busy !== null || cooling}
                    title={cooling ? `Sent recently. You can resend after ${formatWhen(inv.resendAvailableAt)}.` : 'Send the invite email again'}
                  >
                    <MailIcon size={14} /> {busy === `resend-${inv.id}` ? 'Sending…' : 'Resend'}
                  </button>
                  <button type="button" className="fc-tinv-btn" onClick={() => copy(inv)} disabled={busy !== null} title="Copy the invite as text to share it another way">
                    {copiedId === inv.id ? <><CheckIcon size={14} /> Copied</> : <><ContentCopyIcon size={14} /> Copy invite</>}
                  </button>
                  <button type="button" className="fc-tinv-btn" onClick={() => setEditing(inv)} disabled={busy !== null}>
                    <EditIcon size={14} /> Groups
                  </button>
                  <button type="button" className="fc-tinv-btn is-danger" onClick={() => cancel(inv)} disabled={busy !== null}>
                    <CloseIcon size={14} /> {busy === `cancel-${inv.id}` ? 'Cancelling…' : 'Cancel'}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {editing && (
        <EditGroupsDialog
          invitation={editing}
          customGroups={customGroups}
          onClose={() => setEditing(null)}
          onSaved={async (inv) => {
            setEditing(null);
            onNotice({ tone: 'success', text: `Groups updated for ${inv.email}.` });
            await onChanged();
          }}
        />
      )}
    </section>
  );
}
