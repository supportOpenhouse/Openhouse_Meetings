'use client';

// Rendered inside the authed shells (which have the session user) to tie the
// browser to the signed-in person in PostHog. Returns nothing.
import { useEffect } from 'react';
import { identify } from '@/lib/track';

export default function AnalyticsIdentify({ user }) {
  useEffect(() => {
    if (user?.id) identify(user);
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
