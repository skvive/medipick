# MEDIPICK Google Maps Browser API key → Vercel
# Usage (after you create a browser-restricted key in GCP):
#   .\scripts\setup-google-maps-vercel.ps1 -ApiKey "AIzaSy..."
param(
  [Parameter(Mandatory = $true)]
  [string]$ApiKey
)

$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

if ($ApiKey -notmatch '^AIza[0-9A-Za-z_-]{20,}$') {
  Write-Error 'Invalid Maps API key format'
}

Write-Host 'Adding GOOGLE_MAPS_BROWSER_KEY to Vercel (production)...'
$ApiKey | vercel env add GOOGLE_MAPS_BROWSER_KEY production
Write-Host 'Redeploying production...'
vercel --prod --yes
Write-Host 'Done. Verify: https://medipick.lexid.site/api/config'
