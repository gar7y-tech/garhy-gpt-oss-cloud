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

## UX follow-up

Implemented account task shortcuts, an expandable concise workflow guide, field-linked bilingual validation errors using the existing validators, first-invalid-field focus, automatic error clearing on correction/reset, contextual explanations for disabled order fields, keyboard-scrollable overflowing table regions, refresh ARIA feedback, and return focus after canceling review. No form values or credentials are persisted by the UX module.

A confirmation dialog now starts each opening with a cancel return value. This prevents a previous confirmed result from being reused when the next review is dismissed with Escape. Server confirmation/CSRF/idempotency and transport remain unchanged.

Landscape testing exposed the absolute sidebar footer overlapping Settings at 844×390. The sidebar now uses a scrollable column and a normal-flow footer at desktop widths.

Validation after these changes:

- Project build and all 45 tests pass with no skips.
- 27 browser checkpoints pass, including login with Enter, refresh session persistence, shortcuts, required and decimal feedback, bilingual errors, disabled/Limit field guidance, safe initial modal focus, Escape cancel/focus restoration, exactly one explicitly confirmed mock operation, Escape after previous confirmation, keyboard table access, PWA UX-module cache/no-API-cache, preference persistence and server logout invalidation.
- All 160 responsive combinations pass after the sidebar fix, with controls/summary touch targets ≥44×44px, no overflow/outside controls, and zero JavaScript page errors.
- Landscape 844×390 and reduced-motion checks pass.
- Exactly one synthetic mock operation, zero real financial operations; the local server injects mockRequest even in its guarded-operation QA mode. Browser network requests are restricted to the local server.
- Reproducible local runner: scripts/ux-browser-qa.mjs. Requires Playwright and Chromium in the QA environment. GT_QA_BROWSER can point to the environment's Chromium binary; GT_QA_REPORT optionally saves the JSON evidence.

Live browser testing remains blocked by the earlier automatic approval rejection for third-party telemetry; no retry or bypass was performed. Native hardware performance and production authenticated financial operations remain unverified.

Final UX review additionally verified that three mobile shortcuts fit in one compact row, preserving space for account metrics. The login button presents a preparing state until the existing boot checks finish, Enter respects its disabled state, and normal control availability is recalculated after the existing login pending state clears. These are UI readiness/disabled-state updates; credential verification, session lifetime/rotation, API payloads and all authorization rules are unchanged. The local demo screenshot again renders its explicitly labeled synthetic balance consistently.

Final local validation: 61 repository tests (including the 45 standalone app tests), standalone app build, 27 guarded mock browser checkpoints, 160 responsive combinations, landscape, reduced motion, and visual inspection of mobile overview/inline errors all pass. The UX module is 2,849 bytes gzip and introduces no external runtime library.
