# Kế hoạch Triển khai Cải tiến Phân hệ SmartRecruit

Tài liệu này trình bày kế hoạch nâng cấp và hoàn thiện phân hệ **SmartRecruit** nhằm đạt 100% mục tiêu thiết kế và giải quyết các điểm hạn chế đã chỉ ra trong Báo cáo Đối chiếu (Audit Report).

---

## 1. Các hạng mục cải tiến chính

### 1.1. Tích hợp LTM (Vector Search) cho Candidate Pool
*   **Vấn đề:** Việc lọc ứng viên cũ trong [screen-candidate-pool.ts](file:///c:/Users/ASUS/SETA---TA4/packages/smartrecruit/src/backend/domain/screen-candidate-pool.ts) hiện tại đang tải toàn bộ dữ liệu từ SQL rồi filter bằng Javascript, chưa dùng đến cơ chế Semantic Search (Tìm kiếm ngữ nghĩa) thông qua vector embeddings đã định nghĩa trong `vector-store.ts`.
*   **Giải pháp:**
    1.  **Sinh & Lưu Vector khi nạp dữ liệu:**
        - Cập nhật quy trình import mock data ([import-mock-data.ts](file:///c:/Users/ASUS/SETA---TA4/packages/smartrecruit/src/backend/domain/import-mock-data.ts)) và luồng chấm điểm CV mới ([screen-cv.ts](file:///c:/Users/ASUS/SETA---TA4/packages/smartrecruit/src/backend/domain/screen-cv.ts)).
        - Khi có CV mới hoặc cập nhật CV, sinh vector embedding 1536 chiều cho `cv_text` bằng OpenAI/Gemini Embeddings.
        - Lưu vector vào PgVector Store sử dụng `candidate_cv_embeddings` index.
    2.  **Truy vấn Tìm kiếm Ngữ nghĩa:**
        - Cập nhật hàm `screenCandidatePool`.
        - Sinh vector embedding cho yêu cầu công việc (trích xuất từ JD hoặc kỹ năng của `criteria`).
        - Dùng `pgVector.query` để tìm kiếm Top K ứng viên có độ tương đồng Cosine cao nhất, sau đó mới thực hiện sàng lọc chi tiết.

### 1.2. Cơ chế xử lý Rate Limit (HTTP 429) & Tự động Retry
*   **Vấn đề:** Khi gửi hàng loạt request chấm điểm CV hoặc soạn thư tiếp cận đến API LLM, hệ thống dễ gặp lỗi quá tải tần suất (HTTP 429).
*   **Giải pháp:**
    - Xây dựng một utility wrapper `withRetry` hỗ trợ cấu hình:
        - Số lần thử lại tối đa (Max Retries: 3).
        - Exponential Backoff: Thời gian chờ tăng dần theo cấp số nhân (ví dụ: $1s \rightarrow 2s \rightarrow 4s$).
        - Jitter ngẫu nhiên: Tránh việc các luồng gửi lại request cùng một thời điểm gây ra bão request mới.
    - Áp dụng wrapper này xung quanh các hàm gọi LLM (`agent.generate`) trong:
        - `parseJd` (JD Parser)
        - `screenCv` (CV Screening)
        - `draftOutreach` & `verifyDraft` (Outreach & Anti-Hallucination)

### 1.3. Lớp ẩn danh thông tin cá nhân (PII Anonymization Layer)
*   **Vấn đề:** Gửi trực tiếp văn bản CV chứa thông tin cá nhân nhạy cảm (Tên, Email, Số điện thoại, địa chỉ nhà, liên kết mạng xã hội) lên LLM bên thứ ba tiềm ẩn rủi ro bảo mật dữ liệu.
*   **Giải pháp:**
    - Xây dựng module `anonymize.ts` chứa hai hàm chính:
        - `anonymizeCvText(text)`: Sử dụng Regex để quét và thay thế các thông tin nhạy cảm thành các token ẩn danh (ví dụ: `[EMAIL_1]`, `[PHONE_1]`, `[CANDIDATE_NAME]`).
        - `deAnonymizeText(anonymizedText, mapping)`: Khôi phục lại thông tin gốc từ các token ẩn danh khi sinh email nháp (Outreach Draft) để gửi đi.
    - Tích hợp lớp ẩn danh này vào trước khi gửi dữ liệu CV lên LLM chấm điểm.

---

## 2. Đề xuất Thay đổi chi tiết (Proposed Changes)

### Component: Backend Domain & Utilities

#### [NEW] [retry.ts](file:///c:/Users/ASUS/SETA---TA4/packages/smartrecruit/src/backend/domain/retry.ts)
*   Triển khai helper `withRetry` thực hiện Exponential Backoff với Jitter.
*   Nhận diện mã lỗi `429` (Rate limit) hoặc `Too Many Requests` để tiến hành retry tự động.

#### [NEW] [anonymize.ts](file:///c:/Users/ASUS/SETA---TA4/packages/smartrecruit/src/backend/domain/anonymize.ts)
*   Triển khai bộ lọc Regex để ẩn danh hóa các thông tin nhạy cảm:
    - Email, Số điện thoại.
    - URL (GitHub, LinkedIn).
    - Tên ứng viên.
*   Hàm khôi phục (de-anonymize) để chuẩn bị email outreach hoàn chỉnh.

#### [MODIFY] [import-mock-data.ts](file:///c:/Users/ASUS/SETA---TA4/packages/smartrecruit/src/backend/domain/import-mock-data.ts)
*   Sau khi import ứng viên thành công từ file mock Excel, tiến hành sinh vector embedding cho `cv_text` và insert vào PgVector Store.

#### [MODIFY] [screen-cv.ts](file:///c:/Users/ASUS/SETA---TA4/packages/smartrecruit/src/backend/domain/screen-cv.ts)
*   Áp dụng `anonymizeCvText` cho CV trước khi gửi sang LLM chấm điểm.
*   Lồng `withRetry` xung quanh các lệnh gọi `agent.generate`.
*   Sau khi lưu thông tin ứng viên mới vào DB, sinh vector embedding và cập nhật vào PgVector Store.

#### [MODIFY] [screen-candidate-pool.ts](file:///c:/Users/ASUS/SETA---TA4/packages/smartrecruit/src/backend/domain/screen-candidate-pool.ts)
*   Thay đổi luồng tìm kiếm ứng viên:
    1. Sinh embedding cho criteria của JD.
    2. Gọi `pgVector.query` để tìm Top ứng viên phù hợp ngữ nghĩa.
    3. Thực hiện chấm điểm chi tiết trên nhóm ứng viên này.

#### [MODIFY] [draft-outreach.ts](file:///c:/Users/ASUS/SETA---TA4/packages/smartrecruit/src/backend/domain/draft-outreach.ts)
*   Áp dụng `withRetry` cho LLM soạn thư và LLM kiểm tra chống ảo giác.
*   De-anonymize email nháp trước khi lưu vào DB hoặc hiển thị ở Gate 2.

---

## 3. Kế hoạch xác minh (Verification Plan)

### Kiểm thử Tự động (Automated Tests)
*   **LTM Vector Search Test:**
    - Insert 5 ứng viên mẫu với các kỹ năng khác nhau.
    - Gọi `screenCandidatePool` với JD yêu cầu kỹ năng cụ thể (ví dụ: "React & TypeScript").
    - Xác minh Top ứng viên trả về từ Vector Store chính xác là ứng viên có kỹ năng tương ứng.
*   **Rate Limit Jitter & Retry Test:**
    - Cập nhật test case 4 trong `smartrecruit.test.ts` để kiểm tra khả năng tự phục hồi của `withRetry` khi giả lập lỗi 429 liên tiếp 2 lần.
*   **PII Anonymization Test:**
    - Viết unit test cho `anonymize.ts` để đảm bảo:
        - Email và Số điện thoại bị xóa khỏi text CV.
        - De-anonymize khôi phục chính xác các placeholder trong email soạn sẵn.

### Chạy các lệnh kiểm thử:
```bash
pnpm --filter @seta/smartrecruit test
```
