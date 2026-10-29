# MEDIPICK v3.3 QA 기록

- 원본 기준: `MEDIPICK_v3_2_Design_OAuth_Billing_Security_Verified.zip`(이전 대화 버전).
- GitHub 원본 참조: `shinkangteam/helloapp` 등, 세부 내역 `docs/GITHUB_INTEGRATION_REVIEW_V33.md`.
- 동작 검사: `python -m unittest discover -s tests -q` → **123 테스트 실행 통과**(상속에 따른 기존 테스트 중복 포함, 신규 v3.3 테스트 메서드 10개).
- 보안 핵심: 다른 기관 예약 조회/변경 불가, 조회 키 수정 403, 폐기된 키 401, 일정 중복 확정 차단, 상태 전이 규칙, 알림 큐 재생성 중복 방지, 예약 목록 PII 미표시, 날짜 범위 제한.
- 로컬 HTTP: 실제 `ThreadingHTTPServer`를 시작하고 API를 호출하는 `test_v33_clinic_merge.py` 및 기존 테스트에서 검증.
- 시각 QA: PC 1440px 및 모바일 390px에서 `/clinic-ops`, `/clinic-access`, `/doctor-finance`의 오프라인 HTML/CSS 렌더링 **6개**, JavaScript 예외 **0**, 가로 넘침 **0**. 화면 저장 위치 `docs/v33_qa`. 이미지와 스타일 파일은 로컬 소스에서 읽고 외부 API 연결 없이 검수.
- 한계: 실행환경 Chromium은 localhost 및 테스트 도메인에 `ERR_BLOCKED_BY_ADMINISTRATOR`를 발생시켜 **브라우저-네트워크 E2E** 수행 불가. API E2E(실제 HTTP)와 Chromium 오프라인 DOM 검수는 서로 별개이며 이를 합산하여 전체 브라우저 E2E라고 주장하지 않음.
- DB 호환성: 새 `event_type` 열 및 기관 일정 인덱스는 `init_db()`에서 자동 설치. 이전 DB에 **동일 날짜·시간에 중복 확정예약**이 있으면 안전하게 시작을 중단하고 관리자 충돌 해결을 요구함(자동 데이터 삭제/덮어쓰기 없음).
- 메시지 연동: 알림톡·SMS는 사업자 토큰, HTTPS 서비스, 각 상태별 실제 **승인된 템플릿 ID**가 등록되기 전엔 발송하지 않음. 새 알림 이벤트는 pending에 남음. 개인정보와 토큰이 로그에 남지 않도록 유의.
- 상용화 필수: 의료광고 적법성, 병원/의사 확인, 역할별 MFA, 실제 직원 자격검증, 키 교체, 프로덕션 DB 백업/복구, 외부 알림 템플릿 심사, 환자 개인정보 목적/보존기간 및 개인정보 처리방침과 위탁·동의 체계, 병원 계약, 환자 예약 처리 실운영 테스트.
