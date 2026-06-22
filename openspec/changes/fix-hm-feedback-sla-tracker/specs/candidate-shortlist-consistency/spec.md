## ADDED Requirements

### Requirement: Authoritative shortlist threshold
The system SHALL define 70 percent as the single authoritative automatic shortlist threshold and SHALL expose the rule through one shared domain contract.

#### Scenario: Score meets the threshold
- **WHEN** a candidate's effective fit score is 70 or greater
- **THEN** automatic screening classifies the candidate as shortlisted

#### Scenario: Score is below the threshold
- **WHEN** a candidate's effective fit score is below 70
- **THEN** automatic screening does not classify the candidate as shortlisted

### Requirement: Consistent shortlist behavior across surfaces
The system SHALL apply the authoritative threshold consistently in workflow results, campaign jobs, counters, recruiter filters, candidate badges, dashboard lists, and shortlist reports.

#### Scenario: Candidate scores 75
- **WHEN** a candidate with a fit score of 75 is displayed after screening
- **THEN** the backend status, pass filter, shortlist list, campaign count, and generated report all treat the candidate as shortlisted

#### Scenario: Candidate scores 69
- **WHEN** a candidate with a fit score of 69 is displayed after screening
- **THEN** none of the automatic shortlist surfaces count or label the candidate as shortlisted

### Requirement: Reviewed score precedence
The system SHALL use an authorized recruiter's persisted reviewed score as the effective score when one exists, while preserving the original AI score and audit reason.

#### Scenario: Recruiter reviews a score across the threshold
- **WHEN** an authorized recruiter changes a candidate's reviewed score from below 70 to 70 or greater with a reason
- **THEN** subsequent shortlist views and reports use the reviewed score and retain the original score in the audit record

### Requirement: Legacy status compatibility
The system SHALL treat a persisted normalized shortlist status as authoritative and SHALL use score-based fallback only for legacy or imported records that do not have a normalized campaign-candidate status.

#### Scenario: Persisted status and display fallback differ
- **WHEN** a current campaign candidate has a persisted `shortlisted` status
- **THEN** the UI displays it as shortlisted without applying a separate 80 percent cutoff
