# Implementation Plan: Rate Limiting

## Overview

Implement a sliding-window rate limiter in `src/lib/rate-limiter.ts`, a config reader in `src/lib/rate-limit-config.ts`, and wire both into the existing `middleware.ts`. Authenticated callers (Bearer token) get a higher quota. All violations are logged as structured JSON. Property-based tests use **fast-check**.

## Tasks

- [ ] 1. Add fast-check dev dependency and create core rate limiter module
  - Install `fast-check` as a dev dependency (`npm install --save-dev fast-check`)
  - Create `src/lib/rate-limit-config.ts` with `getRateLimitConfig()` reading `RATE_LIMIT_UNAUTHENTICATED`, `RATE_LIMIT_AUTHENTICATED`, `RATE_LIMIT_WINDOW_SECONDS` env vars; fall back to defaults (100, 1000, 60) for missing or invalid values
  - Create `src/lib/rate-limiter.ts` with `RateLimiter` class implementing sliding-window `check(identifier, config): RateLimitResult` and a module-level singleton `rateLimiter`
  - Export `RateLimitConfig`, `RateLimitResult`, `RateLimiter`, and `rateLimiter`
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 5.1, 5.2, 5.3, 5.4_

  - [ ]\* 1.1 Write unit tests for RateLimiter (`src/test/rate-limiter.test.ts`)
    - Test: exactly at limit → allowed; one over → blocked
    - Test: window expiry resets counter
    - Test: `remaining` is `limit - n` after `n` calls
    - Test: `remaining` never goes below 0
    - _Requirements: 1.2, 1.3, 1.5, 2.5_

  - [ ]\* 1.2 Write unit tests for getRateLimitConfig (`src/test/rate-limit-config.test.ts`)
    - Test: no env vars → defaults (100, 1000, 60)
    - Test: valid env vars → parsed values
    - Test: `"0"`, `"-1"`, `"abc"` → defaults used
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [ ]\* 1.3 Write property tests for RateLimiter (`src/test/rate-limiter.property.test.ts`)
    - **Property 1: Requests within limit are always allowed** — `fc.property(fc.string(), fc.integer({min:1,max:500}), fc.integer({min:1}), ...)` — `Feature: rate-limiting, Property 1`
    - **Property 2: Requests beyond limit are always blocked** — `Feature: rate-limiting, Property 2`
    - **Property 3: Remaining never goes negative** — `Feature: rate-limiting, Property 3`
    - **Property 4: Remaining decrements correctly** — `Feature: rate-limiting, Property 4`
    - **Property 5: Window reset restores full quota** — advance mock clock past windowSeconds — `Feature: rate-limiting, Property 5`
    - **Property 7: Invalid env var values fall back to defaults** — generate random non-numeric/non-positive strings — `Feature: rate-limiting, Property 7`
    - Minimum 100 iterations per property (`numRuns: 100`)
    - _Requirements: 1.2, 1.3, 1.5, 2.5, 5.4_

- [ ] 2. Implement middleware helper functions
  - Add `extractClientIp(request: NextRequest): string` to `middleware.ts` — reads first value from `x-forwarded-for` (comma-split), falls back to `x-real-ip`, then `"unknown"`
  - Add `extractApiKey(request: NextRequest): string | null` — parses `Authorization: Bearer <token>`, returns `null` for any other scheme or missing header
  - Add `addRateLimitHeaders(response: NextResponse, result: RateLimitResult): void` — sets `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`; adds `Retry-After` only when `!result.allowed`
  - Add `logViolation(ip: string, identifier: string, path: string): void` — emits `console.log(JSON.stringify({event:"rate_limit_violation", ip, identifier, path, timestamp}))` with API key redacted to first 8 chars + `"..."`
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 4.1, 4.2, 4.3, 6.3, 6.4_

  - [ ]\* 2.1 Write unit tests for middleware helpers (`src/test/rate-limit-middleware.test.ts`)
    - Test `extractClientIp`: `x-forwarded-for` with multiple IPs, only `x-real-ip`, neither header → `"unknown"`
    - Test `extractApiKey`: valid Bearer, Basic scheme, missing header, empty token
    - Test `addRateLimitHeaders`: headers present on allowed response; `Retry-After` present only on blocked
    - Test `logViolation`: log entry shape, `event` field value, API key redaction (first 8 chars + `"..."`)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 4.1, 4.2, 4.3, 6.3_

  - [ ]\* 2.2 Write property tests for helper functions (`src/test/rate-limit-middleware.property.test.ts`)
    - **Property 8: IP extraction precedence** — generate requests with random header combinations — `Feature: rate-limiting, Property 8`
    - **Property 9: API key redaction preserves first 8 characters** — generate random strings of length ≥ 8 — `Feature: rate-limiting, Property 9`
    - Minimum 100 iterations per property
    - _Requirements: 4.3, 6.3, 6.4_

- [ ] 3. Checkpoint — Ensure all tests pass
  - Run `npm test` and confirm all unit and property tests pass. Ask the user if any questions arise.

- [ ] 4. Wire rate limiting into middleware.ts
  - Import `rateLimiter` from `src/lib/rate-limiter`, `getRateLimitConfig` from `src/lib/rate-limit-config`, and the helper functions
  - At the top of the `middleware` function (before existing versioning logic), call `extractClientIp`, `extractApiKey`, and `getRateLimitConfig`
  - Select identifier: API key (if present) → use `authenticatedLimit`; otherwise Client_IP → use `unauthenticatedLimit`
  - Call `rateLimiter.check(identifier, { limit, windowSeconds })`
  - If `!result.allowed`: call `logViolation`, return `NextResponse.json({error:"RATE_LIMITED", message:"..."}, {status:429})` with rate limit headers
  - If allowed: call `NextResponse.next()`, add rate limit headers, continue to existing versioning logic
  - _Requirements: 1.2, 1.3, 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4, 6.1, 6.2_

  - [ ]\* 4.1 Write integration tests for the wired middleware (`src/test/rate-limit-integration.test.ts`)
    - Test: unauthenticated request under limit → 200 with rate limit headers
    - Test: unauthenticated request over limit → 429 with `Retry-After`
    - Test: authenticated request uses higher limit (does not 429 at unauthenticated threshold)
    - Test: `Authorization: Basic ...` treated as unauthenticated
    - Test: missing IP headers → `"unknown"` identifier, still rate limited
    - _Requirements: 1.2, 1.3, 2.4, 3.1, 3.3, 6.1, 6.4_

- [ ] 5. Final checkpoint — Ensure all tests pass
  - Run `npm test` and confirm the full test suite passes. Ask the user if any questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- `fast-check` must be installed before running property tests
- The `RateLimiter` singleton uses module-scope `Map` state — tests must call `rateLimiter.reset()` in `beforeEach` to avoid cross-test pollution
- The middleware runs in the Next.js edge runtime; avoid Node.js-only APIs in `rate-limiter.ts` and `rate-limit-config.ts`
- Property tests should mock `Date.now()` to control window timing deterministically
