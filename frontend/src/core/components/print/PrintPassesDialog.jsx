/**
 * PrintPassesDialog: the one print dialog for badges and passes (docs/adr/0005-pass-templates.md).
 *
 * Staff pick what to print (Pass + QR, the default, or QR only), the template (not for QR only),
 * the A4 page layout (orientation, margins on/off, columns × rows), then print. The preview shows
 * the whole first A4 page. QR only shows the festival's QR Settings (sticker
 * size and lines); admins can save them as the festival default.
 *
 * Used by Bulk QR, the Audience pass dialog, Audience "Print passes" and the Assign QR success screen.
 *
 * Props:
 *   items        [{ data, categoryCode }]  data from passDataFromAttendee / passDataFromBadge
 *   defaultMode  'full' (Pass + QR, the default) | 'qr-only'
 *   title        dialog heading
 *   jobTitle     suggested PDF file name
 *   onClose()
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import usePassTemplates from '../../hooks/usePassTemplates';
import { printInPage } from '../../utils/printInPage';
import {
  PASS_MODES, DEFAULT_QR_SETTINGS, MM_PX, MAX_GRID, passCss, pickTemplate, renderPass, renderSheet, renderPagePreview,
  pieceSize, fitWhenReady, ensurePassFonts
} from '../../utils/passRenderer';
import { NumInput } from './PassElementProperties';
import { CloseIcon, PrintIcon, InfoIcon, SaveIcon, CheckCircleIcon, WarningIcon } from '../common/Icons';

const AUTO = 'auto';
const MARGINS_INFO_ID = 'fc-pp-margins-info';
// v2: layouts saved before "standard margins by default" are ignored once, so everyone starts with margins
const PREFS_KEY = 'fc_print_passes_prefs_v2';
const OLD_PREFS_KEYS = ['fc_print_passes_prefs'];
const PREVIEW_W = 320;
const PREVIEW_H = 400;

function readPrefs() {
  try {
    OLD_PREFS_KEYS.forEach((k) => localStorage.removeItem(k));
    return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') || {};
  } catch { return {}; }
}
function savePrefs(p) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* private mode */ }
}

function Segmented({ label, value, options, onChange }) {
  return (
    <div className="fc-pp-segment" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.key} type="button" role="radio" aria-checked={value === o.key} className={`fc-pp-seg-btn ${value === o.key ? 'is-active' : ''}`} onClick={() => onChange(o.key)} title={o.hint}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function PrintPassesDialog({ items = [], defaultMode: requestedMode = 'full', title = 'Print passes', jobTitle, onClose }) {
  // Pass + QR or QR only (the old "Pass only" mode was removed)
  const defaultMode = requestedMode === 'qr-only' ? 'qr-only' : 'full';
  const { loading, error, templates, starters, festival, customFields, choiceFields, qrSettings: savedQr, canManage, loadFull, saveQrSettings } = usePassTemplates();
  const previewRef = useRef(null);
  const prefs = useMemo(readPrefs, []);
  const [mode, setMode] = useState(defaultMode);
  // Always A4 sheets (the card-printer option was removed)
  const paper = 'a4';
  const [layoutPrefs, setLayoutPrefs] = useState(() => prefs.layout || {}); // { [mode]: { orientation, cols, rows } }
  const [choice, setChoice] = useState(AUTO);
  const [fulls, setFulls] = useState(new Map()); // template id → full template, for the preview
  const [qr, setQr] = useState(null);
  const [qrSaved, setQrSaved] = useState('');
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState('');

  // QR Settings: start from the festival default; changes apply to this print
  useEffect(() => { if (savedQr && !qr) setQr(savedQr); }, [savedQr, qr]);
  const qrSettings = qr || savedQr || DEFAULT_QR_SETTINGS;
  const qrDirty = savedQr && qr && JSON.stringify(qr) !== JSON.stringify(savedQr);
  const setQrField = (patch) => { setQr({ ...qrSettings, ...patch }); setQrSaved(''); };

  const ctx = useMemo(() => ({ festival, customFields, choiceFields, qrSettings }), [festival, customFields, choiceFields, qrSettings]);
  useEffect(() => { ensurePassFonts(); }, []);
  const hasCategoryTemplates = templates.some((t) => (t.category_codes || []).length > 0);
  const categoryCount = new Set(items.map((i) => i.categoryCode).filter(Boolean)).size;
  const isQrOnly = mode === 'qr-only';
  const isA4 = paper === 'a4';
  // Standard margins by default; a viewer's saved choice (No margins on) still wins
  const layout = { margins: 'standard', ...(layoutPrefs[mode] || {}) };
  const setLayout = (patch) => setLayoutPrefs((p) => ({ ...p, [mode]: { ...(p[mode] || {}), ...patch } }));

  // Items that can print in this mode: QR only needs a QR
  const printable = useMemo(() => (isQrOnly ? items.filter((i) => i.data?.qr_value) : items), [items, isQrOnly]);
  const withoutQr = items.filter((i) => !i.data?.qr_value).length;

  // QR only has no template choice: the sticker uses the festival's QR Settings
  const templateFor = (item) => {
    if (choice !== AUTO && !isQrOnly) {
      return templates.find((t) => String(t.id) === choice) || starters.find((s) => s.id === choice) || null;
    }
    return pickTemplate(templates, starters, item.categoryCode, mode);
  };

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Templates needed for the preview: the first pass, or every pass on the first A4 page
  const previewCount = isA4 ? Math.min(printable.length, 60) : Math.min(printable.length, 1);
  const previewMetas = loading ? [] : printable.slice(0, previewCount).map(templateFor).filter(Boolean);
  const previewKey = previewMetas.map((m) => m.id).join(',');
  useEffect(() => {
    let cancelled = false;
    const unique = [...new Map(previewMetas.map((m) => [m.id, m])).values()].filter((m) => !fulls.has(m.id));
    if (!unique.length) return undefined;
    Promise.all(unique.map((m) => loadFull(m).catch(() => m))).then((loaded) => {
      if (cancelled) return;
      setFulls((prev) => {
        const next = new Map(prev);
        loaded.forEach((t, i) => next.set(unique[i].id, t));
        return next;
      });
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewKey]);

  const previewItems = printable.slice(0, previewCount)
    .map((item, i) => ({ template: previewMetas[i] ? fulls.get(previewMetas[i].id) : null, data: item.data }))
    .filter((x) => x.template);
  const previewReady = previewItems.length > 0 && previewItems.length === Math.min(previewCount, previewMetas.length);

  // A4 layout for the whole job (grid from the largest piece), and the first page for the preview
  const page = isA4 && previewReady ? renderPagePreview(previewItems, mode, ctx, layout) : null;
  const totalPages = page ? Math.max(1, Math.ceil(printable.length / page.layout.perPage)) : 0;

  const handlePrint = async () => {
    setPrintError('');
    if (printable.length === 0) return;
    setPrinting(true);
    try {
      const metas = printable.map(templateFor);
      if (metas.some((m) => !m)) throw new Error('No template to print with.');
      const unique = [...new Map(metas.map((m) => [m.id, m])).values()];
      const loaded = new Map();
      for (const m of unique) loaded.set(m.id, await loadFull(m));
      const jobItems = printable.map((item, i) => ({ template: loaded.get(metas[i].id), data: item.data }));
      const { html, css } = renderSheet(jobItems, mode, paper, ctx, layout);
      savePrefs({ ...prefs, layout: layoutPrefs });
      printInPage(html, css, jobTitle || `${festival.name || 'Festival'} ${PASS_MODES.find((m) => m.key === mode)?.label || ''}`.trim(), { prepare: fitWhenReady });
      onClose();
    } catch (err) {
      setPrintError(err.response?.data?.message || err.message || 'Could not prepare the print.');
    } finally {
      setPrinting(false);
    }
  };

  const saveQrDefault = async () => {
    setQrSaved('');
    try {
      const saved = await saveQrSettings(qrSettings);
      setQr(saved);
      setQrSaved('Saved as the festival default.');
    } catch (err) {
      setQrSaved(err.response?.data?.message || 'Could not save the QR Settings.');
    }
  };

  // Shrink-to-fit text needs the rendered preview (and its fonts)
  const single = !isA4 && previewItems[0] ? previewItems[0] : null;
  const previewHtml = page ? page.html : (single ? renderPass(single.template, single.data, mode, ctx) : '');
  useEffect(() => { fitWhenReady(previewRef.current); }, [previewHtml]);

  // Preview size and scale
  let stageW = 0;
  let stageH = 0;
  let scale = 1;
  let sizeLabel = '';
  if (page) {
    scale = Math.min(PREVIEW_W / (page.layout.pageW * MM_PX), PREVIEW_H / (page.layout.pageH * MM_PX));
    stageW = page.layout.pageW * MM_PX * scale;
    stageH = page.layout.pageH * MM_PX * scale;
    sizeLabel = `A4 ${page.layout.orientation}`;
  } else if (single) {
    const { w, h } = pieceSize(single.template, mode, ctx);
    scale = Math.min(2, PREVIEW_W / (w * MM_PX), (PREVIEW_H * 0.75) / (h * MM_PX));
    stageW = w * MM_PX * scale;
    stageH = h * MM_PX * scale;
    sizeLabel = `${w} × ${h} mm`;
  }

  const options = [
    ...templates.map((t) => ({ value: String(t.id), label: `${t.name}${t.is_default ? ' (default)' : ''}` })),
    ...starters.filter((s) => s.id !== 'starter-sticker').map((s) => ({ value: s.id, label: s.name }))
  ];
  const unit = isQrOnly ? ['sticker', 'stickers'] : ['pass', 'passes'];

  return (
    <div className="fc-modal-overlay" onClick={onClose} role="presentation">
      <div className="fc-modal-card fc-pp-dialog" role="dialog" aria-modal="true" aria-labelledby="fc-pp-title" onClick={(e) => e.stopPropagation()}>
        <style>{passCss('.fc-pp-preview-stage')}{page ? page.css.replaceAll('.fc-pp-page-preview', '.fc-pp-preview-stage') : ''}</style>
        <div className="fc-modal-header">
          <h2 id="fc-pp-title" className="fc-pp-title">{title}</h2>
          <button type="button" className="fc-modal-close" onClick={onClose} aria-label="Close"><CloseIcon size={18} /></button>
        </div>

        <div className="fc-pp-body">
          <div className="fc-pp-controls">
            <div className="fc-pp-field">
              <span className="fc-pp-label">What to print</span>
              <Segmented
                label="What to print"
                value={mode}
                options={PASS_MODES}
                onChange={setMode}
              />
              <span className="fc-pp-hint">{PASS_MODES.find((m) => m.key === mode)?.hint}</span>
            </div>

            {isQrOnly ? (
              <div className="fc-pp-field fc-pp-qr-settings">
                <span className="fc-pp-label">QR Settings</span>
                <div className="fc-pp-qr-row">
                  <label className="fc-pp-mini">
                    <span>Sticker width (mm)</span>
                    <NumInput min={20} max={150} step={1} value={qrSettings.sizeMm} onCommit={(sizeMm) => setQrField({ sizeMm })} />
                  </label>
                  <label className="fc-pp-mini is-grow">
                    <span>Line under the festival name</span>
                    <input type="text" maxLength={60} value={qrSettings.title || ''} placeholder="For example: DELEGATE PASS BADGE" onChange={(e) => setQrField({ title: e.target.value })} />
                  </label>
                </div>
                <div className="fc-pp-checks">
                  <label><input type="checkbox" checked={Boolean(qrSettings.showFestivalName)} onChange={(e) => setQrField({ showFestivalName: e.target.checked })} /> Festival name</label>
                  <label><input type="checkbox" checked={Boolean(qrSettings.showBadgeNo)} onChange={(e) => setQrField({ showBadgeNo: e.target.checked })} /> Badge no.</label>
                  <label><input type="checkbox" checked={Boolean(qrSettings.showIndex)} onChange={(e) => setQrField({ showIndex: e.target.checked })} /> Badge sequence no. (#001)</label>
                </div>
                {canManage ? (
                  <div className="fc-pp-qr-save">
                    <button type="button" className="fc-pp-btn is-small" onClick={saveQrDefault} disabled={!qrDirty}>
                      <SaveIcon size={14} /> Save as festival default
                    </button>
                    {qrSaved && <span className="fc-pp-saved"><CheckCircleIcon size={13} /> {qrSaved}</span>}
                    {!qrSaved && qrDirty && <span className="fc-pp-hint">Changes apply to this print.</span>}
                  </div>
                ) : (
                  qrDirty && <span className="fc-pp-hint">Changes apply to this print only.</span>
                )}
              </div>
            ) : (
              <label className="fc-pp-field">
                <span className="fc-pp-label">Template</span>
                <select className="fc-pp-select" value={choice} onChange={(e) => setChoice(e.target.value)} disabled={loading}>
                  <option value={AUTO}>
                    {hasCategoryTemplates && categoryCount > 0 ? "Match each delegate's category" : 'Festival default'}
                  </option>
                  {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
            )}

            {isA4 && (
              <div className="fc-pp-field">
                <span className="fc-pp-label">Page layout (A4)</span>
                <Segmented
                  label="Orientation"
                  value={layout.orientation || 'portrait'}
                  options={[{ key: 'portrait', label: 'Portrait' }, { key: 'landscape', label: 'Landscape' }]}
                  onChange={(orientation) => setLayout({ orientation, cols: null, rows: null })}
                />
                <div className="fc-pp-margins">
                  <label className="fc-pp-margins-label">
                    <span>No margins</span>
                    <span className="fc-toggle-switch fc-pp-switch-sm">
                      <input
                        type="checkbox"
                        role="switch"
                        checked={layout.margins === 'none'}
                        onChange={(e) => setLayout({ margins: e.target.checked ? 'none' : 'standard' })}
                        aria-label="No margins"
                      />
                      <span className="fc-toggle-slider" />
                    </span>
                  </label>
                  <span className="fc-pp-info" tabIndex={0} role="button" aria-label="About margins" aria-describedby={MARGINS_INFO_ID}>
                    <InfoIcon size={14} />
                    <span className="fc-pp-info-pop" id={MARGINS_INFO_ID} role="tooltip">
                      <strong>No margins on</strong>
                      <span>Passes touch the page edges and each other. Most office printers can't print the outer 3–5 mm, so trim after printing or use a borderless printer.</span>
                      <strong>Off</strong>
                      <span>8 mm page margin and 4 mm cut gaps.</span>
                    </span>
                  </span>
                </div>
                {page && (
                  <>
                    <div className="fc-pp-grid-row">
                      <label className="fc-pp-mini">
                        <span>Columns</span>
                        <select value={page.layout.cols} onChange={(e) => setLayout({ cols: Number(e.target.value) })}>
                          {Array.from({ length: MAX_GRID.cols }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}{n <= page.layout.maxCols ? ' ✓' : ''}</option>)}
                        </select>
                      </label>
                      <span className="fc-pp-times" aria-hidden="true">×</span>
                      <label className="fc-pp-mini">
                        <span>Rows</span>
                        <select value={page.layout.rows} onChange={(e) => setLayout({ rows: Number(e.target.value) })}>
                          {Array.from({ length: MAX_GRID.rows }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}{n <= page.layout.maxRows ? ' ✓' : ''}</option>)}
                        </select>
                      </label>
                      <span className="fc-pp-per-page">
                        = <strong>{page.layout.perPage}</strong> per page · {totalPages} {totalPages === 1 ? 'page' : 'pages'}
                      </span>
                    </div>
                    {page.layout.fitsTrueSize ? (
                      <span className="fc-pp-hint">
                        Printed at true size ({page.layout.pieceW} × {page.layout.pieceH} mm). ✓ marks how many fit at true size.
                      </span>
                    ) : (
                      <div className={`fc-pp-fit ${page.layout.printable ? '' : 'is-blocked'}`}>
                        {!page.layout.printable && (
                          <p className="fc-pp-fit-msg"><WarningIcon size={14} /> {page.layout.cols} × {page.layout.rows} doesn't fit on A4 at true size ({page.layout.pieceW} × {page.layout.pieceH} mm{page.layout.margins === 'standard' ? ', with margins' : ''}).</p>
                        )}
                        <label className="fc-pp-fit-check">
                          <input type="checkbox" checked={Boolean(layout.shrink)} onChange={(e) => setLayout({ shrink: e.target.checked })} />
                          <span className="fc-pp-fit-text">
                            <span>Shrink to fit: prints at <strong>{(page.layout.fitScale * 100).toFixed(1)}%</strong></span>
                            <small>{(page.layout.pieceW * page.layout.fitScale).toFixed(1)} × {(page.layout.pieceH * page.layout.fitScale).toFixed(1)} mm · same proportions</small>
                          </span>
                        </label>
                        {page.layout.margins === 'standard' && page.layout.noMarginsFits && (
                          <button type="button" className="fc-pp-btn is-small" onClick={() => setLayout({ margins: 'none', shrink: false })}>
                            Use no margins instead (100%)
                          </button>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {isQrOnly && withoutQr > 0 && (
              <p className="fc-pp-note"><InfoIcon size={14} /> {withoutQr} {withoutQr === 1 ? 'delegate has' : 'delegates have'} no QR yet and will be skipped.</p>
            )}
            {mode === 'full' && withoutQr > 0 && (
              <p className="fc-pp-note"><InfoIcon size={14} /> {withoutQr} {withoutQr === 1 ? 'pass prints' : 'passes print'} with an empty QR box (no badge paired yet).</p>
            )}
            {(error || printError) && <p className="fc-pp-error" role="alert">{error || printError}</p>}
          </div>

          <div className="fc-pp-preview">
            <div className="fc-pp-preview-head">
              <span className="fc-pp-label">Preview</span>
              {sizeLabel && <span className="fc-pp-size">{sizeLabel}</span>}
            </div>
            <div className="fc-pp-preview-box">
              {loading && <span className="fc-pp-muted">Loading templates…</span>}
              {!loading && printable.length === 0 && <span className="fc-pp-muted">Nothing to print in this mode.</span>}
              {!loading && printable.length > 0 && previewHtml && (
                <div className={`fc-pp-preview-stage ${page ? 'is-page' : ''}`} style={{ width: stageW, height: stageH }}>
                  <div
                    ref={previewRef}
                    style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: 'max-content' }}
                    // Renderer output: every value is escaped in passRenderer
                    dangerouslySetInnerHTML={{ __html: previewHtml }}
                  />
                </div>
              )}
            </div>
            {page && <span className="fc-pp-page-count">Page 1 of {totalPages}</span>}
          </div>
        </div>

        <div className="fc-modal-footer fc-pp-footer">
          <span className="fc-pp-count">{printable.length} {printable.length === 1 ? unit[0] : unit[1]}</span>
          <button type="button" className="fc-pp-btn" onClick={onClose}>Cancel</button>
          <button type="button" className="fc-pp-btn is-primary" onClick={handlePrint} disabled={loading || printing || printable.length === 0 || (page && !page.layout.printable)}>
            <PrintIcon size={16} /> {printing ? 'Preparing…' : 'Print'}
          </button>
        </div>
      </div>
    </div>
  );
}
