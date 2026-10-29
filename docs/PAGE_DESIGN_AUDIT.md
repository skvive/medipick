# MEDIPICK 페이지별 디자인 검수 (2026-10-29)

## 공통 이슈 → 조치

| 이슈 | 조치 |
|------|------|
| 좌상단 브랜드가 문자/기호만 (`✳`, `P`, `✚`) | **`logo-full.svg` + `logo-mark.jpg`** 정식 로고 |
| 페이지마다 헤더 구조·높이·색상 불일치 | **`site-shell.css` + `site-chrome.js`** 통합 헤더 |
| 섹션 padding 74px vs 48px 혼재 | **`--mp-section-y` / `--mp-section-y-lg`** 44~56px 통일 |
| `.wrap` 1168 vs 1080 혼재 | **1120px** 컨테이너 |
| v3 `mast` vs index `header` 이중 체계 | 서브페이지 mast → **mp-site-header** 자동 교체 |
| 히어로 이미지 카테고리 불일치 | 페이지별 **hero-*.jpg** 생성·교체 |

## 페이지별

| 페이지 | 검수 결과 | 적용 |
|--------|-----------|------|
| `/` index | GNB 과밀, 로고 약함, 히어로 여백 | logo-full, site-shell, layout-refine 유지 |
| `/consult` | mast + 구형 브랜드 | chrome + hero-consult.jpg |
| `/my-health` | portal 여백·로고 | chrome + site-shell rhythm |
| `/doctors` | ✚ 로고, cat07 이미지 | chrome + hero-doctors.jpg + brand-trend |
| `/doctor-finance` | B2B nav만, 로고 없음 | chrome + B2B nav 확장 |
| `/marketing-console` | 동일 | chrome |
| `/clinic-ops` · `/clinic-access` | ops wrap padding | chrome + ops spacing |
| `/integrations` | brand-symbol만 | logo-full in lockup |
| `/admin` | ✳ 로그인 마크 | site-shell login-mark 이미지 |
| `/premium-admin` | 텍스트 로고 | mp-site-header |
| `/advertiser` | ✳ | logo-full in header |
| `/auth/*` (Next) | 별도 auth.css | 유지 (Neon Auth) |

## 잔여 권장

- admin 사이드바 전용 **로고 SVG** 고정폭
- 모바일 GNB **햄버거** 단일화 (index `menuToggle` vs 서브페이지 nav scroll)
- `cat01~12.webp` 카테고리 썸네일 일괄 리프레시 (선택)
