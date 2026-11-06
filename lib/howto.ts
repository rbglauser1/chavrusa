// The how-to "movie": a short animated walk through the app (Home → "How to use the app", and once on first open).
// Each scene is drawn with the app's own look (its colors and fonts follow the chosen theme), so it never goes out of
// date the way a recorded video would, and it costs nothing to play. The animations are plain CSS (`.ht-*` in
// app/globals.css): an element with `--d` set appears or acts that many seconds into its scene.
//
// To change a scene: edit its caption, words or timing here. `dur` is how long the scene plays before the next one.

export interface HowToScene { caption: string; sub: string; html: string; dur: number; say?: string } // say: the narration, if not caption + sub

/** What the narrator says in a scene. */
export const narrationOf = (s: HowToScene) => s.say ?? `${s.caption.replace(/[.…]$/, '')}. ${s.sub}`;
/** A fingerprint of all the narration: a change to any scene's words records the narration afresh. */
export function narrationVersion(): string {
  const all = 'meridian|' + HOWTO_SCENES.map(narrationOf).join('|');
  let h = 5381;
  for (let i = 0; i < all.length; i++) h = ((h * 33) ^ all.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

const d = (s: number) => `style="--d:${s}s"`;
const at = (s: number, top: number, left: number) => `style="--d:${s}s;top:${top}%;left:${left}%"`;
const mic = (size: number) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>`;
const finger = (s: number, top: number, left: number) => `<span class="ht-finger" ${at(s, top, left)}></span>`;

const homeScreen = `
  <div class="ht-brand">חברותא</div>
  <div class="ht-hello">Good evening</div>
  <div class="ht-card"><span class="ht-card-label">Begin learning</span><span class="ht-card-title">Open the Library</span><span class="ht-card-meta">Choose a masechta, a sefer, a perek</span></div>
  <div class="ht-row ht-row-lib">Library<small>Gemara, Chumash and every sefer</small></div>
  <div class="ht-row">Recent<small>Your sessions, newest first</small></div>
  <div class="ht-row">Settings<small>Look, learning style, voice, display</small></div>
  <div class="ht-mic">${mic(26)}</div>`;

export const HOWTO_SCENES: HowToScene[] = [
  {
    caption: 'Your chavrusa, any time',
    sub: 'It reads inside with you, explains, and keeps going, out loud.',
    dur: 5,
    html: `<div class="ht-title">
      <div class="ht-title-he ht-in" ${d(0.2)}>חברותא</div>
      <div class="ht-title-en ht-in" ${d(0.9)}>Learn out loud</div>
      <div class="ht-title-line ht-in" ${d(1.5)}></div>
    </div>`,
  },
  {
    caption: 'Choose what to learn',
    sub: 'Open the Library and pick a masechta, a sefer, a perek.',
    dur: 8,
    html: `<div class="ht-screen">${homeScreen}</div>
      ${finger(1.2, 47, 30)}
      <div class="ht-screen ht-slide" ${d(2)}>
        <div class="ht-head">Library</div>
        <div class="ht-chips"><span class="on">Gemara</span><span>Tanach</span><span>Mishnah</span><span>More</span></div>
        <div class="ht-list"><div>Berachos</div><div>Shabbos</div><div>Eruvin</div><div>Pesachim</div><div class="ht-pick" ${d(4.6)}>Yoma</div><div>Sukkah</div></div>
        <div class="ht-amudim ht-in" ${d(5.4)}><span>2a</span><span>2b</span><span>3a</span><span>3b</span><span>4a</span><span>4b</span><span class="ht-pick" ${d(6.6)}>5a</span><span>5b</span></div>
      </div>
      ${finger(4.2, 63, 22)}
      ${finger(6.2, 87, 72)}`,
  },
  {
    caption: 'Tap Talk',
    sub: 'Then just talk, the way you would across the table.',
    say: 'Tap Talk. Then just talk, the way you would across the table: “Let’s learn Yoma, five A.”',
    dur: 6,
    html: `<div class="ht-screen ht-center">
      <div class="ht-bigmic ht-live" ${d(1.4)}>${mic(40)}</div>
      <div class="ht-state ht-in" ${d(1.6)}>Listening…</div>
      <div class="ht-said ht-in" ${d(2.8)}>“Let’s learn Yoma, 5a.”</div>
    </div>
    ${finger(1, 50, 50)}`,
  },
  {
    caption: 'It reads inside',
    sub: 'Each phrase in lashon kodesh, then its English.',
    dur: 9,
    html: `<div class="ht-screen ht-sefer">
      <div class="ht-ref">Yoma 5a</div>
      <div class="ht-il"><span class="ht-he ht-hl" ${d(0.8)}>והלא אין כפרה אלא בדם,</span><span class="ht-en ht-in" ${d(1.8)}>Isn’t atonement only by the blood,</span></div>
      <div class="ht-il"><span class="ht-he ht-hl" ${d(3.2)}>שנאמר:</span><span class="ht-en ht-in" ${d(4)}>as it is stated:</span></div>
      <div class="ht-il"><span class="ht-he ht-hl" ${d(5.2)}>״כי הדם הוא בנפש יכפר״!</span><span class="ht-en ht-in" ${d(6.4)}>“For it is the blood that makes atonement by reason of the life.”</span></div>
      <div class="ht-wave ht-in" ${d(0.6)}><i></i><i></i><i></i><i></i><i></i></div>
    </div>`,
  },
  {
    caption: 'Then the big picture',
    sub: 'What the piece means, and where it fits in the sugya. Then it goes on by itself.',
    dur: 10,
    html: `<div class="ht-screen ht-sefer">
      <div class="ht-ref">Yoma 5a</div>
      <div class="ht-il ht-dim"><span class="ht-he">והלא אין כפרה אלא בדם, שנאמר: ״כי הדם הוא בנפש יכפר״!</span></div>
      <div class="ht-bubble">
        <p class="ht-in" ${d(0.8)}>So the braisa is pushing back: waving can’t be what brings atonement, because the Torah says atonement comes only through the blood.</p>
        <p class="ht-in" ${d(3.4)}>Just like smicha, waving is part of doing the mitzvah fully, but the korban atones without it.</p>
        <p class="ht-in ht-next" ${d(6.2)}>Next, Rav Pappa gives a different difference between them.</p>
      </div>
      <div class="ht-goes ht-in" ${d(8.2)}>Reading the next piece…</div>
    </div>`,
  },
  {
    caption: 'Just say it',
    sub: 'Stop it, ask it, send it back. Any words work.',
    say: 'Just say it. “Wait.” “Say that again.” “What does Rashi say?” “Go deeper.” “Go on.” Any words work.',
    dur: 8,
    html: `<div class="ht-screen ht-center ht-says">
      <span class="ht-say ht-in" ${d(0.5)}>“Wait.”</span>
      <span class="ht-say ht-in" ${d(1.6)}>“Say that again.”</span>
      <span class="ht-say ht-in" ${d(2.7)}>“What does Rashi say?”</span>
      <span class="ht-say ht-in" ${d(3.8)}>“Why does the Gemara ask that?”</span>
      <span class="ht-say ht-in" ${d(4.9)}>“Go deeper.”</span>
      <span class="ht-say ht-in" ${d(6)}>“Go on.”</span>
    </div>`,
  },
  {
    caption: 'Tap a line to go there',
    sub: 'Tap any line in the sefer, and it reads from there.',
    dur: 7,
    html: `<div class="ht-screen ht-sefer">
      <div class="ht-ref">Yoma 5a</div>
      <div class="ht-line"><b>4</b><span class="ht-he">ומה תלמוד לומר ״לתנופה לכפר״?</span></div>
      <div class="ht-line"><b>5</b><span class="ht-he">שאם עשאה לתנופה שירי מצוה, מעלה עליו הכתוב כאילו לא כפר, וכפר.</span></div>
      <div class="ht-line ht-tapline" ${d(2)}><b>6</b><span class="ht-he">רב פפא אמר: פרישת שבעה איכא בינייהו.</span></div>
      <div class="ht-line"><b>7</b><span class="ht-he">למאן דאמר כל הכתוב בהן מעכב בהן, מעכבא.</span></div>
      <div class="ht-goes ht-in" ${d(3.4)}>Reading line 6…</div>
    </div>
    ${finger(1.6, 50, 55)}`,
  },
  {
    caption: 'Rashi, Tosafos and the daf',
    sub: 'Open the meforshim on any line, or see the whole tzuras hadaf. Double-tap for full screen.',
    dur: 9,
    html: `<div class="ht-screen ht-sefer">
      <div class="ht-line"><b>6</b><span class="ht-he">רב פפא אמר: פרישת שבעה איכא בינייהו.</span></div>
      <div class="ht-tags ht-in" ${d(0.6)}><span class="on">Rashi</span><span>Tosafos</span></div>
      <div class="ht-rashi ht-open" ${d(1.4)}><b>פרישת שבעה</b> – the seven days the Kohen is set apart before the inauguration…</div>
    </div>
    <div class="ht-daf ht-slide" ${d(4.4)}>
      <div class="ht-daf-rashi"></div><div class="ht-daf-gem"><span>גמרא</span></div><div class="ht-daf-tos"></div>
    </div>
    ${finger(1, 19, 62)}
    ${finger(6.6, 50, 50)}${finger(6.95, 50, 50)}`,
  },
  {
    caption: 'Make it yours',
    sub: 'In Settings: the look, how it learns with you, the voice, and the cost.',
    dur: 8,
    html: `<div class="ht-screen">
      <div class="ht-head">Settings</div>
      <div class="ht-set ht-in" ${d(0.5)}>Look<span class="ht-swatches"><i class="s1"></i><i class="s2"></i><i class="s3"></i><i class="s4"></i><i class="s5"></i></span></div>
      <div class="ht-set ht-in" ${d(1.6)}>Learning style<small>Read &amp; Big Picture</small></div>
      <div class="ht-set ht-in" ${d(2.7)}>Depth, AI and cost<small>Claude Sonnet · Saver</small></div>
      <div class="ht-set ht-in" ${d(3.8)}>Voice<small>Speed, pauses, who reads the text</small></div>
      <div class="ht-set ht-in" ${d(4.9)}>Display<small>Hebrew spacing, English under each phrase</small></div>
    </div>`,
  },
  {
    caption: 'That’s it',
    sub: 'Tap Talk and say what you’d like to learn.',
    say: 'That’s it. Tap Talk, and say what you’d like to learn.',
    dur: 0, // the last scene stays until closed
    html: `<div class="ht-title">
      <div class="ht-title-he ht-in" ${d(0.2)}>חברותא</div>
      <div class="ht-bigmic ht-live ht-in" ${d(0.8)}>${mic(40)}</div>
    </div>`,
  },
];

export const HOWTO_SEEN_KEY = 'chavrusa-howto-seen';
