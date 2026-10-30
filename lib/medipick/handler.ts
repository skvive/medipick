import { db, dbQuery } from '@/lib/db';
import { CATEGORIES, SYNONYMS, nowKst } from '@/lib/medipick/constants';
import { passwordOk, sessionOk, makeSession, sessionCookie, clearSessionCookie } from '@/lib/medipick/auth';
import { isSubscribed } from '@/lib/medipick/handler-shared';
import {
  publicCatalogNearby,
  publicCatalogSearch,
  publicCatalogStats,
  publicCatalogStore,
} from '@/lib/medipick/public-catalog';
import { adminStats, handleExtendedRoutes } from '@/lib/medipick/extended-api';
import { randomBytes } from 'node:crypto';

type Row = Record<string, unknown>;

function json(data: unknown, init: ResponseInit = {}) {
  return Response.json(data, {
    ...init,
    headers: {
      'Cache-Control': 'no-store',
      ...(init.headers || {}),
    },
  });
}

function err(msg: string, status = 400) {
  return json({ error: msg }, { status });
}

function matchIntent(q: string) {
  const lower = q.toLowerCase().trim();
  let category = '';
  const night =
    ['심야', '야간', '새벽', '밤', '24시', '24시간'].some((x) => lower.includes(x)) &&
    ['약', '약국'].some((x) => lower.includes(x));
  if (lower.includes('약국') || lower.includes('약 ')) category = '약국';
  for (const [key, c] of Object.entries(SYNONYMS)) {
    if (lower.includes(key) && (CATEGORIES as readonly string[]).includes(c) && !category) category = c;
  }
  return {
    category,
    night,
    method: '규칙 기반 자연어 의도 분석 (생성형 AI 연결 전)',
    note: '진료 적합성을 판단하거나 특정 의료기관의 치료 성과를 보증하지 않습니다.',
  };
}

async function providerQuery(category: string, region: string, q: string, night: boolean) {
  let query = `SELECT p.* FROM providers p WHERE p.status = 'active'`;
  const args: unknown[] = [];
  if (category && category !== '전체') {
    args.push(category, `%${category}%`);
    query += ` AND (p.category = $${args.length - 1} OR p.specialties LIKE $${args.length})`;
  }
  if (region && region !== '전국') {
    args.push(`%${region}%`, `%${region}%`);
    query += ` AND (p.region LIKE $${args.length - 1} OR p.district LIKE $${args.length})`;
  }
  if (night) query += ` AND p.night = 1`;
  const tokens = q
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 1)
    .slice(0, 6);
  const stop = new Set([
    '추천', '찾아줘', '알려줘', '병원', '의원', '근처', '있는', '어디', '좋은', '정보', '전문', '전문의', '검색', '싶어', '관련', '하는',
  ]);
  const searchParts: string[] = [];
  for (const t of tokens) {
    if (stop.has(t)) continue;
    const use = SYNONYMS[t] || t;
    if (use === '심야') continue;
    const base = args.length;
    args.push(`%${use}%`);
    const p = `$${base + 1}`;
    searchParts.push(
      `(p.name ILIKE ${p} OR p.category ILIKE ${p} OR p.region ILIKE ${p} OR p.district ILIKE ${p} OR p.specialties ILIKE ${p} OR p.description ILIKE ${p} OR EXISTS (SELECT 1 FROM doctors d WHERE d.provider_id = p.id AND (d.name ILIKE ${p} OR d.specialty ILIKE ${p})))`,
    );
  }
  if (searchParts.length) query += ` AND (${searchParts.join(' OR ')})`;
  query += ' ORDER BY p.name LIMIT 250';
  return (await dbQuery(query, args)) as Row[];
}

async function searchProviders(params: URLSearchParams) {
  const q = (params.get('q') || '').trim().slice(0, 120);
  let category = (params.get('category') || '').slice(0, 40);
  const region = (params.get('region') || '').slice(0, 40);
  const guided = params.get('mode') === 'ai';
  const intent = guided ? matchIntent(q) : { category: '', night: false, method: '카테고리 검색', note: '' };
  if (!category || category === '전체') category = intent.category || category;
  const rows = await providerQuery(category, region, q, intent.night);
  const sql = db();
  const ads = new Map<number, Row>();
  const ids = rows.map((r) => Number(r.id));
  if (ids.length) {
    const adRows = await sql<Row>`
      SELECT * FROM ads WHERE active = 1 AND approved = 1 AND provider_id = ANY(${ids}::int[])
      ORDER BY priority DESC, id DESC
    `;
    for (const a of adRows) {
      const pid = Number(a.provider_id);
      if (await isSubscribed(pid)) {
        if (a.category === category || a.category === '전체' || !category || category === '전체') {
          if (!ads.has(pid)) ads.set(pid, a);
        }
      }
    }
  }
  for (const r of rows) {
    const id = Number(r.id);
    r.sponsored = ads.has(id);
    r.ad_headline = (ads.get(id)?.headline as string) || '';
    r.sponsor_priority = Number(ads.get(id)?.priority || 0);
    const dc = await sql<{ c: number }>`SELECT count(*)::int AS c FROM doctors WHERE provider_id = ${id}`;
    const cc = await sql<{ c: number }>`SELECT count(*)::int AS c FROM content WHERE provider_id = ${id} AND approved = 1`;
    r.doctor_count = dc[0]?.c ?? 0;
    r.content_count = cc[0]?.c ?? 0;
  }
  rows.sort(
    (a, b) =>
      Number(b.sponsored) - Number(a.sponsored) ||
      Number(b.sponsor_priority) - Number(a.sponsor_priority) ||
      Number(b.verified) - Number(a.verified) ||
      Number(b.content_count) - Number(a.content_count) ||
      String(a.name).localeCompare(String(b.name)),
  );
  return {
    items: rows,
    count: rows.length,
    intent,
    category: category || '전체',
    region: region || '전국',
    query: q,
    notice: '광고 상품은 관련 카테고리 상단에 노출되며 광고임을 표시합니다. 진료수준·치료성공률 순위가 아닙니다.',
  };
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
  const r = 6371.0088;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = p2 - p1;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(a)));
}

async function nearby(params: URLSearchParams) {
  const lat = Number(params.get('lat'));
  const lon = Number(params.get('lon'));
  const radius = Number(params.get('radius') || 10);
  const category = params.get('category') || '';
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    throw new Error('위도/경도 범위 오류');
  }
  if (radius < 0.2 || radius > 50) throw new Error('검색 반경은 0.2~50km');
  const sql = db();
  const rows = await sql<Row>`
    SELECT p.*, l.latitude, l.longitude, l.google_place_id, l.place_reviewed, l.coordinate_source, s.plan
    FROM providers p
    JOIN locations l ON l.provider_id = p.id
    JOIN subscriptions s ON s.provider_id = p.id
    WHERE p.status = 'active' AND s.status = 'active' AND s.paid = 1 AND s.compliance_approved = 1
  `;
  const results: Row[] = [];
  for (const row of rows) {
    const id = Number(row.id);
    if (!(await isSubscribed(id))) continue;
    const ext = String(row.external_key || '');
    if (!(ext.startsWith('demo-') || (row.google_place_id && row.place_reviewed))) continue;
    if (category && category !== '전체') {
      if (row.category !== category && !String(row.specialties || '').includes(category)) continue;
    }
    const d = haversine(lat, lon, Number(row.latitude), Number(row.longitude));
    if (d > radius) continue;
    results.push({ ...row, distance_km: d, sponsored: true });
  }
  results.sort((a, b) => Number(a.distance_km) - Number(b.distance_km));
  return { items: results.slice(0, 30), count: results.length, notice: '구독·광고 기관만 표시. 실제 위치·운영은 확인 필요.' };
}

async function publicProvider(id: number) {
  const sql = db();
  const pRows = await sql<Row>`SELECT * FROM providers WHERE id = ${id}`;
  const p = pRows[0];
  if (!p) throw new Error('기관 없음');
  p.doctors = await sql`SELECT * FROM doctors WHERE provider_id = ${id}`;
  p.content = await sql`
    SELECT x.*, d.name AS doctor_name, d.verification AS doctor_verification
    FROM content x LEFT JOIN doctors d ON d.id = x.doctor_id
    WHERE x.provider_id = ${id} AND x.approved = 1
    ORDER BY x.editorial_priority DESC, x.id DESC LIMIT 30
  `;
  p.ads = await sql`SELECT * FROM ads WHERE provider_id = ${id} AND active = 1 AND approved = 1`;
  p.blog_links = await sql`
    SELECT * FROM blog_links WHERE provider_id = ${id} AND editorial_approved = 1
  `;
  p.subscription_active = await isSubscribed(id);
  p.reviews = await sql`
    SELECT id, nickname, aspect, body, created_at FROM reviews
    WHERE provider_id = ${id} AND status = 'approved' ORDER BY id DESC LIMIT 30
  `;
  return p;
}

async function ensureSeeded() {
  const sql = db();
  const c = await sql<{ n: number }>`SELECT count(*)::int AS n FROM providers`;
  if ((c[0]?.n ?? 0) === 0) {
    throw new Error('DB empty — run npm run db:migrate && npm run db:seed');
  }
}

export async function handleMedipickRequest(
  method: string,
  apiPath: string,
  params: URLSearchParams,
  body: unknown,
  cookie: string | null,
  headers: Headers | null = null,
): Promise<Response> {
  try {
    if (!process.env.DATABASE_URL) return err('DATABASE_URL not configured', 503);

    if (method === 'GET' && apiPath === '/api/health') {
      return json({ ok: true, service: 'medipick', version: '3.3', db: 'neon' });
    }

    await ensureSeeded();

    if (method === 'GET' && apiPath === '/api/config') {
      return json({
        categories: CATEGORIES,
        ga_id: process.env.MEDIPICK_GA_ID || '',
        google_maps_browser_key: process.env.GOOGLE_MAPS_BROWSER_KEY || '',
        demo: true,
        source_notice: '초기 데이터는 가상의 시연용 샘플입니다. 공공데이터를 가져오면 출처가 분리되어 표기됩니다.',
      });
    }

    if (method === 'GET' && apiPath === '/api/home') {
      const search = await searchProviders(new URLSearchParams({ category: '전체' }));
      const providers = search.items.slice(0, 6);
      const sql = db();
      const latest = await sql`
        SELECT x.*, p.name AS provider_name, p.image_style, p.category AS provider_category,
               d.verification AS doctor_verification
        FROM content x
        JOIN providers p ON p.id = x.provider_id
        LEFT JOIN doctors d ON x.doctor_id = d.id
        WHERE x.approved = 1 AND p.status = 'active'
        ORDER BY x.editorial_priority DESC, x.id DESC LIMIT 12
      `;
      return json({ featured: providers, latest, categories: CATEGORIES });
    }

    if (method === 'GET' && apiPath === '/api/search') return json(await searchProviders(params));

    if (method === 'GET' && apiPath === '/api/nearby') {
      try {
        return json(await nearby(params));
      } catch (e) {
        return err(e instanceof Error ? e.message : 'nearby error');
      }
    }

    if (method === 'GET' && apiPath === '/api/public-catalog/stats') {
      try {
        return json(await publicCatalogStats());
      } catch (e) {
        return err(e instanceof Error ? e.message : 'catalog stats error');
      }
    }

    if (method === 'GET' && apiPath === '/api/public-catalog/search') {
      try {
        return json(await publicCatalogSearch(params));
      } catch (e) {
        return err(e instanceof Error ? e.message : 'catalog search error');
      }
    }

    if (method === 'GET' && apiPath === '/api/public-catalog/nearby') {
      try {
        return json(await publicCatalogNearby(params));
      } catch (e) {
        return err(e instanceof Error ? e.message : 'catalog nearby error');
      }
    }

    const catalogMatch = apiPath.match(/^\/api\/public-catalog\/store\/(\d+)$/);
    if (method === 'GET' && catalogMatch) {
      try {
        return json(await publicCatalogStore(Number(catalogMatch[1])));
      } catch (e) {
        return err(e instanceof Error ? e.message : 'not found', 404);
      }
    }

    if (method === 'GET' && apiPath === '/api/content') {
      const sql = db();
      const items = await sql`
        SELECT x.*, p.name AS provider_name, p.image_style, p.category AS provider_category,
               d.verification AS doctor_verification
        FROM content x JOIN providers p ON p.id = x.provider_id
        LEFT JOIN doctors d ON x.doctor_id = d.id
        WHERE x.approved = 1 AND p.status = 'active'
        ORDER BY x.id DESC LIMIT 200
      `;
      return json({ items });
    }

    const provMatch = apiPath.match(/^\/api\/provider\/(\d+)$/);
    if (method === 'GET' && provMatch) {
      try {
        return json(await publicProvider(Number(provMatch[1])));
      } catch (e) {
        return err(e instanceof Error ? e.message : 'not found', 404);
      }
    }

    if (method === 'GET' && apiPath === '/api/health-data/connection') {
      return json({
        connected: false,
        available: false,
        mode: 'official_portal_link_only',
        official_portal: 'https://www.myhealthway.go.kr/portal/',
        reason: '건강정보 고속도로 활용서비스 등록·본인인증·동적 동의·API 계약 전 개인정보 자동조회 불가',
        storable_health_data: false,
      });
    }

    if (method === 'GET' && apiPath === '/api/admin/me') {
      return json({ authenticated: sessionOk(cookie) });
    }

    if (method === 'GET' && apiPath.startsWith('/api/admin/') && !sessionOk(cookie)) {
      return err('관리자 로그인 필요', 401);
    }

    if (method === 'GET' && apiPath === '/api/admin/stats') {
      const prov = params.get('provider_id');
      const pid = prov && /^\d+$/.test(prov) ? Number(prov) : undefined;
      return json(await adminStats(pid));
    }

    if (method === 'GET' && apiPath === '/api/admin/providers') {
      const sql = db();
      const items = await sql`SELECT * FROM providers ORDER BY id DESC LIMIT 500`;
      return json({ items });
    }

    if (method === 'GET' && apiPath === '/api/admin/content') {
      const sql = db();
      const items = await sql`SELECT * FROM content ORDER BY id DESC LIMIT 300`;
      return json({ items });
    }

    if (method === 'GET' && apiPath === '/api/admin/doctors') {
      const sql = db();
      const items = await sql`SELECT * FROM doctors ORDER BY id DESC LIMIT 300`;
      return json({ items });
    }

    if (method === 'GET' && apiPath === '/api/admin/ads') {
      const sql = db();
      const items = await sql`SELECT * FROM ads ORDER BY id DESC LIMIT 300`;
      return json({ items });
    }

    if (method === 'GET' && apiPath === '/api/admin/appointments') {
      const sql = db();
      const items = await sql`
        SELECT a.*, p.name AS provider_name FROM appointments a
        JOIN providers p ON p.id = a.provider_id ORDER BY a.id DESC LIMIT 250
      `;
      return json({ items });
    }

    if (method === 'GET' && apiPath === '/api/admin/reviews') {
      const sql = db();
      const items = await sql`SELECT * FROM reviews ORDER BY id DESC LIMIT 200`;
      return json({ items });
    }

    if (method === 'POST' && apiPath === '/api/login') {
      const data = body as { password?: string };
      if (!passwordOk(String(data?.password || ''))) return err('암호 오류', 401);
      const token = makeSession();
      return json({ ok: true }, { headers: { 'Set-Cookie': sessionCookie(token) } });
    }

    if (method === 'POST' && apiPath === '/api/logout') {
      return json({ ok: true }, { headers: { 'Set-Cookie': clearSessionCookie() } });
    }

    if (method === 'POST' && apiPath === '/api/events') {
      const data = body as Record<string, unknown>;
      const kind = String(data.kind || '');
      const allowed = new Set(['search', 'provider_view', 'ad_impression', 'ad_click', 'content_open', 'booking_request', 'phone_click', 'category_click']);
      if (!allowed.has(kind)) return err('이벤트 유형 오류');
      const sql = db();
      const cat = String(data.category || '').slice(0, 40);
      const safeQuery = (CATEGORIES as readonly string[]).includes(cat) ? cat : '검색';
      await sql`
        INSERT INTO events (kind, provider_id, content_id, category, query, client_key, created_at)
        VALUES (${kind}, ${data.provider_id ?? null}, ${data.content_id ?? null}, ${cat.slice(0, 40)}, ${safeQuery}, ${String(data.client_key || '').slice(0, 70)}, ${nowKst()})
      `;
      return json({ ok: true });
    }

    if (method === 'POST' && apiPath === '/api/reviews') {
      const data = body as Record<string, unknown>;
      const sql = db();
      await sql`
        INSERT INTO reviews (provider_id, nickname, aspect, body, status, created_at)
        VALUES (${Number(data.provider_id)}, ${String(data.nickname).slice(0, 30)}, ${String(data.aspect).slice(0, 40)}, ${String(data.body).slice(0, 500)}, 'pending', ${nowKst()})
      `;
      return json({ ok: true, message: '후기가 접수되었습니다. 검수 후 공개됩니다.' });
    }

    if (method === 'POST' && apiPath === '/api/appointments') {
      const data = body as Record<string, unknown>;
      const phone = String(data.phone || '');
      if (!/^[0-9+\- ]{9,20}$/.test(phone)) return err('연락처 형식을 확인하세요');
      const publicId = 'mp_' + randomBytes(8).toString('hex');
      const sql = db();
      await sql`
        INSERT INTO appointments (public_id, provider_id, visitor_name, phone, visit_date, visit_time, status, consent_at, created_at)
        VALUES (${publicId}, ${Number(data.provider_id)}, ${String(data.name).slice(0, 40)}, ${phone}, ${String(data.date)}, ${String(data.time)}, 'requested', ${nowKst()}, ${nowKst()})
      `;
      return json({
        ok: true,
        public_id: publicId,
        message: '예약 요청이 접수되었습니다. 병원 확인 연락을 기다려 주세요. (데모: 실제 확정·알림 미연동)',
      });
    }

    if (method === 'POST' && apiPath === '/api/ai/answer') {
      const data = body as { query?: string; category?: string };
      const q = String(data.query || '').trim();
      const intent = matchIntent(q);
      const search = await searchProviders(new URLSearchParams({ q, category: data.category || intent.category || '', mode: 'ai' }));
      return json({
        text: `「${q}」에 대한 일반 정보 탐색 결과입니다. ${intent.note}`,
        sources: search.items.slice(0, 3).map((p) => ({ title: p.name, url: '' })),
        sponsored: search.items.filter((p) => p.sponsored).slice(0, 2).map((p) => ({
          provider_id: p.id,
          name: p.name,
          category: p.category,
          region: p.region,
          district: p.district,
        })),
        external_used: false,
        notice: '데모: 외부 AI 미연결. 의료적 조언·진단 아님.',
      });
    }

    if (method === 'POST' && apiPath === '/api/consult/photo-chat') {
      return json({
        text: '사진 분석은 데모에서 비활성화되어 있습니다. OPENAI_API_KEY 설정 및 법률 검토 후 활성화하세요.',
        analyzed: false,
        emergency: false,
      });
    }

    const extended = await handleExtendedRoutes(method, apiPath, params, body, cookie, headers);
    if (extended) return extended;

    return err('API가 없습니다', 404);
  } catch (e) {
    console.error(e);
    return err(e instanceof Error ? e.message : '서버 오류', 500);
  }
}
