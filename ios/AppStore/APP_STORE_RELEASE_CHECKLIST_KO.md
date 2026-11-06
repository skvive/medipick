# MEDIPICK iOS App Store 출시 검수 목록

| 분야 | 현재 | 출시 게이트 |
|---|---|---|
| iOS 소스 | 완료 | SwiftUI 네이티브 4개 탭 + iPhone/iPad 프로젝트 |
| iOS SDK 실제 빌드 | 미실행 | Mac Xcode: Simulator Build + Product Test + 실기기 서명 테스트 |
| 서명/계정 | 미설정 | Apple Developer Team, Bundle ID, App Store Connect 앱 레코드 |
| TestFlight | 미배포 | Archive → Distribute → TestFlight 내부테스트 후 안정화 |
| 의료기관 위치 | 미검증 | 원본 29,386개 추정핀을 실제 위치로 승격 금지, HIRA 검증 후에만 정확 핀 제공 |
| 웹 로그인 | Safari 링크만 제공 | Google·Neon 로그인 사용 시 Apple 지침 4.8 및 계정 삭제 요구 등 검토; 필요한 경우 Sign in with Apple 추가 |
| 개인정보 처리방침 | 미게시/미검증 | 실제 서비스 처리방침 URL, 앱 내부 링크, 앱 개인정보 표시, 데이터 보존 및 삭제 절차 확인 |
| 위치 권한 | 구현 | 위치 권한 허용/거부·근사/정확·권한 회수 QA, 정확 위치 서버 전송 여부 공개 |
| 결제 | iOS 결제 구현 안 함 | 멤버십·디지털 상품 판매 시 Apple IAP 관련 규정과 외부결제 예외 검토 |
| 앱 심사 4.2 | 재검토 필요 | 웹뷰 포장 대신 네이티브 검색/지도/즐겨찾기 심사; 유용성 및 UI 완성도 현장 검증 |
| 의료 건강 서비스 | 미검증 | 운영 주체의 의료업 규제·광고법·의료 정보 소스 자격 검토, 진료 보장 오인 금지 |
| 보안 | 미완료 | 공개 REST API의 429/500 처리, ATS HTTPS, 민감정보 없음/추적 없음 확인 |
| 스크린샷 | 미제작 | 실제 iPhone 및 iPad 시뮬레이터 화면에서 Apple 요구 규격으로 캡처 |
| 고객 지원 | 미확정 | 지원 URL·연락처·장애 신고·개인정보 문의 안내 |

## Apple 정책 참고
- [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) 4.2 (minimum functionality), 4.8 (로그인), 5.1 (개인정보), 2.1 (완성도).
- [App Review](https://developer.apple.com/app-store/review/) (헬스케어 등 민감 업종의 법인 주체 요구).

본 앱은 의학적 진단/처방이나 보험금 자동 청구를 수행하지 않는다. 현재 API의 공개 주소록 후보를 조회하는 정보 제공 앱이다. App Store 메타데이터에서도 해당 사실을 일관되게 설명해야 한다.
