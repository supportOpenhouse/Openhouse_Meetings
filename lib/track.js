// Client-side product analytics around posthog-js. (Note: lib/analytics.js is a
// separate, pre-existing SQL-metrics module — this file is the event tracker.)
// Every call is guarded so analytics can NEVER break the UI, and the whole
// thing no-ops when PostHog isn't configured (no NEXT_PUBLIC_POSTHOG_KEY).
import posthog from 'posthog-js';

function ready() {
  return typeof window !== 'undefined' && posthog && posthog.__loaded;
}

// Fire a named product event, e.g. track('clock_in', { source: 'map' }).
export function track(event, properties = {}) {
  try {
    if (ready()) posthog.capture(event, properties);
  } catch {
    /* swallow — analytics must never throw into the UI */
  }
}

// Tie the browser to the signed-in user so events are attributed to a person.
export function identify(user) {
  try {
    if (ready() && user?.id) {
      posthog.identify(user.id, {
        email: user.email,
        name: user.name,
        role: user.role,
      });
    }
  } catch {
    /* ignore */
  }
}

export function resetAnalytics() {
  try {
    if (ready()) posthog.reset();
  } catch {
    /* ignore */
  }
}
