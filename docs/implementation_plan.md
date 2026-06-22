# Kế hoạch triển khai SmartRecruit Agent

Bản kế hoạch chi tiết để hiện thực hóa dự án **SmartRecruit Agent** (Use Case 4: Recruitment Screening & Shortlisting Agent) tích hợp vào nền tảng **Seta Agentic Platform** trong vòng 2 tuần (14 ngày).

---

## User Review Required

> [!IMPORTANT]
> **1. Lựa chọn LLM Model**
> *   Dựa theo cập nhật mới nhất trong file proposal [Proposal_Report.tex](file:///c:/Users/ASUS/SETA---TA4/docs/Proposal_Report.tex), hệ thống chuyển sang ưu tiên dùng **Google Gemini 3.0 Flash** (phối hợp Gemini 3.0 Pro cho tác vụ lập luận sâu).
> *   Chúng tôi sẽ cấu hình nhà cung cấp mặc định trong model registry của `@seta/agent` sử dụng mô hình Gemini, kết hợp khai báo biến môi trường `GEMINI_API_KEY`.
>
> **2. Tích hợp Dữ liệu Mock (DS-06, DS-07, DS-08)**
> *   Thay vì đọc file thô (.json / .csv) ở runtime, chúng tôi đề xuất import toàn bộ dữ liệu mẫu này vào các bảng cơ sở dữ liệu Postgres nằm trong schema `smartrecruit` ở bước Seeding. Điều này đảm bảo tính nhất quán dữ liệu của Seta (One Postgres, many schemas).

---

## Open Questions

> [!WARNING]
> **1. Kênh gửi Outreach thực tế**
> *   Trong POC, khi Recruiter bấm duyệt gửi ở Gate 2, hệ thống sẽ thực hiện gửi mail giả lập hay kết nối trực tiếp qua Mailer SMTP có sẵn của hệ thống Seta?
> *   *Đề xuất:* Sử dụng Mailer có sẵn của Seta gửi qua SMTP cấu hình trong `.env` để chứng minh tính hoàn chỉnh (End-to-End).
>
> **2. Tập dữ liệu CV đầu vào**
> *   Các CV ứng viên (`DS-06`) có file PDF đi kèm nằm ở thư mục nào để hệ thống thực hiện trích xuất text và lưu vector embeddings?

---

## Proposed Changes

Chúng tôi sẽ triển khai cấu trúc module `smartrecruit` tuân thủ nghiêm ngặt các ranh giới kiến trúc (dep-cruiser, schema-isolation) của hệ thống Seta:

### 1. Phân hệ Cơ sở dữ liệu & Cấu hình (Database & Configurations)

#### [NEW] [schema.ts](file:///c:/Users/ASUS/SETA---TA4/packages/smartrecruit/src/backend/db/schema.ts)
Định nghĩa schema Drizzle cho `smartrecruit`:
*   `smartrecruit.candidates`: Lưu danh sách ứng viên (đồng bộ từ `DS-06`).
*   `smartrecruit.criteria`: Lưu các bộ tiêu chí tuyển dụng (đồng bộ từ `DS-07` và cập nhật từ Gate 1).
*   `smartrecruit.outreach_templates`: Lưu mẫu thư (đồng bộ từ `DS-08`).
*   `smartrecruit.outreach_drafts`: Lưu thư nháp được sinh bởi Agent.
*   `smartrecruit.embeddings`: Lưu vector embeddings của CV ứng viên phục vụ Semantic Search.

#### [NEW] [drizzle.config.ts](file:///c:/Users/ASUS/SETA---TA4/packages/smartrecruit/drizzle.config.ts)
Cấu hình Drizzle generator giới hạn schema trong phạm vi `schemaFilter: ['smartrecruit']`.

---

### 2. Phân hệ Backend Logic & Agent Tools (Core Business Logic)

#### [NEW] [parse-jd.ts](file:///c:/Users/ASUS/SETA---TA4/packages/smartrecruit/src/backend/domain/parse-jd.ts)
*   Hàm nhận text JD thô, gọi LLM phân tích ngữ nghĩa, phân loại kỹ năng thành `must_have_skills`, `nice_to_have`, yêu cầu `yoe` (số năm kinh nghiệm), và trình độ học vấn.

#### [NEW] [screen-cv.ts](file:///c:/Users/ASUS/SETA---TA4/packages/smartrecruit/src/backend/domain/screen-cv.ts)
*   Đọc thông tin CV từ DB hoặc tệp tải lên.
*   Đối chiếu với bảng tiêu chí trong DB, tính điểm `% Fit Score` dựa trên lập luận ngữ nghĩa (ví dụ: `MySQL` khớp với `SQL`).
*   Tính toán số năm kinh nghiệm dựa trên các mốc thời gian trong lịch sử làm việc (chuẩn hóa về tháng).
*   Trả về báo cáo chi tiết: Điểm mạnh (Pros) & Điểm thiếu hụt (Gaps) của ứng viên.

#### [NEW] [draft-outreach.ts](file:///c:/Users/ASUS/SETA---TA4/packages/smartrecruit/src/backend/domain/draft-outreach.ts)
*   Bốc mẫu email từ bảng templates dựa trên nguồn ứng viên (`TopCV`, `LinkedIn`, v.v.).
*   Gọi LLM điền các placeholder và lồng ghép dự án, công ty cũ nổi bật.
*   **Adoption Filter:** Một hàm hậu kiểm độc lập trích xuất các thông tin dự án/công ty cũ xuất hiện trong thư nháp, đối chiếu với CV thô. Nếu phát hiện sai lệch (ảo giác), ném lỗi và kích hoạt quy trình tự động sửa đổi (Self-Correction): hạ Temperature về 0, bổ sung chỉ thị nghiêm ngặt vào Prompt và chạy lại tối đa 2 lần.

#### [NEW] [agent-tools.ts](file:///c:/Users/ASUS/SETA---TA4/packages/smartrecruit/src/backend/agent-tools.ts)
Khai báo các tool của Agent sử dụng helper `defineAgentTool` kết hợp kiểm tra phân quyền RBAC và cấu hình HITL:
*   `smartrecruit_parseJd`: Chấm điểm/parse JD (Write Tool, yêu cầu duyệt Gate 1).
*   `smartrecruit_screenCv`: Phân tích hồ sơ CV (Read Tool).
*   `smartrecruit_draftOutreach`: Soạn email tiếp cận (Write Tool, yêu cầu duyệt Gate 2).
*   `smartrecruit_ocrBackup`: OCR dự phòng cho tệp tin hỏng.

#### [NEW] [smartrecruit-workflow.ts](file:///c:/Users/ASUS/SETA---TA4/packages/smartrecruit/src/backend/workflows/smartrecruit-workflow.ts)
Xây dựng luồng công việc tự quyết dựa trên **Mastra Workflows**:
1.  **Step 1:** `parseJd` $\rightarrow$ Tạm dừng (Suspend) chờ duyệt Gate 1.
2.  **Step 2:** `screenCv` cho toàn bộ danh sách CV $\rightarrow$ Tạo Shortlist Report.
3.  **Step 3:** `draftOutreach` cho các ứng viên đủ điều kiện Re-engage $\rightarrow$ Chạy Adoption Filter chống ảo giác $\rightarrow$ Tạm dừng (Suspend) chờ duyệt Gate 2.
4.  **Step 4:** `executeOutreach` (Gửi mail) $\rightarrow$ Cập nhật trạng thái ứng viên thành `Outreached` $\rightarrow$ Ghi nhận lịch sử tương tác vào Long-term Memory.

#### [NEW] [register.ts](file:///c:/Users/ASUS/SETA---TA4/packages/smartrecruit/src/register.ts)
Đăng ký các thành phần trên vào `ContributionRegistry` của hệ thống để tự động nạp khi server boot.

---

### 3. Phân hệ Frontend (Next.js Dashboard Companion)

#### [NEW] [manifest.ts](file:///c:/Users/ASUS/SETA---TA4/apps/web/src/modules/smartrecruit/manifest.ts)
Đăng ký menu `SmartRecruit` vào Sidebar của App Shell, chỉ hiển thị nếu người dùng có quyền `smartrecruit.access`.

#### [NEW] [dashboard-page.tsx](file:///c:/Users/ASUS/SETA---TA4/apps/web/src/modules/smartrecruit/pages/dashboard-page.tsx)
Giao diện quản trị tuyển dụng tích hợp:
1.  **Vùng Tải lên:** Hộp kéo thả file JD và danh sách CV ứng viên.
2.  **HITL Gate 1 Component:** Panel hiển thị các tiêu chí sàng lọc (Kỹ năng bắt buộc, YOE...) sau khi Agent parse JD thô. Cho phép Recruiter thêm/bớt/sửa đổi tiêu chí trực tiếp rồi bấm "Confirm Criteria".
3.  **Bảng Xếp hạng & Điểm số (Scorecard):** Hiển thị danh sách ứng viên xếp hạng theo % Fit Score, click vào từng dòng để hiển thị Panel chi tiết: Ưu điểm (Pros), Điểm thiếu hụt (Gaps), và Bản phân tích YOE ngữ nghĩa.
4.  **HITL Gate 2 Component (Email Workspace):** Hiển thị danh sách email nháp tương ứng với ứng viên. Recruiter có thể chỉnh sửa nội dung thư trực tiếp trong Rich Text Editor và bấm "Approve & Send" để gửi đi.

---

### 4. Đăng ký & Tích hợp vào Gateway

#### [MODIFY] [index.ts](file:///c:/Users/ASUS/SETA---TA4/apps/server/src/index.ts)
*   Import `registerSmartRecruitContributions` và gọi đăng ký module.
*   Cấu hình HITL Deciders cho tool `smartrecruit_draftOutreach` và `smartrecruit_parseJd`.

#### [MODIFY] [index.ts](file:///c:/Users/ASUS/SETA---TA4/apps/worker/src/index.ts)
*   Import đăng ký module để worker có thể xử lý các tác vụ gửi email bất đồng bộ và tạo embeddings nền.

---

## Verification Plan

### Automated Tests
Chúng tôi sẽ xây dựng các kịch bản kiểm thử tích hợp thực tế với cơ sở dữ liệu Postgres (thông qua `testcontainers` trong `packages/smartrecruit/tests/integration/`):
1.  **Happy Path:** Chạy luồng trích xuất JD $\rightarrow$ chấm điểm CV chuẩn $\rightarrow$ sinh email nháp hợp lệ $\rightarrow$ hoàn thành.
2.  **Tool Failure Fallback:** Tải lên tệp tin CV bị hỏng để đảm bảo Agent tự động gọi `ocr_backup_tool` thành công.
3.  **Anti-Hallucination Gate Test:** Chèn dữ liệu dự án sai vào prompt soạn thư để xác minh Adoption Filter phát hiện lỗi ảo giác, tự động hạ nhiệt độ LLM và soạn lại thư chính xác.
4.  **Rate Limit Test:** Giả lập lỗi HTTP 429 để kiểm tra hàng đợi Celery/bất đồng bộ kích hoạt cơ chế retry với exponential backoff & jitter.

### Manual Verification
1.  **Kiểm tra giao diện:** Triển khai chạy server cục bộ, đăng nhập tài khoản Recruiter, kéo thả file JD, thực thi bước Gate 1, kiểm tra bảng điểm so khớp ngữ nghĩa, biên tập và duyệt gửi mail ở Gate 2.
2.  **Đo đạc hiệu suất:** Kiểm tra thời gian phản hồi (p95) khi chạy đồng thời 20 CV, kiểm tra độ khớp ngữ nghĩa của điểm số so với đánh giá chuyên môn thủ công của TA.
