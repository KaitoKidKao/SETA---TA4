## Why

The SmartRecruit HM Feedback Tracker currently exposes raw Excel serial numbers, relies on a precomputed spreadsheet breach flag, and simulates reminders only in browser state. The surrounding SmartRecruit experience also mixes Vietnamese and English, while shortlist eligibility is inconsistently treated as both 70% and 80%, making the dashboard misleading and the expected DS08 workflow incomplete.

## What Changes

- Replace raw DS08 date strings with validated timestamps and derive SLA state from the 48-hour deadline and feedback status.
- Persist tenant-scoped HM feedback tracking records instead of serving the Excel workbook directly at request time; retain the workbook only as an import/demo source.
- Add explicit `due soon`, `overdue`, `submitted`, and data-error states with stable API fields for recruiter filtering and display.
- Add a real reminder workflow: recruiter previews a generated English reminder, explicitly approves the write action, and the backend queues delivery through the existing worker/mail infrastructure.
- Persist reminder attempts and outcomes, emit audit/domain events transactionally, and make retries idempotent.
- Standardize shortlist eligibility at a single 70% threshold across backend processing, dashboard counts, filters, badges, and report generation.
- Convert all user-facing SmartRecruit strings and generated HM shortlist/reminder content to English, while preserving source-language CV evidence verbatim.
- Add unit, integration, and browser coverage for date conversion, SLA boundaries, tenant isolation, shortlist consistency, English copy, approval, and reminder delivery.

## Capabilities

### New Capabilities

- `hm-feedback-sla-management`: Tenant-scoped DS08 import, 48-hour SLA calculation, tracker querying, and approved reminder delivery with audit history.
- `smartrecruit-english-experience`: English-only SmartRecruit interface and generated Hiring Manager-facing content, excluding verbatim candidate evidence.
- `candidate-shortlist-consistency`: One authoritative shortlist threshold and consistent eligibility behavior across domain logic, UI, and reports.

### Modified Capabilities

None. The repository currently has no baseline OpenSpec capabilities for SmartRecruit.

## Impact

- SmartRecruit schema and generated Drizzle migration for feedback tracker and reminder-attempt persistence.
- SmartRecruit domain services, public surface, HTTP routes, RBAC, events, graphile-worker tasks, and agent write-tool registration.
- Existing shared mail transport/integration path for actual email delivery; no new message broker or ORM.
- SmartRecruit React page, KPI/report components, HM report modal, and generated Markdown/PDF content.
- Mock-data import/bootstrap behavior for `DS08_HM_Feedback_Tracker`.
- SmartRecruit unit/integration tests and web E2E coverage.
