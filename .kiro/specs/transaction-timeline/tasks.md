# Implementation Plan: Transaction Timeline

## Overview

Implement the `TransactionTimeline` component and supporting utilities in the existing Next.js/React/TypeScript codebase. The work proceeds in layers: data model → mapping utility → hook → component → integration. Property-based tests use `fast-check` (to be added as a dev dependency).

## Tasks

- [ ] 1. Extend data model and add timeline utilities
  - [ ] 1.1 Add `TimelineEntry` interface and `stageTimestamps` field to existing types
    - Add `TimelineEntry` interface to `src/types/stellaramp.ts`
    - Add optional `stageTimestamps?: Partial<Record<OfframpStep, number>>` to `Transaction` interface in `src/lib/transaction-storage.ts`
    - _Requirements: 2.3, 5.1_

  - [ ] 1.2 Create `src/lib/timeline-utils.ts` with `TIMELINE_STAGES`, `STAGE_META`, and `mapTransactionToSteps`
    - Export `TIMELINE_STAGES: OfframpStep[]` in fixed order
    - Export `STAGE_META` with label and pending/active/completed descriptions for each step
    - Export `mapTransactionToSteps(transaction: Transaction | null): TimelineEntry[]` that maps transaction fields to ordered entries with correct status and timestamps
    - _Requirements: 1.1, 1.4, 1.5, 1.6, 2.1, 2.2, 3.1, 3.2, 3.3, 3.4, 3.5, 5.3_

  - [ ]\* 1.3 Write property tests for `mapTransactionToSteps`
    - Install `fast-check` as a dev dependency
    - **Property 1: Stage order is preserved** — for any Transaction, output order matches TIMELINE_STAGES
    - **Property 2: Exactly one active stage** — for any non-terminal transaction, exactly one entry has status 'active'
    - **Property 3: All stages before active are completed** — for any non-terminal transaction
    - **Property 4: All stages after active are pending** — for any non-terminal transaction
    - **Property 5: Timestamp present iff stage reached** — timestamp non-null iff status is 'active' or 'completed'
    - **Property 7: mapTransactionToSteps is total** — never throws, always returns non-empty array
    - **Property 8: Error description propagation** — failed transaction error field appears in error entry description
    - Run minimum 100 iterations per property
    - _Requirements: 1.1, 1.4, 1.5, 1.6, 2.1, 2.2, 3.5, 5.2_

- [ ] 2. Implement `useTransactionTimeline` hook
  - [ ] 2.1 Create `src/hooks/useTransactionTimeline.ts`
    - Read `TransactionStorage.getById(transactionId)` on mount
    - Call `mapTransactionToSteps` to derive `entries`
    - Set up `setInterval` with `refreshIntervalMs` (default 5000) that re-reads storage and re-derives entries
    - Clear interval when terminal state is detected or on unmount
    - Expose `{ entries, currentStep, isTerminal, transaction, error }`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2_

  - [ ]\* 2.2 Write unit tests for `useTransactionTimeline`
    - Test polling starts on mount with correct interval
    - Test polling stops when terminal state is reached (Property 6)
    - Test interval is cleared on unmount
    - Test error state when transactionId not found
    - Use `vi.useFakeTimers()` for timer control
    - _Requirements: 4.1, 4.3, 4.4, 5.2_

- [ ] 3. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. Build `TransactionTimeline` component
  - [ ] 4.1 Create `src/components/TransactionTimeline.tsx` with `TimelineStageItem` sub-component
    - Render an `<ol>` with one `<li>` per stage entry
    - Each `<li>` shows: status icon (pending/active/completed/error), stage label, description, formatted timestamp or "—"
    - Apply visual styles consistent with existing dark theme (`#0a0a0a`, `#c9a962`, `#333333`)
    - Active stage: gold left border + animated pulse dot (matching `TransactionProgressModal` style)
    - Completed stage: green dot + dimmed label
    - Pending stage: dark dot + muted text
    - Wire `useTransactionTimeline` hook for data
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 2.1, 2.2, 3.1, 3.2, 3.3, 3.4_

  - [ ] 4.2 Add Stellar Explorer link and error display
    - When `transaction.stellarTxHash` is present, render a link in the submitting/processing stage entry
    - When `currentStep === 'error'`, render `transaction.error` in the error entry description
    - _Requirements: 3.5, 5.4_

  - [ ] 4.3 Add accessibility attributes
    - Wrap stages in `<ol aria-label="Transaction stages">`
    - Add `aria-label="{label}: {status}"` to each `<li>`
    - Set `aria-current="step"` on the active stage `<li>`
    - Add a visually hidden `<div aria-live="polite" aria-atomic="true">` that updates only on step transitions
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [ ]\* 4.4 Write component tests for `TransactionTimeline`
    - Test all stages render for a pending transaction
    - Test active stage has aria-current="step"
    - Test completed stages show timestamps
    - Test pending stages show "—" placeholder
    - Test error state renders error message
    - Test Stellar Explorer link appears when txHash present
    - Test live region updates on step change but not on every poll tick
    - **Property: Accessibility attributes** — for any transaction, active stage has aria-current="step" and all stages have aria-label
    - **Property: Description correctness** — for any transaction, each entry's rendered description matches STAGE_META for its status
    - _Requirements: 1.3, 1.4, 1.5, 1.6, 2.1, 2.2, 3.1, 6.2, 6.3, 6.5_

- [ ] 5. Integrate timeline into history page
  - [ ] 5.1 Add expandable timeline row to `src/app/history/page.tsx`
    - Add a "View Timeline" button/toggle to each transaction row in the history table
    - When toggled, render `<TransactionTimeline transactionId={tx.id} />` below the row
    - Only one timeline expanded at a time (accordion behavior)
    - _Requirements: 5.1, 5.5_

- [ ] 6. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- `fast-check` must be installed before running property tests: `npm install --save-dev fast-check`
- All property tests should use `fc.assert(fc.property(...), { numRuns: 100 })`
- The timeline reads from `TransactionStorage` (localStorage) — no new API routes needed
- Existing `TransactionProgressModal` can coexist with the timeline; they serve different contexts (modal during active flow, timeline for history review)
