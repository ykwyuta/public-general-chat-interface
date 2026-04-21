import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';

const allowedDomains = process.env.GOOGLE_ALLOWED_DOMAINS
  ? process.env.GOOGLE_ALLOWED_DOMAINS.split(',').map((d) => d.trim())
  : [];

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ profile }) {
      if (allowedDomains.length === 0) return true;
      const email = profile?.email ?? '';
      const domain = email.split('@')[1];
      return allowedDomains.includes(domain);
    },
  },
  pages: {
    error: '/auth/error',
  },
});
