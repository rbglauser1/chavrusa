import type { Metadata, Viewport } from 'next';
import { Frank_Ruhl_Libre, Inter } from 'next/font/google';
import './globals.css';

const he = Frank_Ruhl_Libre({ subsets: ['hebrew', 'latin'], weight: ['400', '500', '700'], variable: '--font-he' });
const ui = Inter({ subsets: ['latin'], variable: '--font-ui' });

export const metadata: Metadata = {
  title: 'Chavrusa',
  description: 'An AI learning partner for Torah study',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg', apple: '/icon.svg' },
  appleWebApp: { capable: true, title: 'Chavrusa', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = {
  width: 'device-width', initialScale: 1, viewportFit: 'cover',
  themeColor: '#0e131d',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" className={`${he.variable} ${ui.variable}`}>
      <body>{children}</body>
    </html>
  );
}
