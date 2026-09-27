import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import './globals.css';
export const viewport: Viewport = {width:'device-width',initialScale:1,viewportFit:'cover',themeColor:'#171812'};
export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host') ?? 'localhost:3000';
  const localHost = /^(localhost|127\.|192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(host) || host.split(':')[0].endsWith('.local');
  const protocol = requestHeaders.get('x-forwarded-proto') === 'https' ? 'https' : localHost ? 'http' : 'https';
  const origin = `${protocol}://${host}`;
  return {
    applicationName: 'Neoclonk',
    appleWebApp: { capable: true, title: 'Neoclonk', statusBarStyle: 'black' },
    icons: {
      icon: [{ url: '/rage/clonk.ico' }, { url: '/icons/neoclonk-192.png', type: 'image/png', sizes: '192x192' }],
      apple: [{ url: '/apple-touch-icon.png?v=1', sizes: '180x180', type: 'image/png' }],
    },
    title: 'Neoclonk — Play Clonk Rage in the browser.',
    description: 'Play Clonk Rage in the browser. 80 original scenarios with classic controls and multiplayer.',
    metadataBase: new URL(origin),
    openGraph: { title: 'Neoclonk — Play Clonk Rage in the browser.', description: 'Play Clonk Rage in the browser.', type: 'website' },
    twitter: { card: 'summary', title: 'Neoclonk — Play Clonk Rage in the browser.', description: 'Play Clonk Rage in the browser.' },
  };
}
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="en"><head><link rel="manifest" href="/manifest.json?v=1" crossOrigin="use-credentials" /><meta name="apple-mobile-web-app-capable" content="yes" /></head><body>{children}</body></html>; }
