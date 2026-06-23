# SmartRecruit UAT Guide for Evaluators

**For Advisory Board Testing - AI Agent POC Submissions**

**Format:** PDF (Generated from Markdown), maximum 3 pages | **Language:** Written for business users - no technical jargon

**Deadline:** 23 June 2026, 23:59 GMT+7

---

### 1. Purpose

The Advisory Board will act as end users to test Team 4's multi-agent product (**SmartRecruit**) before the final demo day. This UAT Guide provides step-by-step instructions to test the product on your own without technical support.

---

### Section 1: Access Information

| **Item** | **Content** |
| :--- | :--- |
| **System URL** | `https://team-4-hackathon.seta-international.com` |
| **Test Credentials** | Username: `admin@hackathon.com` <br> Password: `ChangeMe@2026` |
| **Supported Devices** | Desktop or Laptop Web Browsers (Google Chrome, Microsoft Edge, Safari, Firefox) |
| **Environment** | Demo Staging / Production |
| **List of Agents** | 1. **JD Parser Agent:** Extracts structured hiring criteria from job descriptions.<br>2. **PII Anonymizer Agent:** Redacts personal details (name, email, phone) locally to protect privacy.<br>3. **Screening Agent:** Matches resumes with criteria and calculates years of experience (YOE).<br>4. **Outreach Drafter Agent:** Composes personalized candidate emails.<br>5. **Adoption Filter Agent:** Detects and corrects AI email hallucinations against original resumes. |

---

### Section 2: Test Scenarios

#### Category A: Core Functionality (Happy Path & Coordination)

##### Scenario A1: Campaign Creation & Criteria Confirmation (Gate 1)
* **Input:** Job Description: *"Senior Software Engineer with 5+ years of experience in React, Node.js, and Postgres. AWS knowledge is nice to have."* and 3 sample candidate CV files.
* **Steps:**
  1. Open the **System URL** and log in using the credentials provided.
  2. Navigate to the **SmartRecruit** page from the sidebar menu.
  3. Under the **New Campaign** tab, enter **Campaign Title**: *"Senior Web Developer"* and paste the Job Description text.
  4. Drag and drop your sample resume PDF files into the upload area.
  5. Confirm that the **Launch Campaign** button is disabled while the files are uploading/extracting.
  6. Wait until all files show a green **Ready** status, then click **Launch Campaign**.
  7. The screen will switch to the **Active Pipeline** tab, running the JD Parser Agent, and will suspend at **Gate 1: Confirm Criteria**.
* **Expected Output:** You will see a structured list of must-have skills, nice-to-have skills, minimum YOE, and education requirements extracted by the JD Parser.

##### Scenario A2: Candidate Screening & Outreach Generation (Gate 2)
* **Input:** Resuming from Gate 1.
* **Steps:**
  1. Review the criteria generated in Gate 1.
  2. Click **Approve Criteria** without selecting suggested database candidates.
  3. The workflow resumes in the background. The PII Anonymizer redacts personal data, the Screening Agent scores candidate compatibility and YOE, and the Outreach Drafter composes emails.
  4. Wait for the status to change and suspend at **Gate 2: Approve Outreach**.
* **Expected Output:** The interface displays the screened candidates with their **Fit Score %**, Must-Have/Nice-to-Have match status, calculated YOE, and drafted outreach emails.

---

#### Category B: Agent Intelligence

##### Scenario B1: Context Retention & Candidate Injection
* **Input:** Campaign at Gate 1 (Confirm Criteria).
* **Steps:**
  1. At Gate 1, view the **Suggested Candidates** section at the bottom (retrieved using pgvector Long-Term Memory search of your existing talent database).
  2. Select 1 suggested candidate by checking their checkbox.
  3. Click **Approve Criteria**.
* **Expected Output:** The selected candidate is dynamically injected into the active campaign's screening pool, and will be evaluated and displayed in Gate 2 alongside the newly uploaded CVs.

##### Scenario B2: Dynamic Tool Selection (OCR Fallback)
* **Input:** A scanned image or non-selectable PDF CV file.
* **Steps:**
  1. In the **New Campaign** tab, upload a scanned resume file.
* **Expected Output:** The system detects that standard text extraction failed, automatically falls back to the **OCR/Vision API Tool**, extracts the CV text, and successfully changes the file status to **Ready**.

---

#### Category C: Error and Edge Cases

##### Scenario C1: Partial Campaign Screening Failure
* **Input:** Uploading 3 CVs where 1 file is corrupted or fails evaluation.
* **Steps:**
  1. Upload 3 CVs (including 1 corrupted or invalid PDF file) in a New Campaign and launch it.
  2. Approve the criteria at Gate 1 to trigger screening.
* **Expected Output:** The workflow does not crash. The 2 valid CVs are screened successfully. At Gate 2, all 3 candidate rows are displayed, with the failed CV marked as **Screening Failed** with a clear error explanation (e.g., *"Unable to extract text"*), allowing you to approve the outreach for the 2 valid candidates.

##### Scenario C2: Hiring Manager Feedback SLA Tracker (DS08)
* **Input:** Mock data imported from `03_ta_hire_request_jd_generation.xlsx`, sheet `DS08_HM_Feedback_Tracker`.
* **Steps:**
  1. Open the **SmartRecruit** dashboard after mock data import.
  2. Locate **HM Feedback SLA Tracker (DS08)**.
  3. Confirm shortlist and deadline values are shown as readable dates, not Excel serial numbers.
  4. Filter **Overdue** or **Due soon** requests.
  5. Click **Remind HM** on an eligible row.
* **Expected Output:** The tracker shows derived 48-hour SLA states (`On Track`, `Due Soon`, `Overdue`, `Submitted`). Reminder delivery is queued only after recruiter approval, records an attempt, and displays persisted queued/sent/failed state instead of a simulated success toast.

---

### Section 3: Mapping to Evaluation Criteria

| **Test Scenario** | **Corresponding Metric (Slide 7)** | **What to Observe** |
| :--- | :--- | :--- |
| **Scenario A1 & A2** | Output Quality / Efficiency | Accurate matching scores and high-quality personalized emails generated in minutes instead of hours. |
| **Scenario B1** | Context Retention / Autonomy | Suggested database profiles are fetched and merged seamlessly without manually re-uploading CVs. |
| **Scenario B2** | Tool Selection | The system handles scanned files automatically without throwing user-facing errors. |
| **Scenario C1** | Edge Case Handling | The campaign workflow isolates individual CV failures instead of halting or returning a 500 server error. |
| **Scenario C2** | Business Control / SLA Governance | Hiring Manager feedback deadlines are normalized, SLA state is derived from timestamps, and reminders require human approval before delivery. |

---

### Section 4: Known Limitations

* **Supported Languages:** English and Vietnamese only for resume parsing and email drafting.
* **Input Constraints:** PDF files only (maximum 5MB per file). Maximum 10 CVs per batch campaign.
* **Response Time:** Processing a batch of 3 CVs takes approximately 30-90 seconds. This is normal as the system executes local PII redaction and checks emails for hallucinations.
* **SMTP Mode:** Real email dispatch requires SMTP configuration; otherwise, sent emails are logged and shown as "Sent" in the database status.

---

### Section 5: Quick Reference

| **Do** | **Do Not** |
| :--- | :--- |
| ✔ Talk to the agent like a colleague when pasting job descriptions. | ❌ Expect the exact same email draft text on repeated runs (models are creative). |
| ✔ Verify the extracted criteria in Gate 1 before approving. | ❌ Upload files other than PDF (e.g., DOCX, TXT) as they are not supported. |
| ✔ Review and edit emails in Gate 2 before clicking Approve. | ❌ Click multiple times or refresh the page while the campaign is "In Progress". |
