## ADDED Requirements

### Requirement: Tenant-scoped feedback tracking
The system SHALL persist HM feedback requests in the SmartRecruit schema and SHALL restrict every import, read, draft, approval, and delivery operation to the authenticated tenant.

#### Scenario: Tenant reads its tracker
- **WHEN** an authenticated recruiter requests the HM feedback tracker
- **THEN** the system returns only feedback requests belonging to that recruiter's tenant

#### Scenario: Cross-tenant identifier is supplied
- **WHEN** a recruiter attempts to access or approve a feedback request belonging to another tenant
- **THEN** the system rejects the operation without disclosing the other tenant's record

### Requirement: DS08 date normalization
The system SHALL convert supported Excel serial dates and parseable date strings into timezone-aware timestamps during DS08 import, SHALL derive a missing deadline as exactly 48 hours after the shortlist timestamp, and SHALL report invalid required values without exposing raw numeric dates as display strings.

#### Scenario: Excel serial dates are imported
- **WHEN** a DS08 row contains Excel serial values for shortlist and deadline cells
- **THEN** the system persists the corresponding UTC timestamps and returns ISO 8601 values through the API

#### Scenario: Deadline is absent
- **WHEN** a valid shortlist timestamp is present and the 48-hour deadline cell is empty
- **THEN** the system persists a deadline exactly 48 hours after the shortlist timestamp

#### Scenario: Required date cannot be parsed
- **WHEN** a DS08 row has an invalid shortlist timestamp
- **THEN** the system records a structured import error and does not present the value as a valid SLA deadline

### Requirement: Derived SLA status
The system SHALL derive feedback status from the normalized deadline, current time, and submission state rather than trusting the workbook's `sla_breach` value.

#### Scenario: Pending feedback is on track
- **WHEN** pending feedback has more than 12 hours remaining
- **THEN** its SLA state is `on_track`

#### Scenario: Pending feedback is due soon
- **WHEN** pending feedback has more than zero and at most 12 hours remaining
- **THEN** its SLA state is `due_soon`

#### Scenario: Pending feedback reaches its deadline
- **WHEN** current time is equal to or later than the feedback deadline
- **THEN** its SLA state is `overdue`

#### Scenario: Feedback was submitted
- **WHEN** HM feedback has been submitted
- **THEN** its SLA state is `submitted` even if the deadline has passed

### Requirement: Tracker filtering and timing information
The tracker API SHALL support status and search filters and SHALL return normalized timestamps, derived SLA state, and signed remaining seconds for every valid record.

#### Scenario: Recruiter filters overdue feedback
- **WHEN** the recruiter requests the `overdue` filter
- **THEN** the response contains only pending requests whose deadline has been reached or passed

#### Scenario: Recruiter searches the tracker
- **WHEN** the recruiter searches by candidate, Hiring Manager, or position text
- **THEN** matching is performed case-insensitively within the tenant's records

### Requirement: Automatic reminder draft preparation
The system SHALL periodically identify due-soon and overdue pending feedback, prepare an English reminder draft for the appropriate reminder stage, and notify the responsible recruiter without sending external mail.

#### Scenario: Feedback enters the due-soon window
- **WHEN** pending feedback first enters the configured due-soon window
- **THEN** the system creates or reuses one due-soon reminder draft and makes it available for recruiter review

#### Scenario: Feedback becomes overdue
- **WHEN** pending feedback reaches its deadline and no overdue reminder has been prepared
- **THEN** the system creates one overdue reminder draft and makes it available for recruiter review

#### Scenario: Feedback is already submitted
- **WHEN** the periodic scan encounters submitted feedback
- **THEN** it does not create a reminder draft

### Requirement: Human-approved reminder delivery
The system SHALL require an authorized recruiter to review and explicitly approve a reminder before queuing email delivery to a Hiring Manager.

#### Scenario: Recruiter approves a valid reminder
- **WHEN** an authorized recruiter approves a reminder with a valid HM email address
- **THEN** the system persists an approved attempt, queues delivery, and returns a queued status rather than claiming immediate success

#### Scenario: Agent proposes reminder delivery
- **WHEN** an agent invokes the reminder-send tool
- **THEN** the tool requires HITL approval before any reminder attempt is created or queued

#### Scenario: HM email is missing
- **WHEN** a recruiter attempts to approve a reminder without a valid HM email address
- **THEN** the system blocks delivery and displays a data-quality reason

#### Scenario: Feedback is submitted before approval
- **WHEN** feedback becomes submitted after draft creation but before approval
- **THEN** the system rejects the approval and does not queue delivery

### Requirement: Idempotent audited reminder attempts
The system SHALL persist reminder attempts and outcomes, SHALL prevent duplicate delivery for the same request, channel, stage, and deadline, and SHALL emit state-change events transactionally.

#### Scenario: Approval is repeated
- **WHEN** the same reminder stage is approved more than once for the same deadline
- **THEN** the system returns the existing attempt and queues at most one delivery

#### Scenario: Worker delivery succeeds
- **WHEN** the mail worker successfully delivers the reminder
- **THEN** the attempt is marked `sent` with its send timestamp and provider message identifier

#### Scenario: Worker delivery fails
- **WHEN** the mail worker exhausts delivery retries
- **THEN** the attempt is marked `failed` with a safe error code and remains available for an explicit retry
