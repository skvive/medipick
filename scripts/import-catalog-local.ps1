# Repo data/catalog -> Neon public_hospital_stores (Phase 1 실명 import)
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

$root = (Get-Location).Path
$env:IMPORT_UNNI_CSV = Join-Path $root 'data\catalog\unni_hospitals.csv'
$env:IMPORT_PLATFORMS_XLSX = Join-Path $root 'data\catalog\med_platforms_hospitals.xlsx'

foreach ($p in @($env:IMPORT_UNNI_CSV, $env:IMPORT_PLATFORMS_XLSX)) {
  if (-not (Test-Path $p)) { throw "Missing $p" }
}

if (-not $env:DATABASE_URL -and (Test-Path '.env.local')) {
  Get-Content '.env.local' -Encoding UTF8 | ForEach-Object {
    if ($_ -match '^\s*DATABASE_URL\s*=\s*(.+)\s*$') {
      $env:DATABASE_URL = $matches[1].Trim().Trim('"').Trim("'")
    }
  }
}
if (-not $env:DATABASE_URL) { throw 'DATABASE_URL required (Neon pooler URL)' }

Write-Host "Import from data/catalog/ ..."
python scripts/import-public-hospital-catalog.py
Write-Host "Optional PRO demo rows: node scripts/seed-catalog-marketing-demo.mjs"
Write-Host "Done."
