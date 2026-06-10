# Tài Liệu Thiết Kế Cơ Sở Dữ Liệu - SmartRecruit Agent

Hệ thống **SmartRecruit Agent** được thiết kế sử dụng kiến trúc **Cơ sở dữ liệu lai (Hybrid Database Architecture)**:
1.  **Cơ sở dữ liệu quan hệ (Relational Database - PostgreSQL hoặc SQLite):** Chịu trách nhiệm lưu trữ dữ liệu nghiệp vụ có cấu trúc, quản lý trạng thái ứng viên, kết quả chấm điểm (Scorecard) và lịch sử phê duyệt của con người (HITL Logs). Đảm bảo tính nhất quán (ACID).
2.  **Cơ sở dữ liệu Vector (Vector Database - ChromaDB hoặc pgvector):** Chịu trách nhiệm lưu trữ embeddings của kỹ năng và thông tin kinh nghiệm bóc tách từ CV để phục vụ tìm kiếm ngữ nghĩa (Semantic Search) cho chiến dịch tái tương tác.

---

## 1. Sơ đồ Quan hệ Thực thể (Entity Relationship Diagram - ERD)

![alt text](schema_database.png)

---

## 2. Chi Tiết Các Bảng Dữ Liệu (SQL Relational Schema)

### 2.1 Bảng `candidates` (Quản lý hồ sơ ứng viên)
Bảng này ánh xạ trực tiếp từ tệp `DS-06`.

| Tên trường | Kiểu dữ liệu | Ràng buộc | Mô tả |
| :--- | :--- | :--- | :--- |
| `id` | `VARCHAR(50)` | `PRIMARY KEY` | Mã ứng viên (Ví dụ: CAND-1001) |
| `full_name` | `VARCHAR(100)` | `NOT NULL` | Họ và tên ứng viên |
| `email` | `VARCHAR(100)` | `NOT NULL, UNIQUE` | Địa chỉ email của ứng viên |
| `phone` | `VARCHAR(20)` | `NOT NULL` | Số điện thoại liên hệ |
| `applied_position`| `VARCHAR(100)` | `NOT NULL` | Vị trí ứng tuyển ban đầu |
| `cv_skills` | `TEXT` | `NOT NULL` | Chuỗi kỹ năng trích từ CV (phục vụ search thô) |
| `salary_expectation`| `VARCHAR(50)` | `NULL` | Mức lương mong muốn |
| `status` | `VARCHAR(30)` | `NOT NULL` | Trạng thái (`Passed`, `In-pool`, `Rejected`, `Re-engaged`) |
| `source` | `VARCHAR(50)` | `NOT NULL` | Kênh ứng tuyển (`LinkedIn`, `TopCV`, `Email`, v.v.) |
| `created_at` | `TIMESTAMP` | `DEFAULT CURRENT_TIMESTAMP`| Thời gian tạo bản ghi |
| `updated_at` | `TIMESTAMP` | `DEFAULT CURRENT_TIMESTAMP`| Thời gian cập nhật trạng thái gần nhất |

*   **Chỉ mục (Indexes):**
    *   Index trên cột `status` để hỗ trợ lọc ứng viên `In-pool` / `Rejected` nhanh chóng.
    *   Index trên cột `applied_position` để tối ưu truy vấn vị trí ứng tuyển.

---

### 2.2 Bảng `screening_criteria` (Tiêu chí tuyển dụng)
Bảng này ánh xạ từ tệp `DS-07` và được phê duyệt thông qua **HITL Gate 1**.

| Tên trường | Kiểu dữ liệu | Ràng buộc | Mô tả |
| :--- | :--- | :--- | :--- |
| `id` | `VARCHAR(50)` | `PRIMARY KEY` | Mã bộ tiêu chí (Ví dụ: SCR-BE-001) |
| `position` | `VARCHAR(100)` | `NOT NULL` | Vị trí tuyển dụng áp dụng |
| `must_have_skills`| `JSONB` (hoặc `TEXT`)| `NOT NULL` | Mảng JSON các kỹ năng bắt buộc |
| `nice_to_have` | `JSONB` (hoặc `TEXT`)| `NOT NULL` | Mảng JSON các kỹ năng khuyến khích |
| `yoe_required` | `INT` | `DEFAULT 0` | Số năm kinh nghiệm tối thiểu yêu cầu |
| `created_at` | `TIMESTAMP` | `DEFAULT CURRENT_TIMESTAMP`| Thời gian tạo tiêu chí |

---

### 2.3 Bảng `screening_results` (Scorecard đánh giá chi tiết)
Lưu trữ bảng điểm đánh giá của từng ứng viên đối sánh với bộ tiêu chí cụ thể.

| Tên trường | Kiểu dữ liệu | Ràng buộc | Mô tả |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` / `VARCHAR(50)`| `PRIMARY KEY` | Khóa chính tự sinh |
| `candidate_id` | `VARCHAR(50)` | `FOREIGN KEY` | Khóa ngoại liên kết tới bảng `candidates` |
| `criteria_id` | `VARCHAR(50)` | `FOREIGN KEY` | Khóa ngoại liên kết tới bảng `screening_criteria` |
| `fit_score` | `INT` | `CHECK (fit_score BETWEEN 0 AND 100)`| Điểm phần trăm độ phù hợp |
| `pros` | `JSONB` (hoặc `TEXT`)| `NOT NULL` | Mảng JSON chứa các điểm mạnh nổi bật |
| `cons` | `JSONB` (hoặc `TEXT`)| `NOT NULL` | Mảng JSON chứa các điểm hạn chế |
| `yoe_detected` | `INT` | `DEFAULT 0` | Số năm kinh nghiệm LLM đọc được từ CV |
| `screened_at` | `TIMESTAMP` | `DEFAULT CURRENT_TIMESTAMP`| Thời gian thực hiện chấm điểm |

---

### 2.4 Bảng `outreach_templates` (Mẫu thư nháp tiếp cận)
Ánh xạ trực tiếp từ tệp `DS-08`.

| Tên trường | Kiểu dữ liệu | Ràng buộc | Mô tả |
| :--- | :--- | :--- | :--- |
| `id` | `VARCHAR(50)` | `PRIMARY KEY` | Mã mẫu thư (Ví dụ: OUT-001) |
| `channel` | `VARCHAR(30)` | `NOT NULL` | Kênh tiếp cận (`LinkedIn`, `Email`, `TopCV`) |
| `template_content`| `TEXT` | `NOT NULL` | Nội dung chứa các placeholder dạng `{name}`, `{skill}` |
| `created_at` | `TIMESTAMP` | `DEFAULT CURRENT_TIMESTAMP`| Thời gian tạo mẫu thư |

---

### 2.5 Bảng `outreach_drafts` (Email nháp được cá nhân hóa)
Lưu thư nháp sau khi kiểm duyệt qua **Adoption Filter** và đang chờ **HITL Gate 2** duyệt để gửi.

| Tên trường | Kiểu dữ liệu | Ràng buộc | Mô tả |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` / `VARCHAR(50)`| `PRIMARY KEY` | Khóa chính tự sinh |
| `candidate_id` | `VARCHAR(50)` | `FOREIGN KEY` | Khóa ngoại liên kết tới bảng `candidates` |
| `template_id` | `VARCHAR(50)` | `FOREIGN KEY` | Khóa ngoại liên kết tới bảng `outreach_templates` |
| `channel` | `VARCHAR(30)` | `NOT NULL` | Kênh gửi (`LinkedIn`, `Email`, `TopCV`) |
| `email_subject` | `VARCHAR(200)` | `NULL` | Tiêu đề email (nếu kênh gửi là Email) |
| `draft_content` | `TEXT` | `NOT NULL` | Nội dung thư đã điền đầy đủ thông tin ứng viên |
| `status` | `VARCHAR(30)` | `DEFAULT 'Draft'` | Trạng thái gửi (`Draft`, `Approved`, `Sent`) |
| `created_at` | `TIMESTAMP` | `DEFAULT CURRENT_TIMESTAMP`| Thời gian sinh thư nháp |
| `sent_at` | `TIMESTAMP` | `NULL` | Thời gian duyệt và gửi thực tế |

---

## 3. Thiết Kế Cơ Sở Dữ Liệu Vector (Vector Database Schema)

Hệ thống Vector DB (ChromaDB) sẽ lưu trữ thông tin dưới dạng không cấu trúc kèm vector biểu diễn ngữ nghĩa để tìm kiếm nhanh chóng.

*   **Collection Name:** `candidate_pool`
*   **Vector Metric:** `Cosine Similarity`
*   **Embeddings Function:** `text-embedding-3-small` (OpenAI) hoặc mặc định của ChromaDB.

### Cấu trúc Document nạp vào Vector DB:
Văn bản được vector hóa sẽ gộp thông tin vị trí ứng tuyển và danh sách kỹ năng của ứng viên:
```text
Position: Senior Backend Developer. Skills: Python, FastAPI, PostgreSQL, Docker, Redis
```

### Cấu trúc Metadata đính kèm:
Được sử dụng để lọc (filter) trực tiếp trên database vector mà không cần quét toàn bộ quan hệ SQL:
```json
{
  "candidate_id": "CAND-1001",
  "full_name": "Nguyen Van A",
  "email": "nva@example.com",
  "phone": "0912345678",
  "applied_position": "Senior Backend Developer",
  "salary_expectation": "$1800-$2500",
  "status": "In-pool",
  "source": "LinkedIn"
}
```

---

## 4. Câu Lệnh DDL SQL Mẫu (PostgreSQL / SQLite)

Dưới đây là mã SQL DDL mẫu để khởi tạo hệ thống cơ sở dữ liệu quan hệ:

```sql
-- Khởi tạo bảng Candidates
CREATE TABLE candidates (
    id VARCHAR(50) PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    phone VARCHAR(20) NOT NULL,
    applied_position VARCHAR(100) NOT NULL,
    cv_skills TEXT NOT NULL,
    salary_expectation VARCHAR(50),
    status VARCHAR(30) NOT NULL DEFAULT 'In-pool',
    source VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Khởi tạo index cho cột lọc quan trọng
CREATE INDEX idx_candidates_status ON candidates(status);
CREATE INDEX idx_candidates_position ON candidates(applied_position);

-- Khởi tạo bảng Screening Criteria
CREATE TABLE screening_criteria (
    id VARCHAR(50) PRIMARY KEY,
    position VARCHAR(100) NOT NULL,
    must_have_skills TEXT NOT NULL, -- JSON Array dạng chuỗi
    nice_to_have_skills TEXT NOT NULL, -- JSON Array dạng chuỗi
    yoe_required INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Khởi tạo bảng Screening Results (Scorecard)
CREATE TABLE screening_results (
    id VARCHAR(50) PRIMARY KEY,
    candidate_id VARCHAR(50) REFERENCES candidates(id) ON DELETE CASCADE,
    criteria_id VARCHAR(50) REFERENCES screening_criteria(id) ON DELETE CASCADE,
    fit_score INT CHECK (fit_score BETWEEN 0 AND 100),
    pros TEXT NOT NULL, -- JSON Array dạng chuỗi
    cons TEXT NOT NULL, -- JSON Array dạng chuỗi
    yoe_detected INT DEFAULT 0,
    screened_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Khởi tạo bảng Outreach Templates
CREATE TABLE outreach_templates (
    id VARCHAR(50) PRIMARY KEY,
    channel VARCHAR(30) NOT NULL,
    template_content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Khởi tạo bảng Outreach Drafts
CREATE TABLE outreach_drafts (
    id VARCHAR(50) PRIMARY KEY,
    candidate_id VARCHAR(50) REFERENCES candidates(id) ON DELETE CASCADE,
    template_id VARCHAR(50) REFERENCES outreach_templates(id) ON DELETE SET NULL,
    channel VARCHAR(30) NOT NULL,
    email_subject VARCHAR(200),
    draft_content TEXT NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'Draft',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    sent_at TIMESTAMP
);
```

---

## 5. Quy Trình Đồng Bộ Hóa Dữ Liệu (Synchronization Flow)

Khi một hoạt động tuyển dụng diễn ra, luồng ghi nhận dữ liệu trong cơ sở dữ liệu như sau:

```
[Import Excel / File]
        │
        ├──► Ghi vào Relational SQL (CANDIDATES table)
        │
        └──► Chuyển đổi thành Document ──► Sinh Vector Embeddings ──► Lưu vào Vector DB (ChromaDB)
                                                                            │
[Recruiter truy vấn tái tương tác]                                           │
        │                                                                   │
        └──► Chạy truy vấn ngữ nghĩa trong Vector DB (Cosine Similarity) ───┘
                    │
                    ▼
        ◄── Trả về ID ứng viên phù hợp
        │
        └──► INNER JOIN sang SQL Database để lấy thông tin chi tiết (PII, lịch sử...)
```
