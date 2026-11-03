# Cấu hình Google Cloud DEV đã hoàn tất

Ngày 03/11/2026.

- Project đã tạo: `Tue Minh Classroom DEV`.
- Project ID: `tue-minh-classroom-dev`.
- Project number: `888090270610`.
- Organization: No organization.
- Google Drive API: đã bật, đọc lại trạng thái Enabled.
- Google Sheets API: đã bật, đọc lại trạng thái Enabled.
- Không thay đổi project công việc hoặc cấu hình production hiện có. DEV Drive hiện tại là root mới chủ tài khoản xác nhận ngày 03/11/2026.

## OAuth

Đã điền app name `Tuệ Minh Classroom DEV`, support/contact email từ tài khoản Google đang đăng nhập, chọn External (Testing).

OAuth configuration đã được tạo; đã đọc lại thông báo `OAuth configuration created!`. Chủ tài khoản đã đồng ý Google API Services: User Data Policy.

Đã tạo/lưu và đọc lại cấu hình:

- Web application client: `Tue Minh Classroom DEV · localhost`.
- Authorized redirect URI: `http://localhost:3000/api/google/callback`.
- Authorized JavaScript origins: để trống (backend authorization code flow).
- Scopes: `https://www.googleapis.com/auth/drive` và `https://www.googleapis.com/auth/userinfo.email`. Đã đọc thông báo `Data access changes saved!`.
- Test user: `giathe.bk@gmail.com`. Đã đọc lại danh sách có 1 test user.
- Ứng dụng vẫn External + Testing, chưa Publish.

Web client đã tạo thành công. Client ID/secret được lưu trực tiếp trong `.env.local` (gitignore); secret không được in vào hội thoại hoặc đưa vào source ZIP.

Redirect URI cần dùng cho local DEV:

`http://localhost:3000/api/google/callback`

Drive DEV root:

`1bS5c-YREy8CyeBrEPQ_s8Vrxna2-MBdt`

`GOOGLE_CLIENT_ID` và `GOOGLE_CLIENT_SECRET` đã được cấu hình cho local DEV. Backend đã được khởi động lại và đã kết nối Google qua chính website. Refresh token lưu AES-256-GCM trong technical store. Không lưu secret/token trong tài liệu này.

## Kiểm thử live đã pass

- OAuth consent, callback authorization code + PKCE và lưu kết nối.
- Refresh token thật, sau refresh đọc lại Drive thành công.
- Tạo và đọc/ghi spreadsheet thật trong root DEV, kiểm tra schema.
- Tạo dữ liệu `TM_TEST` riêng; xác minh mapping, đồng bộ 2 lần không trùng, loại file trong Nhan_xet_GV.
- Điểm 0, sửa thành 9 và giữ cả hai phiên bản; gửi lại cùng thao tác không tạo review trùng.
- Upload file chữ thử 2.097.175 byte qua 3 chunk của API website, kiểm tra file đúng parent Nhan_xet_GV và ReviewFiles đúng review ID.
- Kiểm tra lại upload status và đối soát không tạo liên kết trùng.
- Trên DEV mới: mirror 8 folder production, đối chiếu đường dẫn/tên/cấp cha–con, chạy lại không trùng. Thử file trực tiếp trong buổi, folder rỗng, học viên chưa xác minh và xác nhận nộp muộn.

Kiểm thử trên DEV mới hoàn tất: **16:11 ngày 03/11/2026**, giờ Việt Nam. Chi tiết: [báo cáo live](google-dev-smoke-result.json) và [cấu trúc DEV](DEV_ENVIRONMENT.md).

[Google Sheets DEV đã tạo](https://docs.google.com/spreadsheets/d/1f2UH52S_HZXsNBSfUU3c7H7pqMeEFKIYvzZvcxUG-EM/edit).

Production chỉ được đọc metadata để mirror cấu trúc theo yêu cầu mới; không có thao tác ghi production. Chưa triển khai Netlify, chưa kiểm thử revoke/disconnect/reconnect sau khi đã hoàn tất kết nối, video lớn nhiều GiB hoặc preview trên thiết bị thật.
