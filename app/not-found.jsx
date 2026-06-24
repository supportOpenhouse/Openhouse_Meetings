import Link from 'next/link';
import Logo from '@/components/Logo';

// Global 404 for any unmatched route. Rendered inside the root layout.
export default function NotFound() {
  return (
    <div
      className="oh-sales"
      style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg)',
        color: 'var(--ink)',
        padding: 24,
      }}
    >
      <div style={{ textAlign: 'center', maxWidth: 380 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 22 }}>
          <Logo style={{ height: 26, filter: 'brightness(0)' }} />
        </div>
        <div
          style={{
            fontSize: 72,
            fontWeight: 800,
            lineHeight: 1,
            letterSpacing: '-0.03em',
            background: 'var(--grad-primary)',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
          }}
        >
          404
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: '14px 0 6px' }}>Page not found</h1>
        <p style={{ color: 'var(--ink-2)', fontSize: 14, lineHeight: 1.5, marginBottom: 24 }}>
          The page you’re looking for doesn’t exist or may have moved.
        </p>
        <Link href="/" className="oh-btn accent" style={{ padding: '12px 24px' }}>
          Go to home
        </Link>
      </div>
    </div>
  );
}
