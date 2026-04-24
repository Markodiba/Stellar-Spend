# Requirements Document

## Introduction

This feature adds rate limiting to the Stellar-Spend Next.js API to prevent abuse and ensure fair usage. Rate limiting is enforced at the middleware layer, tracking requests per IP address using an in-memory sliding window. Authenticated requests (those carrying a valid API key) receive a higher or bypassed limit. When a limit is exceeded, the API returns a `429 Too Many Requests` response with standard rate limit headers. All violations are logged for observability.

## Glossary

- **Rate_Limiter**: The module responsible for tracking request counts and enforcing limits per identifier.
- **Middleware**: The Next.js edge middleware (`middleware.ts`) that intercepts all `/api/*` requests before they reach route handlers.
- **Client_IP**: The IP address extracted from the incoming request, used as the default rate limit identifier.
- **API_Key**: A secret token passed via the `Authorization` header (Bearer scheme) that identifies an authenticated caller.
- **Window**: A fixed time interval (e.g., 60 seconds) over which requests are counted.
- **Limit**: The maximum number of requests allowed within a Window for a given identifier.
- **Violation**: An event where a request exceeds the configured Limit for its identifier.
- **Rate_Limit_Headers**: Standard HTTP headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `Retry-After`) conveying limit state to callers.

## Requirements

### Requirement 1: Per-IP Rate Limiting

**User Story:** As an API operator, I want to limit the number of requests per IP address, so that I can prevent a single client from overwhelming the API.

#### Acceptance Criteria

1. THE Rate_Limiter SHALL track request counts per Client_IP using a sliding window algorithm.
2. WHEN a request arrives and the Client_IP has not exceeded the Limit within the current Window, THE Middleware SHALL allow the request to proceed.
3. WHEN a request arrives and the Client_IP has exceeded the Limit within the current Window, THE Middleware SHALL return a `429 Too Many Requests` response.
4. THE Rate_Limiter SHALL use a default Window of 60 seconds and a default Limit of 100 requests per Window.
5. WHEN multiple requests arrive from the same Client_IP within the same Window, THE Rate_Limiter SHALL count each request exactly once.

---

### Requirement 2: Rate Limit Headers

**User Story:** As an API consumer, I want to receive rate limit information in response headers, so that I can adapt my request rate before hitting the limit.

#### Acceptance Criteria

1. THE Middleware SHALL include an `X-RateLimit-Limit` header on every API response indicating the total Limit for the current Window.
2. THE Middleware SHALL include an `X-RateLimit-Remaining` header on every API response indicating the number of requests remaining in the current Window.
3. THE Middleware SHALL include an `X-RateLimit-Reset` header on every API response containing the Unix timestamp (in seconds) at which the current Window resets.
4. WHEN a request is rate limited, THE Middleware SHALL include a `Retry-After` header indicating the number of seconds until the Window resets.
5. THE `X-RateLimit-Remaining` header value SHALL never be negative.

---

### Requirement 3: Authenticated User Bypass

**User Story:** As an authenticated API consumer, I want my requests to be exempt from the default IP-based rate limit, so that legitimate high-volume integrations are not blocked.

#### Acceptance Criteria

1. WHEN a request includes a valid `Authorization: Bearer <API_Key>` header, THE Middleware SHALL apply a separate, higher Limit for that API_Key rather than the Client_IP Limit.
2. THE Rate_Limiter SHALL use a default authenticated Limit of 1000 requests per Window for API_Key identifiers.
3. WHEN a request includes an `Authorization` header that does not conform to the `Bearer <token>` scheme, THE Middleware SHALL treat the request as unauthenticated and apply the IP-based Limit.
4. WHEN a request includes a valid API_Key, THE Rate_Limiter SHALL track usage against the API_Key identifier, not the Client_IP.

---

### Requirement 4: Rate Limit Violation Logging

**User Story:** As an operator, I want rate limit violations to be logged, so that I can monitor abuse patterns and tune limits.

#### Acceptance Criteria

1. WHEN a Violation occurs, THE Middleware SHALL emit a structured JSON log entry containing the Client_IP, the identifier used (IP or API_Key), the request path, and a UTC timestamp.
2. THE log entry SHALL use the key `event` with value `"rate_limit_violation"`.
3. WHEN a Violation occurs for an API_Key identifier, THE Middleware SHALL redact the full API_Key in the log entry, recording only the first 8 characters followed by `"..."`.

---

### Requirement 5: Configurable Limits via Environment Variables

**User Story:** As an operator, I want to configure rate limit thresholds via environment variables, so that I can tune limits without code changes.

#### Acceptance Criteria

1. THE Rate_Limiter SHALL read the unauthenticated IP Limit from the environment variable `RATE_LIMIT_UNAUTHENTICATED` when present, falling back to the default of 100.
2. THE Rate_Limiter SHALL read the authenticated API_Key Limit from the environment variable `RATE_LIMIT_AUTHENTICATED` when present, falling back to the default of 1000.
3. THE Rate_Limiter SHALL read the Window duration (in seconds) from the environment variable `RATE_LIMIT_WINDOW_SECONDS` when present, falling back to the default of 60.
4. IF an environment variable contains a non-positive or non-numeric value, THEN THE Rate_Limiter SHALL ignore it and use the default value.

---

### Requirement 6: Middleware Integration

**User Story:** As a developer, I want rate limiting to be applied transparently in the existing Next.js middleware, so that all API routes are protected without per-route changes.

#### Acceptance Criteria

1. THE Middleware SHALL apply rate limiting to all paths matched by the existing `/api/:path*` matcher.
2. WHEN rate limiting logic is applied, THE Middleware SHALL execute it before API versioning and routing logic.
3. THE Middleware SHALL extract Client_IP from the `x-forwarded-for` header when present, falling back to the `x-real-ip` header, and finally to a default value of `"unknown"` if neither is available.
4. WHEN the Client_IP cannot be determined, THE Middleware SHALL apply the unauthenticated Limit using `"unknown"` as the identifier.
