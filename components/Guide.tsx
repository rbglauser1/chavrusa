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
  <Box r={[6.4, 52, 40, 3.4]} c="gd-chip">✓ Review questions</Box>
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

// ---------------------------------------------------------------- the settings pages
// Every setting, drawn as it looks in Settings, one step each. A row is a label with its choices (the chosen one
// marked), a value, or a short list. To change what a setting's step says, edit its `text` here.
type SetRow = { label: string; opts?: string[]; on?: number; value?: string; list?: string[]; text: ReactNode; title?: string };
type SetPage = { id: string; chapter: string; title: string; rows: SetRow[] };
const GROUPS: [string, string][] = [
  ['Learning style', 'Read & Big Picture · Ashkenaz'],
  ['Depth, AI and cost', 'Claude Sonnet · Saver'],
  ['Look and text', 'Look, fonts, colors, sizes'],
  ['What’s shown', 'The text, translation, AI extras'],
  ['Voice', 'Meridian · normal speed'],
  ['Extras', 'notes · sugya map · explain'],
  ['Messages', 'What people sent you'],
  ['Credits (selling the app)', 'off'],
  ['What your chavrusa remembers', '3 saved'],
  ['About and log out', 'Privacy · Terms'],
];
const ON_OFF = ['On', 'Off'];
export const SET_PAGES: SetPage[] = [
  { id: 'set-style', chapter: 'Learning style', title: 'Learning style', rows: [
    { label: 'Learning style', list: ['Read & Big Picture', 'Chumash Reader', 'Patient Teacher', 'Sharp Challenger', '…and 9 more'], text: <>How your chavrusa learns with you. <b>Read & Big Picture</b> reads inside and gives the big picture; <b>Chumash Reader</b> for pesukim and Rashi; <b>Patient Teacher</b>, <b>Simple Explainer</b>, <b>Sharp Challenger</b>, <b>Logic / Sevara</b>, <b>Lomdus / Iyun</b>, <b>Quick Review (Bekius)</b>, <b>Test Me (Farher)</b>, <b>Lamdan (prepared)</b>, <b>Follow My Lead</b>, <b>Mussar</b> and <b>Chassidic Warmth</b>. You can also just say “be gentler” or “quiz me.”</> },
    { label: '+ Create your own style', value: 'Name · description · how to learn', text: 'Write your own way of learning in plain words (“read it all first, then one big question”). It appears in the list with Edit and Delete.' },
    { label: 'Who explains first', opts: ['I do', 'Chavrusa does'], on: 1, text: '“I do”: you try to explain each piece first and the chavrusa checks you. “Chavrusa does”: it explains and you follow.' },
    { label: 'Nusach and pronunciation', opts: ['Ashkenaz', 'Sephardi'], on: 0, text: 'How the Hebrew and Aramaic are said: yeshivish Ashkenaz (kamatz “aw,” ת without a dagesh “s”) or Sephardi (Israeli).' },
  ] },
  { id: 'set-lang', chapter: 'AI and cost', title: 'Language', rows: [
    { label: 'The AI writes in', opts: ['English', 'Hebrew', 'Both'], on: 0, text: 'Everything the AI writes: English, Hebrew, or English then Hebrew. The voice stays English.' },
  ] },
  { id: 'set-ai', chapter: 'AI and cost', title: 'Depth, AI and cost', rows: [
    { label: 'Company', opts: ['Claude', 'OpenAI'], on: 0, text: 'Whose AI is the brain that plans and explains: Claude (Anthropic) or OpenAI.' },
    { label: 'Depth', opts: ['Basic', 'Standard', 'Deep'], on: 1, text: 'How strong the brain is. Deeper thinks harder and costs more; the price per million words is shown under it.' },
    { label: 'Made once and kept', opts: ['Claude Opus', 'Claude Sonnet'], on: 1, text: 'Which AI makes the things that are kept for good: sugya maps, explanations, ideas, review questions, summaries, intros, chazara and your own buttons. Each is made once, then free. Opus goes deeper; Sonnet costs about half.' },
    { label: 'Saver (typing and talking)', opts: ['Saver', 'Full depth every turn'], on: 0, text: 'Saver uses the quicker AI for everyday turns. Say “go deeper” and the deep one takes over for the next few turns. Calls also pause after 15 quiet seconds.' },
    { label: 'Quick replies (“OK,” “thanks”)', opts: ['Use the cheaper model', 'Always my depth'], on: 0, text: 'Short replies like “OK” or “got it” can go to the cheaper AI.' },
    { label: 'Warn me when a session costs more than', value: '$ 1.00', text: 'A warning when one session passes this amount. Leave it blank for no warning.' },
    { label: 'Cost, last 30 days', value: '$4.12 ›', text: 'What each AI cost you in the last 30 days, and how many exchanges.' },
  ] },
  { id: 'set-look', chapter: 'Look', title: 'Look and fonts', rows: [
    { label: 'Look', list: ['Sharp (new)', 'The Daf', 'Shtender (white oak)', 'Techelet', '…Midnight, Stone, Leather, Vilna, Ink'], text: 'The colors and feel of the whole app. Sharp is paper white with black lines and square corners; the others are warmer or darker. Each look keeps its own fonts.' },
    { label: 'English font for this look', value: 'Inter ▾', text: 'The font for the English and the app’s words, shown in its own letters. Kept per look.' },
    { label: 'Hebrew font for this look', value: 'Frank Ruhl (classic sefer) ▾', text: 'The font for the Gemara, pesukim and Mishnah.' },
    { label: 'Hebrew font for the commentaries', value: 'Rashi script ▾', text: 'The font for Rashi, Tosafos and the other meforshim.' },
    { label: 'Colors and bold', opts: ['Gemara', 'English', 'Meforshim', 'Intro'], on: -1, text: 'A color for each part of the page (the text, its English, the meforshim, the amud intro), and a B to make any of them bold.' },
  ] },
  { id: 'set-sizes', chapter: 'Look', title: 'Text sizes and commentaries', rows: [
    { label: 'Hebrew text size', value: '–   24   +', text: 'How big the Gemara and pesukim are.' },
    { label: 'Hebrew spacing', opts: ['Normal', 'Close', 'Closer'], on: 0, text: 'How close the Hebrew lines sit, for a page that looks more like a sefer.' },
    { label: 'Commentary text size', value: '–   20   +', text: 'How big Rashi, Tosafos and the meforshim are.' },
    { label: 'English text size', value: '–   18   +', text: 'How big the English is, here and in what the AI writes.' },
    { label: 'Show commentaries', opts: ['When I tap a line', 'Under every line'], on: 0, text: 'Meforshim buttons only on the line you tap, or under every line.' },
    { label: 'Rashi open on every line', opts: ['Off', 'On'], on: 0, text: 'Rashi already open under each line, without tapping.' },
    { label: 'Tosafos open on every line', opts: ['Off', 'On'], on: 0, text: 'The same for Tosafos.' },
    { label: 'Rashi, Tosafos and other commentaries', opts: ['Regular letters', 'Rashi script'], on: 1, text: 'Show the meforshim in Rashi script, as in a printed Gemara, or in regular letters.' },
  ] },
  { id: 'set-space', chapter: 'Look', title: 'Spacing', rows: [
    { label: 'Space between parts', opts: ['Normal', 'More', 'Most'], on: 0, text: 'More room after the English before the next Hebrew.' },
    { label: 'Side margins', opts: ['Normal', 'Wider', 'Widest'], on: 0, text: 'The text a little further in from the edges.' },
  ] },
  { id: 'set-lines', chapter: 'Look', title: 'Lines and the English', rows: [
    { label: 'Alignment', opts: ['As usual', 'Justified'], on: 0, text: 'Justified: the Hebrew and English fill each line edge to edge, like a printed sefer.' },
    { label: 'Lines between lines', opts: ['Off', 'On'], on: 0, text: 'A thin rule between the lines of the text, and dotted ones between phrases.' },
    { label: 'English layout', opts: ['Under the line', 'Phrase by phrase'], on: 0, text: 'The English under the whole line, or under each Hebrew phrase so you can match them word by word.' },
    { label: 'Phrase by phrase shows', opts: ['Sefaria’s full English', 'Only the translation'], on: 0, text: 'With phrase by phrase: the full English, or only the word-for-word part.' },
    { label: 'Word-for-word translation in bold', opts: ['Bold', 'Not bold'], on: 0, text: 'Sefaria marks the literal translation; this shows it in bold so it stands out from the added explanation.' },
    { label: 'Translation and added explanation', opts: ['Plain', 'Softer', 'Lighter', 'Italics', 'Only'], on: 0, text: 'How the explanation Sefaria adds looks next to the translation: the same, softer, lighter, in italics, or hidden.' },
  ] },
  { id: 'set-shown', chapter: 'What’s shown', title: 'What’s shown', rows: [
    { label: 'Source text', opts: ['With translation', 'Original only', 'Off (verbal)'], on: 0, text: 'The text with its English, the Hebrew alone, or no text at all (learning by ear).' },
    { label: 'English translation under the Gemara', opts: ON_OFF, on: 0, text: 'The English under each line of the Sefer.' },
    { label: 'Onkelos (Chumash)', opts: ['Off', 'On'], on: 0, text: 'Targum Onkelos under each pasuk.' },
    { label: 'Nikud', opts: ON_OFF, on: 0, text: 'The vowels in the Hebrew, where Sefaria has them.' },
    { label: 'Seforim from Sefaria', opts: ['Allow all', 'Classic and approved only'], on: 1, text: 'Only classic, approved seforim in the Library and the commentaries, or everything Sefaria has.' },
    { label: 'Screen during voice conversations', opts: ['Show the conversation', 'Blank (voice only)'], on: 0, text: 'During a call, the written conversation, or a blank screen.' },
  ] },
  { id: 'set-shown2', chapter: 'What’s shown', title: 'Extras written by the AI', rows: [
    { label: 'Amud intro', opts: ON_OFF, on: 0, text: 'A short paragraph at the top of each amud on what is coming. Written by the AI once and kept.' },
    { label: 'Voice says the intro', opts: ON_OFF, on: 0, text: 'With Read & Big Picture, the chavrusa says the intro out loud before reading.' },
    { label: 'Steps', opts: ['Off', 'On'], on: 0, text: 'A one-line summary above each move of the Gemara (question, answer, proof).' },
    { label: 'Commentary summaries', opts: ['Off', 'On'], on: 0, text: 'Rashi, Tosafos, Bartenura and others in short English, under the commentary.' },
  ] },
  { id: 'set-voice', chapter: 'Voice', title: 'Voice', rows: [
    { label: 'Which voice', value: 'Meridian ▶   ·   Design a voice', text: 'The voice of your chavrusa. Tap ▶ to hear one (about 1¢). “Design a voice” makes a new one from a description. Male voices only. Applies from the next Talk.' },
    { label: 'Speaking speed', opts: ['Slow', 'Relaxed', 'Normal', 'Brisk'], on: 2, text: 'How fast the chavrusa talks.' },
    { label: 'Pauses', opts: ['Few', 'Normal', 'More', 'Most'], on: 1, text: 'How long it waits between pieces and after a question.' },
    { label: 'In a call, who reads the text', opts: ['He reads it all', 'English only', 'Just the gist'], on: 0, text: 'He reads the Hebrew and English inside, only the English, or just tells you what it says.' },
    { label: 'After each piece', opts: ['Wait for me', 'Keep going by itself'], on: 1, text: '“Wait for me”: he stops after each piece until you say go on. “Keep going”: he waits a few seconds and goes on. Say “stop” or “wait” to hold him.' },
    { label: 'How the Hebrew is given to the voice', opts: ['With nikud', 'Without vowels', 'With a key', 'Spelled out'], on: 1, text: 'What the voice sees when it reads: the Hebrew with vowels, bare letters like a Gemara, the Hebrew with a spelled-out key, or only English letters.' },
    { label: 'The English read with the text', opts: ['Full', 'Literal', 'His own'], on: 1, text: 'Sefaria’s full English, just the literal words, or a short translation in the chavrusa’s own words, the way a rebbi translates inside.' },
  ] },
  { id: 'set-voice2', chapter: 'Voice', title: 'Pronunciation and steadiness', rows: [
    { label: 'Vowel key', opts: ['A', 'B', 'C', 'D'], on: 3, text: 'Which set of pronunciation rules the voice learns with. D is A with a clearer shva. Each is explained under it in Settings.' },
    { label: 'Standard pronunciations', opts: ON_OFF, on: 0, text: 'A list of common words and names said the standard yeshivish way.' },
    { label: 'Instructions to the voice', opts: ['Short', 'Full'], on: 0, text: 'Short instructions keep the voice quick and steady; full ones say more.' },
    { label: 'Fresh start at each new section', opts: ON_OFF, on: 0, text: 'The voice starts clean at each new section, so its rules don’t fade.' },
    { label: 'Catch skipped words', opts: ON_OFF, on: 0, text: 'If the voice skips English words, it is caught and corrected.' },
    { label: 'Catch skipped Hebrew', opts: ON_OFF, on: 0, text: 'The same for the Hebrew.' },
    { label: 'Steady mode', opts: ON_OFF, on: 1, text: 'On: every turn goes through the brain first, in your style (1–3 seconds slower). Off: the voice answers quick turns itself.' },
  ] },
  { id: 'set-voice3', chapter: 'Voice', title: 'Saving, recorder, engine', rows: [
    { label: 'Coach notes', opts: ON_OFF, on: 1, text: 'When Steady mode is off: a quick check after each exchange, and a short note to the voice if it drifted from your style.' },
    { label: 'Open calls the Nov 3 way (a test)', opts: ['Off', 'On'], on: 0, text: 'An older way of starting a call, kept for testing.' },
    { label: 'Pause the call when it’s quiet for', value: '15 seconds ▾', text: 'After this much quiet the call pauses, so you don’t pay for silence. (With Saver on, 15 seconds.)' },
    { label: 'When paused', opts: ['Start talking to resume', 'Tap Resume'], on: 0, text: 'Pick up just by talking, or with a tap.' },
    { label: 'Call recorder', value: 'Send me a call’s log ›', text: 'Each call’s log, to send so a problem can be looked at.' },
    { label: 'Live voice for calls', opts: ['GPT-Live', 'Gemini Live (test)'], on: 0, text: 'GPT-Live (OpenAI, about 5¢ a minute) or Gemini Live (Google, about 1–2¢ a minute, a test). Applies from the next Talk.' },
    { label: 'Gemini voice and pronunciation', value: 'Charon ▶ ›', text: 'With Gemini Live: its voice and its own pronunciation settings.' },
  ] },
  { id: 'set-extras', chapter: 'Extras', title: 'Extras: on each line', rows: [
    { label: 'Explain button on each line', opts: ON_OFF, on: 0, text: '✦ Explain next to Rashi and Tosafos: what the line says and where it stands in the sugya.' },
    { label: 'Chat button on each line', opts: ON_OFF, on: 0, text: '✦ Chat next to Explain: a written chat with the AI about that line, right under it. Ask anything; save one answer, or the whole chat, to your Notebook.' },
    { label: 'Word meanings', opts: ON_OFF, on: 0, text: 'In a line that is open, or in a meforesh under it, tap any Hebrew or Aramaic word: what it means, from Jastrow’s dictionary. Tap an abbreviation (כה"ג, וי"ל) and it is opened into its words. Free, no AI.' },
    { label: 'Tosafos steps', opts: ON_OFF, on: 0, text: 'A Steps button on every long Tosafos: the same words cut into question, answer, proof and second answer, with punctuation and one line of English on each. With Steps on (What’s shown), any other long meforesh has it too.' },
    { label: 'Where else in Shas', opts: ON_OFF, on: 0, text: '⇄ Elsewhere on a line of Gemara or Mishnah: the same sugya in other masechtos and elsewhere in this one. Free, from Sefaria’s links.' },
  ] },
  { id: 'set-extrasb', chapter: 'Extras', title: 'Extras: on each line (more)', rows: [
    { label: 'Learn by heart', opts: ON_OFF, on: 0, text: '🧠 By heart on a Mishnah or in Pirkei Avos: more words hide each round. “Check me” listens and marks what you missed.' },
    { label: 'Color marks', opts: ON_OFF, on: 0, text: 'Press and drag over words in a line, then pick Question, Answer or Key. The marks stay on the page and show in your Notebook.' },
    { label: 'Sources button on each line', opts: ON_OFF, on: 0, text: 'Sources next to Rashi and Tosafos: what Sefaria links to the line. With it, ✦ Ideas drawn from those sources.' },
    { label: 'From the sugya to the halacha', opts: ON_OFF, on: 0, text: '⚖ Halacha on a line: the road from the Gemara to the Rambam, the Tur, the Shulchan Aruch and the Mishnah Berurah, in order. Free, from Sefaria’s links.' },
    { label: 'Notes on the line', opts: ON_OFF, on: 0, text: 'Add a note to any line, or say “make a note” in a call. All notes go to your Notebook.' },
  ] },
  { id: 'set-extras2', chapter: 'Extras', title: 'Extras: on the amud', rows: [
    { label: 'Source sheet', opts: ON_OFF, on: 0, text: '📄 Source sheet at the top of the Sefer: one printable page of the amud for a shiur or Shabbos.' },
    { label: 'Sugya map', opts: ON_OFF, on: 0, text: 'A map button at the top of the Sefer: the big picture, each topic and the Gemara’s steps.' },
    { label: 'Meforshim in the sugya map', opts: ON_OFF, on: 0, text: 'Under each step of the map, the meforshim on it, opening right there.' },
    { label: 'Review questions', opts: ON_OFF, on: 1, text: 'A “Review questions” button at the top of the Sefer: questions on the amud, answers hidden until you tap.' },
    { label: 'Listen to the daf', opts: ON_OFF, on: 0, text: '🎧 Listen at the top of the Sefer: a spoken overview of the amud, eight to ten minutes, for the car. Made once (about 20¢), then kept and free to replay.' },
    { label: 'My buttons', value: '+ Make a button', text: 'Your own AI buttons, with your own words (“Explain it simply,” “The mussar here,” “Shiur outline”). Choose whether each sits on every line or on the whole amud.' },
  ] },
  { id: 'set-extras3', chapter: 'Extras', title: 'Extras: around the learning', rows: [
    { label: 'What we learned', opts: ON_OFF, on: 0, text: 'After a call of three minutes or more, a short summary goes to your Notebook.' },
    { label: 'Learning time goal', opts: ['No goal', '30 min', '1 hour', '2 hours'], on: 2, text: 'Home shows how long you learned today and this week; a goal adds a line that fills up through the day.' },
    { label: 'Start a call from Siri', value: 'Copy the address', text: 'Add …/?talk=1 to your Home Screen as “Learn”, then say “Hey Siri, open Learn”: the app opens at your place with one big button to start talking.' },
    { label: 'Chazara (review)', opts: ON_OFF, on: 0, text: 'On Home: a short recap of last time, and a few questions on an older sugya.' },
    { label: 'Progress and plans', opts: ON_OFF, on: 1, text: 'On Home: what you’ve learned, your goals, daf yomi, and a siyum when you finish.' },
  ] },
  { id: 'set-extras3b', chapter: 'Extras', title: 'Extras: around the learning (more)', rows: [
    { label: 'Dark call screen', opts: ON_OFF, on: 1, text: 'When a call starts, the screen goes dark: the words being read, large, with Again, Pause and Go on.' },
    { label: 'Driving mode', opts: ON_OFF, on: 1, text: 'A 🚗 button: big buttons, the screen kept on, and your headphone or car buttons work.' },
    { label: 'Offline reading', opts: ON_OFF, on: 1, text: 'A Download button on a masechta, to read with no internet.' },
    { label: 'Saved texts', opts: ON_OFF, on: 0, text: 'A copy of each text you open, so it still opens when Sefaria is slow or down.' },
  ] },
  { id: 'set-more', chapter: 'More', title: 'Messages, credits, memory', rows: [
    { label: 'Messages', value: 'Inbox ›', text: 'What people sent you through Contact us.' },
    { label: 'Credits (selling the app)', opts: ['On', 'Off'], on: 1, text: 'For when the app is sold: when on, learning uses up credits that people buy. Off while it is just for you.' },
    { label: 'What your chavrusa remembers', list: ['Don’t translate Rashi', 'I learn in the morning', '+ Add an instruction'], text: 'What it remembers about how you like to learn. × forgets one; you can add your own.' },
    { label: 'About and log out', value: 'Privacy · Terms · Credits and licenses · Log out', text: 'The reminder that AI makes mistakes, the privacy page, terms, the licenses of the texts, and Log out.' },
  ] },
];
// The rows' places on the screen, in % (one row: a label and its choices).
const rowH = (r: SetRow) => (r.list ? 4.6 + r.list.length * 3.6 : 8.4);
function rowTops(p: SetPage) { const t: number[] = []; let y = 12.5; for (const r of p.rows) { t.push(y); y += rowH(r) + 1.6; } return t; }
const SET_SCREENS: Record<string, () => ReactNode> = Object.fromEntries(SET_PAGES.map((p) => [p.id, () => {
  const tops = rowTops(p);
  return (<>
    <Box r={[2, 5, 90, 3.4]} c="gd-row gd-soft">‹ Settings</Box>
    <Box r={[6, 5, 90, 4.6]} c="gd-row gd-settitle">{p.title}</Box>
    {p.rows.map((r, k) => (
      <Box key={r.label} r={[tops[k], 5, 90, rowH(r)]} c="gd-setrow">
        <b>{r.label}</b>
        {r.opts && <span className="gd-seg">{r.opts.map((o, j) => <span key={o} className={j === r.on ? 'on' : ''}>{o}</span>)}</span>}
        {r.value && <span className="gd-val">{r.value}</span>}
        {r.list && <span className="gd-setlist">{r.list.map((o, j) => <span key={o} className={j === 0 ? 'on' : ''}>{o}</span>)}</span>}
      </Box>
    ))}
  </>);
}]));
const SET_STEPS = () => SET_PAGES.flatMap((p) => { const tops = rowTops(p); return p.rows.map((r, k) => ({ chapter: p.chapter, screen: p.id, spot: [tops[k], 5, 90, rowH(r)] as Rect, title: r.title ?? r.label, text: <><span className="gd-where">Settings › {p.title}</span>{r.text}</> })); });

const SCREENS: Record<string, () => ReactNode> = {
  ...SET_SCREENS,
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
  callx: () => (<>
    <Box r={[0, 0, 100, 100]} c="gd-drive" />
    <Box r={[2.5, 6, 60, 4]} c="gd-row gd-light"><He>יומא ו׳ א</He>&nbsp;<span className="gd-tiny" style={{ opacity: .6 }}>LINE 08</span></Box>
    <Box r={[2.5, 74, 20, 4]} c="gd-row gd-right gd-light gd-tiny">TEXT</Box>
    <Box r={[24, 6, 88, 3]} c="gd-row gd-light gd-tiny" s={{ letterSpacing: '.14em', opacity: .7 }}>■&nbsp;READING INSIDE</Box>
    <Box r={[29, 6, 88, 10]} c="gd-right gd-light" s={{ fontSize: 'calc(var(--u) * 7.5)' }}><He>אֲפִילּוּ תֵּימְרוּ רַבָּנַן</He></Box>
    <Box r={[41, 6, 88, 8]} c="gd-light" s={{ fontSize: 'calc(var(--u) * 4.4)' }}>Even if you say it is the Rabbis,</Box>
    <Box r={[51, 6, 88, 6]} c="gd-right" s={{ color: '#7f858f', fontSize: 'calc(var(--u) * 4.6)' }}><He>עַד כָּאן לָא פְּלִיגִי רַבָּנַן</He></Box>
    <Box r={[83, 5, 28, 8]} c="gd-drivebtn gd-sq">↺<small>Again</small></Box>
    <Box r={[83, 36, 28, 8]} c="gd-drivebtn gd-sq" s={{ background: '#f4f3ee', color: '#0e1013' }}>❚❚</Box>
    <Box r={[83, 67, 28, 8]} c="gd-drivebtn gd-sq">⏭<small>Go on</small></Box>
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
    {GROUPS.map(([t, h], i) => <Box key={t} r={[7.5 + i * 8.4, 5, 90, 7.6]} c="gd-group"><b>{t}</b><small>{h}</small><span>›</span></Box>)}
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
  { chapter: 'The Sefer', screen: 'sefer', spot: [6.4, 22, 70, 3.4], title: 'Sugya map and Review questions', text: 'At the top of every amud or perek (turn them on in Extras).' },
  { chapter: 'The Sefer', screen: 'map', spot: [18, 0, 100, 82], title: 'The sugya map', text: 'The big picture of the amud, then each topic with an intro, what you need to know, the Gemara’s steps, and where it ends up. Tap a step to go to its line; meforshim, halacha and verses open right in the map.' },
  { chapter: 'The Sefer', screen: 'review', spot: [30, 0, 100, 70], title: 'Review questions', text: 'Test yourself on the amud. Each answer stays hidden until you tap.' },
  { chapter: 'The Sefer', screen: 'sefer', spot: [90, 14, 42, 5.2], title: 'Where you are', text: '‹ and › go to the amud before and after. You can also just scroll: pull down at the top for the amud before, keep going at the bottom for the next.' },
  // Learning out loud
  { chapter: 'Learning out loud', screen: 'sefer', spot: [89.4, 80, 15, 7.2], round: true, title: 'Talk with your chavrusa', text: 'Tap to start a call. It reads inside, phrase by phrase, explains, and keeps going at your pace. Tap again to pause or end.' },
  { chapter: 'Learning out loud', screen: 'call', spot: [68, 8, 84, 12], title: 'Just say it', text: 'Talk the way you would across the table: “Wait.” “Say that again.” “What does Rashi say?” “Go deeper.” “Go on.” Any words work.' },
  { chapter: 'Learning out loud', screen: 'call', spot: [8, 6, 88, 32], title: 'Everything is written here too', text: 'What you said and what it answered. The reminder under it stays: AI makes mistakes.' },
  { chapter: 'Learning out loud', screen: 'callx', spot: [24, 6, 88, 34], title: 'Dark call screen', text: 'With Dark call screen on (Extras): when a call starts the screen goes dark and shows only the words being read, large, and what comes next. Again, Pause and Go on at the bottom; “Text” goes back to the page.' },
  { chapter: 'Learning out loud', screen: 'sefer', spot: [82, 3, 11, 5.2], round: true, title: 'Driving mode', text: 'With Driving mode on (Extras): a 🚗 button opens big buttons and keeps the screen on.' },
  { chapter: 'Learning out loud', screen: 'drive', spot: [62, 8, 84, 11], title: 'Big buttons, car buttons', text: 'Pause, say it again, go on. Your headphone or car buttons do the same: play/pause, next = go on, back = say it again.' },
  // Settings: an overview, then every setting
  { chapter: 'Settings', screen: 'settings', spot: [7.5, 5, 90, 83.6], title: 'Settings', text: 'Everything you can change, in groups. The next steps go through every setting, one by one. Tap a chapter at the top to jump to a group.' },
  ...SET_STEPS(),
  { chapter: 'More', screen: 'contact', spot: [8, 6, 88, 62], title: 'Contact us', text: 'A question, a problem or an idea: write to us from Home, Settings, or the Privacy page.' },
  { chapter: 'Done', screen: 'home', spot: [59.5, 39, 22, 10.7], round: true, title: 'That’s it', text: <>Tap Talk and say what you’d like to learn. And remember: <b>AI makes mistakes</b>, it is not rabbinically approved, and it never replaces a real chavrusa.</> },
];
const CHAPTERS = [...new Set(STEPS.map((s) => s.chapter))];

export const GUIDE_SEEN_KEY = 'chavrusa-guide-seen';
export function guideSeen(): boolean { try { return localStorage.getItem(GUIDE_SEEN_KEY) === '1'; } catch { return true; } }

// ---------------------------------------------------------------- the tour
// The screen is drawn as wide as the space allows, and a "camera" moves and zooms onto the part being explained,
// so the words on the drawn screen are as large as the real ones (or larger). Everything else is dimmed.
export default function Guide({ onClose, start = 0 }: { onClose: () => void; start?: number }) {
  const [i, setI] = useState(start);
  const step = STEPS[i];
  const Screen = SCREENS[step.screen];
  const view = useRef<HTMLDivElement>(null);
  const [vw, setVw] = useState(340), [vh, setVh] = useState(420);
  useEffect(() => { try { localStorage.setItem(GUIDE_SEEN_KEY, '1'); } catch { /* optional */ } }, []);
  useEffect(() => {
    const el = view.current;
    if (!el) return;
    const ro = new ResizeObserver(() => { setVw(el.clientWidth); setVh(el.clientHeight); });
    ro.observe(el); setVw(el.clientWidth); setVh(el.clientHeight);
    return () => ro.disconnect();
  }, []);
  const go = (n: number) => setI(Math.max(0, Math.min(STEPS.length - 1, n)));
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'ArrowRight') go(i + 1); if (e.key === 'ArrowLeft') go(i - 1); if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });
  const touch = useRef<number | null>(null);

  // The drawn screen: a phone's shape, as wide as the view (at most 440 px).
  const w = Math.min(vw, 440), h = w * 2.05;
  const px = (r: Rect) => ({ x: (r[1] / 100) * w, y: (r[0] / 100) * h, w: (r[2] / 100) * w, h: (r[3] / 100) * h });
  const spot = step.spot ? px(step.spot) : null;
  const also = step.also ? px(step.also) : null;
  // What the camera frames: the part, and what it opens.
  const f = spot ? (also ? { x: Math.min(spot.x, also.x), y: Math.min(spot.y, also.y), x2: Math.max(spot.x + spot.w, also.x + also.w), y2: Math.max(spot.y + spot.h, also.y + also.h) } : { x: spot.x, y: spot.y, x2: spot.x + spot.w, y2: spot.y + spot.h }) : { x: 0, y: 0, x2: w, y2: h };
  const fitZ = Math.min(vw / w, vh / h);
  const z = Math.max(fitZ, Math.min(2.2, (vw * 0.94) / (f.x2 - f.x + 24), (vh * 0.86) / (f.y2 - f.y + 24)));
  const place = (view: number, size: number, c: number) => (size <= view ? (view - size) / 2 : Math.min(0, Math.max(view - size, view / 2 - c)));
  const tx = place(vw, w * z, ((f.x + f.x2) / 2) * z), ty = place(vh, h * z, ((f.y + f.y2) / 2) * z);

  return (
    <div className="gd" role="dialog" aria-modal="true" aria-label="How to use the app"
      onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => { const s = touch.current; touch.current = null; if (s === null) return; const d = e.changedTouches[0].clientX - s; if (Math.abs(d) > 60) go(i + (d < 0 ? 1 : -1)); }}>
      <div className="gd-top">
        <div className="gd-chapters">{CHAPTERS.map((c) => <button key={c} className={c === step.chapter ? 'on' : ''} onClick={() => go(STEPS.findIndex((s) => s.chapter === c))}>{c}</button>)}</div>
        <button className="gd-x" onClick={onClose} aria-label="Close">×</button>
      </div>
      <div className="gd-view" ref={view}>
        <div className="gd-cam" style={{ width: w, height: h, transform: `translate(${tx}px, ${ty}px) scale(${z})`, '--u': `${w / 100}px` } as CSSProperties}>
          <div className="gd-screen" key={step.screen}><Screen /></div>
          {spot && (
            // The dimming, with a hole for the part explained (and for what it opens, when there is one).
            <svg className="gd-dimmer" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
              <defs><mask id="gd-holes"><rect width={w} height={h} fill="#fff" />
                {step.round ? <ellipse cx={spot.x + spot.w / 2} cy={spot.y + spot.h / 2} rx={spot.w / 2 + 4} ry={spot.h / 2 + 4} fill="#000" /> : <rect x={spot.x - 4} y={spot.y - 4} width={spot.w + 8} height={spot.h + 8} rx={6} fill="#000" />}
                {also && <rect x={also.x - 3} y={also.y - 3} width={also.w + 6} height={also.h + 6} rx={6} fill="#000" />}
              </mask></defs>
              <rect width={w} height={h} fill="rgba(0,0,0,.55)" mask="url(#gd-holes)" />
            </svg>
          )}
          {spot && <div className={`gd-spot ${step.round ? 'round' : ''}`} style={{ left: spot.x - 4, top: spot.y - 4, width: spot.w + 8, height: spot.h + 8 }} />}
          {also && <div className="gd-spot gd-also" style={{ left: also.x - 3, top: also.y - 3, width: also.w + 6, height: also.h + 6 }} />}
        </div>
      </div>
      <div className="gd-card" key={`c${i}`}>
        <div className="gd-count"><b>{i + 1}</b> of {STEPS.length} · {step.chapter}</div>
        <h2>{step.title}</h2>
        <div className="gd-text">{step.text}</div>
        <div className="gd-nav">
          <button className="btn ghost" onClick={() => go(i - 1)} disabled={i === 0}>‹ Back</button>
          {i < STEPS.length - 1
            ? <button className="btn primary" onClick={() => go(i + 1)}>Next ›</button>
            : <button className="btn primary" onClick={onClose}>Start learning</button>}
        </div>
      </div>
    </div>
  );
}
