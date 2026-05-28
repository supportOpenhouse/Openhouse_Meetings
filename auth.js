import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import Credentials from 'next-auth/providers/credentials';
import { OAuth2Client } from 'google-auth-library';
import { db } from '@/lib/db';
import { users } from '@/drizzle/schema';
import { eq } from 'drizzle-orm';
import { logActivity } from '@/lib/activityLog';

const googleTokenVerifier = new OAuth2Client();

const adminEmails = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
    // Used by the Capacitor Android app. Google blocks the standard OAuth
    // redirect inside WebViews ("disallowed_useragent"), so the app does
    // native sign-in via @codetrix-studio/capacitor-google-auth and POSTs
    // the resulting ID token here. We verify the signature with Google's
    // public keys + check audience = our Web Client ID, then fall through
    // to the same signIn callback as the web Google provider.
    Credentials({
      id: 'google-native',
      name: 'Google (native)',
      credentials: { idToken: { type: 'text' } },
      async authorize(creds) {
        const idToken = creds?.idToken;
        if (!idToken || typeof idToken !== 'string') return null;
        try {
          const ticket = await googleTokenVerifier.verifyIdToken({
            idToken,
            audience: process.env.GOOGLE_CLIENT_ID,
          });
          const payload = ticket.getPayload();
          if (!payload?.email || !payload.email_verified) return null;
          return {
            email: payload.email,
            name: payload.name || null,
            image: payload.picture || null,
          };
        } catch (e) {
          console.error('[auth google-native] verify failed', e?.message);
          return null;
        }
      },
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
      }
      return token;
    },
    async session({ session, token }) {
      if (token?.id) session.user.id = token.id;
      if (token?.role) session.user.role = token.role;
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
});
