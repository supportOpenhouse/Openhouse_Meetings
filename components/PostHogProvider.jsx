'use client';

// Initializes PostHog in the browser and captures pageviews on App-Router
// client navigation (autocapture only fires the first one). Zero-config: with
// no NEXT_PUBLIC_POSTHOG_KEY it renders children untouched, so nothing breaks
// and there's no setup beyond dropping the key in the env.
import posthog from 'posthog-js';
import { PostHogProvider as PHProvider, usePostHog } from 'posthog-js/react';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';

export default function PostHogProvider({ children }) {
  useEffect(() => {
    if (!KEY || typeof window === 'undefined' || posthog.__loaded) return;
    posthog.init(KEY, {
      api_host: HOST,
      capture_pageview: false, // captured manually below so SPA nav is tracked
      capture_pageleave: true,
      autocapture: true, // automatic clicks / inputs / form submits
      person_profiles: 'identified_only',
    });
  }, []);

  if (!KEY) return children;

  return (
    <PHProvider client={posthog}>
      <Suspense fallback={null}>
        <PostHogPageView />
      </Suspense>
      {children}
    </PHProvider>
  );
}

function PostHogPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const client = usePostHog();

  useEffect(() => {
    if (!pathname || !client) return;
    let url = window.origin + pathname;
    const qs = searchParams?.toString();
    if (qs) url += `?${qs}`;
    client.capture('$pageview', { $current_url: url });
  }, [pathname, searchParams, client]);

  return null;
}
