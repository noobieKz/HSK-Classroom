# HSK Classroom

Ứng dụng lớp học dùng Next.js. Trang chính thức: https://hsk-classroom-production.netlify.app. Google Sheets giữ dữ liệu lớp học; Google Drive giữ thư mục, bài nộp và nhận xét. Netlify Blobs giữ trạng thái kỹ thuật được mã hóa, phiên đăng nhập và khóa ghi.

## Một môi trường dữ liệu production

Website Netlify và `http://localhost:3000` dùng **cùng dữ liệu production**, và cả hai được phép ghi/đồng bộ. Localhost là origin riêng để chạy và kiểm thử giao diện, không phải một bộ dữ liệu DEV. Không chuyển `APP_URL` của local thành URL Netlify: OAuth callback, cookie và kiểm tra Origin cần khớp origin thực tế của mỗi instance.

| Thành phần | Giá trị thống nhất |
| --- | --- |
| Drive root | `1A6QYngslOJiRt7FV9TXE5CI6Uoivf1e8` |
| Google Sheet | `1PXje-9wVQm_ts3F0j5NWKqIRKB_DJWcp2HQFqemidX4` |
| `CLASSROOM_ENV` | `production` |
| `STORAGE_DRIVER` | `netlify` |
| `TECHNICAL_NAMESPACE` | `tmhsk6c9e4f2a8b1d` |
| Netlify Site ID | `a21d7b00-801e-476d-939b-7434696dbbc0` |

Không cấu hình `STORAGE_DRIVER=file` với dữ liệu production. Storage file tạo khóa ghi và phiên kết nối riêng, dẫn tới ghi đồng thời không được bảo vệ. Mã nguồn chặn cấu hình đó. Không tự tạo Sheet mới hoặc namespace mới để “sửa” lỗi kết nối; việc này sẽ tách dữ liệu và phiên Google.

## Chạy local với dữ liệu production

1. Cài Node.js 22 và chạy `npm ci`. `npm run setup` chỉ tạo `.env.local` nếu file chưa tồn tại; không ghi đè. `.env.local` hiện có trên máy này đã được chuẩn bị cho production; bản trước được giữ tại `.env.local.before-production`.
2. Trong `.env.local`, giữ `APP_URL=http://localhost:3000`, các ID/namespace trong bảng trên, cùng `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_ALLOWED_EMAILS`, `ENCRYPTION_KEY`, `SESSION_SECRET` **đúng giá trị đang dùng trên Netlify**. Không in, gửi chat hoặc commit các secret này.
3. Thêm `NETLIFY_AUTH_TOKEN` là personal access token có quyền tới site production. Token này chỉ dùng ở local để truy cập cùng Netlify Blobs. Giữ bí mật; thu hồi ở Netlify nếu không còn dùng. `NETLIFY_SITE_ID` phải là Site ID trong bảng. Trên Netlify Functions, SDK dùng context của site; không đặt personal token vào biến môi trường hosting.
4. Google OAuth web client phải có hai redirect URI chính xác: `http://localhost:3000/api/google/callback` và `https://hsk-classroom-production.netlify.app/api/google/callback`. Hai URI này đã được kiểm tra trong Google Cloud ngày 04/11/2026.
5. Chạy `npm run dev`, mở `http://localhost:3000`, đăng nhập bằng email giáo viên trong allowlist. Sau khi đăng nhập, đối chiếu danh sách lớp/học viên với production trước khi ghi hoặc đồng bộ.

Nếu thiếu token, mã sẽ trả lỗi cấu hình và không ghi bằng storage riêng. Nếu giải mã trạng thái kỹ thuật lỗi, kiểm tra `ENCRYPTION_KEY` với Netlify; không tạo khóa mới hay xóa state. Nếu không đăng nhập được, kiểm tra `GOOGLE_ALLOWED_EMAILS`, OAuth client và callback. `APP_URL` chỉ là origin của instance, không phải URL dữ liệu.

## Tuyệt đối không tự ý xóa file hoặc dữ liệu

Áp dụng cho file local, Git, Google Drive, Google Sheets, Netlify Blobs và các dịch vụ liên quan. Không xóa vĩnh viễn, chuyển vào thùng rác, chạy `git clean`, tự dọn dữ liệu thử, dọn thư mục cũ, hay chạy script có thao tác xóa nếu chủ sở hữu chưa chỉ rõ **từng đối tượng cần xóa** và yêu cầu rõ việc xóa. Không hiểu “chuẩn hóa”, “đồng bộ”, “sửa”, “deploy” là quyền xóa. Khi gặp file cũ/trùng, giữ nguyên và báo để quyết định thủ công. Trước khi thay đổi cấu trúc lớn, tạo bản sao/backup; không thay thế bản gốc bằng thao tác mất dữ liệu.

Luồng lưu nhận xét đã bỏ thao tác đưa các file TXT phiên bản cũ vào thùng rác. Script lịch sử `scripts/apply-classroom-roster.ts` bị vô hiệu hóa vì từng có thao tác dọn dữ liệu. Không chạy các script DEV lịch sử (`mirror:dev`, `test:google-dev`, `test:mirrored-dev`) trên production. Các tài liệu thử nghiệm cũ chỉ để tra cứu, không phải hướng dẫn vận hành hiện tại.

## Deploy production

Netlify import repository `noobieKz/HSK-Classroom`, branch `main`, build `npm run build`. Site dùng `APP_URL=https://hsk-classroom-production.netlify.app`, các biến trong bảng trên, OAuth credentials, allowlist giáo viên và khóa mã hóa/phiên ổn định. Secret khai báo trong Netlify Environment variables, không đặt trong Git. Git push vào `main` sẽ tự publish; kiểm tra deploy thành công và chạy thử đăng nhập/đọc dữ liệu. Không đổi namespace, khóa mã hóa, Sheet ID hoặc Drive root trong một deploy thông thường.

Netlify Blobs dùng strong consistency và conditional writes cho khóa ghi. Dù vậy, mọi lần sửa dữ liệu production cần kiểm tra đúng học viên/buổi học. Không chạy hai thao tác đồng bộ cùng lúc nếu một thao tác đang báo lỗi hoặc cần đối soát. Nếu Google hoặc Sheets timeout, dùng giao diện Cài đặt để đối soát; không gửi lại thao tác với ID mới khi chưa biết kết quả cũ.

## Kiểm tra mã nguồn

```bash
npm run typecheck
npm test
npm run build
npm run test:integration
```

Test dùng dữ liệu giả lập và không cần token production. Không chạy kiểm thử Google thật hoặc script di trú DEV trên dữ liệu production. Chi tiết thiết kế và lịch sử DEV được lưu tại `docs/README_2026-11-04_legacy.md`; các mệnh đề “chưa deploy”, “DEV đang chạy” và hướng dẫn xóa trong tài liệu đó đã hết hiệu lực.
