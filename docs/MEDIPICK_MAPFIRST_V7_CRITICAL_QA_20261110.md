# MEDIPICK v7 — 지도 중심 홈페이지 · 병원 스마트스토어/Blogger
검수일: 2026-11-10 (KST) · 기존 `skvive/medipick` 이어서 개발 · DB 마이그레이션/원본 삭제 없음

## 1. 핵심 P0 발견과 해결
1. **메인 스크롤 과다:** 기존 한 페이지에 히어로, 광고, 건강정보, 영상, 위치, 상세 검색, 카드, 후기 등이 겹쳐 핵심 지도를 찾기 어려움.
   - 개선: `/`은 지도 중심으로 완전 재구성. 검색·위치/진료과·Google 지도·병원 목록·서비스 링크만 노출.
   - 기존 20KB+ 홈 원본과 JS 기능 전체를 `/portal`에 복사 보존. 상세 탐색 `?nav=explore`, `?nav=content`, `?provider=`는 `/portal`로 이어짐.
2. **내 주변 검색 API 선택 버그:** 기존 스크립트는 '추정핀 보기' 여부로 반경검색 사용 여부를 결정하여 사용자가 위치 허용해도 주소록 검색이 실행됨.
   - 개선: GPS 요청은 현위치 버튼 클릭 시에만; GPS 허용 시 즉시 `/api/public-catalog/nearby` 정확 좌표 우선, 반경 3km(1~30km 옵션). 기본/현위치 상태와 권한거부 메시지 구분.
3. **좌표 안전:** Neon `medipick-lexid` 현재 읽기전용 실측 (2026-11-10)
   - `public_hospital_stores` 등록 후보 **30,391건**.
   - `geocode_status='exact'` 및 실제 좌표 동시 존재 **0건**.
   - `geocode_status='approx'` **29,386건**. 이는 실제 주소가 아닌 시도 중심 임시/추정값임.
   - 활성 `premium` 스토어 **0곳**, 그 중 Blogger 링크 활성 스토어 **0곳**.
   - 개선: 내부 정확 좌표 핀만 자동 표시, 추정핀 기본 비활성; 정확좌표 0건 시 별도 주소록 후보로 표시하고 가짜 거리·지도핀 제거.
4. **외부 실제 지도 장소 검색:** 현재 자체 정확 좌표가 0이므로 Google 지도 지도창만 뜨고 핀이 없을 가능성이 큼.
   - 개선: 사용자 직접 클릭 **Google 지도 병원 핀 검색** → Maps JavaScript API `places` 라이브러리 + `Place.searchNearby` (Places API New 필요).
   - 최대 15곳, 범위는 사용자 중심 0.5~30km, `hospital`, `doctor`, `dentist` 유형, `displayName`, `location`, `formattedAddress`, `googleMapsURI`만 요청.
   - **보라색 G핀**은 Google Places 외부 검색 결과, **파란색 핀**은 메디픽 정확좌표 검증 병원, **회색**은 사용자가 별도 선택한 비검증 추정좌표.
   - 사용자 클릭 시에만 Google Places API 호출(비용 발생 가능); 결과는 메모리에서만 사용하고 DB 저장/인증 상승 금지.
   - `GOOGLE_MAPS_BROWSER_KEY`는 Vercel **Production에 등록됨**(값 읽지 않음). Places API (New) 활성 상태, 실제 청구/쿼터 및 키 제한은 미검증. Preview에는 브라우저 키 미등록이므로 지도 그리기가 되지 않을 수 있음.
5. **병원 스마트스토어/구글블로그 입점:** 기존 구독 마케팅 및 의사 Blogger 소유권 흐름 재사용.
   - `/clinic-store`: 입점 안내, Google Blogger 연결 안내, 운영 검수 단계.
   - `/clinic-store?id=123`: 해당 병원이 **현재 활성 premium catalog**일 때만 공개 개별 병원 기본정보·주소/전화/Google Maps 링크·Blogger 최근 공개글(최대 6개).
   - `/premium-admin`: 보호된 관리자 API 이용해 주소록 병원 ID/구독 만료일/블로그 URL/대표 이미지/영상 저장. 담당자는 구독·광고 준수·블로그 소유권 수동 확인 의무.
   - `/api/clinic-store/[id]/posts`: premium 상태 확인, `https://*.blogspot.com`만 요청, 리다이렉트 거부·타임아웃·크기상한·HTML 제거·원문 URL 연결, 병원의 미검증 의료 주장 생성하지 않음.
   - 실제 병원 입점/Google Blogger 활성 등록 사례는 아직 **0곳**이므로 실제 데이터 콘텐츠 예시는 나오지 않으며, 운영자 승인이 필요.
6. **빈 상태 UI:** 초기 JS가 없는 `/clinic-store`가 완전 빈 화면이던 문제 발견 → 정적 온보딩 랜딩 표시로 수정.

## 2. 전문 디자이너 기준 정보 설계
- PC: 1360px 최대 폭, 검색 패널 2단, 지도 대 병원 목록 **2:1** 비율, 지도 및 결과 560px 높이, 하단 단순 4개 기능 카드.
- 모바일: 검색/현위치 CTA를 2열, 지도/목록 스택, 지도 310~350px, 결과 330~360px; 광고/설명은 서브페이지로 분리.
- 주요 CTA 44px 이상, 브랜드 Clinical Blue `#1769F8`, Navy `#102E5B`.
- 지도와 Google Place 데이터의 출처·광고·구독 상태를 시각적으로 구분.
- 검색 실패/0건/키 미등록/Places API 비활성/위치 거절 시 오류 및 복귀 동선을 제공.

## 3. 현재 한계 및 릴리스 게이트
- Google Places API (New)와 Google Maps JavaScript API의 실제 운영 페이지에서 키·도메인 제한·과금 활성 여부를 수동 E2E 확인해야 함. Static browser QA는 JS/API를 모의하지 않음.
- 병원 인증좌표의 실제 데이터 보강은 HIRA 공식 좌표·주소 매칭 후 별도 파이프라인 및 QA 필요. DB값을 추정좌표에서 정확좌표로 일괄 전환 **금지**.
- 의료기관 영업/진료/광고 준법 검수 및 실제 Blogger 소유권 확인 필요. 일반 지도 검색을 의료기관 인증으로 오인시키지 않을 것.
- 네온 실제 환자 민감정보 수집, 외부 AI 전송, 예약/결제 실거래 검수는 별도.
- 기존 CI에서 Chromium/Firefox/WebKit 각 페이지 5폭 레이아웃 및 DOM 검사, 추가 Node 계약 검사가 통과해야 릴리스.
- npm install 로그의 의존성 보안 취약점 12건(1 critical 포함)을 별도 우선 조치할 것. `npm audit fix --force` 무검증 적용 금지.
- Google Maps 핀 새 검색은 Google Map 브라우저 키가 있는 **운영 배포**에서만 검증 가능(Preview 환경의 키 유무 확인 필요).
- 기존 네온/블로그 콘텐츠/원본 드라이브 파일을 삭제·변경하지 않음.

## 4. 후속 우선순위
- P0: 서버에서 의료기관 공식 좌표 수집·출처 검증, 정확좌표 0건 해소.
- P0: Google Places API (New) 운영 호출 및 HTTP 키 제한/쿼터 검증.
- P1: 1~2개 실제 입점기관을 관리자 승인 후 Blogger 콘텐츠 테스트.
- P1: 병원 검색 정렬·반경·에러/빈 상태 E2E, 현위치 정확도 오차 및 모바일 지도.
- P1: 정보 갱신일·의료진 면허·진료시간/광고 고지 검증.
- P2: 기존 긴 포털 내부 콘텐츠 추가 분리 및 성능/웹접근성 개선.
