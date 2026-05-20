// Fire-and-forget client-side activity log poster. Failures are swallowed —
// telemetry must never break the user flow. Uses `keepalive: true` so events
// survive a navigation away from the page (important for upload.* events
// that fire just before the redirect to /dashboard).

export function logEvent(event_type, { meeting_id, cp_code, payload } = {}) {
  if (typeof window === 'undefined') return;
  try {
    fetch('/api/logs/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_type, meeting_id, cp_code, payload }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Network errors / blocked fetch → drop the event.
  }
}
