# Giải thích Chi tiết Quy trình Hoạt động của SmartRecruit Agent (Advanced BDI Workflow)

Tài liệu này giải thích chi tiết sơ đồ luồng công việc (Workflow Diagram) của **SmartRecruit Agent**, được thiết kế đặc biệt để bám sát các tiêu chuẩn khắt khe về **Kiến trúc Agentic (Agent Architecture & Design Maturity)**.

## 1. Tổng quan Kiến trúc (Architecture Overview)
Khác với các Chatbot thông thường (LLM Wrappers), hệ thống này được chia tách rõ ràng thành các thực thể độc lập, đảm bảo tính tự chủ và an toàn:
* **Agent Core (Não bộ trung tâm):** Nơi xử lý logic chính, bao gồm **BDI Planner** (lên kế hoạch dựa trên mục tiêu), **Tool Executor** (thực thi công cụ) và **Execution Gateway** (cổng kiểm duyệt an toàn tự động).
* **Memory Architecture (Hệ thống Bộ nhớ):** Tách biệt rõ ràng 3 lớp bộ nhớ:
  * *Short-term Memory (STM):* Lưu trữ yêu cầu ngắn hạn và phiên làm việc (chat/request) hiện tại.
  * *Working Memory (WM / Beliefs):* Lưu trữ các tiêu chí chấm điểm và kết quả tạm thời đang được xử lý.
  * *Long-term Memory (LTM / Vector DB):* Lưu trữ lịch sử ứng viên cũ, phục vụ cho tìm kiếm ngữ nghĩa (Semantic Search).
* **HITL (Human-in-the-Loop):** Sự tham gia của con người ở những chốt chặn quan trọng (Governed Boundary) để đảm bảo an toàn tuyệt đối.

---

## 2. Chi tiết Quy trình Hoạt động (Phase-by-Phase Execution)

### 🟣 Giai đoạn 1: Nạp Beliefs & Khởi tạo Desires (Thiết lập tiêu chí)
Giai đoạn này giúp Agent hiểu được nó cần tìm kiếm điều gì trước khi bắt đầu hành động.
1. **Khởi tạo:** Recruiter gửi yêu cầu (bao gồm JD và tập hồ sơ DS-06) vào *Short-term Memory*.
2. **Lên kế hoạch:** *BDI Planner* tiếp nhận yêu cầu, phân tích mục tiêu (Desires) và tạo ra kế hoạch (Intentions) là phải đọc hiểu JD này.
3. **Thực thi:** *Tool Executor* gọi công cụ `parse_jd_tool` để trích xuất các tiêu chí thô.
4. **Kiểm duyệt (Governed Boundary):** Tiêu chí không được dùng ngay mà phải đi qua *Execution Gateway*. Tại đây, hệ thống đẩy kết quả ra cổng *HITL Gate* để Recruiter kiểm tra, sửa đổi (nếu cần).
5. **Cập nhật Niềm tin (Beliefs):** Sau khi được người duyệt, bộ tiêu chí "chuẩn" mới được lưu vĩnh viễn vào *Working Memory (Beliefs)*. Hệ thống trả về tín hiệu **Feedback ✔ (Lưu thành công)**. Kể từ lúc này, Agent sẽ chỉ hoạt động dựa trên "niềm tin" này.

### 🟢 Giai đoạn 2: Vòng lặp Sàng lọc & Tái tương tác (Re-planning & Monitor)
Đây là chu trình tự quyết (Autonomy) của Agent, lặp lại cho từng ứng viên.
1. **Truy vấn Dữ liệu:** *BDI Planner* sử dụng *Long-term Memory* để tìm kiếm các ứng viên cũ đang ở trạng thái In-pool hoặc Rejected.
2. **Phân tích CV:** Agent gọi `screen_cv_tool` để chấm điểm Fit Score dựa trên Beliefs đã lưu ở Giai đoạn 1.
3. **Tự sửa lỗi (Re-planning / Monitor):** Nếu CV bị hỏng (format lỗi), thay vì báo lỗi và dừng lại, *Execution Gateway* báo cáo lại cho *Planner*. *Planner* lập tức "xoay trục" kế hoạch (Re-planning) bằng cách gọi công cụ dự phòng `OCR_Tool` để đọc ảnh CV. Nếu OCR cũng thất bại, hệ thống phát tín hiệu **Feedback ✖** để báo cáo lỗi.
4. **Hậu kiểm Ảo giác (Adoption Filter / Anti-hallucination):** 
   * Đối với các ứng viên phù hợp, Agent gọi `draft_outreach_tool` để soạn thư mời phỏng vấn.
   * Trước khi lưu lại, bức thư này phải đi qua chốt kiểm tra ảo giác của *Execution Gateway*. Hệ thống đối chiếu dữ liệu trong thư với CV gốc. Nếu phát hiện AI "bịa" thông tin (ảo giác), nó sẽ trả về **Feedback ✖**, từ chối kết quả và bắt *Planner* phải tạo lại với độ sáng tạo bằng 0 (`Temperature = 0`).
5. Nếu thư hợp lệ, bản nháp sẽ được lưu vào *Working Memory* kèm theo tín hiệu **Feedback ✔ (Lưu thành công)**.

### 🟠 Giai đoạn 3: Quyết định cuối cùng (Final Gateway)
AI không bao giờ tự đưa ra quyết định nhân sự cuối cùng.
1. **Trình duyệt:** Toàn bộ danh sách ứng viên (Shortlist) và thư nháp được đưa ra cổng kiểm duyệt cuối (*HITL Gate*).
2. **Quyết định của con người:** Recruiter đọc báo cáo, có quyền ghi đè (override) điểm số hoặc chỉnh sửa câu chữ trong email.
3. **Thực thi cuối:** Sau khi Recruiter nhấn duyệt, *Executor* mới tiến hành gửi email hàng loạt và lưu toàn bộ lịch sử tương tác vào *Long-term Memory* để phục vụ cho các chiến dịch tuyển dụng sau này.

---

## 3. Tại sao Workflow này được đánh giá xuất sắc (Wow Factor)?
Thiết kế này đáp ứng hoàn hảo tiêu chí "Agent Architecture & Design Maturity" của ban giám khảo:
* **Không phải LLM Wrapper:** Nó không chỉ gọi API của LLM rồi trả kết quả. Nó có Planner để lên kế hoạch, có Executor để chạy tool, và có Gateway để tự kiểm duyệt chính nó.
* **Tách biệt BDI rõ ràng:** Thể hiện rõ việc Beliefs (Tiêu chí đã duyệt) định hướng cho Intentions (Việc gọi Tool), và mọi thứ bám sát Desires (Mục tiêu tìm người giỏi).
* **Ranh giới an toàn (Governed Boundary):** LLM chỉ "đề xuất" (Generative), còn hệ thống kiến trúc và con người (Gateway, HITL) mới là người "quyết định" (Governed).
* **Khả năng tự phục hồi (Fault Tolerance):** Khả năng tự kích hoạt OCR khi file hỏng và tự bắt lỗi ảo giác trong email thể hiện sự trưởng thành và tính ứng dụng thực tế cực cao của hệ thống.
* **Luồng phản hồi tường minh (Commitment & Execution Monitors):** Khác với các hệ thống chạy "mù", mọi hành động của Agent (như lưu bộ nhớ, gọi công cụ) đều đi kèm luồng **Feedback (✔/✖)**. Điều này đáp ứng chính xác yêu cầu về *Execution Monitors* (Giám sát thực thi) và *Reconsideration Policies* (Chính sách xem xét lại khi có lỗi) của ban giám khảo.
