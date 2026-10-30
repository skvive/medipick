import type { Row } from '@/lib/medipick/catalog-types';

export function catalogPremiumActive(row: Row): boolean {
  if (row.listing_tier !== 'premium' || row.marketing_active !== true) return false;
  const exp = row.marketing_expires_at;
  if (!exp) return true;
  return new Date(String(exp)).getTime() > Date.now();
}

export function catalogHeroImage(row: Row): string {
  const custom = String(row.hero_image_url || '').trim();
  if (custom && /^https?:\/\//i.test(custom)) return custom;
  const n = (Number(row.id) % 12) + 1;
  return `/assets/photos/cat${String(n).padStart(2, '0')}.jpg?v=20261030`;
}

/** API/UI 공통: 무료(공공 주소록) vs 월구독 프리미엄 카드 */
export function presentCatalogStore(row: Row, distanceKm?: number) {
  const premium = catalogPremiumActive(row);
  const trade = String(row.trade_category || '의료기관').trim() || '의료기관';
  const base = {
    id: row.id,
    name: row.name,
    phone: row.phone,
    address: row.address,
    region: row.region,
    district: row.district,
    source_platform: row.source_platform,
    profile_url: row.profile_url,
    summary: row.summary,
    rating: row.rating,
    review_count: row.review_count,
    latitude: row.latitude,
    longitude: row.longitude,
    geocode_status: row.geocode_status,
    coordinate_source: row.coordinate_source,
    trade_category: trade,
    listing_tier: premium ? 'premium' : 'free',
    is_premium: premium,
    priority_boost: Number(row.priority_boost || 0),
    distance_km: distanceKm,
    catalog: true,
    sponsored: premium,
    store_type: 'public_catalog',
  };
  if (premium) {
    return {
      ...base,
      ui: {
        variant: 'premium' as const,
        badge: '월구독 · 스마트스토어 PRO',
        hero_image: catalogHeroImage(row),
        video_url: row.video_url || '',
        google_blog_url: row.google_blog_url || '',
        naver_blog_url: row.naver_blog_url || '',
        disclosure: '유료 구독으로 강화된 정보창입니다. 진료 실력·순위를 의미하지 않습니다.',
      },
    };
  }
  return {
    ...base,
    ui: {
      variant: 'free' as const,
      badge: '공공 주소록 · 무료',
      sample_label: '기본 정보 샘플',
      disclosure:
        '공공·플랫폼에서 수집한 연락처·주소입니다. 광고 없이 무료로 노출됩니다. 마케팅 업그레이드는 월 구독으로 신청할 수 있습니다.',
    },
  };
}

export function sortCatalogNearby(a: Row, b: Row): number {
  const pa = catalogPremiumActive(a) ? 1 : 0;
  const pb = catalogPremiumActive(b) ? 1 : 0;
  if (pa !== pb) return pb - pa;
  const boost = Number(b.priority_boost || 0) - Number(a.priority_boost || 0);
  if (boost !== 0) return boost;
  return Number(a.distance_km) - Number(b.distance_km);
}
