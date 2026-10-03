# GT CRYPTO APIs premium interface — QA

Base: 6519f128616e21a7b0182338c42966f248a00fb7. Scope: gt-bybit-app only.

## Changes

- Dedicated CSS surface tokens: midnight/graphite, gold, 10/16/24px radii, inset highlights and restrained shadows.
- Refined hero, compact metrics, icon containers, forms, header and mobile navigation.
- Original angular GT SVG monogram with a gold G and silver T, subtle vector depth and no external assets.
- Shared navigation candlestick/wallet geometry, consistent 1.75px strokes.
- Short opacity/transform view reveals, button press depth, active nav indicator and a quiet status pulse. Reduced-motion disables all animation and transitions.
- Light/dark contrast and Arabic RTL/English LTR preserved; financial numerals remain tabular.
- New versioned PWA CSS cache entry. API cache exclusions unchanged.
- Existing demo-state hook now has its missing disclosure element, visible only in explicit demo mode.
- Local QA server now serves SVG with the correct MIME type.

## Verification

- npm run build: 45 tests passed; no skipped tests. Syntax, HTML IDs, CSP, assets, manifest and build validation passed.
- Headless Chromium: 160 combinations (320, 360, 390, 412, 430, 768, 1024, 1440px × 5 views × 2 languages × 2 themes). Zero document overflow, controls outside the viewport, controls below 44×44px, or page errors.
- Visual inspection: mobile overview, login and desktop screenshots.
- Reduced motion: active view animation resolves to none.
- Independent top-level browser flow: synthetic-token login, two reloads preserving session, language/theme persistence, logout invalidation, zero page errors.
- PWA root scope verified; new premium CSS is cached; no API responses in CacheStorage.
- Local mock counter: zero upstream financial mutations; zero real financial actions.
- No new JavaScript runtime/dependency, fonts, video, WebGL, external images or animation library. Added CSS compresses to approximately 3.4KB; SVG uses gradients/paths without filters.

## Limits

Browser evidence uses the existing local mock transport, not a real Bybit account. No live trades or financial operations were performed. Android/iOS hardware, FPS under device load, native installation and production authenticated sessions were not tested. The legacy iframe QA harness has stale reload assumptions; independent top-level Playwright checks provide the session/refresh evidence. No backend, auth, security, financial business logic, routes or production configuration files were modified. This branch is a reviewable preview change; it is not a production release.
