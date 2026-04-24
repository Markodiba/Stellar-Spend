# Implementation Plan: Currency Data Caching

## Overview

Implement a Redis-backed cache-aside layer for the four currency/rate API routes using ioredis. Build the core library modules first, then wire them into the routes, and finally add the metrics and invalidation endpoints.

## Tasks

- [ ] 1. Install dependencies and extend environment configuration
  - Add `ioredis` to dependencies and `fast-check` to devDependencies via `npm install ioredis` and `npm install -D fast-check @types/ioredis`
  - Add `REDIS_URL`, `CACHE_TTL_CURRENCIES`, `CACHE_TTL_INSTITUTIONS`, `CACHE_TTL_FX_RATES` to `.env.example` with documented defaults
  - Add the four new env var keys to `src/types/env.d.ts` as optional `string` fields on `ProcessEnv`
  - _Requirements: 8.5_

- [ ] 2. Implement `src/lib/cache-config.ts`
  - [ ] 2.1 Create `getCacheConfig()` that reads the four env vars and returns a `CacheConfig` object
    - Parse each TTL var with `parseInt`; if the result is `NaN`, `<= 0`, or the var is absent, use the default (300 / 300 / 60)
    - Read `REDIS_URL` with fallback to `"redis://localhost:6379"`
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [ ]\* 2.2 Write property test for invalid TTL fallback
    - **Property 7: Invalid TTL env vars fall back to defaults**
    - Use `fc.oneof(fc.constant(""), fc.constant("abc"), fc.integer({ max: 0 }).map(String))` to generate invalid values; assert `getCacheConfig()` returns the default for each TTL field
    - **Validates: Requirements 8.1, 8.2, 8.3, 8.4**

- [ ] 3. Implement `src/lib/cache-client.ts`
  - [ ] 3.1 Create the ioredis singleton with `lazyConnect: true`, `enableOfflineQueue: false`, `maxRetriesPerRequest: 1`, `connectTimeout: 2000`
    - Export `getCacheClient()`, `getCacheClientConfig()`, and `resetCacheClient()` (for tests)
    - Log a structured warning `{ event: "cache_connect_error", error, timestamp }` on the `"error"` event
    - _Requirements: 4.1, 8.5_

  - [ ]\* 3.2 Write unit tests for cache-client
    - Verify singleton is reused across calls
    - Verify `resetCacheClient()` creates a new instance on next call
    - Mock ioredis with `vi.mock('ioredis')`
    - _Requirements: 4.1_

- [ ] 4. Implement `src/lib/metrics-store.ts`
  - [ ] 4.1 Create module-scope counters map and export `recordHit`, `recordMiss`, `getMetrics`, `resetMetrics`
    - `getMetrics()` returns a snapshot object keyed by prefix (`"currencies"`, `"institutions"`, `"fx-rates"`)
    - _Requirements: 5.3, 5.5_

  - [ ]\* 4.2 Write property test for counter accuracy
    - **Property 5: Metrics counters accurately reflect hit/miss sequences**
    - Use `fc.integer({ min: 0, max: 100 })` for hit count N and miss count M; call `recordHit` N times and `recordMiss` M times; assert `getMetrics()` returns exactly N hits and M misses
    - **Validates: Requirements 5.1, 5.2, 5.3**

- [ ] 5. Implement `src/lib/cache-manager.ts`
  - [ ] 5.1 Implement `CacheManager.get<T>(key)` — wraps `redis.get(key)`, parses JSON, records hit/miss, logs event, returns `CacheGetResult`; catches all errors and returns `{ value: null, hit: false, fallback: true }`
    - _Requirements: 1.1, 1.2, 2.1, 2.2, 3.1, 3.2, 4.2, 4.4, 5.1, 5.2_

  - [ ] 5.2 Implement `CacheManager.set<T>(key, value, ttlSeconds)` — wraps `redis.set(key, JSON.stringify(value), "EX", ttl)`; catches all errors, logs them, returns void silently
    - _Requirements: 1.3, 2.3, 3.3, 4.3, 4.4_

  - [ ] 5.3 Implement `CacheManager.del(key)` and `CacheManager.delByPrefix(prefix)` — `delByPrefix` uses `redis.keys(prefix + "*")` then `pipeline().del(...keys).exec()`; both re-throw as `CacheOperationError` on Redis errors
    - _Requirements: 6.1, 6.2, 6.5_

  - [ ]\* 5.4 Write property test for cache hit bypasses upstream
    - **Property 1: Cache hit bypasses upstream**
    - Use `fc.string()` for key and `fc.jsonValue()` for value; mock `redis.get` to return the serialised value; assert the upstream handler is never called
    - **Validates: Requirements 1.1, 1.2, 2.1, 2.2, 3.1, 3.2**

  - [ ]\* 5.5 Write property test for cache miss round-trip
    - **Property 2: Cache miss stores and returns upstream response**
    - Use `fc.string()` for key, `fc.jsonValue()` for value, `fc.integer({ min: 1 })` for TTL; mock `redis.get` to return null, mock `redis.set` to capture args; assert upstream is called and `redis.set` is called with the correct key, serialised value, and TTL
    - **Validates: Requirements 1.3, 2.3, 3.3**

  - [ ]\* 5.6 Write property test for error fallback without propagation
    - **Property 3: Cache errors trigger fallback without propagation**
    - Use `fc.string()` for key and `fc.anything()` for the thrown error; mock `redis.get` to throw; assert `get()` resolves (does not reject) with `fallback: true` and the upstream handler is invoked
    - **Validates: Requirements 1.5, 2.5, 3.5, 4.2, 4.3, 4.4, 4.5**

  - [ ]\* 5.7 Write property test for institution key normalisation
    - **Property 4: Institution key normalises currency to lower-case**
    - Use `fc.string()` for currency code; assert the key passed to `redis.get` equals `"institutions:" + currency.toLowerCase()`
    - **Validates: Requirements 2.4, 7.2**

  - [ ]\* 5.8 Write property test for cache key format
    - **Property 8: Cache key format matches prefix:discriminator pattern**
    - For all keys produced by the key-builder functions, assert each matches `/^[a-z-]+:[a-z0-9-]+$/`
    - **Validates: Requirements 7.1, 7.4**

  - [ ]\* 5.9 Write property test for invalidation removes targeted keys
    - **Property 6: Invalidation removes targeted keys**
    - Use `fc.array(fc.string({ minLength: 1 }), { minLength: 1 })` for key sets; mock `redis.keys` and `redis.del`; assert `delByPrefix` returns the correct deleted count and all matching keys are removed
    - **Validates: Requirements 6.1, 6.2**

- [ ] 6. Checkpoint — Ensure all lib tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Implement `src/lib/cache-wrapper.ts`
  - [ ] 7.1 Implement `withCache(key, ttlSeconds, handler)` HOF for Next.js App Router handlers
    - Accept `key` as a string or `(req: NextRequest) => string` to support dynamic keys (e.g. institution currency param)
    - On hit: return `NextResponse.json(cachedValue)` without calling handler
    - On miss: call handler, clone the response to read the JSON body, call `cacheManager.set`, return the original response
    - On fallback: call handler and return its response unchanged
    - _Requirements: 1.1–1.5, 2.1–2.5, 3.1–3.5, 4.2–4.5_

  - [ ]\* 7.2 Write unit tests for withCache HOF
    - Test hit path: mock `cacheManager.get` to return a value; assert handler not called and response body matches cached value
    - Test miss path: mock `cacheManager.get` to return null; assert handler called and `cacheManager.set` called with correct args
    - Test fallback path: mock `cacheManager.get` to return fallback; assert handler called and no set attempted
    - _Requirements: 1.1–1.5, 2.1–2.5, 3.1–3.5_

- [ ] 8. Wire caching into the four API routes
  - [ ] 8.1 Update `src/app/api/offramp/currencies/route.ts`
    - Remove the existing module-level in-memory cache (`cachedCurrencies`, `cacheTimestamp`, `CACHE_DURATION`)
    - Wrap the GET handler body with `withCache("currencies:list", getCacheConfig().ttlCurrencies, handler)`
    - _Requirements: 1.1–1.5_

  - [ ] 8.2 Update `src/app/api/offramp/institutions/[currency]/route.ts`
    - Wrap the GET handler with `withCache((req) => "institutions:" + currency.toLowerCase(), getCacheConfig().ttlInstitutions, handler)`
    - Extract the currency param from `req` URL inside the key function
    - _Requirements: 2.1–2.5_

  - [ ] 8.3 Update `src/app/api/offramp/rate/route.ts`
    - Wrap the GET handler with `withCache("fx-rates:offramp", getCacheConfig().ttlFxRates, handler)`
    - _Requirements: 3.1–3.5_

  - [ ] 8.4 Update `src/app/api/fx-rates/route.ts`
    - Remove the `export const revalidate = 30` directive (Redis TTL replaces Next.js revalidation)
    - Wrap the GET handler with `withCache("fx-rates:general", getCacheConfig().ttlFxRates, handler)`
    - _Requirements: 3.1–3.5_

- [ ] 9. Implement `src/app/api/cache/metrics/route.ts`
  - Implement `GET /api/cache/metrics` — call `getMetrics()` and return `NextResponse.json(snapshot)`
  - _Requirements: 5.4_

- [ ] 10. Implement `src/app/api/cache/invalidate/route.ts`
  - [ ] 10.1 Implement `DELETE /api/cache/invalidate`
    - Parse `key` and `prefix` from `req.nextUrl.searchParams`
    - If neither is present, return 400 with `{ error: "key or prefix query parameter is required" }`
    - If `key` is present, call `cacheManager.del(key)` and return `{ deleted: count }`
    - If `prefix` is present, call `cacheManager.delByPrefix(prefix)` and return `{ deleted: count }`
    - Catch `CacheOperationError` and return 503 with `{ error: message }`
    - _Requirements: 6.1–6.5_

  - [ ]\* 10.2 Write unit tests for invalidation route
    - Test 400 on missing params (edge case 6.3)
    - Test 200 with `deleted: 0` when key does not exist (edge case 6.4)
    - Test 503 on `CacheOperationError` (6.5)
    - _Requirements: 6.3, 6.4, 6.5_

- [ ] 11. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 12. Add v1 re-exports for new cache routes
  - Create `src/app/api/v1/cache/metrics/route.ts` re-exporting from the canonical route
  - Create `src/app/api/v1/cache/invalidate/route.ts` re-exporting from the canonical route
  - _Requirements: 5.4, 6.1_

- [ ] 13. Final checkpoint — Ensure all tests pass
  - Run `npm test` and confirm all existing tests still pass (no regression on route handlers)
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Property tests use `fast-check` with a minimum of 100 iterations per property
- ioredis is mocked via `vi.mock('ioredis')` — no real Redis needed for tests
- The existing in-memory cache in the currencies route is intentionally removed in task 8.1
