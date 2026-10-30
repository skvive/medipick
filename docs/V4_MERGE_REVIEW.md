# MEDIPICK v4.0 ZIP — 비판적 이식 검토 (2026-10-30)

원본: `MEDIPICK_v4_0_Complete_Design_HTML_Backend_Content.zip` → `_import_v4/MEDIPICK/`

## 채택 (프로덕션 반영)

| 항목 | 경로 | 비고 |
|------|------|------|
| v4 디자인 시스템 CSS | `web/assets/v4/medipick-v4.css` | `.v4-page` 스코프 — DOM ID·API 핸들러 유지 |
| v4 네비 보조 JS | `web/assets/v4/medipick-v4.js` | `data-v4-nav` + `window.setNav` |
| v3.4 에디토리얼 | `web/assets/v34.css`, `v34-home.js` | 홈 `#editorial-v34` |
| 홈 v4 섹션 | `web/index.html` | 5카드 `v4-services`, `v4-portal-feature`, 에디토리얼 그리드 |
| 병원 전용 상세 | `web/hospital.html`, `hospital.js` | `/api/provider/:id`, `/api/appointments` (Neon) |
| 라우트 | `next.config.ts` | `/hospital` → `hospital.html` |
| 드로어 → 상세 | `web/assets/app.js` | `/hospital?id=` 링크, `setNav` v4 섹션 토글 |

## 유지 (ZIP으로 교체하지 않음)

- **Next.js 15 + Neon Postgres + Vercel** — ZIP의 `server.py`/SQLite 백엔드는 시연용, 프로덕션 정본 아님.
- **핑크·후기 브랜드 카피** — v4 ZIP은 블루 클리니컬·구독-only 내 주변 문구; prod는 REAL REVIEW + **가락시장역 기본 좌표**, **공공 카탈로그 체크박스**, **스마트스토어 GNB** 유지.
- **Neon Auth** — `/auth/sign-in`, `/account` 등 v4 index에 없던 항목 유지.
- **스마트스토어·카탈로그 API** — v4 HTML에 없음; v4 레일·에디토리얼 3번 타일을 `/smart-store`로 연결.

## 기각·부분 기각

| ZIP 내용 | 판단 |
|----------|------|
| Python `server.py` 전체 | 기각 — API는 `lib/medipick/handler.ts` |
| v4 index로 홈 **전면 교체** | 기각 — 기능 회귀(카탈로그·로그인·스마트스토어) |
| v4 전용 `.webp` 번들 | ZIP 추출본에 바이너리 없음 — `web/assets/photos/*`로 대체 |
| v4 «강남 시연 위치» | 기각 — `DEFAULT_MAP_CENTER` 가락시장역 유지 |
| v4 GNB(스마트스토어·로그인 없음) | 기각 — 기존 `site-shell` 헤더 유지 |

## 시각 충돌 완화

- `body.mp-home.v4-page.v4-index`: v4 CSS가 히어로·푸터를 블루 계열로 harmonize; `brand-trend.css`는 로고·일부 핑크 악센트만 잔존 가능.
- 검색/콘텐츠 모드 시 v4 CSS `:has(#directoryPage:not(.hidden))` 규칙 + `setNav`에서 v4 섹션 `hidden` 처리.

## 검증

```bash
npm run build
# prod: vercel --prod --yes
```

- `/` — v4 레일·에디토리얼 + 내 주변·카탈로그
- `/hospital?id=1` — 예약 폼 POST
- `/consult` — `v4-consult` 스타일
