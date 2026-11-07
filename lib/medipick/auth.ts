import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const SESSION_MAX_AGE = 8 * 3600;

// Never mint or validate a privileged admin session with sample/default secrets.
// Both values must be provided explicitly in every deployed environment.
function secret(): Buffer | null {
  const configured = process.env.MEDIPICK_SECRET;
  return configured ? Buffer.from(configured, 'utf8') : null;
}

export function passwordOk(candidate: string): boolean {
  const expected = process.env.MEDIPICK_ADMIN_PASSWORD;
  if (!expected || !secret()) return false;
  const actualBytes = Buffer.from(candidate, 'utf8');
  const expectedBytes = Buffer.from(expected, 'utf8');
  if (actualBytes.length !== expectedBytes.length) return false;
  return timingSafeEqual(actualBytes, expectedBytes);
}

export function makeSession(): string {
  const key = secret();
  if (!key) throw new Error('MEDIPICK 관리자 서명 키가 설정되지 않았습니다.');
  const ts = String(Math.floor(Date.now() / 1000));
  const nonce = randomBytes(14).toString('hex');
  const payload = `${ts}.${nonce}`;
  const sig = createHmac('sha256', key).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

export function sessionOk(cookie: string | null): boolean {
  if (!cookie) return false;
  const key = secret();
  if (!key) return false;
  const match = cookie.match(/(?:^|;\s*)medipick_admin=([^;]+)/);
  if (!match) return false;
  try {
    const parts = match[1].split('.');
    if (parts.length !== 3) return false;
    const [ts, nonce, signature] = parts;
    if (!/^\d+$/.test(ts) || !/^[0-9a-f]{28}$/.test(nonce) || !/^[0-9a-f]{64}$/.test(signature)) return false;
    const payload = `${ts}.${nonce}`;
    const expected = createHmac('sha256', key).update(payload).digest('hex');
    const actualBytes = Buffer.from(signature, 'utf8');
    const expectedBytes = Buffer.from(expected, 'utf8');
    if (actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes)) return false;
    const age = Date.now() / 1000 - Number(ts);
    return Number.isFinite(age) && age >= 0 && age <= SESSION_MAX_AGE;
  } catch {
    return false;
  }
}

function cookieSecurity(): string {
  return process.env.NODE_ENV === 'production' || process.env.MEDIPICK_COOKIE_SECURE === '1' ? '; Secure' : '';
}

export function sessionCookie(value: string, maxAge = SESSION_MAX_AGE): string {
  return `medipick_admin=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${cookieSecurity()}`;
}

export function clearSessionCookie(): string {
  return `medipick_admin=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${cookieSecurity()}`;
}
