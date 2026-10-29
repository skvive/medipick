# 공식 API 연결 및 사업자 설정 가이드

## Google 로그인 및 의사 Blogger 연결

1. Google Cloud Console에서 OAuth consent screen을 설정하고 Blogger API를 활성화합니다.
2. OAuth 2.0 **Web application** ID와 Secret을 발급합니다. 허용 리디렉션 URI를 `GOOGLE_REDIRECT_URI`와 정확히 일치시키세요.
3. 운영자의 로그인된 세션에서 `/integrations` → 의료진 선택 → Google 계정 로그인. OAuth 승인코드+PKCE+state+nonce, Google ID 토큰 서명/발급자/aud/sub/이메일 검증을 실시합니다.
4. 승인된 Blogger 목록을 가져와 운영 대시보드에서 수동으로 동기화합니다. 가져온 게시물은 `approved=0` 검수 대기, 자동 게시 불가.
5. Google 계정이 연결되었다고 의사 면허·전문의 자격·소속이 확인된 것은 아닙니다. 별도 확인 후 해당 의사 프로필의 공개 여부를 결정하십시오.
6. refresh token은 앱 암호화 키 기반 Fernet으로 저장됩니다. 키 분실 시 복호화 불가능합니다. 운영환경에서는 KMS + 전용 비밀관리로 교체하고 로그·백업 보안감사를 진행하세요.

## 광고 구독 결제 (토스페이먼츠)

1. 국내 사업자 전자결제 계약 및 상점 MID 심사를 완료하세요. `TOSS_CLIENT_KEY`, `TOSS_SECRET_KEY`를 서버 환경변수로 설정합니다.
2. **사업자 광고 구독료에 한정**합니다. 의사 진료비·환자 유치 수수료·시술 선불권은 금지 상태 유지.
3. `MEDIPICK_ENABLE_REAL_PAYMENTS=1`을 **사업자 설정과 테스트 완료 후에만** 지정합니다. 관리자만 주문을 생성하며 서버에 정해진 KRW 가격으로 기록합니다.
4. Toss SDK v2에서 결제 수단 선택 → 리디렉션 결과 `paymentKey`/`orderId`/`amount` → 서버 내부 저장된 주문 금액 비교 → `POST /v1/payments/confirm` 승인 → 응답에 주문번호/금액/상태 일치 검사.
5. 결제는 `paid` 상태를 기록하지만 광고는 자동 켜지지 않습니다. `compliance_approved`, 구독 상태, 만료 및 법적 의료광고 심의는 운영자가 별도 확인합니다.
6. 금액·중복결제·환불·PG 수수료·부가세·수동 대사, 가상계좌 웹훅, 분쟁 처리, 재결제, 취소 자동화는 상용화를 위한 별도 테스트 대상입니다. 현재 **1회성 결제**로, 자동 빌링이 아닙니다.

## 심평원/건보공단 및 의료공공정보

- 요양급여비용 실제 청구는 2026년 변경된 **심평원 진료비청구포털/인증 EMR** 규격과 기관 인증이 필요합니다. 공개 일반 API만으로 청구하거나 지급받을 수 있다고 주장해서는 안 됩니다.
- 환자 건강정보 고속도로/MyHealthWay는 기관 등록, 본인확인, 최소범위 동의, 전용 정보보호 조치가 선행돼야 합니다. **환자정보 자동 조회 없음**.
- 카카오 알림톡/문자·보험사 조회 등은 관련 사업자 발송 서비스·템플릿 승인 및 법적 동의가 없으므로 미연동입니다.
- 구독병원 지도는 `advertisement` 표시를 계속 유지하며 모든 의료기관의 객관적 검색결과와 분리합니다.

## 공식 문서

- Google OAuth 웹서버: https://developers.google.com/identity/protocols/oauth2/web-server
- Google OIDC ID 토큰: https://developers.google.com/identity/openid-connect/openid-connect
- Blogger listByUser: https://developers.google.com/blogger/docs/3.0/reference/blogs/listByUser
- Toss Payments SDK v2: https://docs.tosspayments.com/guides/v2/payment-widget/integration
- Toss Payments confirm API: https://docs.tosspayments.com/reference
- HIRA 2026-95 청구고시: https://www.hira.or.kr/bbsDummy.do?brdBltNo=12049&brdScnBltNo=4&pageIndex=1&pgmid=HIRAA020002000100
- Google Places attribution/storage: https://developers.google.com/maps/documentation/places/web-service/policies
