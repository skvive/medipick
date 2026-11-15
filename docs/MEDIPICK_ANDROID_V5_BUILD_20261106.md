# MEDIPICK Android v5 — signed debug APK build

- Canonical existing Android Studio source: Google Drive MEDIPICK_v4_3_Android_Studio_Project.zip, reused and upgraded in MEDIPICK_Android_v5_Source_20261106.zip.
- Git blob: android/medipick-android-v5-source.zip, exact corresponding source bundle.
- To inspect source: unzip -l android/medipick-android-v5-source.zip and unzip into a *separate* working directory before making changes. The workflow restores only android/* files.
- Build: Android Gradle Plugin 8.9.2 + Gradle 8.11.1 + JDK 17, Android SDK API 35. Command: gradle -p android :app:assembleDebug.
- Debug APK is signed with CI's disposable debug key and is **not** a production/Play Store release.
- Built WebView connects to https://medipick.lexid.site/smart-store by default; external Google OAuth remains in browser.
- Google Maps JavaScript key restrictions and Android login session cannot be guaranteed without device-level verification.
- On actual Android API 35 emulator, the workflow installs APK, starts MainActivity, checks process, takes screenshot and saves logcat.
- Original Google Drive v4.4 test-only 17,863-byte APK contains embedded demo.html; do not confuse it with this newly compiled production-URL debug APK.
- No Neon production schema, patient data, app signing credentials, or deployed web service are modified by this workflow.


## v5.1 오프라인 검수 보완 (2026-11-15)

- 11월 14일 에뮬레이터 실행 스크린샷에서 앱 프로세스는 정상이어도 WebView 내 `ERR_INTERNET_DISCONNECTED` 시스템 오류가 보였음. 따라서 과거 `EMULATOR_SMOKE_PASS`는 **앱 설치 및 크래시 없음**을 증명했을 뿐 병원 사이트 표시 성공을 증명하지 않았음.
- 원본 `android/medipick-android-v5-source.zip`은 보존한다.
- 공개된 Java 소스 `android/app/src/main/java/site/medipick/mobile/MainActivity.java`가 기존 ZIP의 동일 경로보다 우선되도록 `unzip -nq`로 기존 파일을 건너뛴다.
- 인터넷 연결 실패/HTTP 오류 시 Android 기본 WebView 오류 화면을 감추고 메디픽 네이티브 안내·재연결·브라우저 열기 버튼을 표시한다.
- 새 에뮬레이터 CI는 활동 프로세스만 확인하는 대신 `uiautomator dump`로 실제 사용자에게 표시되는 오프라인 안내 또는 온라인 병원 콘텐츠를 확인한다. 캡처 및 `medipick-ui.xml`을 QA 증빙으로 남긴다.
- **오프라인 안내 확인은 온라인 HIRA·검색·로그인 기능의 검증과 다르다.** Android 실기기+운영 네트워크 테스트와 Google Play 서명·심사는 별도 후속 게이트다.
