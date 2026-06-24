'use client';

import { useEffect } from 'react';
import { logEvent } from '@/lib/clientLog';

// Mounts once in the root layout and registers window-level handlers for
// uncaught errors and unhandled promise rejections. Each one is fire-and-
// forget POSTed to the activity log so we can debug crashes after the fact
// (especially crashes that happen on a remote RM's phone — we can't ask
// them to open DevTools).
export default function ErrorReporter() {
  useEffect(() => {
    function send(kind, payload) {
      try {
        logEvent('error', {
          payload: {
            where: kind,
            ...payload,
            path: typeof window !== 'undefined' ? window.location.pathname : null,
            ua: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 200) : null,
          },
        });
      } catch {}
    }

    // Transient network blips (offline, navigation-aborted fetch) aren't bugs —
    // don't spam the error log with them. Mobile devices throw these constantly.
    function isNetworkNoise(message) {
      const m = (message || '').toLowerCase();
      return (
        m.includes('failed to fetch') ||
        m.includes('load failed') ||
        m.includes('networkerror') ||
        m.includes('network request failed') ||
        m.includes('aborted')
      );
    }

    function onError(event) {
      const e = event?.error;
      const message = (e?.message || event?.message || '').slice(0, 500);
      if (isNetworkNoise(message)) return;
      send('window.error', {
        message,
        stack: (e?.stack || '').slice(0, 2000),
        filename: (event?.filename || '').slice(0, 200),
        lineno: event?.lineno || null,
        colno: event?.colno || null,
      });
    }

    function onRejection(event) {
      const r = event?.reason;
      const message = (typeof r === 'string' ? r : r?.message || '').slice(0, 500);
      if (isNetworkNoise(message)) return;
      send('window.unhandledRejection', {
        message,
        stack: (r?.stack || '').slice(0, 2000),
      });
    }

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return null;
}
