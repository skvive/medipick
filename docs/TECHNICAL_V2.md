# MEDIPICK v2.0 구현 및 연동 가이드

## 기능 요약

| 기능 | 백엔드 | 클라이언트 | 상태 |
|---|---|---|---|
| 카테고리 검색 | `/api/search` | 메인 진료과 카드/필터 | 로컬 데모 작동 |
| 자연어 보조 검색 | `/api/ai/answer` | 스폰서 별도 표시/근거 원문 | 로컬 규칙/편집자료 작동 |
| 스폰서 표시 | `ads` + `subscriptions` | 유료광고 라벨 | 광고·구독·심의 3중 게이트 |
| 내 주변 구독병원 | `/api/nearby?lat=37.5&lng=127&radius=10` | 현위치·반경·진료과 | 거리 계산 작동; Google Maps SDK 실키 미검증 |
| Google 지도 | `locations` table + public browser key | Google Maps JavaScript API | 키 발급 시 구동 예정; 실키 미연결 |
| 구독 관리 | `POST /api/admin/subscriptions` | `/premium-admin` | 작동 |
| 위치/Place ID 관리 | `POST /api/admin/locations` | `/premium-admin` | 운영자 입력 작동; 자동 Places 검증 미구현 |
| 의사 Blogger 연결 | `/api/blog/request` + `/api/blog/verify` | `/doctors` | URL·토큰·검증/승인 상태 작동; Google 네트워크 실요청 미검증 |
| Blogger 승인·수집 | `POST /api/admin/blog-links/approve` / `import` | `/premium-admin` | 편집자 승인/수집 경로 작동; 실발행 미검증 |
| 의료 콘텐츠 검수 | `content.approved` | `/admin` | 작동 |
| 실제 예약 | `/api/appointments` | 상세 패널 | **예약 요청 접수만**, 병원 확정·전송 미구현 |
| 광고주 실적 | `events` 집계 | `/advertiser` | 로컬 이벤트 데이터 검증 |

## 필수 환경변수

Windows 터미널을 열고 `set GOOGLE_MAPS_BROWSER_KEY=발급키` 후 `run_windows.bat` 실행. PowerShell에서는 `$env:GOOGLE_MAPS_BROWSER_KEY='발급키'`.

- Google Cloud 프로젝트에서 Maps JavaScript API 활성화 및 결제 설정 후 웹사이트 referrer/API 제한이 걸린 키 발급. https://developers.google.com/maps/documentation/javascript/get-api-key
- 키는 **브라우저용 공개 키**로 설계됨(비밀 서버키 아님); HTTP 리퍼러 제한과 비용한도 및 계정 보호 필수. 실사이트 배포 URL에 맞게 제한.
- `GOOGLE_MAPS_BROWSER_KEY` 없으면 Google 지도인 척하는 그림을 표시하지 않고 **거리순 구독병원 목록 + 지도 연결 안내**를 제공합니다.
- 운영자가 직접 확인한 위도/경도와 Google Place ID를 관리할 수 있지만, 현재 Place ID와 의료기관 명칭이 자동 일치하는지 Google Places 서버 검증하는 로직은 구현되지 않았습니다. 상용화 시 자동 매칭 + 검수/수정 UI 필요.
- Google Places 데이터를 DB에 무단 저장하지 않음. 장소 사진·리뷰 복사 수집은 구현하지 않음. Google 지도 SDK의 원본 저작권·저작자 표시를 가리지 않음.

## API 테스트 예시

```sh
curl 'http://127.0.0.1:8765/api/nearby?lat=37.4979&lng=127.0276&radius=10&category=%ED%94%BC%EB%B6%80%EA%B3%BC'
curl -H 'Content-Type: application/json' -d '{"query":"여드름 피부과 검색","category":"피부과","external_consent":false}' http://127.0.0.1:8765/api/ai/answer
```

테스트용 샘플 기관의 좌표는 **구역 중심을 설명하기 위한 가상 위치**입니다. 실제 병원 위치가 아니므로 일반 소비자에게 사실로 공개해서는 안 됩니다. 정상 운영에서는 공공기관 출처·병원 담당자 확인·Google Place ID 매칭 검수 기록이 필요합니다.

## 개인정보와 AI 검색

- 내부 광고 통계에 **자유문 건강 검색어를 저장하지 않음**. 질의 카테고리/일반 이벤트만 집계.
- GA4 전송 때도 원문 증상·개인 연락처·기관 식별자를 이벤트 파라미터로 보내지 않음.
- 외부 AI 호출은 별도 체크 동의 + API 키가 필요한 선택 기능. 실제 민감 건강정보 위험평가 완료 전 상용 외부 AI 사용하지 말 것.
- 위치는 브라우저 위치 API 승인 후 쿼리에 사용, 병원 광고주 데이터로 전달하지 않음.
- 예약자 이름·전화번호는 디버그 로그에 기록하지 않도록 운영. 데모 DB 파일은 ZIP에 포함하지 않음.
- 상용 배포에는 관리자 RBAC, TLS, 동의철회·삭제·보관정책, 감사 로그, 접근 제한, 웹방화벽, 속도 제한, 백업 암호화, 외부 보안테스트 필수.

## 선배치 정책

```
카테고리/AI 질문 → 운영자 승인된 관련 병원 후보
 ├─ (유효 결제 구독 + 법규 심사 + 승인 광고 캠페인)
 │     → 스폰서 블록 우선 표시, 유료광고 라벨
 └─ 일반 검색 결과/의사 콘텐츠 원문
       → 출처 검증·편집 순서 (의료 수준 등급 아님)

근처 검색 → 유효 결제 구독 + 규정 심사 + 위치 등록 완료 → 거리순 출력
```

이 제품의 근처 검색은 **“전체 병원 중 가까운 곳”이 아니라 “메디픽 유료 구독병원 중 가까운 곳”**입니다. 페이지·API 응답·빈 결과에 이를 분명히 적었습니다.

## Blogger 공개 계정 연결 흐름

1. `/doctors`에서 미리 등록된 의료진 선택 + `https://계정.blogspot.com` 등록.
2. 발급된 고유 코드를 블로그 공개 글에 게시.
3. 검증 요청: 서버는 고정된 Blogspot Atom 피드에 대해 코드 포함 여부 확인(동일 도메인, 리디렉션 거부).
4. 운영자가 `/premium-admin`에서 검증 상태를 확인하고 승인.
5. 운영자가 콘텐츠 메타데이터를 불러오면 제목·요약·원문 URL만 **검수 대기** 등록.
6. `/admin` 콘텐츠 검수 승인 이후에만 정보 페이지에 표시.

**구글 계정 비밀번호 불필요.** 단, 공개 블로그의 코드 게시만으로 실제 의료진 실명이 입증되지는 않으므로 병원·의료진 적법성은 별도 확인해야 함. 실제 Google OAuth, Blogger 자체 도메인, YouTube 채널 소유자 인증, 예약 캘린더 동기화는 아직 연결되지 않음.

## 공식 문서

- Google Maps JavaScript API: https://developers.google.com/maps/documentation/javascript/get-api-key
- Google Maps Places 정책: https://developers.google.com/maps/documentation/places/web-service/policies
- Blogger by URL: https://developers.google.com/blogger/docs/3.0/reference/blogs/getByUrl
- Blogger posts list: https://developers.google.com/blogger/docs/3.0/reference/posts/list
- Google Search YMYL: https://developers.google.com/search/docs/fundamentals/creating-helpful-content
- 대한민국 의료법 제56조: https://www.law.go.kr/LSW/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1031169873
