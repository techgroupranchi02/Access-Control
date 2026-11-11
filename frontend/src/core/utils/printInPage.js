/**
 * printInPage — open the browser's print / save-as-PDF dialog for some HTML, directly from the
 * current page (no new tab or pop-up window first).
 *
 * The HTML is placed in a hidden #fc-print-root container; a print stylesheet hides the rest of
 * the app while printing. Works on desktop, Android Chrome and iOS Safari, and isn't blocked by
 * pop-up blockers. Pass CSS scoped under `#fc-print-root` (plus any `@page` rule).
 *
 * @param {string} bodyHtml   markup to print
 * @param {string} css        styles for that markup
 * @param {string} [title]    used by most browsers as the suggested PDF file name
 * @param {object} [opts]
 * @param {(root: HTMLElement) => Promise|void} [opts.prepare]  runs on the rendered markup before
 *        printing, with the root laid out off-screen (for example to load fonts and fit text)
 */
const ROOT_ID = 'fc-print-root';

export function printInPage(bodyHtml, css = '', title, opts = {}) {
  document.getElementById(ROOT_ID)?.remove();
  document.getElementById(`${ROOT_ID}-style`)?.remove();

  const style = document.createElement('style');
  style.id = `${ROOT_ID}-style`;
  style.textContent = `
    #${ROOT_ID} { display: none; }
    @media print {
      html, body { background: #ffffff !important; color: #0f172a !important; height: auto !important; overflow: visible !important; }
      body > *:not(#${ROOT_ID}) { display: none !important; }
      #${ROOT_ID} { display: block !important; }
    }
    ${css}
  `;

  const root = document.createElement('div');
  root.id = ROOT_ID;
  root.innerHTML = bodyHtml;

  document.head.appendChild(style);
  document.body.appendChild(root);

  const previousTitle = document.title;
  if (title) document.title = title;

  const cleanup = () => {
    window.removeEventListener('afterprint', cleanup);
    document.title = previousTitle;
    root.remove();
    style.remove();
  };
  window.addEventListener('afterprint', cleanup);

  // Optional preparation with the root laid out off-screen (it is display:none on screen)
  const prepared = typeof opts.prepare === 'function'
    ? (async () => {
      root.style.cssText = 'display:block;position:fixed;left:-100000px;top:0;';
      try { await opts.prepare(root); } catch { /* print anyway */ }
      root.style.cssText = '';
    })()
    : Promise.resolve();

  // Let the browser lay out the new content (and load any logo / artwork images, up to 4 s)
  // before opening the dialog, so images aren't missing from the print
  const pending = [...root.querySelectorAll('img')].filter((img) => !img.complete);
  const ready = pending.length === 0
    ? Promise.resolve()
    : Promise.race([
      Promise.all(pending.map((img) => new Promise((resolve) => {
        img.addEventListener('load', resolve, { once: true });
        img.addEventListener('error', resolve, { once: true });
      }))),
      new Promise((resolve) => setTimeout(resolve, 4000))
    ]);
  Promise.all([ready, prepared]).then(() => setTimeout(() => window.print(), 50));
}
