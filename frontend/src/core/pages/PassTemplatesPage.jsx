/**
 * PassTemplatesPage (/settings/badges): Settings › Badges & Passes (docs/adr/0005-pass-templates.md)
 *
 * Lists the festival's pass templates and the built-in starters. Each template can be edited,
 * duplicated, made the festival default or archived. The editor lives at /settings/badges/:id
 * (and /settings/badges/new) in PassTemplateEditor.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import api from '../services/api';
import usePassTemplates from '../hooks/usePassTemplates';
import { passCss, previewScale, renderPass, pieceSize, MM_PX, SAMPLE_PASS_DATA, fitWhenReady, ensurePassFonts } from '../utils/passRenderer';
import PassTemplateEditor from '../components/print/PassTemplateEditor';
import { AddIcon, BadgeIcon, CheckCircleIcon, ContentCopyIcon, DeleteIcon, EditIcon, StarIcon } from '../components/common/Icons';

const THUMB_W = 220;
const THUMB_H = 150;

/** Small scaled preview of a template (loads the artwork when the template has one). */
export function PassThumb({ template, ctx, loadFull, mode = 'full', width = THUMB_W, height = THUMB_H }) {
  const needsFull = template.has_image || template.has_assets;
  const [full, setFull] = useState(needsFull ? null : template);
  const stageRef = useRef(null);
  useEffect(() => { fitWhenReady(stageRef.current); }, [full, mode, ctx]);
  useEffect(() => {
    let cancelled = false;
    if (!needsFull) { setFull(template); return undefined; }
    loadFull(template).then((t) => { if (!cancelled) setFull(t); }).catch(() => { if (!cancelled) setFull(template); });
    return () => { cancelled = true; };
  }, [template, loadFull, needsFull]);

  if (!full) return <div className="fc-pt-thumb" style={{ width, height }} aria-hidden="true" />;
  const scale = previewScale(full, mode, width - 16, height - 16, ctx);
  const { w, h } = pieceSize(full, mode, ctx);
  return (
    <div className="fc-pt-thumb" style={{ width, height }} aria-hidden="true">
      <div ref={stageRef} className="fc-pt-thumb-stage" style={{ width: w * MM_PX * scale, height: h * MM_PX * scale }}>
        <div
          style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: 'max-content' }}
          // Renderer output: every value is escaped in passRenderer
          dangerouslySetInnerHTML={{ __html: renderPass(full, SAMPLE_PASS_DATA, mode, ctx) }}
        />
      </div>
    </div>
  );
}

function describe(t, categories) {
  const kind = t.design_mode === 'artwork' ? 'Your artwork' : 'Built-in layout';
  const cats = (t.category_codes || []).map((c) => categories.find((x) => x.code === c)?.name || c);
  return { kind, cats };
}

export default function PassTemplatesPage() {
  const { id } = useParams();
  if (id) return <PassTemplateEditor templateId={id} />;
  return <PassTemplatesList />;
}

function PassTemplatesList() {
  const navigate = useNavigate();
  const location = useLocation();
  const { loading, error, templates, starters, festival, categories, customFields, choiceFields, qrSettings, reload, loadFull } = usePassTemplates();
  const [notice, setNotice] = useState(location.state?.notice || '');
  const [actionError, setActionError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [confirmArchive, setConfirmArchive] = useState(null);
  const ctx = useMemo(() => ({ festival, customFields, choiceFields, qrSettings }), [festival, customFields, choiceFields, qrSettings]);
  useEffect(() => { ensurePassFonts(); }, []);

  useEffect(() => {
    if (location.state?.notice) navigate(location.pathname, { replace: true, state: null });
  }, [location, navigate]);

  const run = async (templateId, fn, done) => {
    setActionError('');
    setNotice('');
    setBusyId(templateId);
    try {
      const res = await fn();
      if (done) done(res);
      await reload();
    } catch (err) {
      setActionError(err.response?.data?.message || 'That did not work. Please try again.');
    } finally {
      setBusyId(null);
      setConfirmArchive(null);
    }
  };

  const startFromStarter = (starter) => run(starter.id, () => api.post(`/pass-templates/${starter.id}/duplicate`), (res) => {
    navigate(`/settings/badges/${res.data.template.id}`);
  });

  return (
    <div className="fc-pt-page animate-fade-in">
      <nav aria-label="Breadcrumb" className="fc-pt-crumbs">
        <span>Settings</span>
        <span>/</span>
        <span className="is-current">Badges &amp; Passes</span>
      </nav>

      <header className="fc-pt-header">
        <div>
          <h1 className="fc-pt-h1">Badges &amp; Passes</h1>
          <p className="fc-pt-sub">
            Design the passes your festival prints. Desk staff pick a template when they print from Bulk QR, the Audience list or Assign QR, and choose Pass + QR, Pass only or QR only.
          </p>
        </div>
        <button type="button" className="fc-pt-btn is-primary" onClick={() => navigate('/settings/badges/new')}>
          <AddIcon size={16} /> New template
        </button>
      </header>

      {notice && <div className="fc-pt-notice" role="status"><CheckCircleIcon size={16} /> {notice}</div>}
      {(error || actionError) && <div className="fc-pt-error" role="alert">{error || actionError}</div>}

      <section className="fc-pt-section">
        <h2 className="fc-pt-h2">Your templates</h2>
        {loading && <p className="fc-pt-muted">Loading templates…</p>}
        {!loading && templates.length === 0 && (
          <div className="fc-pt-empty">
            <BadgeIcon size={28} />
            <div>
              <strong>No templates yet.</strong>
              <p>Until you add one, printing uses the starter templates below. Start from a starter, or create a template from scratch.</p>
            </div>
          </div>
        )}
        <div className="fc-pt-grid">
          {templates.map((t) => {
            const { kind, cats } = describe(t, categories);
            return (
              <article key={t.id} className="fc-pt-card">
                <PassThumb template={t} ctx={ctx} loadFull={loadFull} />
                <div className="fc-pt-card-body">
                  <div className="fc-pt-card-title">
                    <h3>{t.name}</h3>
                    {t.is_default && <span className="fc-pt-tag is-default"><StarIcon size={12} /> Default</span>}
                  </div>
                  <p className="fc-pt-meta">{t.width_mm} × {t.height_mm} mm · {kind}</p>
                  <p className="fc-pt-meta">{cats.length ? <>Used for: {cats.join(', ')}</> : 'Any category'}</p>
                </div>
                <div className="fc-pt-card-actions">
                  <Link className="fc-pt-btn is-small" to={`/settings/badges/${t.id}`}><EditIcon size={14} /> Edit</Link>
                  <button type="button" className="fc-pt-btn is-small" disabled={busyId === t.id} onClick={() => run(t.id, () => api.post(`/pass-templates/${t.id}/duplicate`), () => setNotice(`Copied "${t.name}".`))}>
                    <ContentCopyIcon size={14} /> Duplicate
                  </button>
                  {!t.is_default && (
                    <button type="button" className="fc-pt-btn is-small" disabled={busyId === t.id} onClick={() => run(t.id, () => api.put(`/pass-templates/${t.id}/default`), () => setNotice(`"${t.name}" is now the festival default.`))}>
                      <StarIcon size={14} /> Make default
                    </button>
                  )}
                  {confirmArchive === t.id ? (
                    <span className="fc-pt-confirm">
                      Archive?
                      <button type="button" className="fc-pt-btn is-small is-danger" disabled={busyId === t.id} onClick={() => run(t.id, () => api.delete(`/pass-templates/${t.id}`), () => setNotice(`Archived "${t.name}".`))}>Yes</button>
                      <button type="button" className="fc-pt-btn is-small" onClick={() => setConfirmArchive(null)}>No</button>
                    </span>
                  ) : (
                    <button type="button" className="fc-pt-btn is-small is-quiet" onClick={() => setConfirmArchive(t.id)} aria-label={`Archive ${t.name}`}>
                      <DeleteIcon size={14} /> Archive
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="fc-pt-section">
        <h2 className="fc-pt-h2">Starter templates</h2>
        <p className="fc-pt-muted">Built in and always available for printing. Use one as a starting point to make your own copy.</p>
        <div className="fc-pt-grid">
          {starters.map((s) => {
            const mode = 'full';
            return (
              <article key={s.id} className="fc-pt-card is-starter">
                <PassThumb template={s} ctx={ctx} loadFull={loadFull} mode={mode} />
                <div className="fc-pt-card-body">
                  <div className="fc-pt-card-title"><h3>{s.name}</h3></div>
                  <p className="fc-pt-meta">
                    {`${s.width_mm} × ${s.height_mm} mm · Built-in layout`}
                  </p>
                </div>
                <div className="fc-pt-card-actions">
                  <button type="button" className="fc-pt-btn is-small" disabled={busyId === s.id} onClick={() => startFromStarter(s)}>
                    <ContentCopyIcon size={14} /> Use as starting point
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <style>{passCss('.fc-pt-thumb-stage')}</style>
    </div>
  );
}
