/**
 * QrCode — renders a QR code locally as an inline SVG (no network request).
 *
 * Replaces api.qrserver.com, which was slow / intermittently stalled (one request per badge,
 * sometimes 100s+) and sent badge credentials to a third party (docs/adr/0001 follow-up).
 * Encoding is synchronous, so the code appears with the rest of the page and works offline.
 *
 * - <QrCode value="..." size={140} />            React component
 * - qrSvgMarkup(value, sizePx)                    SVG string for print windows built as HTML
 *
 * Always black on white with a quiet zone, so scanners read it in light and dark theme.
 */
import React, { useMemo } from 'react';
import QRCode from 'qrcode';

const QUIET_ZONE = 2; // modules of white border around the code

function buildPath(value) {
  const text = value === null || value === undefined ? '' : String(value);
  if (!text) return null;
  try {
    const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' });
    const n = modules.size;
    let d = '';
    for (let y = 0; y < n; y += 1) {
      for (let x = 0; x < n; x += 1) {
        // BitMatrix.get(row, col): row = y, col = x (swapping them would mirror the code)
        if (modules.get(y, x)) d += `M${x + QUIET_ZONE} ${y + QUIET_ZONE}h1v1h-1z`;
      }
    }
    return { d, viewBox: n + QUIET_ZONE * 2 };
  } catch {
    return null;
  }
}

/** SVG markup string (for HTML written into print windows). */
export function qrSvgMarkup(value, sizePx = 160) {
  const qr = buildPath(value);
  if (!qr) return '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${sizePx}" height="${sizePx}" viewBox="0 0 ${qr.viewBox} ${qr.viewBox}" shape-rendering="crispEdges" role="img" aria-label="QR code"><rect width="100%" height="100%" fill="#ffffff"/><path d="${qr.d}" fill="#000000"/></svg>`;
}

export default function QrCode({ value, size = 160, style, className, title = 'QR code' }) {
  const qr = useMemo(() => buildPath(value), [value]);
  if (!qr) {
    return <div className={className} style={{ width: size, height: size, background: '#ffffff', ...style }} aria-hidden="true" />;
  }
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox={`0 0 ${qr.viewBox} ${qr.viewBox}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label={title}
      style={{ display: 'block', ...style }}
    >
      <rect width="100%" height="100%" fill="#ffffff" />
      <path d={qr.d} fill="#000000" />
    </svg>
  );
}
