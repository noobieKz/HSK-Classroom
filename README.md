# HSK Classroom

Ứng dụng lớp học dùng Next.js. Trang chính thức: https://hsk-classroom-production.netlify.app. Google Sheets giữ dữ liệu lớp học; Google Drive giữ thư mục, bài nộp và nhận xét. Netlify Blobs giữ trạng thái kỹ thuật được mã hóa, phiên đăng nhập và khóa ghi.

## Một môi trường production duy nhất

Mọi thao tác thực tế, kể cả kiểm thử trên dữ liệu thật, được thực hiện tại website production. Không vận hành localhost như một website thứ hai. Mã nguồn vẫn có thể build và chạy unit/integration test cô lập trên máy, không kết nối dữ liệu thật. Theo quyết định của chủ lớp ngày 04/11/2026, **không tạo Netlify personal access token** cho localhost. Nếu sau này cần localhost ghi chung dữ liệu, phải thiết kế lại hoặc cấp quyền vào cùng kho Netlify Blobs; chỉ đổi Drive/Sheet ID là không an toàn.

Trong **Buổi học & bài tập**, nút **Đồng bộ buổi học từ Drive** đọc các thư mục trực tiếp trong `BVN` của Drive root rồi nhập buổi mới vào Sheets. Tên cần theo mẫu `Buổi 02_05/11/2026` với ngày hợp lệ; cũng nhận ngày/tháng một chữ số như `Buổi 01_1/11/2026`. Folder có cùng ID đã nhập sẽ được giữ nguyên hoặc cập nhật tên/ngày nếu đổi tên trên Drive. Folder trùng tên buổi nhưng khác ID, hoặc tên không đúng mẫu, được báo để kiểm tra và không tự chọn. Khi xác nhận thư mục đã vào Thùng rác, web ẩn buổi và bài tập tương ứng khỏi danh sách thao tác; bản ghi buổi học, điểm và nhận xét trong Sheets vẫn được giữ. Khôi phục đúng thư mục rồi tải lại dữ liệu hoặc đồng bộ để hiện lại. Lỗi Drive, mất quyền truy cập hoặc HTTP 404 không được coi là xác nhận xóa và không làm ẩn buổi. Đồng bộ này không tạo bài tập, không xóa dữ liệu và không sửa file Drive.

Trong **Bài nộp & chấm bài**, nếu buổi học chưa có bản ghi BTVN, nút **Tạo BTVN và đồng bộ Drive** sẽ tạo một bài tập BTVN với yêu cầu trống trong Sheets, sau đó quét file trong folder học viên. Nút này không tạo hay chỉnh sửa file Drive. Có thể nhập yêu cầu bài tập sau qua **Buổi học & bài tập → Sửa bài tập**. Nếu đã có BTVN, nút **Đồng bộ Drive** chỉ quét lại bài nộp.

| Thành phần            | Giá trị thống nhất                             |
| --------------------- | ---------------------------------------------- |
| Drive root            | `1A6QYngslOJiRt7FV9TXE5CI6Uoivf1e8`            |
| Google Sheet          | `1PXje-9wVQm_ts3F0j5NWKqIRKB_DJWcp2HQFqemidX4` |
| `CLASSROOM_ENV`       | `production`                                   |
| `STORAGE_DRIVER`      | `netlify`                                      |
| `TECHNICAL_NAMESPACE` | `tmhsk6c9e4f2a8b1d`                            |
| Netlify Site ID       | `a21d7b00-801e-476d-939b-7434696dbbc0`         |

Không cấu hình `STORAGE_DRIVER=file` với dữ liệu production. Storage file tạo khóa ghi và phiên kết nối riêng, dẫn tới ghi đồng thời không được bảo vệ. Mã nguồn chặn cấu hình đó. Không tự tạo Sheet mới hoặc namespace mới để “sửa” lỗi kết nối; việc này sẽ tách dữ liệu và phiên Google.

## Làm việc trên production và kiểm tra mã nguồn

1. Mở `https://hsk-classroom-production.netlify.app`, đăng nhập bằng tài khoản giáo viên trong allowlist. Tạo/sửa/đồng bộ và kiểm tra kết quả ngay trên site này.
2. Khi sửa mã, dùng `npm ci`, `npm run typecheck`, `npm test`, `npm run build`, `npm run test:integration` trên máy. Bộ test cô lập dùng dữ liệu giả lập, không cần token production.
3. Push branch `main` chỉ cập nhật mã nguồn; Netlify đang ở trạng thái **Stopped builds** nên không tự build khi có commit. Khi cần phát hành, dùng Netlify CLI build trên máy và deploy thủ công vào đúng site production. Chỉ thử giao diện với dữ liệu thật sau khi Netlify báo Published. Giữ các secret trong Netlify; không in, gửi chat hoặc commit.

`.env.local` cũ trên máy được giữ để tránh mất cấu hình nhưng không dùng để vận hành. Không thêm token hoặc chuyển sang `STORAGE_DRIVER=file` để ép localhost ghi production. Nếu giải mã trạng thái kỹ thuật lỗi trên Netlify, kiểm tra `ENCRYPTION_KEY`; không tạo khóa mới hay xóa state. Nếu không đăng nhập được, kiểm tra `GOOGLE_ALLOWED_EMAILS`, OAuth client và callback.

## Tuyệt đối không tự ý xóa file hoặc dữ liệu

Áp dụng cho file local, Git, Google Drive, Google Sheets, Netlify Blobs và các dịch vụ liên quan. Không xóa vĩnh viễn, chuyển vào thùng rác, chạy `git clean`, tự dọn dữ liệu thử, dọn thư mục cũ, hay chạy script có thao tác xóa nếu chủ sở hữu chưa chỉ rõ **từng đối tượng cần xóa** và yêu cầu rõ việc xóa. Không hiểu “chuẩn hóa”, “đồng bộ”, “sửa”, “deploy” là quyền xóa. Khi gặp file cũ/trùng, giữ nguyên và báo để quyết định thủ công. Trước khi thay đổi cấu trúc lớn, tạo bản sao/backup; không thay thế bản gốc bằng thao tác mất dữ liệu.

Luồng lưu nhận xét đã bỏ thao tác đưa các file TXT phiên bản cũ vào thùng rác. Script lịch sử `scripts/apply-classroom-roster.ts` bị vô hiệu hóa vì từng có thao tác dọn dữ liệu. Không chạy các script DEV lịch sử (`mirror:dev`, `test:google-dev`, `test:mirrored-dev`) trên production. Các tài liệu thử nghiệm cũ chỉ để tra cứu, không phải hướng dẫn vận hành hiện tại.

## Deploy production

Netlify liên kết repository `noobieKz/HSK-Classroom`, branch `main`, build `npm run build`, nhưng **Stopped builds** để không tốn credits khi push. Site dùng `APP_URL=https://hsk-classroom-production.netlify.app`, các biến trong bảng trên, OAuth credentials, allowlist giáo viên và khóa mã hóa/phiên ổn định. Secret khai báo trong Netlify Environment variables, không đặt trong Git. Khi phát hành thủ công, xác nhận đúng Site ID, dùng `netlify build` rồi `netlify deploy --prod` từ thư mục repo đã liên kết; CLI cần đăng nhập Netlify trên máy nhưng không tạo personal access token. Ứng dụng Next.js có API/server functions, vì vậy không upload riêng `dist` hay `.next` như site tĩnh. Kiểm tra deploy thành công và chạy thử đăng nhập/đọc dữ liệu. Không đổi namespace, khóa mã hóa, Sheet ID hoặc Drive root trong một deploy thông thường.

Netlify Blobs dùng strong consistency và conditional writes cho khóa ghi. Dù vậy, mọi lần sửa dữ liệu production cần kiểm tra đúng học viên/buổi học. Không chạy hai thao tác đồng bộ cùng lúc nếu một thao tác đang báo lỗi hoặc cần đối soát. Nếu Google hoặc Sheets timeout, dùng giao diện Cài đặt để đối soát; không gửi lại thao tác với ID mới khi chưa biết kết quả cũ.

Upload ảnh nhận xét dùng mã upload riêng và phiên Drive có thể tiếp tục. Nếu bị khóa tạm thời, giữ tab đang mở và bấm **Thử lại** trên cùng file; ứng dụng kiểm tra tiến độ Drive trước khi gửi tiếp. Khóa riêng của upload bị ngắt quá 5 phút có thể tự phục hồi bằng điều kiện phiên bản, còn khóa ghi Sheets vẫn phải đối soát thủ công. Mã upload hiện trong khung tiến độ để phục hồi đúng file; không tạo upload mới khi chưa kiểm tra kết quả cũ.

## Kiểm tra mã nguồn

```bash
npm run typecheck
npm test
npm run build
npm run test:integration
```

Test dùng dữ liệu giả lập và không cần token production. Không chạy kiểm thử Google thật hoặc script di trú DEV trên dữ liệu production. Chi tiết thiết kế và lịch sử DEV được lưu tại `docs/README_2026-11-04_legacy.md`; các mệnh đề “chưa deploy”, “DEV đang chạy” và hướng dẫn xóa trong tài liệu đó đã hết hiệu lực.
