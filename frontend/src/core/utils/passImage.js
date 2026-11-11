/**
 * readPassImage: prepares an uploaded PNG/JPG for a pass template (docs/adr/0005-pass-templates.md).
 *
 * The image is scaled down to 300 dpi for the pass size (more detail can't print) and, if it is
 * still large, re-encoded as JPEG, so a save request stays well under the server's request limit.
 */
const MAX_DATA_URL_CHARS = 700 * 1024; // ~525 KB of image data
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const PRINT_DPI = 300;

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('This image could not be read. Try exporting it again as PNG or JPG.')); };
    img.src = url;
  });
}

function draw(img, w, h, whiteBackground) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (whiteBackground) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
  }
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);
  return canvas;
}

/**
 * @param {File} file
 * @param {number} longestSideMm  the longer side of the pass, in mm
 * @returns {Promise<{ dataUrl, widthPx, heightPx, originalWidthPx, originalHeightPx }>}
 */
export async function readPassImage(file, longestSideMm) {
  if (!file) throw new Error('Choose an image.');
  if (!/^image\/(png|jpeg)$/.test(file.type)) throw new Error('Choose a PNG or JPG image. For a PDF design, export it as PNG first.');
  if (file.size > MAX_FILE_BYTES) throw new Error('This image is larger than 15 MB. Export it smaller and try again.');

  const img = await loadImage(file);
  const ow = img.naturalWidth;
  const oh = img.naturalHeight;
  const maxLongPx = Math.round((longestSideMm / 25.4) * PRINT_DPI);
  let k = Math.min(1, maxLongPx / Math.max(ow, oh));

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const w = Math.max(1, Math.round(ow * k));
    const h = Math.max(1, Math.round(oh * k));
    if (file.type === 'image/png') {
      const png = draw(img, w, h, false).toDataURL('image/png');
      if (png.length <= MAX_DATA_URL_CHARS) return { dataUrl: png, widthPx: w, heightPx: h, originalWidthPx: ow, originalHeightPx: oh };
    }
    const canvas = draw(img, w, h, true);
    for (const q of [0.92, 0.85, 0.75, 0.65]) {
      const jpg = canvas.toDataURL('image/jpeg', q);
      if (jpg.length <= MAX_DATA_URL_CHARS) return { dataUrl: jpg, widthPx: w, heightPx: h, originalWidthPx: ow, originalHeightPx: oh };
    }
    k *= 0.8;
  }
  throw new Error('This image is too detailed to store. Export a smaller version and try again.');
}

/** Effective print resolution of an image stretched over `mm`. */
export function effectiveDpi(px, mm) {
  return mm > 0 ? Math.round(px / (mm / 25.4)) : 0;
}
