# MEDIPICK v3.1 · Doctor Knowledge Network + Business + AI Medical Information Assistant

**날짜:** 2026-10-29 | **개발 상태:** 로컬 실행·데모 테스트 완료 / 상용 외부 인증 미완료  
**중요:** 의료진·병원·지도 좌표는 **가상의 예시 데이터**이며, 12개 진료과 사진은 **AI 생성 연출 이미지**입니다. 실제 병원·의사 및 진료효과를 묘사하지 않습니다.

## 1. Windows 원클릭 실행

1. ZIP 압축을 해제합니다. Python **3.10 이상**이 필요합니다.
2. `run_windows.bat`를 실행합니다. 이미지 검증 라이브러리 Pillow가 없으면 pip로 설치를 시도합니다(인터넷 필요).
3. 브라우저에서 `http://127.0.0.1:8765` 접속. 다른 기기에서 접근 가능하도록 호스트를 변경하지 마세요. 실제 배포용 인증·보안 설정을 갖추지 않은 데모입니다.
4. 기본 관리자 시연 암호 `medipick-demo-2026` — 인터넷 배포 시 **반드시** `MEDIPICK_ADMIN_PASSWORD` 환경변수로 변경합니다.

기본 페이지:

| 메뉴 | URL | 기능 |
|---|---|---|
| 메디픽 메인 | `/` | 병원·의사·구독 광고·심야약국·블로그·쇼츠 |
| AI 사진/증상 대화 | `/consult` | 사진 업로드·일반 의료정보·진료과·스폰서 병원 |
| 개인 건강 정보 | `/my-health` | 서버 전송 없는 개인 메모, JSON 내보내기/가져오기, 공공 포털 링크, 방문 기록 시연 |
| 의사용 재무 | `/doctor-finance` | 비식별 청구초안, 수가버전, 사전점검, 외부 접수 수기기록, 심사결과·정산 대사, 5시트 XLSX |
| 마케팅 콘솔 | `/marketing-console` | 관리자 캠페인 초안, 수신동의 요청, 모의 심사, 발송 금지 |
| Blogger 의사 입점 | `/doctors` | Blogspot 소유권 코드 확인 → 운영 승인 → 콘텐츠 검수 |
| 광고/위치 관리 | `/premium-admin` | 구독 기관 및 위치/Google Place ID 관리 |
| 운영자 | `/admin` | 등록·검수·접수·광고·의사용 액세스 키 발급 |
| 광고주 | `/advertiser` | 기관별 노출·클릭·예약 요청 통계 |

## 2. 실제 AI 사진 이해 활성화(선택 사항)

의료 사진을 업로드하면 **별도 동의** 후 서버가 이미지 형식과 용량을 점검하고 **EXIF 등 이미지 메타데이터를 제거한 후에만**, 설정된 OpenAI 비전 모델에 요청합니다. 서버에는 사진을 저장하지 않습니다. 사용자 프롬프트는 광고 분석 이벤트·서버 URL 로그에 저장하지 않습니다. API 키가 없거나 실패 시 **사진이 분석되지 않았다고 명시**합니다.

PowerShell:

```powershell
$env:MEDIPICK_ADMIN_PASSWORD="CHANGE-THIS-TO-A-STRONG-PASSWORD"
$env:OPENAI_API_KEY="YOUR_API_KEY"
$env:MEDIPICK_VISION_MODEL="gpt-5.4-mini"
python server.py
```

- 사용되는 외부 API: `POST https://api.openai.com/v1/responses`, `input_image` Base64 data URL, `store:false`.
- JPEG/PNG/WebP, **최대 1.5MB 원본·400만 픽셀**(요청 JSON 최대 2.4MB). 업로드 제한, 썸네일 축소, EXIF 제거.
- 사진 내용만으로 질병을 **확진하지 않으며**, 비전 모델은 의료 영상 판독기/인증 의료기기가 아닙니다. CT·MRI·X-Ray 정식 진단은 지원하지 않습니다.
- 응급 키워드는 우선 119 안내로 분기하며, 구독 광고는 표시하지 않습니다. 비정형 응급 증상은 놓칠 수 있으므로 실제 의료적 긴급성 판단을 대신하지 않습니다.
- 외부 API **실계정/실사진 호출은 수행하지 않았고**, API 계약은 모의 응답 테스트했습니다. 사진으로 실제 질환의 정확도를 검증하지 않았습니다.
- 개인정보 영향평가·민감정보 별도 동의·보존정책·해외이전 검토 및 법률 심사 후 서비스할 것.

## 3. 의사용 건강보험 청구 관리 범위

`/admin`에서 운영자가 `doctor_access` 접근키를 생성해 의사 대시보드에 접속합니다. 구독이 유효한 의료기관 소속 키만 접근합니다. 환자 실명·주민번호·진단명·처방기록은 **입력/저장하지 않습니다**. 내부 수가 등록, 진료일 기준 금액 계산, 내부 사전점검, 별도 심평원 접수 사실 수기기록, 심사 인정액 수기 입력, 은행 수기 장부 및 초과배분 방지, 5시트 엑셀을 사용할 수 있습니다.

**공식 HIRA/건보공단 전자청구·지급·요양기관 정보조회가 아니며**, 청구 규정 전체 산정, 상병 적합성, 실제 지급 통보서 자동수신은 구현되지 않았습니다. 내부 미확인 수가와 데모 수가를 공식 검증 수가로 표시하지 않습니다. 2026년 KT-EDI 종료 후 전산 청구는 공식 포털·인증된 EMR을 사용해야 합니다.

## 4. 환자용 건강기록과 공공데이터

`/my-health`의 기록은 브라우저 세션의 JavaScript 메모리에서만 유지합니다. 새로고침하면 소실되므로 이용자가 **직접 로컬 JSON 내보내기/가져오기**를 선택해야 합니다. 서버에 건강 민감정보를 보내지 않습니다. 정부 건강정보 고속도로/My HealthWay API는 활용서비스 등록·본인인증·환자 동적 동의·기술 심사가 필요하여 **실제 조회 연결되지 않았습니다**. 보험사 계약·투약·진료 내역을 자동으로 가져오지 않습니다.

## 5. 쿠폰·선불충전·방문 리워드 주의

의료행위용 할인권 판매·선불 진료비 충전·방문 보상은 **비활성화**되어 있습니다. 데이터 구조와 관리자 위험 검토 초안만 제공하며, 발급·판매·결제·환급·진료비 공제는 불가능합니다. 의료법 제27조(환자 유인) 및 전자금융거래법 검토가 선행돼야 합니다. 모의 체크인은 실제 방문 인증이 아니고 보상 포인트는 무조건 0입니다.

마케팅은 `/marketing-console`에서 **동의 요청과 원고 초안 작성**까지만 제공합니다. 메일·SMS·카카오 발송은 절대 하지 않으며, 연락처는 HMAC 해시로만 저장합니다. 전송 가능 대상으로 인정하려면 별도 연락처 소유권 인증이 필요하며 현재 인증 연동이 없으므로 **실제 발송 가능 인원은 0명**입니다.

## 6. 테스트와 검증 범위

```bash
python -m pip install -r requirements.txt
python -m unittest discover -s tests -v
python qa_v3_browser.py
```

- **39개 고유 자동 기능/안전 테스트 통과**. 독립 HTTP 서버를 띄워 GET/POST를 실제 실행했습니다.
- **8개 브라우저 UI 화면(4페이지 × PC/모바일)**과 챗질문 스폰서 카드 동작 확인. **JS 오류 0, 가로 넘침 0**.
- 브라우저 환경에서 localhost 접속이 차단되어 UI 확인은 HTML/CSS/JS + 실제 API 함수의 **모의 응답 스냅샷** 방식입니다. 실제 HTTP E2E인 것처럼 주장하지 않습니다.
- 외부 Google Maps / Google Place 실키 검증, OpenAI 실비전 호출, HIRA 실청구, MyHealthWay 개인데이터 조회, SMS·카카오 실발송, 진료 쿠폰 판매/결제·환급, 실제 병원 예약 확정은 **미검증/미연결**.
- 개발 중 발견한 결함: 청구 저장 후 즉시 조회 시 커밋 레이스 → 성공 HTTP 응답 전 DB 커밋으로 수정 후 반복 테스트 통과.

상세: `docs/QA_REPORT_V3.md`, `docs/ARCHITECTURE_V3.md`, `docs/v3_browser/report.json`.

## 7. 기존 기능/투자자료 포함

v2 공식 코드·12종 AI 생성 이미지·구독병원 전용 지도와 검색·의사 Blogger·콘텐츠 심사·기존 14페이지 한/영 PDF 투자제안서는 모두 포함합니다. 제안서 금액과 트래픽은 실제 매출이 아닌 가정입니다. 문서: `docs/investor/MEDIPICK_Investor_Deck_KO.pdf`, `docs/investor/MEDIPICK_Investor_Deck_EN.pdf`, `docs/MARKETING_GTM_KO.md`.

## 8. 참고 근거 (2026-10-29 기준)

- 대법원 2019.4.25. 2018도20928 시술상품 쿠폰·진료비 수수료 유인 판결: https://sc.scourt.go.kr/supreme/news/NewsViewAction2.work?gubun=4&searchOption=&searchWord=&seqnum=6637
- 의료법 제27조 환자 유인 규제 안내: https://www.kda.or.kr/kda/medicalLow/medicalNotice/board_read.kda?board_key=38861
- 건강정보 고속도로 활용서비스 연계 API: https://www.myhealthway.go.kr/portal/index?page=Organization%2FPortal%2FMediMyData%2FMydataApi
- 개인정보보호법 제23조 건강 민감정보 별도 동의: https://www.law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1029335227
- 심평원 청구방법 2026-95 고시 / KT-EDI 종료: https://www.khidi.or.kr/board/view?menuId=MENU01516&linkId=48944256
- OpenAI Images and Vision API 및 특수 의료영상 한계: https://developers.openai.com/api/docs/guides/images-vision
- 한국인터넷진흥원 광고성 정보 사전 동의·21시~08시 제한(문자·카카오 등): https://spam.kisa.or.kr/spam/cm/cntnts/cntntsView.do?cntntsId=1086&mi=1061

## 중요: 상용화 전 필수 완료 과제

실기관 등록 전 의사 면허·전문의 자격·기관 운영상태 검증, 의료광고 사전심의, 개인정보 영향평가 및 사업자별 DPA/보안감사, 기관별 RBAC/MFA/SSO, HTTPS, 환자 본인인증, 법령별 쿠폰·광고 심의, 실제 공공·외부 API 계약과 연동 테스트, 외부 침투 테스트, 운영 모니터링과 백업이 필요합니다. 이 ZIP은 **제품 데모 및 프로토타입 개발용**입니다.

---

# MEDIPICK v3.2 업데이트 · 페이지별 UI QA + 공식 연동 준비 (2026-10-29)

**이 패키지는 v3.1 전체 기능을 보존하는 v3.2 코드 업그레이드입니다.** 10개 화면 모바일·PC 검수, 표준화된 접근성 포커스 스타일, 이미지 대체텍스트, 구독·Google·결제 운영 센터(`/integrations`)를 추가했습니다.

- **Google OAuth/Blogger**: Google 공식 코드+PKCE/nonce/state, ID 토큰 서명 검증, Blogger 읽기 전용 권한, 연결 계정 조회, 공개 블로그 글 25개까지 동기화, 관리 승인 전 공개 차단. **실 Google 계정 연결은 계정/키 없이 미검증**.
- **토스페이먼츠**: 광고사업자 전용 1회성 결제 주문, SDK v2 체크아웃 UI, 서버 고정금액/중복 승인/결제 응답 검증. 실결제 키가 없어 **실승인은 미검증**. 자동결제·환불·선불치료권은 지원하지 않음.
- **예약정보 암호화**: 새로 저장되는 고객 성명·전화번호는 Fernet 필드 암호화. 기존 평문 예약행은 자동 마이그레이션하지 않으므로 운영 이관 시 별도 암호화 점검 필수. `scripts/privacy_retention.py`는 기본 드라이런이고 `--apply`를 명시해야만 지정 기간 경과·종결된 예약을 삭제합니다.
- 기존 건강보험 청구 초안·수기 정산/장부, 의료 AI 상담, 구독병원 우선 표시 등은 계속 시연 상태입니다. 실제 청구/건강정보 및 병원 진료 시스템 API 연결 없음.
- Python 의존성: `Pillow`, `cryptography`, `google-auth`. `run_windows.bat` 실행 시 미설치 의존성을 설치하도록 수정.
- **검수:** `docs/QA_REPORT_V32.md` 및 `docs/v32_ui_qa/report.json`를 참조하세요. 전체 자동 테스트 91회(중복 실행 포함) 통과, 20개 HTML/CSS 정적 렌더 통과, 결제 비활성화 UI 클릭 모의 테스트 통과.
- Google Cloud 및 토스 사업자 계정에 필요한 등록 순서: `docs/OFFICIAL_INTEGRATION_GUIDE.md`. 환경변수 템플릿: `.env.example` (이 파일은 자동으로 읽지 않으므로 Windows 환경변수나 `.env` 로더로 실제 프로세스에 전달해야 합니다.)

**환자의 의료·사건정보를 실제로 저장하는 상용 시스템으로 쓰기 전에 개인정보 처리 위탁/접근제어/MFA/취약점 점검/정식 계약·동의를 완료해야 합니다.**

---

# MEDIPICK v3.3 · 비공개 GitHub 코드 대조·예약 운영 통합 (2026-10-29)

- **새 화면:** `/clinic-access`(관리자 직원 키 발급·폐기), `/clinic-ops`(병원별 예약 일정·현황·상태 관리).
- **GitHub 참조:** 비공개 `shinkangteam/helloapp`의 기관 접근권한·일정충돌·알림 큐 설계를 Python 서버에 맞게 **선별 재구현**. 다른 프로젝트 `repo-health`는 코드 건강상태 점검 도구라 의료업무와 무관하며 제외. 원본 보존, 다른 GitHub 저장소 원격 푸시 없음.
- **새 API:** `GET /api/clinic/profile`, `GET /api/clinic/dashboard`, `GET /api/clinic/schedule?from=YYYY-MM-DD&to=YYYY-MM-DD`, `POST /api/clinic/appointments/{id}/status`, `GET/POST /api/admin/clinic-keys`, `POST /api/admin/clinic-keys/{id}/revoke`.
- **직원 역할:** 관리자 발급 `mpclinic_` 키 30일 사용. `schedule_read`(조회 전용), `schedule_manage`(조회 + 상태 변경). 다른 병원 예약을 읽거나 변경할 수 없음. 조회에서는 환자 이름·전화번호·진단명 반환하지 않음.
- **예약 상태:** 요청 → 확정/거절/취소, 확정 → 완료/취소. 동일 병원·날짜·시간의 예약 확정은 DB 유일 인덱스로 한 건만 허용. 예약 알림·확정·거절·취소 메시지는 **대기열에 적재만** 하며 병원 계약/승인 템플릿이 없으면 발송하지 않음.
- **카카오·SMS 설정:** 기존 `MEDIPICK_NOTIFICATION_WEBHOOK`, `MEDIPICK_NOTIFICATION_TOKEN`에 더하여 실제 발송 승인된 템플릿 ID를 `MEDIPICK_TEMPLATE_BOOKING_REQUESTED`, `MEDIPICK_TEMPLATE_BOOKING_CONFIRMED`, `MEDIPICK_TEMPLATE_BOOKING_DECLINED`, `MEDIPICK_TEMPLATE_BOOKING_CANCELLED`로 설정. 승인되지 않은 템플릿을 코드가 임의로 생성해 보내지 않음.
- **설치:** `run_windows.bat`, `python -m unittest discover -s tests -q`(회귀 기능검증), `python scripts/qa_clinic_browser.py`(오프라인 UI 전용). 실 외부 API/상용 의료기관 계정 연결은 미검증.
- **문서:** `docs/GITHUB_INTEGRATION_REVIEW_V33.md`, `docs/QA_REPORT_V33.md`, `docs/v33_qa/report.json`.
