# Xem nhiều file bài nộp — DEV

Kiểm tra ngày 04/11/2026 tại localhost:3000, chỉ ghi Drive root DEV `1bS5c-YREy8CyeBrEPQ_s8Vrxna2-MBdt`.

- Bùi Danh Thái, Buổi 01: file TXT có sẵn + hai ảnh PNG mẫu + một MP4 mẫu.
- Đã kiểm tra nút Sau chuyển từ 1/4 sang ảnh 2/4; phím ArrowRight chuyển sang ảnh 3/4; danh sách chọn nhanh mở video 4/4; nút Trước quay lại 3/4.
- Trước bị vô hiệu ở đầu, Sau bị vô hiệu ở cuối. Ẩn xem trước gỡ iframe; mở lại từ danh sách chọn đúng file.
- Mỗi lần chuyển file, iframe có key theo Drive ID được thay mới, không giữ trình phát cũ.
- Trình duyệt kiểm thử yêu cầu đăng nhập Google trong iframe. Đã xác nhận đúng ID/URL/title của cả ảnh và video; chưa xác nhận phát video trực tiếp trong phiên này. Có liên kết mở file trên Drive.
- TypeScript và production build thành công. Không sửa điểm/nhận xét hay dữ liệu production.

Ảnh giao diện: `screenshots/multiple-submission-preview.png`.

Script `scripts/prepare-dev-multiple-preview.ts` dùng fixture `test-results/dev-student-submission.json` đã có và ba file media cùng tên trong `test-results`. Script kiểm tra môi trường DEV và ancestry folder trước khi ghi; chỉ tái sử dụng file mẫu có nhãn `tm_dev_submission=true`. Video mẫu CC0: https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4. File fixture và media local không được commit.
