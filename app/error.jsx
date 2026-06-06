'use client';

import { useEffect, useState } from 'react';
import { logEvent } from '@/lib/clientLog';

// Per-route error boundary for the App Router. Replaces Next.js's generic
// "Application error" fallback so the actual error text + stack is visible.
// Also fires-and-forgets a server log so we have a record even if the user
// closes the screen before screenshotting.
//
// Network errors get special UX: instead of "something broke" they see
// "you appear to be offline" with an auto-retry every few seconds while
// the page sits on this screen. Most of these errors come from Next.js's
// own RSC fetch failing on a flaky mobile connection — they recover on
// their own once signal comes back, so we just need to keep trying.
export default function GlobalError({ error, reset }) {
  const isNetwork = isNetworkError(error);
  const [retrying, setRetrying] = useState(false);
  const [retriesElapsed, setRetriesElapsed] = useState(0);

  useEffect(() => {
    try {
      logEvent('error', {
        payload: {
          where: 'client.errorBoundary',
          message: error?.message?.slice(0, 500) || null,
          stack: error?.stack?.slice(0, 2000) || null,
          digest: error?.digest || null,
          path: typeof window !== 'undefined' ? window.location.pathname : null,
          kind: isNetwork ? 'network' : 'other',
        },
      });
    } catch {}
  }, [error, isNetwork]);

  // Auto-retry once we're online again — most network errors recover by
  // themselves on the next attempt. Listen to 'online' instead of polling
  // so we react instantly the moment connectivity returns.
  useEffect(() => {
    if (!isNetwork) return;
    function onOnline() {
      setRetrying(true);
      try { reset(); } catch {}
    }
    window.addEventListener('online', onOnline);
    const tick = setInterval(() => setRetriesElapsed((s) => s + 1), 1000);
    return () => {
      window.removeEventListener('online', onOnline);
      clearInterval(tick);
    };
  }, [isNetwork, reset]);

  if (isNetwork) {
    return (
      <div style={{ padding: 24, maxWidth: 520, margin: '0 auto', fontFamily: 'system-ui' }}>
        <h2 style={{ margin: '12px 0', fontSize: 20 }}>You appear to be offline</h2>
        <p style={{ color: '#555', fontSize: 14, marginBottom: 20 }}>
          We couldn&rsquo;t reach the server. Check your Wi-Fi or mobile data and we&rsquo;ll
          try again automatically the moment you&rsquo;re back online.
          {retriesElapsed > 0 && ` (waiting ${retriesElapsed}s…)`}
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={() => { setRetrying(true); try { reset(); } catch {} }}
            disabled={retrying}
            style={{
              padding: '10px 16px',
              background: '#111',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontSize: 14,
              cursor: retrying ? 'wait' : 'pointer',
              opacity: retrying ? 0.6 : 1,
            }}
          >
            {retrying ? 'Retrying…' : 'Retry now'}
          </button>
          <button
            type="button"
            onClick={() => { if (typeof window !== 'undefined') window.location.href = '/dashboard'; }}
            style={{
              padding: '10px 16px',
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
          onClick={() => { if (typeof window !== 'undefined') window.location.href = '/dashboard'; }}
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

// Heuristic: anything that looks like a fetch failure on a flaky connection.
// Covers the Chromium WebView TypeErrors ("TypeError: network error",
// "TypeError: Failed to fetch"), the iOS Safari variant ("Load failed"),
// and explicit offline state. We deliberately err on the side of "it's a
// network error" so we don't bury real bugs behind a generic offline UI.
function isNetworkError(error) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const msg = (error?.message || '').toLowerCase();
  if (!msg) return false;
  return /network|failed to fetch|load failed|err_internet|err_network|fetchevent/.test(msg);
}
