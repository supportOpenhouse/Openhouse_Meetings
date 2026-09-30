'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { getMicStatus } from '@/lib/micRecorder';
import { getRecordingSession, setRecordingSession, clearRecordingSession } from '@/lib/recordingSession';
import { findRecoverableRecording } from '@/lib/recordingRecovery';
import { logEvent } from '@/lib/clientLog';

// Global navigation guard for the Capacitor Android app. Whenever the user
// lands on a page while a native recording is in progress (or paused), they get
// punted back to the recorder that owns it — the demand /new-meeting flow OR a
// supply /supply/visits/new visit — so they can pause, finalize, or discard it.
// The owning recorder is recorded in the session's `returnPath`. Without this,
// navigating away orphaned the recording (it kept running in the foreground
// service with no UI to control it) and the recording was lost.
//
// If the app was KILLED mid-recording (native says idle but the session is
// still there), the recorder's file usually survives in app cache. Then we
// keep the session and send the user to the owning page, which offers
// "Recover previous recording". Only when no file survived is the session
// dropped (and logged as recording.lost).
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
        // Native says idle but a session is sticking around — the app was
        // killed or force-quit mid-recording.
        const sess = getRecordingSession();
        const found = await findRecoverableRecording();
        if (cancelled) return;
        if (found) {
          if (!sess.orphanLogged) {
            setRecordingSession({ ...sess, orphanLogged: true });
            logEvent('recording.orphan_found', {
              cp_code: sess.form?.cp_code || sess.cp?.cp_id || undefined,
              payload: {
                flow: sess.flow || 'demand',
                step: sess.step || null,
                audio_seconds: found.orphan.durationSec ?? null,
                size_bytes: found.orphan.sizeBytes ?? null,
                // How long before the relaunch the file stopped growing.
                stopped_ago_seconds: found.orphan.lastModifiedMs
                  ? Math.round((Date.now() - found.orphan.lastModifiedMs) / 1000)
                  : null,
              },
            });
          }
          const dest = sess.returnPath || '/new-meeting';
          if (pathname !== dest.split('?')[0]) router.replace(dest);
          return;
        }
        // Only count it as lost if the mic actually started (not just the
        // record screen opened), and it wasn't already handed to the upload
        // flow ('finalized'), which owns the audio from there.
        if (sess.micStarted && sess.step !== 'finalized') {
          logEvent('recording.lost', {
            cp_code: sess.form?.cp_code || sess.cp?.cp_id || undefined,
            payload: {
              flow: sess.flow || 'demand',
              step: sess.step || null,
              session_age_seconds: sess.startedAtMs
                ? Math.round((Date.now() - sess.startedAtMs) / 1000)
                : null,
            },
          });
        }
        clearRecordingSession();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  return null;
}
