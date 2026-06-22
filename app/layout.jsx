import './globals.css';
import ErrorReporter from '@/components/ErrorReporter';
import StagingBanner from '@/components/StagingBanner';

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
    <html lang="en">
      <body className="oh">
        <ErrorReporter />
        <StagingBanner />
        {children}
      </body>
    </html>
  );
}
