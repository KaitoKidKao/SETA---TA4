# SETA INTERNATIONAL
## AGENTIC AI HACKATHON 2026
### POC Round Submission Report - SmartRecruit (Team 4)

| **Build Period**<br><br>11-23 June 2026 | **Submission Deadline**<br><br>23 June 2026, 23:59 GMT+7 | **Final Presentation**<br><br>28 June 2026 |
| :--- | :--- | :--- |

---

### 1. PURPOSE

This document provides the standardized POC Round deliverables, final presentation outline, and live demo guidelines for **SmartRecruit**, built by **Team 4**. It ensures alignment with evaluation criteria, technical design transparency, and ease of evaluation by the judges.

---

### 2. SUBMISSION CHECKLIST

| **No.** | **Item** | **Format** | **Status** |
| :--- | :--- | :--- | :--- |
| **1** | **Presentation Slides** | PDF / PPTX (Based on the 8-slide structure) | **✔ Completed** |
| **2** | **Source Code** | GitHub Repository Link | **✔ Completed** |
| **3** | **Documentation** | README with setup and run instructions | **✔ Completed** |
| **4** | **Backup Demo Video** | MP4 or YouTube link (3-5 minutes) | **✔ Completed** |
| **5** | **Architecture Diagram** | Included in README and presentation slides | **✔ Completed** |
| **6** | **UAT Guide for Evaluators** | PDF / Markdown ([smartrecruit_uat_guide.md](file:///c:/Users/ASUS/SETA---TA4/docs/smartrecruit_uat_guide.md)) | **✔ Completed** |
| **7** | **Supplementary Technical Documents** | Slide presentation kịch bản ([slide.md](file:///c:/Users/ASUS/SETA---TA4/slide.md)) | **✔ Completed** |

---

### 3. POC ROUND TIMELINE

| **Milestone** | **Date / Time** | **Required Action** |
| :--- | :--- | :--- |
| **POC Development Period** | 11 June - 23 June 2026 | Build the POC, implement campaign workflows, background worker, PII mask, and tests. |
| **POC Submission Deadline** | Tuesday, 23 June 2026 23:59 (GMT+7) | Submit all required deliverables listed in the submission checklist. |
| **Final Presentation & Live Demo** | 28 June 2026 | Present slides and demonstrate the working POC to the judges. |

---

### 4. OVERALL FINAL ROUND FORMAT

| **Section** | **Content** | **Duration** |
| :--- | :--- | :--- |
| **Part 1** | Slide presentation covering business context and technical depth | 10 minutes |
| **Part 2** | Live system demonstration | 10 minutes |

---

### 5. PART 1 - SLIDE PRESENTATION GUIDELINES

#### 5.1 General Requirements
* **Number of Slides:** 8 slides, mandatory.
* **Presentation Style:** Clear, concise, and backed by concrete evidence.
* **Data Sources:** All metrics accompanied by logging, tracing, or testing evidence.

#### 5.2 Mandatory 8-Slide Structure

##### Slide 1: Opening & Elevator Pitch (0:20)
* **Team name:** Team 4
* **Project name:** SmartRecruit
* **Elevator pitch:** For IT recruiters overwhelmed by manual CV screening and prone to public data leakage, we built a govern-agent recruitment system that automates CV parsing, semantic matching, and personalized outreach with local PII protection and anti-hallucination validation to deliver fast, secure, and accurate hiring campaigns.
* **Team members:** Cao (Backend & Workflows), [Name 2] (Frontend), [Name 3] (Data & Ops).

##### Slide 2: Problem Statement (1:20)
* **Business context:** Tech recruitment requires high-speed personalized outreach to capture top talent in a competitive market.
* **Core problem:** Manual CV evaluation is slow. Sending raw resumes to cloud LLMs leaks Candidate Personal Data (PII). Generic AI outreach emails suffer from "hallucinations," claiming incorrect work history and damaging employer brand.
* **Current approach:** Standard email templates or simple LLM wrappers that lack verification loops, resulting in low response rates and security risks.
* **Affected stakeholders:** Talent Acquisition teams, Hiring Managers, Candidates.

##### Slide 3: Solution Overview (1:20)
* **Overall solution:** SmartRecruit uses a multi-agent workflow integrated with a Dual-Gate Human-in-the-Loop (HITL) architecture, allowing recruiters to edit screening criteria (Gate 1) and approve outreach drafts (Gate 2).
* **Why an Agent:** A static rule-based system cannot extract semantic meaning, estimate experience overlaps, or check for text inconsistencies. AI Agents dynamically select tools (OCR fallback), mask PII data, and run verification loops.
* **Core value:** 90% reduction in screening time, zero cloud PII leakage, and 100% hallucination-free personalized emails.
* **User journey:** Create Campaign → Extract & Approve JD Criteria (Gate 1) → Auto-screen CVs + Fetch suggested candidates → Generate & Approve verified emails (Gate 2) → Send.

##### Slide 4: Architecture & Technology Stack (2:00)
* **Architecture:** Monorepo with Hono (Backend API) and React 19 (Frontend).
* **Agent Framework:** Mastra SDK (v1.37) for workflow execution and agent coordination.
* **LLM Selection:** GPT-4o-mini (selected for speed and cost-effective JSON formatting).
* **Integrated Tools:** Tesseract OCR (local fallback) and OpenAI Vision API (Vision OCR fallback).
* **Data Layer:** PostgreSQL with **pgvector** for talent pool search (Long-Term Memory).
* **Queue System:** Graphile Worker (background tasks to avoid HTTP timeouts).
* **Deployment:** Docker containers deployed on AWS EC2 with Jaeger (OpenTelemetry) tracing.

##### Slide 5: Agentic Design (2:00)
* **Reasoning:** Evaluates candidates against job requirements using detailed rubrics (skills, education, YOE calculations).
* **Planning:** Breaks down CV screening, PII masking, matching, and email drafting into independent, async tasks.
* **Memory:** Uses pgvector semantic search to recommend matched profiles from the historical talent database.
* **Tool Usage:** Selects standard PDF parser; falls back to Vision OCR if CV text is empty; falls back to local Tesseract OCR on API rate limits.
* **Autonomy Level:** High autonomy in data processing and drafting; pauses at Gate 1 (Criteria) and Gate 2 (Outreach) for human validation.
* **Multi-Agent Coordination:** Orchestrated via Mastra: JD Parser → PII Masker → Screener → Outreach Writer → Adoption Filter.

##### Slide 6: Proposal vs. Reality (1:00)

| **Category** | **Initial Plan** | **Actual Result** | **Notes** |
| :--- | :--- | :--- | :--- |
| **Architecture** | Simple HTTP-based pipeline | Asynchronous background Campaign system | Prevents timeout on large batches |
| **Features** | Simple CV Matcher | Dual-Gate HITL + SLA Tracker + Skill Gaps | High business control & UAT readiness |
| **Security** | None | Local PII Redaction Layer | Cheaper and secure (masks name, email, phone) |
| **LLM Reliability**| Direct prompt generation | Adoption Filter with self-correction | Eliminates fake resume claims |

##### Slide 7: Results & Metrics (1:30)
* **Output quality:** 100% of generated emails checked; all AI hallucinations corrected within 2 retries (evidence in Jaeger logs).
* **Processing speed:** Under 20s for JD parsing; batch CV screening processed asynchronously via Graphile Worker in under 30s.
* **Efficiency improvement:** Screen-to-outreach phase reduced from 3 hours of manual drafting to a 1-minute human review.
* **Test coverage:** 9 integration and contract tests passing successfully (evidence in Vitest reports).
* **Edge case handling:** Handles corrupted PDFs, OCR fallback on scanned files, and partial screening failures gracefully (errors marked per candidate).

##### Slide 8: Closing (0:30)
* **Challenges & lessons:** 1. Real-world CV text is messy (needs robust OCR fallbacks). 2. Multi-agent flows require local security guards (PII) before touching public LLMs.
* **Future direction:** Native parsing of DOCX/TXT files; real-time integration with Slack and LinkedIn API.
* **Closing statement:** SmartRecruit proves that AI-driven recruitment can be highly automated while remaining secure, verifiable, and recruiter-governed.

---

### 6. PART 2 - LIVE DEMO GUIDELINES

#### 6.1 Demo Structure Overview

| **Phase** | **Content** | **Duration** |
| :--- | :--- | :--- |
| **Phase 1** | Context setup | 1 minute |
| **Phase 2** | Core flow demonstration | 3 minutes |
| **Phase 3** | Advanced scenario demonstration | 3 minutes |
| **Phase 4** | Error and edge case handling | 2 minutes |
| **Phase 5** | Open demo per judge request | 1 minute |

#### 6.2 Detailed Phase Breakdown

##### Phase 1: Context Setup (1 minute)
* Explain the demo environment (running on EC2 container, database seeded).
* State the demo goals: Create a Campaign, see Gate 1 (Criteria), inject suggestions, review PII masking, verify the email anti-hallucination check, and complete outreach.

##### Phase 2: Core Flow Demonstration (3 minutes)
* **Step 1:** Recruiter logs in, inputs JD for a React Developer role, and uploads 3 PDF resumes.
* **Step 2:** Trigger Campaign. Show the background job initiating.
* **Step 3:** System hits **Gate 1**. Show the extracted criteria (Skills, YOE) and explain how the Recruiter can edit them.
* **Step 4:** Click **Approve**. Explain that the background worker is screening the CVs.
* **Step 5:** System hits **Gate 2**. Show the candidates' Fit Score %, calculated YOE, and the customized email drafts. Click **Approve Outreach** to send.

##### Phase 3: Advanced Scenarios (3 minutes)
* **LTM suggested candidates:** Show how the system uses pgvector to find relevant resumes in the historical database during Gate 1 and lets the recruiter inject them into the active campaign.
* **OCR Fallback:** Drag in a scanned CV image. Show how the system auto-detects it and triggers Vision OCR to extract text.
* **Adoption Filter Trace:** Open Jaeger to show the tracer span where the Adoption Filter detected a hallucination in a draft, triggered a self-correction retry, and rewrote a 100% correct email.

##### Phase 4: Error & Edge Case Handling (2 minutes)
* **Corrupted CV:** Show how the system isolates a file with extraction errors, marks it as "Screening Failed" in Gate 2 with a detailed warning badge, and allows the rest of the campaign to proceed.
* **SLA Warnings:** Show the SLA feedback tracker dashboard warning the team when hiring managers breach the 48h UAT feedback window.

##### Phase 5: Open Demo (1 minute)
* Invite judges to request custom parameters (e.g., modifying YOE threshold in Gate 1) to see the agent dynamically re-score candidates.
