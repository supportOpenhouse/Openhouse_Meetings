// Server-side analytics for the valuable backend events (visit lifecycle, AI
// pipeline outcomes, inventory). Uses posthog-node. Shares the same public key
// as the browser SDK, so configuring PostHog is a single env var. No-ops when
// the key is absent, and never throws into the request path.
import { PostHog } from 'posthog-node';

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY || process.env.POSTHOG_KEY;
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';

export function isAnalyticsConfigured() {
  return !!KEY;
}

// Capture a server event for a given user. Creates a short-lived client and
// flushes immediately so it works in serverless (Vercel) where the process
// freezes between requests. `distinctId` should be the user's id so server
// events line up with the same person as client events.
export async function captureServer(distinctId, event, properties = {}) {
  if (!KEY) return;
  const client = new PostHog(KEY, { host: HOST, flushAt: 1, flushInterval: 0 });
  try {
    client.capture({
      distinctId: distinctId || 'server',
      event,
      properties: { source: 'server', ...properties },
    });
    await client.shutdown();
  } catch {
    /* analytics must never break the request */
  }
}
