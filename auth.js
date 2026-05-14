import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import { db } from '@/lib/db';
import { users } from '@/drizzle/schema';
import { eq } from 'drizzle-orm';

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
});
