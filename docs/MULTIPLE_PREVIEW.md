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

## Kiểm tra upload theo bộ

Đã chạy `npx tsx scripts/test-dev-media-batches.ts` ngày 04/11/2026. Mỗi bộ được upload đồng thời qua Drive API vào folder học viên có sẵn trong Buổi 01 trên DEV, không qua form file chữa bài của giáo viên.

| Trường hợp | Học viên DEV | Kết quả |
| --- | --- | --- |
| Nhiều ảnh | Đặng Ngọc Anh Vũ | 2 PNG, website nhận 2 file |
| Nhiều video | Đặng Ngọc Đức | 2 MP4, website nhận 2 file |
| Ảnh và video trộn lẫn | Đặng Phương Dung | 2 PNG + 2 MP4, website nhận 4 file |

- Cả 8 file đúng folder, MIME, kích thước; tải lại so SHA-256 khớp nguồn.
- Hai file video là hai Drive ID khác nhau dùng chung clip CC0 mẫu, không phải hai nội dung video khác nhau.
- Đồng bộ hai lần: mỗi file chỉ có một bản ghi hiện diện, số file giữ nguyên 2/2/4. Tổng 13 file gồm 5 file thử đã có của hai học viên trước đó.
- Ba học viên chuyển thành **Đã nộp · chưa rõ thời điểm**, **Chờ chấm**, nút **Chấm bài** hoạt động. Không ghi điểm/nhận xét thử mới.
- Đã mở popup cả ba trường hợp, kiểm tra chuyển tới file cuối; riêng bộ hỗn hợp kiểm tra đủ 1/4 → 2/4 → 3/4 → 4/4 và quay lại 3/4. Đúng filename/Drive ID, nút Sau vô hiệu ở cuối. Giới hạn đăng nhập Google của iframe vẫn như trên; chưa xác nhận phát video trực tiếp.
- `npm run typecheck` thành công. Không thay đổi mã ứng dụng trong lượt kiểm thử này.

Báo cáo máy: `dev-media-batches.json`. Ảnh: `screenshots/dev-media-batches.png`, `screenshots/dev-mixed-media-preview.png`. Giữ file `DEV_BATCH_*` trong các folder DEV để chủ tài khoản tự thử tiếp; không tạo folder ngoài quy tắc.
