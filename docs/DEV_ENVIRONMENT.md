# Hai môi trường Drive và kết quả kiểm thử hiện tại

Ngày 03/11/2026, theo hai URL chủ tài khoản xác nhận mới nhất.

**File đính kèm trong form nhận xét (04/11/2026):** chọn nhiều tài liệu/video ngay dưới ô nhận xét, bấm Lưu nhận xét và file. Đã kiểm thử thao tác bằng trình duyệt với `gv-feedback-dev.txt`; upload thực tế vào đúng Nhan_xet_GV của Bùi Danh Thái, có một ReviewFiles tương ứng. Đọc lại Google Drive xác nhận đúng parent và Nhan_xet.txt có link đến file upload, vẫn giữ nguyên ID file TXT và chỉ có một file nhận xét. Báo cáo: `test-results/review-attachment.json`; ảnh: `screenshots/review-form-attachment.png`. Upload gián đoạn được tiếp tục từ phiên cũ; cùng nội dung nhận xét chưa tải xong không tạo thêm review khi bấm Lưu lại. 26 tests và build pass; production không thay đổi.

**Quy tắc nhận xét cập nhật 04/11/2026:** mỗi folder Nhan_xet_GV chỉ có một file tự sinh `Nhan_xet.txt`. Sửa nhận xét cập nhật cùng file ID; lịch sử điểm/nhận xét giữ trên Sheets. Đã gộp các bản TXT cũ trên DEV về ID `1zwV4W4xoThk3DEloGltAb9IWXouNQERu`, chuyển bản sinh tự động dư vào thùng rác và giữ file upload thủ công. Các mô tả `Nhan_xet_vXX.txt` bên dưới là lịch sử trước thay đổi này.

Kiểm thử Google thật ngày 04/11: lưu → sửa nội dung mẫu → đọc lại → khôi phục nội dung ban đầu, cả ba lần trả cùng file ID; metadata xác nhận đúng parent, danh sách Drive xác nhận chỉ có một file nhận xét; ReviewFiles có một liên kết hiện tại, Reviews giữ lịch sử. Kết quả `test-results/review-file.json`: `same_file_after_edit=true`, `file_count=1`. 26 tests tự động, TypeScript và build pass.

**File nhận xét tự động:** lưu điểm/nhận xét tạo TXT theo phiên bản trong folder học viên/Nhan_xet_GV, liên kết ReviewFiles. Đã tạo bù file cho 12 review DEV trước đó, không thay đổi điểm/nội dung. Kiểm thử API thật lưu review mới tạo `Nhan_xet_v13.txt`; đọc metadata xác nhận parent Nhan_xet_GV nằm trực tiếp trong đúng folder Bùi Danh Thái, đọc nội dung xác nhận điểm và nhận xét khớp Sheets. [File đã kiểm chứng](https://drive.google.com/file/d/1zwV4W4xoThk3DEloGltAb9IWXouNQERu/view). 25 tests và build pass. Bản GitHub loại env thật, .private và bản nén private; env local vẫn giữ trên máy.

**Sửa LOCKED khi lưu/chấm bài:** quét Drive chạy ngoài khóa ghi Sheets. Chỉ giữ khóa ngắn khi ghi log/kết quả; ghi đồng thời được xếp hàng tối đa 10 giây phía server, client dùng lại mã thao tác khi cần chờ. Khi nhập thay đổi trong lúc quét, phần merge giữ review và thời điểm nộp mới nhất; đổi nội dung buổi/danh sách khi đang quét thì bỏ kết quả cũ và chờ đồng bộ lại. Không cướp khóa ghi đang chạy.

Kiểm thử 03/11/2026 17:26 giờ Việt Nam: API thật lưu điểm của bài mẫu DEV thành công trước khi quét Drive hoàn tất, sau đó đọc lại vẫn đủ 1 file và review 8/10. Báo cáo `test-results/concurrent-review.json`. 25 tests tự động và build pass, bao gồm chấm bài/cập nhật thời điểm nộp giữa lần quét và hàng đợi ghi đồng thời. Production không thay đổi.

**BTVN và chấm bài hiện tại:** form chỉ có yêu cầu bài tập và Lưu; tạo/cập nhật cùng file BTVN.txt của buổi. Đã tạo và đọc lại đúng nội dung đang lưu cho Buổi 01 và Buổi 02, giữ file ID khi lưu lại. Bài tập cũ được ngừng giao khi thay bằng BTVN chung, giữ lịch sử.

Màn hình Bài nộp & chấm bài tự đồng bộ ngay khi mở và mỗi 30 giây, tạm dừng khi đang mở form. Học viên upload trực tiếp vào folder của mình trên Drive; sau lần đồng bộ, file được nhận, trạng thái chuyển sang đã nộp và nút Chấm bài mở. File đề của giáo viên được phân biệt bằng metadata, không loại nhầm file học viên chỉ vì tên BTVN.txt.

Đã kiểm thử live: upload `BTVN_mau_DEV.txt` trong folder `01. Bùi Danh Thái` của Buổi 01; giao diện tự nhận 1 file, mở Chấm bài, lưu điểm thử 8/10 và nhận xét ghi rõ KIỂM THỬ DEV. Giữ file mẫu và review để chủ lớp xem. Đây không phải điểm học thật. File mẫu: https://drive.google.com/file/d/1uW1SjYbMQsjFFXFwaM4H63eHLWGjzaib/view. 24 unit/API-mock tests và build pass. Chưa triển khai Netlify; không ghi production.

**Trạng thái hiện tại:** đã bỏ giao diện xác minh Drive thủ công. Đồng bộ tự khớp họ tên sau khi bỏ tiền tố index, cập nhật lại liên kết theo folder hiện tại và không yêu cầu giáo viên xác nhận. DEV có 2 buổi đúng mẫu tên, mỗi buổi đủ 12 folder có index (24 folder học viên); Buổi 01 đã đồng bộ tự động đủ 12 học viên. Folder chưa tồn tại hiển thị “Chưa có thư mục”, không dùng trạng thái “Chưa xác minh”. Folder trùng tên báo lỗi đồng bộ, giữ dữ liệu cũ. 23 unit/API-mock tests và build pass.

**Cập nhật sau khi chủ lớp cung cấp danh sách:** DEV đã có đúng 12 học viên thật (Khanh = Phạm Lê Khanh). Dữ liệu học viên/bài tập/điểm TM_TEST đã được dọn, file thử đưa vào thùng rác Drive. Buổi 01 dùng cấu trúc folder thật, ngày 01/11/2026 và chưa đặt hạn nộp. Đồng bộ tự khớp 3 folder học viên hiện có; 9 người chưa có folder vẫn chưa xác minh. Các kết quả smoke test bên dưới là lịch sử trước khi dọn dữ liệu thử.

**Tự tạo folder khi thêm buổi:** đã dùng form website để tạo buổi `KIỂM THỬ tạo folder · 03/11/2026` trong DEV. Đọc lại Drive qua API ứng dụng xác nhận có đúng 12 folder con và cả 12 tên khớp roster. [Mở thư mục kiểm thử được giữ lại](https://drive.google.com/drive/folders/1zoi_iyY3rxtgCLfH0-g5KCq1XtJVtALG). Không tạo học viên hoặc điểm giả. 22 unit/API-mock tests pass, gồm tạo folder và retry không trùng; build pass. Production không được ghi.

| Môi trường | Root ID                             | Quy tắc                                                    |
| ---------- | ----------------------------------- | ---------------------------------------------------------- |
| DEV        | `1bS5c-YREy8CyeBrEPQ_s8Vrxna2-MBdt` | Đích mọi thao tác ghi, đồng bộ và upload khi đang chạy dev |
| PRODUCTION | `1A6QYngslOJiRt7FV9TXE5CI6Uoivf1e8` | Chỉ đọc metadata để mirror cây thư mục trong tác vụ này    |

Root DEV trước đây không còn là cấu hình đang chạy. Dữ liệu thử và Sheets cũ được giữ nguyên ở vị trí cũ, không tự chuyển hoặc xóa. Báo cáo cũ ở `docs/history/google-dev-smoke-original-root.json` chỉ là lịch sử.

## Cây thư mục đã mirror

Đã đọc toàn bộ cây production theo pagination và tạo **8 folder con** trong DEV, giữ nguyên tên gốc và cấp cha–con:

```text
DEV/
├── BVN␠/
│   └── Buổi 01_ 01/11/2026/
│       ├── Đặng Ngọc Đức/
│       ├── Đặng Ngọc Anh Vũ/
│       └── Bùi Minh Đức/
├── Record/
└── File sách/
    └── HSK1 3.0/
```

`␠` trong sơ đồ biểu diễn **một khoảng trắng cuối tên**. Tên Drive thật là `BVN `, không chứa ký hiệu `␠`. Cây DEV và production được đối chiếu đủ 8 đường dẫn trước khi chạy test. Không sao chép video, bài nộp, tài liệu hoặc nội dung file production.

Trong lúc thử, một folder `Nhan_xet_GV` được thêm dưới nhánh học viên DEV để chứa file giáo viên thử. Kiểm tra lại sau test: đủ 8 folder mirror, 1 folder DEV phát sinh, không tạo folder trùng. Cây production không thay đổi giữa các lần đối chiếu. Manifest chi tiết phục vụ kiểm thử nằm ở `test-results/dev-folder-mirror.json` (gitignore).

## Dữ liệu và thao tác thử

Ứng dụng tạo Sheets mới ngay trong root DEV mới. Cấu hình kỹ thuật của Sheets, khởi tạo và đối soát có key theo environment + root. Kiểm thử tự động xác nhận không sử dụng cấu hình Sheets legacy hoặc production.

Các hàng học viên dùng tên `TM_TEST_HOC_VIEN`, `TM_TEST_TRUC_TIEP`, `TM_TEST_FOLDER_RONG`, `TM_TEST_CHUA_XAC_MINH`. Đây là học viên giả lập để thử nghiệp vụ, không phải xác nhận danh tính hoặc danh sách 11 học viên production. Folder Drive được gán bằng ID cụ thể của bản mirror.

Ca kiểm thử live đã pass lúc 16:11 giờ Việt Nam:

- Đọc/ghi Google Sheets thật, schema đúng, dữ liệu tại root DEV mới.
- Gán folder học viên, đọc file thật được tạo riêng cho test và đồng bộ hai lần không tạo trùng.
- Gán file nằm trực tiếp trong folder buổi học cho học viên thử.
- Folder rỗng chỉ chuyển thành chưa nộp sau khi scope đã đồng bộ thành công và qua hạn.
- Học viên chưa có ánh xạ vẫn là chưa xác minh, không bị tính là chưa nộp.
- Xác nhận thời điểm nộp cho ca thử, trạng thái nộp muộn tính đúng.
- File trong Nhan_xet_GV không bị đếm là bài nộp học viên.
- Điểm 0, tiếng Việt/中文, nhận xét nhiều dòng và chuỗi bắt đầu bằng `=` được giữ nguyên. Sửa điểm 9 vẫn giữ review 0.
- Gửi lại cùng thao tác không nhân đôi lần chấm.
- Upload 2.097.175 byte qua 3 phần vào đúng Nhan_xet_GV; kiểm tra Drive parent/size và liên kết ReviewFiles.
- Đối soát lại không tạo liên kết trùng; refresh OAuth thật vẫn đọc Drive được.

[Google Sheets DEV mới](https://docs.google.com/spreadsheets/d/1f2UH52S_HZXsNBSfUU3c7H7pqMeEFKIYvzZvcxUG-EM/edit) · [File chữa bài thử](https://drive.google.com/file/d/1ypNP4b89VcTzLAt9pXS7SCzU5Swk_Zgx/view?usp=drivesdk) · [Báo cáo JSON](google-dev-smoke-result.json).

Build và TypeScript pass; 20 unit/API-mock tests và 1 HTTP integration test pass. Chưa deploy Netlify hoặc thử video nhiều GiB trong tác vụ này.
