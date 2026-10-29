import { handleMedipickRequest } from '@/lib/medipick/handler';

type Ctx = { params: Promise<{ path?: string[] }> };

async function pathFrom(ctx: Ctx) {
  const { path = [] } = await ctx.params;
  return '/api/' + path.join('/');
}

export async function GET(req: Request, ctx: Ctx) {
  const url = new URL(req.url);
  return handleMedipickRequest('GET', await pathFrom(ctx), url.searchParams, null, req.headers.get('cookie'));
}

export async function POST(req: Request, ctx: Ctx) {
  const url = new URL(req.url);
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }
  return handleMedipickRequest('POST', await pathFrom(ctx), url.searchParams, body, req.headers.get('cookie'));
}
