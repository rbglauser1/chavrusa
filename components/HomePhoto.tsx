'use client';
// Nov 18: the learner's own photo behind Home. Kept only on this device (not in the synced settings): shrunk to at
// most 1400px and saved as a JPEG in localStorage.
// Nov 19: and placed where the learner wants it: drag it in the preview to move it, the slider (or two fingers) to
// zoom. The place is kept beside the photo; Home shows the photo in its own layer (HomePhotoLayer).
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent } from 'react';

const KEY = 'chavrusa-home-photo';
const POS_KEY = 'chavrusa-home-photo-pos';
const EVENT = 'chavrusa-home-photo';

type Pos = { x: number; y: number; z: number };
const START: Pos = { x: 50, y: 50, z: 1 };

function read(): string | null {
  try { return localStorage.getItem(KEY); } catch { return null; }
}
function readPos(): Pos {
  try {
    const p = JSON.parse(localStorage.getItem(POS_KEY) || 'null');
    if (p && typeof p.x === 'number' && typeof p.y === 'number' && typeof p.z === 'number') return p;
  } catch { /* fall back */ }
  return START;
}
function savePos(p: Pos) {
  try { localStorage.setItem(POS_KEY, JSON.stringify(p)); } catch { /* nothing kept */ }
  window.dispatchEvent(new Event(EVENT));
}
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** The photo and its place, kept current when they change. */
export function useHomePhoto() {
  const [state, setState] = useState<{ url: string | null; pos: Pos }>({ url: null, pos: START });
  useEffect(() => {
    const load = () => setState({ url: read(), pos: readPos() });
    load();
    window.addEventListener(EVENT, load);
    return () => window.removeEventListener(EVENT, load);
  }, []);
  return state;
}

function photoStyle(pos: Pos): CSSProperties {
  return {
    objectPosition: `${pos.x}% ${pos.y}%`,
    transform: `scale(${pos.z})`,
    transformOrigin: `${pos.x}% ${pos.y}%`,
  };
}

/** The photo behind Home, in its own layer under the words, with the softening veil over it. */
export function HomePhotoLayer() {
  const { url, pos } = useHomePhoto();
  if (!url) return null;
  return (
    <div className="hb-own" aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" style={photoStyle(pos)} />
    </div>
  );
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

/** A phone-shaped preview: drag to move the photo, slider or two fingers to zoom. */
function PlacePhoto({ url }: { url: string }) {
  const [pos, setPos] = useState<Pos>(START);
  const frame = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; z: number } | null>(null);
  const live = useRef<Pos>(START);
  useEffect(() => { const p = readPos(); setPos(p); live.current = p; }, [url]);

  const set = (p: Pos, keep = false) => { live.current = p; setPos(p); if (keep) savePos(p); };

  // How far the photo hangs past the frame, to turn a drag in pixels into a change of position.
  const overflow = () => {
    const f = frame.current, i = img.current;
    if (!f || !i || !i.naturalWidth) return { ox: 1, oy: 1 };
    const fw = f.clientWidth, fh = f.clientHeight;
    const s = Math.max(fw / i.naturalWidth, fh / i.naturalHeight);
    const z = live.current.z;
    return {
      ox: Math.max(1, i.naturalWidth * s * z - fw),
      oy: Math.max(1, i.naturalHeight * s * z - fh),
    };
  };

  const down = (e: RPointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), z: live.current.z };
    }
  };
  const move = (e: RPointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      set({ ...live.current, z: clamp(pinch.current.z * (d / pinch.current.d), 1, 4) });
      return;
    }
    const { ox, oy } = overflow();
    const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
    set({ ...live.current, x: clamp(live.current.x - (dx / ox) * 100, 0, 100), y: clamp(live.current.y - (dy / oy) * 100, 0, 100) });
  };
  const up = (e: RPointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) savePos(live.current);
  };

  // The preview frame has the shape of this phone's screen.
  const [ratio, setRatio] = useState(0.46);
  useEffect(() => { setRatio(clamp(window.innerWidth / window.innerHeight, 0.4, 1.4)); }, []);

  return (
    <div className="home-photo-place">
      <div
        ref={frame}
        className="home-photo-frame"
        style={{ aspectRatio: String(ratio) }}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img ref={img} src={url} alt="" draggable={false} style={photoStyle(pos)} />
        <span className="home-photo-hint">Drag to move</span>
      </div>
      <div className="home-photo-zoom">
        <label htmlFor="home-photo-zoom">Zoom</label>
        <input id="home-photo-zoom" type="range" min={1} max={4} step={0.05} value={pos.z}
          onChange={(e) => set({ ...live.current, z: Number(e.target.value) })}
          onPointerUp={() => savePos(live.current)} onKeyUp={() => savePos(live.current)} onTouchEnd={() => savePos(live.current)} />
        <button type="button" onClick={() => set(START, true)}>Reset</button>
      </div>
    </div>
  );
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
      try { localStorage.removeItem(POS_KEY); } catch { /* a new photo starts centred */ }
      setPhoto(url);
      setMsg('');
      window.dispatchEvent(new Event(EVENT));
    } catch {
      setMsg('That file couldn’t be opened as a picture.');
    }
  };
  const remove = () => {
    try { localStorage.removeItem(KEY); localStorage.removeItem(POS_KEY); } catch { /* nothing kept */ }
    setPhoto(null);
    window.dispatchEvent(new Event(EVENT));
  };

  return (
    <div className="home-photo-pick">
      {photo && <PlacePhoto url={photo} />}
      <div className="home-photo-btns">
        <button type="button" onClick={() => input.current?.click()}>{photo ? 'Change photo' : 'Choose a photo'}</button>
        {photo && <button type="button" onClick={remove}>Remove</button>}
      </div>
      {msg && <div className="muted" style={{ fontSize: 12 }}>{msg}</div>}
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ''; }} />
    </div>
  );
}
