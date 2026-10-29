import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const SESSION_MAX_AGE = 8 * 3600;

function secret(): Buffer {
  const s = process.env.MEDIPICK_SECRET || 'dev-only-change-me';
  return Buffer.from(s, 'utf8');
}

export function passwordOk(candidate: string): boolean {
  const expected = process.env.MEDIPICK_ADMIN_PASSWORD || 'medipick-demo-2026';
  const a = Buffer.from(candidate, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function makeSession(): string {
  const ts = String(Math.floor(Date.now() / 1000));
  const nonce = randomBytes(14).toString('hex');
  const payload = `${ts}.${nonce}`;
  const sig = createHmac('sha256', secret()).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

export function sessionOk(cookie: string | null): boolean {
  if (!cookie) return false;
  const m = cookie.match(/(?:^|;\s*)medipick_admin=([^;]+)/);
  if (!m) return false;
  try {
    const [ts, nonce, signature] = m[1].split('.');
    const payload = `${ts}.${nonce}`;
    const expected = createHmac('sha256', secret()).update(payload).digest('hex');
    const a = Buffer.from(signature, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
    const age = Date.now() / 1000 - Number(ts);
    return age >= 0 && age <= SESSION_MAX_AGE;
  } catch {
    return false;
  }
}

export function sessionCookie(value: string, maxAge = SESSION_MAX_AGE): string {
  const secure = process.env.MEDIPICK_COOKIE_SECURE === '1' ? '; Secure' : '';
  return `medipick_admin=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

export function clearSessionCookie(): string {
  return 'medipick_admin=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0';
}
