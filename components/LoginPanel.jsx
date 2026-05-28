'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { Capacitor } from '@capacitor/core';

// Single sign-in entry point that branches at runtime:
//   - In the browser: standard NextAuth Google OAuth redirect.
//   - In the Capacitor Android app: native Google Sign-In via Google Play
//     Services (avoids the WebView "disallowed_useragent" block), gets an
//     ID token, and submits it to the `google-native` Credentials provider
//     in auth.js which verifies + issues the session cookie.
export default function LoginPanel({ webClientId }) {
  const router = useRouter();
  const [isNative, setIsNative] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    setMounted(true);
    try {
      setIsNative(Capacitor.isNativePlatform());
    } catch {}
  }, []);

  useEffect(() => {
    if (!isNative) return;
    let cancelled = false;
    (async () => {
      try {
        const { GoogleAuth } = await import('@codetrix-studio/capacitor-google-auth');
        if (cancelled) return;
        await GoogleAuth.initialize({
          clientId: webClientId,
          scopes: ['profile', 'email'],
          grantOfflineAccess: false,
        });
      } catch (e) {
        if (!cancelled) setErr('Native sign-in failed to initialize.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isNative, webClientId]);

  const handleWeb = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      await signIn('google', { callbackUrl: '/' });
    } catch {
      setBusy(false);
      setErr('Sign-in failed. Please try again.');
    }
  }, []);

  const handleNative = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      const { GoogleAuth } = await import('@codetrix-studio/capacitor-google-auth');
      const result = await GoogleAuth.signIn();
      const idToken = result?.authentication?.idToken;
      if (!idToken) throw new Error('No ID token from Google');
      const res = await signIn('google-native', { idToken, redirect: false });
      if (res?.error) {
        if (res.error === 'CredentialsSignin') {
          setErr("This email isn't registered. Ask an admin to add you first.");
        } else {
          setErr('Sign-in failed. Please try again.');
        }
        setBusy(false);
        return;
      }
      router.push('/');
      router.refresh();
    } catch (e) {
      const msg = String(e?.message || e || '');
      // User cancellation from the native picker comes back as various
      // strings depending on Google Play Services version — silence those.
      if (/cancel/i.test(msg) || /12501/.test(msg)) {
        setBusy(false);
        return;
      }
      setErr('Sign-in failed. Please try again.');
      setBusy(false);
    }
  }, [router]);

  // Pre-mount: render the same web button server-side rendered so there's
  // no layout flash. After mount, swap if we're in the native app.
  const onClick = mounted && isNative ? handleNative : handleWeb;

  return (
    <>
      {err && (
        <div
          style={{
            background: 'var(--danger-soft)',
            color: 'var(--danger)',
            padding: '10px 14px',
            borderRadius: 8,
            fontSize: 13,
            marginBottom: 18,
          }}
        >
          {err}
        </div>
      )}
      <button
        type="button"
        className="oh-google-btn"
        onClick={onClick}
        disabled={busy}
      >
        <GoogleIcon />
        {busy ? 'Signing in…' : 'Continue with Google'}
      </button>
    </>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
        fill="#34A853"
      />
      <path
        d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.167 6.656 3.58 9 3.58z"
        fill="#EA4335"
      />
    </svg>
  );
}
