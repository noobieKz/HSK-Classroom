# HSK-Classroom

Ứng dụng Next.js + TypeScript dành cho giáo viên. Google Sheets lưu toàn bộ dữ liệu nghiệp vụ; Google Drive lưu bài nộp và file chữa bài. Không dùng Supabase, database nghiệp vụ khác hoặc localStorage.

## Trạng thái bàn giao

- Đăng nhập cố định **admin / admin**, kiểm tra trên server. Không có màn hình bắt đổi mật khẩu hoặc chức năng đổi mật khẩu, theo yêu cầu mới nhất của chủ tài khoản.
- Có giao diện tiếng Việt responsive: tổng quan, học viên, buổi học/bài tập, xác minh Drive, bài nộp/chấm bài, lịch sử, báo cáo CSV, kết nối và phục hồi.
- Đã viết backend OAuth authorization code + state + PKCE, refresh token mã hóa, Sheets có schema và biên nhận thao tác, đồng bộ Drive, resumable upload theo phần 1 MB.
- Đã chạy build, TypeScript, kiểm thử nghiệp vụ và kiểm thử HTTP. Xem [báo cáo kiểm thử](docs/TESTING.md).
- **Google Cloud DEV đã cấu hình và kiểm thử live thành công**: OAuth consent/callback, refresh token, khởi tạo và đọc/ghi Sheets, đồng bộ Drive, điểm 0/lịch sử, upload resumable 3 phần qua API website. Xem [cấu hình Google Cloud DEV](docs/GOOGLE_CLOUD_DEV.md) và [kết quả live](docs/google-dev-smoke-result.json).
- **Chưa deploy Netlify** theo yêu cầu để chủ tài khoản triển khai sau. Credentials hiện được lưu ở `.env.local` trên máy này; không nằm trong source ZIP. Khi triển khai Netlify phải cấu hình các secrets runtime và callback riêng của site.

## Môi trường DEV đang sử dụng

| Môi trường           | Drive root                                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------- |
| DEV (hiện đang chạy) | [1bS5c-YREy8CyeBrEPQ_s8Vrxna2-MBdt](https://drive.google.com/drive/folders/1bS5c-YREy8CyeBrEPQ_s8Vrxna2-MBdt) |
| PRODUCTION           | [1A6QYngslOJiRt7FV9TXE5CI6Uoivf1e8](https://drive.google.com/drive/folders/1A6QYngslOJiRt7FV9TXE5CI6Uoivf1e8) |

Mặc định `CLASSROOM_ENV=development`. Backend kiểm tra ancestry bằng Drive IDs và chỉ chấp nhận dữ liệu/đích upload trong DEV mới. Sheets, marker khởi tạo và marker đối soát được lưu kỹ thuật theo **environment + Drive root**, nên không dùng nhầm bảng của DEV cũ. Kết nối Google đã có được giữ lại. Production chỉ được đọc metadata để đối chiếu cây thư mục, không ghi, đổi tên, di chuyển hoặc xóa.

Đã tạo và đối chiếu đủ **8 folder** theo tên/cấp cha–con của production trong DEV mới, bao gồm khoảng trắng cuối tên `BVN `. Không sao chép nội dung file production. Sau kiểm thử có thêm một folder `Nhan_xet_GV` trong nhánh học viên để chứa file giáo viên thử; chạy lại mirror giữ nguyên folder này và không tạo trùng.

Danh sách hiện tại gồm đúng 12 học viên do chủ lớp cung cấp, có Phạm Lê Khanh. Dữ liệu `TM_TEST` của lần smoke test trước đã được dọn khỏi DEV; file thử được đưa vào thùng rác Drive. Khi đồng bộ, web tự khớp folder tên học viên trực tiếp trong `BVN → Buổi học`, không tự tạo folder học viên. Không có bước xác minh Drive thủ công. Folder thiếu hiện “Chưa có thư mục”; folder trùng tên báo lỗi đồng bộ và giữ dữ liệu trước. Alias `Khanh` chỉ dùng cho Phạm Lê Khanh theo xác nhận của chủ lớp. Không có điểm thử gán cho học viên thật.

Khi **thêm buổi học** trên website, web tự tạo `BVN → tên buổi học → folder cho từng học viên đang học trong lớp`; không cần dán link folder. Folder đã tồn tại được dùng lại, gửi lại thao tác không tạo folder trùng. Đồng bộ bài tập chỉ đọc các folder đã có. Chỉnh sửa số buổi/ngày học cập nhật tên folder; không di chuyển folder Drive.

Quy tắc tên hiện tại: chỉ nhập **số buổi và ngày học**, server tạo tên `Buổi 02_03/11/2026` (không khoảng trắng sau `_`). Folder học viên có index cố định theo roster: `01. Bùi Danh Thái` … `06. Phạm Lê Khanh` … `12. Vũ Quang Hiếu`. Khi sửa số/ngày buổi, tên folder được cập nhật theo mẫu này. Đồng bộ vẫn nhận được folder cũ chưa có index. Các lệnh mirror và smoke-test cũ bên dưới là lịch sử; không chạy lại để ghi đè quy tắc tên mới.

[Cấu trúc và kết quả DEV mới](docs/DEV_ENVIRONMENT.md) · [Google Sheets DEV mới](https://docs.google.com/spreadsheets/d/1f2UH52S_HZXsNBSfUU3c7H7pqMeEFKIYvzZvcxUG-EM/edit) · [File chữa bài thử upload qua website](https://drive.google.com/file/d/1ypNP4b89VcTzLAt9pXS7SCzU5Swk_Zgx/view?usp=drivesdk).

## Chạy local

Đồng bộ Drive đọc chung nhiều folder học viên trong một truy vấn, tiếp tục phân trang và duyệt folder con theo nhóm. Snapshot Sheets đã đọc ở đầu thao tác được dùng cho bước quét; bước ghi cuối vẫn đọc lại dữ liệu hiện tại để giữ các nhận xét đang được sửa đồng thời. Đo DEV ngày 04/11: 25 → 12 lượt gọi Google, 10,7 → 6,4 giây trong cùng benchmark; một lần gọi HTTP thực tế sau tối ưu là 5,2 giây. Thời gian thực tế phụ thuộc phản hồi Google và kích thước cây Drive.

Link `Nhan_xet.txt` trong form đọc trực tiếp nội dung hiện tại từ Drive qua API có đăng nhập và header `no-store`, kèm phiên bản trên URL. Dùng link này để xem bản mới nhất sau khi sửa; link **Mở trên Drive** vẫn có sẵn để mở file gốc.

Form chấm bài có ô **File đính kèm** ngay dưới nhận xét. Khi bấm **Lưu nhận xét và file**, nhận xét được lưu trước, popup đóng và file tiếp tục tải ở khung góc phải. Có thể **Thu nhỏ / Mở rộng** khung tiến độ, chuyển màn hình hoặc chấm học viên khác trong cùng tab. Mỗi file giữ cố định review/học viên đích; tải lỗi có nút **Thử lại** để hỏi lại offset và tiếp tục phiên cũ. Giữ tab và phiên đăng nhập mở trong khi tải; tải lại/đóng tab sẽ mất file đang giữ trong bộ nhớ trình duyệt. Upload xong, Nhan_xet.txt cập nhật link đính kèm và vẫn giữ một file nhận xét duy nhất.

Khi lưu điểm hoặc nhận xét, website tạo/cập nhật duy nhất `Nhan_xet.txt` trong folder học viên → `Nhan_xet_GV`. Sửa giữ nguyên file ID và thay nội dung bằng điểm/nhận xét mới nhất; lịch sử sửa vẫn lưu trong Reviews trên Sheets. Các bản TXT phiên bản cũ do app tạo được chuyển vào thùng rác, dùng lại ID file mới nhất nếu chưa có file chuẩn. File upload thủ công được giữ nguyên. File env thật và `.private` (kể cả bản nén) không được đưa lên GitHub; cấu hình Google/khóa được giữ trên máy hoặc khai báo trên hosting.

BTVN mỗi buổi: form chỉ có ô **Yêu cầu bài tập** và **Lưu**. Lưu tạo/cập nhật duy nhất `BTVN.txt` (UTF-8) ngay trong folder buổi học, đồng thời lưu nội dung trên Sheets; áp dụng toàn lớp. Sửa giữ nguyên file ID. `BTVN.txt` được loại khỏi bài nộp. DEV đã tạo file cho yêu cầu trước đó ở Buổi 01; không ghi production. Nếu Drive báo lỗi, website không báo lưu thành công.

Yêu cầu Node.js 22 LTS, npm.

```bash
npm ci
npm run setup
npm run dev
```

Mở [localhost:3000](http://localhost:3000), đăng nhập `admin / admin`.

`setup` tạo `.env.local` với hai khóa ngẫu nhiên, không in secret và không ghi đè file đã có. Bản local hiện tại đã có `.env.local`. Thêm OAuth client qua file này trên máy của bạn; không gửi secret/token vào chat. `.env.local` và `.private/` được gitignore, loại khỏi file tracing của deployment.

Đăng nhập không giới hạn số lần thử và không có thời gian chờ. Trạng thái khóa của các phiên bản cũ không còn được sử dụng.

## Google Cloud OAuth

1. Tạo hoặc dùng một Google Cloud project dành riêng cho ứng dụng dev. Bật **Google Drive API** và **Google Sheets API**.
2. Cấu hình Google Auth Platform: Branding, Audience, Data Access. Khi dùng External + Testing, thêm **email tài khoản giáo viên sẽ cấp quyền** vào Test users. Email này chưa được xác định trong yêu cầu, không tự suy đoán.
3. Tạo OAuth client loại **Web application**.
4. Authorized redirect URI local chính xác: `http://localhost:3000/api/google/callback`.
5. Trên Netlify: đặt `APP_URL` thành origin HTTPS thực tế của site dev. URI chính xác là `APP_URL` + `/api/google/callback`, ví dụ `https://ten-site-dev.netlify.app/api/google/callback`. Giao diện **Kết nối & cài đặt → Cấu hình OAuth** hiển thị URI thực tế. Không nhập nguyên tên ví dụ vào Google Cloud.
6. **Không cần Authorized JavaScript origins**: ứng dụng dùng flow backend, không dùng Google Identity Services hoặc Picker ở trình duyệt.
7. Nhập `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` vào biến môi trường runtime của Netlify hoặc `.env.local`, không đưa vào source.

Scopes ứng dụng thực sự yêu cầu:

| Scope                                            | Mục đích                                                                                                     |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `https://www.googleapis.com/auth/drive`          | Duyệt và ghi vào các thư mục tồn tại sẵn, tạo file/folder, đọc/ghi Sheets. Sheets API chấp nhận scope Drive. |
| `https://www.googleapis.com/auth/userinfo.email` | Hiển thị tài khoản đang kết nối và tránh tái sử dụng refresh token của tài khoản khác.                       |

Ứng dụng không giả định `drive.file` có quyền trên thư mục có sẵn. Dùng Picker có thể giới hạn quyền theo file nhưng cần một flow khác; bản hiện tại chỉ chọn mục ở backend và không đưa OAuth token xuống frontend. Scope Drive là **restricted**: xem [tài liệu scopes chính thức](https://developers.google.com/workspace/drive/api/guides/api-specific-auth). Mã nguồn không có chức năng xóa, chia sẻ công khai hoặc di chuyển file gốc.

OAuth dùng `access_type=offline`, `prompt=consent`, state một lần ràng buộc với session (10 phút), PKCE S256. Refresh token mã hóa AES-256-GCM, giữ token cũ nếu Google không trả token mới cho **cùng tài khoản**. Tự refresh khi access token gần hết hạn. Token và URI resumable không đi xuống trình duyệt; không log callback code, client secret hoặc token. Mất quyền hoặc `invalid_grant` cần bấm Kết nối lại.

### Testing và Production của OAuth

- External + Testing: thêm test user giáo viên; refresh token có các scope Drive thường hết hạn sau **7 ngày**. Không phải lỗi lưu dữ liệu của ứng dụng.
- Việc app là website quản trị riêng không tự quyết định OAuth là Internal. Internal chỉ phù hợp khi Google Workspace organization cho phép và người dùng thuộc organization đó.
- Trước khi mở cho người ngoài hoặc đưa OAuth ra Production, kiểm tra yêu cầu xác minh restricted scope, verified domain, homepage, privacy policy và khả năng cần security assessment. Không coi việc bấm Publish là đã xác minh.
- Đọc [web-server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [token expiration](https://developers.google.com/identity/protocols/oauth2) và yêu cầu hiện hành trong Google Cloud Console. Việc xác minh/publishing OAuth chưa được thực hiện trong phiên này.

## Deploy Netlify khi sẵn sàng

Đây là ứng dụng có backend. **Không upload một thư mục HTML tĩnh bằng drag-and-drop** và không dùng `next export`.

1. Đưa source lên Git repository của bạn, rồi Netlify **Import an existing project**; hoặc dùng Netlify CLI với build. `netlify.toml` đã cấu hình `npm run build`, publish `.next`, Node 22. Netlify tự nhận Next.js runtime.
2. Thêm các biến sau qua Netlify Project configuration → Environment variables, scope runtime Functions và Build khi cần. Dùng secret values cho các khóa, không thêm prefix `NEXT_PUBLIC_`.

| Biến                    | Giá trị cho site DEV                                                                     |
| ----------------------- | ---------------------------------------------------------------------------------------- |
| `APP_URL`               | Origin HTTPS thật của site dev, không có path                                            |
| `CLASSROOM_ENV`         | `development`                                                                            |
| `DRIVE_ROOT_ID`         | `1bS5c-YREy8CyeBrEPQ_s8Vrxna2-MBdt`                                                      |
| `STORAGE_DRIVER`        | `netlify`                                                                                |
| `TECHNICAL_NAMESPACE`   | `default` hoặc một nhãn riêng ổn định                                                    |
| `ENCRYPTION_KEY`        | 32 byte ngẫu nhiên, base64; giữ nguyên giữa các lần deploy                               |
| `SESSION_SECRET`        | Chuỗi ngẫu nhiên ít nhất 32 ký tự; giữ nguyên giữa các lần deploy                        |
| `GOOGLE_CLIENT_ID`      | OAuth web client ID của project dev                                                      |
| `GOOGLE_CLIENT_SECRET`  | OAuth client secret của project dev                                                      |
| `GOOGLE_SPREADSHEET_ID` | Để trống khi khởi tạo lần đầu; chỉ đặt nếu phục hồi sheet ứng dụng đã tạo trong root dev |

Có thể lấy hai khóa đã được tạo trong `.env.local` và nhập trực tiếp trong giao diện cấu hình bí mật Netlify. Không copy toàn bộ file này vào Git. `PRIVATE_DATA_DIR` không sử dụng trên Netlify.

3. Thêm redirect URI HTTPS thực tế trong Google Cloud, deploy, đăng nhập, mở **Kết nối & cài đặt → Kết nối Google**.
4. Bấm **Tạo bảng dữ liệu**. Website tạo spreadsheet riêng trong **root dev**, có nhãn DEV. Không tự tạo tên học viên.
5. Nhập học viên thử được đánh dấu rõ, tạo buổi/bài tập thử, xác minh Drive và chạy các ca trong `docs/TESTING.md`.

Netlify Blobs chỉ chứa cấu hình kỹ thuật mã hóa: token, session/revocation, mutex ghi dữ liệu, upload protocol, thông tin kết nối Sheets và marker đối soát. Không chứa bản sao nguồn dữ liệu nghiệp vụ. Store site-wide dùng **strong consistency** và conditional writes, tên gồm environment + namespace, không dùng deploy-scoped store, nên redeploy/rollback không mất refresh token.

Deploy preview/branch deploy bị chặn khi không có namespace riêng; không kế thừa OAuth secrets hoặc sheet production vào preview. Khi chuyển sang production, dùng `CLASSROOM_ENV=production` và `DRIVE_ROOT_ID=1A6QYngslOJiRt7FV9TXE5CI6Uoivf1e8` (URL ban đầu), cùng cấu hình Google/Sheets và namespace riêng. Production root mặc định cũng là URL ban đầu khi biến `DRIVE_ROOT_ID` để trống. Hiện vẫn là dev; trong công việc này không đọc/ghi thêm hoặc triển khai môi trường production.

Tài liệu hosting: [Next.js trên Netlify](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/), [Netlify Blobs](https://docs.netlify.com/build/data-and-storage/netlify-blobs/), [giới hạn Functions](https://docs.netlify.com/build/functions/configuration/). Chưa kiểm chứng runtime Netlify thực tế trong phiên này.

## Vận hành lớp

1. Kết nối Google, khởi tạo Sheets.
2. Thêm lớp hoặc dùng lớp DEV mặc định. Thêm/nhập học viên hoặc gán học viên đã có vào lớp khác. Ngừng theo học giữ lịch sử.
3. Tạo buổi, ngày học, hạn nộp (giao diện dùng giờ Việt Nam), folder tương ứng trong root dev. Có thể duyệt Drive và lấy ID tại Cài đặt.
4. Mỗi buổi có nhiều bài tập. Danh sách giao bài để trống nghĩa là các học viên ghi danh tại ngày học; có thể chọn danh sách riêng.
5. Tại **Bài nộp & chấm bài**, chọn bài tập và **Xác minh Drive** cho từng học viên. Có thể gán folder hoặc file nằm trực tiếp trong buổi. Tên thư mục chỉ giúp người dùng tìm, không tự xác nhận danh tính.
6. File/thư mục giáo viên không theo chuẩn có thể đánh dấu **bỏ qua khi đếm bài nộp**. `Nhan_xet_GV`, file hệ thống, shortcut và file có nhãn feedback của ứng dụng được loại tự động. Không gán file nằm bên trong cây nhận xét GV thành bài học viên.
7. Đồng bộ theo bài tập. Phạm vi chưa xác minh giữ trạng thái chưa xác minh. Chỉ kết luận chưa nộp khi scope hiện tại đã đồng bộ thành công và quá hạn. API lỗi giữ file từ lần trước và báo lỗi riêng.
8. Thời điểm tạo/sửa file có thể khác thời điểm chuyển vào folder. Bản này chỉ tính **nộp muộn khi giáo viên xác nhận thời điểm nộp > hạn nộp**; mặc định file có trạng thái đã nộp nhưng chưa rõ thời điểm.
9. Lưu điểm/nhận xét sẽ tạo phiên bản mới, không ghi đè lịch sử. Điểm 0 khác ô chưa có điểm. Upload file sau khi đã có lần chấm, vào đúng folder học viên đã xác minh.

Không có scheduler tự động trong bản này. Không dùng timer trình duyệt để giả lập background sync.

## Schema và ghi đồng thời

Xem [cấu trúc dữ liệu](docs/SCHEMA.md). ID UUID hoặc composite xác định, không dựa trên số dòng. Có kiểm tra header, schema version và ID trùng trước khi ghi.

Mọi lần ghi được tuần tự hóa qua mutex kỹ thuật có conditional claim. Bản ghi có version; lưu từ phiên cũ bị từ chối. Một thao tác có operation ID và fingerprint; receipt nằm trong cùng **atomic Sheets batchUpdate** với thay đổi nghiệp vụ. Gửi lại cùng thao tác không tạo thêm review hoặc dòng nhập. Nội dung được ghi bằng `userEnteredValue.stringValue`, không thể thành công thức Sheets. CSV có UTF-8 BOM, quoting và trung hòa formula injection.

Nếu Google write bị timeout hoặc kết quả chưa rõ, marker bền vững chặn lần ghi tiếp. Sau ít nhất 5 phút, kiểm tra khóa và biên nhận trong Cài đặt, rồi đối soát; không tự gửi lại với ID mới. Không chỉnh Sheet bằng tay hoặc dùng một website khác ghi song song: mutex chỉ bảo vệ các instance cùng site/environment/namespace.

Đồng bộ hiện xử lý scope bài tập trong request đồng bộ, có giới hạn thời gian và số mục. Nếu cây Drive quá lớn, thao tác báo lỗi, không tạo kết luận thiếu bài; cần chia scope nhỏ hơn. Cách đọc snapshot/ghi bảng phù hợp lớp nhỏ; cần đo quota, kích thước payload và thiết kế job theo phần trước khi mở rộng quy mô lớn.

## Upload và phục hồi

- Video/file dùng Drive resumable upload, backend chuyển từng phần **1 MB**. Không gửi toàn bộ video trong một Function; OAuth token và upload URI luôn ở server.
- File ID được tạo trước và ghi vào nhật ký kỹ thuật; mỗi file có mã upload riêng. Chunk tiếp theo chỉ gửi sau khi server xác nhận offset. File thành công phải được Drive xác nhận ID, parent, appProperties và size, rồi mới ghi ReviewFiles lên Sheets.
- Nếu mất mạng: bấm **Kiểm tra / tiếp tục** để hỏi lại offset từ Drive. Không chọn lại toàn bộ file để tạo phiên mới.
- Nếu Drive thành công nhưng Sheets lỗi: giữ mã upload → Cài đặt → đối soát lần ghi Sheets nếu có → **Đối soát file đã tải**. Không upload lại bytes; backend tìm đúng file bằng Drive ID và thêm liên kết idempotently.
- Mỗi file hiển thị kết quả riêng. Chỉ hiển thị hoàn tất khi xác nhận cả Drive và Sheets. File chưa được ghi Sheets không được báo thành công.
- Cần giữ trang khi đang tải. Sau refresh/đăng xuất, file đã hoàn tất có thể đối soát theo mã; phiên upload chưa xong không tự khôi phục File object của trình duyệt. Giới hạn hiện tại 10 GiB/file, phiên kỹ thuật 6 ngày; Google có thể hết hạn hoặc thu hồi sớm hơn.
- Nếu có nhiều mục `Nhan_xet_GV` cùng cấp hoặc ánh xạ mơ hồ, app dừng thay vì tự chọn. Folder tạo mới có journal/pre-generated ID để tránh tạo trùng sau request chưa rõ.

## Backup, khôi phục và rollback

- Trước mỗi đợt thay đổi lớn: tạo bản sao riêng spreadsheet bằng Drive và lưu mốc thời gian. CSV báo cáo không thay thế backup: cần giữ toàn bộ các tab, IDs, Reviews và ReviewFiles.
- Backup file bài tập/feedback bằng cơ chế Google Drive của chủ tài khoản, không đổi sharing sang public. Giữ ID gốc; copy file tạo ID mới sẽ cần đối soát mapping, không tự đổi ID hàng loạt.
- Backup cấu hình hosting, encryption key và session secret trong secret manager. Nếu mất key, token cũ không thể giải mã: khôi phục key hoặc dùng namespace mới và kết nối lại Google. Giữ `GOOGLE_SPREADSHEET_ID` của dữ liệu cần phục hồi.
- Khi restore: ngừng ghi từ website, kiểm tra schema/ID của bản sao, đặt đúng spreadsheet ID vào cấu hình môi trường. Nếu technical `sheet-config` cũ đang tồn tại thì cần phục hồi cấu hình kỹ thuật tương ứng hoặc sử dụng namespace mới; state lưu sẵn có ưu tiên hơn biến môi trường. DEV vẫn chỉ đọc sheet nằm trong root dev.
- Rollback code: dùng Deploys → bản thành công trước → Publish deploy trên Netlify. Giữ environment, namespace, encryption key và schema tương thích. Rollback code không rollback dữ liệu Sheets/Drive. Bản schema hiện tại là 1; chưa có migration phá vỡ schema.

## Kiểm tra dự án

```bash
npm run typecheck
npm test
npm run build
npm run test:integration
```

`test:integration` cần production build trước, tự mở server ở port 3100 và storage tạm riêng, không dùng Google thật. Các bài giả lập Google không truy cập Google bên ngoài. Bản local dev dùng port 3000.

`npm run test:google-dev` là kiểm thử **Google thật**, chỉ chạy trên local DEV đã kết nối Google. Lệnh tạo/tái sử dụng dữ liệu `TM_TEST` riêng trong root DEV và upload file chữ thử 2 MB. Không chạy lệnh này với dữ liệu học viên thật. Báo cáo không chứa token được lưu tại `test-results/google-dev-smoke.json`.

Để dùng cấu trúc giống production như bản kiểm thử hiện tại:

```bash
npm run mirror:dev
npm run test:mirrored-dev
```

`mirror:dev` chỉ đọc cây folder production và tạo các folder tương ứng trong DEV. Lệnh giữ nguyên thư mục DEV phát sinh thêm trong lúc thử, không sao chép file và không có thao tác ghi production. `test:mirrored-dev` dùng các folder đã mirror thay vì tạo cây folder mẫu khác.
