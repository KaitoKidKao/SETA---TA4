# Kế hoạch và Phân chia công việc — Hackathon Team 4
---

## 👥 Phân vai trò & Giao việc (Role & Task Assignments)

### 👑 1. Nguyễn Trí Cao (Role: Team Lead / DevOps)
- **Nhiệm vụ chính:**
  - **Task 2:** Cấu hình biến môi trường và khóa bảo mật trên GitHub Fork.
  - **Task 3:** Kích hoạt deploy qua GitHub Actions lên máy chủ EC2 và thực hiện Reset/Seed DB.
- **Nhiệm vụ chung:** Tham gia **Task 1** (đọc hiểu code) và hỗ trợ **Task 6** (theo dõi hệ thống Jaeger, chuẩn bị demo).

### 💻 2. Nguyễn Đức Cường (Role: Backend Developer)
- **Nhiệm vụ chính:**
  - **Task 4:** Vận hành và đồng bộ dữ liệu Mock (DS-06, DS-07, DS-08) từ S3 của BTC về máy chủ EC2.
- **Nhiệm vụ chung:** Tham gia **Task 1** (đọc hiểu code backend), hỗ trợ **Task 5** (tinh chỉnh prompt nếu cần) và hỗ trợ **Task 6**.

### 🎨 3. Lê Minh Tuấn (Role: Frontend Developer)
- **Nhiệm vụ chính:**
  - Hỗ trợ giám sát tính ổn định của UI Dashboard trong quá trình kiểm thử kịch bản E2E.
- **Nhiệm vụ chung:** Tham gia **Task 1** (đọc hiểu code UI), hỗ trợ **Task 5** (kiểm tra giao diện duyệt Gate 1 & 2) và **Task 6** (quay video demo UI).

### 🔍 4. Đậu Văn Nam (Role: QA / Tester)
- **Nhiệm vụ chính:**
  - **Task 5:** Chạy thử nghiệm toàn bộ kịch bản đầu cuối (End-to-End Campaign), đánh giá chất lượng prompt của LLM và kiểm tra SMTP gửi thư.
- **Nhiệm vụ chung:** Tham gia **Task 1** (đọc hiểu luồng nghiệp vụ) và **Task 6** (giám sát Jaeger logs, tối ưu token).

---

## Danh sách công việc (Task Checklist)

### 🚀 Task 1: Đọc & Tìm hiểu mã nguồn dự án (Tất cả thành viên)
- [ ] **Mục tiêu:** Giúp toàn đội nắm bắt kiến trúc hệ thống, cách Mastra Workflows kết nối với Seta Core, và cách giao diện UI tương tác với API.
- [ ] **Nội dung cần tìm hiểu:**
  - **Database & Schema:** [packages/smartrecruit/src/backend/db/schema.ts](file:///c:/Users/ASUS/SETA---TA4/packages/smartrecruit/src/backend/db/schema.ts) (Cấu trúc các bảng `candidates`, `criteria`, `outreach_drafts`).
  - **Logic nghiệp vụ chính:**
    - [parse-jd.ts](file:///c:/Users/ASUS/SETA---TA4/packages/smartrecruit/src/backend/domain/parse-jd.ts): Cách LLM trích xuất kỹ năng từ JD thô.
    - [screen-cv.ts](file:///c:/Users/ASUS/SETA---TA4/packages/smartrecruit/src/backend/domain/screen-cv.ts): Giải thuật so khớp ngữ nghĩa và tính số năm kinh nghiệm (YOE).
    - [draft-outreach.ts](file:///c:/Users/ASUS/SETA---TA4/packages/smartrecruit/src/backend/domain/draft-outreach.ts): Cơ chế soạn thư và bộ lọc chống ảo giác (Adoption Filter).
  - **Mastra Workflows & Tools:** [packages/smartrecruit/src/backend/workflows/smartrecruit-workflow.ts](file:///c:/Users/ASUS/SETA---TA4/packages/smartrecruit/src/backend/workflows/smartrecruit-workflow.ts) (Luồng workflow 4 bước và cơ chế tạm dừng HITL).
  - **Frontend UI:** [smartrecruit-page.tsx](file:///c:/Users/ASUS/SETA---TA4/apps/web/src/modules/smartrecruit/pages/smartrecruit-page.tsx) (Cách quản lý tabs, gọi APIs bất đồng bộ qua `useCallback`, và render giao diện theo các bước Gate 1, Gate 2).
- [ ] **Kết quả:** Thành viên hiểu rõ cách luồng dữ liệu đi từ tệp tin tải lên, qua LLM, lưu vào DB và trả về giao diện.

---

### ⚙️ Task 2: Thiết lập môi trường Repository & CI/CD GitHub (DevOps/Lead)
- [ ] **Mục tiêu:** Cấu hình các biến môi trường và khóa bảo mật trên GitHub Fork để tự động hóa quy trình Deploy lên máy chủ EC2.
- [ ] **Nội dung thực hiện:**
  - Fork repository chính thức về tài khoản cá nhân hoặc tổ chức của đội.
  - Truy cập **Settings $\rightarrow$ Secrets and variables $\rightarrow$ Actions** của repo đã fork.
  - Điền đầy đủ 5 **Variables** (được lấy từ [AWS-CREDENTIALS.txt](file:///c:/Users/ASUS/SETA---TA4/AWS-CREDENTIALS.txt)):
    - `ECR_REGISTRY`
    - `ECR_REPOSITORY`
    - `APP_DOMAIN`
    - `EC2_HOST`
    - `EC2_USER`
  - Điền đầy đủ 4 **Secrets**:
    - `AWS_ECR_ACCESS_KEY_ID`
    - `AWS_ECR_SECRET_ACCESS_KEY`
    - `OPENAI_API_KEY`
    - `EC2_SSH_PRIVATE_KEY` (Nội dung của file khóa [team-4](file:///c:/Users/ASUS/SETA---TA4/team-4) bắt đầu bằng `-----BEGIN OPENSSH...`)
- [ ] **Kết quả:** GitHub Actions sẵn sàng chạy workflow deploy mà không gặp lỗi phân quyền.

---

### 🚢 Task 3: Triển khai ứng dụng lên EC2 & Seed Dữ liệu (DevOps/Lead)
- [ ] **Mục tiêu:** Đưa ứng dụng lên môi trường cloud thực tế và khởi tạo cơ sở dữ liệu ban đầu cho POC.
- [ ] **Nội dung thực hiện:**
  - Chạy workflow **`Hackathon — Release`** từ tab **Actions** trên GitHub để build và deploy ứng dụng lên máy chủ EC2.
  - Sau khi deploy thành công, chạy workflow **`Hackathon — DB Reset & Seed`** để dọn dẹp cơ sở dữ liệu và seed tài khoản demo.
  - Kiểm tra kết nối tới trang quản trị: `https://team-4-hackathon.seta-international.com`
  - Đăng nhập bằng tài khoản: `admin@hackathon.com` / `ChangeMe@2026`.
- [ ] **Kết quả:** Website chạy thành công, đăng nhập được vào màn hình Dashboard.

---

### 📊 Task 4: Vận hành và Đồng bộ dữ liệu Mock từ S3 (Backend/DevOps)
- [ ] **Mục tiêu:** Đồng bộ tập dữ liệu thô của BTC về máy chủ EC2 để chuẩn bị dữ liệu đầu vào cho quá trình demo.
- [ ] **Nội dung thực hiện:**
  - Sử dụng file khóa [team-4](file:///c:/Users/ASUS/SETA---TA4/team-4) để SSH vào máy chủ EC2:
    ```bash
    ssh -i team-4 team-4@54.179.152.174
    ```
  - Chạy lệnh AWS CLI để kiểm tra và đồng bộ thư mục dữ liệu mock của BTC từ S3 dùng chung về thư mục cục bộ của EC2:
    ```bash
    aws s3 ls s3://hackathon-shared-assets-033484686020/mock-data/
    aws s3 sync s3://hackathon-shared-assets-033484686020/mock-data/ ~/mock-data/
    ```
  - Lọc và phân loại các tệp mock data liên quan trực tiếp đến Use Case 4: `DS-06` (Danh sách CV), `DS-07` (Tiêu chí tuyển dụng), `DS-08` (Mẫu email).
- [ ] **Kết quả:** Thư mục `~/mock-data/` trên EC2 chứa đầy đủ tệp dữ liệu kiểm thử.

---

### 🧪 Task 5: Thử nghiệm kịch bản End-to-End & Tinh chỉnh Prompt (QA/Backend)
- [ ] **Mục tiêu:** Chạy thử nghiệm toàn bộ luồng nghiệp vụ trên giao diện đã deploy để tìm lỗi và tối ưu chất lượng AI.
- [ ] **Nội dung thực hiện:**
  - Tạo chiến dịch mới trên Dashboard: tải lên file JD và danh sách các CV mẫu lấy từ mock dataset.
  - **Kiểm thử Gate 1:** Kiểm tra kết quả trích xuất tiêu chí của AI. Thực hiện sửa đổi tiêu chí trên UI, bấm **Confirm** và quan sát sự thay đổi.
  - **Kiểm thử Sàng lọc CV:** Kiểm tra bảng xếp hạng Fit Score %, đọc chi tiết lý giải YOE, ưu điểm (Pros) và điểm thiếu sót (Gaps) xem có khớp với năng lực ứng viên không.
  - **Kiểm thử Gate 2:** Đánh giá nội dung email cá nhân hóa do AI soạn thảo. Kiểm tra xem bộ lọc chống ảo giác (Adoption Filter) có hoạt động đúng và sửa lại thư khi có thông tin sai lệch không. Thực hiện edit nội dung trực tiếp và bấm gửi.
  - Kiểm tra xem email có được gửi đi qua hệ thống SMTP Mailer giả lập/thực tế thành công hay không.
- [ ] **Kết quả:** Báo cáo thử nghiệm E2E không có lỗi nghiêm trọng, chất lượng phản hồi của LLM đạt độ chính xác cao.

---

### 📈 Task 6: Giám sát, Tối ưu hiệu năng & Trình bày POC (Tất cả thành viên)
- [ ] **Mục tiêu:** Chuẩn bị tài liệu thuyết trình, demo trực tiếp và tối ưu chi phí token.
- [ ] **Nội dung thực hiện:**
  - Truy cập Jaeger Traces tại `https://traces.team-4-hackathon.seta-international.com` (Đăng nhập BasicAuth bằng tài khoản thiết lập) để theo dõi các vết gọi API, thời gian xử lý của các bước.
  - Tối ưu hóa prompt trong code nếu thời gian phản hồi của OpenAI hoặc tỷ lệ lỗi token quá cao.
  - Quay video demo hoặc chuẩn bị kịch bản thuyết trình trực quan các bước Gate 1, Gate 2 và màn hình tổng quan chiến dịch thành công để trình bày trước Hội đồng giám khảo.
- [ ] **Kết quả:** Kịch bản demo hoàn hảo, chạy mượt mà, hệ thống ổn định và tối ưu.
