import { auth } from '@/lib/auth/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const sessionHeaders = {
  'Cache-Control': 'private, no-store, max-age=0',
  'Vary': 'Cookie',
  'X-Content-Type-Options': 'nosniff',
};

export async function GET() {
  try {
    const { data: session, error } = await auth.getSession();
    if (error) {
      return Response.json({ authenticated: false, status: 'unavailable' }, {
        status: 503, headers: sessionHeaders,
      });
    }
    const user = session?.user;
    if (!user) {
      return Response.json({ authenticated: false }, { headers: sessionHeaders });
    }
    return Response.json({
      authenticated: true,
      user: {
        name: String(user.name || '메디픽 이용자').slice(0, 120),
        email: String(user.email || '').slice(0, 180),
      },
      accountUrl: '/account',
      status: 'verified_neon_session',
    }, { headers: sessionHeaders });
  } catch {
    return Response.json({ authenticated: false, status: 'unavailable' }, {
      status: 503, headers: sessionHeaders,
    });
  }
}
