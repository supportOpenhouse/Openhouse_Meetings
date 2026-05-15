'use client';

import { useEffect, useRef } from 'react';

// Polls /api/meetings every 6 seconds whenever any row in the local list is in
// `processing` state. Stops polling automatically once everything has flipped to
// `ready` or `failed`, and on tab unmount. Cheap and self-contained — no global
// state, no router refresh.
export function usePollWhileProcessing(meetings, setMeetings, intervalMs = 6000) {
  // Track the most recent setter so the polling closure always writes into the
  // current component's state, even if React re-creates the setter.
  const setterRef = useRef(setMeetings);
  setterRef.current = setMeetings;

  const anyProcessing = (meetings || []).some((m) => m.status === 'processing');

  useEffect(() => {
    if (!anyProcessing) return;
    let cancelled = false;

    async function tick() {
      try {
        const res = await fetch('/api/meetings');
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        if (Array.isArray(data.meetings)) {
          setterRef.current(data.meetings);
        }
      } catch {
        // Ignore transient network errors; the next tick will retry.
      }
    }

    const id = setInterval(tick, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [anyProcessing, intervalMs]);
}
