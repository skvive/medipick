# MEDIPICK v6 — 고객 납품 UI/UX 구현 설계 및 검수 기록
기준: 2026-11-09 · 대상: https://medipick.lexid.site/ · 저장소: skvive/medipick

## 제작 원칙
- 기존 Next.js 라우트·API·DB·인증·예약 상태·의료광고 고지 및 데이터 출처 구조를 보존한다.
- 한 플랫폼의 디자인 언어로 소비자용 검색 화면과 병원용 업무 화면을 연결한다.
- 의료·병원·전문의·거리·별점·예약 가능 여부는 확인되지 않은 데모 수치로 채우지 않는다.
- AI 생성 연출 이미지는 실제 병원 또는 실제 의료진 사진으로 표시하지 않는다.
- 외부 지도, HIRA, 실손보험, 청구, 구독 결제 등 미연결 서비스는 완료로 표현하지 않는다.

## 1. UI 토큰
| 속성 | 값 |
|---|---|
| Clinical Blue | #1769F8 |
| Deep Blue | #1056CC |
| Navy | #0D2E5C |
| Body | #213A61 |
| Canvas | #F5F8FD |
| Border | #DAE6F6 |
| Desktop container | 최대 1280px |
| Desktop / mobile gutter | 24px / 16px |
| Controls | 44px 이상, 주요 CTA 48px 권장 |
| Type | Noto Sans KR, 본문 14–16px, 단서 12px 이상 |
| Card radii | 12–20px |
| Status | loading / empty / failed / verified / pending / demo 명시 |

## 2. 이미지 아트 디렉션
- 히어로 비주얼: 원본 AI 생성 UI 콘셉트에서 인물 장면만 크롭한 797×327 px WebP (약 59KB).
- 소스: `web/assets/photos/medipick-care-team-v6.webp`; 별도 보관 MEDIPICK Google Drive.
- 이미지 사용: 실제 병원 또는 의료진을 나타내지 않는 AI 생성 연출임을 대체텍스트로 표기.
- 권장 정규격: 데스크톱 히어로 16:9 또는 2:1, 모바일 안전 크롭 4:3, 의료 정보 카드 4:3, 리스트 썸네일 1:1.
- 검증된 기존 `cat01–cat12.webp`, 기존 브랜드 로고·아이콘 재사용. 가상 의료기관의 촬영사진으로 오인될 자산은 교체 전 검증.

## 3. 17페이지 수정 범위
| 경로 | 시각 개선 |
|---|---|
| / | 히어로 높이 축소, 검색 강조, 검색·지도·리스트 조기 노출, 서비스 네이밍 수정, AI 연출 이미지 고지 |
| /smart-store | 히어로 축소, 중복 서비스 메뉴를 지도 아래로 이동, 검색·지도·목록 중심 |
| /hospital | 로딩 카드 문구와 누락·잘못된 ID의 빈 상태 및 재검색 링크 |
| /consult | 질문 예시 앞당김, 대화 70:30 비율, 사진 동의·응급 안전 안내와 전송 CTA 강화 |
| /doctors | 네이비·블루 공통 디자인 시스템 연결 |
| /health-content | 히어로와 검색 폼 축소, 콘텐츠 카드 강조 |
| /insurance-claims | 개인보험과 내부 청구 초안 영역의 구획 유지 및 명칭 구분 |
| /my-health | 민감정보 고지와 입력부 간격·명도 개선 |
| /clinic-ops | 표·접근 키·상태 정보 카드 강화 |
| /clinic-access | 권한 영역 컨트롤 및 위험 액션 시각적 구분 |
| /doctor-finance | 인증/요약/수가/청구/정산 바로가기, 2열 → 모바일 1열 |
| /marketing-console | 초안·동의·검수·발송 제한 UI 토큰 통일 |
| /advertiser | 성과 리포트 접근/빈 상태 타이포그래피 정리 |
| /premium-admin | 구독·지도 검증·게시물 승인 업무 카드 체계 통일 |
| /integrations | 외부 API 연결 상태 명도·비밀번호 입력 스타일 통일 |
| /admin | 로고·로그인·대시보드·테이블 클리니컬 블루 통일 |
| /offline | 새로고침과 홈 복귀 동시 제공, 독립 인라인 스타일 유지 |

## 4. 고객 납품 QA 게이트
1. 17페이지 × 5개 폭(320, 390, 768, 1024, 1440px)에서 가로 넘침, 중복 DOM ID, 로컬 이미지 누락 여부.
2. Chromium/Firefox/WebKit 비교 스크린샷 (GitHub Actions).
3. 모바일 햄버거/Tab/Escape/포커스, 44px CTA, 중요 텍스트 대비.
4. 홈페이지 첫 화면 1440×900에서 검색과 지도·목록 상단 동시 확인.
5. 로딩·빈 결과·API 실패·권한 거부 분기, 브라우저 실제 API 테스트(미실행이면 반드시 별도 표시).
6. 실병원 위치는 검증된 `exact` 좌표만 표시. 광고 구독은 별도 라벨.
7. HIRA/GCP/OAuth/Neon/결제/실예약/의료 민감정보 실계정 검증은 별도 운영 승인 게이트.
8. npm 보안 취약점 및 보안 환경 변수·권한·CSRF/세션 검증은 디자인 테스트와 분리.

## 5. 릴리스·롤백
- 코드 변경은 기존 `skvive/medipick`와 `medipick-lexid`만 사용. 새 리포·DB 생성 없음.
- DB 마이그레이션 및 기존 원본 삭제 없음.
- Preview와 GitHub QA를 먼저 확인한 뒤 기존 main에 PR 병합하고 검증된 SHA로 운영 배포.
- 실제 API 및 운영 의료기관 정보의 검증이 끝나지 않으면 서비스 전체 상용 인증 완료라 주장하지 않음.
