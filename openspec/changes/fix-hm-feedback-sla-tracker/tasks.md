## 1. Lock Down Domain Rules with Failing Tests

- [x] 1.1 Add unit fixtures and failing tests for Excel 1900/1904 serial conversion, string-date parsing, explicit import timezone handling, missing-deadline derivation, and invalid-date errors.
- [x] 1.2 Add clock-controlled failing tests for `on_track`, `due_soon`, `overdue`, `submitted`, and exact-deadline SLA boundaries.
- [x] 1.3 Add failing tests proving 70 is the shortlist threshold in screening, workflow mapping, campaign counters, legacy fallback, and reviewed-score precedence.
- [x] 1.4 Add failing reminder policy tests for stage selection, submitted-feedback suppression, missing HM email, stale approval, and deterministic idempotency keys.

## 2. Add Tenant-Scoped Persistence

- [x] 2.1 Extend the SmartRecruit Drizzle schema with `hm_feedback_requests` and `hm_feedback_reminder_attempts`, including tenant indexes, external-ID uniqueness, reminder-stage uniqueness, statuses, approval fields, and delivery metadata.
- [x] 2.2 Generate the SmartRecruit migration with `pnpm --filter @seta/smartrecruit db:generate`; inspect the generated SQL and do not hand-edit it.
- [x] 2.3 Implement typed repositories/domain models that require tenant ID for every feedback and reminder query or mutation.
- [x] 2.4 Add integration tests with real Postgres proving tenant isolation, import upsert behavior, reminder uniqueness, and transactional state/event writes.

## 3. Replace Runtime Workbook Reads with a Validated Import

- [x] 3.1 Implement a pure DS08 row normalizer that converts supported workbook dates to UTC timestamps and returns structured row errors.
- [x] 3.2 Refactor the existing mock-data/bootstrap import path to upsert DS08 rows into SmartRecruit for the target tenant and report imported, updated, skipped, and invalid counts.
- [x] 3.3 Retain source `sla_breach` only as import metadata and remove it from runtime SLA decisions.
- [x] 3.4 Replace `getSLATracker()` workbook reads with a tenant-scoped Postgres query returning ISO timestamps, derived state, signed remaining seconds, reminder availability, and latest attempt status.
- [x] 3.5 Add route contract tests for search/status filters, invalid query values, empty results, normalized timestamps, and cross-tenant access.

## 4. Implement Real Reminder Preparation and Delivery

- [x] 4.1 Add English due-soon and overdue reminder renderers with deterministic fallback content and tests for candidate, position, HM, and deadline interpolation.
- [x] 4.2 Add a periodic graphile-worker task that prepares one draft per eligible feedback request/stage and emits an event for recruiter notification without sending external email.
- [x] 4.3 Add SmartRecruit event contracts and idempotent subscribers/notification integration through public module surfaces only.
- [x] 4.4 Add RBAC permissions and tenant-scoped HTTP endpoints to retrieve/edit reminder drafts, approve delivery, inspect attempts, and explicitly retry failed attempts.
- [x] 4.5 Implement approval as a `withEmit(...)` transaction that rechecks pending feedback and HM email, inserts or reuses the idempotent attempt, and queues `@seta/shared-mailer`.
- [x] 4.6 Implement worker outcome handling that records `queued`, `sent`, or `failed` from actual delivery results and emits auditable success/failure events.
- [x] 4.7 Register a SmartRecruit reminder-send agent tool with `needsApproval: true` and the reminder-approval permission.
- [x] 4.8 Add integration tests with the fake mail transport for approved delivery, duplicate approval, feedback submitted during approval, transient retry, terminal failure, and explicit retry.

## 5. Make Shortlisting Consistent

- [x] 5.1 Introduce and export the authoritative `SHORTLIST_THRESHOLD = 70` contract and effective-score/shortlist predicates.
- [x] 5.2 Replace hard-coded 70/80 shortlist comparisons in screening, campaign jobs, workflow code, counters, dashboard filters/lists, badges, and report selection.
- [x] 5.3 Add a data repair/check for campaign shortlist counts that disagree with persisted candidate statuses and document its safe execution.
- [x] 5.4 Add regression tests demonstrating that scores 69, 70, 75, and 80 produce identical shortlist decisions across backend and UI-facing data.

## 6. Convert SmartRecruit to English

- [x] 6.1 Replace Vietnamese product copy in `smartrecruit-page.tsx`, including SLA tracker labels, search/filter text, data warnings, talent-pool sections, Gate 2 filters, hallucination warnings, actions, toasts, and empty/error states.
- [x] 6.2 Convert `CampaignKPIDashboard.tsx` and `HMReportModal.tsx` labels, durations, actions, placeholders, validation, toasts, and empty states to English.
- [x] 6.3 Convert generated shortlist Markdown/PDF headings, explanatory text, SLA notes, and fallback messages to English.
- [x] 6.4 Add typed SLA tracker UI models and format ISO timestamps as human-readable local dates; render explicit loading, empty, unavailable, data-error, due-soon, overdue, queued, sent, and failed states.
- [x] 6.5 Replace the simulated `setTimeout` reminder handler with draft review and approval API calls, and display success only after persisted queue/delivery state is returned.
- [x] 6.6 Add focused component/E2E assertions for English labels and verify Vietnamese CV evidence, HM feedback, names, and recruiter notes remain unchanged.

## 7. Documentation and End-to-End Verification

- [x] 7.1 Update `docs/Proposal_Report.md` so HM feedback SLA tracking and approved reminder generation are explicitly traceable to the implemented expected output.
- [x] 7.2 Update relevant quickstart/mock-data documentation with DS08 import behavior, timezone assumptions, required HM email data, and reminder mail configuration.
- [ ] 7.3 Run the generated migration with `pnpm db:migrate` against the development database and validate imported DS08 timestamps and derived states with direct SQL.
  - Blocked on 2026-06-23: `pnpm db:migrate` reaches the CLI but Postgres is not running at `127.0.0.1:5442` (`ECONNREFUSED`). Docker is also unavailable (`~/.docker/desktop/docker.sock` missing), so the dev DB cannot be started from this environment.
- [x] 7.4 Run `pnpm depcruise`, `pnpm lint:raw-sql`, and `pnpm lint:styles` to verify module and architecture constraints.
- [ ] 7.5 Run `pnpm typecheck && pnpm lint && pnpm test`.
  - Partially verified on 2026-06-23: `pnpm typecheck` passed and `pnpm lint` passed. `pnpm test` is blocked by missing Docker/Testcontainers runtime (`Could not find a working container runtime strategy`).
- [ ] 7.6 Run `pnpm test:e2e` and manually verify the recruiter flow: import DS08, view formatted deadlines, filter due/overdue feedback, review an English reminder, approve it, and observe real queued/sent or failed status.
  - Blocked on 2026-06-23: `pnpm test:e2e` starts the web server, but API/worker fail because Postgres is not available at `127.0.0.1:5442`; login then fails via Vite proxy with `ECONNREFUSED 127.0.0.1:3000`.
