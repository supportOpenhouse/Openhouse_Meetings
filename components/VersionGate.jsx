'use client';

import { useEffect } from 'react';

// The build id baked into THIS client bundle (set in next.config.mjs `env`).
const CLIENT_BUILD = process.env.NEXT_PUBLIC_BUILD_ID || 'dev';

// Android WebViews (the APK) cache the JS bundle aggressively, so after a deploy
// users keep running stale code — and stale bugs — until the cache expires. On
// load and whenever the app returns to the foreground, compare our build id with
// the live server's; if a newer deploy is out, reload once to pull the fresh JS.
export default function VersionGate() {
  useEffect(() => {
    if (CLIENT_BUILD === 'dev') return; // no-op in local dev
    let stopped = false;

    async function check() {
      try {
        const res = await fetch('/api/version', { cache: 'no-store' });
        if (!res.ok) return;
        const { buildId } = await res.json();
        if (stopped || !buildId || buildId === CLIENT_BUILD) return;

        // New deploy detected. Reload once per build id — the sessionStorage
        // guard prevents an infinite loop if the document itself is still served
        // stale (worst case the user stays on old code, but never loops).
        const KEY = 'oh_reloaded_for_build';
        if (sessionStorage.getItem(KEY) === buildId) return;
        sessionStorage.setItem(KEY, buildId);
        window.location.reload();
      } catch {
        /* offline / transient — try again on next foreground */
      }
    }

    check();
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return null;
}
