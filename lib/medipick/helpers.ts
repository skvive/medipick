import { createHmac, createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export function medipickSecret(): Buffer {
  return Buffer.from(process.env.MEDIPICK_SECRET || 'dev-only-change-me', 'utf8');
}

export function field(v: unknown, name: string, maxLen: number, required = false, pattern?: RegExp): string {
  const s = String(v ?? '').trim();
  if (s.length > maxLen || (required && !s)) throw new Error(`${name} 길이 또는 필수값 오류`);
  if (pattern && s && !pattern.test(s)) throw new Error(`${name} 형식 오류`);
  return s;
}

export function validUrl(v: unknown, maxLen = 1000): string {
  const s = field(v, 'URL', maxLen);
  if (!s) return '';
  if (!/^https:\/\/[A-Za-z0-9.-]+(?::443)?(?:\/[^\s]*)?$/.test(s)) throw new Error('URL은 https:// 로 시작해야 합니다');
  return s;
}

export function tokenDigest(prefix: string, token: string): string {
  return createHmac('sha256', medipickSecret()).update(token).digest('hex');
}

export function sha256Hex(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export function adminHeaderOk(headers: Headers | null, method: string): boolean {
  if (method !== 'POST') return true;
  return headers?.get('x-medipick-admin') === '1';
}

export function parseBearerAuth(header: string | null, prefix: string): string | null {
  if (!header?.startsWith(`Bearer ${prefix}`) || header.length > 180) return null;
  return header.slice(7);
}

export function issueClinicKey(providerId: number, label: string, permission: string) {
  if (!['schedule_read', 'schedule_manage'].includes(permission)) throw new Error('권한이 유효하지 않습니다');
  const token = `mpclinic_${randomBytes(24).toString('base64url')}`;
  const digest = tokenDigest('clinic', token);
  const expires = new Date(Date.now() + 30 * 86400000).toISOString();
  return { token, digest, expires, permission, label: (label || '예약 담당자').slice(0, 80) };
}

export function issueDoctorKey(label: string) {
  const token = `mpdoc_${randomBytes(27).toString('base64url')}`;
  const digest = tokenDigest('doctor', token);
  const expires = new Date(Date.now() + 90 * 86400000).toISOString();
  return { token, digest, expires, label: (label || '병원 재무담당자').slice(0, 80) };
}

export function issueAdvertiserKey() {
  const token = `mpad_${randomBytes(24).toString('base64url')}`;
  const digest = sha256Hex(token);
  const expires = new Date(Date.now() + 30 * 86400000).toISOString();
  return { token, digest, expires };
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a, 'utf8');
  const y = Buffer.from(b, 'utf8');
  if (x.length !== y.length) return false;
  return timingSafeEqual(x, y);
}
