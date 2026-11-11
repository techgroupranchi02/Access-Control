/**
 * PassTemplateEditor (/settings/badges/:id and /settings/badges/new), docs/adr/0005-pass-templates.md
 *
 * Every template is a background plus elements (Text, Image, Checklist), edited the same way for
 * both design types:
 *   Built-in layout  colour background (optional image); FestiPlus places the elements for you,
 *                    and "Rearrange for me" starts that arrangement over
 *   Your artwork     an uploaded finished design as the background; you place the elements
 * The preview on the right uses passRenderer, the same code that prints, and is the canvas:
 * drag an element to move it, drag its corner to resize.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import usePassTemplates from '../../hooks/usePassTemplates';
import {
  PASS_MODES, SIZE_PRESETS, MM_PX, SAMPLE_PASS_DATA,
  passCss, passDataFromAttendee, pieceSize, renderPass, fitWhenReady, ensurePassFonts
} from '../../utils/passRenderer';
import { readPassImage, effectiveDpi } from '../../utils/passImage';
import PassElementProperties, { NumInput } from './PassElementProperties';
import {
  ArrowBackIcon, ArrowDownwardIcon, ArrowUpwardIcon, ChecklistIcon, DeleteIcon, ImageIcon, QrCodeScannerIcon,
  SaveIcon, SyncIcon, TextFieldsIcon, UploadFileIcon, WarningIcon, BadgeIcon
} from '../common/Icons';

const clone = (v) => JSON.parse(JSON.stringify(v));
const round2 = (n) => Math.round(Number(n) * 100) / 100;
let cidSeq = 0;
const withCid = (el) => ({ ...el, cid: `el-${++cidSeq}` });

const TYPE_ICON = { text: TextFieldsIcon, image: ImageIcon, checklist: ChecklistIcon };

const TEXT_DEFAULTS = {
  content: 'Text', font: 'inter', sizePt: 12, weight: 600, italic: false, color: '#0f172a', align: 'center', vAlign: 'middle',
  uppercase: false, letterSpacing: 0, lineHeight: 1.15, autoShrink: true, hideWhenEmpty: true, background: 'none', radius: 0, padding: 0
};

function presetKey(w, h) {
  const p = SIZE_PRESETS.find((s) => (Math.abs(s.w - w) < 0.05 && Math.abs(s.h - h) < 0.05) || (Math.abs(s.w - h) < 0.05 && Math.abs(s.h - w) < 0.05));
  return p ? p.key : 'custom';
}

function clampPos(p, W, H) {
  const w = round2(Math.min(Math.max(1, p.w), W));
  const h = round2(Math.min(Math.max(1, p.h), H));
  return { ...p, w, h, x: round2(Math.min(Math.max(0, p.x), W - w)), y: round2(Math.min(Math.max(0, p.y), H - h)) };
}

/** Scales every element to a new pass size (positions by width/height, text by the smaller ratio). */
function scaleElements(elements, W0, H0, W1, H1) {
  const sx = W1 / W0;
  const sy = H1 / H0;
  const sf = Math.min(sx, sy);
  return elements.map((el) => {
    const p = el.position;
    const position = clampPos({ ...p, x: p.x * sx, y: p.y * sy, w: p.w * sx, h: p.h * sy }, W1, H1);
    const m = { ...el.metadata };
    if (m.sizePt) m.sizePt = round2(Math.max(4, m.sizePt * sf));
    if (m.padding) m.padding = round2(m.padding * sf);
    if (m.radius) m.radius = round2(m.radius * sf);
    return { ...el, position, metadata: m };
  });
}

/** Default elements for a new artwork template: the badge QR and the holder's name. */
function artworkStarterElements(W, H) {
  const qr = round2(Math.min(30, W * 0.35, H * 0.35));
  return [
    withCid({ type: 'text', name: 'Holder name', position: clampPos({ x: W * 0.1, y: H * 0.5, w: W * 0.8, h: 10, rotation: 0 }, W, H), metadata: { ...TEXT_DEFAULTS, content: '{{name}}', sizePt: 14, weight: 800 } }),
    withCid({ type: 'image', name: 'Badge QR', position: clampPos({ x: (W - qr) / 2, y: H * 0.5 + 12, w: qr, h: qr + 4, rotation: 0 }, W, H), metadata: { source: 'badge_qr', fit: 'contain', opacity: 1, radius: 0, showBadgeNo: true } })
  ];
}

// ── Canvas: the live preview with draggable element boxes ───────────────────

function ElementCanvas({ template, data, mode, ctx, scale, selected, onSelect, onElementsChange, onDelete }) {
  const drag = useRef(null);
  const stageRef = useRef(null);
  const W = template.width_mm;
  const H = template.height_mm;
  const px = scale * MM_PX;
  const elements = template.elements || [];
  const html = renderPass(template, data, mode === 'qr-only' ? 'full' : mode, ctx);

  useEffect(() => { fitWhenReady(stageRef.current); }, [html]);

  const start = (e, cid, kind) => {
    e.preventDefault();
    e.stopPropagation();
    onSelect(cid);
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const el = elements.find((x) => x.cid === cid);
    drag.current = { cid, kind, x0: e.clientX, y0: e.clientY, pos: { ...el.position } };
  };
  const move = (e) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.x0) / px;
    const dy = (e.clientY - d.y0) / px;
    const p = d.pos;
    const position = d.kind === 'move'
      ? { ...p, x: round2(Math.min(Math.max(0, p.x + dx), W - p.w)), y: round2(Math.min(Math.max(0, p.y + dy), H - p.h)) }
      : { ...p, w: round2(Math.min(Math.max(2, p.w + dx), W - p.x)), h: round2(Math.min(Math.max(2, p.h + dy), H - p.y)) };
    onElementsChange(elements.map((x) => (x.cid === d.cid ? { ...x, position } : x)));
  };
  const end = () => { drag.current = null; };

  return (
    <div className="fc-pte-canvas" style={{ width: W * px, height: H * px }} onPointerDown={() => onSelect(null)}>
      <div
        ref={stageRef}
        style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: 'max-content', pointerEvents: 'none' }}
        // Renderer output: every value is escaped in passRenderer
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {elements.map((el) => {
        const p = el.position;
        return (
          <div
            key={el.cid}
            className={`fc-pte-slot ${selected === el.cid ? 'is-selected' : ''}`}
            style={{
              left: p.x * px, top: p.y * px, width: p.w * px, height: p.h * px,
              // 45° steps turn the whole element, so its outline turns too
              ...(Number(p.rotation) % 90 ? { transform: `rotate(${Number(p.rotation)}deg)`, transformOrigin: 'center' } : {})
            }}
            onPointerDown={(e) => start(e, el.cid, 'move')}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
            role="button"
            tabIndex={0}
            aria-label={`${el.name} element`}
            onKeyDown={(e) => {
              if ((e.key === 'Delete' || e.key === 'Backspace') && selected === el.cid) { e.preventDefault(); onDelete(el.cid); return; }
              const step = e.shiftKey ? 5 : 0.5;
              const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
              if (!delta) return;
              e.preventDefault();
              const position = { ...p, x: round2(Math.min(Math.max(0, p.x + delta[0]), W - p.w)), y: round2(Math.min(Math.max(0, p.y + delta[1]), H - p.h)) };
              onElementsChange(elements.map((x) => (x.cid === el.cid ? { ...x, position } : x)));
            }}
            onFocus={() => onSelect(el.cid)}
          >
            {selected === el.cid && <span className="fc-pte-slot-label">{el.name}</span>}
            <span
              className="fc-pte-slot-handle"
              onPointerDown={(e) => start(e, el.cid, 'resize')}
              onPointerMove={move}
              onPointerUp={end}
              onPointerCancel={end}
              aria-hidden="true"
            />
          </div>
        );
      })}
    </div>
  );
}

// ── Editor ────────────────────────────────────────────────────────────────────

export default function PassTemplateEditor({ templateId }) {
  const navigate = useNavigate();
  const isNew = templateId === 'new';
  const { loading: listLoading, starters, festival, categories, customFields, choiceFields, qrSettings } = usePassTemplates();
  const [draft, setDraft] = useState(null);
  const [imageInfo, setImageInfo] = useState(null); // { widthPx, heightPx } of the background image
  const [imageDirty, setImageDirty] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [imageError, setImageError] = useState('');
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState('');
  const [mode, setMode] = useState('full');
  const [selected, setSelected] = useState(null);
  const [imageMenu, setImageMenu] = useState(false);
  const [confirmRearrange, setConfirmRearrange] = useState(false);
  const [sampleList, setSampleList] = useState([]);
  const [sampleId, setSampleId] = useState('sample');
  const [previewBox, setPreviewBox] = useState({ w: 360, h: 520 }); // inner size of the preview box
  const previewRef = useRef(null);
  const stageRef = useRef(null);
  const bgFileRef = useRef(null);
  const elFileRef = useRef(null);
  const replaceTarget = useRef(null); // element cid whose image is being replaced
  const ctx = useMemo(() => ({ festival, customFields, choiceFields, qrSettings, editing: true }), [festival, customFields, choiceFields, qrSettings]);

  useEffect(() => { ensurePassFonts(); }, []);

  // Load the template (or start a new one from the built-in starter)
  useEffect(() => {
    let cancelled = false;
    setLoadError('');
    if (isNew) {
      if (listLoading) return undefined;
      const base = starters.find((s) => s.id === 'starter-delegate') || starters[0];
      if (base) {
        const t = clone(base);
        setDraft({ ...t, id: undefined, name: '', is_starter: false, background_image: null, category_codes: [], assets: {}, elements: (t.elements || []).map(withCid) });
      }
      return undefined;
    }
    api.get(`/pass-templates/${templateId}`).then((res) => {
      if (cancelled) return;
      const t = res.data.template;
      if (t.is_starter) { navigate('/settings/badges', { replace: true }); return; }
      setDraft({ ...t, assets: t.assets || {}, elements: (t.elements || []).map(withCid) });
    }).catch((err) => {
      if (!cancelled) setLoadError(err.response?.status === 404 ? 'This template no longer exists.' : 'Could not load this template.');
    });
    return () => { cancelled = true; };
  }, [isNew, templateId, listLoading, starters, navigate]);

  // Pixel size of the background image, for the print-quality hint
  useEffect(() => {
    if (!draft?.background_image) { setImageInfo(null); return; }
    const img = new Image();
    img.onload = () => setImageInfo({ widthPx: img.naturalWidth, heightPx: img.naturalHeight });
    img.src = draft.background_image;
  }, [draft?.background_image]);

  // A few real delegates to preview with
  useEffect(() => {
    api.get('/registration/attendees', { params: { limit: 6 } })
      .then((res) => setSampleList(res.data.attendees || []))
      .catch(() => setSampleList([]));
  }, []);

  // Fit the preview to its box (width and, on desktop, the height of the sticky panel)
  useEffect(() => {
    const el = previewRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([entry]) => setPreviewBox({
      w: Math.max(200, entry.contentRect.width - 8),
      h: Math.max(200, entry.contentRect.height - 8)
    }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [draft !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  const previewData = useMemo(() => {
    const a = sampleList.find((x) => String(x.attendee_id) === sampleId);
    if (!a) return SAMPLE_PASS_DATA;
    const d = passDataFromAttendee(a, categories);
    return { ...d, qr_value: d.qr_value || SAMPLE_PASS_DATA.qr_value, badge_no: d.badge_no || SAMPLE_PASS_DATA.badge_no, sequence_no: d.sequence_no ?? SAMPLE_PASS_DATA.sequence_no };
  }, [sampleList, sampleId, categories]);

  // Sticker preview (QR only) also needs fitting/fonts
  useEffect(() => { if (mode === 'qr-only') fitWhenReady(stageRef.current); }, [mode, draft, previewData]);

  if (loadError) {
    return (
      <div className="fc-pt-page">
        <div className="fc-pt-error" role="alert">{loadError}</div>
        <Link to="/settings/badges" className="fc-pt-btn"><ArrowBackIcon size={14} /> Back to templates</Link>
      </div>
    );
  }
  if (!draft) return <div className="fc-pt-page"><p className="fc-pt-muted">Loading…</p></div>;

  const c = draft.config;
  const W = Number(draft.width_mm);
  const H = Number(draft.height_mm);
  const isArtwork = draft.design_mode === 'artwork';
  const elements = draft.elements || [];
  const selectedEl = elements.find((e) => e.cid === selected) || null;
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const setConfig = (patch) => setDraft((d) => ({ ...d, config: { ...d.config, ...patch } }));
  const setElements = (els) => setDraft((d) => ({ ...d, elements: els }));
  const updateElement = (cid, patch) => setDraft((d) => ({ ...d, elements: d.elements.map((e) => (e.cid === cid ? { ...e, ...patch } : e)) }));

  const setSize = (w, h) => {
    const nw = round2(Math.min(300, Math.max(20, Number(w) || 20)));
    const nh = round2(Math.min(300, Math.max(20, Number(h) || 20)));
    setDraft((d) => ({ ...d, width_mm: nw, height_mm: nh, elements: scaleElements(d.elements || [], Number(d.width_mm), Number(d.height_mm), nw, nh) }));
  };

  const fetchLayout = async (w, h) => {
    const res = await api.post('/pass-templates/layout-preview', { width_mm: w, height_mm: h });
    return (res.data.elements || []).map(withCid);
  };

  const chooseDesignType = async (key) => {
    if (key === draft.design_mode) return;
    setSelected(null);
    if (key === 'artwork') {
      set({ design_mode: 'artwork', elements: artworkStarterElements(W, H) });
      return;
    }
    setBusy('layout');
    try {
      set({ design_mode: 'layout', elements: await fetchLayout(W, H) });
    } catch {
      setSaveError('Could not load the built-in layout. Please try again.');
    } finally {
      setBusy('');
    }
  };

  const rearrange = async () => {
    setConfirmRearrange(false);
    setBusy('layout');
    try {
      setElements(await fetchLayout(W, H));
      setSelected(null);
    } catch {
      setSaveError('Could not rearrange the layout. Please try again.');
    } finally {
      setBusy('');
    }
  };

  // ── Adding elements ──
  const nextName = (base) => {
    const n = elements.filter((e) => e.name.startsWith(base)).length;
    return n ? `${base} ${n + 1}` : base;
  };
  const addElement = (el) => {
    const created = withCid({ ...el, position: clampPos({ rotation: 0, ...el.position }, W, H) });
    setElements([...elements, created]);
    setSelected(created.cid);
  };
  const addText = () => {
    const w = Math.min(50, W - 4);
    addElement({ type: 'text', name: nextName('Text'), position: { x: (W - w) / 2, y: H / 2 - 5, w, h: 10 }, metadata: { ...TEXT_DEFAULTS } });
  };
  const addImage = (source) => {
    setImageMenu(false);
    if (source === 'upload') { replaceTarget.current = null; elFileRef.current?.click(); return; }
    if (source === 'festival_logo') {
      const w = Math.min(30, W - 4);
      addElement({ type: 'image', name: nextName('Festival logo'), position: { x: (W - w) / 2, y: 4, w, h: Math.min(12, H - 4) }, metadata: { source, fit: 'contain', opacity: 1, radius: 0, showBadgeNo: false } });
      return;
    }
    const size = round2(Math.min(30, W - 4, H - 8));
    addElement({ type: 'image', name: nextName('Badge QR'), position: { x: (W - size) / 2, y: (H - size - 4) / 2, w: size, h: size + 4 }, metadata: { source: 'badge_qr', fit: 'contain', opacity: 1, radius: 0, showBadgeNo: true } });
  };
  const addChecklist = () => {
    const field = choiceFields.find((f) => f.key === 'pass_days') || choiceFields[0];
    const w = Math.min(60, W - 4);
    addElement({
      type: 'checklist',
      name: nextName('Checklist'),
      position: { x: (W - w) / 2, y: H / 2 - 7, w, h: 14 },
      metadata: field
        ? { source: 'field', field: field.key, items: [], font: 'inter', sizePt: 8, color: '#0f172a', columns: 1, box: 'square', showUnticked: true }
        : { source: 'static', field: '', items: ['Item 1', 'Item 2', 'Item 3'], font: 'inter', sizePt: 8, color: '#0f172a', columns: 1, box: 'square', showUnticked: true }
    });
  };

  const onElementImage = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImageError('');
    setBusy('upload');
    try {
      const img = await readPassImage(file, Math.max(W, H) * 0.6);
      const res = await api.post('/pass-templates/assets', { data_url: img.dataUrl });
      const assetId = res.data.asset_id;
      setDraft((d) => ({ ...d, assets: { ...(d.assets || {}), [assetId]: img.dataUrl } }));
      if (replaceTarget.current) {
        const target = elements.find((x) => x.cid === replaceTarget.current);
        if (target) updateElement(target.cid, { metadata: { ...target.metadata, asset_id: assetId } });
      } else {
        const w = Math.min(30, W - 4);
        const h = Math.min(H - 4, round2(w * (img.heightPx / img.widthPx)));
        addElement({ type: 'image', name: nextName('Image'), position: { x: (W - w) / 2, y: (H - h) / 2, w, h }, metadata: { source: 'upload', asset_id: assetId, fit: 'contain', opacity: 1, radius: 0, showBadgeNo: false } });
      }
    } catch (err) {
      setImageError(err.response?.data?.message || err.message || 'Could not upload the image.');
    } finally {
      setBusy('');
      replaceTarget.current = null;
    }
  };

  // ── Layers ──
  const moveLayer = (cid, dir) => {
    const i = elements.findIndex((x) => x.cid === cid);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= elements.length) return;
    const next = elements.slice();
    [next[i], next[j]] = [next[j], next[i]];
    setElements(next);
  };
  const duplicateElement = (cid) => {
    const el = elements.find((x) => x.cid === cid);
    if (!el) return;
    const copy = withCid({ ...clone(el), name: `${el.name} (copy)`.slice(0, 80), position: clampPos({ ...el.position, x: el.position.x + 2, y: el.position.y + 2 }, W, H) });
    const i = elements.findIndex((x) => x.cid === cid);
    setElements([...elements.slice(0, i + 1), copy, ...elements.slice(i + 1)]);
    setSelected(copy.cid);
  };
  const deleteElement = (cid) => {
    setElements(elements.filter((x) => x.cid !== cid));
    setSelected(null);
  };

  // ── Background image ──
  const onBackground = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImageError('');
    try {
      const img = await readPassImage(file, Math.max(W, H));
      set({ background_image: img.dataUrl });
      setImageDirty(true);
      // Artwork: match the pass shape to the image, keeping the current width
      if (isArtwork) {
        const ratio = img.heightPx / img.widthPx;
        if (Math.abs(ratio - H / W) > 0.02) setSize(W, round2(Math.min(300, Math.max(20, W * ratio))));
      }
    } catch (err) {
      setImageError(err.message);
    }
  };
  const removeBackground = () => { set({ background_image: null }); setImageDirty(true); };

  const dpi = imageInfo ? Math.min(effectiveDpi(imageInfo.widthPx, W), effectiveDpi(imageInfo.heightPx, H)) : 0;
  const imageRatioOff = isArtwork && imageInfo && Math.abs(imageInfo.heightPx / imageInfo.widthPx - H / W) > 0.02;

  const save = async () => {
    setSaveError('');
    if (!draft.name.trim()) { setSaveError('Give the template a name.'); return; }
    if (isArtwork && !draft.background_image) { setSaveError('Upload the artwork image for this template.'); return; }
    setSaving(true);
    const body = {
      name: draft.name,
      design_mode: draft.design_mode,
      width_mm: W,
      height_mm: H,
      config: draft.config,
      elements: elements.map(({ type, name, position, metadata }) => ({ type, name, position, metadata })),
      category_codes: draft.category_codes || []
    };
    if (imageDirty) body.background_image = draft.background_image || null;
    else body.keep_image = Boolean(draft.background_image);
    try {
      if (isNew) await api.post('/pass-templates', body);
      else await api.put(`/pass-templates/${draft.id}`, body);
      navigate('/settings/badges', { state: { notice: `Saved "${draft.name.trim()}".` } });
    } catch (err) {
      setSaveError(err.response?.status === 413 ? 'The image is too large to upload. Export a smaller version.' : (err.response?.data?.message || 'Could not save the template.'));
      setSaving(false);
    }
  };

  const { w: pw, h: ph } = pieceSize(draft, mode, ctx);
  // Desktop: the preview box fills the sticky panel, so its measured height is the limit.
  // Stacked (≤1024px): the box grows with its content, so cap by the window height instead.
  const stacked = typeof window !== 'undefined' && window.matchMedia('(max-width: 1024px)').matches;
  const maxPreviewH = stacked ? Math.max(260, window.innerHeight * 0.62) : previewBox.h;
  const scale = Math.min(2.5, previewBox.w / (pw * MM_PX), maxPreviewH / (ph * MM_PX));
  const layers = elements.slice().reverse(); // top-most first, as in design tools

  return (
    <div className="fc-pt-page fc-pte animate-fade-in">
      <nav aria-label="Breadcrumb" className="fc-pt-crumbs">
        <span>Settings</span>
        <span>/</span>
        <Link to="/settings/badges">Badges &amp; Passes</Link>
        <span>/</span>
        <span className="is-current">{isNew ? 'New template' : draft.name || 'Edit template'}</span>
      </nav>

      <div className="fc-pte-topbar">
        <label className="fc-pte-name">
          <span className="fc-pt-label">Template name</span>
          <input type="text" value={draft.name} maxLength={120} placeholder="For example: Delegate pass" onChange={(e) => set({ name: e.target.value })} />
        </label>
        <div className="fc-pte-top-actions">
          <Link to="/settings/badges" className="fc-pt-btn">Cancel</Link>
          <button type="button" className="fc-pt-btn is-primary" onClick={save} disabled={saving || Boolean(busy)}>
            <SaveIcon size={16} /> {saving ? 'Saving…' : 'Save template'}
          </button>
        </div>
      </div>
      {saveError && <div className="fc-pt-error" role="alert">{saveError}</div>}

      <div className="fc-pte-grid">
        {/* ── Form ── */}
        <div className="fc-pte-form">
          {/* The design type is chosen once, when the template is created; editing shows it read-only */}
          {isNew ? (
            <section className="fc-pte-card">
              <h2 className="fc-pte-h2">How do you want to design it?</h2>
              <div className="fc-pp-segment" role="radiogroup" aria-label="Design type">
                {[['layout', 'Built-in layout'], ['artwork', 'Your artwork']].map(([key, label]) => (
                  <button key={key} type="button" role="radio" aria-checked={draft.design_mode === key} className={`fc-pp-seg-btn ${draft.design_mode === key ? 'is-active' : ''}`} onClick={() => chooseDesignType(key)} disabled={Boolean(busy)}>
                    {label}
                  </button>
                ))}
              </div>
              <p className="fc-pt-hint">
                {isArtwork
                  ? 'Upload a finished design from your designer (PNG or JPG), then place text, images and checklists on it.'
                  : 'FestiPlus places the elements for you on a plain background; then move, restyle or add elements as you like.'}
              </p>
            </section>
          ) : (
            <p className="fc-pte-design-type">
              Design type: <strong>{isArtwork ? 'Your artwork' : 'Built-in layout'}</strong>
            </p>
          )}

          <section className="fc-pte-card">
            <h2 className="fc-pte-h2">Size</h2>
            <div className="fc-pte-row">
              <label className="fc-pte-field is-grow">
                <span className="fc-pt-label">Pass size</span>
                <select value={presetKey(W, H)} onChange={(e) => { const p = SIZE_PRESETS.find((s) => s.key === e.target.value); if (p) setSize(W > H && p.h > p.w ? p.h : p.w, W > H && p.h > p.w ? p.w : p.h); }}>
                  {SIZE_PRESETS.map((p) => <option key={p.key} value={p.key}>{p.label}: {p.w} × {p.h} mm</option>)}
                  <option value="custom">Custom size</option>
                </select>
              </label>
              <label className="fc-pte-field is-num">
                <span className="fc-pt-label">Width (mm)</span>
                <NumInput min={20} max={300} step={0.1} value={W} onCommit={(v) => setSize(v, H)} />
              </label>
              <label className="fc-pte-field is-num">
                <span className="fc-pt-label">Height (mm)</span>
                <NumInput min={20} max={300} step={0.1} value={H} onCommit={(v) => setSize(W, v)} />
              </label>
              <button type="button" className="fc-pt-btn fc-pte-rotate" onClick={() => setSize(H, W)} title="Swap width and height">
                {W >= H ? 'Make portrait' : 'Make landscape'}
              </button>
            </div>
            <p className="fc-pt-hint">Elements scale with the pass when you change its size.</p>
          </section>

          {isArtwork ? (
            <section className="fc-pte-card">
              <h2 className="fc-pte-h2">Artwork</h2>
              <div className="fc-pte-image-row">
                <button type="button" className="fc-pt-btn" onClick={() => bgFileRef.current?.click()}>
                  <UploadFileIcon size={16} /> {draft.background_image ? 'Replace artwork' : 'Upload artwork'}
                </button>
                {draft.background_image && <button type="button" className="fc-pt-btn is-quiet" onClick={removeBackground}><DeleteIcon size={14} /> Remove</button>}
              </div>
              <p className="fc-pt-hint">PNG or JPG at 300 dpi for the pass size. A PDF design can be exported as PNG first.</p>
              {draft.background_image && dpi > 0 && dpi < 150 && (
                <p className="fc-pt-warn"><WarningIcon size={14} /> This image is only about {dpi} dpi at this size and may print blurry.</p>
              )}
              {imageRatioOff && (
                <p className="fc-pt-warn">
                  <WarningIcon size={14} /> The artwork shape doesn't match the pass size, so it will be stretched.
                  <button type="button" className="fc-pt-link" onClick={() => setSize(W, W * (imageInfo.heightPx / imageInfo.widthPx))}>Match the artwork</button>
                </p>
              )}
            </section>
          ) : (
            <section className="fc-pte-card">
              <h2 className="fc-pte-h2">Look</h2>
              <div className="fc-pte-row">
                <label className="fc-pte-field is-num">
                  <span className="fc-pt-label">Background</span>
                  <input type="color" value={c.background} onChange={(e) => setConfig({ background: e.target.value })} />
                </label>
                <label className="fc-pte-field is-num">
                  <span className="fc-pt-label">Accent colour</span>
                  <input type="color" value={c.accent} onChange={(e) => setConfig({ accent: e.target.value })} />
                </label>
              </div>
              <label className="fc-pte-check">
                <input type="checkbox" checked={Boolean(c.useCategoryColor)} onChange={(e) => setConfig({ useCategoryColor: e.target.checked })} />
                Use each category's badge colour as the accent (set in Settings › Audience › Categories)
              </label>
              <p className="fc-pt-hint">Elements set to "Accent colour" follow this, so one change recolours the band, festival name and so on.</p>
              <div className="fc-pte-image-row">
                <button type="button" className="fc-pt-btn" onClick={() => bgFileRef.current?.click()}>
                  <ImageIcon size={16} /> {draft.background_image ? 'Replace background image' : 'Add background image'}
                </button>
                {draft.background_image && <button type="button" className="fc-pt-btn is-quiet" onClick={removeBackground}><DeleteIcon size={14} /> Remove</button>}
                {confirmRearrange ? (
                  <span className="fc-pt-confirm">
                    Replace all elements with the default layout?
                    <button type="button" className="fc-pt-btn is-small is-danger" onClick={rearrange}>Yes</button>
                    <button type="button" className="fc-pt-btn is-small" onClick={() => setConfirmRearrange(false)}>No</button>
                  </span>
                ) : (
                  <button type="button" className="fc-pt-btn" onClick={() => setConfirmRearrange(true)} disabled={Boolean(busy)}>
                    <SyncIcon size={16} /> Rearrange for me
                  </button>
                )}
              </div>
              {draft.background_image && dpi > 0 && dpi < 150 && (
                <p className="fc-pt-warn"><WarningIcon size={14} /> This image is only about {dpi} dpi at this size and may print blurry.</p>
              )}
            </section>
          )}

          <section className="fc-pte-card">
            <h2 className="fc-pte-h2">Elements</h2>
            <p className="fc-pt-hint">Drag an element on the preview to move it and its corner to resize. Arrow keys nudge the selected element; Delete removes it.</p>
            <div className="fc-pte-add">
              <button type="button" className="fc-pt-btn" onClick={addText}><TextFieldsIcon size={16} /> Text</button>
              <div className="fc-pte-add-menu">
                <button type="button" className="fc-pt-btn" onClick={() => setImageMenu((v) => !v)} aria-expanded={imageMenu} disabled={busy === 'upload'}>
                  <ImageIcon size={16} /> {busy === 'upload' ? 'Uploading…' : 'Image'}
                </button>
                {imageMenu && (
                  <div className="fc-pte-menu" role="menu">
                    <button type="button" role="menuitem" onClick={() => addImage('upload')}><UploadFileIcon size={15} /> Upload an image</button>
                    <button type="button" role="menuitem" onClick={() => addImage('festival_logo')} disabled={!festival.logo_url}><BadgeIcon size={15} /> Festival logo{festival.logo_url ? '' : ' (none yet)'}</button>
                    <button type="button" role="menuitem" onClick={() => addImage('badge_qr')}><QrCodeScannerIcon size={15} /> Badge QR</button>
                  </div>
                )}
              </div>
              <button type="button" className="fc-pt-btn" onClick={addChecklist}><ChecklistIcon size={16} /> Checklist</button>
            </div>
            {imageError && <p className="fc-pt-inline-error" role="alert">{imageError}</p>}

            {layers.length === 0 ? (
              <p className="fc-pt-muted">No elements yet. Add text, an image or a checklist.</p>
            ) : (
              <ul className="fc-pte-layers" aria-label="Elements, top-most first">
                {layers.map((el) => {
                  const Icon = TYPE_ICON[el.type] || TextFieldsIcon;
                  const i = elements.findIndex((x) => x.cid === el.cid);
                  return (
                    <li key={el.cid} className={`fc-pte-layer ${selected === el.cid ? 'is-active' : ''}`}>
                      <button type="button" className="fc-pte-layer-main" onClick={() => setSelected(el.cid)}>
                        <Icon size={15} />
                        <span className="fc-pte-layer-name">{el.name}</span>
                        <span className="fc-pte-layer-type">{el.type === 'image' && el.metadata.source === 'badge_qr' ? 'QR' : el.type}</span>
                      </button>
                      <span className="fc-pte-field-move">
                        <button type="button" onClick={() => moveLayer(el.cid, 1)} disabled={i === elements.length - 1} aria-label={`Bring ${el.name} forward`} title="Bring forward"><ArrowUpwardIcon size={14} /></button>
                        <button type="button" onClick={() => moveLayer(el.cid, -1)} disabled={i === 0} aria-label={`Send ${el.name} backward`} title="Send backward"><ArrowDownwardIcon size={14} /></button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}

            {selectedEl && (
              <PassElementProperties
                key={selectedEl.cid}
                element={selectedEl}
                W={W}
                H={H}
                onChange={(patch) => updateElement(selectedEl.cid, patch)}
                onDuplicate={() => duplicateElement(selectedEl.cid)}
                onDelete={() => deleteElement(selectedEl.cid)}
                onReplaceImage={() => { replaceTarget.current = selectedEl.cid; elFileRef.current?.click(); }}
                customFields={customFields}
                choiceFields={choiceFields}
                hasLogo={Boolean(festival.logo_url)}
              />
            )}
          </section>

          <section className="fc-pte-card">
            <h2 className="fc-pte-h2">Categories</h2>
            <p className="fc-pt-hint">Delegates in these categories print with this template by default. Leave all unticked to use it for any category.</p>
            {categories.length === 0 && <p className="fc-pt-muted">No categories yet (Settings › Audience › Categories).</p>}
            <div className="fc-pte-checks">
              {categories.map((cat) => (
                <label key={cat.code} className="fc-pte-check">
                  <input
                    type="checkbox"
                    checked={(draft.category_codes || []).includes(cat.code)}
                    onChange={(e) => set({ category_codes: e.target.checked ? [...(draft.category_codes || []), cat.code] : (draft.category_codes || []).filter((x) => x !== cat.code) })}
                  />
                  <span className="fc-pte-swatch" style={{ background: cat.color || 'var(--fc-border)' }} aria-hidden="true" /> {cat.name}
                </label>
              ))}
            </div>
          </section>
        </div>

        {/* ── Preview / canvas ── */}
        <aside className="fc-pte-preview">
          <div className="fc-pte-card fc-pte-preview-card">
            <div className="fc-pte-preview-head">
              <h2 className="fc-pte-h2">Preview</h2>
              <span className="fc-pp-size">{round2(pw)} × {round2(ph)} mm</span>
            </div>
            <div className="fc-pte-preview-controls">
              <div className="fc-pp-segment" role="radiogroup" aria-label="Preview mode">
                {PASS_MODES.map((m) => (
                  <button key={m.key} type="button" role="radio" aria-checked={mode === m.key} className={`fc-pp-seg-btn ${mode === m.key ? 'is-active' : ''}`} onClick={() => setMode(m.key)}>
                    {m.label}
                  </button>
                ))}
              </div>
              <select className="fc-pte-preview-with" value={sampleId} onChange={(e) => setSampleId(e.target.value)} aria-label="Preview with">
                <option value="sample">Preview with sample details</option>
                {sampleList.map((a) => <option key={a.attendee_id} value={String(a.attendee_id)}>Preview with {a.name}</option>)}
              </select>
            </div>
            <div className="fc-pte-preview-box" ref={previewRef}>
              {mode !== 'qr-only' ? (
                <ElementCanvas
                  template={draft}
                  data={previewData}
                  mode={mode}
                  ctx={ctx}
                  scale={scale}
                  selected={selected}
                  onSelect={setSelected}
                  onElementsChange={setElements}
                  onDelete={deleteElement}
                />
              ) : (
                <div className="fc-pte-stage" style={{ width: pw * MM_PX * scale, height: ph * MM_PX * scale }}>
                  <div
                    ref={stageRef}
                    style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: 'max-content' }}
                    // Renderer output: every value is escaped in passRenderer
                    dangerouslySetInnerHTML={{ __html: renderPass(draft, previewData, mode, ctx) }}
                  />
                </div>
              )}
            </div>
            <p className="fc-pt-hint fc-pte-preview-hint">
              {mode === 'qr-only' ? 'QR only stickers use the festival\'s QR Settings, set in the print dialog.' : 'Exactly what prints. Sample details appear only here.'}
            </p>
          </div>
        </aside>
      </div>

      <input ref={bgFileRef} type="file" accept="image/png,image/jpeg" hidden onChange={onBackground} />
      <input ref={elFileRef} type="file" accept="image/png,image/jpeg" hidden onChange={onElementImage} />
      <style>{passCss('.fc-pte-preview-box')}</style>
    </div>
  );
}
