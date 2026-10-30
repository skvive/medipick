# 메디픽 스마트스토어 (공공병원 카탈로그) 기획

[v1 · 2026-10-30 · MVP `/smart-store` 반영]

## 네이버 벤치마크 (역할 분리)

| 네이버 | 역할 | 메디픽 대응 |
|--------|------|-------------|
| **스마트스토어** | 온라인 상품·주문·배송·리뷰·스토어 SEO | **구독·광고 의료기관** (`providers`) — 예약 요청·콘텐츠·스폰서 |
| **스마트플레이스** | 지도·주소·전화·영업시간·리뷰·예약·지역 검색 | **메디픽 스마트스토어** (`public_hospital_stores`) — 공공·플랫폼 **주소록** 지도 노출 |
| 스마트스토어 ↔ 플레이스 연동 | 스토어에 오프라인 매장 연결 | 홈 **내 주변**에서 구독(광고) + 카탈로그 레이어 동시 표시 |
| 검색·필터·거리순 | 키워드·카테고리·랭킹 | 이름/지역 검색 + **현위치 반경** + 출처(플랫폼) 필터 |
| 스토어 상세 | 상품·정책·문의 | 카탈로그 **팝업**: 주소·전화·출처·원문 링크 (진료 추천 아님) |

메디픽은 **의료 “상품” 판매가 아닌 주소록·연락처 카탈로그**이므로, 네이버 기준으로는 **스마트플레이스형 지도 + 스마트스토어형 목록 UI**를 결합한 **하이브리드**로 정의한다.

## MVP 범위 (이번 반영)

- 전용 화면: **`/smart-store`**
- **현위치 / 시연 위치** 기준 반경 검색 (`/api/public-catalog/nearby`)
- **지도 마커 + 좌측 목록** — 목록·마커 클릭 시 **동일 InfoWindow 팝업**
- **이름 검색**, **출처 플랫폼** 필터, 반경 1~20km
- DB: `public_hospital_stores` (~3.5만 건, 좌표 매핑 ~2.9만)
- API 키: `GOOGLE_MAPS_BROWSER_KEY` (Maps JavaScript API)

## Phase 2 (미구현)

- Marker Clusterer (밀집 지역)
- 구·군 정밀 geocode (`PUBLIC_CATALOG_GEOCODE`)
- 메디픽 구독 병원과 카탈로그 **통합 상세** (단일 drawer)
- 즐겨찾기·최근 본 스토어 (로컬/계정)
- Admin: listing on/off, 출처 배치 재수집

## 법·표시 원칙

- 카탈로그는 **플랫폼·공공 주소록 수집** — 진료·광고 **추천·순위 아님**
- 좌표 **구·군 중심 추정** 가능 — 방문 전 **주소·전화 확인**
- 유료 구독 병원과 UI·라벨 **분리** (스폰서 vs 주소록)

## API

| Method | Path | 용도 |
|--------|------|------|
| GET | `/api/public-catalog/stats` | 전체·매핑 건수·출처별 집계 |
| GET | `/api/public-catalog/nearby?lat=&lng=&radius=&q=&platform=&limit=` | 위치 기반 (lng/lon 모두 지원) |
| GET | `/api/public-catalog/search?q=&region=&platform=` | 전국 텍스트 검색 (지도 없을 때) |
| GET | `/api/public-catalog/store/:id` | 단건 상세 |

## 데이터

- `sql/003_public_hospital_catalog.sql`
- `npm run catalog:import` · `data/catalog/README.md`
