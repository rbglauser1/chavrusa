// Nov 16: print a whole HTML page from inside the app. The iPhone (above all the home-screen app) won't print a frame
// or a new window, so the page is put into this page itself, inside its own shadow root so its styles stay apart,
// and this page is printed with everything else hidden (the @media print rules for #sheet-print in app/globals.css).
export function printHtml(html: string) {
  document.getElementById('sheet-print')?.remove();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const host = document.createElement('div'); host.id = 'sheet-print';
  const root = host.attachShadow({ mode: 'open' });
  const css = Array.from(doc.querySelectorAll('style')).map((x) => x.textContent ?? '').join('').replace(/\bbody\{/g, ':host{display:block;');
  root.innerHTML = `<style>${css}</style>${doc.body.innerHTML}`;
  document.body.appendChild(host);
  const done = () => { window.removeEventListener('afterprint', done); window.setTimeout(() => host.remove(), 500); };
  window.addEventListener('afterprint', done);
  try { window.print(); } catch { /* nothing */ }
}
export const clearPrint = () => document.getElementById('sheet-print')?.remove();
