# Requirements Document

## Introduction

The transaction timeline feature provides a visual, chronological view of a transaction's progress through all stages of the offramp flow. It replaces the current modal-only progress view with a persistent, scrollable timeline that shows each stage with its timestamp, status description, and current state. The timeline supports auto-refresh so users can watch live progress without manual intervention.

## Glossary

- **Timeline**: The visual component displaying all transaction stages in chronological order.
- **Stage**: A discrete step in the offramp transaction lifecycle (e.g., initiating, submitting, settling).
- **Timestamp**: The ISO 8601 date/time at which a stage was entered or completed.
- **Status Description**: A human-readable explanation of what is happening during a given stage.
- **Auto-Refresh**: Periodic re-fetching of transaction data to reflect the latest state without user action.
- **Transaction**: A record stored in `TransactionStorage` representing a single offramp operation.
- **OfframpStep**: The union type `"idle" | "initiating" | "awaiting-signature" | "submitting" | "processing" | "settling" | "success" | "error"` defined in `src/types/stellaramp.ts`.
- **BridgeStatus**: The union type `"pending" | "processing" | "completed" | "failed" | "expired"` from `src/lib/offramp/types`.
- **PayoutStatus**: The union type `"pending" | "validated" | "settled" | "refunded" | "expired"` from `src/lib/offramp/types`.
- **TimelineEntry**: A data structure representing one stage in the timeline, containing stage name, status, timestamp, and description.

## Requirements

### Requirement 1: Display All Transaction Stages

**User Story:** As a user, I want to see all stages of my transaction displayed in a timeline, so that I can understand the full lifecycle of my offramp operation.

#### Acceptance Criteria

1. THE Timeline SHALL display all offramp stages in the following fixed order: Initiating → Awaiting Signature → Submitting → Processing → Settling → Complete (or Failed).
2. WHEN a transaction is in a terminal state (`success` or `error`), THE Timeline SHALL display the terminal stage as the final entry.
3. THE Timeline SHALL render each stage as a distinct visual entry containing a stage label, a status indicator, and a status description.
4. WHEN a stage has not yet been reached, THE Timeline SHALL render that stage in a visually distinct "pending" style (dimmed/inactive).
5. WHEN a stage is currently active, THE Timeline SHALL render that stage with a visually distinct "active" style (highlighted/animated).
6. WHEN a stage has been completed, THE Timeline SHALL render that stage with a visually distinct "completed" style (e.g., green check).

### Requirement 2: Display Timestamps for Each Stage

**User Story:** As a user, I want to see when each stage started or completed, so that I can understand how long each part of the transaction took.

#### Acceptance Criteria

1. WHEN a stage has been entered, THE Timeline SHALL display the timestamp at which that stage was entered, formatted as a human-readable local date and time.
2. WHEN a stage has not yet been reached, THE Timeline SHALL display a placeholder (e.g., "—") in place of the timestamp.
3. THE Timeline SHALL store stage entry timestamps as Unix millisecond values in the `TimelineEntry` data structure.
4. WHEN a transaction transitions to a new stage, THE Timeline SHALL record the current time as the timestamp for that stage.

### Requirement 3: Display Status Descriptions

**User Story:** As a user, I want to read a description of what is happening at each stage, so that I understand what the system is doing and what I may need to do.

#### Acceptance Criteria

1. THE Timeline SHALL display a status description for every stage, including stages not yet reached.
2. WHEN a stage is active, THE Timeline SHALL display the active-state description for that stage (e.g., "Broadcasting to the Stellar network…").
3. WHEN a stage is completed, THE Timeline SHALL display the completed-state description for that stage (e.g., "Submitted successfully.").
4. WHEN a stage is pending, THE Timeline SHALL display the pending-state description for that stage (e.g., "Waiting to begin…").
5. IF a transaction is in the `error` state, THEN THE Timeline SHALL display the error message in the failed stage entry.

### Requirement 4: Auto-Refresh

**User Story:** As a user, I want the timeline to automatically update as my transaction progresses, so that I do not need to manually refresh the page.

#### Acceptance Criteria

1. WHEN the Timeline is mounted and a transaction is in a non-terminal state, THE Timeline SHALL begin polling for updated transaction status at a configurable interval (default: 5 seconds).
2. WHEN the Timeline receives updated transaction data, THE Timeline SHALL re-render to reflect the latest stage and timestamps without a full page reload.
3. WHEN a transaction reaches a terminal state (`success` or `error`), THE Timeline SHALL stop polling automatically.
4. WHEN the Timeline is unmounted, THE Timeline SHALL cancel any in-flight polling timers to prevent memory leaks.
5. WHERE the polling interval is configurable, THE Timeline SHALL accept a `refreshIntervalMs` prop with a default value of 5000.

### Requirement 5: Integration with Transaction Data

**User Story:** As a user, I want the timeline to reflect the actual stored transaction data, so that the view is consistent with the rest of the application.

#### Acceptance Criteria

1. THE Timeline SHALL accept a `transactionId` prop and derive all display data from the corresponding `Transaction` record in `TransactionStorage`.
2. WHEN a `Transaction` record is not found for the given `transactionId`, THE Timeline SHALL display an appropriate empty/error state.
3. THE Timeline SHALL map `Transaction.status`, `Transaction.bridgeStatus`, and `Transaction.payoutStatus` fields to the corresponding `OfframpStep` for display.
4. WHEN `Transaction.stellarTxHash` is present, THE Timeline SHALL display a link to the Stellar Explorer for the submitting/processing stage.
5. THE Timeline SHALL be usable as a standalone component embeddable in both the history page and any modal context.

### Requirement 6: Accessibility

**User Story:** As a user relying on assistive technology, I want the timeline to be navigable and understandable, so that I can access transaction progress information regardless of how I interact with the page.

#### Acceptance Criteria

1. THE Timeline SHALL use a `<ol>` (ordered list) element to convey the sequential nature of the stages to screen readers.
2. EACH stage entry SHALL include an `aria-label` that communicates the stage name and its current status (e.g., "Submitting: completed").
3. WHEN a stage is active, THE Timeline SHALL set `aria-current="step"` on that stage's list item.
4. THE Timeline SHALL include a visually hidden live region (`aria-live="polite"`) that announces stage transitions to screen readers.
5. IF the timeline is auto-refreshing, THEN THE Timeline SHALL NOT announce every poll cycle — only stage transitions SHALL trigger live region updates.
