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
