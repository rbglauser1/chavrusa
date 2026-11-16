'use client';
// The strip at the very top of the iPhone (the clock and battery) isn't part of the page in the home-screen app: the
// phone paints it with the page's background color. While the reading window shades the screen, or the daf is full
// screen, we tint that strip to match (Nov 16), and put it back after.
let meta: HTMLMetaElement | null = null;

export function tintStatus(color: string | null) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (!meta) {
    meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) { meta = document.createElement('meta'); meta.name = 'theme-color'; document.head.appendChild(meta); }
  }
  if (color) { root.style.backgroundColor = color; meta.content = color; }
  else { root.style.removeProperty('background-color'); meta.content = getComputedStyle(document.body).backgroundColor || '#ffffff'; }
}

/** The page's background with a shade of `rgb` at `alpha` laid over it, as one solid color. */
export function shaded(rgb: [number, number, number], alpha: number): string {
  // The look's own background (--bg); the body's color can be see-through when a gradient paints it.
  const hex = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  const h = /^#([0-9a-f]{6})$/i.exec(hex)?.[1];
  const m = h ? [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) : [249, 249, 247];
  const [r, g, b] = [0, 1, 2].map((i) => Math.round(m[i] * (1 - alpha) + rgb[i] * alpha));
  return `rgb(${r}, ${g}, ${b})`;
}
