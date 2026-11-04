# MEDIPICK v5 PWA · 안전한 오프라인 캐시 정책

2026-11-05 · Drive의 v4.3 `PWA_SECURITY.md`와 `service-worker.js`를 비교해 현재 Next.js 배포에 이식한 버전.

- HTTPS 환경에서만 Service Worker를 등록. 최신 앱은 `/smart-store?source=pwa`에서 시작.
- `/api/*`, `/auth/*`, `/account*`, `/admin*` 응답은 SW가 가로채거나 캐시에 저장하지 않음.
- HTML 탐색은 network-first, 연결 불가 시만 `/offline.html` 반환. 개인 건강정보나 상담 내용은 저장되지 않음.
- 로컬 캐시는 공개 정적 앱 아이콘, 파비콘과 일반 오프라인 메시지만. 사진, 진료 기록, 예약, 결제, Google 지도 타일을 의도적으로 사전 저장하지 않음.
- `beforeinstallprompt` 이벤트를 지원하는 경우에만 설치 버튼 표시. 브라우저별 설치는 별도 수동 방식 가능.
- 새 로고 PNG 크기: 192px, 512px; iOS 홈 화면 설치·Android 실제 APK 설치는 이 변경에서 검증하지 않음.
- 마이그레이션: 기존 `medipick-public-shell-v4.3.0` 캐시만 이전 버전 정리 로직으로 삭제. 다른 사이트/앱의 캐시 무단 삭제 금지.
