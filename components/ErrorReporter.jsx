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

    function onError(event) {
      const e = event?.error;
      send('window.error', {
        message: (e?.message || event?.message || '').slice(0, 500),
        stack: (e?.stack || '').slice(0, 2000),
        filename: (event?.filename || '').slice(0, 200),
        lineno: event?.lineno || null,
        colno: event?.colno || null,
      });
    }

    function onRejection(event) {
      const r = event?.reason;
      send('window.unhandledRejection', {
        message: typeof r === 'string'
          ? r.slice(0, 500)
          : (r?.message || '').slice(0, 500),
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
