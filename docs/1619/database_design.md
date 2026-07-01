# SmartRecruit Database Design

Tai lieu nay mo ta thiet ke du lieu hien tai cua module SmartRecruit trong repo SETA. Nguon tham chieu chinh la Drizzle schema tai `packages/smartrecruit/src/backend/db/schema.ts` va cac migration trong `packages/smartrecruit/drizzle/migrations/`.

## 1. Kien Truc Du Lieu

SmartRecruit dung Postgres schema rieng `smartrecruit`, quan ly bang Drizzle ORM. Tat ca bang nghiep vu deu co `tenant_id` de scope du lieu theo tenant.

Nguyen tac kien truc:

- Database chinh: Postgres.
- Vector search: pgvector thong qua shared vector store, khong dung ChromaDB.
- Migration: sinh bang Drizzle CLI, khong sua migration da commit.
- Khong dung cross-schema foreign key. Cac lien ket nhu `candidate_id`, `campaign_id`, `created_by` la UUID tenant-scoped va duoc bao ve bang query constraint/index.
- Campaign la aggregate trung tam cho workflow tuyen dung production.
- Workflow progress duoc track theo tung candidate de tranh mot loi CV/email lam fail ca campaign.

## 2. Entity Overview

```text
smartrecruit.candidates
  |
  | tenant_id + candidate_id
  v
smartrecruit.campaign_candidates ---- smartrecruit.campaigns
  |                                      |
  | draft_id                             | campaign_id
  v                                      v
smartrecruit.outreach_drafts        campaign_ai_usage
                                     campaign_data_warnings
                                     campaign_reports
                                     recruiter_overrides
                                     interview_schedules

smartrecruit.criteria
smartrecruit.outreach_templates
smartrecruit.interaction_histories
smartrecruit.team_hire_requests
smartrecruit.team_skills_matrix
smartrecruit.hm_feedback_requests
smartrecruit.hm_feedback_reminder_attempts
```

## 3. Core Tables

### 3.1 `candidates`

Luu ho so ung vien tu DS-06, upload CV, pool screening va ket qua screening moi nhat.

Cot chinh:

| Cot | Kieu | Mo ta |
| --- | --- | --- |
| `id` | `uuid` | Primary key |
| `tenant_id` | `uuid` | Tenant scope |
| `external_candidate_id` | `text` | Ma ung vien tu workbook/mock data |
| `display_name` | `text` | Ten hien thi |
| `email` | `text` | Email ung vien |
| `phone`, `location` | `text` | Thong tin lien he |
| `applied_position`, `current_title`, `current_company` | `text` | Thong tin nghe nghiep |
| `years_of_experience`, `seniority_level` | `integer/text` | Kinh nghiem va seniority |
| `employment_history`, `notable_projects`, `cv_skills` | `text` | Noi dung CV da chuan hoa |
| `english_level`, `highest_education`, `education_major`, `certifications` | `text` | Hoc van/ngoai ngu/chung chi |
| `source_status`, `pipeline_stage`, `source` | `text` | Trang thai nguon DS-06/pool |
| `re_engagement_eligible`, `re_engagement_notes` | `boolean/text` | Co nen tiep can lai ung vien cu |
| `cv_path`, `cv_text` | `text` | Duong dan/text CV upload |
| `status` | enum text | `applied`, `screened`, `shortlisted`, `rejected`, `outreached` |
| `fit_score` | `integer` | Diem AI moi nhat, 0-100 |
| `screening_report` | `jsonb` | Scorecard, evidence, flags, breakdown |

Indexes:

- `candidates_tenant_external_candidate_id` unique tren `(tenant_id, external_candidate_id)`.
- `candidates_by_tenant` tren `(tenant_id, status)`.
- `candidates_by_fit_score` tren `(tenant_id, fit_score)`.
- `candidates_by_applied_position` tren `(tenant_id, applied_position)`.
- `candidates_by_reengagement` tren `(tenant_id, re_engagement_eligible)`.

### 3.2 `criteria`

Luu tieu chi tu DS-07 hoac sinh tu JD va duoc HR xac nhan o Gate 1.

Cot chinh:

| Cot | Kieu | Mo ta |
| --- | --- | --- |
| `id` | `uuid` | Primary key |
| `tenant_id` | `uuid` | Tenant scope |
| `external_criteria_id` | `text` | Ma tieu chi tu workbook |
| `jd_id` | `text` | Ma JD lien ket neu co |
| `job_title`, `jd_text` | `text` | Ten vi tri va JD source |
| `must_have_skills`, `nice_to_have_skills` | `text[]` | Ky nang bat buoc/uu tien |
| `tech_stack_preferred`, `domain_preferred` | `text` | Stack/domain mong muon |
| `seniority_required`, `min_yoe`, `max_yoe` | `text/integer` | Dieu kien kinh nghiem |
| `english_level_required` | `text` | Yeu cau tieng Anh |
| `education_level`, `additional_requirements` | `text` | Dieu kien bo sung tu UI Gate 1 |
| `weight_must_have_skills`, `weight_yoe`, `weight_english`, `weight_nice_to_have` | `integer` | Trong so scoring deterministic |
| `scoring_note`, `auto_flag_if_missing`, `guardrail_notes` | `text` | Giai thich va guardrail |

Indexes:

- `criteria_tenant_external_criteria_id` unique tren `(tenant_id, external_criteria_id)`.
- `criteria_by_tenant` tren `(tenant_id)`.
- `criteria_by_position` tren `(tenant_id, job_title)`.

### 3.3 `campaigns`

Aggregate chinh cho moi lan chay recruitment pipeline. Campaign giu trang thai tong, counter va timestamp tung stage.

Cot chinh:

| Cot | Kieu | Mo ta |
| --- | --- | --- |
| `id` | `uuid` | Campaign ID |
| `tenant_id` | `uuid` | Tenant scope |
| `workflow_run_id` | `text` | Mastra workflow run ID |
| `criteria_id` | `uuid` | Tieu chi da xac nhan |
| `job_title`, `jd_text` | `text` | JD cua campaign |
| `template_id` | `uuid` | Outreach template neu co |
| `orchestration_version` | `integer` | Version workflow/progress tracking |
| `status` | enum text | `queued`, `awaiting_criteria`, `screening`, `screening_completed`, `drafting`, `awaiting_outreach_approval`, `sending`, `completed`, `completed_with_errors`, `failed`, `canceled` |
| `total_candidates`, `screened_count`, `shortlisted_count`, `failed_count`, `drafted_count`, `sent_count` | `integer` | Counter campaign |
| `created_by` | `uuid` | User tao campaign |
| `started_at`, `completed_at` | `timestamp` | Vong doi campaign |
| `screening_started_at`, `screening_completed_at` | `timestamp` | Stage screening |
| `drafting_started_at`, `drafting_completed_at` | `timestamp` | Stage drafting |
| `sending_started_at`, `sending_completed_at` | `timestamp` | Stage sending |
| `error_reason` | `text` | Loi tong neu campaign fail |

Indexes:

- `campaigns_by_tenant_status` tren `(tenant_id, status)`.
- `campaigns_by_tenant_created_by` tren `(tenant_id, created_by)`.
- `campaigns_by_workflow_run` tren `(tenant_id, workflow_run_id)`.

### 3.4 `campaign_candidates`

Bang lien ket candidate vao campaign va track progress theo tung ung vien.

Cot chinh:

| Cot | Kieu | Mo ta |
| --- | --- | --- |
| `id` | `uuid` | Primary key |
| `tenant_id` | `uuid` | Tenant scope |
| `campaign_id`, `candidate_id` | `uuid` | Lien ket tenant-scoped |
| `source` | enum text | `uploaded`, `suggested`, `mock_pool`, `manual` |
| `status` | enum text | `queued`, `screening`, `screened`, `shortlisted`, `screening_failed`, `drafting`, `drafted`, `draft_failed`, `sending`, `sent`, `send_failed`, `rejected` |
| `fit_score` | `integer` | AI score |
| `reviewed_fit_score`, `reviewed_by`, `reviewed_at`, `review_reason` | `integer/uuid/timestamp/text` | Recruiter override score |
| `screening_report` | `jsonb` | Scorecard chi tiet |
| `draft_id` | `uuid` | Outreach draft gan voi ung vien |
| `error_reason`, `last_error_code` | `text` | Loi item-level |
| `screening_attempts`, `drafting_attempts`, `sending_attempts` | `integer` | Retry counters |
| `last_attempt_at` | `timestamp` | Lan thu gan nhat |
| `started_at`, `screened_at`, `drafted_at`, `sent_at` | `timestamp` | Timestamp theo stage |

Indexes:

- `campaign_candidates_unique_candidate` unique tren `(tenant_id, campaign_id, candidate_id)`.
- `campaign_candidates_by_campaign` tren `(tenant_id, campaign_id)`.
- `campaign_candidates_by_status` tren `(tenant_id, campaign_id, status)`.

### 3.5 `outreach_templates`

Luu mau email/LinkedIn tu DS-08.

Cot chinh:

| Cot | Kieu | Mo ta |
| --- | --- | --- |
| `id` | `uuid` | Primary key |
| `tenant_id` | `uuid` | Tenant scope |
| `external_template_id` | `text` | Ma template tu workbook |
| `name`, `source_channel`, `use_case`, `target_status`, `language` | `text` | Metadata template |
| `template_content` | `text` | Noi dung legacy neu co |
| `subject_template`, `body_template` | `text` | Template subject/body |

Indexes:

- `templates_tenant_external_template_id` unique tren `(tenant_id, external_template_id)`.
- `templates_by_tenant_channel` tren `(tenant_id, source_channel)`.

### 3.6 `outreach_drafts`

Luu email sinh boi AI, trang thai hallucination check, approval va send result.

Cot chinh:

| Cot | Kieu | Mo ta |
| --- | --- | --- |
| `id` | `uuid` | Primary key |
| `tenant_id` | `uuid` | Tenant scope |
| `campaign_id` | `uuid` | Campaign nullable de giu tuong thich draft cu |
| `candidate_id` | `uuid` | Ung vien nhan email |
| `subject`, `body` | `text` | Noi dung draft |
| `status` | enum text | `draft`, `approved`, `sent`, `failed` |
| `hallucination_check_status` | enum text | `pending`, `passed`, `failed` |
| `error_reason` | `text` | Loi draft/send |
| `sent_at` | `timestamp` | Thoi diem gui |
| `message_type` | `text` | Loai email theo migration moi, default `outreach`; dung cho outreach/rejection/reminder-style draft neu can |

Indexes:

- `drafts_by_tenant_candidate` tren `(tenant_id, candidate_id)`.
- `drafts_by_tenant_campaign` tren `(tenant_id, campaign_id)`.

### 3.7 `interaction_histories`

Luu lich su email da gui de canh bao tiep can lai qua gan va ho tro vector hoa outreach history.

Cot chinh:

| Cot | Kieu | Mo ta |
| --- | --- | --- |
| `id` | `uuid` | Primary key |
| `tenant_id`, `candidate_id`, `criteria_id` | `uuid` | Scope va lien ket |
| `subject`, `body` | `text` | Noi dung da gui |
| `status` | `text` | Trang thai, default `sent` |
| `summary_text` | `text` | Tom tat dung cho search/canh bao |
| `sent_at` | `timestamp` | Thoi diem gui |

Index:

- `interaction_histories_by_tenant_candidate` tren `(tenant_id, candidate_id)`.

## 4. Production Support Tables

### 4.1 `recruiter_overrides`

Bang immutable ghi lai recruiter review/override score. API review cap nhat `campaign_candidates.reviewed_fit_score` va insert audit row vao bang nay.

Cot chinh:

- `campaign_id`, `candidate_id`
- `field`
- `ai_value`, `human_value`
- `reason`
- `prompt_version`
- `created_by`, `created_at`

Index:

- `recruiter_overrides_by_campaign_candidate` tren `(tenant_id, campaign_id, candidate_id)`.

### 4.2 `campaign_data_warnings`

Luu warning ve chat luong du lieu: JD khong co `jd_id`, email/phone thieu, CEFR/seniority khong chuan, OCR/parse issue.

Cot chinh:

- `campaign_id`
- `warning_code`
- `severity`: `info`, `warning`, `error`
- `entity_type`, `entity_id`
- `message`, `details`
- `resolved_at`, `resolved_by`, `resolution_note`

Index:

- `campaign_data_warnings_by_campaign` tren `(tenant_id, campaign_id, severity)`.

### 4.3 `campaign_ai_usage`

Luu usage theo stage de tinh KPI latency/token/model usage.

Cot chinh:

- `campaign_id`, `candidate_id`
- `stage`
- `model`
- `prompt_version`
- `input_tokens`, `output_tokens`
- `latency_ms`
- `attempt`
- `ocr_source`

Index:

- `campaign_ai_usage_by_campaign` tren `(tenant_id, campaign_id, stage)`.

### 4.4 `campaign_reports`

Luu snapshot bao cao HM bat bien. PDF khong luu trong DB; PDF duoc render tu snapshot/markdown khi request.

Cot chinh:

- `campaign_id`
- `version`
- `snapshot` JSONB
- `markdown`
- `content_hash`
- `recruiter_note`
- `created_by`, `created_at`

Indexes:

- `campaign_reports_unique_version` unique tren `(tenant_id, campaign_id, version)`.
- `campaign_reports_by_campaign` tren `(tenant_id, campaign_id, created_at)`.

### 4.5 `team_hire_requests` va `team_skills_matrix`

Ho tro Team Skill Gap Analysis tu file yeu cau tuyen dung/JD generation.

`team_hire_requests`:

- `position_title`
- `team_skill_gap_summary`
- `business_unit`

`team_skills_matrix`:

- `team_name`
- `skill`
- `proficiency_level`

Indexes:

- `team_hire_requests_by_tenant_title` tren `(tenant_id, position_title)`.
- `team_skills_matrix_by_tenant_team` tren `(tenant_id, team_name)`.

### 4.6 `hm_feedback_requests`

Luu DS-08/HM feedback SLA tracker trong trang Monitoring.

Cot chinh:

- `external_feedback_id`
- `campaign_id`, `candidate_id`
- `candidate_name`, `position`
- `hiring_manager`, `hiring_manager_email`
- `recruiter_owner_id`, `recruiter_owner_email`
- `shortlisted_at`, `feedback_due_at`
- `feedback_status`, `submitted_at`
- `hm_decision`, `hm_feedback_text`
- `source_sla_breach`, `source_metadata`

Indexes:

- `hm_feedback_requests_tenant_external_id` unique tren `(tenant_id, external_feedback_id)`.
- `hm_feedback_requests_by_tenant_due` tren `(tenant_id, feedback_due_at)`.
- `hm_feedback_requests_by_tenant_status` tren `(tenant_id, feedback_status)`.
- `hm_feedback_requests_by_campaign` tren `(tenant_id, campaign_id)`.

### 4.7 `hm_feedback_reminder_attempts`

Luu reminder email cho HM, co idempotency de tranh gui trung.

Cot chinh:

- `feedback_request_id`
- `stage`: `due_soon`, `overdue`
- `channel`: `email`
- `recipient_email`
- `subject`, `body`
- `status`: `draft`, `queued`, `sent`, `failed`, `canceled`
- `idempotency_key`
- `retry_number`
- `approved_by`, `approved_at`
- `queued_at`, `sent_at`
- `provider_message_id`
- `failure_code`, `failure_message`

Indexes:

- `hm_feedback_reminders_idempotency` unique tren `(tenant_id, idempotency_key)`.
- `hm_feedback_reminders_by_request` tren `(tenant_id, feedback_request_id, created_at)`.
- `hm_feedback_reminders_by_status` tren `(tenant_id, status)`.

### 4.8 `interview_schedules`

Luu lich phong van sau shortlist.

Cot chinh:

- `campaign_candidate_id`, `candidate_id`, `campaign_id`
- `interviewer_email`, `interviewer_name`
- `candidate_email`, `candidate_name`
- `scheduled_at`, `duration_minutes`
- `teams_link`, `graph_event_id`
- `status`: `pending`, `confirmed`, `canceled`, `completed`, `rescheduled`
- `notes`, `created_by`

Indexes:

- `interview_schedules_by_campaign` tren `(tenant_id, campaign_id)`.
- `interview_schedules_by_candidate` tren `(tenant_id, candidate_id)`.
- `interview_schedules_by_status` tren `(tenant_id, status)`.

## 5. Vector Search Design

SmartRecruit dung shared vector store tren pgvector, khong dung ChromaDB.

Vector indexes:

- `candidate_cv_embeddings`: vector hoa CV/skills ung vien phuc vu Browse Existing Candidates va talent pool recommendation.
- `outreach_interaction_embeddings`: vector hoa lich su outreach de phat hien ung vien moi duoc lien he gan day.

Metadata vector nen toi thieu PII:

- Duoc phep: `candidate_id`, `tenant_id`, position/status/source/re-engagement flags.
- Can tranh: raw CV text, full email body, email ca nhan, phone, display name.

Khi vector provider loi, code co fallback pseudo-embedding cuc bo de khong lam hong luong import/screening. Tuy nhien ket qua similarity trong fallback chi nen xem la best-effort.

## 6. Workflow Data Flow

### 6.1 New Campaign

```text
POST /api/smartrecruit/v1/campaigns
  -> insert campaigns(status = queued)
  -> upsert candidates tu CV upload/pool
  -> insert campaign_candidates(status = queued)
  -> start Mastra workflow smartrecruit
```

### 6.2 Gate 1

```text
parse JD
  -> insert/update criteria
  -> update campaigns.criteria_id
  -> suspend approval Gate 1
  -> recruiter co the sua criteria va them suggested candidates
```

### 6.3 Screening

```text
campaign status = screening
  -> graphile-worker per-candidate jobs
  -> update campaign_candidates status/fit_score/screening_report
  -> update campaign counters
  -> emit screening_completed event khi stage xong
```

### 6.4 Gate 2 va Outreach

```text
shortlisted candidates
  -> draft outreach per candidate
  -> outreach_drafts gan campaign_id
  -> suspend approval Gate 2
  -> selected drafts duoc approved/sent
  -> unselected candidates chuyen rejected
  -> send failure chi update candidate/draft do, khong fail ca campaign
```

### 6.5 Monitoring va HM Feedback

```text
import HM feedback workbook
  -> upsert hm_feedback_requests
  -> Monitoring page tinh SLA state tu shortlisted_at/feedback_due_at
  -> reminder approval tao hm_feedback_reminder_attempts
  -> worker gui email va update sent/failed
```

## 7. Data Quality And Audit

SmartRecruit khong coi du lieu workbook/CV la sach hoan toan. Cac canh bao duoc luu vao `campaign_data_warnings`, gom:

- `jd_id` thieu hoac khong link duoc.
- Candidate thieu email/phone.
- Seniority/CEFR/boolean bi sai format.
- OCR/native PDF extraction loi hoac confidence thap.
- Score thieu evidence.

Recruiter override score khong ghi de mat dau vet AI. He thong giu:

- AI score: `campaign_candidates.fit_score`.
- Recruiter score: `campaign_candidates.reviewed_fit_score`.
- Audit immutable: `recruiter_overrides`.

Effective score khi ranking/report:

```text
effectiveFitScore = reviewed_fit_score ?? fit_score
```

## 8. Idempotency And Reliability

Nhung bang/cot ho tro retry va idempotency:

- `campaign_candidates_unique_candidate` ngan duplicate candidate trong cung campaign.
- `screening_attempts`, `drafting_attempts`, `sending_attempts`, `last_attempt_at`, `last_error_code` track retry per stage.
- Terminal statuses nhu `sent`, `rejected`, `screening_failed`, `send_failed` duoc job skip khi rerun.
- `hm_feedback_reminders_idempotency` ngan gui trung reminder.
- `campaign_reports_unique_version` ngan report version trung.

Campaign co loi item-level nhung stage khac van xong thi ket thuc bang `completed_with_errors`, khong fail toan bo pipeline.

## 9. Datasets Mapping

| Dataset | Bang chinh |
| --- | --- |
| `03_ta_hire_request_jd_generation.xlsx` | `team_hire_requests`, `team_skills_matrix`, `criteria` |
| `04_ta_cv_screening.xlsx` DS-06 | `candidates`, vector index `candidate_cv_embeddings` |
| `04_ta_cv_screening.xlsx` DS-07 | `criteria` |
| `04_ta_cv_screening.xlsx` DS-08 outreach templates | `outreach_templates` |
| `04_ta_cv_screening.xlsx` HM feedback tracker | `hm_feedback_requests`, `hm_feedback_reminder_attempts` |

## 10. Notes For Future Changes

- Neu them OCR document persistence rieng, nen tao bang moi `cv_documents` thay vi nhet trang thai OCR vao `candidates.cv_text`.
- Neu them pricing token chinh thuc, nen them `pricing_version` vao `campaign_ai_usage` de tinh chi phi co audit.
- Neu them external storage cho report PDF, chi luu `storage_key`/hash trong DB, khong luu binary PDF.
- Neu can lien ket sang user/tenant schemas, van giu khong cross-schema FK va enforce bang tenant-scoped queries.
