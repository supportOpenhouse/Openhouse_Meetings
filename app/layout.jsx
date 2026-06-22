import { Hanken_Grotesk, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import ErrorReporter from '@/components/ErrorReporter';
import StagingBanner from '@/components/StagingBanner';

// Self-hosted via next/font — no render-blocking Google Fonts request, and the
// fonts are subset + preloaded. Hanken Grotesk (a professional grotesque) for
// everything; JetBrains Mono for codes/IDs.
const sans = Hanken_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-sans',
  display: 'swap',
});
const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata = {
  title: 'Openhouse · Meetings',
  description: 'CP meeting recordings, transcripts, and summaries for the Openhouse RM team.',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  // viewportFit:'cover' lets us draw under the notch and use env(safe-area-inset-*) padding.
  viewportFit: 'cover',
  themeColor: '#F4EFE4',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="oh">
        <ErrorReporter />
        <StagingBanner />
        {children}
      </body>
    </html>
  );
}
