import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import { FONTS_EN, FONTS_HE, FONTS_COMM, fontStack } from '@/lib/config';
import './globals.css';
import './clay.css';
import './experiences.css';
import './sand-teal.css';
import './guided-learning.css';
import './paper-ink.css';
import './midnight-home.css';
import { guidedPalette } from '@/lib/guided';
import { EXPERIENCES, isExperience } from '@/lib/experiences';
import { PullRefresh } from '@/components/PullRefresh';
import { ViewportFix } from '@/components/ViewportFix';

export const metadata: Metadata = {
  title: 'Chavrusa',
  description: 'An AI learning partner for Torah study',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg', apple: '/icon.svg' },
  appleWebApp: { capable: true, title: 'Chavrusa', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  width: 'device-width', initialScale: 1, viewportFit: 'cover',
};

const FONTS = 'https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@400;500;700&family=Noto+Rashi+Hebrew:wght@400;500&family=Spectral:ital,wght@0,400;0,500;0,600;1,400&family=David+Libre:wght@400;500;700&family=Alegreya:ital,wght@0,400;0,500;0,700;1,400&family=Rubik:wght@300;400;500;600;700&family=Assistant:wght@400;500;600;700&family=Crimson+Pro:ital,wght@0,400;0,500;1,400&family=Bellefair&family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=EB+Garamond:ital,wght@0,400;0,500;1,400&family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&family=Noto+Serif+Hebrew:wght@400;500;700&family=Heebo:wght@400;500;700&family=Comic+Neue:wght@400;700&family=Patrick+Hand&family=Caveat:wght@500;700&family=Fredoka:wght@400;500;600&family=Playpen+Sans+Hebrew:wght@400;500;700&family=Amatic+SC:wght@400;700&family=Varela+Round&family=Secular+One&display=swap';

// The look and text sizes are remembered in a cookie, so the page opens in your colors right away
// (instead of flashing the default colors until Settings load).
const LOOKS = ['daf', 'shtender', 'techelet', 'midnight', 'stone', 'leather', 'vilna', 'ink', 'sharp', 'clay', ...EXPERIENCES.map((x) => x.id)];
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [look, he, en, rashi, comm, fEn, fHe, cols, bolds, fComm, palette] = ((await cookies()).get('ui')?.value ?? '').split('|');
  // Colors of the Hebrew, English, meforshim and intro (Settings → Look → Colors).
  const [cHe, cEn, cComm, cIntro] = (cols ?? '').split('.').map((c) => (/^[a-z]{2,8}$/.test(c) ? c : ''));
  const enFont = fontStack(FONTS_EN, fEn), heFont = fontStack(FONTS_HE, fHe);
  const commFont = fComm || (rashi === 'off' ? 'same' : 'rashi');
  const commStack = fontStack(FONTS_COMM, commFont);
  const num = (v: string | undefined) => (v && /^\d{1,2}$/.test(v) ? `${v}px` : undefined);
  const style = { ...(num(he) ? { '--he-size': num(he) } : {}), ...(num(en) ? { '--en-size': num(en) } : {}), ...(num(comm) ? { '--comm-size': num(comm) } : {}), ...(enFont ? { '--f-body': enFont, '--f-ui': enFont } : {}), ...(heFont ? { '--f-he': heFont } : {}), ...(commFont !== 'rashi' && commFont !== 'same' && commStack ? { '--f-comm': commStack } : {}) } as React.CSSProperties;
  return (
    <html lang="en" data-guided-palette={look === 'guided-learning' ? guidedPalette(palette) : undefined} data-experience={isExperience(look) ? look : undefined} data-look={LOOKS.includes(look) ? look : 'daf'} data-rashi={rashi === 'off' ? 'off' : 'on'} data-enfont={enFont ? 'chosen' : 'look'} data-commfont={commFont === 'rashi' ? 'rashi' : commFont === 'same' ? 'same' : 'chosen'} data-hefont={heFont ? 'chosen' : 'look'} data-c-he={cHe || 'ink'} data-c-en={cEn || 'ink'} data-c-comm={cComm || 'sepia'} data-c-intro={cIntro || 'slate'} data-b-he={bolds?.[0] === 'b' ? 'on' : 'off'} data-b-en={bolds?.[1] === 'b' ? 'on' : 'off'} data-b-comm={bolds?.[2] === 'b' ? 'on' : 'off'} data-b-intro={bolds?.[3] === 'b' ? 'on' : 'off'} style={style} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href={FONTS} />
      </head>
      <body>{children}<PullRefresh /><ViewportFix /></body>
    </html>
  );
}
