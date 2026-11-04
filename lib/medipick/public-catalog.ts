import { db, dbQuery } from '@/lib/db';
import { presentCatalogStore } from '@/lib/medipick/catalog-present';
import type { Row } from '@/lib/medipick/catalog-types';

const LIST_COLS = `
  id, source_platform, name, phone, address, region, district, summary,
  rating, review_count, profile_url, latitude, longitude, geocode_status, coordinate_source,
  trade_category, listing_tier, marketing_active, marketing_expires_at, priority_boost,
  hero_image_url, video_url, google_blog_url, naver_blog_url
`;

export async function publicCatalogStats() {
  const sql = db();
  const total = await sql<{ n: number }>`SELECT count(*)::int AS n FROM public_hospital_stores WHERE store_listing = 'listed' AND name NOT ILIKE '%검색결과%'`;
  const geo = await sql<{ n: number }>`
    SELECT count(*)::int AS n FROM public_hospital_stores
    WHERE store_listing = 'listed' AND name NOT ILIKE '%검색결과%' AND latitude IS NOT NULL AND longitude IS NOT NULL
  `;
  const accuracy = await sql<{ exact: number; approximate: number; missing_address: number }>`
    SELECT count(*) FILTER (WHERE geocode_status = 'exact' AND latitude IS NOT NULL AND longitude IS NOT NULL)::int AS exact,
           count(*) FILTER (WHERE geocode_status = 'approx' AND latitude IS NOT NULL AND longitude IS NOT NULL)::int AS approximate,
           count(*) FILTER (WHERE btrim(address) = '')::int AS missing_address
    FROM public_hospital_stores WHERE store_listing = 'listed' AND name NOT ILIKE '%검색결과%'
  `;
  const excluded = await sql<{ n: number }>`
    SELECT count(*)::int AS n FROM public_hospital_stores
    WHERE store_listing = 'listed' AND name ILIKE '%검색결과%'
  `;
  const premium = await sql<{ n: number }>`
    SELECT count(*)::int AS n FROM public_hospital_stores
    WHERE store_listing = 'listed' AND name NOT ILIKE '%검색결과%' AND listing_tier = 'premium' AND marketing_active = TRUE
  `;
  const sources = await sql<{ source_platform: string; n: number }>`
    SELECT source_platform, count(*)::int AS n FROM public_hospital_stores
    WHERE store_listing = 'listed' AND name NOT ILIKE '%검색결과%'
    GROUP BY source_platform ORDER BY n DESC LIMIT 12
  `;
  return {
    total: total[0]?.n ?? 0,
    excluded_search_pages: excluded[0]?.n ?? 0,
    mappable: geo[0]?.n ?? 0,
    exact_mappable: accuracy[0]?.exact ?? 0,
    estimated_mappable: accuracy[0]?.approximate ?? 0,
    missing_address: accuracy[0]?.missing_address ?? 0,
    premium_listings: premium[0]?.n ?? 0,
    sources,
    pricing: {
      free: '공공·플랫폼 주소록 — 텍스트·기본 지도 팝업 무료',
      premium: '월 구독 — PRO 팝업·블로그·동영상·주변검색 우선 노출',
    },
    notice:
      '플랫폼·주소록에서 수집한 병원 연락처·주소 카탈로그(공종·진료분야 라벨). 진료·광고 추천이 아니며 운영·위치는 방문 전 확인하세요.',
  };
}

export async function publicCatalogSearch(params: URLSearchParams) {
  const q = (params.get('q') || '').trim().slice(0, 80);
  const region = (params.get('region') || '').trim();
  const platform = (params.get('platform') || '').trim();
  const trade = (params.get('trade') || '').trim();
  const limit = Math.min(100, Math.max(1, Number(params.get('limit') || 40)));
  const offset = Math.max(0, Number(params.get('offset') || 0));

  const clauses = [`store_listing = 'listed'`, `name NOT ILIKE '%검색결과%'`];
  const args: unknown[] = [];
  if (q) {
    args.push(`%${q}%`);
    const p = `$${args.length}`;
    clauses.push(
      `(name ILIKE ${p} OR address ILIKE ${p} OR district ILIKE ${p} OR trade_category ILIKE ${p})`,
    );
  }
  if (region) {
    args.push(`%${region}%`);
    const p = `$${args.length}`;
    clauses.push(`(region ILIKE ${p} OR address ILIKE ${p})`);
  }
  if (platform) {
    args.push(platform);
    clauses.push(`source_platform = $${args.length}`);
  }
  if (trade) {
    args.push(`%${trade}%`);
    clauses.push(`trade_category ILIKE $${args.length}`);
  }
  args.push(limit, offset);
  const text = `
    SELECT ${LIST_COLS}
    FROM public_hospital_stores
    WHERE ${clauses.join(' AND ')}
    ORDER BY (CASE WHEN listing_tier = 'premium' AND marketing_active THEN 1 ELSE 0 END) DESC,
             priority_boost DESC, review_count DESC NULLS LAST, name ASC
    LIMIT $${args.length - 1} OFFSET $${args.length}
  `;
  const rows = await dbQuery<Row>(text, args);
  return { items: rows.map((r) => presentCatalogStore(r)), count: rows.length };
}

export async function publicCatalogNearby(params: URLSearchParams) {
  const rawLat = params.get('lat');
  const rawLon = params.get('lon') ?? params.get('lng');
  const lat = rawLat?.trim() ? Number(rawLat) : NaN;
  const lon = rawLon?.trim() ? Number(rawLon) : NaN;
  const radius = Number(params.get('radius') || 5);
  const requestedLimit = Number(params.get('limit') || 80);
  const limit = Math.min(150, Math.max(1, Math.floor(requestedLimit)));
  const q = (params.get('q') || '').trim().slice(0, 80);
  const platform = (params.get('platform') || '').trim();
  const trade = (params.get('trade') || '').trim();
  const includeEstimated = params.get('include_estimated') === '1';

  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    throw new Error('위도/경도가 필요합니다');
  }
  if (!Number.isFinite(radius) || radius < 0.5 || radius > 30) {
    throw new Error('반경은 0.5~30km');
  }
  if (!Number.isFinite(requestedLimit) || requestedLimit < 1) {
    throw new Error('올바른 표시 건수가 필요합니다');
  }

  const latDelta = radius / 110.574;
  const lngDelta = radius / (111.32 * Math.max(0.01, Math.abs(Math.cos(lat * Math.PI / 180))));
  const args: unknown[] = [
    lat - latDelta, lat + latDelta, lon - lngDelta, lon + lngDelta, lat, lon, radius,
  ];
  const clauses = [
    "store_listing = 'listed'",
    "name NOT ILIKE '%검색결과%'",
    'latitude IS NOT NULL',
    'longitude IS NOT NULL',
    'latitude BETWEEN $1 AND $2',
    'longitude BETWEEN $3 AND $4',
    includeEstimated ? "geocode_status IN ('exact','approx')" : "geocode_status = 'exact'",
  ];
  if (q) {
    args.push('%' + q + '%');
    const p = '$' + args.length;
    clauses.push('(name ILIKE ' + p + ' OR address ILIKE ' + p + ' OR district ILIKE ' + p + ' OR trade_category ILIKE ' + p + ')');
  }
  if (platform) {
    args.push(platform);
    clauses.push('source_platform = $' + args.length);
  }
  if (trade) {
    args.push('%' + trade + '%');
    clauses.push('trade_category ILIKE $' + args.length);
  }
  args.push(limit);

  const distanceSQL = `6371.0088 * 2 * ASIN(LEAST(1, SQRT(
    POWER(SIN(RADIANS(latitude - $5) / 2), 2) +
    COS(RADIANS($5)) * COS(RADIANS(latitude)) *
    POWER(SIN(RADIANS(longitude - $6) / 2), 2)
  )))`;
  const sqlText = `
    WITH candidates AS (
      SELECT ${LIST_COLS}, (${distanceSQL}) AS unrounded_distance_km
      FROM public_hospital_stores WHERE ${clauses.join(' AND ')}
    ),
    inside_radius AS (
      SELECT *, ROUND(unrounded_distance_km::numeric, 2)::double precision AS distance_km
      FROM candidates WHERE unrounded_distance_km <= $7
    )
    SELECT *,
      COUNT(*) OVER ()::int AS total_count,
      COUNT(*) FILTER (WHERE listing_tier = 'premium' AND marketing_active IS TRUE
        AND (marketing_expires_at IS NULL OR marketing_expires_at > NOW())) OVER ()::int AS premium_count
    FROM inside_radius
    ORDER BY (CASE WHEN listing_tier = 'premium' AND marketing_active IS TRUE
      AND (marketing_expires_at IS NULL OR marketing_expires_at > NOW()) THEN 1 ELSE 0 END) DESC,
      COALESCE(priority_boost, 0) DESC, distance_km ASC, id ASC
    LIMIT $${args.length}
  `;
  const rows = await dbQuery<Row & { total_count: number; premium_count: number; distance_km: number }>(sqlText, args);
  const total = Number(rows[0]?.total_count || 0);
  return {
    items: rows.map((row) => presentCatalogStore(row, Number(row.distance_km))),
    count: total,
    premium_in_radius: Number(rows[0]?.premium_count || 0),
    shown: rows.length,
    capped: total > rows.length,
    center: { lat, lng: lon },
    estimated_included: includeEstimated,
    notice: includeEstimated
      ? '추정핀은 시·도 중심에 임의 편차를 준 가상 좌표이며 실제 병원 위치·이동거리가 아닙니다.'
      : '검증된 위치만 표시합니다. 병원명 검색으로 주소록을 찾고 Google 주소 위치 조회로 개별 임시 핀을 확인하세요.',
  };
}

export async function publicCatalogStore(id: number) {
  const sql = db();
  const rows = await sql<Row>`
    SELECT * FROM public_hospital_stores WHERE id = ${id} AND store_listing = 'listed' AND name NOT ILIKE '%검색결과%' LIMIT 1
  `;
  if (!rows[0]) throw new Error('카탈로그 항목 없음');
  return presentCatalogStore(rows[0]);
}

export async function adminSetCatalogMarketing(id: number, body: Row) {
  const sql = db();
  const tier = body.listing_tier === 'premium' ? 'premium' : 'free';
  const active = Boolean(body.marketing_active);
  await sql`
    UPDATE public_hospital_stores SET
      listing_tier = ${tier},
      marketing_active = ${active},
      marketing_expires_at = ${body.marketing_expires_at ? String(body.marketing_expires_at) : null},
      priority_boost = ${Math.min(100, Math.max(0, Number(body.priority_boost || 0)))},
      hero_image_url = ${String(body.hero_image_url || '').slice(0, 500)},
      video_url = ${String(body.video_url || '').slice(0, 500)},
      google_blog_url = ${String(body.google_blog_url || '').slice(0, 500)},
      naver_blog_url = ${String(body.naver_blog_url || '').slice(0, 500)},
      trade_category = COALESCE(NULLIF(${String(body.trade_category || '').slice(0, 80)}, ''), trade_category),
      updated_at = NOW()
    WHERE id = ${id}
  `;
  return publicCatalogStore(id);
}
