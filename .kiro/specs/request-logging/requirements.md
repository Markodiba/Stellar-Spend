# Requirements Document

## Introduction

This feature adds comprehensive request logging to the StellarSpend Next.js API. Every incoming API request is captured with structured metadata — method, path, status code, duration, correlation ID, and sanitised request/response bodies — and emitted as a JSON log entry. Sensitive fields (tokens, passwords, card numbers) are masked before logging. Log entries are written to a rotating file sink alongside `console` output. The logging layer integrates with the existing `middleware.ts` and API route handlers without requiring per-route changes.

## Glossary

- **Request_Logger**: The module responsible for capturing, enriching, and emitting structured log entries for API requests.
- **Middleware**: The Next.js edge middleware (`middleware.ts`) that intercepts all `/api/*` requests before they reach route handlers.
- **Correlation_ID**: A unique identifier (UUID v4) attached to each request and propagated through the request/response cycle for distributed tracing.
- **Log_Entry**: A structured JSON object representing a single request/response cycle.
- **Sensitive_Field**: A request or response body field whose value must be masked before logging (e.g. `password`, `token`, `authorization`, `cardNumber`, `cvv`, `ssn`).
- **Masked_Value**: The string `"[REDACTED]"` substituted for a Sensitive_Field value in a Log_Entry.
- **Log_Rotation**: The process of archiving the current log file and starting a new one based on size or time thresholds.
- **Log_Sink**: A destination for log output (console or rotating file).
- **Body_Capture**: The act of reading and buffering the request or response body for inclusion in a Log_Entry.
- **Edge_Runtime**: The Next.js edge runtime environment, which supports only Web-standard APIs (no Node.js built-ins).

## Requirements

### Requirement 1: Request and Response Logging

**User Story:** As an operator, I want every API request and its response to be logged, so that I have a complete audit trail for debugging and observability.

#### Acceptance Criteria

1. WHEN an API request is received on any `/api/*` path, THE Request_Logger SHALL emit a Log_Entry containing the HTTP method, request path, query string, HTTP status code, and response duration in milliseconds.
2. THE Log_Entry SHALL include the UTC timestamp of when the request was received, formatted as ISO 8601.
3. WHEN a request body is present and the `Content-Type` is `application/json`, THE Request_Logger SHALL capture and include the parsed body in the Log_Entry after applying Sensitive_Field masking.
4. WHEN a response body is present and the `Content-Type` is `application/json`, THE Request_Logger SHALL capture and include the parsed body in the Log_Entry after applying Sensitive_Field masking.
5. WHEN a request or response body exceeds 10 KB, THE Request_Logger SHALL truncate the body and include a `"[TRUNCATED]"` marker in the Log_Entry instead of the full body.
6. WHEN a request or response body is not valid JSON, THE Request_Logger SHALL record the body as `null` in the Log_Entry and continue logging without error.

---

### Requirement 2: Correlation IDs

**User Story:** As a developer, I want each request to carry a unique correlation ID, so that I can trace a single request across logs and distributed services.

#### Acceptance Criteria

1. WHEN a request arrives without an `X-Correlation-ID` header, THE Middleware SHALL generate a UUID v4 and attach it to the request as the Correlation_ID.
2. WHEN a request arrives with an existing `X-Correlation-ID` header, THE Middleware SHALL use the provided value as the Correlation_ID without modification.
3. THE Middleware SHALL propagate the Correlation_ID on every API response via the `X-Correlation-ID` response header.
4. THE Request_Logger SHALL include the Correlation_ID in every Log_Entry.
5. WHEN the provided `X-Correlation-ID` value is not a valid UUID v4, THE Middleware SHALL replace it with a newly generated UUID v4.

---

### Requirement 3: Sensitive Data Masking

**User Story:** As a security engineer, I want sensitive fields to be masked in logs, so that credentials and personal data are never written to log storage.

#### Acceptance Criteria

1. THE Request_Logger SHALL mask the values of any Sensitive_Field keys found at any nesting depth in request or response bodies before including them in a Log_Entry.
2. THE Sensitive_Field key list SHALL include at minimum: `password`, `token`, `authorization`, `cardNumber`, `cvv`, `ssn`, `secret`, `apiKey`, `api_key`.
3. THE Request_Logger SHALL replace each Sensitive_Field value with the Masked_Value `"[REDACTED]"` regardless of the original value type.
4. THE Request_Logger SHALL preserve all non-sensitive fields in the body unchanged.
5. WHEN a body contains nested objects or arrays, THE Request_Logger SHALL apply masking recursively to all levels.
6. THE Sensitive_Field key comparison SHALL be case-insensitive.

---

### Requirement 4: Log Rotation

**User Story:** As an operator, I want log files to rotate automatically, so that disk usage is bounded and old logs are archived predictably.

#### Acceptance Criteria

1. THE Request_Logger SHALL write Log_Entries to a rotating log file in addition to console output.
2. WHEN the current log file reaches 10 MB, THE Request_Logger SHALL close the current file and open a new one.
3. THE Request_Logger SHALL retain a maximum of 7 archived log files before deleting the oldest.
4. THE Request_Logger SHALL name log files using the pattern `logs/api-requests-{YYYY-MM-DD}.log`.
5. WHERE the `LOG_DIR` environment variable is set, THE Request_Logger SHALL write log files to that directory instead of the default `logs/` directory.
6. IF the log directory does not exist, THEN THE Request_Logger SHALL create it before writing the first log entry.

---

### Requirement 5: Structured Log Format

**User Story:** As an operator, I want logs to be emitted as structured JSON, so that they can be ingested by log aggregation tools without custom parsing.

#### Acceptance Criteria

1. THE Request_Logger SHALL emit every Log_Entry as a single-line JSON object terminated by a newline character.
2. THE Log_Entry SHALL include the following top-level fields: `correlationId`, `method`, `path`, `query`, `statusCode`, `durationMs`, `timestamp`, `requestBody`, `responseBody`.
3. THE Request_Logger SHALL emit Log_Entries to `stdout` via `console.log` in all environments.
4. WHERE the `LOG_LEVEL` environment variable is set to `"debug"`, THE Request_Logger SHALL include additional diagnostic fields: `requestHeaders` (with `Authorization` values masked) and `responseHeaders`.
5. IF a Log_Entry field value is absent or not applicable, THEN THE Request_Logger SHALL set that field to `null` rather than omitting it.

---

### Requirement 6: Middleware Integration

**User Story:** As a developer, I want request logging to be applied transparently in the existing Next.js middleware, so that all API routes are covered without per-route changes.

#### Acceptance Criteria

1. THE Middleware SHALL apply request logging to all paths matched by the existing `/api/:path*` matcher.
2. WHEN request logging logic executes, THE Middleware SHALL run it after rate limiting and before API versioning logic.
3. THE Middleware SHALL attach the Correlation_ID to the request before passing it to downstream handlers.
4. THE Request_Logger SHALL be compatible with the Next.js Edge_Runtime, using only Web-standard APIs for Correlation_ID generation and header manipulation.
5. WHEN the Request_Logger encounters an unhandled error during logging, THE Middleware SHALL continue processing the request and emit a structured error log entry rather than returning a 500 response.
