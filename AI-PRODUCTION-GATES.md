# HANA and GARHY company assistant release gates

This change is held from production until durable budget storage is configured. Current HANA Production has GROQ_API_KEY but no Redis REST binding. Health returns 503 when provider configuration or budget storage is unavailable; it never silently uses process-local counters.

Required server-only environment names: UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN. Preserve GROQ_API_KEY. AI_RATE_LIMIT_SALT is optional; without it, the server derives a private HMAC salt from its provider credential. Never expose these values to client code or logs.

Use an isolated durable store for HANA. Do not connect unrestricted GT CRYPTO session storage to public AI endpoints. If a shared provider is ever used, explicit key/command ACL isolation and capacity review are required first.

Release sequence: CI PASS; configure the isolated binding securely; verify actual health/abuseProtectionReady; merge this batch; verify canonical garhy.ai; then release the separate corporate companion UI. No production database migration or financial mutation is part of this release.

Security contract:
- Origin is a browser request guard, not authentication. Missing/unapproved origins are rejected; trusted Vercel client-IP headers, durable per-IP/global quotas and concurrent leases bound anonymous public access.
- Exact production Lua is tested against real Redis: atomic burst admission, quotas across independent consumers, lease release and real TTL expiry. The HTTPS adapter is an explicit test fixture.
- Only user/assistant turns, approved models and server-owned professional modes are accepted. System authority cannot be supplied by the browser.
- Request/message/token budgets, provider deadlines, no automatic provider retries and safe errors constrain cost and information leakage.
- The company endpoint validates a single bounded message, classifies scope/injection attempts, retrieves only approved public GARHY facts, and asks the provider to select retrieved fact IDs. Output and source URLs are validated; final text is rendered from the approved facts, never arbitrary model prose.

Approved knowledge is versioned in hana-ai-pro/lib/garhy-knowledge.js. Company facts must cite official public sources. Unknown products return uncertainty and out-of-scope questions return a company redirect. HANA subscription/usage tables currently have no source integration: UNUSED, not active billing enforcement.

Validation before this PR: 68 actual Node tests PASS, including real Redis integration, company scope/injection/hallucination cases and the existing GT CRYPTO read-only fixture tests. These are local/CI evidence, not production provider or authenticated operator verification.

Rollback: previous verified source/deployment SHA. Preserve the isolated storage binding for safe redeploy; never bypass readiness or switch back to memory-only budgets.
