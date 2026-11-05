import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const SESSION_MAX_AGE = 8 * 3600;
const DEVELOPMENT_SESSION_SECRET = 'dev-only-change-me';
const DEVELOPMENT_ADMIN_PASSWORD = 'medipick-demo-2026';
const isProduction = process.env.NODE_ENV === 'production';

function secret(): Buffer {
  const configured = (process.env.MEDIPICK_SECRET || '').trim();
  if (configured && configured !== DEVELOPMENT_SESSION_SECRET) {
    return Buffer.from(configured, 'utf8');
  }
  if (isProduction) {
    throw new Error('MEDIPICK_SECRET must be configured with a unique value in production.');
  }
  return Buffer.from(configured || DEVELOPMENT_SESSION_SECRET, 'utf8');
}

function adminPassword(): string | null {
  const configured = (process.env.MEDIPICK_ADMIN_PASSWORD || '').trim();
  if (configured && configured !== DEVELOPMENT_ADMIN_PASSWORD) return configured;
  if (isProduction) return null;
  return configured || DEVELOPMENT_ADMIN_PASSWORD;
}

export function passwordOk(candidate: string): boolean {
  const expected = adminPassword();
  if (!expected) return false;
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
    if (!ts || !nonce || !signature) return false;
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

function secureCookieSuffix(): string {
  return isProduction || process.env.MEDIPICK_COOKIE_SECURE === '1' ? '; Secure' : '';
}

export function sessionCookie(value: string, maxAge = SESSION_MAX_AGE): string {
  return `medipick_admin=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secureCookieSuffix()}`;
}

export function clearSessionCookie(): string {
  return `medipick_admin=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secureCookieSuffix()}`;
}
