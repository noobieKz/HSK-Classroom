# Báo cáo kiểm thử

Ngày 03/11/2026, giờ Việt Nam. Báo cáo hiện tại dùng hai root mới trong [DEV_ENVIRONMENT.md](DEV_ENVIRONMENT.md).

## Kiểm thử tự động

- TypeScript strict và production build Next.js: pass.
- 20 unit/API-mock tests và 1 HTTP integration test: **21 tests pass**.
- Đăng nhập admin/admin; nhập sai 12 lần vẫn đăng nhập đúng ngay, bỏ qua trạng thái khóa cũ, không có bước đổi mật khẩu.
- API chưa đăng nhập trả 401; cookie HttpOnly/SameSite, same-origin/CSRF và thu hồi session khi đăng xuất.
- Cấu hình Sheets tách theo môi trường và root; không dùng cấu hình legacy hoặc lấy nhầm cấu hình production.
- Google giả lập: retry không tạo trùng, version conflict, điểm 0, lịch sử chấm, batch receipt và lỗi transport sau commit.
- Drive giả lập: pagination, đồng bộ không trùng, loại file giáo viên, giữ dữ liệu cũ khi lỗi.
- OAuth giả lập: refresh tự động, giữ refresh token cũ nếu response không có token mới.
- Upload giả lập: resumable, kiểm tra metadata Drive, phục hồi liên kết ReviewFiles sau Sheets error mà không upload lại; token/URI không trả về client.
- CSV: Unicode Việt/Trung, BOM, newline, quotes và formula injection.

## Kiểm thử Google thật trên DEV mới

Hoàn tất lúc **16:11 ngày 03/11/2026**. Kết quả máy đọc được ở [google-dev-smoke-result.json](google-dev-smoke-result.json).

- DEV: `1bS5c-YREy8CyeBrEPQ_s8Vrxna2-MBdt`.
- PRODUCTION: `1A6QYngslOJiRt7FV9TXE5CI6Uoivf1e8`. Chỉ đọc metadata để đối chiếu, không ghi production.
- `npm run mirror:dev`: tạo và kiểm tra đủ 8 folder theo cây production, giữ nguyên tên và quan hệ cha–con. Không sao chép nội dung file production.
- Chạy lại mirror sau test: đủ 8 folder gốc, không tạo trùng; giữ 1 folder Nhan_xet_GV phát sinh trong DEV.
- `npm run test:mirrored-dev`: gọi HTTP API thật của website, dùng lớp `HSK_UET · DEV` và bốn học viên giả lập có tiền tố TM_TEST.
- Website tạo [Sheets DEV mới](https://docs.google.com/spreadsheets/d/1f2UH52S_HZXsNBSfUU3c7H7pqMeEFKIYvzZvcxUG-EM/edit) trong root mới, đọc lại đúng schema.
- Đồng bộ hai lần không tạo trùng; đọc bài nộp thử từ folder mirror và loại file trong Nhan_xet_GV.
- File trực tiếp trong buổi học được gán đúng; folder rỗng đã xác minh chỉ tính chưa nộp sau hạn; học viên chưa ánh xạ vẫn chưa xác minh.
- Xác nhận thời điểm nộp và tính trạng thái nộp muộn đúng.
- Lưu điểm 0, nhận xét nhiều dòng Việt/中文 và `=1+1` nguyên văn; gửi lại operation ID không trùng. Sửa điểm 9 vẫn giữ review điểm 0.
- Upload **2.097.175 byte qua 3 phần**; Drive xác nhận đúng size/parent, Sheets liên kết đúng review. Status và đối soát lại không nhân đôi liên kết.
- Ép technical access-token expiry để thực sự refresh OAuth; token mới đọc Drive thành công.

[File thử upload qua API website](https://drive.google.com/file/d/1ypNP4b89VcTzLAt9pXS7SCzU5Swk_Zgx/view?usp=drivesdk). Credentials và token không nằm trong báo cáo hoặc gói source.

Kiểm tra giao diện tiếp lúc 16:23: ánh xạ của TM_TEST_HOC_VIEN đã được đổi sang folder Bùi Minh Đức sau lần smoke test. Đồng bộ lại phản ánh đúng folder hiện tại không có bài; điểm 9 và lịch sử review cũ vẫn được giữ trong Sheets. Báo cáo JSON lúc 16:11 là kết quả tại thời điểm chạy test. Ảnh trạng thái hiện tại: `screenshots/dev-mirrored-overview.png`.

## Chưa kiểm chứng

- Deploy/HTTPS/Netlify Functions và Netlify Blobs thật; chủ tài khoản sẽ triển khai Netlify sau.
- Revoke/disconnect/reconnect sau khi kết nối đã hoàn tất.
- Upload video nhiều GiB, quota trên cây lớn và phục hồi sau ngắt mạng thật. Các ca lỗi từng phần đã có kiểm thử giả lập.
- Preview Drive với quyền khác nhau và hành vi trên thiết bị thật.

## Chạy lại

Chạy `npm test`, `npm run test:integration`, `npm run typecheck`, `npm run build` cho kiểm thử cục bộ. Sau khi có cấu hình và OAuth DEV, chạy `npm run mirror:dev` rồi `npm run test:mirrored-dev` để thử Google thật. Các lệnh live ghi dữ liệu TM_TEST trong DEV; không chạy ở production.
