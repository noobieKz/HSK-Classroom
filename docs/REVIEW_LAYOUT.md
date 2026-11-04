# Chấm bài cạnh phần xem trước

Popup chấm bài trên màn hình rộng hơn 900px dùng hai cột: preview bên trái, điểm/nhận xét/file chữa bài/lịch sử bên phải. Popup có chiều cao giới hạn theo viewport; mỗi cột cuộn riêng. Cuộn phần chấm không làm dịch chuyển preview. Các popup khác giữ kích thước hiện tại.

Preview nằm đầu cột trái, có Trước/Sau và chọn nhanh file. Danh sách file đầy đủ được thu gọn bên dưới; khi ẩn preview, danh sách mở để chọn lại file. Trên màn hình tối đa 900px, hai phần xếp dọc và popup cuộn thông thường.

Kiểm tra trên localhost DEV ngày 04/11/2026, viewport 1265×712:

- Preview, điểm, nhận xét, chọn file đính kèm và nút lưu hiển thị cùng lúc.
- Nhập thêm một dòng nháp, chuyển từ file 1/4 sang 2/4: nội dung nháp được giữ; đã hoàn lại nội dung ban đầu và không lưu điểm/nhận xét thử.
- Cuộn cột chấm tới cuối: `scrollTop` khoảng 272px; cột preview vẫn có `scrollTop=0`, vị trí và chiều cao không đổi.
- Nút đóng và điều hướng file vẫn hoạt động. Không thay đổi luồng lưu hoặc upload nền.

Ảnh: `screenshots/review-side-by-side.png`.

## Xem toàn màn hình

Nút **Xem toàn màn hình** mở rộng preview kín cửa sổ ứng dụng, tạm ẩn cột chấm và danh sách file. Vẫn có Trước/Sau, bộ đếm và chọn nhanh file. **Thu nhỏ · về chấm bài**, Esc hoặc nút đóng ở góc sẽ trở về bố cục chấm trước; không xóa nháp. Chế độ này không cần quyền Fullscreen API của trình duyệt và không đổi quyền truy cập Drive.

Đã kiểm tra DEV: mở rộng, chuyển tới file 2/4, Esc thu nhỏ nhưng popup vẫn mở; nhận xét nháp còn nguyên. Đã khôi phục nội dung gốc, không lưu nhận xét thử. Ảnh: `screenshots/full-submission-preview.png`. Mở rộng/thu nhỏ dùng cùng iframe, chỉ đổi bố cục.
