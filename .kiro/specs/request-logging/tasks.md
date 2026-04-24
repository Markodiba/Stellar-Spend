# Implementation Plan: Request Logging

## Overview

Implement request logging in three layers: an edge-compatible `correlation-id.ts` and `sensitive-mask.ts` module, a Node.js `request-logger.ts` higher-order handler wrapper with `log-sink.ts` for rotating file output, and middleware integration for Correlation_ID propagation. Property-based tests use **fast-check**.

## Tasks

- [ ] 1. Add dependencies and create edge-compatible utility modules
  - Install `winston` and `winston-daily-rotate-file` as dependencies (`npm install winston winston-daily-rotate-file`)
  - Ensure `fast-check` is available as a dev dependency (add if not already present from rate-limiting)
  - Create `src/lib/correlation-id.ts` with `generateCorrelationId()` (uses `crypto.randomUUID()`) and `isValidCorrelationId(value: string): boolean`
  - Create `src/lib/sensitive-mask.ts` with `SENSITIVE_KEYS` set and `maskSensitiveFields(value: unknown): unknown` — recursive, pure, case-insensitive key matching
  - _Requirements: 2.1, 2.2, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [ ]\* 1.1 Write unit tests for correlation-id.ts (`src/test/correlation-id.test.ts`)
    - Test: `generateCorrelationId()` returns a string matching UUID v4 regex
    - Test: `isValidCorrelationId` returns true for valid UUID v4, false for empty string, plain text, UUID v1
    - _Requirements: 2.1, 2.5_

  - [ ]\* 1.2 Write unit tests for sensitive-mask.ts (`src/test/sensitive-mask.test.ts`)
    - Test: each named sensitive key (`password`, `token`, `authorization`, `cardNumber`, `cvv`, `ssn`, `secret`, `apiKey`, `api_key`) is masked to `"[REDACTED]"`
    - Test: nested object with sensitive key is masked
    - Test: array containing object with sensitive key is masked
    - Test: non-sensitive keys are unchanged
    - Test: case-insensitive matching (`PASSWORD`, `Token`, `APIKEY`)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [ ]\* 1.3 Write property tests for sensitive-mask.ts (`src/test/sensitive-mask.property.test.ts`)
    - **Property 4: Sensitive fields are always masked** — generate random nested JSON with sensitive keys at random depths → all sensitive values equal `"[REDACTED]"` — `Feature: request-logging, Property 4`
    - **Property 5: Non-sensitive fields are preserved** — generate random JSON objects → non-sensitive fields unchanged after masking — `Feature: request-logging, Property 5`
    - Minimum 100 iterations per property (`numRuns: 100`)
    - _Requirements: 3.1, 3.3, 3.4, 3.5, 3.6_

  - [ ]\* 1.4 Write property tests for correlation-id.ts (`src/test/correlation-id.property.test.ts`)
    - **Property 6: Correlation ID is generated when absent** — generate random requests without header → result satisfies `isValidCorrelationId` — `Feature: request-logging, Property 6`
    - **Property 7: Valid Correlation ID is passed through unchanged** — generate random valid UUID v4 strings → passed through unchanged — `Feature: request-logging, Property 7`
    - **Property 11: Invalid Correlation IDs are replaced** — generate random non-UUID strings → `resolveCorrelationId` returns a valid UUID v4 — `Feature: request-logging, Property 11`
    - Minimum 100 iterations per property
    - _Requirements: 2.1, 2.2, 2.5_

- [ ] 2. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 3. Implement log sink with rotating file output
  - Create `src/lib/log-sink.ts` with `getSinkConfig()` reading `LOG_DIR` env var (default `"logs"`) and `writeLogEntry(entry: LogEntry): void`
  - Configure `winston` with two transports: `Console` (always) and `DailyRotateFile` (max 10 MB per file, 7 files retained, pattern `{logDir}/api-requests-%Y-%m-%d.log`)
  - Create log directory with `fs.mkdirSync(dir, { recursive: true })` if it does not exist
  - Catch and swallow file-write errors, falling back to `console.error`
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 5.3_

  - [ ]\* 3.1 Write unit tests for log-sink.ts (`src/test/log-sink.test.ts`)
    - Test: `getSinkConfig()` returns `"logs"` when `LOG_DIR` is unset
    - Test: `getSinkConfig()` returns the value of `LOG_DIR` when set
    - Test: `writeLogEntry` calls `console.log` with a JSON string
    - Test: `writeLogEntry` does not throw when file write fails
    - _Requirements: 4.1, 4.4, 4.5, 5.3_

- [ ] 4. Implement request logger and withRequestLogging wrapper
  - Create `src/lib/request-logger.ts` with `LogEntry` interface, `getLoggerConfig()`, and `withRequestLogging(handler)` HOF
  - In `withRequestLogging`: record `Date.now()` at entry; read and parse request body (JSON only, Content-Type check); execute handler; capture response body; compute `durationMs`; apply `maskSensitiveFields` to both bodies; apply truncation if body JSON > 10 240 bytes; build `LogEntry`; call `writeLogEntry`
  - Include `requestHeaders`/`responseHeaders` (with `Authorization` masked) when `LOG_LEVEL=debug`
  - Set absent/inapplicable fields to `null`
  - Wrap entire logging logic in try/catch; on error emit `{ event: "request_logger_error", error: message }` and return original response
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 5.1, 5.2, 5.3, 5.4, 5.5, 6.5_

  - [ ]\* 4.1 Write unit tests for request-logger.ts (`src/test/request-logger.test.ts`)
    - Test: body > 10 KB → `requestBody` equals `"[TRUNCATED]"`
    - Test: invalid JSON body → `requestBody` is `null`
    - Test: `LOG_LEVEL=debug` → `requestHeaders` and `responseHeaders` present in log entry
    - Test: missing request body → `requestBody` is `null`
    - Test: logger error does not propagate — response still returned
    - _Requirements: 1.5, 1.6, 5.4, 5.5, 6.5_

  - [ ]\* 4.2 Write property tests for request-logger.ts (`src/test/request-logger.property.test.ts`)
    - **Property 1: Log entry contains all required fields** — generate random `(method, path, statusCode, durationMs)` → log entry has all required fields — `Feature: request-logging, Property 1`
    - **Property 2: Log entry is valid single-line JSON** — generate random log entries → serialised string is valid JSON with no embedded newlines — `Feature: request-logging, Property 2`
    - **Property 3: Absent fields are null, not omitted** — generate log entries with missing optional fields → all fields present as `null` — `Feature: request-logging, Property 3`
    - **Property 9: Bodies exceeding 10 KB are truncated** — generate bodies > 10 240 bytes → body field equals `"[TRUNCATED]"` — `Feature: request-logging, Property 9`
    - **Property 10: Invalid JSON bodies become null** — generate random non-JSON strings → body field is `null` — `Feature: request-logging, Property 10`
    - Minimum 100 iterations per property
    - _Requirements: 1.1, 1.2, 1.5, 1.6, 5.1, 5.2, 5.5_

- [ ] 5. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Wire Correlation_ID into middleware.ts
  - Import `generateCorrelationId` and `isValidCorrelationId` from `src/lib/correlation-id`
  - Add `resolveCorrelationId(request: NextRequest): string` helper — reads `X-Correlation-ID` header; validates with `isValidCorrelationId`; generates new UUID v4 if absent or invalid
  - In the `middleware` function, after the rate-limiting block and before versioning logic: call `resolveCorrelationId`, set `X-Correlation-ID` on the forwarded request headers and on the response
  - _Requirements: 2.1, 2.2, 2.3, 2.5, 6.1, 6.2, 6.3, 6.4_

  - [ ]\* 6.1 Write unit tests for middleware Correlation_ID logic (`src/test/request-logging-middleware.test.ts`)
    - Test: request without `X-Correlation-ID` → response has a valid UUID v4 in `X-Correlation-ID`
    - Test: request with valid UUID v4 → same value echoed in response header
    - Test: request with invalid string → new UUID v4 generated (different from input)
    - _Requirements: 2.1, 2.2, 2.3, 2.5_

  - [ ]\* 6.2 Write property test for Correlation_ID response header (`src/test/request-logging-middleware.property.test.ts`)
    - **Property 8: Correlation ID is always present in response header** — generate random requests (with/without header) → response always has valid UUID v4 in `X-Correlation-ID` — `Feature: request-logging, Property 8`
    - Minimum 100 iterations
    - _Requirements: 2.3_

- [ ] 7. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- `sensitive-mask.ts` and `correlation-id.ts` use only Web-standard APIs — safe for the edge runtime
- `log-sink.ts` and `request-logger.ts` use Node.js APIs (`fs`, `winston`) — import only from API route handlers, never from `middleware.ts`
- `withRequestLogging` wraps Next.js Pages Router API handlers (`NextApiRequest`/`NextApiResponse`); for App Router route handlers a similar wrapper can be added later
- Property tests should use `fc.object()` with custom arbitraries for nested JSON generation
- The `resolveCorrelationId` helper in `middleware.ts` must use `crypto.randomUUID()` (Web Crypto) not `uuid` package to stay edge-compatible
