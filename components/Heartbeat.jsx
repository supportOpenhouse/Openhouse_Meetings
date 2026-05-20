'use client';

import { useEffect } from 'react';

// Posts a tiny "I'm still here" ping to /api/heartbeat every 60s while the tab
// is visible. Powers the admin "online now" panel via users.last_seen_at.
// Fires once immediately on mount so a fresh navigation shows up right away.
// No retries, no console noise — telemetry must never break the UI.
const INTERVAL_MS = 60_000;

export default function Heartbeat() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let timer = null;

    function ping() {
      if (document.visibilityState !== 'visible') return;
      try {
        fetch('/api/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          keepalive: true,
        }).catch(() => {});
      } catch {}
    }

    ping();
    timer = setInterval(ping, INTERVAL_MS);

    // Ping again when the tab returns to the foreground so admins see the
    // user blink back to "online" immediately.
    function onVis() {
      if (document.visibilityState === 'visible') ping();
    }
    document.addEventListener('visibilitychange', onVis);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  return null;
}
