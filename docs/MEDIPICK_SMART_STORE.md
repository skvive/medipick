# 메디픽 스마트스토어 (공공병원 카탈로그) 기획

[v2 · 2026-10-30 · 공종·무료/월구독 PRO · Dropbox 원본 import]

## 네이버 벤치마크 (역할 분리)

| 네이버 | 역할 | 메디픽 대응 |
|--------|------|-------------|
| **스마트스토어** | 온라인 상품·주문·SEO | **구독·광고 의료기관** (`providers`) |
| **스마트플레이스** | 지도·주소·리뷰·예약 | **스마트스토어 카탈로그** (`public_hospital_stores`) |
| 유료 스토어 부가 | 상세페이지·쿠폰·라이브 | **월 구독 PRO** — 지도 팝업·블로그·동영상·우선 노출 |

## 데이터 원본 (전량 등록)

| 파일 | 내용 |
|------|------|
| `unni_hospitals.csv` | 강남언니 등 (~1.2k) |
| `med_platforms_hospitals.xlsx` | 여신티켓·똑닥·바비톡 등 (~3.4만) |

로컬 import:

```powershell
cd medipick-repo
.\scripts\import-catalog-from-dropbox.ps1
```

환경: `DATABASE_URL`, `IMPORT_UNNI_CSV`, `IMPORT_PLATFORMS_XLSX` (스크립트가 Dropbox 경로 기본 설정)

Neon 테이블 `public_hospital_stores` — **공종** `trade_category`, 좌표, `store_listing=listed`.

## 요금·노출 티어

### 무료 (Free · 공공 주소록)

- **대상**: import된 모든 카탈로그 (광고·월납 없음)
- **노출**: 지도 마커 + 목록 + **기본 샘플 팝업** (텍스트: 공종·주소·전화·출처·원문 링크)
- **성격**: 공공·플랫폼 **연락처 정보** — 진료 추천·실력 순위 **아님**
- **표시**: `공공 주소록 · 무료` 배지

### 월 구독 PRO (Premium · 마케팅 업그레이드)

병원·의원이 **별도 월 구독** 시 (메디픽 구독 병원 `providers`와 연동 가능):

| 기능 | 설명 |
|------|------|
| **PRO 지도 팝업** | 히어로 이미지, 소개 요약, **YouTube/동영상 링크** (새 창) |
| **블로그 연동** | **Google 블로그 · 네이버 블로그** 새 창 링크 (광고·콘텐츠 유입) |
| **주변 검색 우선** | 같은 반경 내 **목록·마커 정렬 최상단** (`priority_boost` + `marketing_active`) |
| **시각 구분** | 핑크 PRO 마커·목록 하이라이트, `월구독 · 스마트스토어 PRO` 라벨 |

관리자 API (데모·운영):

```http
POST /api/admin/public-catalog/:id/marketing
{
  "listing_tier": "premium",
  "marketing_active": true,
  "marketing_expires_at": "2099-12-31T23:59:59+09:00",
  "trade_category": "피부과",
  "hero_image_url": "https://...",
  "video_url": "https://...",
  "google_blog_url": "https://...",
  "naver_blog_url": "https://...",
  "priority_boost": 50
}
```

시연 시드: `node scripts/seed-catalog-marketing-demo.mjs`

## 이용자 UI

- **`/smart-store`**: 현위치·반경·공종·출처 필터, 목록↔지도 팝업 연동
- **홈 · 내 주변**: 구독(광고) 병원 + 카탈로그 레이어, 카드 클릭 → 지도 팝업

## API

| Method | Path |
|--------|------|
| GET | `/api/public-catalog/stats` — `pricing`, `premium_listings` |
| GET | `/api/public-catalog/nearby?lat&lng&radius&q&platform&trade&limit` |
| GET | `/api/public-catalog/search?q&region&platform&trade` |
| GET | `/api/public-catalog/store/:id` — `ui.variant` free \| premium |
| POST | `/api/admin/public-catalog/:id/marketing` |

## 법·표시

- 무료 카탈로그 = **수집 주소록** · PRO = **유료 정보 강화** (순위·진료 품질 의미 없음)
- PRO는 **광고 표시** (`sponsored: true` on API) — 이용자에게 라벨 필수
- 좌표 구·군 추정 가능 → 방문 전 확인

## SQL

- `003_public_hospital_catalog.sql` — 기본 테이블
- `004_catalog_marketing_tiers.sql` — 공종·PRO 컬럼
