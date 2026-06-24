import Google from 'next-auth/providers/google';
import { db } from '@/lib/db';
import { users } from '@/drizzle/schema';
import { eq } from 'drizzle-orm';
import { logActivity } from '@/lib/activityLog';

// Edge-safe shared NextAuth config. Lives in its own file because
// `middleware.js` runs in the Edge runtime and can't pull in Node-only
// dependencies (e.g. `google-auth-library`, which `auth.js` adds on top
// for the native Credentials provider). All imports here must be
// edge-compatible: Neon HTTP driver + drizzle-orm both are.

const adminEmails = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

// On Vercel PREVIEW deployments (e.g. the `staging` branch) force the NextAuth
// base URL to the preview's OWN stable branch alias. Without this, an AUTH_URL
// copied from Production makes the Google OAuth redirect_uri — and therefore the
// session — land on production after login (the classic "logged in on staging,
// bounced to prod" bug). Production is untouched: there VERCEL_ENV is
// 'production', so this block is skipped. VERCEL_BRANCH_URL is the stable
// `<project>-git-<branch>-<scope>.vercel.app` alias — the one you register in
// the Google OAuth redirect URIs. Wrapped in try/catch because the shared edge
// middleware also imports this module.
try {
  if (process.env.VERCEL_ENV === 'preview' && process.env.VERCEL_BRANCH_URL) {
    process.env.AUTH_URL = `https://${process.env.VERCEL_BRANCH_URL}`;
  }
} catch {
  // edge runtime may disallow writing process.env — the Node auth handlers
  // (which actually build the OAuth redirect) will still apply it.
}

export const authConfig = {
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  pages: {
    signIn: '/login',
    error: '/login',
  },
  session: { strategy: 'jwt' },
  trustHost: true,
  callbacks: {
    async signIn({ user }) {
      const email = user.email?.toLowerCase();
      if (!email) return false;

      const [existing] = await db.select().from(users).where(eq(users.email, email));

      if (existing) {
        if (!existing.is_active) return false;
        // Refresh name/image from Google profile
        if (existing.name !== user.name || existing.image !== user.image) {
          await db
            .update(users)
            .set({ name: user.name, image: user.image })
            .where(eq(users.id, existing.id));
        }
        return true;
      }

      // Auto-provision admin if email is in ADMIN_EMAILS
      if (adminEmails.includes(email)) {
        await db.insert(users).values({
          email,
          name: user.name,
          image: user.image,
          role: 'admin',
          is_active: true,
        });
        return true;
      }

      // Not invited
      return '/login?error=not_invited';
    },
    async jwt({ token }) {
      const email = token.email?.toLowerCase();
      if (!email) return token;

      // Re-fetch on each token refresh so role changes propagate
      const [u] = await db.select().from(users).where(eq(users.email, email));
      if (u) {
        token.id = u.id;
        token.role = u.role;
        token.is_active = u.is_active;
        token.smid = u.smid ?? null;
      }
      return token;
    },
    async session({ session, token }) {
      if (token?.id) session.user.id = token.id;
      if (token?.role) session.user.role = token.role;
      // Exposed to the broker-registration route, which prefers the rep's own
      // Core sales_manager_id over the configured default.
      if (token?.smid != null) session.user.salesManagerId = token.smid;
      return session;
    },
  },
  events: {
    // NextAuth events fire AFTER the callback flow so we have the resolved
    // user. We re-fetch by email because the `user` passed in is the raw
    // Google profile (no id).
    async signIn({ user }) {
      try {
        const email = user?.email?.toLowerCase();
        if (!email) return;
        const [u] = await db.select().from(users).where(eq(users.email, email));
        if (!u) return;
        await logActivity({
          userId: u.id,
          eventType: 'auth.login',
          payload: { email: u.email, role: u.role },
        });
      } catch (e) {
        console.error('[auth events.signIn] log failed', e?.message);
      }
    },
    async signOut({ token }) {
      try {
        if (!token?.id) return;
        await logActivity({
          userId: token.id,
          eventType: 'auth.logout',
          payload: { email: token.email || null },
        });
      } catch (e) {
        console.error('[auth events.signOut] log failed', e?.message);
      }
    },
  },
};
