import './globals.css';

export const metadata = {
  title: 'Openhouse · Meetings',
  description: 'CP meeting recordings, transcripts, and summaries for the Openhouse RM team.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="oh">{children}</body>
    </html>
  );
}
