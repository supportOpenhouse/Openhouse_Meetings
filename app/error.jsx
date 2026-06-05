'use client';

import { useEffect } from 'react';
import { logEvent } from '@/lib/clientLog';

// Per-route error boundary for the App Router. Replaces Next.js's generic
// "Application error" fallback so the actual error text + stack is visible.
// Also fires-and-forgets a server log so we have a record even if the user
// closes the screen before screenshotting.
export default function GlobalError({ error, reset }) {
  useEffect(() => {
    try {
      logEvent('error', {
        payload: {
          where: 'client.errorBoundary',
          message: error?.message?.slice(0, 500) || null,
          stack: error?.stack?.slice(0, 2000) || null,
          digest: error?.digest || null,
          path: typeof window !== 'undefined' ? window.location.pathname : null,
        },
      });
    } catch {}
  }, [error]);

  return (
    <div style={{ padding: 24, maxWidth: 600, margin: '0 auto', fontFamily: 'system-ui' }}>
      <h2 style={{ margin: '12px 0', fontSize: 20 }}>Something broke</h2>
      <p style={{ color: '#666', fontSize: 14, marginBottom: 16 }}>
        This shouldn&rsquo;t happen. We&rsquo;ve logged it automatically. Please screenshot the message below and send it to support.
      </p>
      <pre
        style={{
          background: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: 8,
          padding: 12,
          fontSize: 12,
          overflowX: 'auto',
          color: '#7f1d1d',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {(error?.message || 'No error message') + '\n\n' + (error?.stack || '').split('\n').slice(0, 8).join('\n')}
      </pre>
      {error?.digest && (
        <div style={{ marginTop: 8, fontSize: 11, color: '#999' }}>
          digest: {error.digest}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button
          type="button"
          onClick={() => reset()}
          style={{
            padding: '8px 14px',
            background: '#111',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            fontSize: 14,
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
        <button
          type="button"
          onClick={() => {
            if (typeof window !== 'undefined') window.location.href = '/dashboard';
          }}
          style={{
            padding: '8px 14px',
            background: '#fff',
            color: '#111',
            border: '1px solid #ccc',
            borderRadius: 8,
            fontSize: 14,
            cursor: 'pointer',
          }}
        >
          Go to dashboard
        </button>
      </div>
    </div>
  );
}
