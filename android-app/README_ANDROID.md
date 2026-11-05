# MEDIPICK 안드로이드 앱 프로젝트 (v4.3)

## 구성

- Android Studio로 여는 Java + Gradle 네이티브 Android 프로젝트
- 기존 MEDIPICK 서버 주소를 안전한 `https://` URL로 등록하고 WebView에서 표시
- 사진 업로드: Android 시스템 사진/파일 선택기 (JPEG, PNG, WEBP)
- 위치 사용: 현위치 검색을 눌렀을 때만 위치 접근 권한 요청
- 뒤로가기·새로고침·앱 설정·외부 링크·개인 WebView 데이터 삭제
- 통신보안: 인증서 오류 거절, HTTPS 사용, 타 사이트는 외부 브라우저 이동, 임의 `intent:` 차단
- HTML/의료기록을 APK에 내장하지 않습니다. 항상 사용자의 MEDIPICK 서버 최신 데이터를 표시합니다.

## 개발 빌드

1. Android Studio 최신 버전과 JDK 17 및 Android SDK 플랫폼 35를 설치합니다.
2. `android-app/`을 Android Studio에서 엽니다.
3. Android Gradle Plugin 8.9.2, Gradle 8.11.1으로 동기화합니다.
4. Build > Build Bundle(s) / APK(s) > Build APK(s)에서 `app-debug.apk`를 생성합니다.
5. 에뮬레이터 또는 실기기에 설치하고 메디픽 서버의 HTTPS 주소를 입력합니다.
6. 개발용 에뮬레이터에서는 디버그 APK에 한해 `http://10.0.2.2:8765`를 사용할 수 있으나, 실기기와 배포용 앱은 HTTPS 필수입니다.

Gradle wrapper jar는 이 배포 패키지에 존재하지 않습니다. Android Studio가 제공하는 Gradle 환경 또는 `gradle` CLI 8.11.1을 사용해야 합니다. `.github/workflows/android-debug.yml`은 GitHub에 이 프로젝트를 업로드한 뒤 수동으로 Debug APK를 생성하는 예시입니다.

## 출시 전 필수

- 앱 ID `site.medipick.mobile`은 예시입니다. 실제 상표·패키지 등록 시 본인 소유의 역방향 도메인을 사용합니다.
- Google Play Console에서 Health apps declaration, Data safety, 개인정보처리방침 URL, 의료기능 안전성 고지를 완성해야 합니다.
- Google 계정 로그인·Blogger OAuth는 보안 정책상 내장 WebView에서 로그인하면 안 됩니다. '브라우저에서 열기'를 제공하지만 브라우저 로그인 상태는 WebView와 공유되지 않습니다. **운영 배포에서는 PWA 또는 Digital Asset Links가 검증된 TWA 권장**.
- Android 업로드/서명 키는 제공하지 않습니다. 실제 APK 서명은 개발자 계정의 개인 키로 수행해야 합니다.
- 건강기록, AI 이미지 상담, 진료예약은 원격 MEDIPICK 웹서버가 필요합니다. 오프라인 시 개인정보와 의학정보 데이터는 기기 캐시에 저장하지 않습니다.
- Play 배포 시 정책 변화에 따라 targetSdk/SDK 업데이트와 개인정보 보호·의료광고 심사가 필요합니다.

## 현 환경 검증 한계

이 패키지를 제작한 환경에는 Android SDK/Gradle이 없어 **APK 빌드, Android 에뮬레이터 및 실기기 설치 검증은 수행하지 않았습니다.** 이를 빌드 성공으로 표시해서는 안 됩니다.
