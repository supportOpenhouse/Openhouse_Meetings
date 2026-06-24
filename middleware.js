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

  // Where each role lands after login / when bounced off a forbidden page.
  const homeFor = (role) =>
    role === 'admin' ? '/admin' : role === 'supply_rm' ? '/supply' : '/dashboard';

  if (isAuthRoute) {
    if (isLoggedIn) {
      return NextResponse.redirect(new URL(homeFor(req.auth?.user?.role), nextUrl));
    }
    return NextResponse.next();
  }

  if (!isLoggedIn) {
    return NextResponse.redirect(new URL('/login', nextUrl));
  }

  const role = req.auth?.user?.role;

  // Admin-only routes
  if (pathname.startsWith('/admin') || pathname.startsWith('/api/admin') || pathname.startsWith('/api/rms')) {
    if (role !== 'admin') {
      return NextResponse.redirect(new URL(homeFor(role), nextUrl));
    }
  }

  // Sales RM area — only sales reps (and admins, for oversight) may enter.
  if (pathname.startsWith('/supply') || pathname.startsWith('/api/supply')) {
    if (role !== 'supply_rm' && role !== 'admin') {
      return NextResponse.redirect(new URL(homeFor(role), nextUrl));
    }
  }

  // Keep sales reps out of the demand/direct recording app entirely — their
  // whole experience lives under /supply.
  if (role === 'supply_rm') {
    const recordingPages = ['/dashboard', '/new-meeting', '/direct', '/upload-recording'];
    if (recordingPages.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
      return NextResponse.redirect(new URL('/supply', nextUrl));
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
