import { auth } from '@/lib/auth/server';
import type { NextRequest } from 'next/server';

export const runtime = 'nodejs';

const handlers = auth.handler();
export const GET = handlers.GET;

// The public MediPick auth proxy accepts Google OAuth as its only sign-in method.
// The upstream Neon tenant can have other methods enabled; these are separately
// controlled in Neon Console and should not be confused with this proxy policy.
export async function POST(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (/\/api\/auth\/(?:sign-in\/email|sign-up\/email|forget-password|reset-password)(?:\/|$)/.test(path)) {
    return Response.json({ error: '메디픽은 Google 계정으로만 로그인할 수 있습니다.' },
      { status: 403, headers: { 'Cache-Control': 'no-store' } });
  }
  if (/\/api\/auth\/sign-in\/social(?:\/|$)/.test(path)) {
    let data: { provider?: unknown } | null = null;
    try { data = await request.clone().json(); } catch {
      return Response.json({ error: '올바른 Google 로그인 요청이 아닙니다.' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } });
    }
    if (data?.provider !== 'google') {
      return Response.json({ error: '메디픽은 Google 로그인을 사용합니다.' },
        { status: 403, headers: { 'Cache-Control': 'no-store' } });
    }
  }
  return handlers.POST(request);
}
