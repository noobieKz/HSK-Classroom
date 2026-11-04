# Folder BTVN và tài liệu mẫu

Cấu trúc mỗi buổi:

```text
BVN/
  Buổi 01_01/11/2026/
    BTVN/
      BTVN.txt
      (audio, video, PDF, ảnh, bài đọc mẫu do GV upload)
    01. Bùi Danh Thái/
    ...
```

Thêm buổi từ web tạo folder BTVN cùng các folder học viên. Lưu yêu cầu từ form tạo/cập nhật `BTVN/BTVN.txt`; chỉnh sửa giữ ID TXT và không sửa file khác. Liên kết **Mở folder BTVN · thêm tài liệu trên Drive** ở từng buổi mở đúng folder để GV dùng thao tác upload của Google Drive. Lượt này chưa thêm form upload tài liệu trên web.

TXT cũ nằm ngay trong buổi được chuyển vào folder BTVN bằng thay đổi parent, giữ ID, nội dung và liên kết. Nếu có nhiều TXT cùng tên ở gốc/folder đích, báo lỗi để xử lý thay vì chọn bừa hoặc ghi đè. Folder BTVN và nội dung của nó được bỏ qua khi quét bài nộp.

Kiểm tra ngày 04/11/2026:

- 31 tests qua, gồm di chuyển TXT giữ ID, lưu lại đúng file, bảo toàn audio mẫu, chặn TXT trùng và loại folder BTVN khỏi bài nộp; production build/TypeScript qua.
- Script `scripts/migrate-dev-homework-folders.ts` chỉ chạy với root DEV cố định, đã chuyển TXT ở Buổi 01 và Buổi 02, so sánh nội dung trước/sau và chạy lại không tạo trùng folder.
- Liên kết trên web đi tới đúng folder Buổi 01 `1WAujYh64AXemM0Rpyd1BVNstH7j3Lqd3`. Trình duyệt kiểm thử chưa đăng nhập Google nên dừng ở màn hình đăng nhập Drive; không thực hiện upload qua UI trong phiên này.
- Không ghi dữ liệu production. Bản production cũ sẽ được chuyển TXT khi người dùng lưu bài tập/sửa buổi bằng bản code này; không có migration tự chạy lúc khởi động.

Báo cáo: `dev-homework-folders.json`. Ảnh giao diện: `screenshots/homework-resource-folder.png`.
