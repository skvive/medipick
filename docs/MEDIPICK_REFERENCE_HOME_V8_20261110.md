# MediPick v8 — Screenshot-matched homepage implementation
Date: 2026-11-10 (KST)
Reference: user-provided 1672×941 MediPick homepage screenshot.
Repo: skvive/medipick, continuation of v7 PR #21; no replacement repository.

## Exact layout mapping
- Brand navigation: working login, sign-up, doctor services, mobile menu.
- Hero: blue medical gradient, existing approved generated clinical-team artwork, CSS medical smartphone scene, prominent hospital keyword search.
- Search shortcuts: permission-based geolocation, default center, night/weekend services.
- Horizontal 12-item medical service rail; mobile swipe only within the rail.
- Main desktop: 12 specialty buttons plus health guide | Google Map + Google Places button | live hospital list from existing backend.
- Footer: public data source and institutional disclaimer.
- Mobile: map + actual results first; specialty grid follows.

## Backend and content reuse
- / : live screenshot-inspired 3-column homepage.
- /portal : prior long portal fully preserved including directory, content and appointment flows.
- /smart-store : existing full hospital directory.
- /clinic-store?id= : gated premium catalog and Google Blogger data, not accessible to free/unapproved entries.
- /premium-admin : admin protected paid-store configuration and manual compliance acknowledgement.
- Existing /api/public-catalog/search and /api/public-catalog/nearby with accurate-coordinates-first policy.
- Google Places API (New): on-demand only with separate purple pins, plus the matched results in the home right-side list; not stored in catalog.
- Existing Neon login/account, AI consult, Doctors, Health Content routes retained. No DB migration or deletion.

## Safety and accuracy
- Screen mock example names, review counts, ratings, bookings and pin positions are NOT used as real data.
- Geocode status approx coordinates are never silently treated as exact.
- No automatic live Places search on page load (user click required due pricing, privacy, and consent).
- Previously checked Neon public_hospital_stores: 30,391 listed candidates; zero exact coordinates; zero active premium storefronts at that time. Fresh verified hospital data is needed for catalog pins.
- Existing generated clinical hero is an illustrative concept, not a real clinic photo.

## QA gates
- node --test tests/map-first-contract.test.mjs for DOM elements, route preservation, map + Blogger access, and JS syntax.
- scripts/qa-web-responsive.py across 320/390/768/1024/1440 in Chromium, Firefox, WebKit. Static QA strips backend requests and therefore does NOT validate live Google APIs.
- Vercel production build READY and explicit project/commit readback before release.
- Post-release: live browser Google Maps browser key restrictions, Places API (New) enablement/billing, provider identity, location and appointment flows require separate verification.
