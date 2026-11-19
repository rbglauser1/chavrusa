'use client';
// Nov 18: the learner's own photo behind Home. Kept only on this device (not in the synced settings): shrunk to at
// most 1400px and saved as a JPEG in localStorage, then shown through the --home-photo variable on <html>.
import { useEffect, useRef, useState } from 'react';

const KEY = 'chavrusa-home-photo';
const EVENT = 'chavrusa-home-photo';

function read(): string | null {
  try { return localStorage.getItem(KEY); } catch { return null; }
}

/** Puts the saved photo on <html> as --home-photo, and keeps it current when it changes. */
export function useHomePhoto() {
  useEffect(() => {
    const apply = () => {
      const url = read();
      const root = document.documentElement;
      if (url) root.style.setProperty('--home-photo', `url("${url}")`);
      else root.style.removeProperty('--home-photo');
    };
    apply();
    window.addEventListener(EVENT, apply);
    return () => window.removeEventListener(EVENT, apply);
  }, []);
}

function shrink(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const src = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const max = 1400;
      const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * k);
      c.height = Math.round(img.naturalHeight * k);
      const g = c.getContext('2d');
      if (!g) { URL.revokeObjectURL(src); reject(new Error('no canvas')); return; }
      g.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(src);
      resolve(c.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => { URL.revokeObjectURL(src); reject(new Error('not a picture')); };
    img.src = src;
  });
}

export function HomePhotoPicker() {
  const input = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  useEffect(() => { setPhoto(read()); }, []);

  const pick = async (file?: File) => {
    if (!file) return;
    setMsg('Preparing…');
    try {
      const url = await shrink(file);
      try { localStorage.setItem(KEY, url); } catch { setMsg('That photo is too big to keep. Try another one.'); return; }
      setPhoto(url);
      setMsg('');
      window.dispatchEvent(new Event(EVENT));
    } catch {
      setMsg('That file couldn’t be opened as a picture.');
    }
  };
  const remove = () => {
    try { localStorage.removeItem(KEY); } catch { /* nothing kept */ }
    setPhoto(null);
    window.dispatchEvent(new Event(EVENT));
  };

  return (
    <div className="home-photo-pick">
      {photo && <div className="home-photo-thumb" style={{ backgroundImage: `url("${photo}")` }} aria-label="Your photo" role="img" />}
      <div className="home-photo-btns">
        <button type="button" onClick={() => input.current?.click()}>{photo ? 'Change photo' : 'Choose a photo'}</button>
        {photo && <button type="button" onClick={remove}>Remove</button>}
      </div>
      {msg && <div className="muted" style={{ fontSize: 12 }}>{msg}</div>}
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ''; }} />
    </div>
  );
}
