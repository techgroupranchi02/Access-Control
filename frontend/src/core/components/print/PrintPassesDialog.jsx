/**
 * PrintPassesDialog: the one print dialog for badges and passes (docs/adr/0005-pass-templates.md).
 *
 * Staff pick what to print (Pass with QR, the default, or QR sticker only), the template (not for QR only),
 * the paper (A4 sheet, or one pre-cut card per page at the pass size, ADR 0005 Amendment 4), the
 * A4 page layout (orientation, margins on/off, columns × rows), then print. The preview shows
 * the whole first A4 page. QR only shows the festival's QR Settings (sticker
 * size and lines); admins can save them as the festival default.
 *
 * Used by Bulk QR, the Audience pass dialog, Audience "Print passes" and the Assign QR success screen.
 *
 * Props:
 *   items        [{ data, categoryCode }]  data from passDataFromAttendee / passDataFromBadge
 *   defaultMode  'full' (Pass with QR, the default) | 'qr-only' (QR sticker only)
 *   title        dialog heading
 *   jobTitle     suggested PDF file name
 *   onClose()    only the close (×) button closes the dialog: not an outside click, Escape or
 *                Print, so staff can print one batch after another
 *
 * Staff can narrow the print to a badge range (From / To). The footer and the preview show which
 * badge numbers (#001–#075) print. Each Print press is
 * recorded per badge (qr_print_log), and badges printed before get a warning with the option to
 * leave them out (ADR 0005, Amendment 3).
 */
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import api from '../../services/api';
import usePassTemplates from '../../hooks/usePassTemplates';
import { printInPage } from '../../utils/printInPage';
import {
  PASS_MODES, DEFAULT_QR_SETTINGS, MM_PX, MAX_GRID, passCss, pickTemplate, renderPass, renderSheet, renderPagePreview,
  pieceSize, fitWhenReady, ensurePassFonts, formatSequence, inchLabel, passFontsUrl
} from '../../utils/passRenderer';
import { NumInput } from './PassElementProperties';
import { CloseIcon, PrintIcon, InfoIcon, SaveIcon, CheckCircleIcon, WarningIcon, FileDownloadIcon } from '../common/Icons';

const AUTO = 'auto';
// The server answers these addresses with the saved template images (cardPdf.service.js), so the
// artwork isn't uploaded with every PDF job
const PDF_IMAGE_BASE = 'https://pp-img.invalid/';
const PDF_MAX_CARDS = 500;
const fileSafe = (v) => String(v || '').trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '-');

/** File name for one card's PDF: running number, then delegate serial and name, else the badge number. */
function cardFileName(data = {}) {
  const seq = data.sequence_no === null || data.sequence_no === undefined || data.sequence_no === '' ? '' : String(data.sequence_no).padStart(3, '0');
  const who = [data.serial, data.name].filter(Boolean);
  return [seq, ...(who.length ? who : [data.badge_no])].filter(Boolean).map(fileSafe).join('-');
}

/** The template with its saved images swapped for server addresses (unsaved images stay inline). */
function templateForPdf(template) {
  if (!template || !/^\d+$/.test(String(template.id ?? ''))) return template;
  const isData = (src) => typeof src === 'string' && src.startsWith('data:');
  const assets = {};
  Object.entries(template.assets || {}).forEach(([id, src]) => {
    assets[id] = isData(src) && /^\d+$/.test(id) ? `${PDF_IMAGE_BASE}asset/${id}` : src;
  });
  return {
    ...template,
    background_image: isData(template.background_image) ? `${PDF_IMAGE_BASE}bg/${template.id}` : template.background_image,
    assets
  };
}

/** Gzips a JSON body when the browser can (the proxy in front of the API limits request size). */
async function gzipJson(value) {
  const json = JSON.stringify(value);
  if (typeof CompressionStream === 'undefined') return { body: json, headers: { 'Content-Type': 'application/json' } };
  const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
  const body = await new Response(stream).blob();
  return { body, headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' } };
}

async function blobErrorMessage(err) {
  const data = err?.response?.data;
  if (data instanceof Blob) {
    try { return JSON.parse(await data.text())?.message || ''; } catch { return ''; }
  }
  return data?.message || '';
}
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

/**
 * Badge sequence numbers as ranges: [1,2,3,7,8] → "#001–#003, #007–#008".
 * Long lists keep the first `maxParts` ranges and add "+ N more".
 */
function sequenceRanges(nums, maxParts = 4) {
  const sorted = [...new Set(nums.filter((n) => Number.isFinite(n)))].sort((a, b) => a - b);
  const parts = [];
  for (const n of sorted) {
    const last = parts[parts.length - 1];
    if (last && n === last[1] + 1) last[1] = n;
    else parts.push([n, n]);
  }
  const label = ([a, b]) => (a === b ? formatSequence(a) : `${formatSequence(a)}–${formatSequence(b)}`);
  const shown = parts.slice(0, maxParts).map(label).join(', ');
  const rest = parts.slice(maxParts).reduce((sum, [a, b]) => sum + (b - a + 1), 0);
  return rest ? `${shown} + ${rest} more` : shown;
}

const seqOf = (item) => {
  const n = Number(item?.data?.sequence_no);
  return item?.data?.sequence_no !== null && item?.data?.sequence_no !== undefined && Number.isFinite(n) ? n : null;
};

const formatWhen = (value) => {
  const d = value ? new Date(value) : null;
  return d && !Number.isNaN(d.getTime())
    ? d.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '';
};

/**
 * ⓘ button with a themed popover. The popover is portalled to <body> with position: fixed, so it
 * never changes the dialog's scroll area: a popover inside the scrolling body added a scrollbar,
 * which shifted the icon away from the pointer and made the popover flicker.
 * Opens on mouse hover, focus or tap (a tap elsewhere closes it); placed below the icon, or above
 * when there's no room.
 */
function InfoPopover({ id, label, children }) {
  const btnRef = useRef(null);
  const popRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);

  useLayoutEffect(() => {
    if (!open) { setPos(null); return undefined; }
    const place = () => {
      const b = btnRef.current?.getBoundingClientRect();
      const p = popRef.current;
      if (!b || !p) return;
      const w = p.offsetWidth;
      const h = p.offsetHeight;
      const below = window.innerHeight - b.bottom >= h + 16 || b.top < h + 16;
      const left = Math.min(Math.max(8, b.right + 6 - w), window.innerWidth - w - 8);
      setPos({ left, top: below ? b.bottom + 8 : b.top - h - 8, below, arrow: Math.min(Math.max(12, b.left + b.width / 2 - left), w - 12) });
    };
    place();
    const close = () => setOpen(false);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => { window.removeEventListener('resize', close); window.removeEventListener('scroll', close, true); };
  }, [open]);

  return (
    <>
      <span
        ref={btnRef}
        className="fc-pp-info"
        tabIndex={0}
        role="button"
        aria-label={label}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        // Hover only for a real mouse: touch browsers send a synthetic mouseleave right after a tap
        onPointerEnter={(e) => { if (e.pointerType === 'mouse') setOpen(true); }}
        onPointerLeave={(e) => { if (e.pointerType === 'mouse') setOpen(false); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } }}
      >
        <InfoIcon size={14} />
      </span>
      {open && createPortal(
        <span
          ref={popRef}
          id={id}
          role="tooltip"
          className={`fc-pp-info-pop ${pos && !pos.below ? 'is-above' : ''}`}
          style={{ left: pos?.left ?? -9999, top: pos?.top ?? 0, visibility: pos ? 'visible' : 'hidden', '--fc-pp-arrow': `${pos?.arrow ?? 12}px` }}
        >
          {children}
        </span>,
        document.body
      )}
    </>
  );
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
  // A4 sheet, or 'card': one pre-cut card per page at the pass size (remembered per viewer)
  const [paper, setPaper] = useState(prefs.paper === 'card' ? 'card' : 'a4');
  // { [mode]: { orientation, cols, rows } }. Margins are never restored: every print starts with them on.
  const [layoutPrefs, setLayoutPrefs] = useState(() => Object.fromEntries(
    Object.entries(prefs.layout || {}).map(([m, l]) => {
      const { margins, ...rest } = l || {}; // eslint-disable-line no-unused-vars
      return [m, rest];
    })
  ));
  const [choice, setChoice] = useState(AUTO);
  const [fulls, setFulls] = useState(new Map()); // template id → full template, for the preview
  const [qr, setQr] = useState(null);
  const [qrSaved, setQrSaved] = useState('');
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState('');
  const [printed, setPrinted] = useState({}); // qr value → { count, last_printed_at, last_printed_by, last_mode }
  const [skipPrinted, setSkipPrinted] = useState(false);
  const [range, setRange] = useState({ from: null, to: null }); // typed text; null = not changed (whole set)
  const [statusTick, setStatusTick] = useState(0); // bumps after a print is recorded, to refresh the warning
  const [lastSent, setLastSent] = useState('');
  const [makingPdfs, setMakingPdfs] = useState(false);
  const [pdfProgress, setPdfProgress] = useState(null); // { phase: 'prepare' | 'make', total, done, loaded, totalBytes }
  const pdfAbort = useRef(null);

  // Which of these badges were printed before (a failed check just shows no warning)
  const qrValuesKey = items.map((i) => i.data?.qr_value || '').join('|');
  useEffect(() => {
    let cancelled = false;
    const values = [...new Set(items.map((i) => i.data?.qr_value).filter(Boolean))];
    if (!values.length) { setPrinted({}); return undefined; }
    api.post('/registration/qr/print-status', { qr_values: values })
      .then((res) => { if (!cancelled) setPrinted(res.data?.printed || {}); })
      .catch(() => { if (!cancelled) setPrinted({}); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qrValuesKey, statusTick]);

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
  // Margins are on each time the dialog opens; switching them off applies to this dialog only
  const layout = { margins: 'standard', ...(layoutPrefs[mode] || {}) };
  const setLayout = (patch) => setLayoutPrefs((p) => ({ ...p, [mode]: { ...(p[mode] || {}), ...patch } }));

  // Items that can print in this mode: QR only needs a QR. Badges printed before can be left out.
  const isPrinted = (i) => Boolean(i.data?.qr_value && printed[i.data.qr_value]);
  const inMode = useMemo(() => (isQrOnly ? items.filter((i) => i.data?.qr_value) : items), [items, isQrOnly]);

  // Badge range (From / To sequence numbers); starts as the whole set
  const numbers = inMode.map(seqOf).filter((n) => n !== null);
  const minSeq = numbers.length ? Math.min(...numbers) : null;
  const maxSeq = numbers.length ? Math.max(...numbers) : null;
  const parseSeq = (text) => { const d = String(text ?? '').replace(/\D/g, ''); return d ? parseInt(d, 10) : null; };
  const fromSeq = range.from === null ? minSeq : (parseSeq(range.from) ?? minSeq);
  const toSeq = range.to === null ? maxSeq : (parseSeq(range.to) ?? maxSeq);
  const showRange = numbers.length >= 2;
  const rangeActive = showRange && (fromSeq !== minSeq || toSeq !== maxSeq);
  const rangeError = showRange && fromSeq !== null && toSeq !== null && fromSeq > toSeq;
  // While From > To nothing is selected (the error under the fields explains why)
  const inRange = useMemo(() => (rangeError ? [] : !rangeActive ? inMode : inMode.filter((i) => {
    const n = seqOf(i);
    return n !== null && n >= fromSeq && n <= toSeq;
  })), [inMode, rangeActive, rangeError, fromSeq, toSeq]);
  const pad = (n) => (n === null ? '' : String(n).padStart(3, '0'));

  const printable = useMemo(() => (skipPrinted ? inRange.filter((i) => !isPrinted(i)) : inRange),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [inRange, skipPrinted, printed]);
  const withoutQr = items.filter((i) => !i.data?.qr_value).length;

  // Badge numbers in this print, and those printed before
  const printedBefore = inRange.filter(isPrinted);
  const lastPrint = printedBefore.reduce((best, i) => {
    const p = printed[i.data.qr_value];
    return !best || new Date(p.last_printed_at) > new Date(best.last_printed_at) ? p : best;
  }, null);
  const rangeOf = (list) => sequenceRanges(list.map(seqOf));
  const jobRange = rangeOf(printable);
  const unnumbered = printable.filter((i) => seqOf(i) === null && i.data?.qr_value).length;

  // QR only has no template choice: the sticker uses the festival's QR Settings
  const templateFor = (item) => {
    if (choice !== AUTO && !isQrOnly) {
      return templates.find((t) => String(t.id) === choice) || starters.find((s) => s.id === choice) || null;
    }
    return pickTemplate(templates, starters, item.categoryCode, mode);
  };

  // Templates needed for the preview: the first pass, or every pass on the first A4 page
  const previewCount = isA4 ? Math.min(printable.length, 60) : Math.min(printable.length, 1);
  const previewMetas = loading ? [] : printable.slice(0, previewCount).map(templateFor).filter(Boolean);
  const previewKey = previewMetas.map((m) => m.id).join(',');

  // Card paper: the page is the pass size (or sticker size for QR only)
  const firstMeta = !loading && printable[0] ? templateFor(printable[0]) : null;
  const cardSize = firstMeta ? pieceSize(firstMeta, mode, ctx) : null;
  const cardLabel = cardSize ? (inchLabel(cardSize.w, cardSize.h) || `${Math.round(cardSize.w * 10) / 10} × ${Math.round(cardSize.h * 10) / 10} mm`) : '';
  const mixedSizes = !isQrOnly && new Set(printable.slice(0, 200).map(templateFor).filter(Boolean).map((t) => `${t.width_mm}x${t.height_mm}`)).size > 1;
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
      savePrefs({ ...prefs, layout: layoutPrefs, paper });
      // Record which badges were sent to print (the next print warns about them); never blocks printing
      const logItems = printable.map((item, i) => ({ qr_value: item.data?.qr_value, template_id: isQrOnly ? null : metas[i].id })).filter((x) => x.qr_value);
      if (logItems.length) {
        api.post('/registration/qr/print-log', { mode, items: logItems })
          .then(() => setStatusTick((t) => t + 1))
          .catch(() => {});
      }
      setLastSent(`Sent ${printable.length} ${printable.length === 1 ? unit[0] : unit[1]}${jobRange ? ` (${jobRange})` : ''} to print.`);
      printInPage(html, css, jobTitle || `${festival.name || 'Festival'} ${PASS_MODES.find((m) => m.key === mode)?.label || ''}`.trim(), { prepare: fitWhenReady });
    } catch (err) {
      setPrintError(err.response?.data?.message || err.message || 'Could not prepare the print.');
    } finally {
      setPrinting(false);
    }
  };

  // One PDF per card, made on the server from the same markup as Print, delivered as a ZIP
  const handleDownloadPdfs = async () => {
    setPrintError('');
    if (printable.length === 0) return;
    if (printable.length > PDF_MAX_CARDS) {
      setPrintError(`Make PDFs for up to ${PDF_MAX_CARDS} cards at a time. Narrow the badge range.`);
      return;
    }
    setMakingPdfs(true);
    setLastSent('');
    const total = printable.length;
    setPdfProgress({ phase: 'prepare', total, done: 0, loaded: 0, totalBytes: 0 });
    const controller = new AbortController();
    pdfAbort.current = controller;
    const root = document.createElement('div');
    try {
      const metas = printable.map(templateFor);
      if (metas.some((m) => !m)) throw new Error('No template to make the PDFs with.');
      const unique = [...new Map(metas.map((m) => [m.id, m])).values()];
      const loaded = new Map();
      for (const m of unique) loaded.set(m.id, templateForPdf(await loadFull(m)));
      const jobItems = printable.map((item, i) => ({ template: loaded.get(metas[i].id), data: item.data }));
      const { html, css } = renderSheet(jobItems, mode, 'card', ctx);

      // Lay the cards out off-screen with the print CSS and fit the text, as Print does
      const style = document.createElement('style');
      style.textContent = css.replace(/@page[^{]*\{[^}]*\}/g, '');
      root.id = 'fc-print-root';
      root.style.cssText = 'position:fixed;left:-100000px;top:0;';
      root.innerHTML = html;
      root.appendChild(style);
      document.body.appendChild(root);
      await fitWhenReady(root);
      const cards = [...root.querySelectorAll(':scope > .pp-page')].map((el, i) => ({
        name: cardFileName(printable[i].data),
        html: el.outerHTML
      }));

      const label = isQrOnly ? 'QR-stickers' : (items.some((i) => i.data?.attendee_id) ? 'Passes' : 'Badges');
      const zipName = [festival.name || 'Festival', label, jobRange ? jobRange.replace(/#/g, '').replace(/[–,\s]+/g, '-') : '']
        .filter(Boolean).map(fileSafe).join('-');
      const { body, headers } = await gzipJson({ zipName, css, fontsUrl: passFontsUrl(), cards });
      root.remove();
      setPdfProgress({ phase: 'make', total, done: 0, loaded: 0, totalBytes: 0 });
      // The ZIP streams in while the server makes the PDFs; X-Card-Bytes (the first PDF's size) turns bytes into cards
      const res = await api.post('/registration/qr/card-pdfs', body, {
        headers,
        responseType: 'blob',
        timeout: 30 * 60 * 1000,
        signal: controller.signal,
        onDownloadProgress: (e) => {
          const per = Number(e.event?.target?.getResponseHeader?.('X-Card-Bytes')) || 0;
          setPdfProgress({
            phase: 'make',
            total,
            loaded: e.loaded,
            totalBytes: per * total,
            done: per ? Math.min(total, Math.floor(e.loaded / per)) : 0
          });
        }
      });

      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${zipName}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);

      savePrefs({ ...prefs, layout: layoutPrefs, paper });
      const logItems = printable.map((item, i) => ({ qr_value: item.data?.qr_value, template_id: isQrOnly ? null : metas[i].id })).filter((x) => x.qr_value);
      if (logItems.length) {
        api.post('/registration/qr/print-log', { mode, items: logItems })
          .then(() => setStatusTick((t) => t + 1))
          .catch(() => {});
      }
      setLastSent(`Saved ${printable.length} ${printable.length === 1 ? unit[0] : unit[1]}${jobRange ? ` (${jobRange})` : ''} as PDFs.`);
    } catch (err) {
      if (controller.signal.aborted) setLastSent('Stopped. No PDFs were saved.');
      else setPrintError((await blobErrorMessage(err)) || err.message || 'Could not make the PDFs.');
    } finally {
      root.remove();
      pdfAbort.current = null;
      setPdfProgress(null);
      setMakingPdfs(false);
    }
  };
  const stopPdfs = () => pdfAbort.current?.abort();

  const mb = (bytes) => (bytes >= 10 * 1048576 ? Math.round(bytes / 1048576) : Math.round(bytes / 104857.6) / 10);
  const pdfShare = pdfProgress && pdfProgress.totalBytes ? Math.min(1, pdfProgress.loaded / pdfProgress.totalBytes) : null;
  const pdfStatus = !pdfProgress ? '' : pdfProgress.phase === 'prepare'
    ? `Preparing ${pdfProgress.total} card${pdfProgress.total === 1 ? '' : 's'}…`
    : !pdfProgress.loaded
      ? `Making ${pdfProgress.total} PDF${pdfProgress.total === 1 ? '' : 's'}…`
      : `Making PDFs: ${pdfProgress.done} of ${pdfProgress.total}${pdfProgress.totalBytes ? ` · ${mb(pdfProgress.loaded)} of ${mb(pdfProgress.totalBytes)} MB` : ''}`;

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
    <div className="fc-modal-overlay" role="presentation">
      <div className="fc-modal-card fc-pp-dialog" role="dialog" aria-modal="true" aria-labelledby="fc-pp-title">
        <style>{passCss('.fc-pp-preview-stage')}{page ? page.css.replaceAll('.fc-pp-page-preview', '.fc-pp-preview-stage') : ''}</style>
        <div className="fc-modal-header">
          <h2 id="fc-pp-title" className="fc-pp-title">{title}</h2>
          <button type="button" className="fc-modal-close" onClick={onClose} aria-label="Close"><CloseIcon size={18} /></button>
        </div>

        <div className="fc-pp-body">
          <div className="fc-pp-controls">
            {showRange && (
              <div className="fc-pp-field">
                <span className="fc-pp-label" id="fc-pp-range-label">Badges to print</span>
                <div className="fc-pp-seq-row" role="group" aria-labelledby="fc-pp-range-label">
                  <label className="fc-pp-seq">
                    <span className="fc-pp-seq-cap">From</span>
                    <span className="fc-pp-seq-box">
                      <span aria-hidden="true">#</span>
                      <input type="text" inputMode="numeric" maxLength={7} value={range.from === null ? pad(minSeq) : range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} onBlur={() => setRange((r) => (r.from !== null && parseSeq(r.from) === null ? { ...r, from: null } : r))} aria-label="Print from badge number" />
                    </span>
                  </label>
                  <span className="fc-pp-seq-dash" aria-hidden="true">–</span>
                  <label className="fc-pp-seq">
                    <span className="fc-pp-seq-cap">To</span>
                    <span className="fc-pp-seq-box">
                      <span aria-hidden="true">#</span>
                      <input type="text" inputMode="numeric" maxLength={7} value={range.to === null ? pad(maxSeq) : range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} onBlur={() => setRange((r) => (r.to !== null && parseSeq(r.to) === null ? { ...r, to: null } : r))} aria-label="Print to badge number" />
                    </span>
                  </label>
                  <span className="fc-pp-seq-count">{rangeError ? '' : `${inRange.length} of ${inMode.length}`}</span>
                  {rangeActive && (
                    <button type="button" className="fc-pp-btn is-small" onClick={() => setRange({ from: null, to: null })}>All badges</button>
                  )}
                </div>
                {rangeError && <p className="fc-pp-fit-msg" role="alert"><WarningIcon size={14} /> From must be the same as or lower than To.</p>}
                {!rangeError && <span className="fc-pp-hint">Any range within #{pad(minSeq)}–#{pad(maxSeq)}, the badges in this list.</span>}
              </div>
            )}

            {printedBefore.length > 0 && (
              <div className="fc-pp-reprint" role="status">
                <WarningIcon size={16} />
                <div className="fc-pp-reprint-text">
                  {inRange.length === 1 ? (
                    <strong>
                      Badge {[formatSequence(seqOf(printedBefore[0])), printedBefore[0].data.badge_no].filter(Boolean).join(' · ')} was printed before
                      {printed[printedBefore[0].data.qr_value].count > 1 ? ` (${printed[printedBefore[0].data.qr_value].count} times)` : ''}
                    </strong>
                  ) : (
                    <strong>
                      {printedBefore.length === inRange.length ? `All ${inRange.length}` : `${printedBefore.length} of ${inRange.length}`} badges were printed before
                      {rangeOf(printedBefore) ? `: ${rangeOf(printedBefore)}` : ''}
                    </strong>
                  )}
                  {lastPrint && (
                    <span>
                      Last sent to print {formatWhen(lastPrint.last_printed_at)}{lastPrint.last_printed_by ? ` by ${lastPrint.last_printed_by}` : ''}
                      {' '}({lastPrint.last_mode === 'qr-only' ? 'QR sticker only' : 'Pass with QR'}). Printing again makes a second badge with the same number.
                    </span>
                  )}
                  {inRange.length > 1 && (
                    <label className="fc-pp-reprint-skip">
                      <input type="checkbox" checked={skipPrinted} onChange={(e) => setSkipPrinted(e.target.checked)} />
                      Leave out the {printedBefore.length} already printed
                    </label>
                  )}
                </div>
              </div>
            )}

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

            {cardSize && (
              <div className="fc-pp-field">
                <span className="fc-pp-label">Paper</span>
                <Segmented
                  label="Paper"
                  value={paper}
                  options={[
                    { key: 'a4', label: 'A4 sheet', hint: 'Several per A4 page, cut afterwards' },
                    { key: 'card', label: `Card ${cardLabel}`, hint: 'One pre-cut card per page' }
                  ]}
                  onChange={setPaper}
                />
                {!isA4 && (
                  <span className="fc-pp-hint">
                    One card per page at {cardLabel}{mixedSizes ? ' (each page takes the size of its card)' : ''}. In the print window choose the card printer, paper size {cardLabel}, margins None and scale 100%; turn on borderless if the printer offers it.
                    {' '}Save as PDFs makes one file per card, in a ZIP.
                  </span>
                )}
              </div>
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
                    <span>Margins</span>
                    <span className="fc-toggle-switch fc-pp-switch-sm">
                      <input
                        type="checkbox"
                        role="switch"
                        checked={layout.margins !== 'none'}
                        onChange={(e) => setLayout({ margins: e.target.checked ? 'standard' : 'none' })}
                        aria-label="Margins"
                      />
                      <span className="fc-toggle-slider" />
                    </span>
                  </label>
                  <InfoPopover id={MARGINS_INFO_ID} label="About margins">
                    <strong>Margins on</strong>
                    <span>8 mm page margin and 4 mm cut gaps.</span>
                    <strong>Off</strong>
                    <span>Passes touch the page edges and each other. Most office printers can't print the outer 3–5 mm, so trim after printing or use a borderless printer.</span>
                  </InfoPopover>
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
                            Turn margins off instead (100%)
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
              {!loading && printable.length === 0 && <span className="fc-pp-muted">{skipPrinted && inRange.length > 0 ? 'Every badge here was printed before. Untick "Leave out" to print them again.' : (rangeError ? 'Fix the badge range to see the preview.' : rangeActive && inRange.length === 0 ? 'No badges in this range.' : 'Nothing to print in this mode.')}</span>}
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
            {!isA4 && printable.length > 0 && (
              <span className="fc-pp-page-count">
                Card 1 of {printable.length}{rangeOf(printable.slice(0, 1)) ? ` · ${rangeOf(printable.slice(0, 1))}` : ''}
              </span>
            )}
            {page && (
              <span className="fc-pp-page-count">
                Page 1 of {totalPages}
                {rangeOf(printable.slice(0, page.layout.perPage)) ? ` · ${rangeOf(printable.slice(0, page.layout.perPage))}` : ''}
              </span>
            )}
          </div>
        </div>

        <div className="fc-modal-footer fc-pp-footer">
          <span className="fc-pp-count">
            {printable.length} {printable.length === 1 ? unit[0] : unit[1]}
            {jobRange && <span className="fc-pp-range">Badges {jobRange}{unnumbered ? ` + ${unnumbered} without a number` : ''}</span>}
          </span>
          {pdfProgress ? (
            <span className="fc-pp-progress" role="status" aria-live="polite">
              <span className="fc-pp-progress-text">{pdfStatus}</span>
              <span className={`fc-pp-progress-bar ${pdfShare === null ? 'is-waiting' : ''}`}>
                <span style={pdfShare === null ? undefined : { width: `${Math.max(2, pdfShare * 100)}%` }} />
              </span>
            </span>
          ) : (
            lastSent && <span className="fc-pp-saved fc-pp-sent" role="status"><CheckCircleIcon size={14} /> {lastSent}</span>
          )}
          {cardSize && !isA4 && (
            makingPdfs ? (
              <button type="button" className="fc-pp-btn fc-pp-pdfs" onClick={stopPdfs}>
                <CloseIcon size={16} /> Stop
              </button>
            ) : (
              <button type="button" className="fc-pp-btn fc-pp-pdfs" onClick={handleDownloadPdfs} disabled={loading || printing || rangeError || printable.length === 0}>
                <FileDownloadIcon size={16} /> Save as PDFs
              </button>
            )
          )}
          <button type="button" className="fc-pp-btn is-primary" onClick={handlePrint} disabled={loading || printing || makingPdfs || rangeError || printable.length === 0 || (page && !page.layout.printable)}>
            <PrintIcon size={16} /> {printing ? 'Preparing…' : 'Print'}
          </button>
        </div>
      </div>
    </div>
  );
}
