import type { Metadata, Viewport } from 'next';
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

const FONTS = 'https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@400;500;700&family=Noto+Rashi+Hebrew:wght@400;500&family=Spectral:ital,wght@0,400;0,500;0,600;1,400&family=David+Libre:wght@400;500;700&family=Alegreya:ital,wght@0,400;0,500;0,700;1,400&family=Rubik:wght@300;400;500;600;700&family=Source+Sans+3:wght@400;500;600;700&family=Crimson+Pro:ital,wght@0,400;0,500;1,400&display=swap';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-look="daf">
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
