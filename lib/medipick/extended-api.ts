import { db, dbQuery } from '@/lib/db';
import { CATEGORIES, nowKst } from '@/lib/medipick/constants';
import { sessionOk } from '@/lib/medipick/auth';
import { isSubscribed, adminSetAppointmentStatus } from '@/lib/medipick/handler-shared';
import {
  adminHeaderOk,
  field,
  issueAdvertiserKey,
  issueClinicKey,
  issueDoctorKey,
  sha256Hex,
  validUrl,
} from '@/lib/medipick/helpers';
import { authenticateClinic, clinicDashboard, clinicSchedule, clinicTransition } from '@/lib/medipick/clinic';
import * as billing from '@/lib/medipick/billing';
import { randomBytes } from 'node:crypto';

type Row = Record<string, unknown>;

function json(data: unknown, init: ResponseInit = {}) {
  return Response.json(data, {
    ...init,
    headers: { 'Cache-Control': 'no-store', ...(init.headers || {}) },
  });
}

function err(msg: string, status = 400) {
  return json({ error: msg }, { status });
}

function requireAdmin(cookie: string | null) {
  if (!sessionOk(cookie)) return err('관리자 로그인 필요', 401);
  return null;
}

function requireAdminPost(cookie: string | null, headers: Headers | null) {
  const auth = requireAdmin(cookie);
  if (auth) return auth;
  if (!adminHeaderOk(headers, 'POST')) return err('관리자 CSRF 헤더 필요', 403);
  return null;
}

export async function adminStats(providerId?: number) {
  const events = await dbQuery<{ kind: string; num: number }>(
    providerId
      ? 'SELECT kind, count(*)::int AS num FROM events WHERE provider_id = $1 GROUP BY kind'
      : 'SELECT kind, count(*)::int AS num FROM events GROUP BY kind',
    providerId ? [providerId] : [],
  );
  const counts: Record<string, number> = {};
  for (const e of events) counts[e.kind] = e.num;
  const bookings = await dbQuery<{ c: number }>(
    providerId ? 'SELECT count(*)::int AS c FROM appointments WHERE provider_id = $1' : 'SELECT count(*)::int AS c FROM appointments',
    providerId ? [providerId] : [],
  );
  const summary = {
    events: counts,
    bookings: bookings[0]?.c ?? 0,
    searches: counts.search || 0,
    views: counts.provider_view || 0,
    ad_impressions: counts.ad_impression || 0,
    ad_clicks: counts.ad_click || 0,
    click_through_rate: Math.round(((counts.ad_click || 0) / Math.max(counts.ad_impression || 0, 1)) * 1000) / 10,
  };
  const by_provider = await dbQuery<Row>(
    `SELECT p.id, p.name,
      count(CASE WHEN e.kind = 'provider_view' THEN 1 END)::int AS views,
      count(CASE WHEN e.kind = 'ad_click' THEN 1 END)::int AS clicks
     FROM providers p LEFT JOIN events e ON e.provider_id = p.id
     GROUP BY p.id ORDER BY views DESC LIMIT 25`,
  );
  const top_queries = await dbQuery<Row>(
    `SELECT query, count(*)::int AS count FROM events WHERE kind = 'search' AND query != '' GROUP BY query ORDER BY count DESC LIMIT 12`,
  );
  return { summary, by_provider, top_queries };
}

function buildIcs(booking: Row, provider: Row): string {
  const start = String(booking.visit_date).replace(/-/g, '') + 'T' + String(booking.visit_time).replace(/:/g, '') + '00';
  const endDate = new Date(`${booking.visit_date}T${booking.visit_time}:00`);
  endDate.setMinutes(endDate.getMinutes() + 30);
  const end = endDate.toISOString().replace(/[-:]/g, '').slice(0, 15);
  const clean = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, ' ').replace(/,/g, '\\,');
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//MEDIPICK//Reservation//KO',
    'BEGIN:VEVENT',
    `UID:${booking.public_id}@medipick.local`,
    `DTSTART;TZID=Asia/Seoul:${start}`,
    `DTEND;TZID=Asia/Seoul:${end}`,
    `SUMMARY:${clean(String(provider.name) + ' 예약 요청 (미확정)')}`,
    'DESCRIPTION:MEDIPICK 예약 요청, 병원 확정 연락 필수',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

export async function handleExtendedRoutes(
  method: string,
  apiPath: string,
  params: URLSearchParams,
  body: unknown,
  cookie: string | null,
  headers: Headers | null,
): Promise<Response | null> {
  const sql = db();

  if (method === 'GET' && apiPath === '/api/doctors') {
    const cat = (params.get('category') || '').slice(0, 40);
    let q = `SELECT d.id, d.provider_id, d.name, d.specialty, d.credentials, d.society, d.verification,
      p.name AS provider_name, p.category FROM doctors d JOIN providers p ON p.id = d.provider_id WHERE p.status = 'active'`;
    const args: unknown[] = [];
    if (cat && cat !== '전체') {
      args.push(cat);
      q += ` AND p.category = $${args.length}`;
    }
    q += ' ORDER BY d.id DESC LIMIT 200';
    const items = await dbQuery<Row>(q, args);
    return json({ items });
  }

  if (method === 'GET' && apiPath === '/api/blog-links') {
    const items = await sql`
      SELECT b.*, d.name AS doctor_name FROM blog_links b
      JOIN doctors d ON d.id = b.doctor_id
      WHERE b.editorial_approved = 1 ORDER BY b.id DESC LIMIT 100
    `;
    return json({ items });
  }

  if (method === 'GET' && apiPath === '/api/advertiser/stats') {
    const bearer = headers?.get('authorization') || '';
    if (!bearer.startsWith('Bearer ') || bearer.length > 150) return err('광고주 액세스 키를 입력하세요', 401);
    const sha = sha256Hex(bearer.slice(7));
    const keys = await sql<Row>`SELECT * FROM advertiser_keys WHERE token_hash = ${sha} AND revoked = 0`;
    const key = keys[0];
    if (!key || new Date(String(key.expires_at)).getTime() < Date.now()) {
      return err('광고주 키가 유효하지 않거나 만료되었습니다', 401);
    }
    const pid = Number(key.provider_id);
    const prov = await sql`SELECT id, name, category, region FROM providers WHERE id = ${pid}`;
    const metrics = await adminStats(pid);
    const daily = await dbQuery<Row>(
      `SELECT substr(created_at::text, 1, 10) AS day, kind, count(*)::int AS count FROM events WHERE provider_id = $1 GROUP BY day, kind ORDER BY day DESC LIMIT 100`,
      [pid],
    );
    return json({
      provider: prov[0],
      metrics: metrics.summary,
      daily,
      expires_at: key.expires_at,
      notice: '집계 수치만 제공하며 환자 개인정보는 제공하지 않습니다.',
    });
  }

  if (method === 'GET' && apiPath === '/api/integrations/status') {
    const denied = requireAdmin(cookie);
    if (denied) return denied;
    const accounts = await sql`SELECT * FROM google_doctor_accounts ORDER BY doctor_id`;
    const orders = await sql`SELECT order_id, provider_id, plan, amount_krw, status, created_at FROM checkout_orders ORDER BY created_at DESC LIMIT 40`;
    return json({
      google_configured: Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID),
      toss_configured: Boolean(process.env.TOSS_SECRET_KEY),
      google_accounts: accounts.map((a) => ({
        doctor_id: a.doctor_id,
        email: a.google_email,
        blogs: JSON.parse(String(a.blog_items || '[]')),
        has_refresh: Boolean(a.refresh_encrypted),
        updated_at: a.updated_at,
      })),
      orders,
      note: '실제 인증·실결제는 사업자 계정 키가 있어야 활성화됩니다.',
    });
  }

  const calMatch = apiPath.match(/^\/api\/admin\/appointments\/(\d+)\/calendar$/);
  if (method === 'GET' && calMatch) {
    const denied = requireAdmin(cookie);
    if (denied) return denied;
    const id = Number(calMatch[1]);
    const appt = await sql<Row>`SELECT * FROM appointments WHERE id = ${id}`;
    if (!appt[0]) return err('예약이 없습니다', 404);
    const prov = await sql<Row>`SELECT * FROM providers WHERE id = ${appt[0].provider_id}`;
    const raw = buildIcs(appt[0], prov[0]);
    return new Response(raw, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'attachment; filename=medipick-appointment.ics',
        'Cache-Control': 'no-store',
      },
    });
  }

  if (method === 'GET' && apiPath.startsWith('/api/admin/')) {
    const denied = requireAdmin(cookie);
    if (denied) return denied;
    if (apiPath === '/api/admin/subscriptions') {
      const items = await sql`
        SELECT s.*, p.name AS provider_name FROM subscriptions s JOIN providers p ON p.id = s.provider_id ORDER BY s.provider_id
      `;
      return json({ items });
    }
    if (apiPath === '/api/admin/locations') {
      const items = await sql`
        SELECT l.*, p.name AS provider_name FROM locations l JOIN providers p ON p.id = l.provider_id ORDER BY l.provider_id
      `;
      return json({ items });
    }
    if (apiPath === '/api/admin/blog-links') {
      const items = await sql`
        SELECT b.id, b.doctor_id, b.provider_id, b.blog_url, b.verification, b.editorial_approved, b.created_at, d.name AS doctor_name
        FROM blog_links b JOIN doctors d ON b.doctor_id = d.id ORDER BY b.id DESC LIMIT 150
      `;
      return json({ items });
    }
    if (apiPath === '/api/admin/clinic-keys') {
      const items = await sql`
        SELECT id, provider_id, label, permission, expires_at, revoked, created_at FROM clinic_access ORDER BY id DESC LIMIT 200
      `;
      return json({ items });
    }
    if (apiPath === '/api/admin/doctor-keys') {
      const items = await sql`
        SELECT id, provider_id, label, expires_at, revoked, created_at FROM doctor_access ORDER BY id DESC LIMIT 150
      `;
      return json({ items });
    }
    if (apiPath === '/api/admin/advertiser-keys') {
      const items = await sql`
        SELECT id, provider_id, label, expires_at, revoked, created_at FROM advertiser_keys ORDER BY id DESC LIMIT 200
      `;
      return json({ items });
    }
    if (apiPath === '/api/admin/notifications') {
      const items = await sql`SELECT * FROM notifications ORDER BY id DESC LIMIT 200`;
      return json({ items });
    }
    if (apiPath === '/api/admin/marketing/campaigns') {
      const items = await sql`SELECT * FROM outreach_campaigns ORDER BY id DESC LIMIT 100`;
      return json({ items });
    }
    if (apiPath === '/api/admin/marketing/contacts') {
      const totals = await dbQuery<Row>(
        `SELECT channel, count(*)::int AS count FROM outreach_contacts WHERE consent_campaign = 1 AND contact_verified = 1 AND withdrawn_at IS NULL GROUP BY channel`,
      );
      const consenting_counts: Record<string, number> = {};
      for (const t of totals) consenting_counts[String(t.channel)] = Number(t.count);
      return json({ consenting_counts });
    }
    const previewMatch = apiPath.match(/^\/api\/admin\/marketing\/campaigns\/(\d+)\/preview$/);
    if (previewMatch) {
      const cid = Number(previewMatch[1]);
      const rows = await sql<Row>`SELECT * FROM outreach_campaigns WHERE id = ${cid}`;
      if (!rows[0]) return err('캠페인이 없습니다', 404);
      return json({
        campaign: rows[0],
        consented_recipients: 0,
        can_send: false,
        reason: '실발송 연동은 비활성화되어 있습니다.',
      });
    }
  }

  if (method === 'GET' && apiPath.startsWith('/api/clinic/')) {
    const auth = headers?.get('authorization') || null;
    const key = await authenticateClinic(auth);
    if (!key) return err('병원 예약 운영 접근키가 필요합니다', 401);
    const pid = key.provider_id;
    if (apiPath === '/api/clinic/profile') {
      const prov = await sql`SELECT id, name, category FROM providers WHERE id = ${pid}`;
      return json({ provider: prov[0], permission: key.permission, expires_at: key.expires_at });
    }
    if (apiPath === '/api/clinic/dashboard') return json(await clinicDashboard(pid));
    if (apiPath === '/api/clinic/schedule') {
      const today = new Date().toISOString().slice(0, 10);
      const start = params.get('from') || today;
      const end = params.get('to') || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
      try {
        return json({ events: await clinicSchedule(pid, start, end), provider_id: pid });
      } catch (e) {
        return err(e instanceof Error ? e.message : 'schedule error');
      }
    }
  }

  if (method === 'GET' && apiPath.startsWith('/api/doctor/')) {
    const auth = headers?.get('authorization') || null;
    const key = await billing.authenticateDoctor(auth);
    if (!key) return err('의사용 접근키가 필요하거나 만료되었습니다', 401);
    const pid = key.provider_id;
    if (!(await isSubscribed(pid))) return err('활성 구독 기관만 이용할 수 있습니다', 403);
    if (apiPath === '/api/doctor/profile') {
      const prov = await sql`SELECT id, name, category, region FROM providers WHERE id = ${pid}`;
      return json({
        provider: prov[0],
        key_label: key.label,
        expires_at: key.expires_at,
        notice: '의료 진료비 공식 청구·지급 시스템이 아닌 내부 관리용입니다.',
      });
    }
    if (apiPath === '/api/doctor/fees') return json({ items: await billing.feeList(pid) });
    if (apiPath === '/api/doctor/claims') return json({ items: await billing.listClaims(pid) });
    if (apiPath === '/api/doctor/deposits') return json({ items: await billing.deposits(pid) });
    if (apiPath === '/api/doctor/dashboard') return json(await billing.dashboard(pid));
    if (apiPath === '/api/doctor/audit') return json({ items: await billing.auditList(pid) });
    const preMatch = apiPath.match(/^\/api\/doctor\/claims\/(\d+)\/preflight$/);
    if (preMatch) return json(await billing.preflight(pid, Number(preMatch[1])));
  }

  if (method === 'POST' && apiPath === '/api/engagement/consent') {
    const data = body as Record<string, unknown>;
    const channel = String(data.channel || '');
    if (!['email', 'sms', 'kakao'].includes(channel)) return err('채널 오류');
    return json({
      ok: true,
      consent_requested: data.consent_campaign === true,
      contact_verified: false,
      eligible_for_send: false,
      note: '시연 모드: 실제 수신동의 효력 없음',
    });
  }

  if (method === 'POST' && (apiPath.startsWith('/api/admin/') || apiPath.startsWith('/api/clinic/') || apiPath.startsWith('/api/doctor/'))) {
    const denied = apiPath.startsWith('/api/admin/') ? requireAdminPost(cookie, headers) : null;
    if (denied) return denied;

    const data = (body || {}) as Record<string, unknown>;

    if (apiPath === '/api/admin/marketing/campaigns') {
      const name = field(data.name, '캠페인명', 120, true);
      const bodyText = field(data.body, '본문', 500, true);
      if (bodyText.length < 10) return err('10자 이상의 문구가 필요합니다');
      const channel = String(data.channel || '');
      if (!['email', 'sms', 'kakao'].includes(channel)) return err('채널 오류');
      const rows = await sql<{ id: number }>`
        INSERT INTO outreach_campaigns (name, channel, body, created_at) VALUES (${name}, ${channel}, ${bodyText}, ${nowKst()})
        RETURNING id
      `;
      return json({ id: rows[0].id, dispatch_state: 'draft' }, { status: 201 });
    }

    if (apiPath === '/api/admin/clinic-keys') {
      const pid = Number(data.provider_id);
      const issued = issueClinicKey(pid, String(data.label || ''), String(data.permission || 'schedule_read'));
      const rows = await sql<{ id: number }>`
        INSERT INTO clinic_access (provider_id, label, token_hash, permission, expires_at, created_at)
        VALUES (${pid}, ${issued.label}, ${issued.digest}, ${issued.permission}, ${issued.expires}, ${nowKst()})
        RETURNING id
      `;
      return json({ id: rows[0].id, token: issued.token, expires_at: issued.expires, permission: issued.permission }, { status: 201 });
    }
    const clinicRevoke = apiPath.match(/^\/api\/admin\/clinic-keys\/(\d+)\/revoke$/);
    if (clinicRevoke) {
      await sql`UPDATE clinic_access SET revoked = 1 WHERE id = ${Number(clinicRevoke[1])}`;
      return json({ ok: true });
    }

    if (apiPath === '/api/admin/doctor-keys') {
      const pid = Number(data.provider_id);
      const issued = issueDoctorKey(String(data.label || ''));
      const rows = await sql<{ id: number }>`
        INSERT INTO doctor_access (provider_id, label, token_hash, expires_at, created_at)
        VALUES (${pid}, ${issued.label}, ${issued.digest}, ${issued.expires}, ${nowKst()})
        RETURNING id
      `;
      return json({ id: rows[0].id, token: issued.token, expires_at: issued.expires }, { status: 201 });
    }
    const docRevoke = apiPath.match(/^\/api\/admin\/doctor-keys\/(\d+)\/revoke$/);
    if (docRevoke) {
      await sql`UPDATE doctor_access SET revoked = 1 WHERE id = ${Number(docRevoke[1])}`;
      return json({ ok: true });
    }

    if (apiPath === '/api/admin/subscriptions') {
      const pid = Number(data.provider_id);
      const exists = await sql`SELECT 1 FROM providers WHERE id = ${pid}`;
      if (!exists.length) return err('기관 ID 오류');
      const status = field(data.status, 'status', 20) || 'inactive';
      if (!['active', 'inactive', 'paused'].includes(status)) return err('구독 상태 오류');
      const expires = field(data.expires_at, 'expires', 40) || '2099-12-31T23:59:59+09:00';
      const paid = data.paid === true ? 1 : 0;
      const approved = data.compliance_approved === true ? 1 : 0;
      const plan = field(data.plan, 'plan', 40) || 'basic';
      await sql`
        INSERT INTO subscriptions (provider_id, status, paid, compliance_approved, expires_at, started_at, plan, updated_at)
        VALUES (${pid}, ${status}, ${paid}, ${approved}, ${expires}, ${nowKst()}, ${plan}, ${nowKst()})
        ON CONFLICT (provider_id) DO UPDATE SET status = EXCLUDED.status, paid = EXCLUDED.paid,
          compliance_approved = EXCLUDED.compliance_approved, expires_at = EXCLUDED.expires_at, plan = EXCLUDED.plan, updated_at = EXCLUDED.updated_at
      `;
      return json({ ok: true, eligible: await isSubscribed(pid) });
    }

    if (apiPath === '/api/admin/locations') {
      const pid = Number(data.provider_id);
      const lat = Number(data.lat);
      const lng = Number(data.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        return err('위치 범위 오류');
      }
      const placeid = field(data.google_place_id, 'place', 180);
      await sql`
        INSERT INTO locations (provider_id, latitude, longitude, google_place_id, place_reviewed, coordinate_source, updated_at)
        VALUES (${pid}, ${lat}, ${lng}, ${placeid}, 0, ${field(data.coordinate_source, 'src', 120) || '운영자 확인'}, ${nowKst()})
        ON CONFLICT (provider_id) DO UPDATE SET latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude,
          google_place_id = EXCLUDED.google_place_id, place_reviewed = EXCLUDED.place_reviewed,
          coordinate_source = EXCLUDED.coordinate_source, updated_at = EXCLUDED.updated_at
      `;
      return json({ ok: true });
    }

    if (apiPath === '/api/admin/google-place/verify') {
      return json({
        ok: false,
        matched: false,
        notice: 'Google Places API 키 미설정 시 데모에서는 수동 place_reviewed만 Console에서 설정하세요.',
      }, { status: 422 });
    }

    if (apiPath === '/api/admin/blog-links/approve') {
      const lid = Number(data.link_id);
      const approved = data.approved === true ? 1 : 0;
      await sql`UPDATE blog_links SET editorial_approved = ${approved} WHERE id = ${lid}`;
      return json({ ok: true, approved: Boolean(approved) });
    }

    if (apiPath === '/api/admin/blog-links/import') {
      return json({ ok: true, created_pending: 0, note: 'Vercel 배포: Blogger RSS 수집은 로컬 server.py 또는 추후 워커에서 실행하세요.' });
    }

    if (apiPath === '/api/admin/advertiser-keys') {
      const pid = Number(data.provider_id);
      const issued = issueAdvertiserKey();
      const rows = await sql<{ id: number }>`
        INSERT INTO advertiser_keys (provider_id, label, token_hash, expires_at, created_at)
        VALUES (${pid}, ${field(data.label, 'label', 80) || '광고주 리포트'}, ${issued.digest}, ${issued.expires}, ${nowKst()})
        RETURNING id
      `;
      return json({ ok: true, id: rows[0].id, token: issued.token, expires_at: issued.expires }, { status: 201 });
    }
    const adRevoke = apiPath.match(/^\/api\/admin\/advertiser-keys\/(\d+)\/revoke$/);
    if (adRevoke) {
      await sql`UPDATE advertiser_keys SET revoked = 1 WHERE id = ${Number(adRevoke[1])}`;
      return json({ ok: true });
    }

    if (apiPath === '/api/admin/providers') {
      const rows = await sql<{ id: number }>`
        INSERT INTO providers (name, category, kind, region, district, address, phone, website, hours, night, description, specialties, source, verified, image_style, updated_at)
        VALUES (
          ${field(data.name, 'name', 120, true)}, ${field(data.category, 'category', 40, true)},
          ${field(data.kind, 'kind', 30) || '병원'}, ${field(data.region, 'region', 50) || '서울'},
          ${field(data.district, 'district', 50)}, ${field(data.address, 'address', 200)},
          ${field(data.phone, 'phone', 40)}, ${validUrl(data.website)}, ${field(data.hours, 'hours', 100)},
          ${data.night ? 1 : 0}, ${field(data.description, 'desc', 1000)}, ${field(data.specialties, 'spec', 200)},
          ${field(data.source, 'source', 100) || '운영자 등록'}, ${data.verified ? 1 : 0},
          ${field(data.image_style, 'style', 30) || 'mint'}, ${nowKst()}
        ) RETURNING id
      `;
      return json({ ok: true, id: rows[0].id }, { status: 201 });
    }

    if (apiPath === '/api/admin/doctors') {
      const pid = Number(data.provider_id);
      const rows = await sql<{ id: number }>`
        INSERT INTO doctors (provider_id, name, specialty, credentials, society, intro, verification, profile_url, updated_at)
        VALUES (${pid}, ${field(data.name, 'name', 100, true)}, ${field(data.specialty, 'spec', 100)},
          ${field(data.credentials, 'cred', 300)}, ${field(data.society, 'soc', 200)}, ${field(data.intro, 'intro', 1000)},
          ${field(data.verification, 'ver', 30) || 'unverified'}, ${validUrl(data.profile_url)}, ${nowKst()})
        RETURNING id
      `;
      return json({ ok: true, id: rows[0].id }, { status: 201 });
    }

    if (apiPath === '/api/admin/content') {
      const pid = Number(data.provider_id);
      const kind = field(data.kind, 'kind', 30);
      if (!['blog', 'shorts', 'video', 'guide', 'paper'].includes(kind)) return err('콘텐츠 유형 오류');
      const url = validUrl(data.url);
      const rows = await sql<{ id: number }>`
        INSERT INTO content (provider_id, doctor_id, title, summary, kind, category, url, evidence_url, author_label, approved, published_at, editorial_priority)
        VALUES (${pid}, ${data.doctor_id ? Number(data.doctor_id) : null}, ${field(data.title, 'title', 200, true)},
          ${field(data.summary, 'summary', 1500)}, ${kind}, ${field(data.category, 'cat', 40)}, ${url},
          ${validUrl(data.evidence_url)}, ${field(data.author_label, 'author', 100)}, 0, ${nowKst()}, ${Number(data.editorial_priority || 0)})
        RETURNING id
      `;
      return json({ ok: true, id: rows[0].id, approved: false }, { status: 201 });
    }

    if (apiPath === '/api/admin/ads') {
      const pid = Number(data.provider_id);
      const prov = await sql<Row>`SELECT * FROM providers WHERE id = ${pid}`;
      if (!prov[0]) return err('의료기관 ID 오류');
      const category = field(data.category, 'cat', 40) || String(prov[0].category);
      const rows = await sql<{ id: number }>`
        INSERT INTO ads (provider_id, category, headline, priority, active, approved, created_at)
        VALUES (${pid}, ${category}, ${field(data.headline, 'headline', 200, true)},
          ${Math.max(0, Math.min(1000, Number(data.priority || 10)))}, 1, 0, ${nowKst()})
        RETURNING id
      `;
      return json({ ok: true, id: rows[0].id, approved: false }, { status: 201 });
    }

    const modMatch = apiPath.match(/^\/api\/admin\/(content|ads|reviews)\/(\d+)\/moderate$/);
    if (modMatch) {
      const table = modMatch[1];
      const id = Number(modMatch[2]);
      const approved = Boolean(data.approved);
      if (table === 'reviews') {
        await sql`UPDATE reviews SET status = ${approved ? 'approved' : 'rejected'} WHERE id = ${id}`;
      } else if (table === 'content') {
        await sql`UPDATE content SET approved = ${approved ? 1 : 0} WHERE id = ${id}`;
      } else {
        await sql`UPDATE ads SET approved = ${approved ? 1 : 0} WHERE id = ${id}`;
      }
      return json({ ok: true, approved });
    }

    const apptStatus = apiPath.match(/^\/api\/admin\/appointments\/(\d+)\/status$/);
    if (apptStatus) {
      try {
        return json(await adminSetAppointmentStatus(Number(apptStatus[1]), field(data.status, 'status', 30, true)));
      } catch (e) {
        return err(e instanceof Error ? e.message : 'status error');
      }
    }

    if (apiPath === '/api/admin/checkout/order') {
      const orderId = 'mp_ord_' + randomBytes(8).toString('hex');
      const plan = field(data.plan, 'plan', 40) || 'basic';
      const amount = plan === 'basic' ? 190000 : 390000;
      const enabled = Boolean(process.env.TOSS_CLIENT_KEY);
      await sql`
        INSERT INTO checkout_orders (order_id, provider_id, plan, amount_krw, status, created_at)
        VALUES (${orderId}, ${Number(data.provider_id)}, ${plan}, ${amount}, 'pending', ${nowKst()})
      `;
      return json(
        {
          orderId,
          amount,
          plan,
          enabled,
          clientKey: process.env.TOSS_CLIENT_KEY || '',
          notice: enabled ? '데모 결제위젯' : 'TOSS_CLIENT_KEY 미설정',
        },
        { status: 201 },
      );
    }

    if (apiPath === '/api/admin/checkout/confirm') {
      const orderId = field(data.orderId, 'orderId', 80, true);
      await sql`UPDATE checkout_orders SET status = 'paid', payment_key = ${field(data.paymentKey, 'key', 200)} WHERE order_id = ${orderId}`;
      return json({ notice: '데모: 결제 승인 기록만 저장됩니다. 실제 PG 검증 없음.' });
    }

    if (apiPath === '/api/admin/google/sync') {
      return json({ created_pending: 0, note: 'Google OAuth 미연결 — Neon/Vercel 환경변수 설정 후 사용' });
    }

    const clinicStatus = apiPath.match(/^\/api\/clinic\/appointments\/(\d+)\/status$/);
    if (clinicStatus) {
      const auth = headers?.get('authorization') || null;
      const key = await authenticateClinic(auth);
      if (!key) return err('병원 예약 운영 접근키가 필요합니다', 401);
      if (key.permission !== 'schedule_manage') return err('schedule_manage 권한 필요', 403);
      try {
        return json(
          await clinicTransition(key.provider_id, key.id, Number(clinicStatus[1]), field(data.status, 'status', 30, true)),
        );
      } catch (e) {
        return err(e instanceof Error ? e.message : 'transition error');
      }
    }

    if (apiPath.startsWith('/api/doctor/')) {
      const auth = headers?.get('authorization') || null;
      if (headers?.get('x-medipick-doctor') !== '1') return err('의사 API 변경 헤더 필요', 403);
      const key = await billing.authenticateDoctor(auth);
      if (!key) return err('의사용 접근키가 필요합니다', 401);
      const pid = key.provider_id;
      if (!(await isSubscribed(pid))) return err('활성 구독 기관만 이용할 수 있습니다', 403);
      const kid = key.id;
      try {
        if (apiPath === '/api/doctor/fees') return json(await billing.addFee(pid, kid, data), { status: 201 });
        if (apiPath === '/api/doctor/claims') return json(await billing.addClaim(pid, kid, data), { status: 201 });
        if (apiPath === '/api/doctor/deposits') return json(await billing.addDeposit(pid, kid, data), { status: 201 });
        if (apiPath === '/api/doctor/allocations') return json(await billing.allocate(pid, kid, data), { status: 201 });
        const m = apiPath.match(/^\/api\/doctor\/claims\/(\d+)\/(prepare|submission-record|review)$/);
        if (m) {
          const cid = Number(m[1]);
          if (m[2] === 'prepare') return json(await billing.prepareClaim(pid, kid, cid));
          if (m[2] === 'submission-record') return json(await billing.recordSubmission(pid, kid, cid, data));
          if (m[2] === 'review') return json(await billing.recordReview(pid, kid, cid, data));
        }
      } catch (e) {
        return err(e instanceof Error ? e.message : 'doctor api error');
      }
    }
  }

  return null;
}
