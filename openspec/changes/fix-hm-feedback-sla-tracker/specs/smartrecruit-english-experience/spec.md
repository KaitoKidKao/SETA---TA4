## ADDED Requirements

### Requirement: English SmartRecruit interface
The system SHALL display English user-facing copy throughout the SmartRecruit recruiter experience, including the main page, HM Feedback Tracker, campaign KPI panel, HM report modal, filters, badges, buttons, validation, empty states, errors, and toast messages.

#### Scenario: Recruiter opens SmartRecruit
- **WHEN** the SmartRecruit page and its standard panels are rendered
- **THEN** their product-authored labels and messages are in English

#### Scenario: Reminder action changes state
- **WHEN** a reminder is being queued, has been queued, succeeds, or fails
- **THEN** the displayed status and feedback message are in English and match the persisted backend state

### Requirement: English Hiring Manager content
The system SHALL generate Hiring Manager shortlist reports and reminder subjects/bodies in English.

#### Scenario: Recruiter generates a shortlist report
- **WHEN** a Markdown or PDF shortlist report is generated
- **THEN** its headings, explanatory text, SLA note, and fallback messages are in English

#### Scenario: Reminder draft is prepared
- **WHEN** the system prepares a due-soon or overdue reminder
- **THEN** the subject and body are in English and identify the candidate, position, and feedback deadline when those values are available

### Requirement: Preserve source and user content
The system MUST preserve candidate names, Hiring Manager names, verbatim CV evidence, HM feedback, and recruiter-authored notes without translating or rewriting them solely to satisfy the English interface requirement.

#### Scenario: CV evidence is Vietnamese
- **WHEN** a scorecard contains a Vietnamese evidence snippet extracted from a CV
- **THEN** the interface displays the original snippet unchanged within English surrounding labels

#### Scenario: Recruiter note is not English
- **WHEN** a recruiter enters a note in another language
- **THEN** generated and exported views preserve the note exactly as entered

### Requirement: Human-readable date presentation
The system SHALL format normalized SLA timestamps as human-readable dates and times in the UI while retaining ISO 8601 values in API contracts.

#### Scenario: Tracker receives an ISO timestamp
- **WHEN** a tracker row is rendered in the browser
- **THEN** shortlist and deadline values are shown as formatted dates rather than Excel serial numbers or raw floating-point values

#### Scenario: Timestamp is invalid
- **WHEN** a tracker record has a date normalization error
- **THEN** the UI displays an English data-error state and does not display the invalid source value as a deadline
