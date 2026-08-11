'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { getMicStatus } from '@/lib/micRecorder';
import { getRecordingSession, clearRecordingSession } from '@/lib/recordingSession';

// Global navigation guard for the Capacitor Android app. Whenever the user
// lands on a page while a native recording is in progress (or paused), they get
// punted back to the recorder that owns it — the demand /new-meeting flow OR a
// supply /supply/visits/new visit — so they can pause, finalize, or discard it.
// The owning recorder is recorded in the session's `returnPath`. Without this,
// navigating away orphaned the recording (it kept running in the foreground
// service with no UI to control it) and the recording was lost.
//
// Rendered from both shells (AppShell + SalesShell). usePathname makes it
// re-check on every client-side navigation.
export default function RecordingGuard() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    // Never hijack the auth flow.
    if (pathname?.startsWith('/login')) return;

    let cancelled = false;
    (async () => {
      const status = await getMicStatus();
      if (cancelled) return;
      if (status === 'recording' || status === 'paused') {
        const sess = getRecordingSession();
        const dest = sess?.returnPath || '/new-meeting';
        // Don't redirect if they're already on the owning recorder page.
        if (pathname !== dest.split('?')[0]) router.replace(dest);
      } else if (getRecordingSession()) {
        // Native says idle but a session is sticking around — most likely
        // the app was force-quit mid-recording. Clear so we don't loop.
        clearRecordingSession();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  return null;
}
