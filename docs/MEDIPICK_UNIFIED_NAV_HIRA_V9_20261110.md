# MEDIPICK v9 · 통합 메뉴 + HIRA API 검증 + 신규 의료 서비스

기준일: 2026-11-10 · 기존 저장소 skvive/medipick 재사용 · 데이터 삭제/DB 마이그레이션 없음.

## 변경된 공통 메뉴
홈 / 병원찾기 / 약국찾기 / 진료과목 / AI 건강상담 / 메디컬센터 / 입점안내

- 기존 19페이지와 신규 3페이지 모두 /assets/site-chrome.js + /assets/unified-navigation.css 사용
- 상세/관리 페이지의 옛 헤더는 DOM 보존하며 시각적으로 숨김. 메뉴 선택선 중복 제거.
- 데스크톱 활성항목은 파란색 배경 강조, 모바일은 접근성 지원 메뉴(ESC/포커스 순환)
- 약국찾기: /pharmacy (사용자 클릭 시 Google Places 신규 약국 조회; 현재 영업/24시간 여부 임의 생성 금지)
- 진료과목: /specialties (20분야 → 기존 병원 검색 필터)
- 메디컬센터: /medical-center (기존 /api/content 승인된 병원/의료 게시물, Blogger, 유튜브 원문 링크와 썸네일)
- 병원 스마트스토어: /clinic-store?id=병원ID, 활성 유료 구독과 관리자 승인 시 공개. 입점안내에 무료 템플릿/구독형/맞춤 외주 소개.

## HIRA 병원정보서비스
- 사용자가 업로드한 **2021년 OpenAPI 활용가이드**는 구형 `/hospInfoService1/getHospBasisList1` 설명.
- 공공데이터포털 현재 운영 서비스는 `https://apis.data.go.kr/B551182/hospInfoServicev2/getHospBasisList` (2026.05 수정).
- 비밀키는 오직 Vercel 민감변수 `HIRA_HOSPITAL_SERVICE_KEY` **Production**에만 저장. 본 저장소·브라우저·URL 표시·로그·문서에 값 기재 금지.
- QA 브랜치별 Preview 비밀변수 추가 시도는 Git 연결 요구로 실패. Production 변수 생성 성공 확인.
- /api/hira/status: 비밀키 노출 없이 서버↔HIRA 실제 소량(1건) 호출 후 resultCode, 응답 기록 수, 시각 표시.
- /api/hira/hospitals?lat=..&lng=..&radius=3000: 공개 병원 기본목록(최대 20개), XML→필드 선별 파싱, WGS84 위경도 한국 내 범위 검증, 사용자별 요청 제한·시간 제한·출처 표시.
- HIRA 공식 데이터는 녹색 H핀, Google Places는 보라색 G핀, DB 추정좌표는 별도 회색 비검증 핀. HIRA 좌표를 기존 DB의 미검증 좌표로 대체 기록하지 않음.
- HIRA 공식 API 성공은 **운영 배포 뒤 status 실제 호출 확인이 필수**. 환경변수 저장만으로 인증 성공이라고 보고 금지.
- 약국정보서비스는 별도 활용승인일 수 있음. 실제 HIRA 약국 인증·운영시간·24시간 판정은 아직 분리된 후속 승인 대상.
- 공공기관 데이터는 참고자료. 의료기관 개설/영업/진료가능 여부는 직접 재확인.

## 검수
- tests/unified-navigation-hira.test.mjs / tests/map-first-contract.test.mjs
- Chromium, Firefox, WebKit 화면검수 GitHub Actions. 실제 외부 API 통신은 별도 운영 확인.
- Next.js/Vercel 빌드·타입검사 통과와 URL 연결 상태 확인 후 기존 main 통합.
- 인증키는 사용자 제공 스크린샷에 노출된 상태이므로 권한 검증·배포 후 공공데이터포털에서 교체 발급 권고.
