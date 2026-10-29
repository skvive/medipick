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
- **`NEON_AUTH_BASE_URL`** — Neon Console → Branch → Auth → Project Info (예: `https://ep-….neonauth….neon.tech/neondb/auth`)
- **`NEON_AUTH_COOKIE_SECRET`** — 32+ bytes (`openssl rand -base64 32`)
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

Neon Console → Auth → **Trusted domains**에 `https://medipick.lexid.site` 추가 (OAuth callback용).

## 사용자 로그인 (Neon Auth)

| URL | 설명 |
|-----|------|
| `/auth/sign-in` | Google·GitHub·Vercel OAuth + 이메일 로그인 |
| `/auth/sign-up` | 회원가입 |
| `/account` | 로그인 후 계정·로그아웃 |

Google OAuth는 Neon **공유 개발용** 자격으로 즉시 테스트 가능. GitHub/Vercel은 Neon Console → Auth → OAuth providers에 Client ID/Secret 등록.

관리자 HTML(`/admin`) 비밀번호 로그인은 기존 `MEDIPICK_ADMIN_PASSWORD`와 별도입니다.

## API 범위 (Vercel 1차)

- ✅ 메인: config, home, search, content, provider, nearby, events, reviews, appointments, ai/answer
- ✅ 관리자: login, stats, providers/content/doctors/ads/appointments/reviews 조회
- ⏳ billing·clinic·doctor POST 등 — Python parity 이전 예정 (501)
+- ✅ Vercel handler: admin CRUD·moderate·keys·subscriptions·locations·clinic/doctor API·advertiser·integrations (501 제거)
+- DB: `npm run db:migrate` = `001_schema.sql` + `002_extensions.sql`
