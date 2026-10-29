# MEDIPICK · medipick.lexid.site

**목적:** 병·의원·약국 **입점·마케팅·의료정보 탐색** 데모 플랫폼 (MEDIPICK v3.3). 가상 시연 데이터·AI 상담·예약 운영·의사 Blogger 연동·구독 광고 등을 **단일 Python 서버**로 제공합니다.

| 레이어 | 호스트 | 역할 |
|--------|--------|------|
| Edge | **Vercel** `medipick.lexid.site` | 도메인·HTTPS·전 경로 리버스 프록시 |
| API + UI | **Render** `medipick-api` | `server.py` + `web/` 정적 파일, SQLite on disk |
| Postgres | **Neon** `medipick-lexid` | 배포 메타·향후 SQLite 이전용 (`db/neon/`) |

## 로컬

```powershell
cd medipick-repo
python -m pip install -r requirements.txt
$env:MEDIPICK_ADMIN_PASSWORD="local-dev-only"
python server.py
# http://127.0.0.1:8765
```

## Neon

```powershell
neonctl sql --project-id sparkling-surf-06199778 --file db/neon/001_deploy_meta.sql
```

`DATABASE_URL`은 Render/Vercel 환경변수에 설정 (v3.3 런타임 DB는 SQLite).

## Render (Blueprint)

1. GitHub `skvive/medipick` 연결 → Blueprint `render.yaml` 적용
2. Secret env: `MEDIPICK_ADMIN_PASSWORD`, `MEDIPICK_SECRET`, `DATABASE_URL`
3. Health: `GET /api/health`

## Vercel

```powershell
cd medipick-repo
vercel link --project medipick --yes
vercel env add MEDIPICK_RENDER_ORIGIN production   # https://medipick-api.onrender.com
vercel --prod --yes
vercel domains add medipick.lexid.site
```

`vercel.json`은 Render 오리진으로 rewrite 합니다. Render URL 변경 시 `vercel.json`의 `destination`을 갱신하세요.

## 관리자

- 경로: `/admin`
- 프로덕션: `MEDIPICK_ADMIN_PASSWORD` 필수 (데모 기본값 `medipick-demo-2026`은 외부 바인딩 불가)

## 법·안전

README.md § 상용화 전 필수 과제 준수. 본 배포는 **제품 데모**입니다.
