# MEDIPICK v5 — 메디픽 지도 통합 허브 · 원본 감사/이식 명세

작성일: 2026-11-05 (KST). 공개 운영 도메인: https://medipick.lexid.site/smart-store

## 대조한 실제 소스

1. 현재 GitHub `skvive/medipick` main 전체 tree(최초 확인 시 286개 Git 항목), Next.js/Neon/Vercel 운영 코드와 13개 기존 HTML 화면.
2. Google Drive 비공개 `1_사이트/MEDIPICK` 폴더(원본 소유권/읽기 권한 확인), `MEDIPICK_v4_3_PWA_Android_Complete.zip` ZIP 정상 열람(총 291개 ZIP 항목), v4.3 PWA/Android 문서·파일.
3. 공통 개발 스킬 `렉시드개발자료/공통개발스킬` 24개, `ChatGPT_Library` 기준 문서.
4. 기존 `docs/V4_MERGE_REVIEW.md`, `docs/MEDIPICK_SMART_STORE.md`, `web/assets/app.js`, `lib/medipick/handler.ts`, `lib/medipick/public-catalog.ts`.

## 재사용/이식 범위

| 원본 기능 | 재사용 경로 | 통합 지도에서의 처리 |
|---|---|---|
| 기존 사이트 메인·검색 | `/`, `/?nav=explore`, `GET /api/search` | 바로가기 + '입점·시연 병원' 탭 |
| 전국 병원 주소록 | `GET /api/public-catalog/search` | 지역·진료과·병원명 검색, 목록 렌더링 |
| 기존 주소록 상세 API | `GET /api/public-catalog/store/:id` | 목록에서 선택한 경우 상세 카드 열기 |
| Google Maps·주소 조회 | 기존 `smart-store.js` | 기존 지도 유지, 명시 클릭 시 Google 주소 임시 조회 |
| 현재 위치·반경 조회 | `GET /api/public-catalog/nearby` | 사용자 추정핀 선택 시에만, 명확한 경고 |
| 병원 상세·예약 요청 | `/hospital?id=...` | 등록·시연 병원 카드 연결, 예약 확정 아님 |
| AI 건강안내 | `/consult` | 서비스 바로가기, 진단 아닌 안내 |
| 의사 콘텐츠 | `/doctors` | 서비스 바로가기. 관련 없는 외부 영상 자동 추천 안 함 |
| 개인 건강노트 | `/my-health` | 서비스 바로가기 |
| Google·Neon 로그인 | `/auth/sign-in` | 기존 인증 라우트 그대로 사용 |
| 운영·입점 | `/admin` | 공개 입점 문의 링크, 관리자 권한 보존 |
| PWA v4.3 완성본 | `web/manifest.webmanifest`, `service-worker.js`, `offline.html`, `assets/pwa` | 신규 브랜딩 로고·아이콘으로 안전 이식. API/의료정보 오프라인 캐시 없음 |
| v4.3 Android 프로젝트 | Drive 원본 ZIP | 별도 보관. 웹 페이지에 APK/Gradle 파일을 중복 복사하지 않음 |

## 로고/브랜디드 디자인

- 슬로건: **내 근처 병원찾기, 메디픽**
- 메인 로고: M/의료십자가 복합심벌, 임상 블루·바이올렛 그라데이션, 글자 MEDIPICK, 한글 태그라인
- SVG 두 종 `assets/logo-full.svg`·`assets/favicon.svg`, 동일 모티프 PWA 192/512 PNG
- 지도 섹션: 데스크톱 좌측 주소록 카드·우측 Google 지도 / 모바일 세로 스택, 상단 7개 통합 서비스 동선
- 폼/상태 UI: 주소록 / 입점·시연 병원 모드, 지역 드롭다운, 진료과 빠른 버튼, 검색·주소 상세·임시핀 동작
- 파일 중복 방지: 기존 앱 진단/검색/개인정보 로직을 다른 엔진으로 덮어쓰지 않음.

## 데이터 안전 및 정직한 표기

- 운영 DB 원본 레코드를 삭제/변경하지 않음.
- 35,458건의 원본 카탈로그 중 검색결과 페이지 5,067개 제외 → 공개 병원 주소록 후보 30,391건.
- 실제 위치 인증 완료 좌표 **0건**. 추정 좌표 29,386개는 실제 병원 위치가 아님. 기본 지도 핀 표시 안 함.
- 초기 화면은 **서울 지역 주소록 후보**를 텍스트 목록으로 보여주며, 지도 핀과 실제 거리로 오인하지 않도록 명시.
- 입점 병원에는 데모 데이터가 포함됨. 실병원/예약 확정 정보로 허위 표시하지 않고 상세 페이지에 연결.
- 공식 외부 검증처: 공공데이터포털 「전국 병의원 현황」 / HIRA 「병원정보서비스」. 현재 메디픽 원본 DB 전체의 실제 수집처로 단정하지 않음.
- 정확도 불명 주소에 대해 대량 Google Geocoding을 실행하거나 결과를 영구 DB에 쓰지 않음.

## 검증 체크리스트

- GitHub의 HTML/JS와 로고 SVG, 새 PWA manifest/JS 검증.
- 빌드: Vercel Preview -> READY, 운영 배포 전 주요 경로 HTTP 상태 검사.
- 확인: `/`, `/smart-store`, `/assets/logo-full.svg`, `/assets/pwa/icon-192.png`, `/manifest.webmanifest`, `/service-worker.js`, `/api/public-catalog/stats`, `/api/public-catalog/search?region=서울&limit=3`, `/api/search?category=전체&region=서울`, `/hospital?id=1`, `/consult`, `/doctors`.
- 실제 모바일 앱 설치, Google Geocoder 결제키/브라우저 E2E, 의료기관 위치 인증은 별도 현장 검증 필요.
