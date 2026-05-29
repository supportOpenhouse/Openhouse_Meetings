'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { getMicStatus } from '@/lib/micRecorder';
import { getRecordingSession, clearRecordingSession } from '@/lib/recordingSession';

// Global navigation guard for the Capacitor Android app. Whenever the user
// lands on any page other than /new-meeting, this checks the native
// MicRecorder status. If a recording is in progress (or paused), they get
// punted back to /new-meeting so they can pause, finalize, or discard it.
// Without this, navigating away orphaned the recording — it kept running
// in the foreground service with no UI to control it.
//
// Rendered once from AppShell (which wraps every authenticated page). The
// usePathname dep makes it re-check on every client-side navigation.
export default function RecordingGuard() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    // Don't redirect from /new-meeting itself (that's where we want them)
    // or from /login (auth flow shouldn't get hijacked).
    if (pathname === '/new-meeting' || pathname?.startsWith('/login')) return;

    let cancelled = false;
    (async () => {
      const status = await getMicStatus();
      if (cancelled) return;
      if (status === 'recording' || status === 'paused') {
        router.replace('/new-meeting');
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
