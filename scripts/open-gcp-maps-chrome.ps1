# Open external Chrome to GCP Maps setup (Windows)
$project = 'fabled-meridian-513202-g9'
$urls = @(
  "https://console.cloud.google.com/freetrial/signup?project=$project",
  "https://console.cloud.google.com/apis/library/maps-backend.googleapis.com?project=$project",
  "https://console.cloud.google.com/apis/credentials?project=$project"
)
foreach ($u in $urls) {
  Start-Process 'chrome.exe' $u
  Start-Sleep -Milliseconds 800
}
Write-Host 'Opened Chrome tabs: billing signup, Maps JavaScript API library, Credentials.'
Write-Host 'After billing + API enable: Create API key -> Application restrictions: HTTP referrers'
Write-Host '  https://medipick.lexid.site/*'
Write-Host '  https://*.vercel.app/*'
Write-Host '  http://localhost:*/*'
Write-Host 'Then: .\scripts\setup-google-maps-vercel.ps1 -ApiKey YOUR_KEY'
