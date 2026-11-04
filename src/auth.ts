import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

/**
 * Auth.js (NextAuth v5) configuration.
 *
 * Google is the only sign-in provider. Sessions are JWT-based (no database
 * adapter needed): we only need a stable user id, which we derive from the
 * Google account and expose on the session. All secrets come from env:
 *   AUTH_SECRET, AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET, AUTH_URL.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, profile }) {
      // Persist a stable, provider-scoped user id on first sign-in.
      if (profile?.sub) {
        token.userId = profile.sub;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.userId && session.user) {
        // Expose the stable id so server code can scope data to this user.
        (session.user as { id?: string }).id = token.userId as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/", // The landing page hosts the sign-in button.
  },
});
