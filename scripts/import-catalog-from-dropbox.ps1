# Dropbox -> Neon public_hospital_stores
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

$Dropbox = "C:\Users\user\Dropbox\PC (9)\Downloads\구글주소록_3000건단위"
$env:IMPORT_UNNI_CSV = Join-Path $Dropbox "unni_hospitals.csv"
$env:IMPORT_PLATFORMS_XLSX = Join-Path $Dropbox "med_platforms_hospitals.xlsx"

if (-not (Test-Path $env:IMPORT_UNNI_CSV)) { throw "Missing $($env:IMPORT_UNNI_CSV)" }
if (-not (Test-Path $env:IMPORT_PLATFORMS_XLSX)) { throw "Missing $($env:IMPORT_PLATFORMS_XLSX)" }

if (-not $env:DATABASE_URL -and (Test-Path '.env.local')) {
  Get-Content '.env.local' -Encoding UTF8 | ForEach-Object {
    if ($_ -match '^\s*DATABASE_URL\s*=\s*(.+)\s*$') {
      $env:DATABASE_URL = $matches[1].Trim().Trim('"').Trim("'")
    }
  }
}
if (-not $env:DATABASE_URL) { throw 'DATABASE_URL required' }

Write-Host "Import UNNI + platforms from Dropbox..."
npm run db:migrate
python scripts/import-public-hospital-catalog.py
node scripts/seed-catalog-marketing-demo.mjs
Write-Host "Done."
