import { db, dbQuery } from '@/lib/db';

type Row = Record<string, unknown>;

function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
  const r = 6371.0088;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = p2 - p1;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(a)));
}

export async function publicCatalogStats() {
  const sql = db();
  const total = await sql<{ n: number }>`SELECT count(*)::int AS n FROM public_hospital_stores WHERE store_listing = 'listed'`;
  const geo = await sql<{ n: number }>`
    SELECT count(*)::int AS n FROM public_hospital_stores
    WHERE store_listing = 'listed' AND latitude IS NOT NULL AND longitude IS NOT NULL
  `;
  const sources = await sql<{ source_platform: string; n: number }>`
    SELECT source_platform, count(*)::int AS n FROM public_hospital_stores
    WHERE store_listing = 'listed'
    GROUP BY source_platform ORDER BY n DESC LIMIT 12
  `;
  return {
    total: total[0]?.n ?? 0,
    mappable: geo[0]?.n ?? 0,
    sources,
    notice:
      '플랫폼·주소록에서 수집한 병원 연락처·주소 카탈로그입니다. 진료·광고 추천이 아니며 운영·위치는 방문 전 확인하세요.',
  };
}

export async function publicCatalogSearch(params: URLSearchParams) {
  const q = (params.get('q') || '').trim().slice(0, 80);
  const region = (params.get('region') || '').trim();
  const platform = (params.get('platform') || '').trim();
  const limit = Math.min(100, Math.max(1, Number(params.get('limit') || 40)));
  const offset = Math.max(0, Number(params.get('offset') || 0));

  const clauses = [`store_listing = 'listed'`];
  const args: unknown[] = [];
  if (q) {
    args.push(`%${q}%`);
    const p = `$${args.length}`;
    clauses.push(`(name ILIKE ${p} OR address ILIKE ${p} OR district ILIKE ${p})`);
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
  args.push(limit, offset);
  const text = `
    SELECT id, external_key, source_platform, name, phone, address, region, district,
           rating, review_count, profile_url, latitude, longitude, geocode_status
    FROM public_hospital_stores
    WHERE ${clauses.join(' AND ')}
    ORDER BY review_count DESC NULLS LAST, name ASC
    LIMIT $${args.length - 1} OFFSET $${args.length}
  `;
  const items = await dbQuery<Row>(text, args);
  return { items, count: items.length };
}

export async function publicCatalogNearby(params: URLSearchParams) {
  const lat = Number(params.get('lat'));
  const lon = Number(params.get('lon') ?? params.get('lng'));
  const radius = Number(params.get('radius') || 5);
  const limit = Math.min(150, Math.max(1, Number(params.get('limit') || 80)));
  const q = (params.get('q') || '').trim().slice(0, 80);
  const platform = (params.get('platform') || '').trim();
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error('위도/경도가 필요합니다');
  }
  if (radius < 0.5 || radius > 30) throw new Error('반경은 0.5~30km');

  const sql = db();
  const rows = await sql<Row>`
    SELECT id, source_platform, name, phone, address, region, district,
           rating, review_count, profile_url, latitude, longitude, geocode_status, coordinate_source
    FROM public_hospital_stores
    WHERE store_listing = 'listed'
      AND latitude IS NOT NULL AND longitude IS NOT NULL
      AND latitude BETWEEN ${lat - 0.35} AND ${lat + 0.35}
      AND longitude BETWEEN ${lon - 0.45} AND ${lon + 0.45}
    LIMIT 800
  `;

  const qLower = q.toLowerCase();
  const results: Row[] = [];
  for (const row of rows) {
    if (platform && String(row.source_platform) !== platform) continue;
    if (qLower) {
      const hay = `${row.name} ${row.address} ${row.district}`.toLowerCase();
      if (!hay.includes(qLower)) continue;
    }
    const d = haversine(lat, lon, Number(row.latitude), Number(row.longitude));
    if (d > radius) continue;
    results.push({
      ...row,
      distance_km: Math.round(d * 100) / 100,
      catalog: true,
      sponsored: false,
      store_type: 'public_catalog',
    });
  }
  results.sort((a, b) => Number(a.distance_km) - Number(b.distance_km));
  const total = results.length;
  return {
    items: results.slice(0, limit),
    count: total,
    shown: Math.min(limit, total),
    capped: total > limit,
    center: { lat, lng: lon },
    notice:
      '공공·플랫폼 주소록 카탈로그(메디픽 스마트스토어). 유료광고·구독 병원과 별도이며 좌표는 구·군 중심 추정일 수 있습니다.',
  };
}

export async function publicCatalogStore(id: number) {
  const sql = db();
  const rows = await sql<Row>`
    SELECT * FROM public_hospital_stores WHERE id = ${id} AND store_listing = 'listed' LIMIT 1
  `;
  if (!rows[0]) throw new Error('카탈로그 항목 없음');
  return rows[0];
}
