import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import { FONTS_EN, FONTS_HE, fontStack } from '@/lib/config';
import './globals.css';

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

const FONTS = 'https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@400;500;700&family=Noto+Rashi+Hebrew:wght@400;500&family=Spectral:ital,wght@0,400;0,500;0,600;1,400&family=David+Libre:wght@400;500;700&family=Alegreya:ital,wght@0,400;0,500;0,700;1,400&family=Rubik:wght@300;400;500;600;700&family=Assistant:wght@400;500;600;700&family=Crimson+Pro:ital,wght@0,400;0,500;1,400&family=Bellefair&family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=EB+Garamond:ital,wght@0,400;0,500;1,400&family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=Inter:wght@400;500;600&family=Noto+Serif+Hebrew:wght@400;500;700&family=Heebo:wght@400;500;700&family=Comic+Neue:wght@400;700&family=Patrick+Hand&family=Caveat:wght@500;700&family=Fredoka:wght@400;500;600&family=Playpen+Sans+Hebrew:wght@400;500;700&family=Amatic+SC:wght@400;700&family=Varela+Round&family=Secular+One&display=swap';

// The look and text sizes are remembered in a cookie, so the page opens in your colors right away
// (instead of flashing the default colors until Settings load).
const LOOKS = ['daf', 'shtender', 'techelet', 'midnight', 'stone', 'leather', 'vilna', 'ink'];
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [look, he, en, rashi, comm, fEn, fHe] = ((await cookies()).get('ui')?.value ?? '').split('|');
  const enFont = fontStack(FONTS_EN, fEn), heFont = fontStack(FONTS_HE, fHe);
  const num = (v: string | undefined) => (v && /^\d{1,2}$/.test(v) ? `${v}px` : undefined);
  const style = { ...(num(he) ? { '--he-size': num(he) } : {}), ...(num(en) ? { '--en-size': num(en) } : {}), ...(num(comm) ? { '--comm-size': num(comm) } : {}), ...(enFont ? { '--f-body': enFont, '--f-ui': enFont } : {}), ...(heFont ? { '--f-he': heFont } : {}) } as React.CSSProperties;
  return (
    <html lang="en" data-look={LOOKS.includes(look) ? look : 'daf'} data-rashi={rashi === 'off' ? 'off' : 'on'} style={style} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href={FONTS} />
      </head>
      <body>{children}</body>
    </html>
  );
}
