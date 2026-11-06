# MEDIPICK iOS 1.0 — 네이티브 앱 전환 소스

기준: `skvive/medipick`, 운영 URL: https://medipick.lexid.site, 2026-11-06.

## 구현

- **iPhone / iPad, iOS 17 이상** · SwiftUI / MapKit / CoreLocation / URLSession / Security Keychain (외부 라이브러리 없음)
- **네이티브 주소록 검색:** 현재 운영 API `GET /api/public-catalog/search` / `.../store/:id`를 재사용. 지역·진료과·병원명 검색과 상세 카드.
- **Apple 지도:** `geocode_status=exact`이고 유효한 한국 좌표인 항목만 지도 마커·길찾기를 제공. 추정 좌표는 절대 실제 위치로 오인하지 않도록 표시 금지. 2026-11-05 당시 운영 데이터의 `exact`는 0건이므로 초기 지도는 비어 있을 수 있다.
- **내 위치:** 사용자가 명시적으로 버튼을 누른 경우에만 권한 요청·10km 반경 검증된 병원 조회. 거부 시 지역별 텍스트 검색 제공. 백그라운드 위치 사용 안 함.
- **즐겨찾기:** 기기 Keychain에 공개 병원 레코드 ID만 저장, 상세는 매번 API 재조회. 검색어나 진료정보를 로컬에 저장하지 않음.
- **웹 서비스:** 건강정보·의료안내·보험 안내·웹 계정 로그인은 Safari 외부 링크. 앱 안에 웹사이트를 통째로 억지로 넣거나 Google OAuth를 WKWebView에서 처리하지 않음.
- **안전 문구:** 병원 운영·진료 정확도 미검증, 위치 검증 전 길찾기 미제공, 유료 노출은 광고로 표시.
- **브랜드:** 기존 v5 PWA 앱 아이콘을 바탕으로 Apple용 1024×1024 **알파 없는** PNG 사용.

## 맥에서 실행

1. Xcode 16 이상, iOS 17 이상 시뮬레이터가 있는 Mac에서 `ios/MEDIPICKiOS.xcodeproj`를 연다.
2. Xcode 상단 **MEDIPICKiOS** 스킴 선택 → iPhone/iPad 시뮬레이터 → Run.
3. 처음엔 코드를 서명하지 않고 시뮬레이터 빌드. 실제 iPhone 테스트·TestFlight·IPA에는 **Apple Developer Program**의 Team/프로비저닝 프로파일 및 사용 가능한 Bundle ID가 필요.
4. 기본 Bundle ID는 `site.lexid.medipick` (출시 전 App Store Connect에서 고유성 확인 후 조정). `Signing & Capabilities`에서 실제 Team 지정.
5. 앱은 현재 운영 사이트의 **공개** 주소록 API를 호출하므로 네트워크 필요. Google 로그인은 Safari에서 수행하며 웹 세션과 네이티브 즐겨찾기는 공유하지 않는다.
6. `Product → Test`로 `MEDIPICKiOSTests` 네이티브 안전성 테스트를 실행한다.
7. 시뮬레이터에서 테스트 시 지역 검색·빈 지도 상태·Location 권한 거부·오프라인 오류·즐겨찾기 토글·다크 모드·VoiceOver까지 검사.

## Xcode 프로젝트 복구

`.xcodeproj`는 저장소에 포함되며, 구조를 변경할 때에만 다음으로 재생성한다. 외부 라이브러리 의존 없음.

```bash
python3 ios/tools/generate_xcodeproj.py
```

XcodeGen을 사용하는 개발자는 `cd ios && xcodegen generate`로 `project.yml`에서 재생성할 수도 있다(별도 설치 필요). 아이콘이 빠졌다면 기존 브랜드 원본을 사용해 Mac에서 다음을 수행한다.

```bash
swift ios/tools/generate_ios_icon.swift web/assets/pwa/icon-512.png ios/MEDIPICKiOS/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png
```

이 명령은 기존 PNG에서 새 iOS용 아이콘을 만들며, 원본 브랜드 PNG는 수정하지 않는다.

## 데이터·심사 한계

- 본 프로젝트는 **Xcode 소스/프로젝트 + 정적 검증 완료** 단계이며, Linux 컨테이너에서 iOS SDK를 이용한 실제 Xcode 빌드·앱 서명·IPA/ TestFlight 발행은 할 수 없었다.
- App Store 심사 지침 4.2는 단순 웹뷰 포장을 인정하지 않는다. 본 프로젝트는 자체 검색·지도·즐겨찾기를 구현했지만, **심사 통과를 보장하지 않는다.**
- 실제 병원 좌표 HIRA 실원본 검증, 인증/예약/결제의 동작 및 OAuth 정책, 앱 개인 정보 처리방침, iOS 개인정보 영양성분표, App Store 로그인/계정 삭제 요구사항은 App Store 제출 전 별도 확인.
- 현재 서비스가 공개 주소록에 포함하는 개인·의료 민감정보/건강정보의 법적 근거를 App Store 배포 전 검토해야 한다.

**운영 서버·Neon DB·Android 프로젝트의 원본을 수정하지 않으며 별도 폴더 `ios/` 아래만 생성한다.**
