import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
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

const FONTS = 'https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@400;500;700&family=Noto+Rashi+Hebrew:wght@400;500&family=Spectral:ital,wght@0,400;0,500;0,600;1,400&family=David+Libre:wght@400;500;700&family=Alegreya:ital,wght@0,400;0,500;0,700;1,400&family=Rubik:wght@300;400;500;600;700&family=Assistant:wght@400;500;600;700&family=Crimson+Pro:ital,wght@0,400;0,500;1,400&display=swap';

// The look and text sizes are remembered in a cookie, so the page opens in your colors right away
// (instead of flashing the default colors until Settings load).
const LOOKS = ['daf', 'shtender', 'techelet', 'midnight', 'stone', 'leather', 'vilna', 'ink'];
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [look, he, en, rashi, comm] = ((await cookies()).get('ui')?.value ?? '').split('|');
  const num = (v: string | undefined) => (v && /^\d{1,2}$/.test(v) ? `${v}px` : undefined);
  const style = { ...(num(he) ? { '--he-size': num(he) } : {}), ...(num(en) ? { '--en-size': num(en) } : {}), ...(num(comm) ? { '--comm-size': num(comm) } : {}) } as React.CSSProperties;
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
