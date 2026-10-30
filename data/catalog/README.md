# 공공·플랫폼 병원 주소록 (스마트스토어 카탈로그)

원본 파일(로컬):

- `unni_hospitals.csv` — 강남언니 API 수집 (~1.2k)
- `med_platforms_hospitals.xlsx` — 바비톡 등 플랫폼 HTML 수집 (~34k)

Neon 테이블: `public_hospital_stores`, `geo_district_cache`

```powershell
$env:DATABASE_URL = "<Neon pooler URL>"
npm run db:migrate
npm run catalog:import
```

지도 좌표는 기본 **시·도 중심 + jitter(approx)**. 구·군 단위 정밀 좌표는:

```powershell
$env:PUBLIC_CATALOG_GEOCODE = "1"
python scripts/import-public-hospital-catalog.py
```

API: `/api/public-catalog/stats`, `/search`, `/nearby`, `/store/:id`  
UI: `/smart-store` · 기획 `docs/MEDIPICK_SMART_STORE.md`
