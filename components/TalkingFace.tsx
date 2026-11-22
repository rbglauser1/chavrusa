'use client';
// Nov 22: the chavrusa's face in a voice call. A small panel in the corner while the call is on; its mouth opens and
// closes with how loud the voice is at that moment (lib/voiceLevel), and it blinks and moves a little like a person
// does. Tap it to make it bigger (tap again: smaller); × hides it for this call.
// Two faces (Settings → Voice → His face in a call): a drawn chavrusa, or a photo of his own choosing (kept on this
// device only), on which he taps the mouth once: from there the photo's jaw opens and closes with the voice.
// No outside service, nothing paid per minute.
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { voiceLevel } from '@/lib/voiceLevel';

export const FACE_PHOTO_KEY = 'chavrusa-face-photo';
export const FACE_MOUTH_KEY = 'chavrusa-face-mouth';
export const FACE_EVENT = 'chavrusa-face';
// Nov 22: three ready-made faces (portraits he made; files in public/faces), each with its mouth already placed.
export const BUILT_IN_FACES = {
  partner: { name: 'Learning partner', photo: '/faces/partner.jpg', mouth: { x: 53.1, y: 59.5, w: 18, ar: 0.8 } },
  mentor: { name: 'Warm mentor', photo: '/faces/mentor.jpg', mouth: { x: 54.2, y: 56.5, w: 21, ar: 0.8 } },
  teacher: { name: 'Contemporary teacher', photo: '/faces/teacher.jpg', mouth: { x: 52.5, y: 59.2, w: 20, ar: 0.8 } },
  young: { name: 'Young chavrusa', photo: '/faces/young.jpg', mouth: { x: 53.6, y: 64.6, w: 21, ar: 0.8 } },
  companion: { name: 'Warm companion', photo: '/faces/companion.jpg', mouth: { x: 51.7, y: 58.7, w: 24, ar: 0.8 } },
  seasoned: { name: 'Seasoned mentor', photo: '/faces/seasoned.jpg', mouth: { x: 52.4, y: 59.8, w: 23, ar: 0.8 } },
  chassidish: { name: 'Chassidish chavrusa', photo: '/faces/chassidish.jpg', mouth: { x: 52.1, y: 70.5, w: 22, ar: 0.8 } },
} as const;
export type FaceKind = 'drawn' | 'photo' | keyof typeof BUILT_IN_FACES;
export type Mouth = { x: number; y: number; w: number; ar: number }; // x, y: the mouth's middle, % of the photo; w: mouth width, % of the photo's width; ar: photo width / height

export function readFace(): { photo: string | null; mouth: Mouth | null } {
  try {
    const photo = localStorage.getItem(FACE_PHOTO_KEY);
    const m = JSON.parse(localStorage.getItem(FACE_MOUTH_KEY) || 'null');
    return { photo, mouth: m && typeof m.x === 'number' ? m : null };
  } catch { return { photo: null, mouth: null }; }
}

export function useFacePhoto() {
  const [f, setF] = useState<{ photo: string | null; mouth: Mouth | null }>({ photo: null, mouth: null });
  useEffect(() => {
    const load = () => setF(readFace());
    load();
    window.addEventListener(FACE_EVENT, load);
    return () => window.removeEventListener(FACE_EVENT, load);
  }, []);
  return f;
}

// The motion: one loop sets a few CSS variables on the face (--open 0..1, --lid 0..1, --sway deg, --bob px), and the
// drawing follows them. No re-rendering sixty times a second.
function useMotion(root: React.RefObject<HTMLElement | null>, speaking: () => boolean, demo: boolean) {
  const speakRef = useRef(speaking);
  speakRef.current = speaking;
  useEffect(() => {
    let alive = true, raf = 0, lvl = -1, open = 0;
    let nextBlink = performance.now() + 1800 + Math.random() * 2500, blinkAt = -1;
    (async () => { while (alive) { lvl = demo ? -1 : await voiceLevel(); await new Promise((r) => setTimeout(r, 55)); } })();
    const talk = (t: number) => { // when the loudness isn't known: a natural-looking run of syllables, with short pauses
      const phrase = Math.sin(t / 1300) > -0.75 ? 1 : 0.1;
      return phrase * Math.max(0, 0.18 + 0.55 * Math.abs(Math.sin(t / 92)) * (0.55 + 0.45 * Math.sin(t / 287)));
    };
    const tick = (t: number) => {
      const el = root.current;
      const on = demo || speakRef.current();
      let target = 0;
      if (lvl >= 0) target = Math.min(1, Math.pow(Math.max(0, (lvl - 0.006) / 0.17), 0.7));
      else if (on) target = talk(t);
      open += (target - open) * (target > open ? 0.6 : 0.32);
      if (t > nextBlink) { blinkAt = t; nextBlink = t + 2200 + Math.random() * 3800; }
      const b = blinkAt < 0 ? 1 : Math.min(1, Math.abs((t - blinkAt) / 75 - 1)); // closes and opens in about 150 ms
      if (b >= 1 && t - blinkAt > 150) blinkAt = -1;
      const sway = Math.sin(t / 1900) * 1.1 + (on ? Math.sin(t / 610) * 0.7 : 0);
      const bob = Math.sin(t / 2300) * 0.8 + open * 1.2;
      if (el) {
        el.style.setProperty('--open', open.toFixed(3));
        el.style.setProperty('--lid', b.toFixed(3));
        el.style.setProperty('--sway', `${sway.toFixed(2)}deg`);
        el.style.setProperty('--bob', `${bob.toFixed(2)}px`);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { alive = false; cancelAnimationFrame(raf); };
  }, [root, demo]);
}

// A drawn chavrusa: an older talmid chacham with a kippah, glasses and a greying beard. The chin of the beard drops as
// the mouth opens.
function DrawnFace() {
  return (
    <svg className="tface-svg" viewBox="0 0 200 240" aria-hidden="true">
      <defs>
        <radialGradient id="tf-skin" cx="45%" cy="40%" r="65%"><stop offset="0" stopColor="#f0cfae" /><stop offset="1" stopColor="#d6a581" /></radialGradient>
        <linearGradient id="tf-beard" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#6e6158" /><stop offset="1" stopColor="#9d948c" /></linearGradient>
        <linearGradient id="tf-coat" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1f2430" /><stop offset="1" stopColor="#11141b" /></linearGradient>
      </defs>
      <path d="M18 240 C24 196 58 182 100 180 C142 182 176 196 182 240Z" fill="url(#tf-coat)" />
      <path d="M84 182 L100 214 L116 182 Q100 190 84 182Z" fill="#f4f1ea" />
      <rect x="86" y="160" width="28" height="28" rx="10" fill="#cf9d79" />
      <g className="tf-head">
        <ellipse cx="48" cy="110" rx="9" ry="15" fill="#d9a884" />
        <ellipse cx="152" cy="110" rx="9" ry="15" fill="#d9a884" />
        <ellipse cx="100" cy="104" rx="52" ry="64" fill="url(#tf-skin)" />
        <path d="M50 92 Q52 58 78 48 Q66 70 60 96Z" fill="#7a6d63" opacity=".85" />
        <path d="M150 92 Q148 58 122 48 Q134 70 140 96Z" fill="#7a6d63" opacity=".85" />
        <path d="M62 56 Q100 22 138 56 Q100 44 62 56Z" fill="#15161a" />
        <path d="M70 83 Q80 77 91 82" stroke="#5b4f47" strokeWidth="3.4" fill="none" strokeLinecap="round" />
        <path d="M109 82 Q120 77 130 83" stroke="#5b4f47" strokeWidth="3.4" fill="none" strokeLinecap="round" />
        <g>
          <ellipse cx="80" cy="97" rx="8.5" ry="6" fill="#fbf8f3" />
          <ellipse cx="120" cy="97" rx="8.5" ry="6" fill="#fbf8f3" />
          <circle cx="81" cy="97.5" r="4.2" fill="#4a3627" /><circle cx="121" cy="97.5" r="4.2" fill="#4a3627" />
          <circle cx="82.3" cy="96.2" r="1.3" fill="#fff" /><circle cx="122.3" cy="96.2" r="1.3" fill="#fff" />
          <rect className="tf-lid" x="70" y="90" width="21" height="14" fill="#e3b792" />
          <rect className="tf-lid" x="110" y="90" width="21" height="14" fill="#e3b792" />
        </g>
        <g fill="none" stroke="#2c2c30" strokeWidth="2.2">
          <rect x="66" y="86" width="28" height="21" rx="9" /><rect x="106" y="86" width="28" height="21" rx="9" />
          <path d="M94 95 Q100 91 106 95" /><path d="M66 94 L52 91" /><path d="M134 94 L148 91" />
        </g>
        <path d="M100 100 Q96 118 92 124 Q100 128 108 124" stroke="#b9805e" strokeWidth="2.4" fill="none" strokeLinecap="round" />
        {/* the beard on the cheeks stays; its chin moves down with the jaw */}
        <path d="M52 112 Q54 140 70 152 Q84 160 100 160 Q116 160 130 152 Q146 140 148 112 Q150 150 138 166 Q120 176 100 176 Q80 176 62 166 Q50 150 52 112Z" fill="url(#tf-beard)" />
        <g className="tf-mouth"><ellipse cx="100" cy="141" rx="13" ry="8" fill="#3a1714" /><rect x="90" y="133.5" width="20" height="3.2" rx="1.5" fill="#efe9df" /></g>
        <g className="tf-jaw">
          <path d="M70 150 Q84 158 100 158 Q116 158 130 150 Q134 178 118 194 Q100 204 82 194 Q66 178 70 150Z" fill="url(#tf-beard)" />
          <path d="M86 150 Q100 155 114 150" stroke="#b77a68" strokeWidth="3" fill="none" strokeLinecap="round" />
        </g>
        <path d="M80 134 Q90 128 100 132 Q110 128 120 134 Q112 139 100 136 Q88 139 80 134Z" fill="#6a5d54" />
      </g>
    </svg>
  );
}

// His photo, with the jaw (the lower lip and chin, below the mouth's middle) cut from the photo and lowered as the
// voice speaks, and the inside of the mouth shown behind it.
function PhotoFace({ photo, mouth }: { photo: string; mouth: Mouth }) {
  const jw = mouth.w * 1.8;               // the jaw piece: a bit wider than the mouth
  const jl = mouth.x - jw / 2;
  const jh = mouth.w * 1.35 * mouth.ar;   // its height, as % of the photo's height
  return (
    <div className="tface-photo" style={{ aspectRatio: String(mouth.ar) }}>
      <img src={photo} alt="" draggable={false} />
      <span className="tface-hole" style={{ left: `${mouth.x - mouth.w * 0.31}%`, top: `${mouth.y}%`, width: `${mouth.w * 0.62}%` }} />
      <div className="tface-jaw" style={{ left: `${jl}%`, top: `${mouth.y}%`, width: `${jw}%`, height: `${jh}%` }}>
        <img src={photo} alt="" draggable={false} style={{ width: `${10000 / jw}%`, left: `${(-jl / jw) * 100}%`, top: `${(-mouth.y / jh) * 100}%` }} />
      </div>
    </div>
  );
}

/** The face itself (also the preview in Settings). */
export function FaceView({ speaking, demo = false, kind, photo, mouth, className = '', style }: {
  speaking: () => boolean; demo?: boolean; kind: FaceKind; photo?: string | null; mouth?: Mouth | null; className?: string; style?: CSSProperties;
}) {
  const root = useRef<HTMLDivElement | null>(null);
  useMotion(root, speaking, demo);
  if (kind !== 'drawn' && kind !== 'photo') { const b = BUILT_IN_FACES[kind]; photo = b.photo; mouth = { ...b.mouth }; kind = 'photo'; }
  return (
    <div ref={root} className={`tface-view ${className}`} style={style}>
      <div className="tface-move">{kind === 'photo' && photo && mouth ? <PhotoFace photo={photo} mouth={mouth} /> : <DrawnFace />}</div>
    </div>
  );
}

const SAYS: Record<string, string> = { connecting: 'Joining…', listening: 'Listening', thinking: 'Thinking…', speaking: 'Speaking', paused: 'Paused' };

export default function TalkingFace({ state, kind, onHide }: { state: string; kind: FaceKind; onHide: () => void }) {
  const [big, setBig] = useState(() => { try { return localStorage.getItem('chavrusa-face-big') === '1'; } catch { return false; } });
  const face = useFacePhoto();
  const stateRef = useRef(state);
  stateRef.current = state;
  const use: FaceKind = kind === 'photo' ? (face.photo && face.mouth ? 'photo' : 'drawn') : kind;
  // Nov 22 (2): he moves the face anywhere by dragging it; it stays there (kept on this device). A tap still makes it
  // bigger or smaller.
  const box = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(() => { try { return JSON.parse(localStorage.getItem('chavrusa-face-pos') || 'null'); } catch { return null; } });
  const drag = useRef<{ id: number; px: number; py: number; x: number; y: number; moved: boolean } | null>(null);
  const fit = (p: { x: number; y: number }) => {
    const el = box.current, w = el?.offsetWidth ?? 96, h = el?.offsetHeight ?? 120;
    return { x: Math.min(Math.max(p.x, 4), window.innerWidth - w - 4), y: Math.min(Math.max(p.y, 4), window.innerHeight - h - 4) };
  };
  useEffect(() => { // bigger, or the phone turned: keep it on the screen
    if (!pos) return;
    const t = window.setTimeout(() => setPos((p) => (p ? fit(p) : p)), 280);
    const re = () => setPos((p) => (p ? fit(p) : p));
    window.addEventListener('resize', re);
    return () => { window.clearTimeout(t); window.removeEventListener('resize', re); };
  }, [big]); // eslint-disable-line react-hooks/exhaustive-deps
  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    const r = box.current?.getBoundingClientRect(); if (!r) return;
    drag.current = { id: e.pointerId, px: e.clientX, py: e.clientY, x: r.left, y: r.top, moved: false };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current; if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.px, dy = e.clientY - d.py;
    if (!d.moved) { if (Math.hypot(dx, dy) < 6) return; d.moved = true; try { box.current?.setPointerCapture(e.pointerId); } catch { /* fine */ } }
    setPos(fit({ x: d.x + dx, y: d.y + dy }));
  };
  const onUp = () => {
    const d = drag.current; drag.current = null;
    if (!d?.moved) return;
    setPos((p) => { try { if (p) localStorage.setItem('chavrusa-face-pos', JSON.stringify(p)); } catch { /* fine */ } return p; });
    // the tap that follows a lifted finger is not a tap on the face (nor on what's under it)
    const eat = (ev: Event) => { ev.preventDefault(); ev.stopPropagation(); };
    window.addEventListener('click', eat, true);
    window.setTimeout(() => window.removeEventListener('click', eat, true), 400);
  };
  const toggle = () => setBig((v) => { try { localStorage.setItem('chavrusa-face-big', v ? '0' : '1'); } catch { /* fine */ } return !v; });
  return createPortal(
    <div ref={box} className={`tface ${big ? 'big' : ''} ${drag.current?.moved ? 'moving' : ''} s-${state}`} role="img" aria-label={`Your chavrusa · ${SAYS[state] ?? ''}`}
      style={pos ? { left: pos.x, top: pos.y, right: 'auto' } : undefined}
      onClick={toggle} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
      <FaceView speaking={() => stateRef.current === 'speaking'} kind={use} photo={face.photo} mouth={face.mouth} />
      <span className="tface-say">{SAYS[state] ?? ''}</span>
      <button className="tface-x" onClick={(e) => { e.stopPropagation(); onHide(); }} aria-label="Hide the face for this call">×</button>
    </div>,
    document.body,
  );
}

function shrinkFace(file: File): Promise<{ url: string; ar: number }> {
  return new Promise((resolve, reject) => {
    const src = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 900 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      const g = c.getContext('2d');
      if (!g) { URL.revokeObjectURL(src); reject(new Error('no canvas')); return; }
      g.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(src);
      resolve({ url: c.toDataURL('image/jpeg', 0.85), ar: c.width / c.height });
    };
    img.onerror = () => { URL.revokeObjectURL(src); reject(new Error('not a picture')); };
    img.src = src;
  });
}

/** Settings → Voice → His face in a call → My photo: choose a portrait, tap his mouth, try it. Kept on this device. */
export function FacePhotoPicker() {
  const input = useRef<HTMLInputElement>(null);
  const face = useFacePhoto();
  const [msg, setMsg] = useState('');
  const [trying, setTrying] = useState(false);
  const save = (photo: string | null, mouth: Mouth | null) => {
    try {
      if (photo) localStorage.setItem(FACE_PHOTO_KEY, photo); else localStorage.removeItem(FACE_PHOTO_KEY);
      if (mouth) localStorage.setItem(FACE_MOUTH_KEY, JSON.stringify(mouth)); else localStorage.removeItem(FACE_MOUTH_KEY);
    } catch { setMsg('That photo is too big to keep. Try another one.'); return; }
    window.dispatchEvent(new Event(FACE_EVENT));
  };
  const pick = async (file?: File) => {
    if (!file) return;
    setMsg('Preparing…');
    try {
      const { url, ar } = await shrinkFace(file);
      save(url, { x: 50, y: 66, w: 20, ar }); // a first guess; he taps the mouth to place it
      setMsg('Now tap on his mouth (the middle, where the lips meet).');
    } catch { setMsg('That file couldn’t be opened as a picture.'); }
  };
  const place = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!face.photo || !face.mouth || trying) return;
    const r = e.currentTarget.getBoundingClientRect();
    save(face.photo, { ...face.mouth, x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
    setMsg('Placed. Try it, or tap again to move it.');
  };
  return (
    <div className="face-pick">
      {face.photo && face.mouth && (
        <>
          <div className="face-pick-stage" onClick={place}>
            {trying
              ? <FaceView speaking={() => true} demo kind="photo" photo={face.photo} mouth={face.mouth} />
              : (
                <div className="tface-photo" style={{ aspectRatio: String(face.mouth.ar) }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={face.photo} alt="" draggable={false} />
                  <span className="face-pick-mark" style={{ left: `${face.mouth.x}%`, top: `${face.mouth.y}%`, width: `${face.mouth.w}%` }} />
                </div>
              )}
          </div>
          <label className="face-pick-w">Mouth width
            <input type="range" min={8} max={40} step={1} value={Math.round(face.mouth.w)} onChange={(e) => save(face.photo, { ...face.mouth!, w: Number(e.target.value) })} />
          </label>
        </>
      )}
      <div className="home-photo-btns">
        <button type="button" onClick={() => input.current?.click()}>{face.photo ? 'Change photo' : 'Choose a photo'}</button>
        {face.photo && <button type="button" onClick={() => setTrying((v) => !v)}>{trying ? 'Stop' : '▶ Try it'}</button>}
        {face.photo && <button type="button" onClick={() => { save(null, null); setTrying(false); setMsg(''); }}>Remove</button>}
      </div>
      {msg && <div className="muted" style={{ fontSize: 12 }}>{msg}</div>}
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ''; }} />
    </div>
  );
}

/** A ready-made face (or the drawn one), talking, as a preview in Settings. */
export function DrawnFacePreview({ kind = 'drawn' }: { kind?: Exclude<FaceKind, 'photo'> }) {
  const [on, setOn] = useState(false);
  return (
    <div className="face-pick">
      <div className={`face-pick-stage ${kind === 'drawn' ? 'small' : 'mid'}`}><div key={kind}><FaceView speaking={() => on} demo={on} kind={kind} /></div></div>
      <div className="home-photo-btns"><button type="button" onClick={() => setOn((v) => !v)}>{on ? 'Stop' : '▶ Try it'}</button></div>
    </div>
  );
}
