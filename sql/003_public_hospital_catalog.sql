-- 공공·플랫폼 병원 주소록 카탈로그 (스마트스토어형 목록 DB)

CREATE TABLE IF NOT EXISTS public_hospital_stores (
  id SERIAL PRIMARY KEY,
  external_key TEXT NOT NULL UNIQUE,
  source_platform TEXT NOT NULL DEFAULT '',
  store_listing TEXT NOT NULL DEFAULT 'listed',
  name TEXT NOT NULL,
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  region TEXT DEFAULT '',
  district TEXT DEFAULT '',
  postal_code TEXT DEFAULT '',
  area_label TEXT DEFAULT '',
  rating TEXT DEFAULT '',
  review_count INT DEFAULT 0,
  event_count INT DEFAULT 0,
  summary TEXT DEFAULT '',
  profile_url TEXT DEFAULT '',
  collection_method TEXT DEFAULT '',
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  geocode_status TEXT NOT NULL DEFAULT 'pending',
  coordinate_source TEXT DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_phs_region ON public_hospital_stores (region, district);
CREATE INDEX IF NOT EXISTS idx_phs_name ON public_hospital_stores (name);
CREATE INDEX IF NOT EXISTS idx_phs_listing ON public_hospital_stores (store_listing);
CREATE INDEX IF NOT EXISTS idx_phs_geo ON public_hospital_stores (latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

CREATE TABLE IF NOT EXISTS geo_district_cache (
  region TEXT NOT NULL,
  district TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  source TEXT NOT NULL DEFAULT 'nominatim',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (region, district)
);
