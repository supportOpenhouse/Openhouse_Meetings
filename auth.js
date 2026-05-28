import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { OAuth2Client } from 'google-auth-library';
import { authConfig } from '@/auth.config';

// Node-runtime NextAuth instance. Used by the API route handlers + server
// actions. Adds the Credentials provider that verifies Google ID tokens
// from the Capacitor Android app via google-auth-library (Node-only, so
// it can't live in auth.config.js which is shared with edge middleware).
const googleTokenVerifier = new OAuth2Client();

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    ...authConfig.providers,
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
});
