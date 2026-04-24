# Requirements Document

## Introduction

This feature adds a Redis-backed caching layer for frequently accessed currency and institution data in the StellarSpend Next.js API. The four affected routes — `/api/offramp/currencies`, `/api/offramp/institutions/[currency]`, `/api/offramp/rate`, and `/api/fx-rates` — currently fetch data from upstream services on every request. Caching these responses in Redis reduces upstream latency, lowers external API call volume, and improves overall API throughput. The cache layer must degrade gracefully when Redis is unavailable, expose hit/miss metrics for observability, and support manual invalidation for operational control.

## Glossary

- **Cache**: The Redis-backed store used to hold serialised API responses keyed by route and parameters.
- **Cache_Client**: The ioredis client instance used to communicate with Redis.
- **Cache_Manager**: The module responsible for get, set, invalidate, and metrics operations against the Cache.
- **TTL**: Time-to-live — the number of seconds a cached entry remains valid before Redis evicts it automatically.
- **Cache_Key**: A deterministic string derived from the route path and relevant query parameters that uniquely identifies a cached response.
- **Cache_Hit**: An event where a valid cached value is found and returned without calling the upstream service.
- **Cache_Miss**: An event where no valid cached value exists and the upstream service must be called.
- **Cache_Fallback**: The behaviour where, if the Cache_Client is unavailable or returns an error, the system proceeds to call the upstream service as if no cache existed.
- **Metrics**: Counters tracking Cache_Hit and Cache_Miss events per Cache_Key prefix, emitted as structured JSON log entries.
- **Invalidation**: The act of deleting one or more Cache entries before their TTL expires, triggered by an operator API call.
- **Upstream**: The external service or internal handler that produces the authoritative response for a given route.
- **Currency_Route**: The `/api/offramp/currencies` route returning the list of supported currencies.
- **Institution_Route**: The `/api/offramp/institutions/[currency]` route returning institutions for a given currency code.
- **Rate_Route**: Either `/api/offramp/rate` or `/api/fx-rates`, both returning foreign exchange rate data.

## Requirements

### Requirement 1: Cache Supported Currencies

**User Story:** As an API consumer, I want the list of supported currencies to be served from cache, so that repeated requests are fast and do not hit the upstream service on every call.

#### Acceptance Criteria

1. WHEN a request is received on `/api/offramp/currencies`, THE Cache_Manager SHALL check the Cache for a valid entry before calling the Upstream handler.
2. WHEN a Cache_Hit occurs on the Currency_Route, THE Cache_Manager SHALL return the cached response without invoking the Upstream handler.
3. WHEN a Cache_Miss occurs on the Currency_Route, THE Cache_Manager SHALL invoke the Upstream handler, store the response in the Cache with a TTL of 300 seconds, and return the response to the caller.
4. THE Cache_Manager SHALL use the Cache_Key `"currencies:list"` for the Currency_Route.
5. IF the Cache_Client is unavailable when handling a Currency_Route request, THEN THE Cache_Manager SHALL invoke the Upstream handler directly and return its response without caching.

---

### Requirement 2: Cache Institutions per Currency

**User Story:** As an API consumer, I want institution data for each currency to be served from cache, so that per-currency lookups are fast without redundant upstream calls.

#### Acceptance Criteria

1. WHEN a request is received on `/api/offramp/institutions/[currency]`, THE Cache_Manager SHALL check the Cache for a valid entry before calling the Upstream handler.
2. WHEN a Cache_Hit occurs on the Institution_Route, THE Cache_Manager SHALL return the cached response without invoking the Upstream handler.
3. WHEN a Cache_Miss occurs on the Institution_Route, THE Cache_Manager SHALL invoke the Upstream handler, store the response in the Cache with a TTL of 300 seconds, and return the response to the caller.
4. THE Cache_Manager SHALL use the Cache_Key `"institutions:{currency}"` where `{currency}` is the lower-cased currency code from the route parameter.
5. IF the Cache_Client is unavailable when handling an Institution_Route request, THEN THE Cache_Manager SHALL invoke the Upstream handler directly and return its response without caching.

---

### Requirement 3: Cache FX Rates

**User Story:** As an API consumer, I want FX rate data to be served from cache, so that high-frequency rate queries do not overwhelm the upstream rate service.

#### Acceptance Criteria

1. WHEN a request is received on `/api/offramp/rate` or `/api/fx-rates`, THE Cache_Manager SHALL check the Cache for a valid entry before calling the Upstream handler.
2. WHEN a Cache_Hit occurs on a Rate_Route, THE Cache_Manager SHALL return the cached response without invoking the Upstream handler.
3. WHEN a Cache_Miss occurs on a Rate_Route, THE Cache_Manager SHALL invoke the Upstream handler, store the response in the Cache with a TTL of 60 seconds, and return the response to the caller.
4. THE Cache_Manager SHALL use the Cache_Key `"fx-rates:offramp"` for `/api/offramp/rate` and `"fx-rates:general"` for `/api/fx-rates`.
5. IF the Cache_Client is unavailable when handling a Rate_Route request, THEN THE Cache_Manager SHALL invoke the Upstream handler directly and return its response without caching.

---

### Requirement 4: Graceful Cache Fallback

**User Story:** As an operator, I want the API to continue functioning when Redis is unavailable, so that a cache outage does not cause API downtime.

#### Acceptance Criteria

1. WHEN the Cache_Client fails to connect to Redis on startup, THE Cache_Manager SHALL log a structured warning and continue operating in pass-through mode.
2. WHEN a Cache read operation throws an error, THE Cache_Manager SHALL log the error as a structured JSON entry and proceed to call the Upstream handler as a Cache_Fallback.
3. WHEN a Cache write operation throws an error, THE Cache_Manager SHALL log the error as a structured JSON entry and return the Upstream response to the caller without retrying the write.
4. THE Cache_Manager SHALL never propagate a Cache_Client error to the API caller — all cache errors SHALL be caught and handled internally.
5. WHILE the Cache_Client is unavailable, THE Cache_Manager SHALL continue to serve all routes via Cache_Fallback without returning error responses.

---

### Requirement 5: Cache Hit/Miss Metrics

**User Story:** As an operator, I want cache hit and miss events to be logged, so that I can monitor cache effectiveness and tune TTLs.

#### Acceptance Criteria

1. WHEN a Cache_Hit occurs, THE Cache_Manager SHALL emit a structured JSON log entry with the fields `event: "cache_hit"`, `key`, and `timestamp`.
2. WHEN a Cache_Miss occurs, THE Cache_Manager SHALL emit a structured JSON log entry with the fields `event: "cache_miss"`, `key`, and `timestamp`.
3. THE Cache_Manager SHALL maintain in-process counters for Cache_Hit and Cache_Miss events, keyed by Cache_Key prefix (e.g. `"currencies"`, `"institutions"`, `"fx-rates"`).
4. WHEN the `/api/cache/metrics` endpoint is called, THE Cache_Manager SHALL return the current hit and miss counters as a JSON response.
5. THE in-process counters SHALL reset to zero when the server process restarts.

---

### Requirement 6: Manual Cache Invalidation

**User Story:** As an operator, I want to manually invalidate cached entries, so that I can force a refresh when upstream data changes outside the normal TTL cycle.

#### Acceptance Criteria

1. WHEN a `DELETE` request is received on `/api/cache/invalidate` with a `key` query parameter, THE Cache_Manager SHALL delete the matching Cache entry and return a `200` response confirming deletion.
2. WHEN a `DELETE` request is received on `/api/cache/invalidate` with a `prefix` query parameter, THE Cache_Manager SHALL delete all Cache entries whose keys begin with that prefix and return a `200` response with the count of deleted entries.
3. IF the `key` or `prefix` parameter is absent from the invalidation request, THEN THE Cache_Manager SHALL return a `400` response with a descriptive error message.
4. IF the specified `key` does not exist in the Cache, THEN THE Cache_Manager SHALL return a `200` response indicating zero entries were deleted.
5. WHEN a Cache invalidation operation fails due to a Cache_Client error, THE Cache_Manager SHALL return a `503` response with a structured error body.

---

### Requirement 7: Cache Key Construction

**User Story:** As a developer, I want cache keys to be constructed deterministically from route parameters, so that the same logical request always maps to the same cache entry.

#### Acceptance Criteria

1. THE Cache_Manager SHALL construct Cache_Keys using the format `"{prefix}:{discriminator}"` where the discriminator is derived from route-specific parameters.
2. WHEN constructing a Cache_Key for the Institution_Route, THE Cache_Manager SHALL normalise the currency code to lower-case before including it in the key.
3. THE Cache_Manager SHALL not include query parameters unrelated to the data identity (e.g. pagination cursors, request IDs) in the Cache_Key.
4. FOR ALL valid Cache_Keys, serialising then deserialising the key SHALL produce an equivalent string (round-trip property).

---

### Requirement 8: TTL Configuration

**User Story:** As an operator, I want TTL values to be configurable via environment variables, so that I can tune cache freshness without code changes.

#### Acceptance Criteria

1. THE Cache_Manager SHALL read the currencies TTL from the environment variable `CACHE_TTL_CURRENCIES` when present, falling back to the default of 300 seconds.
2. THE Cache_Manager SHALL read the institutions TTL from the environment variable `CACHE_TTL_INSTITUTIONS` when present, falling back to the default of 300 seconds.
3. THE Cache_Manager SHALL read the FX rates TTL from the environment variable `CACHE_TTL_FX_RATES` when present, falling back to the default of 60 seconds.
4. IF an environment variable contains a non-positive or non-numeric value, THEN THE Cache_Manager SHALL ignore it and use the default TTL value.
5. THE Cache_Manager SHALL read the Redis connection URL from the environment variable `REDIS_URL`, falling back to `"redis://localhost:6379"` when absent.
