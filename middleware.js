import NextAuth from 'next-auth';
import { authConfig } from '@/auth.config';
import { NextResponse } from 'next/server';

// Middleware runs in the Edge runtime, so it can only use the edge-safe
// config (no `google-auth-library`, which is Node-only). The full auth
// instance with the Credentials provider lives in `auth.js` for API routes.
const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { nextUrl } = req;
  const isLoggedIn = !!req.auth;
  const pathname = nextUrl.pathname;

  const isAuthRoute = pathname === '/login';
  const isApiAuthRoute = pathname.startsWith('/api/auth');
  // The Salestrail sync route authorizes itself (Bearer CRON_SECRET for the
  // cron, admin session for the manual button) — let it through untouched so
  // the tokenless cron request isn't redirected to /login.
  const isSalestrailRoute = pathname.startsWith('/api/salestrail');
  const isPublicAsset =
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname === '/';

  if (isApiAuthRoute || isSalestrailRoute || isPublicAsset) return NextResponse.next();

  if (isAuthRoute) {
    if (isLoggedIn) {
      const role = req.auth?.user?.role;
      const dest = role === 'admin' ? '/admin' : '/dashboard';
      return NextResponse.redirect(new URL(dest, nextUrl));
    }
    return NextResponse.next();
  }

  if (!isLoggedIn) {
    return NextResponse.redirect(new URL('/login', nextUrl));
  }

  // Admin-only routes
  if (pathname.startsWith('/admin') || pathname.startsWith('/api/admin') || pathname.startsWith('/api/rms')) {
    if (req.auth?.user?.role !== 'admin') {
      return NextResponse.redirect(new URL('/dashboard', nextUrl));
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
