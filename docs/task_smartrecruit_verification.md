# Danh sách nhiệm vụ: Hoàn thiện kịch bản kiểm thử tự động cho SmartRecruit

- [x] Cài đặt dependencies (`pdf-parse`, `tesseract.js`) trong `packages/smartrecruit/package.json`
- [x] Thiết kế và tạo mới `ocr_backup_tool` trong `packages/smartrecruit/src/backend/agent-tools/ocr-backup.ts` (Tích hợp trong `agent-tools.ts`)
- [x] Đăng ký `ocr_backup_tool` trong `packages/smartrecruit/src/register.ts` (Tích hợp trong `agent-tools.ts`)
- [x] Cập nhật logic trích xuất PDF và OCR fallback trong `packages/smartrecruit/src/backend/domain/screen-cv.ts`
- [x] Bổ dung các kịch bản kiểm thử trong `packages/smartrecruit/tests/integration/smartrecruit.test.ts`
    - [x] Test case: Trích xuất PDF text-layer trực tiếp
    - [x] Test case: Fallback OCR qua Vision API (GPT-4o-mini)
    - [x] Test case: Fallback OCR local qua Tesseract khi API lỗi
    - [x] Test case: Rate Limit Jitter & Retry (HTTP 429)
- [x] Chạy bộ kiểm thử tự động `pnpm --filter @seta/smartrecruit test` để xác minh (Vitest PASS 7/7)
- [x] Tạo file báo cáo `docs/walkthrough_smartrecruit_verification.md`
