# MEDIPICK 메디픽 · AI 의료정보 탐색 플랫폼

**버전:** 1.0.0 · 2026-10-29 · **유형:** 실제 실행 가능한 통합 데모/MVP 소스(상용 미승인)

> ⚠️ **중요:** 실행 시 표시되는 9개 병원·약국과 8명 의료진은 **모두 가상 데이터**입니다. 전국 의료기관 데이터가 탑재되거나, 심야약국 영업이 실시간 검증되거나, 실제 예약·카카오·문자 메시지가 발송되는 상태가 아닙니다. 운영자의 검수와 외부 기관 승인 없이는 상용 공개하지 마세요.

## 1. Windows 즉시 실행

1. ZIP을 압축 해제합니다.
2. Python **3.10 이상**을 설치합니다(Windows 실행 시 `py -3` 또는 `python` 명령 사용 가능해야 함).
3. `run_windows.bat` 더블클릭합니다. **외부 라이브러리 설치는 필요 없습니다.**
4. 브라우저에서 **http://127.0.0.1:8765** 에 접속합니다.
5. 운영자 콘솔 **http://127.0.0.1:8765/admin** 에 접속합니다.
6. 시연용 비밀번호는 `medipick-demo-2026` 입니다. **배포할 때는 반드시 환경변수로 변경**해야 합니다.

Mac/Linux: `./run_linux_mac.sh`, 혹은 `python3 server.py`.

사용 포트 변경: `python server.py --port 8888`.

웹 앱 기술스택: HTML5/CSS3/바닐라 JavaScript + Python 내장 HTTP 서버 + SQLite (서버/클라이언트 패키지 종속성 0). 이미지·로고는 자체 제작 SVG. Windows 로컬 시연에 초점을 맞춘 구현이며 실제 상용 트래픽에는 WSGI/ASGI 서버, PostgreSQL, 큐/캐시, 리버스 프록시 등 전환이 필요합니다.

## 2. 사용자 사이트 구현 현황

| 구분 | 현재 제공되는 기능 | 상태 |
|---|---|---|
| 메인/반응형 UI | 검색 히어로, 12개 의료 카테고리, 스폰서 영역, 의료지식 영상/블로그 카드 | 실행 가능 |
| 의료기관 검색 | 카테고리·지역·기관/연관 키워드 검색, 자료 출처 표시 | 실행 가능(데모 데이터) |
| AI 혼합 검색 | 자연어 의도 키워드 추출 + 승인 자료 요약. 외부 LLM 연결 선택 가능 | 로컬 규칙방식 실행 가능 / 외부 API 미검증 |
| 유료 광고 선배치 | 관련 카테고리 내부 우선순위 정렬 + 명시적 `유료광고 · 스폰서` 표시 | 실행 가능(광고 데모) |
| 기관 상세페이지 | 기본 정보, 전문과목, 의료진, 원문 의학 콘텐츠, 후기 및 예약 접수 | 실행 가능(데모) |
| 의료진 프로필 | 소속기관, 전문분야, 자격/학회, 검증 상태, 공식 프로필 원문 | 등록·표시 가능 |
| 의학 콘텐츠 | 의사 블로그/쇼츠/일반영상/가이드/근거자료 원문 링크, 운영자 승인 | 실행 가능(샘플과 수동 등록) |
| 방문 정보 후기 | 예약편의/시설안내/정보정확성/접근성만 수집, 승인 후 표시 | 실행 가능(심사형) |
| 예약 접수 | 이름/연락처/희망일시/동의 받아 SQLite 저장 | **요청 접수만 가능**; 실제 의료기관 예약 확정 아님 |
| 캘린더 | 관리자 예약별 `.ics` 다운로드 | 실행 가능 / Google Calendar 직접 쓰기는 미구현 |
| 카카오·SMS | 메시지 발송 대기함 및 공급사 HTTPS 웹훅 연동 스크립트 | 대기/설정 구조만; 미발송 |
| 통계 대시보드 | 검색·상세조회·광고노출·광고클릭·예약요청 카운트 | 실행 가능(내부 집계) |
| 광고주 전용 포털 | 기관별 집계 성과표·일별 노출 그래프, 30일 조회 키 발급·폐기 | 실행 가능(데모 이벤트) |
| Google Analytics 4 | `MEDIPICK_GA_ID` 설정 후 동의 기반 `search`/`generate_lead`/프로모션 이벤트 | 연결 구조 구현 / 실제 속성 ID 미입력 |
| 전국 병원 데이터 | HIRA CSV 및 승인된 공공 API 가져오기 스크립트 | 코드 작성 / **실데이터 미수집** |
| 심야약국 | 검색 카테고리와 국립중앙의료원 약국 API 가져오기 | 코드 작성 / **실영업시간 검증 불가** |
| Google Blogger | 승인받은 블로그의 RSS/Atom 게시물 메타데이터 불러오기 | 스크립트 구현 / 실제 연결 미실행 |
| YouTube | 승인받은 채널의 영상 제목·링크만 YouTube Data API로 불러오기 | 스크립트 구현 / 실제 연결 미실행 |

## 3. 유료 카테고리 상단 광고 정책

- 운영자는 **진료과별 스폰서 캠페인**을 생성하고 우선순위(`priority`)를 입력합니다.
- `approved=1`이고 `active=1`인 캠페인만 노출됩니다.
- 검색 필터와 불일치하는 분야는 유료광고라는 이유로 다른 진료과에 끼워 넣지 않습니다.
- 광고주가 별도 확보하는 지표: `ad_impression`, `ad_click`, `provider_view`, `booking_request` (실제 사용자 내부 이벤트, GA4 통계와 별개).
- 광고주 개별 통계 조회 페이지: **`http://127.0.0.1:8765/advertiser`**. 관리자가 `광고 캠페인 → 광고주 키 발급`에서 30일 유효한 기관별 조회키를 발급합니다. 키는 발급 당시 한 번만 표시되며 해시로 저장합니다. 폐기된 키는 즉시 접근 차단됩니다. 광고주 화면에는 집계 지표만 표시하고 예약자 신원정보는 공개하지 않습니다. 실제 수익 정산 및 광고 계약/과금은 미구현입니다.
- **치료성공률, 전문의 자격, 임상결과를 광고단가로 조작하지 않습니다.** 광고와 운영자 추천/출처 검증은 완전히 별개 값입니다.
- 광고 계약·상품·과금, 의료광고 사전심의 해당 여부와 의료광고주 적법성, 개인정보 처리위탁 계약 등은 상용화 전 법률 검토가 필요합니다.

### 수익모델 제안(실제 결제 기능은 미구현)
1. 진료과 × 지역 **스폰서 광고 월 정액제**
2. 의사 검증 콘텐츠/원문 프로필 **입점 CMS 구독제**(광고와 구분)
3. 검색 키워드/지역 노출형 **캠페인 예산제**, 단 의료광고 준법검수 선행
4. 광고주 분석 대시보드 **유료 리포팅**, 개별 환자정보·진료정보 제외

## 4. 공공 의료기관·약국 데이터 수집

실제 HIRA 전국 병원기본목록 API 공식 엔드포인트를 사용하도록 구성했습니다:

```
https://apis.data.go.kr/B551182/hospInfoServicev2/getHospBasisList
```

국립중앙의료원 전국 약국 데이터:

```
https://apis.data.go.kr/B552657/ErmctInsttInfoInqireService/getParmacyListInfoInqire
```

먼저 data.go.kr에서 적절한 API의 활용신청 및 서비스 키를 발급받으세요. **본 ZIP에는 서비스 키나 실제 전국 자료가 포함되지 않습니다.**

```bash
# HIRA 제공 CSV 파일로 데이터베이스 가져오기 (UTF-8/CP949/EUC-KR 지원)
python scripts/import_public.py --csv "C:/downloads/hospitals.csv" --kind hospital
python scripts/import_public.py --csv "C:/downloads/pharmacies.csv" --kind pharmacy

# 공식 OpenAPI로 승인 키가 발급된 후 (환경변수 입력)
python scripts/import_public.py --api hospital --pages 10 --per-page 100
python scripts/import_public.py --api pharmacy --pages 10 --per-page 100
```

**데이터 품질:** 기관 식별키가 있으면 업데이트, 없으면 명칭+주소로 업서트합니다. HIRA의 `ykiho`는 가명화된 식별자를 사용할 수 있고, 단순 기관목록에는 **개별 전문의의 면허·학회회원 자격이 입증되지 않습니다.** 상세정보 서비스의 진료과/전문의 수를 추가 조회하고 의사명·학회 자격을 검증하기 위한 별도 수집 절차가 필수입니다. 약국 데이터 가져오기만으로 **심야 운영 여부를 true로 설정하지 않으며**, 야간 운영 정보는 공식 업데이트+전화 검증으로 관리해야 합니다. 출처·업데이트 일자를 별도 보존하는 운영 고도화가 필요합니다.

참고: HIRA 병원정보서비스 https://www.data.go.kr/data/15001698/openapi.do / 의료기관별 상세정보서비스 https://www.data.go.kr/data/15001699/openapi.do / 전국 약국 서비스는 국립중앙의료원 관련 공공 API 활용신청.

## 5. 의사 발행 콘텐츠 연동

실제 의료진이 소유/운영하거나 자료 연동에 동의한 블로그 및 채널만 사용하세요. **기사 본문이나 영상 파일을 무단 복제하지 않고 메타데이터·원문 링크만 가져옵니다.** 외부 원문 링크는 독립적으로 열립니다.

```bash
# 구글 블로그: 등록된 의사의 Blogger 공개 블로그 RSS/Atom에서 제목/요약/원문
python scripts/import_blogger.py --blog https://DOCTOR.blogspot.com --provider-id 1 --category 피부과

# 유튜브: 키 발급, 의사의 실제 채널 ID 확인 후 제목·영상 링크 수집
python scripts/import_youtube.py --channel UCXXXXXXXXXXXXXXXXXXXXXX --provider-id 1 --category 피부과
# 쇼츠 카테고리로 유입 시 의사가 직접 영상 종류를 확인해야 함
python scripts/import_youtube.py --channel UCXXXXXXXXXXXXXXXXXXXXXX --provider-id 1 --category 피부과 --shorts
```

모든 외부 콘텐츠는 **운영자 승인 대기** 상태로 DB에 입력되며, 웹사이트에 자동 공개되지 않습니다. 승인 전에 의료진 실명·면허/전문의 자격·학회 소속·출처·게시일·의학적 근거·의료광고 여부·과장 및 부작용 누락 여부를 점검해야 합니다. 영상/글 콘텐츠는 검색과 카테고리에서 함께 탐색할 수 있습니다.

## 6. 자연어 AI 검색: 정보 우선, 광고 구분

메인 상단에서 **카테고리 검색** 또는 **자연어 AI 탐색**을 선택할 수 있습니다. 기본 모드는 *무상 규칙 기반 자연어 해석*입니다. 승인된 내부 자료만으로 검색 결과를 안내하므로 외부 LLM이 없더라도 동작합니다. 사이트가 임의의 의사 순위/치료효과를 생성하지 않도록 제한합니다.

선택적으로 외부 AI를 사용하려면 서버에 다음 값을 설정합니다:

```
OPENAI_API_KEY=YOUR_API_KEY
MEDIPICK_AI_MODEL=gpt-6-luna
```

외부 AI를 사용하는 **각 요청마다 별도의 동의 체크**가 필요합니다. 서버는 공개 승인 자료 일부와 검색 문장만 전송하며, 명백한 전화번호/이메일 패턴은 전송 거부합니다. 실제 개인정보·민감정보 관련 법적 검토와 프롬프트 차단·감사·보존 정책은 아직 상용 준비가 필요합니다. 외부 모델 연결은 실제 API 키 없이 검증하지 못했습니다. 출처가 부족하면 답변을 확정적으로 생성하지 않도록 지시하고, 모델 장애 시 내부자료 기반 안내로 복귀합니다.

## 7. 예약, 캘린더, 문자·카카오

환자가 입력하는 값은 성함, 전화번호, 희망일시, 동의 여부입니다. **증상/질병·치료내역 등 건강정보는 수집하지 않도록** 했습니다. 접수 직후 상태는 `requested`; 운영자 콘솔에서 `confirmed/declined/completed/cancelled`로 변경합니다. **실제 의료기관의 예약 가능 시간이나 충돌여부는 검증하지 못하므로 확인 후 확정**해야 합니다.

운영자 콘솔 예약목록에서 일정당 `.ics` 파일을 내려받아 Google/Outlook/Apple Calendar 등에 수동 등록할 수 있습니다. 실시간 동기화는 병원 측 승인된 캘린더 OAuth/API가 추가로 필요합니다.

알림은 `notifications` 대기함에 남고 **메시지 공급사 자격증명 없이는 발송되지 않습니다.** 카카오 알림톡은 광고용이 아닌 승인된 정보성 템플릿만 발송할 수 있습니다.

```bash
python scripts/process_notifications.py --dry-run
# 실제 공급사와 계약, HTTPS 중계 웹훅, 승인 템플릿 등록, 수신 동의 처리 후:
# MEDIPICK_NOTIFICATION_WEBHOOK, MEDIPICK_NOTIFICATION_TOKEN 설정
python scripts/process_notifications.py
```

※ 웹훅 페이로드는 범용 연동 경계이며, 실제 발송사는 API 스펙에 맞춘 별도 어댑터와 전달 확인 콜백·발송 실패 처리·수신거부 관리가 필요합니다. **상태가 submitted_to_provider라고 해서 사용자의 휴대폰 수신까지 확인된 것은 아닙니다.** Windows 작업 스케줄러를 통해 주기적 실행 가능하지만, 운영 승인·보안점검 완료 전에 스케줄링해서는 안 됩니다.

## 8. 분석 지표 및 GA4

내부 이벤트가 SQLite `events`에 저장됩니다. 현재 광고노출/상세조회 일부는 `client_key`로 1시간 중복 제거합니다. 클릭률의 분모와 GA4 집계 방법은 다를 수 있습니다. 환자 정보는 GA4 이벤트 페이로드로 전송하지 않습니다.

GA4를 쓰려면 **본인의 GA4 데이터 스트림 ID**를 환경변수 `MEDIPICK_GA_ID=G-XXXXXXXXXX`로 설정해야 합니다. 설정 시 선택적 분석 동의 UI가 표시되며 사용자가 동의한 경우에만 `gtag.js`를 불러옵니다. 실제 GA4 계정·속성 생성/연결, 공개 사용자 실측, 추적 거부 대상 처리와 태그 검증은 현재 미완료입니다.

## 9. 보안·의료 준법 주의

- 의료법 제56조에 따르면 **의료광고의 주체**, 환자 치료경험담·거짓·과장·비교광고 등 제한이 있어 병원/의사 소개 및 수익성 광고의 법률검토가 필요합니다.
- 개인정보 보호법 제23조에서는 건강정보 등 민감정보의 처리를 제한합니다. 후기 게시판은 치료효과가 아니라 접근성/시설 편의 정보만 접수하지만 **키워드 자동 차단만으로 법률 준수가 보장되지 않습니다**.
- 의료기관에 대한 객관적인 공공정보 표시, 유료의료광고 송출, 제3자 후기 홍보는 **별도의 광고 표시/편집 책임/규정 검토**가 필요합니다.
- 사용자 요청을 수집하는 이 프로토타입은 개인정보 암호화 저장, 암호화 백업, 보유기간 자동파기, RBAC, 취약점진단, 네트워크 격리, 관리자 MFA, 서버측 CAPTCHA/속도제한, 실제 도메인 HTTPS/쿠키 정책 등 **상용 필수 통제수단이 아직 없습니다. 상용 배포 금지.**
- 기본 관리자 비밀번호는 로컬 체험용입니다. `.env.example`은 템플릿이고 서버가 자동으로 읽지는 않습니다. Windows `set VAR=VALUE` 또는 PowerShell `$env:VAR='VALUE'`로 환경 변수를 설정하세요.

## 10. 자동 검증

```bash
python -m unittest discover -s tests -v
node --check web/assets/app.js
node --check web/assets/admin.js
node --check web/assets/advertiser.js
```

API 통합 테스트 14개(광고주 포털 접근제어·키 폐기·AI 검색 포함) + 자연어 요약 테스트, 화면 HTML/CSS 브라우저 모의 데이터 렌더링 검사에 대한 기록은 `docs/QA_REPORT.md`를 참고하세요. 직접 서버로 접속하는 Chromium 자동 브라우저 검사 경로는 실행 환경의 관리자 네트워크 정책으로 차단되어, HTTP API 통합 테스트와 HTML 모의 데이터 렌더링으로 분리 검증했습니다.

## 11. 주요 파일

```
server.py                        # 서버·SQLite·API·권한·후기·예약·광고
ai_service.py                    # 승인된 콘텐츠 기반 요약, 선택적 외부 LLM
web/index.html                   # 이용자 사이트
web/admin.html                   # 관리자 콘솔
web/advertiser.html              # 입점 광고주 보고서 포털
web/assets/{app.js,admin.js,advertiser.js} # 실제 UI 액션
web/assets/style.css            # 반응형 디자인 시스템
web/assets/{favicon.svg,hero-doctor.svg}
scripts/import_public.py         # HIRA/국립중앙의료원 CSV·API
scripts/import_blogger.py        # Blogger RSS/Atom
scripts/import_youtube.py        # YouTube Data API
scripts/process_notifications.py # 카카오·SMS 사업자 중계 경계
tests/test_platform.py           # 실제 HTTP API 테스트
docs/                           # 실행 전후 화면 캡처·QA·기획
run_windows.bat                  # Windows 실행
```

## 참고 공식 문서

- 건강보험심사평가원 병원정보서비스: https://www.data.go.kr/data/15001698/openapi.do
- 의료기관별상세정보서비스: https://www.data.go.kr/data/15001699/openapi.do
- HIRA 전국 병원·약국 정보 접근 정책: https://www.hira.or.kr/bbsDummy.do?brdBltNo=12040&brdScnBltNo=4&pgmid=HIRAA0200+02000100
- Blogger API v3: https://developers.google.com/blogger/docs/3.0/reference/posts/list
- YouTube API: https://developers.google.com/youtube/data/reference/rest/v3/search/list
- 카카오 알림톡 안내: https://kakaobusiness.gitbook.io/main/ad/infotalk
- Google Analytics 권장 이벤트: https://support.google.com/analytics/answer/9267735
- 의료법 제56조: https://www.nhis.or.kr/lm/lmxsrv/law/lawLinkContentView.do?LINKCODE=c005600000&SEQ=450
- 개인정보 보호법 제23조: https://www.law.go.kr/LSW/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1029334967

© MEDIPICK Prototype. 콘텐츠·의료정보·광고 집행의 적법성은 실제 운영자의 별도 검증을 전제로 합니다.
