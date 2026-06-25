# Kịch bản Slide Thuyết trình Dự án: SmartRecruit
## Giải pháp Tuyển dụng IT Thông minh, Bảo mật & Tin cậy bằng AI Agent

Tài liệu này đóng vai trò là kịch bản slide thuyết trình và hướng dẫn trình bày (Presentation Guide) của Team 4 tại buổi Demo SETA Hackathon 2026.

---

## Slide 1: Trang bìa (Title Slide)
* **Tiêu đề lớn:** **SMARTRECRUIT**
* **Tiêu đề phụ:** Hệ thống Tuyển dụng IT govern-agent: Sàng lọc CV, Phân tích Kỹ năng & Tiếp cận Ứng viên Thông minh
* **Thông tin nhóm:** Team 4
* **Hình ảnh minh họa ý tưởng:** Sơ đồ kết nối giữa Recruiter và ứng viên thông qua một AI Agent trợ lý thông minh.
* **Lời thoại người thuyết trình:**
  > *"Kính chào ban giám khảo và các quý vị khán giả. Chúng tôi là Team 4. Hôm nay, chúng tôi rất tự hào được giới thiệu SmartRecruit - giải pháp toàn diện giúp chuyển đổi quy trình tuyển dụng IT từ thủ công sang tự động hóa có kiểm soát bằng AI Agent."*

---

## Slide 2: Bài toán & Nỗi đau thị trường (The Problem & Pain Points)
* **Các điểm chính:**
  * ❌ **Quá tải CV thô:** Lọc thủ công hàng trăm CV mỗi ngày mất nhiều thời gian, dễ bỏ sót ứng viên tốt.
  * ❌ **Rò rỉ dữ liệu cá nhân (PII):** Gửi trực tiếp CV của ứng viên lên các mô hình LLM công cộng (như OpenAI, Gemini) vi phạm chính sách bảo mật dữ liệu.
  * ❌ **Ảo giác AI (Hallucination):** AI soạn email tiếp cận tự động hay bị bịa đặt dự án hoặc kỹ năng không có thật trong CV.
  * ❌ **Bất đồng bộ & Timeout:** Hệ thống gặp lỗi hoặc đứng im khi xử lý dữ liệu lớn (upload nhiều CV cùng lúc).
* **Lời thoại người thuyết trình:**
  > *"Quy trình tuyển dụng nhân sự IT hiện tại đang đối mặt với 3 thách thức lớn: Thứ nhất là hiệu suất lọc CV thô quá thấp. Thứ hai là rủi ro bảo mật thông tin cá nhân cực kỳ cao khi đưa CV lên AI. Và thứ ba là chất lượng email viết tự động của AI thường xuyên bị lỗi ảo giác, nói sai kinh nghiệm của ứng viên gây mất uy tín cho doanh nghiệp."*

---

## Slide 3: Giải pháp SmartRecruit (The Solution)
* **Các điểm chính:**
  * **Dual-Gate HITL Workflow:** Quy trình tự động hóa khép kín nhưng được kiểm soát bởi con người ở 2 cổng duyệt quan trọng (duyệt tiêu chí lọc và duyệt nội dung email).
  * **Anonymization Layer (Lớp ẩn danh PII):** Tự động che thông tin nhạy cảm trước khi xử lý bằng LLM.
  * **Adoption Filter (Bộ lọc chống ảo giác):** Cơ chế tự sửa sai (self-correction) để bảo đảm thư gửi đi hoàn toàn chính xác.
  * **Asynchronous Campaign Execution:** Xử lý hàng đợi bất đồng bộ quy mô lớn cho từng chiến dịch cụ thể.
* **Lời thoại người thuyết trình:**
  > *"SmartRecruit giải quyết triệt để các vấn đề trên. Đây là hệ thống govern-agent kết hợp Dual-Gate Human-in-the-Loop, giúp quy trình chạy tự động 24/7 nhưng nhà tuyển dụng luôn nắm quyền kiểm soát tối cao ở các điểm nút quan trọng."*

---

## Slide 4: Kiến trúc hệ thống & Luồng Nghiệp vụ (Architecture & Workflow)
* **Sơ đồ quy trình (Mermaid Diagram):**
  ```mermaid
  flowchart TD
      A[Nhập JD + Upload CVs] --> B(Step 1: parseJd)
      B --> C{GATE 1: Confirm Criteria}
      C -->|Recruiter Duyệt| D(Step 2: screenCv - Dịch OCR + Tính YOE + Gợi ý CV từ DB)
      D --> E(Step 3: draftOutreach - LLM + Adoption Filter)
      E --> F{GATE 2: Approve Outreach}
      F -->|Recruiter Duyệt| G(Step 4: executeOutreach - Gửi SMTP)
  ```
* **Lời thoại người thuyết trình:**
  > *"Đây là luồng hoạt động của SmartRecruit được điều phối bởi Mastra Workflow Engine. Giai đoạn 1 dừng lại ở Gate 1 để duyệt tiêu chí lọc JD. Giai đoạn 2 sàng lọc CV kết hợp so khớp ngữ nghĩa, tính số năm kinh nghiệm YOE và gợi ý ứng viên phù hợp từ kho dữ liệu cũ. Cuối cùng, Gate 2 dừng lại để duyệt email tiếp cận trước khi chính thức gửi đi qua giao thức SMTP."*

---

## Slide 5: Điểm sáng Công nghệ - Lớp Bảo mật & Chống ảo giác (Core Tech Innovations)
* **Nội dung nổi bật:**
  1. **Bảo mật PII nội bộ (Local PII Anonymization):**
     * Masking các trường dữ liệu nhạy cảm (Tên, Email, Điện thoại, Links) cục bộ bằng regex/quy tắc trước khi gọi LLM.
     * Lưu trữ bản đồ ánh xạ (`piiMapping`) an toàn để de-anonymize lại khi gửi thư.
     * Tách biệt hoàn toàn thông tin định danh khỏi PgVector database.
  2. **Adoption Filter chống ảo giác:**
     * Thuật toán tự động đối chiếu thông tin email đã soạn thảo với CV gốc của ứng viên.
     * Phát hiện lệch kỹ năng/dự án → tự động hạ temperature của mô hình, gửi chỉ thị điều chỉnh nghiêm ngặt và yêu cầu LLM viết lại (tối đa 2 lần).
* **Lời thoại người thuyết trình:**
  > *"Chúng tôi tập trung vào 2 điểm sáng công nghệ đột phá. Lớp bảo mật PII hoạt động hoàn toàn cục bộ, bảo vệ danh tính ứng viên trước các mô hình đám mây. Đồng thời, công cụ Adoption Filter đóng vai trò như một biên tập viên kiểm tra chéo, loại bỏ hoàn toàn các claim sai lệch hoặc bịa đặt trước khi gửi thư đến ứng viên."*

---

## Slide 6: Hỗ trợ quyết định & Chuẩn hóa dữ liệu (Decision Support Features)
* **Nội dung nổi bật:**
  * **Phân tích khoảng trống kỹ năng (Skill Gap Analysis):** Đối chiếu hồ sơ ứng viên với ma trận kỹ năng hiện tại của dự án (`Team Skills Matrix`) để phát hiện thiếu hụt kỹ năng và đưa ra khuyến nghị điểm số.
  * **Giám sát SLA HM Feedback:** Theo dõi và hiển thị thời gian phản hồi của Hiring Manager đối với từng chiến dịch, cảnh báo nếu vượt quá 48 giờ để kịp thời gửi nhắc nhở.
  * **Chuẩn hóa dữ liệu:** Tự động chuẩn hóa dữ liệu đầu vào không đồng nhất (như quy đổi trình độ tiếng Anh sang chuẩn CEFR B2/C1, chuẩn hóa trạng thái và logic Yes/No).
* **Lời thoại người thuyết trình:**
  > *"SmartRecruit không chỉ là công cụ sàng lọc, mà là một hệ thống hỗ trợ ra quyết định. Chúng tôi tích hợp tính năng phân tích khoảng trống kỹ năng của đội nhóm để đánh giá độ tương thích thực tế của ứng viên và bảng SLA Tracker để đôn đốc Hiring Manager phản hồi, tối ưu hóa toàn bộ phễu tuyển dụng."*

---

## Slide 7: Công nghệ & Vận hành (Tech Stack & Operations)
* **Chi tiết Stack:**
  * **Frontend:** React 19, Vite, TanStack Router, Tailwind CSS 4, shadcn/ui.
  * **Backend:** Hono Framework, Mastra SDK (v1.37), Postgres với extension **pgvector**.
  * **Background Jobs:** Graphile Worker (xử lý bất đồng bộ tránh nghẽn luồng).
  * **Ops & Tracing:** Deploy dạng Docker Container trên EC2, giám sát chi tiết hiệu năng và lượt chạy thử của các Agent qua hệ thống trace Jaeger (OpenTelemetry).
* **Lời thoại người thuyết trình:**
  > *"Về mặt kỹ thuật, hệ thống sử dụng React 19 và Hono Framework hiện đại. Đặc biệt, để ứng dụng đạt chuẩn production, chúng tôi đưa toàn bộ các tác vụ nặng xuống Graphile Worker chạy ngầm và cấu hình Jaeger Tracing để theo dõi thời gian phản hồi của từng API và LLM agent."*

---

## Slide 8: Kết quả đạt được & Định hướng phát triển (Achievements & Roadmap)
* **Kết quả hiện tại:**
  * ✅ Luồng chạy mượt mà end-to-end, giải quyết triệt để lỗi 500 khi phê duyệt Gate 2.
  * ✅ Khóa nút Launch thông minh khi CV đang trích xuất giúp nâng cao trải nghiệm người dùng.
  * ✅ Tích hợp kiểm thử tích hợp (9/9 integration tests chạy pass).
* **Định hướng tiếp theo:**
  * 🚀 Mở rộng khả năng xử lý định dạng file (Docx, OCR từ hình ảnh ứng viên).
  * 🚀 Tích hợp thêm các kênh tiếp cận khác ngoài Email như LinkedIn, Zalo.
* **Lời thoại người thuyết trình:**
  > *"Hiện nay, sản phẩm đã hoàn thiện 100% các tính năng cốt lõi và các kịch bản kiểm thử tự động đều đã vượt qua thành công. Định hướng tiếp theo của SmartRecruit là mở rộng đa kênh giao tiếp và hoàn thiện mô hình OCR ngoại tuyến để tối ưu chi phí vận hành."*

---

## Slide 9: Kết luận & Hỏi đáp (Q&A)
* **Thông tin trên slide:**
  * Cảm ơn Ban giám khảo và mọi người đã lắng nghe!
  * **SmartRecruit - Tuyển dụng thông minh, Bảo mật vững vàng**
  * Q&A Session
* **Lời thoại người thuyết trình:**
  > *"Đó là toàn bộ phần trình bày của Team 4 về giải pháp SmartRecruit. Chúng tôi rất mong nhận được câu hỏi và ý kiến đóng góp từ Ban giám khảo để hoàn thiện sản phẩm hơn nữa. Xin chân thành cảm ơn!"*
