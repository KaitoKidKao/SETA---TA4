## Context

The current SLA tracker reads `DS08_HM_Feedback_Tracker` from an XLSX file on every HTTP request. Date cells are returned as Excel serial numbers and stringified, while `sla_breach` is accepted without validating the deadline. The web client holds reminder state in memory and presents a success toast after a timer without creating or sending a message.

SmartRecruit is tenant-scoped and owns its schema. State changes must use Drizzle and `withEmit(...)`; cross-module reactions use the transactional outbox. Background work runs through graphile-worker, existing mail delivery is provided by `@seta/shared-mailer`, and every agent write tool requires explicit HITL approval.

The same UI currently uses 70 and 80 as shortlist cutoffs and contains Vietnamese copy across the page, KPI panel, Hiring Manager report modal, and generated reports.

## Goals / Non-Goals

**Goals:**

- Make the SLA tracker accurate, tenant-scoped, queryable, and independent of workbook availability after import.
- Represent source timestamps as timezone-aware database timestamps and API ISO 8601 strings.
- Compute the 48-hour SLA state from authoritative timestamps and submission state.
- Automatically prepare reminder drafts and notify recruiters when feedback is approaching or beyond its deadline.
- Require recruiter approval before an external reminder is queued for delivery.
- Persist delivery attempts and expose their status without optimistic fake success.
- Use 70 as the single shortlist threshold everywhere.
- Make all SmartRecruit and Hiring Manager-facing copy English while retaining verbatim CV evidence.

**Non-Goals:**

- Automatically send external reminders without human approval.
- Build Slack, Teams chat, SMS, or LinkedIn delivery in this change; email is the first delivery channel.
- Turn the XLSX file into a runtime database or edit the source workbook.
- Translate CV text, evidence snippets, candidate names, or user-entered notes.
- Introduce another ORM, queue, event bus, or mail provider.

## Decisions

### 1. Persist an HM feedback aggregate in the SmartRecruit schema

Add `hm_feedback_requests` for the SLA aggregate and `hm_feedback_reminder_attempts` for approved delivery attempts. The request stores tenant, external feedback ID, optional campaign/candidate identifiers, candidate and HM display data, HM email, shortlist timestamp, deadline, feedback submission fields, source metadata, and timestamps. Reminder attempts store channel, recipient, rendered subject/body snapshot, status, idempotency key, approver, queue/send timestamps, provider message ID, and failure details.

The import path performs an upsert keyed by `(tenant_id, external_feedback_id)`. It converts Excel serials with the workbook date system, accepts parseable ISO/date strings, rejects invalid timestamps into a structured import error, and derives a missing deadline as `shortlisted_at + 48 hours`. Runtime reads query Postgres, never the workbook.

Alternative considered: fix formatting only in React. Rejected because it leaves breach calculation, tenant isolation, reminder history, and production runtime coupled to a local mock file.

### 2. Derive SLA state at the domain boundary

The API returns timestamps as ISO strings and a derived state:

- `submitted` when feedback has been submitted, regardless of the deadline;
- `overdue` when pending and `now >= feedback_due_at`;
- `due_soon` when pending and the remaining duration is positive and at most 12 hours;
- `on_track` otherwise;
- `data_error` when required source data could not be normalized.

It also returns `remainingSeconds`, where overdue values are negative, and uses an injected clock in domain tests. The persisted source `sla_breach` value is retained only as import metadata for comparison and never controls runtime state.

Alternative considered: persist a mutable breach boolean. Rejected because it becomes stale and requires a scheduler merely to keep a derived value correct.

### 3. Separate automatic draft preparation from approved external delivery

A periodic graphile-worker task scans due-soon and overdue pending requests. For each eligible request it creates, or reuses, a deterministic English reminder draft and emits an event that can create an in-app notification for the responsible recruiter. It does not send external mail.

The recruiter can review/edit the draft and explicitly approve delivery from the dashboard or through a SmartRecruit agent write tool with `needsApproval: true`. Approval creates a reminder attempt and queues `@seta/shared-mailer` delivery. The worker records the final status and emits success/failure events.

An idempotency key based on feedback request, channel, reminder stage, and deadline prevents duplicate sends on worker retries or repeated approval requests. A due-soon reminder and an overdue reminder are distinct stages; each stage sends at most once unless a failed attempt is explicitly retried.

Alternative considered: send automatically at the threshold. Rejected because external communication is a consequential write and conflicts with the repository's HITL contract.

### 4. Keep ownership inside SmartRecruit and cross modules through public surfaces/events

SmartRecruit owns feedback and reminder state. It calls only public mailer/runtime interfaces and emits events from the same transaction as state changes. Notifications consume events idempotently; SmartRecruit never reads or writes the notifications schema.

New permissions distinguish read/import management from reminder approval. Existing recruiter and HR roles receive the approval permission; read-only members do not.

### 5. Define one shortlist policy constant

Introduce an exported domain constant and predicate equivalent to `SHORTLIST_THRESHOLD = 70` and `isShortlisted(score)`. Screening, jobs, workflow mapping, campaign counters, UI filters, labels, score colors, reports, and tests consume the same public contract or a threshold returned by the API.

The persisted candidate status remains authoritative after screening. Score-based fallback display logic uses the same 70 threshold only for legacy/imported rows without a normalized status.

Alternative considered: keep separate 70/80 meanings for pass and “strong match.” Rejected because the UI currently labels both as shortlisted. A future strong-match badge can be added as a separately named concept.

### 6. Treat English as a SmartRecruit presentation contract

Replace Vietnamese user-facing literals in the SmartRecruit page, KPI dashboard, HM report modal, toasts, empty/error states, and generated Markdown/PDF/reminder templates with English. Date formatting uses the browser locale for UI display while API values remain ISO strings.

Source evidence and user-provided content are rendered unchanged. Tests assert critical labels and generated HM content rather than attempting a fragile ban on every non-ASCII character.

## Risks / Trade-offs

- [HM email is absent from DS08] → Mark the record `data_error` or reminder-unavailable, show a clear reason, and never invent an address.
- [Workbook dates are ambiguous across date systems/timezones] → Inspect the workbook date system, normalize using an explicit configured import timezone, persist UTC, and test known serial fixtures.
- [Scheduler retries create duplicate messages] → Use database uniqueness on the idempotency key and let only an approved queued attempt reach the mailer.
- [Reminder generation becomes stale after feedback submission] → Re-check pending status transactionally during approval and again before worker delivery.
- [Large UI translation diff introduces regressions] → Split translation by component and add focused E2E assertions for the recruiter workflow.
- [Existing demo environments have no imported tracker rows] → Extend tenant bootstrap/import tooling and show a proper empty state rather than silently hiding the card.
- [Threshold changes alter legacy display counts] → Recompute campaign counts from normalized candidate statuses during migration/repair and document 70 as the product rule.

## Migration Plan

1. Add the SmartRecruit tables and indexes through generated Drizzle migration.
2. Add domain parsing and import tests, then import DS08 rows per tenant through the existing mock/bootstrap workflow.
3. Deploy read APIs using Postgres and keep the old workbook reader only behind the import function.
4. Deploy derived SLA states and English UI.
5. Add reminder draft scan, approval, queue, delivery-status handling, RBAC, agent tool, and events.
6. Replace scattered shortlist comparisons with the shared 70 threshold and repair inconsistent campaign counts if detected.
7. Remove the runtime XLSX tracker endpoint implementation after verification.

Rollback disables the scheduler and reminder approval route first. The new tables are additive and can remain unused; the previous read-only tracker can be temporarily restored without deleting imported data.

## Open Questions

- Which tenant/user field is the canonical “responsible recruiter” for imported DS08 rows when no campaign ID is present?
- What import timezone should be used when the workbook date cell has no timezone metadata? The proposed default is the configured deployment timezone, falling back to `Asia/Ho_Chi_Minh` for the supplied mock workbook.
- Should the initial due-soon window remain fixed at 12 hours or become tenant-configurable after the POC?
