-- 메디픽 스마트스토어: 공종(진료분야)·무료/프리미엄 마케팅 티어

ALTER TABLE public_hospital_stores ADD COLUMN IF NOT EXISTS trade_category TEXT NOT NULL DEFAULT '의료기관';
ALTER TABLE public_hospital_stores ADD COLUMN IF NOT EXISTS listing_tier TEXT NOT NULL DEFAULT 'free';
ALTER TABLE public_hospital_stores ADD COLUMN IF NOT EXISTS marketing_active BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public_hospital_stores ADD COLUMN IF NOT EXISTS marketing_expires_at TIMESTAMPTZ;
ALTER TABLE public_hospital_stores ADD COLUMN IF NOT EXISTS priority_boost INT NOT NULL DEFAULT 0;
ALTER TABLE public_hospital_stores ADD COLUMN IF NOT EXISTS hero_image_url TEXT DEFAULT '';
ALTER TABLE public_hospital_stores ADD COLUMN IF NOT EXISTS video_url TEXT DEFAULT '';
ALTER TABLE public_hospital_stores ADD COLUMN IF NOT EXISTS google_blog_url TEXT DEFAULT '';
ALTER TABLE public_hospital_stores ADD COLUMN IF NOT EXISTS naver_blog_url TEXT DEFAULT '';
ALTER TABLE public_hospital_stores ADD COLUMN IF NOT EXISTS linked_provider_id INT;

CREATE INDEX IF NOT EXISTS idx_phs_tier ON public_hospital_stores (listing_tier, marketing_active);
CREATE INDEX IF NOT EXISTS idx_phs_trade ON public_hospital_stores (trade_category);

COMMENT ON COLUMN public_hospital_stores.trade_category IS '공종·진료과목 라벨 (주소록 카탈로그)';
COMMENT ON COLUMN public_hospital_stores.listing_tier IS 'free=공공주소록 기본, premium=월구독 마케팅 업그레이드';
