import { createNeonAuth } from '@neondatabase/auth/next/server';

function resolveNeonAuthCookieSecret(): string {
  const raw = (process.env.NEON_AUTH_COOKIE_SECRET || '').trim();
  if (raw.length >= 32 && !raw.includes('[SENSITIVE]')) return raw;
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    return 'medipick-next-build-placeholder-secret-32ch';
  }
  if (process.env.VERCEL === '1' && process.env.NODE_ENV === 'production') {
    throw new Error(
      'NEON_AUTH_COOKIE_SECRET must be at least 32 characters on Vercel. Use: openssl rand -base64 32',
    );
  }
  return 'medipick-local-only-neon-auth-cookie-secret-32b';
}

export const auth = createNeonAuth({
  baseUrl: process.env.NEON_AUTH_BASE_URL!,
  cookies: {
    secret: resolveNeonAuthCookieSecret(),
  },
});
