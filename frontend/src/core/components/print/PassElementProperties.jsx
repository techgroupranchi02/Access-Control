/**
 * PassElementProperties: the settings panel for the selected pass element (ADR 0005, Amendment 1).
 *
 * Common: name, position (mm) and rotation. Then by type:
 *   text       content with merge fields, font (7), size, weight, style, colours, alignment, box fill
 *   image      source (upload / festival logo / badge QR), fit, opacity, corners, badge no. under QR
 *   checklist  items from a registration field or a typed list, columns, box style, font, colour
 */
import React, { useEffect, useRef, useState } from 'react';
import { FONTS, MERGE_FIELDS, ROTATIONS } from '../../utils/passRenderer';
import { ContentCopyIcon, DeleteIcon, UploadFileIcon } from '../common/Icons';

const round2 = (n) => Math.round(Number(n) * 100) / 100;

/** Number box that applies its value on blur / Enter, so typing "85" isn't clamped at "8". */
export function NumInput({ value, onCommit, min, max, step = 1, ...rest }) {
  const [text, setText] = useState(String(value));
  useEffect(() => { setText(String(value)); }, [value]);
  const commit = () => {
    const n = Number(text);
    if (text.trim() === '' || !Number.isFinite(n)) { setText(String(value)); return; }
    const v = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));
    setText(String(v));
    if (v !== value) onCommit(v);
  };
  return (
    <input
      type="number"
      inputMode="decimal"
      min={min}
      max={max}
      step={step}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }}
      {...rest}
    />
  );
}

/** Colour choice: a fixed colour, the template accent or the delegate's category colour (and optionally none). */
function ColorField({ label, value, onChange, allowNone = false }) {
  const kind = value === 'accent' || value === 'category' || value === 'none' ? value : 'custom';
  return (
    <div className="fc-pte-field fc-pte-color-field">
      <span className="fc-pt-label">{label}</span>
      <div className="fc-pte-color-row">
        <select
          value={kind}
          aria-label={`${label} type`}
          onChange={(e) => onChange(e.target.value === 'custom' ? '#0f172a' : e.target.value)}
        >
          {allowNone && <option value="none">None</option>}
          <option value="custom">Colour</option>
          <option value="accent">Accent colour</option>
          <option value="category">Category colour</option>
        </select>
        {kind === 'custom' && (
          <input type="color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#0f172a'} onChange={(e) => onChange(e.target.value)} aria-label={label} />
        )}
      </div>
    </div>
  );
}

function Segmented({ label, value, options, onChange }) {
  return (
    <div className="fc-pte-field">
      <span className="fc-pt-label">{label}</span>
      <div className="fc-pp-segment fc-pte-seg-sm" role="radiogroup" aria-label={label}>
        {options.map(([key, text]) => (
          <button key={key} type="button" role="radio" aria-checked={value === key} className={`fc-pp-seg-btn ${value === key ? 'is-active' : ''}`} onClick={() => onChange(key)}>
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

function FontSelect({ value, onChange }) {
  return (
    <label className="fc-pte-field">
      <span className="fc-pt-label">Font</span>
      <select value={value || 'inter'} onChange={(e) => onChange(e.target.value)} style={{ fontFamily: (FONTS.find((f) => f.key === value) || FONTS[0]).family }}>
        {FONTS.map((f) => <option key={f.key} value={f.key} style={{ fontFamily: f.family }}>{f.label}</option>)}
      </select>
    </label>
  );
}

function TextProps({ m, set, customFields }) {
  const areaRef = useRef(null);
  const insert = (key) => {
    if (!key) return;
    const token = `{{${key}}}`;
    const el = areaRef.current;
    const content = m.content || '';
    const at = el && typeof el.selectionStart === 'number' ? el.selectionStart : content.length;
    const end = el && typeof el.selectionEnd === 'number' ? el.selectionEnd : at;
    set({ content: content.slice(0, at) + token + content.slice(end) });
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(at + token.length, at + token.length);
    });
  };
  return (
    <>
      <div className="fc-pte-field">
        <span className="fc-pt-label">Text</span>
        <textarea ref={areaRef} rows={3} maxLength={500} value={m.content || ''} onChange={(e) => set({ content: e.target.value })} placeholder="Type text, and insert fields like {{name}}" />
        <select className="fc-pte-insert" value="" onChange={(e) => insert(e.target.value)} aria-label="Insert a field">
          <option value="">Insert a field…</option>
          {MERGE_FIELDS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
          {customFields.length > 0 && (
            <optgroup label="Registration form">
              {customFields.map((f) => <option key={f.key} value={`custom.${f.key}`}>{f.label}</option>)}
            </optgroup>
          )}
        </select>
      </div>
      <div className="fc-pte-row">
        <FontSelect value={m.font} onChange={(font) => set({ font })} />
        <label className="fc-pte-field is-num">
          <span className="fc-pt-label">Size (pt)</span>
          <NumInput min={4} max={96} step={0.5} value={m.sizePt} onCommit={(sizePt) => set({ sizePt })} />
        </label>
        <label className="fc-pte-field">
          <span className="fc-pt-label">Weight</span>
          <select value={m.weight} onChange={(e) => set({ weight: Number(e.target.value) })}>
            <option value={400}>Regular</option><option value={600}>Semi-bold</option><option value={800}>Bold</option>
          </select>
        </label>
      </div>
      <div className="fc-pte-row">
        <ColorField label="Text colour" value={m.color} onChange={(color) => set({ color })} />
        <ColorField label="Box fill" value={m.background || 'none'} onChange={(background) => set({ background })} allowNone />
      </div>
      <div className="fc-pte-row">
        <Segmented label="Align" value={m.align} options={[['left', 'Left'], ['center', 'Centre'], ['right', 'Right']]} onChange={(align) => set({ align })} />
        <Segmented label="Vertical" value={m.vAlign} options={[['top', 'Top'], ['middle', 'Middle'], ['bottom', 'Bottom']]} onChange={(vAlign) => set({ vAlign })} />
      </div>
      <div className="fc-pte-row">
        <label className="fc-pte-field is-num">
          <span className="fc-pt-label">Line height</span>
          <NumInput min={0.8} max={2.5} step={0.05} value={m.lineHeight || 1.15} onCommit={(lineHeight) => set({ lineHeight })} />
        </label>
        <label className="fc-pte-field is-num">
          <span className="fc-pt-label">Letter spacing</span>
          <NumInput min={-0.1} max={0.5} step={0.01} value={m.letterSpacing || 0} onCommit={(letterSpacing) => set({ letterSpacing })} />
        </label>
        <label className="fc-pte-field is-num">
          <span className="fc-pt-label">Corners (mm)</span>
          <NumInput min={0} max={50} step={0.5} value={m.radius || 0} onCommit={(radius) => set({ radius })} />
        </label>
        <label className="fc-pte-field is-num">
          <span className="fc-pt-label">Padding (mm)</span>
          <NumInput min={0} max={20} step={0.5} value={m.padding || 0} onCommit={(padding) => set({ padding })} />
        </label>
      </div>
      <div className="fc-pte-checks">
        <label className="fc-pte-check"><input type="checkbox" checked={Boolean(m.italic)} onChange={(e) => set({ italic: e.target.checked })} /> Italic</label>
        <label className="fc-pte-check"><input type="checkbox" checked={Boolean(m.uppercase)} onChange={(e) => set({ uppercase: e.target.checked })} /> Capitals</label>
        <label className="fc-pte-check"><input type="checkbox" checked={m.autoShrink !== false} onChange={(e) => set({ autoShrink: e.target.checked })} /> Shrink to fit</label>
        <label className="fc-pte-check"><input type="checkbox" checked={m.hideWhenEmpty !== false} onChange={(e) => set({ hideWhenEmpty: e.target.checked })} /> Hide when its fields are empty</label>
      </div>
    </>
  );
}

const SOURCE_LABEL = { upload: 'Uploaded image', festival_logo: 'Festival logo', badge_qr: 'Badge QR' };

function ImageProps({ m, set, onReplaceImage, hasLogo }) {
  return (
    <>
      <p className="fc-pte-source">
        Source: <strong>{SOURCE_LABEL[m.source] || m.source}</strong>
        {m.source === 'festival_logo' && !hasLogo && <span className="fc-pt-warn"> This festival has no logo yet.</span>}
      </p>
      {m.source === 'upload' && (
        <button type="button" className="fc-pt-btn is-small" onClick={onReplaceImage}><UploadFileIcon size={14} /> Replace image</button>
      )}
      {m.source === 'badge_qr' ? (
        <>
          <label className="fc-pte-check"><input type="checkbox" checked={Boolean(m.showBadgeNo)} onChange={(e) => set({ showBadgeNo: e.target.checked })} /> Badge no. under the QR</label>
          <p className="fc-pt-hint">Each delegate's own QR. Delegates without a badge yet get an empty box here for a QR sticker.</p>
        </>
      ) : (
        <div className="fc-pte-row">
          <label className="fc-pte-field">
            <span className="fc-pt-label">Fit</span>
            <select value={m.fit || 'contain'} onChange={(e) => set({ fit: e.target.value })}>
              <option value="contain">Show whole image</option>
              <option value="cover">Fill the box (crop)</option>
            </select>
          </label>
          <label className="fc-pte-field fc-pte-range">
            <span className="fc-pt-label">Opacity {Math.round((m.opacity ?? 1) * 100)}%</span>
            <input type="range" min={5} max={100} value={Math.round((m.opacity ?? 1) * 100)} onChange={(e) => set({ opacity: Number(e.target.value) / 100 })} />
          </label>
          <label className="fc-pte-field is-num">
            <span className="fc-pt-label">Corners (mm)</span>
            <NumInput min={0} max={50} step={0.5} value={m.radius || 0} onCommit={(radius) => set({ radius })} />
          </label>
        </div>
      )}
    </>
  );
}

function ChecklistProps({ m, set, choiceFields }) {
  const field = choiceFields.find((f) => f.key === m.field);
  return (
    <>
      <Segmented
        label="Items"
        value={m.source}
        options={[['field', 'From a form field'], ['static', 'My own list']]}
        onChange={(source) => set(source === 'field'
          ? { source, field: m.field || choiceFields[0]?.key || '' }
          : { source, items: m.items?.length ? m.items : (field?.options || ['Item 1', 'Item 2']) })}
      />
      {m.source === 'field' ? (
        <label className="fc-pte-field">
          <span className="fc-pt-label">Registration field</span>
          <select value={m.field || ''} onChange={(e) => set({ field: e.target.value })}>
            {!field && <option value="">Choose a field…</option>}
            {choiceFields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
          <span className="fc-pt-hint">{field ? `Options: ${field.options.join(', ')}. Each delegate's answers are ticked.` : 'This festival\'s form has no multi-choice fields.'}</span>
        </label>
      ) : (
        <label className="fc-pte-field">
          <span className="fc-pt-label">Items (one per line)</span>
          <textarea rows={4} value={(m.items || []).join('\n')} onChange={(e) => set({ items: e.target.value.split('\n').slice(0, 20) })} />
          <span className="fc-pt-hint">Printed as empty boxes, for staff to tick by hand.</span>
        </label>
      )}
      <div className="fc-pte-row">
        <FontSelect value={m.font} onChange={(font) => set({ font })} />
        <label className="fc-pte-field is-num">
          <span className="fc-pt-label">Size (pt)</span>
          <NumInput min={4} max={48} step={0.5} value={m.sizePt} onCommit={(sizePt) => set({ sizePt })} />
        </label>
        <label className="fc-pte-field is-num">
          <span className="fc-pt-label">Columns</span>
          <NumInput min={1} max={4} step={1} value={m.columns || 1} onCommit={(columns) => set({ columns })} />
        </label>
      </div>
      <div className="fc-pte-row">
        <ColorField label="Colour" value={m.color} onChange={(color) => set({ color })} />
        <Segmented label="Box" value={m.box || 'square'} options={[['square', 'Square'], ['circle', 'Circle']]} onChange={(box) => set({ box })} />
      </div>
      <label className="fc-pte-check"><input type="checkbox" checked={m.showUnticked !== false} onChange={(e) => set({ showUnticked: e.target.checked })} /> Show items that aren't ticked</label>
    </>
  );
}

export default function PassElementProperties({ element, W, H, onChange, onDuplicate, onDelete, onReplaceImage, customFields, choiceFields, hasLogo }) {
  const p = element.position;
  const m = element.metadata;
  const setPos = (patch) => {
    const next = { ...p, ...patch };
    next.w = round2(Math.min(Math.max(1, next.w), W));
    next.h = round2(Math.min(Math.max(1, next.h), H));
    next.x = round2(Math.min(Math.max(0, next.x), W - next.w));
    next.y = round2(Math.min(Math.max(0, next.y), H - next.h));
    onChange({ position: next });
  };
  const setMeta = (patch) => onChange({ metadata: { ...m, ...patch } });

  return (
    <div className="fc-pte-props">
      <div className="fc-pte-props-head">
        <label className="fc-pte-field fc-pte-props-name">
          <span className="fc-pt-label">Element name</span>
          <input type="text" maxLength={80} value={element.name} onChange={(e) => onChange({ name: e.target.value })} />
        </label>
        <div className="fc-pte-props-actions">
          <button type="button" className="fc-pt-btn is-small" onClick={onDuplicate}><ContentCopyIcon size={14} /> Duplicate</button>
          <button type="button" className="fc-pt-btn is-small is-quiet" onClick={onDelete}><DeleteIcon size={14} /> Delete</button>
        </div>
      </div>

      <div className="fc-pte-row">
        {[['x', 'Left'], ['y', 'Top'], ['w', 'Width'], ['h', 'Height']].map(([k, label]) => (
          <label key={k} className="fc-pte-field is-num">
            <span className="fc-pt-label">{label} (mm)</span>
            <NumInput step={0.5} min={0} max={300} value={p[k]} onCommit={(v) => setPos({ [k]: v })} />
          </label>
        ))}
        <label className="fc-pte-field is-num">
          <span className="fc-pt-label">Rotation</span>
          <select value={p.rotation || 0} onChange={(e) => setPos({ rotation: Number(e.target.value) })}>
            {ROTATIONS.map((r) => <option key={r} value={r}>{r}°</option>)}
          </select>
        </label>
      </div>

      <div className="fc-pte-centre">
        <span className="fc-pt-label">Centre on the pass</span>
        <button type="button" className="fc-pt-btn is-small" onClick={() => setPos({ x: (W - p.w) / 2 })}>Horizontally</button>
        <button type="button" className="fc-pt-btn is-small" onClick={() => setPos({ y: (H - p.h) / 2 })}>Vertically</button>
        <button type="button" className="fc-pt-btn is-small" onClick={() => setPos({ x: (W - p.w) / 2, y: (H - p.h) / 2 })}>Both</button>
      </div>

      {element.type === 'text' && <TextProps m={m} set={setMeta} customFields={customFields} />}
      {element.type === 'image' && <ImageProps m={m} set={setMeta} onReplaceImage={onReplaceImage} hasLogo={hasLogo} />}
      {element.type === 'checklist' && <ChecklistProps m={m} set={setMeta} choiceFields={choiceFields} />}
    </div>
  );
}
