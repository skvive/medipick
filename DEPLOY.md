# MEDIPICK · medipick.lexid.site

**Vercel (Next.js) + Neon Postgres** — Render 사용하지 않습니다.

| 레이어 | 역할 |
|--------|------|
| **Vercel** | `web/` 정적 UI + `app/api/*` API Routes |
| **Neon** | `DATABASE_URL` — providers·content·예약 등 전체 데이터 |

Python `server.py`는 로컬 개발·레거시 참고용으로 리포에 유지합니다.

## 환경 변수 (Vercel)

- `DATABASE_URL` — Neon pooled connection string
- `MEDIPICK_ADMIN_PASSWORD` — `/admin` 로그인
- `MEDIPICK_SECRET` — 세션 HMAC (64+ chars 권장)
- `MEDIPICK_COOKIE_SECURE=1` — 프로덕션
- `GOOGLE_MAPS_BROWSER_KEY` — 선택
- `MEDIPICK_GA_ID` — 선택

## DB 초기화 (1회)

```powershell
$env:DATABASE_URL="postgresql://..."
npm run db:migrate
node scripts/seed-neon.mjs
```

## 로컬

```powershell
npm install
npm run dev
# http://localhost:3000
```

## 배포

```powershell
vercel link --project medipick-lexid
vercel env pull .env.local
vercel --prod --yes
```

도메인: `medipick.lexid.site` → 프로젝트 **medipick-lexid**, Root Directory **`.`** (edge/ 폴더 사용 안 함)

## API 범위 (Vercel 1차)

- ✅ 메인: config, home, search, content, provider, nearby, events, reviews, appointments, ai/answer
- ✅ 관리자: login, stats, providers/content/doctors/ads/appointments/reviews 조회
- ⏳ billing·clinic·doctor POST 등 — Python parity 이전 예정 (501)
