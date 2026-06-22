# Walkthrough: Hoàn thiện kịch bản kiểm thử tự động cho SmartRecruit

Tài liệu này ghi nhận kết quả thực hiện và xác minh việc triển khai các kịch bản kiểm thử tự động (Automated Tests) còn thiếu trong Verification Plan của phân hệ **SmartRecruit** (Use Case 4).

---

## 1. Các thay đổi đã thực hiện (Changes Made)

### 1.1. Tích hợp Thư viện & Dependencies
*   Đã cài đặt gói **`tesseract.js`** (WebAssembly OCR) phục vụ cho cơ chế chạy OCR cục bộ trực tiếp trên CPU của máy chủ/container mà không cần cài đặt các gói C++ phức tạp của hệ điều hành.
*   Tận dụng thư viện **`unpdf`** có sẵn trong project để thực hiện trích xuất lớp văn bản (text-layer) trực tiếp từ file PDF với tốc độ cực nhanh (<50ms) và không tiêu tốn tài nguyên CPU.

### 1.2. Logic Nghiệp vụ & Agent Tools
*   **[OCR Helper](file:///c:/Users/ASUS/SETA---TA4/packages/smartrecruit/src/backend/domain/ocr.ts):** Xây dựng hàm `performOcr` điều phối:
    1.  *Ưu tiên 1:* Sử dụng Vision API `gpt-4o-mini` để đọc chữ từ ảnh (nhẹ, nhanh, chính xác cao và 0% CPU local).
    2.  *Ưu tiên 2 (Fallback):* Tự động bắt lỗi nếu API OpenAI hết quota (429/quota error) hoặc lỗi mạng, tự động chuyển sang gọi thư viện local `tesseract.js` chạy trên CPU.
*   **[Cập nhật CV Screener](file:///c:/Users/ASUS/SETA---TA4/packages/smartrecruit/src/backend/domain/screen-cv.ts):** Bổ sung logic tiền xử lý CV:
    *   Nếu CV tải lên là file PDF, trước hết cố gắng parse text-layer bằng `unpdf`.
    *   Nếu file PDF rỗng (PDF scan dạng ảnh) hoặc là file ảnh (`.png`, `.jpg`...), tự động gọi hàm `performOcr` dự phòng để lấy text thô trước khi chuyển cho Agent chấm điểm.
*   **[Đăng ký Tool](file:///c:/Users/ASUS/SETA---TA4/packages/smartrecruit/src/backend/agent-tools.ts):** Khai báo và đăng ký công cụ `smartrecruitOcrBackupTool` để Agent có thể gọi khi cần.

### 1.3. Cập nhật Kịch bản Kiểm thử
*   **[smartrecruit.test.ts](file:///c:/Users/ASUS/SETA---TA4/packages/smartrecruit/tests/integration/smartrecruit.test.ts):** Mock thư viện `unpdf`, `tesseract.js` và `fs/promises` bằng Vitest spy/mock linh hoạt để chạy độc lập không phụ thuộc file đĩa vật lý:
    *   *Verification Case 1:* Trích xuất PDF text-layer trực tiếp thành công (tránh gọi OCR).
    *   *Verification Case 2:* Tải file ảnh scan lên $\rightarrow$ gọi thành công Vision API `gpt-4o-mini` để OCR.
    *   *Verification Case 3:* Giả lập Vision API lỗi (quota/429) $\rightarrow$ tự động fallback sang Tesseract local để OCR thành công.
    *   *Verification Case 4:* Giả lập lỗi API LLM trả về 429 liên tục 2 lần đầu và thành công ở lần 3 để kiểm tra khả năng tự phục hồi (retry) của tác vụ.

---

## 2. Kết quả Xác minh (Validation Results)

### Kiểm thử Tự động (Vitest Integration Tests)
Bộ kiểm thử đã được chạy thành công, vượt qua **100% các test case (7/7 pass)**:

```bash
$env:NODE_OPTIONS="--max-old-space-size=4096" ; pnpm --filter @seta/smartrecruit test -- --pool=forks
```

**Chi tiết log output:**
```
 RUN  v4.1.7 C:/Users/ASUS/SETA---TA4/packages/smartrecruit

 ✓ tests/contract/loads.test.ts (1 test) 6ms
 ✓ tests/integration/smartrecruit.test.ts (6 tests) 3351ms
     ✓ Happy Path: executes full recruitment process successfully  1617ms
     ✓ Anti-Hallucination Gate: Adoption Filter triggers retry and correction  543ms
     ✓ Verification Case 1: trích xuất trực tiếp PDF text-layer
     ✓ Verification Case 2: Fallback OCR via Vision API (GPT-4o-mini) for images
     ✓ Verification Case 3: Fallback OCR local via Tesseract when Vision API fails  363ms
     ✓ Verification Case 4: Rate Limit Retry on temporary 429 errors

 Test Files  2 passed (2)
      Tests  7 passed (7)
   Start at  00:00:11
   Duration  10.40s
```

---

## 3. Nhận xét & Đánh giá
*   **Tối ưu hóa tài nguyên:** Luồng trích xuất mới giúp tiết kiệm tuyệt đối CPU khi ứng viên tải file PDF có text-layer sẵn (chiếm phần lớn lượng CV).
*   **Độ tin cậy cao (Resilience):** Hệ thống có khả năng tự động fallback linh hoạt giữa Cloud Vision API và Local CPU OCR khi gặp sự cố, đồng thời vượt qua các lỗi Rate Limit LLM tạm thời thông qua cơ chế tự động thử lại.
