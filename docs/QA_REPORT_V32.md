# MEDIPICK v3.2 페이지별·연동·보안 검수 보고서

검수일: 2026-10-29 (Asia/Seoul) | 대상: v3.1 → v3.2 전체 웹 소스.

## 검증 범위의 정확한 구분

- 기존 39개 회귀 테스트 포함, 총 **91회 Python unittest 실행 성공**. 새 테스트 클래스를 기존 테스트 클래스에서 상속하면서 기존 39개 일부를 **중복 실행**한 것이며 91개의 고유 기능을 뜻하지 않음.
- 신규 고유 테스트 8개: 연동 화면과 관리자 접근 차단, 서버 고정가격/미설정 결제 차단, Google 키 미설정, OAuth PKCE+state+nonce+검수 대기, nonce/state 재사용 방지, 결제 금액 조작/중복 승인 방지, 연락처 AES 계열 Fernet 암복호화, 진료과 이미지 검증.
- PC 1440×900 + 모바일 390×844, **10페이지×2=20개 실제 HTML/CSS 브라우저 렌더링**. 20개 모두 로컬 리소스 경로 오류 0, 가로 넘침 0, 이미지 대체텍스트 누락 0.
- **JS 실행 정적 문법 테스트**: `node --check web/assets/*.js` 통과. 신규 연동센터의 모의 API 연결/주문 생성 버튼도 Chromium에서 동작 확인. 키 미설정 시 결제 버튼은 표시되지 않음.
- 이 환경에서 Chromium의 `http://127.0.0.1` 접속이 `ERR_BLOCKED_BY_ADMINISTRATOR`로 거절됨. 따라서 UI 검증은 **HTML/CSS 정적 실제 렌더 + 연동센터 JS 모의 응답**이며, 실제 서버 HTTP API는 unittest 독립 서버 테스트로 수행. 이를 종합한 완전한 실제 브라우저-HTTP end-to-end로 주장하지 않음.
- Google OAuth 동의 및 Blogger 실계정·Toss 실제 MID/키·HIRA 실청구·MyHealthWay 실조회·Kakao/SMS 실발송은 외부 사업자 계정/계약 정보 없어서 **미검증**.

## 페이지별 디자인/사용성 조치

| 페이지 | 조치 | 검증 |
|---|---|---|
| 메인 `/` | 전체 고정 링크 제공, 영문/국문 브랜드 일치, 이미지 대체텍스트 보완 | PC/Mobile PASS |
| AI 사진 상담 `/consult` | 키 없이 사진 분석 주장 금지, 의료광고와 설명 분리, 키보드 포커스 강조 | PC/Mobile PASS |
| 건강기록 `/my-health` | 공공정보 API 미연결 설명 유지, 내 기기 메모 우선, 모바일 보조링크 하단 이동 | PC/Mobile PASS |
| 의사용 재무 `/doctor-finance` | 가상 수가·실청구 구분, 항목별 버튼 포커스, 장부 엑셀 기능 유지 | PC/Mobile PASS |
| 의사 Blogger `/doctors` | 기존 공개블로그 소유권/검수 흐름 유지, 공식 OAuth 연결센터 병행 | PC/Mobile PASS |
| 구독·지도 `/premium-admin` | 유료 구독 표시 검증 로직 유지, Google Places 근거·좌표 별도 관리 | PC/Mobile PASS |
| 관리자 `/admin` | 콘텐츠 검수·광고 준법·환자 예약 정보 접근 기존 세션 유지 | PC/Mobile PASS |
| 광고주 `/advertiser` | 통계 집계/예약 개인정보 비노출 유지, 포커스 스타일 개선 | PC/Mobile PASS |
| 마케팅 `/marketing-console` | 수신 동의 확인·캠페인 초안, 실제 발송 기본 차단 | PC/Mobile PASS |
| **신규 공식 연동 `/integrations`** | Google 연결·읽기 전용 Blogger, Toss 결제 주문, 상태 점검 3열 컴포넌트 | PC/Mobile + JS 모의조작 PASS |

## 이미지와 한국어 검수

- 12개 진료과 실사형 AI 연출 WebP는 개별 이미지 내에 화면용 한국어 문구를 넣지 않은 소스이므로 기존 이미지를 유지했습니다. 번역·문법을 수정해야 하는 제목/설명 문장은 **HTML 원문에서 관리**하도록 했습니다.
- 메인 히어로 이미지의 비어 있던 대체텍스트 보완. HTML 대체텍스트/캡션은 환자가 실제 병원 또는 의료진 사진으로 착각하지 않도록 'AI 생성 연출 이미지'를 병기하도록 권고.
- 이미지 자체에 포함된 손글씨/작은 배경 간판의 문자 인식 정확성을 OCR로 평가하지 않았으며, 외부 실사 이미지 권리 확인은 별도 업무입니다.

## 보안 검수 및 상용화 위험

**완료:** Google OAuth state 수명·1회 소비, PKCE challenge, nonce 검사, Google 토큰 발급자/대상 검사, Blogger 읽기 전용 scope, Google refresh token Fernet 암호화, 콘텐츠 초안 승인 분리, 결제금액 서버가격 대조, 결제 응답 status/키/주문/금액 대조, 중복 승인 차단, 예약 이름·연락처 데이터베이스 암호화, 관리자 POST CSRF 커스텀 헤더, 외부 서버 바인딩 기본 차단.

**미완료 (배포 차단 항목):** 개인 의료정보 수집·제3자 제공법적 근거/동의, 환자 의료기록 보관/삭제 규정 및 DPA, KMS, 의료기관/의사 검증, MFA/권한 분리, 비밀번호 재설정 보안, 실제 TLS 배포, WAF·침투테스트, 실운영 통합 보안관제, 외부 의료청구·진료 정보 관련 공식 연동 허가, 결제사 실제 MID 승인/환불정산·웹훅 재대사 운영, 의료광고 심사. 본 버전은 **실서비스 배포용 개인정보·결제 인증을 완료한 상품이 아님**.

## 재현 명령

```bash
python -m pip install -r requirements.txt
python -m unittest discover -s tests -v
python qa_v32_pages.py
python qa_v32_interactions.py
node --check web/assets/integrations.js
```

`docs/v32_ui_qa/report.json`에 각 페이지 크기·경로·대체텍스트·넘침 결과가 있습니다.
