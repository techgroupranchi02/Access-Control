/**
 * GroupConfig: Team › Group Config (docs/adr/0009-team-group-config.md).
 *
 * - Overview (/team/groups): default groups (Admin, Jury, Volunteer; the same for every festival and
 *   read-only) and this festival's custom groups with members, invites and last change.
 * - Detail (/team/groups/view/:key, key = admin | jury | volunteer | custom_<id>): the group's permissions
 *   read-only and its members. Admins can duplicate any group as a new custom group, and edit or delete
 *   custom groups. Creating and editing happen on /team/groups/new and /team/groups/:id (TeamPage).
 *
 * Everyone who can see the Team page can look; only festival Admins (server `canManage`) can change.
 * Data: GET /api/team/groups, GET /api/team/custom-groups/:id/usage, DELETE /api/team/custom-groups/:id.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import {
  AddIcon, ShieldIcon, GavelIcon, PeopleIcon, GroupIcon, LockIcon, EditIcon, DeleteIcon, ContentCopyIcon,
  VisibilityIcon, CloseIcon, WarningIcon, CheckCircleIcon, MailIcon
} from '../common/Icons';

const DEFAULT_ICONS = { admin: ShieldIcon, jury: GavelIcon, volunteer: PeopleIcon };

const errorText = (err, fallback) => err?.response?.data?.error || fallback;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function formatDay(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
}

function MemberChips({ members, limit = 6 }) {
  if (!members?.length) return <span className="fc-gc-muted">No members yet</span>;
  const shown = members.slice(0, limit);
  return (
    <div className="fc-gc-chips">
      {shown.map((m) => <span key={m.id} className="fc-gc-chip" title={m.email}>{m.name}</span>)}
      {members.length > limit && <span className="fc-gc-chip is-more">+{members.length - limit} more</span>}
    </div>
  );
}

function DeleteGroupDialog({ group, onClose, onDeleted }) {
  const [usage, setUsage] = useState(null);
  const [error, setError] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let alive = true;
    api.get(`/team/custom-groups/${group.id}/usage`)
      .then((res) => { if (alive) setUsage(res.data); })
      .catch((err) => { if (alive) setError(errorText(err, 'Could not check who uses this group.')); });
    return () => { alive = false; };
  }, [group.id]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !deleting) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, deleting]);

  const inUse = usage && (usage.members.length > 0 || usage.invites.length > 0);

  const remove = async () => {
    setDeleting(true);
    setError('');
    try {
      const res = await api.delete(`/team/custom-groups/${group.id}`);
      onDeleted(res.data);
    } catch (err) {
      setError(errorText(err, 'Could not delete the group.'));
      setDeleting(false);
    }
  };

  return (
    <div className="fc-modal-overlay" onClick={() => !deleting && onClose()}>
      <div className="fc-modal-card fc-gc-dialog" role="dialog" aria-modal="true" aria-labelledby="fc-gc-del-title" onClick={(e) => e.stopPropagation()}>
        <div className="fc-gc-dialog-head">
          <h2 id="fc-gc-del-title">Delete "{group.name}"?</h2>
          <button type="button" className="fc-modal-close" onClick={onClose} aria-label="Close" disabled={deleting}><CloseIcon size={16} /></button>
        </div>
        <div className="fc-gc-dialog-body">
          {!usage && !error && <p className="fc-gc-muted">Checking who uses this group…</p>}
          {usage && !inUse && <p>Nobody uses this group. It will be removed from this festival.</p>}
          {inUse && (
            <>
              <p className="fc-gc-warn"><WarningIcon size={15} /> This group is in use. Deleting it takes its permissions away from:</p>
              {usage.members.length > 0 && (
                <div className="fc-gc-usage">
                  <strong>{plural(usage.members.length, 'member', 'members')}</strong>
                  <MemberChips members={usage.members} limit={12} />
                  <span className="fc-gc-muted">They keep their default groups (anyone with no other group stays as Volunteer).</span>
                </div>
              )}
              {usage.invites.length > 0 && (
                <div className="fc-gc-usage">
                  <strong>{plural(usage.invites.length, 'pending invite', 'pending invites')}</strong>
                  <div className="fc-gc-chips">{usage.invites.map((i) => <span key={i.id} className="fc-gc-chip"><MailIcon size={12} /> {i.email}</span>)}</div>
                  <span className="fc-gc-muted">The group is removed from these invites (an invite left with no group becomes Volunteer).</span>
                </div>
              )}
              <label className="fc-gc-agree">
                <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
                <span>I understand these people lose this group's permissions.</span>
              </label>
            </>
          )}
          {error && <p className="fc-gc-error" role="alert">{error}</p>}
        </div>
        <div className="fc-gc-dialog-foot">
          <button type="button" className="fc-team-add-cancel" onClick={onClose} disabled={deleting}>Cancel</button>
          <button type="button" className="fc-gc-btn-danger" onClick={remove} disabled={!usage || deleting || (inUse && !agreed)}>
            <DeleteIcon size={14} /> {deleting ? 'Deleting…' : 'Delete group'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function GroupConfig({ viewKey = null, catalog = [], PermissionsView, onNavigate, onChanged, initialNotice = null }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(initialNotice);
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/team/groups');
      setData(res.data);
    } catch (err) {
      setError(errorText(err, 'Could not load the groups.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setNotice(initialNotice); }, [initialNotice]);

  const canManage = Boolean(data?.canManage);
  const sensitiveKeys = useMemo(() => new Set(data?.sensitivePermissions || []), [data]);
  const enabledModuleKeys = useMemo(() => (data?.enabledModules ? new Set(data.enabledModules) : null), [data]);
  const totalPermissions = useMemo(() => catalog.reduce((n, m) => n + (m.permissions?.length || 0), 0), [catalog]);

  const viewed = useMemo(() => {
    if (!viewKey || !data) return null;
    return data.defaultGroups.find((g) => g.key === viewKey) || data.customGroups.find((g) => g.key === viewKey) || null;
  }, [viewKey, data]);

  const duplicate = (group) => onNavigate('/team/groups/new', { state: { startFrom: group.key } });

  const onDeleted = async (usage) => {
    setDeleting(null);
    setNotice({ tone: 'success', text: `"${usage.name}" deleted.${usage.members?.length ? ` ${plural(usage.members.length, 'member keeps', 'members keep')} their default groups.` : ''}` });
    await Promise.all([load(), onChanged?.()]);
    if (viewKey) onNavigate('/team/groups', { state: { notice: { tone: 'success', text: `"${usage.name}" deleted.` } } });
  };

  const crumbs = (
    <nav className="fc-team-add-crumbs" aria-label="Breadcrumb">
      <Link to="/team">Team</Link>
      <span>/</span>
      {viewKey ? <Link to="/team/groups">Group Config</Link> : <span aria-current="page">Group Config</span>}
      {viewKey && <><span>/</span><span aria-current="page">{viewed?.name || 'Group'}</span></>}
    </nav>
  );

  const noticeBar = notice && (
    <div className={`fc-team-notice is-${notice.tone}`} role="status">
      {notice.tone === 'success' ? <CheckCircleIcon size={16} /> : <WarningIcon size={16} />}
      <span>{notice.text}</span>
      <button type="button" className="fc-team-notice-close" onClick={() => setNotice(null)} aria-label="Dismiss"><CloseIcon size={13} /></button>
    </div>
  );

  if (loading && !data) {
    return <div className="fc-team-add-page">{crumbs}<div className="fc-loading-state"><div className="fc-spinner" /><span>Loading groups…</span></div></div>;
  }
  if (error && !data) {
    return <div className="fc-team-add-page">{crumbs}<p className="fc-gc-error" role="alert">{error}</p></div>;
  }

  // ── Detail view ──
  if (viewKey) {
    if (!viewed) {
      return (
        <div className="fc-team-add-page">
          {crumbs}
          <div className="fc-card fc-gc-empty">
            <h2>Group not found in this festival</h2>
            <p>Custom groups belong to the festival they were made in. It may have been deleted, or it belongs to another festival.</p>
            <Link to="/team/groups" className="fc-btn-primary">Back to Group Config</Link>
          </div>
        </div>
      );
    }
    const isDefault = Boolean(viewed.readOnly);
    const Icon = DEFAULT_ICONS[viewed.key] || GroupIcon;
    const scopeMap = new Map(Object.entries(viewed.scopes || {}));
    return (
      <div className="fc-team-add-page">
        {crumbs}
        {noticeBar}
        <div className="fc-page-header fc-gc-detail-head">
          <div className="fc-gc-title-row">
            <span className={`fc-gc-icon ${isDefault ? 'is-default' : 'is-custom'}`}><Icon size={20} /></span>
            <div>
              <h1 className="fc-page-title">{viewed.name}</h1>
              <div className="fc-gc-badges">
                {isDefault
                  ? <><span className="fc-gc-badge">Standard</span><span className="fc-gc-badge is-locked"><LockIcon size={11} /> Read-only · same for every festival</span></>
                  : <span className="fc-gc-badge is-custom">Custom · this festival only</span>}
              </div>
              {viewed.description && <p className="fc-page-subtitle">{viewed.description}</p>}
            </div>
          </div>
          {canManage && (
            <div className="fc-gc-actions">
              <button type="button" className="fc-gc-btn" onClick={() => duplicate(viewed)}><ContentCopyIcon size={14} /> Duplicate as custom group</button>
              {!isDefault && <button type="button" className="fc-gc-btn" onClick={() => onNavigate(`/team/groups/${viewed.id}`)}><EditIcon size={14} /> Edit</button>}
              {!isDefault && <button type="button" className="fc-gc-btn is-danger" onClick={() => setDeleting(viewed)}><DeleteIcon size={14} /> Delete</button>}
            </div>
          )}
        </div>

        <section className="fc-card fc-gc-section">
          <h2 className="fc-gc-section-title">{plural(viewed.memberCount, 'member', 'members')} in this festival</h2>
          <MemberChips members={viewed.members} limit={40} />
          {!isDefault && viewed.updatedAt && (
            <p className="fc-gc-muted" style={{ marginTop: 10 }}>Last changed{viewed.updatedBy ? ` by ${viewed.updatedBy}` : ''} on {formatDay(viewed.updatedAt)}</p>
          )}
        </section>

        <section className="fc-card fc-gc-section">
          {PermissionsView && (
            <PermissionsView
              catalog={catalog}
              permissions={new Set(viewed.permissions)}
              readOnly
              defaultFilterMode="granted"
              permissionScopeMap={scopeMap}
              sensitiveKeys={sensitiveKeys}
              enabledModuleKeys={enabledModuleKeys}
              readOnlyNote={isDefault
                ? 'Default groups are the same for every festival and are set by Freecomers, so they can\'t be changed here. To give someone a different set, duplicate this group as a custom group and adjust it.'
                : (canManage ? 'This is how the group is set up now. Use Edit to change it.' : 'Only festival Admins can change this group.')}
            />
          )}
        </section>

        {deleting && <DeleteGroupDialog group={deleting} onClose={() => setDeleting(null)} onDeleted={onDeleted} />}
      </div>
    );
  }

  // ── Overview ──
  return (
    <div className="fc-team-add-page">
      {crumbs}
      <div className="fc-page-header" style={{ marginBottom: 18 }}>
        <div>
          <h1 className="fc-page-title">Group Config</h1>
          <p className="fc-page-subtitle">Groups decide what team members can see and do. Default groups are the same for every festival; custom groups belong to this festival only.</p>
        </div>
        {canManage && (
          <button type="button" className="fc-btn-primary" onClick={() => onNavigate('/team/groups/new')} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <AddIcon size={16} /> New custom group
          </button>
        )}
      </div>
      {noticeBar}

      <section className="fc-gc-block" aria-labelledby="fc-gc-defaults">
        <div className="fc-gc-block-head">
          <h2 id="fc-gc-defaults">Default groups</h2>
          <span className="fc-gc-badge is-locked"><LockIcon size={11} /> Read-only</span>
        </div>
        <div className="fc-gc-grid">
          {data.defaultGroups.map((g) => {
            const Icon = DEFAULT_ICONS[g.key] || GroupIcon;
            const all = totalPermissions && g.permissions.length >= totalPermissions;
            return (
              <article key={g.key} className="fc-card fc-gc-card">
                <div className="fc-gc-card-head">
                  <span className="fc-gc-icon is-default"><Icon size={18} /></span>
                  <div className="fc-gc-card-title">
                    <h3>{g.name}</h3>
                    <span className="fc-gc-badge">Standard</span>
                  </div>
                </div>
                {g.description && <p className="fc-gc-desc">{g.description}</p>}
                <div className="fc-gc-stats">
                  <span>{all ? 'All permissions' : plural(g.permissions.length, 'permission', 'permissions')}</span>
                  <span>{plural(g.memberCount, 'member', 'members')}</span>
                </div>
                <div className="fc-gc-card-actions">
                  <button type="button" className="fc-gc-btn" onClick={() => onNavigate(`/team/groups/view/${g.key}`)}><VisibilityIcon size={14} /> View permissions</button>
                  {canManage && <button type="button" className="fc-gc-btn" onClick={() => duplicate(g)} title="Start a custom group with the same permissions"><ContentCopyIcon size={14} /> Duplicate</button>}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="fc-gc-block" aria-labelledby="fc-gc-customs">
        <div className="fc-gc-block-head">
          <h2 id="fc-gc-customs">Custom groups <span className="fc-gc-muted">({data.customGroups.length})</span></h2>
          <span className="fc-gc-badge is-custom">This festival only</span>
        </div>
        {data.customGroups.length === 0 ? (
          <div className="fc-card fc-gc-empty">
            <p>No custom groups yet.{canManage ? ' Create one, or duplicate a default group and adjust it.' : ''}</p>
          </div>
        ) : (
          <div className="fc-gc-grid">
            {data.customGroups.map((g) => (
              <article key={g.id} className="fc-card fc-gc-card">
                <div className="fc-gc-card-head">
                  <span className="fc-gc-icon is-custom"><GroupIcon size={18} /></span>
                  <div className="fc-gc-card-title">
                    <h3>{g.name}</h3>
                    <span className="fc-gc-badge is-custom">Custom</span>
                  </div>
                </div>
                {g.description && <p className="fc-gc-desc">{g.description}</p>}
                <div className="fc-gc-stats">
                  <span>{plural(g.permissions.length, 'permission', 'permissions')}</span>
                  <span>{plural(g.memberCount, 'member', 'members')}</span>
                  {g.inviteCount > 0 && <span>{plural(g.inviteCount, 'invite', 'invites')}</span>}
                  {g.permissions.some((k) => sensitiveKeys.has(k)) && <span className="fc-gc-sensitive">Can manage team or settings</span>}
                </div>
                <MemberChips members={g.members} limit={4} />
                {g.updatedAt && <p className="fc-gc-muted fc-gc-changed">Last changed{g.updatedBy ? ` by ${g.updatedBy}` : ''} on {formatDay(g.updatedAt)}</p>}
                <div className="fc-gc-card-actions">
                  <button type="button" className="fc-gc-btn" onClick={() => onNavigate(`/team/groups/view/${g.key}`)}><VisibilityIcon size={14} /> View</button>
                  {canManage && <button type="button" className="fc-gc-btn" onClick={() => onNavigate(`/team/groups/${g.id}`)}><EditIcon size={14} /> Edit</button>}
                  {canManage && <button type="button" className="fc-gc-btn is-danger" onClick={() => setDeleting(g)}><DeleteIcon size={14} /> Delete</button>}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {deleting && <DeleteGroupDialog group={deleting} onClose={() => setDeleting(null)} onDeleted={onDeleted} />}
    </div>
  );
}
