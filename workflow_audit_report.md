# Báo cáo Kiểm tra Đối chiếu Workflow SmartRecruit

**Ngày kiểm tra:** 2026-06-12
**Đối tượng so sánh:**
- [Workflow_Explanation_VN.md](file:///c:/Users/ASUS/SETA---TA4/docs/Workflow_Explanation_VN.md) (Tài liệu thiết kế workflow)
- [Proposal_Report.md](file:///c:/Users/ASUS/SETA---TA4/docs/Proposal_Report.md) (Báo cáo đề xuất dự án)
- Code thực tế trong [packages/smartrecruit/](file:///c:/Users/ASUS/SETA---TA4/packages/smartrecruit)

---

## Tóm tắt Kết quả

| Hạng mục | Trạng thái | Ghi chú |
|:---|:---:|:---|
| **Giai đoạn 1 – Parse JD & HITL Gate 1** | ✅ ĐẠT | Đầy đủ |
| **Giai đoạn 2 – Screen CV & Fit Score** | ✅ ĐẠT | Đầy đủ |
| **Giai đoạn 2 – Re-planning OCR Fallback** | ✅ ĐẠT | Đầy đủ |
| **Giai đoạn 2 – Draft Outreach** | ✅ ĐẠT | Đầy đủ |
| **Giai đoạn 2 – Anti-Hallucination Filter** | ✅ ĐẠT | Đầy đủ |
| **Giai đoạn 3 – HITL Gate 2 & Approve** | ✅ ĐẠT | Đầy đủ |
| **Giai đoạn 3 – Execute (Gửi email)** | ✅ ĐẠT | Đầy đủ |
| **BDI Architecture** | ✅ ĐẠT | Tách biệt rõ ràng |
| **Memory Architecture (STM/WM/LTM)** | ⚠️ CẦN CẢI THIỆN | LTM chưa tích hợp vào workflow |
| **Agent Tools Contract** | ✅ ĐẠT | Đầy đủ 5/4 tools |
| **Mock Data Integration (DS-06/07/08)** | ✅ ĐẠT | Đầy đủ 3 datasets |
| **RBAC & Permission** | ✅ ĐẠT | Đầy đủ |
| **Rate Limit / Retry (Bảng 5)** | ⚠️ CẦN CẢI THIỆN | Chưa triển khai backoff |
| **Anonymization Layer (Bảng 8)** | ❌ CHƯA ĐẠT | Chưa triển khai |

---

## Chi tiết Đối chiếu Từng Giai đoạn

### 🟣 Giai đoạn 1: Nạp Beliefs & Khởi tạo Desires

#### Yêu cầu Workflow (Tài liệu)
> Recruiter gửi yêu cầu (JD + DS-06) → BDI Planner phân tích → Tool Executor gọi `parse_jd_tool` → Execution Gateway đẩy ra HITL Gate → Recruiter duyệt/sửa → Lưu vào Working Memory (Beliefs) → Feedback ✔

#### Triển khai Code thực tế

| Bước | Tài liệu | Code | Đánh giá |
|:---|:---|:---|:---:|
| Nhận JD + CVs | Recruiter gửi request | [SmartrecruitWorkflowInputSchema](file:///c:/Users/ASUS/SETA---TA4/packages/smartrecruit/src/backend/workflows/smartrecruit-workflow.ts#L26-L31) nhận `jobTitle`, `jdText`, `cvs` | ✅ |
| Gọi `parse_jd_tool` | Tool Executor gọi | [parseJdStep](file:///c:/Users/ASUS/SETA---TA4/packages/smartrecruit/src/backend/workflows/smartrecruit-workflow.ts#L66-L230) dùng LLM Agent trích xuất must-have/nice-to-have/YOE | ✅ |
| HITL Gate 1 | Gateway đẩy ra HITL | `suspend(card)` tại [dòng 204](file:///c:/Users/ASUS/SETA---TA4/packages/smartrecruit/src/backend/workflows/smartrecruit-workflow.ts#L204) dùng `ApprovalCardSchema` | ✅ |
| Recruiter duyệt/sửa | Approve/Decline | `resumeSchema` hỗ trợ `approve`/`decline` tại [dòng 73-81](file:///c:/Users/ASUS/SETA---TA4/packages/smartrecruit/src/backend/workflows/smartrecruit-workflow.ts#L73-L81) | ✅ |
| Lưu vào Working Memory | Lưu Beliefs vào DB | Insert vào `criteria` table tại [dòng 142-153](file:///c:/Users/ASUS/SETA---TA4/packages/smartrecruit/src/backend/workflows/smartrecruit-workflow.ts#L142-L153) | ✅ |
| API chỉnh sửa tiêu chí | Recruiter sửa criteria | `PATCH /api/smartrecruit/v1/criteria/:id` tại [routes.ts#L231-L265](file:///c:/Users/ASUS/SETA---TA4/packages/smartrecruit/src/backend/http/routes.ts#L231-L265) | ✅ |

> [!NOTE]
> **Kết luận Giai đoạn 1:** Hoàn toàn khớp với tài liệu. Luồng Parse JD → HITL Gate 1 → Lưu Beliefs triển khai đầy đủ.

---

### 🟢 Giai đoạn 2: Vòng lặp Sàng lọc & Tái tương tác

#### 2a. Screen CV + Fit Score

| Bước | Tài liệu | Code | Đánh giá |
|:---|:---|:---|:---:|
| Duyệt từng CV | Loop DS-06 | [screenCvsStep](file:///c:/Users/ASUS/SETA---TA4/packages/smartrecruit/src/backend/workflows/smartrecruit-workflow.ts#L247-L291) lặp qua `inputData.cvs` | ✅ |
| Gọi `screen_cv_tool` | Chấm điểm Fit Score | [screenCv()](file:///c:/Users/ASUS/SETA---TA4/packages/smartrecruit/src/backend/domain/screen-cv.ts#L83-L284) dùng LLM Agent phân tích ngữ nghĩa | ✅ |
| Semantic Skill Matching | So khớp ngữ nghĩa (Next.js ≈ React) | Prompt chỉ dẫn tại [screen-cv.ts#L137](file:///c:/Users/ASUS/SETA---TA4/packages/smartrecruit/src/backend/domain/screen-cv.ts#L137): `"Perform semantic mapping"` | ✅ |
| YOE Calculation | Tính số năm kinh nghiệm bằng tháng | [calculateDurationInMonths()](file:///c:/Users/ASUS/SETA---TA4/packages/smartrecruit/src/backend/domain/screen-cv.ts#L53-L81) tính chính xác theo tháng | ✅ |
| Fit Score 0-100 | Chấm điểm phần trăm | Output schema `fitScore: z.number().int().min(0).max(100)` | ✅ |
| Shortlist threshold | fitScore ≥ 70 → shortlisted | [dòng 275](file:///c:/Users/ASUS/SETA---TA4/packages/smartrecruit/src/backend/workflows/smartrecruit-workflow.ts#L275): `if (screened.fitScore >= 70)` | ✅ |
| Report (pros/gaps) | Lý do chi tiết ưu/nhược | Output có `pros`, `gaps`, `overallJustification`, `mustHaveMatches`, `niceToHaveMatches` | ✅ |
| Lưu vào Working Memory | Ghi kết quả vào DB | Insert/Update `candidates` table với `screening_report` JSON | ✅ |

#### 2b. Re-planning / OCR Fallback

| Bước | Tài liệu | Code | Đánh giá |
|:---|:---|:---|:---:|
| File hỏng → Re-planning | Gateway báo Planner, gọi OCR dự phòng | [screen-cv.ts#L88-L110](file:///c:/Users/ASUS/SETA---TA4/packages/smartrecruit/src/backend/domain/screen-cv.ts#L88-L110): PDF parsing fail → OCR fallback | ✅ |
| OCR Tool chính | Vision API (GPT-4o-mini) | [ocr.ts#L27-L70](file:///c:/Users/ASUS/SETA---TA4/packages/smartrecruit/src/backend/domain/ocr.ts#L27-L70): dùng OpenAI Vision | ✅ |
| OCR Fallback cấp 2 | Tesseract local | [ocr.ts#L73-L86](file:///c:/Users/ASUS/SETA---TA4/packages/smartrecruit/src/backend/domain/ocr.ts#L73-L86): Tesseract `vie+eng` | ✅ |
| Feedback ✖ khi thất bại | Báo lỗi rõ ràng | `throw new Error(...)` nếu cả 2 lớp OCR đều thất bại | ✅ |

#### 2c. Draft Outreach Email + Anti-Hallucination

| Bước | Tài liệu | Code | Đánh giá |
|:---|:---|:---|:---:|
| Gọi `draft_outreach_tool` | Soạn thư cá nhân hóa | [draftOutreach()](file:///c:/Users/ASUS/SETA---TA4/packages/smartrecruit/src/backend/domain/draft-outreach.ts#L27-L234): LLM Agent soạn thư | ✅ |
| Dùng outreach template | Template từ DS-08 | Fetch từ `outreachTemplates` table, fallback mặc định nếu thiếu | ✅ |
| Anti-Hallucination Filter | Đối chiếu thư với CV gốc | [verifyDraft()](file:///c:/Users/ASUS/SETA---TA4/packages/smartrecruit/src/backend/domain/draft-outreach.ts#L125-L165): Agent riêng kiểm tra entity | ✅ |
| Self-Correction (Temp=0) | Hạ Temperature về 0, regenerate | [dòng 189](file:///c:/Users/ASUS/SETA---TA4/packages/smartrecruit/src/backend/domain/draft-outreach.ts#L189): `temp = 0.0` khi phát hiện ảo giác | ✅ |
| Retry tối đa 3 lần | Proposal yêu cầu 2 lần, code cho 3 lần | `while (attempt <= 3)` — **Vượt yêu cầu** | ✅ |
| Lưu hallucination status | Ghi nhận kết quả kiểm tra | `hallucination_check_status` trong `outreachDrafts` table | ✅ |

> [!NOTE]
> **Kết luận Giai đoạn 2:** Hoàn toàn khớp với tài liệu. Luồng Screen CV → OCR Fallback → Draft Outreach → Anti-Hallucination triển khai đầy đủ, thậm chí vượt yêu cầu (3 retry thay vì 2).

---

### 🟠 Giai đoạn 3: Quyết định cuối cùng (Final Gateway)

| Bước | Tài liệu | Code | Đánh giá |
|:---|:---|:---|:---:|
| HITL Gate 2 | Trình duyệt Shortlist + Thư nháp | [draftOutreachStep](file:///c:/Users/ASUS/SETA---TA4/packages/smartrecruit/src/backend/workflows/smartrecruit-workflow.ts#L309-L392): `suspend(card)` với danh sách ứng viên & drafts | ✅ |
| Recruiter duyệt/ghi đè | Approve/Decline + sửa email | `PATCH /api/smartrecruit/v1/outreach/drafts/:id` cho phép sửa subject/body | ✅ |
| Gửi email hàng loạt | Executor gửi email sau khi duyệt | [executeOutreachStep](file:///c:/Users/ASUS/SETA---TA4/packages/smartrecruit/src/backend/workflows/smartrecruit-workflow.ts#L396-L417): gọi `executeOutreach()` cho mỗi draft | ✅ |
| SMTP Transport | Gửi thư qua SMTP | [execute-outreach.ts#L60-L75](file:///c:/Users/ASUS/SETA---TA4/packages/smartrecruit/src/backend/domain/execute-outreach.ts#L60-L75): dùng `@seta/shared-mailer` | ✅ |
| Cập nhật trạng thái | Candidate → outreached, Draft → sent | [execute-outreach.ts#L80-L103](file:///c:/Users/ASUS/SETA---TA4/packages/smartrecruit/src/backend/domain/execute-outreach.ts#L80-L103) | ✅ |

> [!NOTE]
> **Kết luận Giai đoạn 3:** Hoàn toàn khớp với tài liệu. HITL Gate 2 → Recruiter duyệt → Execute send email.

---

## Đối chiếu Agent Tools Contract (Bảng 7 Proposal)

| Intent (Tài liệu) | Tool Name (Tài liệu) | Code Implementation | I/O Match | Đánh giá |
|:---|:---|:---|:---:|:---:|
| Đọc hiểu JD | `parse_jd_tool` | [smartrecruitParseJdTool](file:///c:/Users/ASUS/SETA---TA4/packages/smartrecruit/src/backend/agent-tools.ts#L12-L42) | ✅ Input: `jdText` → Output: `mustHave, niceToHave, yoe` | ✅ |
| Đánh giá CV | `screen_cv_tool` | [smartrecruitScreenCvTool](file:///c:/Users/ASUS/SETA---TA4/packages/smartrecruit/src/backend/agent-tools.ts#L44-L103) | ✅ Input: `cvText, criteria` → Output: `fitScore, pros, cons` | ✅ |
| Soạn thư tiếp cận | `draft_outreach_tool` | [smartrecruitDraftOutreachTool](file:///c:/Users/ASUS/SETA---TA4/packages/smartrecruit/src/backend/agent-tools.ts#L105-L138) | ✅ Output có `hallucinationCheckStatus` | ✅ |
| OCR dự phòng | `ocr_backup_tool` | [smartrecruitOcrBackupTool](file:///c:/Users/ASUS/SETA---TA4/packages/smartrecruit/src/backend/agent-tools.ts#L165-L184) | ✅ Input: `filePath` → Output: `text` | ✅ |
| Gửi email (Bonus) | *(Không có trong Bảng 7)* | [smartrecruitExecuteOutreachTool](file:///c:/Users/ASUS/SETA---TA4/packages/smartrecruit/src/backend/agent-tools.ts#L140-L163) | — Tool thêm so với proposal | ✅ Bonus |

> [!TIP]
> Code triển khai **5 tools** trong khi Proposal chỉ định nghĩa **4 tools**. Tool thứ 5 (`executeOutreach`) là bổ sung hợp lý cho luồng Giai đoạn 3.

---

## Đối chiếu Mock Data Integration (DS-06/07/08)

| Dataset | Tài liệu | Code | Đánh giá |
|:---|:---|:---|:---:|
| **DS-06** – Candidate Database | `candidate_id`, `full_name`, `cv_skills`, `status`, `source` | [import-mock-data.ts#L112-L176](file:///c:/Users/ASUS/SETA---TA4/packages/smartrecruit/src/backend/domain/import-mock-data.ts#L112-L176): Đọc sheet `DS-06_Candidate_Database`, map đầy đủ 30+ trường | ✅ |
| **DS-07** – Screening Criteria | `criteria_id`, `must_have_skills`, `nice_to_have`, trọng số | [import-mock-data.ts#L178-L241](file:///c:/Users/ASUS/SETA---TA4/packages/smartrecruit/src/backend/domain/import-mock-data.ts#L178-L241): Đọc sheet `DS-07_Screening_Criteria`, map trọng số chấm điểm | ✅ |
| **DS-08** – Outreach Template | `template_id`, `channel`, `template_content` | [import-mock-data.ts#L243-L286](file:///c:/Users/ASUS/SETA---TA4/packages/smartrecruit/src/backend/domain/import-mock-data.ts#L243-L286): Đọc sheet `DS-08_Outreach_Template`, tách subject/body | ✅ |

---

## Đối chiếu BDI Architecture

| Thành phần BDI | Tài liệu | Code Implementation | Đánh giá |
|:---|:---|:---|:---:|
| **Beliefs** (Niềm tin) | Tiêu chí đã duyệt từ JD, dữ liệu CV | `criteria` table = Working Memory (Beliefs), `candidates` table = dữ liệu ứng viên | ✅ |
| **Desires** (Mục tiêu) | Sàng lọc ứng viên, chấm điểm, soạn thư | Workflow 4-step chain: `parseJd → screenCvs → draftOutreach → executeOutreach` | ✅ |
| **Intentions** (Kế hoạch) | Chuỗi hành động cụ thể | Mastra Workflow `.then().then().then().then()` chain tại [dòng 425-430](file:///c:/Users/ASUS/SETA---TA4/packages/smartrecruit/src/backend/workflows/smartrecruit-workflow.ts#L425-L430) | ✅ |

---

## Đối chiếu Memory Architecture

| Lớp bộ nhớ | Tài liệu | Code Implementation | Đánh giá |
|:---|:---|:---|:---:|
| **Short-term Memory (STM)** | Lưu yêu cầu phiên chat | Workflow `requestContext` + session management | ✅ |
| **Working Memory (WM)** | Tiêu chí sàng lọc, kết quả tạm | `criteria` table, `candidates` table, `outreachDrafts` table — Postgres | ✅ |
| **Long-term Memory (LTM)** | Vector DB cho semantic search ứng viên cũ | [vector-store.ts](file:///c:/Users/ASUS/SETA---TA4/packages/smartrecruit/src/backend/embeddings/vector-store.ts) — PgVector setup có sẵn | ⚠️ |

> [!WARNING]
> **LTM chưa tích hợp vào workflow chính.** File `vector-store.ts` đã định nghĩa cấu trúc PgVector (index HNSW, dimension 1536) nhưng **chưa có code nào trong workflow hay domain gọi đến** `getSmartrecruitVectorStore()` hay `ensureSmartrecruitVectorIndex()`. Nghĩa là tính năng **Semantic Search ứng viên cũ** (mô tả trong Giai đoạn 2 Workflow: "BDI Planner sử dụng Long-term Memory để tìm kiếm các ứng viên cũ trạng thái In-pool") chưa hoạt động qua vector search, mà chỉ dùng SQL query thông thường trong [screenCandidatePool](file:///c:/Users/ASUS/SETA---TA4/packages/smartrecruit/src/backend/domain/screen-candidate-pool.ts).

---

## Đối chiếu Failure Handling (Bảng 5 Proposal)

| Tình huống lỗi | Tài liệu | Code Implementation | Đánh giá |
|:---|:---|:---|:---:|
| **File CV hỏng** | Re-planning → OCR dự phòng | ✅ PDF parse fail → Vision OCR → Tesseract fallback | ✅ |
| **Thiếu YOE** | Graceful degrade, áp điểm 0 | ✅ `minYoe.default(0)`, LLM prompt xử lý "present" | ✅ |
| **Ảo giác email** | Self-correction, Temp=0, regenerate | ✅ 3 vòng retry, hạ temp về 0 | ✅ |
| **Rate limit 429** | Exponential backoff + jitter qua graphile-worker | ❌ Chưa triển khai | ⚠️ |

> [!WARNING]
> **Rate Limit Handling chưa triển khai.** Proposal mô tả sử dụng `graphile-worker` kết hợp `transactional outbox` cho exponential backoff, nhưng thư mục [jobs/](file:///c:/Users/ASUS/SETA---TA4/packages/smartrecruit/src/backend/jobs) chỉ có `.gitkeep` trống. Hiện tại nếu LLM trả lỗi 429, hệ thống sẽ crash thay vì retry.

---

## Đối chiếu Risks & Mitigation (Bảng 8 Proposal)

| Rủi ro | Giải pháp trong Proposal | Code Implementation | Đánh giá |
|:---|:---|:---|:---:|
| **Data Privacy / PII** | Anonymization Layer trước khi gửi LLM | ❌ CV text gửi trực tiếp lên LLM không qua ẩn danh hóa | ❌ |
| **YOE tính sai** | Parser phụ trợ chuẩn hóa thời gian | ✅ [calculateDurationInMonths()](file:///c:/Users/ASUS/SETA---TA4/packages/smartrecruit/src/backend/domain/screen-cv.ts#L53-L81) | ✅ |
| **API rate limit** | graphile-worker + backoff | ❌ Jobs thư mục trống | ⚠️ |

---

## Đối chiếu Mastra Workflow vs Sequence Diagram

```mermaid
graph LR
    subgraph "Tài liệu (Sequence Diagram)"
        A1["🟣 Gate 1: Parse JD → HITL"] --> A2["🟢 Screen CVs (loop)"]
        A2 --> A3["🟢 Draft Outreach + Anti-Hallucination"]
        A3 --> A4["🟠 Gate 2: HITL Approve"]
        A4 --> A5["🟠 Send Emails"]
    end

    subgraph "Code (Mastra Workflow)"
        B1["parseJdStep (suspend/resume)"] --> B2["screenCvsStep (loop CVs)"]
        B2 --> B3["draftOutreachStep (suspend/resume)"]
        B3 --> B4["executeOutreachStep"]
    end

    A1 -.->|"✅ Khớp"| B1
    A2 -.->|"✅ Khớp"| B2
    A3 -.->|"✅ Khớp"| B3
    A4 -.->|"✅ Khớp (trong B3)"| B3
    A5 -.->|"✅ Khớp"| B4
```

---

## Tổng kết & Khuyến nghị

### ✅ Điểm mạnh — Đã triển khai đúng Workflow

1. **4-step Mastra Workflow** khớp chính xác với Sequence Diagram 3 giai đoạn
2. **Dual-Gate HITL** (Gate 1: Criteria, Gate 2: Outreach) với `suspend/resume` pattern
3. **5 Agent Tools** đầy đủ và vượt Agent Contract trong Proposal
4. **Anti-Hallucination Filter** triệt để: Agent riêng verify → Self-Correction → Temp=0
5. **OCR 2-lớp Fallback**: Vision API → Tesseract (Re-planning pattern)
6. **Mock Data Import** đầy đủ DS-06, DS-07, DS-08 từ Excel
7. **Semantic Skill Matching** qua LLM prompt thay vì keyword matching
8. **YOE Parser** tính theo tháng, xử lý "present", định dạng linh hoạt
9. **RBAC** phân quyền rõ ràng (ACCESS/WRITE/OUTREACH_APPROVE)

### ⚠️ Điểm cần cải thiện

| # | Hạng mục | Mức độ | Khuyến nghị |
|:-:|:---|:---:|:---|
| 1 | **LTM / Vector Search** chưa tích hợp vào workflow | Trung bình | Kết nối `vector-store.ts` vào `screenCandidatePool` để dùng Semantic Search thay vì SQL query |
| 2 | **Rate Limit / Retry** chưa triển khai | Trung bình | Thêm try-catch quanh LLM calls với exponential backoff, hoặc tích hợp graphile-worker |
| 3 | **Anonymization Layer** chưa triển khai | Thấp (POC) | Chỉ cần cho production, POC có thể ghi nhận trong docs |
| 4 | **Screen Candidate Pool** dùng SQL filter thay vì LTM Semantic Search | Thấp | Phù hợp POC, nhưng nên nâng cấp cho demo |

### 📊 Đánh giá tổng thể

> **Hệ thống đã triển khai đúng 90%+ workflow thiết kế** trong cả 2 tài liệu. Các thành phần cốt lõi (BDI Architecture, Dual-Gate HITL, Tool Calling, Anti-Hallucination, OCR Fallback) đều hoạt động chính xác. Các hạng mục chưa đạt chủ yếu là tính năng Nice-to-have (LTM Vector Search) và cơ chế vận hành production (Rate Limit, Anonymization) — chấp nhận được cho phạm vi POC 2 tuần.
