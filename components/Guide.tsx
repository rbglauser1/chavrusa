'use client';
// The guide (Home → "How to use the app", and once after the first disclaimer): a step-by-step tour of the app. Each
// step shows a drawing of the real screen, darkens everything but the part being explained, shows that part
// enlarged in a magnifier with an arrow to it, and pops up a card that says what it does. ‹ › (or a swipe, or the
// arrow keys) move between the steps; the chapters at the top jump to a part of the app.
//
// The screens are drawn here with the app's own colors and fonts (they follow the chosen look), so the guide never
// costs anything and can be changed in words. Every part is placed in percent of the phone screen: `at(top, left,
// width, height)`, the same numbers a step's `spot` uses, so the spotlight always lands on its part.
//
// To change a step: edit its title, words or spot in STEPS below. To add a screen: add it to SCREENS.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

type Rect = [number, number, number, number]; // top, left, width, height, in % of the screen
const at = ([t, l, w, h]: Rect, extra?: CSSProperties): CSSProperties => ({ position: 'absolute', top: `${t}%`, left: `${l}%`, width: `${w}%`, height: `${h}%`, ...extra });
const Box = ({ r, c, children, s }: { r: Rect; c?: string; children?: ReactNode; s?: CSSProperties }) => <div className={`gd-el ${c ?? ''}`} style={at(r, s)}>{children}</div>;
const He = ({ children }: { children: ReactNode }) => <span className="gd-he" dir="rtl">{children}</span>;

// ---------------------------------------------------------------- the screens
const Header = () => (<>
  <Box r={[1.6, 4, 40, 3.4]} c="gd-row"><span className="gd-burger">☰</span><He>חברותא</He></Box>
  <Box r={[1.6, 56, 30, 3.4]} c="gd-row gd-right"><He>יומא ו׳ א</He></Box>
  <Box r={[1.6, 88, 9, 3.4]} c="gd-row gd-right">⋯</Box>
</>);
const BottomBar = ({ talking }: { talking?: boolean }) => (<>
  <Box r={[90.6, 3, 9, 4]} c="gd-row gd-soft">⌨</Box>
  <Box r={[90, 14, 42, 5.2]} c="gd-pill"><span>‹</span><He>יומא ו׳ א</He><small>6a</small><span>›</span></Box>
  <Box r={[90, 62, 12, 5.8]} c="gd-circle gd-ghost">⌄</Box>
  <Box r={[89.4, 80, 15, 7.2]} c={`gd-circle gd-mic ${talking ? 'gd-live' : ''}`}>🎙</Box>
</>);
const Line = ({ top, he, en, focus }: { top: number; he: string; en: string; focus?: boolean }) => (<>
  <Box r={[top, 6, 88, 5.6]} c={`gd-heline ${focus ? 'gd-focus' : ''}`}><He>{he}</He></Box>
  <Box r={[top + 5.8, 6, 88, 5.6]} c="gd-enline">{en}</Box>
</>);
const LineButtons = ({ on }: { on?: string }) => (<>
  <Box r={[36.2, 6, 30, 2.6]} c="gd-note">✎ Add a note</Box>
  <Box r={[39.4, 6, 18, 3.6]} c={`gd-chip ${on === 'rashi' ? 'gd-on' : ''}`}>Rashi</Box>
  <Box r={[39.4, 26, 22, 3.6]} c="gd-chip">Tosafos</Box>
  <Box r={[39.4, 50, 24, 3.6]} c={`gd-chip gd-ai ${on === 'explain' ? 'gd-on' : ''}`}>✦ Explain</Box>
  <Box r={[44, 6, 26, 3.6]} c={`gd-chip ${on === 'sources' ? 'gd-on' : ''}`}>Sources (3)</Box>
  <Box r={[44, 34, 20, 3.6]} c={`gd-chip gd-ai ${on === 'ideas' ? 'gd-on' : ''}`}>✦ Ideas</Box>
  <Box r={[44, 56, 38, 3.6]} c="gd-chip">Commentaries (8) ▾</Box>
</>);
const Sefer = ({ on, children }: { on?: string; children?: ReactNode }) => (<>
  <Header />
  <Box r={[6.4, 22, 30, 3.4]} c="gd-chip">🗺 Sugya map</Box>
  <Box r={[6.4, 55, 24, 3.4]} c="gd-chip">✓ Review</Box>
  <Line top={11} he="אמר רבי יוחנן: ״כאשר צוה ה׳…״" en="Rabbi Yochanan said: As Hashem commanded…" />
  <Line top={23} he="מאי טעמא דרבי יוחנן?" en="What is Rabbi Yochanan’s reason?" focus />
  <LineButtons on={on} />
  {children ?? <><Line top={50} he="אי לריש לקיש כדאית ליה" en="According to Reish Lakish, as he holds" /><Line top={64} he="הכי קאמר: מביתו למה פירש?" en="This is what it says: why did he leave his house?" /></>}
  <Box r={[82, 3, 11, 5.2]} c="gd-circle gd-ghost">🚗</Box>
  <BottomBar />
</>);
const Panel = ({ top, h, title, children }: { top: number; h: number; title: string; children: ReactNode }) => (
  <Box r={[top, 5, 90, h]} c="gd-panel"><div className="gd-panel-title"><span>{title}</span><span>✕</span></div>{children}</Box>
);

const SCREENS: Record<string, () => ReactNode> = {
  disclaimer: () => (<>
    <Box r={[8, 0, 100, 6]} c="gd-brand"><He>חברותא</He></Box>
    <Box r={[18, 6, 88, 58]} c="gd-panel gd-warn">
      <b>Not rabbinically approved.</b><br /><br /><b>AI makes mistakes.</b> Never rely on it for the correct understanding of the material or for halacha: ask your rav.<br /><br /><b>Never a replacement for a real chavrusa.</b>
    </Box>
    <Box r={[80, 20, 60, 6]} c="gd-btn">I understand</Box>
  </>),
  home: () => (<>
    <Box r={[5, 0, 100, 6]} c="gd-brand"><He>חברותא</He></Box>
    <Box r={[11.5, 0, 100, 3]} c="gd-center gd-soft gd-italic">Good evening</Box>
    <Box r={[16, 6, 88, 13]} c="gd-card">
      <small className="gd-label">PICK UP WHERE YOU LEFT OFF</small>
      <div className="gd-right gd-big"><He>יומא ו׳ א</He></div>
      <div className="gd-row gd-between"><span className="gd-soft">Yoma 6a</span><span className="gd-go">›</span></div>
    </Box>
    <Box r={[31.5, 6, 88, 8.5]} c="gd-rowcard gd-top"><span className="gd-ico">📚</span><span><b>Library</b><small>Gemara, Chumash and every sefer</small></span><span>›</span></Box>
    <Box r={[40, 6, 88, 8.5]} c="gd-rowcard"><span className="gd-ico">🕘</span><span><b>Recent</b><small>Your sessions, newest first</small></span><span>›</span></Box>
    <Box r={[48.5, 6, 88, 8.5]} c="gd-rowcard gd-bottom"><span className="gd-ico">⚙</span><span><b>Settings</b><small>Look, learning style, voice, display</small></span><span>›</span></Box>
    <Box r={[59.5, 39, 22, 10.7]} c="gd-circle gd-mic">🎙</Box>
    <Box r={[71, 0, 100, 3]} c="gd-center"><b>Talk</b></Box>
    <Box r={[74, 0, 100, 3]} c="gd-center gd-soft gd-italic">Tell your chavrusa what you’d like to learn</Box>
    <Box r={[77.5, 0, 100, 2.5]} c="gd-center gd-soft gd-tiny">AI makes mistakes · not rabbinically approved · ask your rav</Box>
    <Box r={[81.5, 6, 88, 6]} c="gd-rowcard gd-solo"><b>Chazara</b><small>Review what you learned</small></Box>
    <Box r={[89, 6, 88, 6]} c="gd-rowcard gd-solo"><b>Progress</b><small>+ Goal · daf yomi</small></Box>
    <Box r={[96, 0, 100, 3]} c="gd-center gd-soft gd-tiny gd-u">How to use the app · Contact us</Box>
  </>),
  library: () => (<>
    <Box r={[2, 5, 70, 3.4]} c="gd-row"><b>Library</b></Box>
    <Box r={[2, 85, 10, 3.4]} c="gd-row gd-right">✕</Box>
    <Box r={[7.5, 5, 20, 3.6]} c="gd-chip gd-on">Gemara</Box>
    <Box r={[7.5, 27, 20, 3.6]} c="gd-chip">Tanach</Box>
    <Box r={[7.5, 49, 22, 3.6]} c="gd-chip">Mishnah</Box>
    <Box r={[7.5, 73, 18, 3.6]} c="gd-chip">More</Box>
    <Box r={[13.5, 5, 90, 2.6]} c="gd-soft gd-tiny">RECENT</Box>
    <Box r={[16.5, 5, 90, 4.4]} c="gd-listrow">Yoma 6a</Box>
    <Box r={[21, 5, 90, 4.4]} c="gd-listrow">Bereishis 24</Box>
    {['Berachos', 'Shabbos', 'Eruvin', 'Pesachim', 'Yoma', 'Sukkah', 'Beitzah'].map((m, i) => <Box key={m} r={[28 + i * 5, 5, 90, 4.6]} c={`gd-listrow ${m === 'Yoma' ? 'gd-pick' : ''}`}>{m}</Box>)}
    <Box r={[65, 5, 90, 4.6]} c="gd-section">My Seforim<small>Add a PDF, Word file, photo of a page or web page</small></Box>
    <Box r={[71.5, 5, 90, 4.6]} c="gd-section">My Notes (12)<small>Show</small></Box>
    <Box r={[78, 5, 90, 4.6]} c="gd-section">On this phone (offline)<small>Yoma</small></Box>
  </>),
  daf: () => (<>
    <Box r={[2, 5, 80, 3.4]} c="gd-row gd-soft">Library › Gemara › <b>&nbsp;Yoma</b></Box>
    <Box r={[2, 85, 10, 3.4]} c="gd-row gd-right">✕</Box>
    <Box r={[8, 5, 90, 4.6]} c="gd-chip">⬇ Download for offline (175 amudim)</Box>
    <Box r={[15, 5, 90, 2.6]} c="gd-soft gd-tiny">DAF (AMUD A / B)</Box>
    {Array.from({ length: 24 }, (_, i) => i + 2).map((d, i) => (
      <Box key={d} r={[18.5 + Math.floor(i / 4) * 7, 5 + (i % 4) * 22.5, 21, 6]} c={`gd-daf ${d === 6 ? 'gd-pick' : ''}`}><b>{d}</b><span>a</span><span>b</span></Box>
    ))}
  </>),
  sefer: () => <Sefer />,
  rashi: () => (<Sefer on="rashi">
    <Panel top={49.5} h={30} title="Rashi · Learn it in the Sefer ↗"><div className="gd-he gd-comm" dir="rtl"><b>מאי טעמא</b> - דקא יליף פרישה מסיני ולא ממילואים, כדכתיב…</div></Panel>
  </Sefer>),
  explain: () => (<Sefer on="explain">
    <Panel top={49.5} h={31} title="✦ Explanation">
      <div className="gd-tiny gd-soft">Written by AI · may contain mistakes</div>
      <p>The Gemara asks what Rabbi Yochanan’s source is for setting the Kohen Gadol apart for seven days.</p>
      <p>He learns it with a <span dir="rtl">גזירה שוה</span> from the word <span dir="rtl">״צוה״</span> said at the inauguration…</p>
    </Panel>
  </Sefer>),
  sources: () => (<Sefer on="sources">
    <Panel top={49.5} h={31} title="Sources">
      <div className="gd-tiny gd-soft">HALACHA</div>
      <div className="gd-src">Rambam, Service on the Day of Atonement 1:3 ▾</div>
      <div className="gd-tiny gd-soft">VERSES QUOTED</div>
      <div className="gd-src">Leviticus 8:34 ▾</div>
      <div className="gd-tiny gd-soft">MACHSHAVA, MUSSAR, CHASSIDUS</div>
      <div className="gd-src">Sfat Emet, Vayikra… ▾</div>
    </Panel>
  </Sefer>),
  ideas: () => (<Sefer on="ideas">
    <Panel top={49.5} h={31} title="✦ Ideas from the sources">
      <p>The Rambam rules that the Kohen Gadol is set apart seven days before Yom Kippur…</p>
      <div className="gd-row"><span className="gd-chip-s">Rambam 1:3</span></div>
      <p>The Sfas Emes explains the seven days as a preparation of the heart…</p>
      <div className="gd-tiny gd-soft">Drawn by the AI only from the sources linked to this line</div>
    </Panel>
  </Sefer>),
  map: () => (<>
    <Sefer />
    <Box r={[0, 0, 100, 100]} c="gd-dim" />
    <Box r={[18, 0, 100, 82]} c="gd-sheet">
      <div className="gd-row gd-between"><b>Sugya map · Yoma 6a</b><span>×</span></div>
      <div className="gd-tiny gd-soft">Made by AI · may contain mistakes · check it inside</div>
      <div className="gd-bigpic"><small>THE BIG PICTURE</small>Where the seven days of separation come from, and why the Kohen Gadol leaves his home…</div>
      <div className="gd-topic"><b>1 · The source of the separation</b><span className="gd-soft">line 1</span></div>
      <p className="gd-small">The Gemara asks where we learn it from, and brings two opinions…</p>
      <div className="gd-small"><b>Good to know:</b> <span dir="rtl">גזירה שוה</span>: learning a law from the same word in two places</div>
      <div className="gd-step"><small>THE GEMARA ASKS</small>Why not learn the <span dir="rtl">פרישה</span> from Yom Kippur itself?</div>
      <div className="gd-row"><span className="gd-soft gd-tiny">Meforshim:</span><span className="gd-chip-s">Rashi</span><span className="gd-chip-s">Tosafos</span></div>
      <div className="gd-step"><small>RABBI YOCHANAN ANSWERS</small>The word <span dir="rtl">״צוה״</span> is said only before the deed…</div>
    </Box>
  </>),
  review: () => (<>
    <Sefer />
    <Box r={[0, 0, 100, 100]} c="gd-dim" />
    <Box r={[30, 0, 100, 70]} c="gd-sheet">
      <div className="gd-row gd-between"><b>Review · Yoma 6a</b><span>×</span></div>
      <div className="gd-tiny gd-soft">Written by AI, may contain mistakes. Think of the answer, then tap to check.</div>
      <div className="gd-q"><b>1</b> Where does Rabbi Yochanan learn the seven days from?<div className="gd-chip-s">Show the answer</div></div>
      <div className="gd-q"><b>2</b> Why does the Kohen Gadol leave his home?<div className="gd-ans">So that he doesn’t become tamei through his wife… <u>line 8</u></div></div>
    </Box>
  </>),
  call: () => (<>
    <Header />
    <Box r={[8, 6, 88, 8]} c="gd-bubble gd-me">Let’s learn Yoma 6a</Box>
    <Box r={[18, 6, 88, 22]} c="gd-bubble"><He>מאי טעמא דרבי יוחנן</He> — What is Rabbi Yochanan’s reason? … So the Gemara is asking where he learns it from.</Box>
    <Box r={[43, 6, 88, 3]} c="gd-center gd-soft gd-tiny">AI makes mistakes. Check the text inside; for halacha, ask your rav.</Box>
    <Box r={[60, 0, 100, 6]} c="gd-center gd-state">Speaking…<span className="gd-wave"><i /><i /><i /><i /><i /></span></Box>
    <Box r={[68, 8, 84, 12]} c="gd-says"><span>“Wait.”</span><span>“Say that again.”</span><span>“What does Rashi say?”</span><span>“Go on.”</span></Box>
    <BottomBar talking />
  </>),
  drive: () => (<>
    <Box r={[0, 0, 100, 100]} c="gd-drive" />
    <Box r={[3, 6, 60, 4]} c="gd-row gd-light">Yoma 6a</Box>
    <Box r={[3, 74, 20, 4]} c="gd-row gd-right gd-light">Exit</Box>
    <Box r={[20, 0, 100, 4]} c="gd-center gd-light">Speaking</Box>
    <Box r={[30, 25, 50, 24.4]} c="gd-circle gd-drivebig">❚❚</Box>
    <Box r={[62, 8, 40, 11]} c="gd-drivebtn">↺<small>Say it again</small></Box>
    <Box r={[62, 52, 40, 11]} c="gd-drivebtn">⏭<small>Go on</small></Box>
    <Box r={[78, 25, 50, 5]} c="gd-center gd-light gd-u">End the call</Box>
  </>),
  settings: () => (<>
    <Box r={[2, 5, 60, 3.4]} c="gd-row"><span>‹</span>&nbsp;<b>Settings</b></Box>
    {[
      ['Learning style', 'Read & Big Picture · it explains first'],
      ['Depth, AI and cost', 'Claude Sonnet 5.5 · Saver'],
      ['Voice', 'Meridian · natural speed'],
      ['Look and fonts', 'Shtender · Spectral'],
      ['Display', 'Hebrew spacing, English under each phrase'],
      ['Extras', 'saved texts · notes · sugya map'],
      ['Messages', 'What people sent through Contact us'],
      ['Credits (selling the app)', 'off'],
    ].map(([t, h], i) => <Box key={t} r={[8 + i * 9, 5, 90, 8]} c="gd-group"><b>{t}</b><small>{h}</small><span>›</span></Box>)}
    <Box r={[82, 0, 100, 3]} c="gd-center gd-soft gd-tiny gd-u">Privacy · Terms of use · Contact us</Box>
  </>),
  extras: () => (<>
    <Box r={[2, 5, 60, 3.4]} c="gd-row"><span>‹</span>&nbsp;<b>Extras</b></Box>
    {[
      ['Chazara (review)', 'On Home: a recap of last time, and questions'],
      ['Sugya map', 'A map button at the top of the Sefer'],
      ['Explain button on each line', 'Next to Rashi and Tosafos'],
      ['Sources button on each line', 'And ✦ Ideas from those sources'],
      ['Review questions', 'A Review button at the top of the Sefer'],
      ['Notes on the line', 'Tap a line, then ✎'],
      ['Progress and plans', 'Goals, daf yomi, a siyum'],
      ['Driving mode', 'A 🚗 button: big buttons, car controls'],
      ['Offline reading', 'Download a masechta to the phone'],
    ].map(([t, h], i) => <Box key={t} r={[8 + i * 9.6, 5, 90, 8.6]} c="gd-group"><b>{t}</b><small>{h}</small><span className="gd-switch">On</span></Box>)}
  </>),
  contact: () => (<>
    <Box r={[3, 6, 60, 3]} c="gd-row gd-soft">‹ Back to the app</Box>
    <Box r={[8, 6, 88, 5]} c="gd-row gd-title">Contact us</Box>
    {['Your name', 'Your email', 'About: Question'].map((t, i) => <Box key={t} r={[16 + i * 9, 6, 88, 7]} c="gd-field">{t}</Box>)}
    <Box r={[44, 6, 88, 18]} c="gd-field">Message</Box>
    <Box r={[65, 6, 30, 5]} c="gd-btn">Send</Box>
  </>),
};

// ---------------------------------------------------------------- the steps
type Step = { chapter: string; screen: keyof typeof SCREENS; spot?: Rect; also?: Rect; title: string; text: ReactNode; round?: boolean }; // also: a second part kept lit (what the spot opens)
export const STEPS: Step[] = [
  { chapter: 'Start', screen: 'disclaimer', spot: [18, 6, 88, 58], title: 'Please read this first', text: <>This app is <b>not rabbinically approved</b>. <b>AI makes mistakes</b>: never rely on it for the correct understanding of the Gemara, the meforshim or any material, and never for halachic rulings; ask your rav. It is <b>never meant to take the place of a real chavrusa</b>, a rebbi, or learning in the beis medrash.</> },
  // Home
  { chapter: 'Home', screen: 'home', spot: [16, 6, 88, 13], title: 'Pick up where you left off', text: 'The place you were last learning, at the line you reached. One tap and you are back inside.' },
  { chapter: 'Home', screen: 'home', spot: [31.5, 6, 88, 8.5], title: 'The Library', text: 'Every masechta, Chumash, Mishnah, Nach and sefer, from Sefaria. Choose what to learn here.' },
  { chapter: 'Home', screen: 'home', spot: [40, 6, 88, 8.5], title: 'Recent', text: 'Your last 8 sessions, newest first (“Show all” for the rest). Each one opens where you stopped. × deletes one.' },
  { chapter: 'Home', screen: 'home', spot: [48.5, 6, 88, 8.5], title: 'Settings', text: 'The look, the learning style, the voice, the display and the extras. Everything can be changed at any time.' },
  { chapter: 'Home', screen: 'home', spot: [59.5, 39, 22, 10.7], round: true, title: 'Talk', text: 'Tap and just say what you want to learn: “Let’s learn Yoma, daf vav,” “today’s daf,” “Bereishis perek 24.” Your chavrusa opens it and starts.' },
  { chapter: 'Home', screen: 'home', spot: [77.5, 6, 88, 2.5], title: 'AI makes mistakes', text: 'This reminder is always here, in the conversation, and on everything the AI writes. Check everything inside; for halacha, ask your rav.' },
  { chapter: 'Home', screen: 'home', spot: [81.5, 6, 88, 13.5], title: 'Chazara and Progress', text: 'If you turn them on (Settings → Extras): a short recap of what you learned, with questions, and your progress, goals and daf yomi.' },
  // Library
  { chapter: 'Library', screen: 'library', spot: [7.5, 5, 88, 3.6], title: 'Choose a shelf', text: 'Gemara, Tanach, Mishnah, or More for every other sefer.' },
  { chapter: 'Library', screen: 'library', spot: [16.5, 5, 90, 8.9], title: 'Recently opened', text: 'The last 5 places you opened, one tap away.' },
  { chapter: 'Library', screen: 'library', spot: [48, 5, 90, 4.6], title: 'Choose a masechta', text: 'Tap a masechta or sefer to see its dapim or perakim.' },
  { chapter: 'Library', screen: 'daf', spot: [53.5, 50, 21, 6], title: 'Choose the amud', text: 'Each daf has its amud a and b. Tap one to open it in the Sefer.' },
  { chapter: 'Library', screen: 'daf', spot: [8, 5, 90, 4.6], title: 'Download for offline', text: 'With Offline reading on (Extras), keep a whole masechta on your phone, to read with no internet. (Talking with the chavrusa still needs internet.)' },
  { chapter: 'Library', screen: 'library', spot: [65, 5, 90, 11.1], title: 'My Seforim and My Notes', text: 'Bring your own: a PDF, a Word file, a photo of a page or a web page, and learn it like any sefer. My Notes has every note you wrote, with a search.' },
  // The Sefer
  { chapter: 'The Sefer', screen: 'sefer', spot: [23, 6, 88, 11.4], title: 'Tap a line', text: 'The lashon kodesh with its English. Tap a line: your chavrusa learns from there, and the line’s buttons open under it. Double-tap the text for full screen.' },
  { chapter: 'The Sefer', screen: 'rashi', spot: [39.4, 6, 42, 3.6], also: [49.5, 5, 90, 30], title: 'Rashi, Tosafos and every meforesh', text: <>Tap one to open it right under the line, with the <b>dibbur hamaschil in bold</b>. “Learn it in the Sefer ↗” opens the whole meforesh.</> },
  { chapter: 'The Sefer', screen: 'explain', spot: [39.4, 50, 24, 3.6], also: [49.5, 5, 90, 31], title: '✦ Explain', text: 'What this line says and where it stands in the sugya, in clear English, with the learning terms in Hebrew letters. Written by AI: check it inside.' },
  { chapter: 'The Sefer', screen: 'sources', spot: [44, 6, 26, 3.6], also: [49.5, 5, 90, 31], title: 'Sources', text: 'What Sefaria links to this line: where the halacha is (Rambam, Shulchan Aruch), the same in Shas, Midrash, verses, machshava. Each opens right there in Hebrew and English.' },
  { chapter: 'The Sefer', screen: 'ideas', spot: [44, 34, 20, 3.6], also: [49.5, 5, 90, 31], title: '✦ Ideas', text: 'A few points the AI draws only from those linked seforim, each naming its source. Tap a source to read it inside.' },
  { chapter: 'The Sefer', screen: 'sefer', spot: [44, 56, 38, 3.6], title: 'All the commentaries', text: 'Every meforesh Sefaria has on this line (only approved seforim).' },
  { chapter: 'The Sefer', screen: 'sefer', spot: [36.2, 6, 30, 2.6], title: 'Add a note', text: 'Write your own note on the line (or say “make a note: …” in a call). There is a ✎ on every Rashi, explanation and step of the map too. Every note goes into your Notebook (on Home and in the Library), filed by sefer and by #topic.' },
  { chapter: 'The Sefer', screen: 'sefer', spot: [6.4, 22, 57, 3.4], title: 'Sugya map and Review', text: 'At the top of every amud or perek (turn them on in Extras).' },
  { chapter: 'The Sefer', screen: 'map', spot: [18, 0, 100, 82], title: 'The sugya map', text: 'The big picture of the amud, then each topic with an intro, what you need to know, the Gemara’s steps, and where it ends up. Tap a step to go to its line; meforshim, halacha and verses open right in the map.' },
  { chapter: 'The Sefer', screen: 'review', spot: [30, 0, 100, 70], title: 'Review questions', text: 'Test yourself on the amud. Each answer stays hidden until you tap.' },
  { chapter: 'The Sefer', screen: 'sefer', spot: [90, 14, 42, 5.2], title: 'Where you are', text: '‹ and › go to the amud before and after. You can also just scroll: pull down at the top for the amud before, keep going at the bottom for the next.' },
  // Learning out loud
  { chapter: 'Learning out loud', screen: 'sefer', spot: [89.4, 80, 15, 7.2], round: true, title: 'Talk with your chavrusa', text: 'Tap to start a call. It reads inside, phrase by phrase, explains, and keeps going at your pace. Tap again to pause or end.' },
  { chapter: 'Learning out loud', screen: 'call', spot: [68, 8, 84, 12], title: 'Just say it', text: 'Talk the way you would across the table: “Wait.” “Say that again.” “What does Rashi say?” “Go deeper.” “Go on.” Any words work.' },
  { chapter: 'Learning out loud', screen: 'call', spot: [8, 6, 88, 32], title: 'Everything is written here too', text: 'What you said and what it answered. The reminder under it stays: AI makes mistakes.' },
  { chapter: 'Learning out loud', screen: 'sefer', spot: [82, 3, 11, 5.2], round: true, title: 'Driving mode', text: 'With Driving mode on (Extras): a 🚗 button opens big buttons and keeps the screen on.' },
  { chapter: 'Learning out loud', screen: 'drive', spot: [62, 8, 84, 11], title: 'Big buttons, car buttons', text: 'Pause, say it again, go on. Your headphone or car buttons do the same: play/pause, next = go on, back = say it again.' },
  // Settings
  { chapter: 'Settings', screen: 'settings', spot: [8, 5, 90, 8], title: 'Learning style', text: 'How your chavrusa learns with you: Read & Big Picture, Chumash Reader, Patient Teacher, Sharp Challenger, Iyun, Test Me, and more. Or just tell it: “be gentler,” “quiz me.”' },
  { chapter: 'Settings', screen: 'settings', spot: [17, 5, 90, 8], title: 'Depth, AI and cost', text: 'Which AI thinks for you (deeper costs more), and Saver, which uses the quicker one for everyday turns. Your costs are shown here.' },
  { chapter: 'Settings', screen: 'settings', spot: [26, 5, 90, 8], title: 'Voice', text: 'The voice, its speed and pauses, who reads the text, Ashkenaz or Sephardi pronunciation, and whether it keeps going by itself.' },
  { chapter: 'Settings', screen: 'settings', spot: [35, 5, 90, 17], title: 'Look and display', text: 'Colors, fonts and sizes for the text, the English and the meforshim; English under each phrase; Hebrew spacing.' },
  { chapter: 'Settings', screen: 'extras', spot: [8, 5, 90, 86], title: 'Extras', text: 'Turn on what you want: chazara, the sugya map, Explain, Sources and Ideas, review questions, notes, progress, driving mode, offline reading. At the bottom, My buttons: make your own AI buttons (“Explain it simply,” “The mussar here,” “Shiur outline”…), shown next to Explain.' },
  { chapter: 'Settings', screen: 'contact', spot: [8, 6, 88, 62], title: 'Contact us', text: 'A question, a problem or an idea: write to us from Home, Settings, or the Privacy page.' },
  { chapter: 'Done', screen: 'home', spot: [59.5, 39, 22, 10.7], round: true, title: 'That’s it', text: <>Tap Talk and say what you’d like to learn. And remember: <b>AI makes mistakes</b>, it is not rabbinically approved, and it never replaces a real chavrusa.</> },
];
const CHAPTERS = [...new Set(STEPS.map((s) => s.chapter))];

export const GUIDE_SEEN_KEY = 'chavrusa-guide-seen';
export function guideSeen(): boolean { try { return localStorage.getItem(GUIDE_SEEN_KEY) === '1'; } catch { return true; } }

// ---------------------------------------------------------------- the tour
export default function Guide({ onClose, start = 0 }: { onClose: () => void; start?: number }) {
  const [i, setI] = useState(start);
  const step = STEPS[i];
  const Screen = SCREENS[step.screen];
  const frame = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(300);
  useEffect(() => { try { localStorage.setItem(GUIDE_SEEN_KEY, '1'); } catch { /* optional */ } }, []);
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el); setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const go = (n: number) => setI(Math.max(0, Math.min(STEPS.length - 1, n)));
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'ArrowRight') go(i + 1); if (e.key === 'ArrowLeft') go(i - 1); if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });
  const touch = useRef<number | null>(null);

  // The spotlight, the magnifier and the arrow, in px within the screen.
  const h = w * 2.05;
  const sp = step.spot;
  const spot = sp ? { x: (sp[1] / 100) * w, y: (sp[0] / 100) * h, w: (sp[2] / 100) * w, h: (sp[3] / 100) * h } : null;
  const al = step.also;
  const also = al ? { x: (al[1] / 100) * w, y: (al[0] / 100) * h, w: (al[2] / 100) * w, h: (al[3] / 100) * h } : null;
  const small = spot && spot.w < w * 0.6 && spot.h < h * 0.2; // only small parts get a magnifier (a big one is clear as it is)
  const D = w * 0.46, Z = 1.9;
  const cx = spot ? spot.x + spot.w / 2 : 0, cy = spot ? spot.y + spot.h / 2 : 0;
  const mag = small && spot ? { x: Math.max(D / 2 + 6, Math.min(w - D / 2 - 6, cx < w / 2 ? w * 0.68 : w * 0.32)), y: (cy < h * 0.5 && !(also && also.y > cy)) ? Math.min(h - D / 2 - 6, spot.y + spot.h + D * 0.75) : Math.max(D / 2 + 6, spot.y - D * 0.75) } : null; // never over what the part opens
  // The arrow: from the magnifier's edge to the spot's edge.
  let arrow: { x1: number; y1: number; x2: number; y2: number } | null = null;
  if (mag && spot) {
    const dx = cx - mag.x, dy = cy - mag.y, len = Math.hypot(dx, dy) || 1;
    const x1 = mag.x + (dx / len) * (D / 2 + 3), y1 = mag.y + (dy / len) * (D / 2 + 3);
    const tx = Math.min(1, (spot.w / 2 + 4) / Math.abs(dx || 1)), ty = Math.min(1, (spot.h / 2 + 4) / Math.abs(dy || 1));
    const t = Math.min(tx, ty);
    arrow = { x1, y1, x2: cx - dx * t, y2: cy - dy * t };
  }

  return (
    <div className="gd" role="dialog" aria-modal="true" aria-label="How to use the app"
      onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => { const s = touch.current; touch.current = null; if (s === null) return; const d = e.changedTouches[0].clientX - s; if (Math.abs(d) > 60) go(i + (d < 0 ? 1 : -1)); }}>
      <div className="gd-top">
        <div className="gd-chapters">{CHAPTERS.map((c) => <button key={c} className={c === step.chapter ? 'on' : ''} onClick={() => go(STEPS.findIndex((s) => s.chapter === c))}>{c}</button>)}</div>
        <button className="gd-x" onClick={onClose} aria-label="Close">×</button>
      </div>
      <div className="gd-stage">
        <div className="gd-phone" ref={frame} style={{ '--u': `${w / 100}px` } as CSSProperties}>
          <div className="gd-screen" key={step.screen}><Screen /></div>
          {spot && (
            // The dimming, with a hole for the part explained (and for what it opens, when there is one).
            <svg className="gd-dimmer" width={w} height={h} key={`d${i}`}>
              <defs><mask id="gd-holes"><rect width={w} height={h} fill="#fff" />
                {step.round ? <ellipse cx={cx} cy={cy} rx={spot.w / 2 + 4} ry={spot.h / 2 + 4} fill="#000" /> : <rect x={spot.x - 4} y={spot.y - 4} width={spot.w + 8} height={spot.h + 8} rx={8} fill="#000" />}
                {also && <rect x={also.x - 3} y={also.y - 3} width={also.w + 6} height={also.h + 6} rx={8} fill="#000" />}
              </mask></defs>
              <rect width={w} height={h} fill="rgba(0,0,0,.52)" mask="url(#gd-holes)" />
            </svg>
          )}
          {spot && <div className={`gd-spot ${step.round ? 'round' : ''}`} style={{ left: spot.x - 4, top: spot.y - 4, width: spot.w + 8, height: spot.h + 8 }} />}
          {also && <div className="gd-spot gd-also" style={{ left: also.x - 3, top: also.y - 3, width: also.w + 6, height: also.h + 6 }} />}
          {arrow && (
            <svg className="gd-arrow" width={w} height={h} key={`a${i}`}>
              <defs><marker id="gd-head" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" /></marker></defs>
              <line x1={arrow.x1} y1={arrow.y1} x2={arrow.x2} y2={arrow.y2} markerEnd="url(#gd-head)" />
            </svg>
          )}
          {mag && spot && (
            <div className="gd-mag" key={`m${i}`} style={{ left: mag.x - D / 2, top: mag.y - D / 2, width: D, height: D }}>
              <div className="gd-mag-in" style={{ width: w, height: h, transform: `translate(${D / 2 - cx * Z}px, ${D / 2 - cy * Z}px) scale(${Z})`, '--u': `${w / 100}px` } as CSSProperties}><Screen /></div>
            </div>
          )}
        </div>
      </div>
      <div className="gd-card" key={`c${i}`}>
        <div className="gd-count">{i + 1} of {STEPS.length} · {step.chapter}</div>
        <h2>{step.title}</h2>
        <p>{step.text}</p>
        <div className="gd-nav">
          <button className="btn ghost" onClick={() => go(i - 1)} disabled={i === 0}>‹ Back</button>
          {i < STEPS.length - 1
            ? <button className="btn" onClick={() => go(i + 1)}>Next ›</button>
            : <button className="btn" onClick={onClose}>Start learning</button>}
        </div>
      </div>
    </div>
  );
}
