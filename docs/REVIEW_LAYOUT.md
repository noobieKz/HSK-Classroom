# Chấm bài cạnh phần xem trước

Popup chấm bài trên màn hình rộng hơn 900px dùng hai cột: preview bên trái, điểm/nhận xét/file chữa bài/lịch sử bên phải. Popup có chiều cao giới hạn theo viewport; mỗi cột cuộn riêng. Cuộn phần chấm không làm dịch chuyển preview. Các popup khác giữ kích thước hiện tại.

Preview nằm đầu cột trái, có Trước/Sau và chọn nhanh file. Danh sách file đầy đủ được thu gọn bên dưới; khi ẩn preview, danh sách mở để chọn lại file. Trên màn hình tối đa 900px, hai phần xếp dọc và popup cuộn thông thường.

Kiểm tra trên localhost DEV ngày 04/11/2026, viewport 1265×712:

- Preview, điểm, nhận xét, chọn file đính kèm và nút lưu hiển thị cùng lúc.
- Nhập thêm một dòng nháp, chuyển từ file 1/4 sang 2/4: nội dung nháp được giữ; đã hoàn lại nội dung ban đầu và không lưu điểm/nhận xét thử.
- Cuộn cột chấm tới cuối: `scrollTop` khoảng 272px; cột preview vẫn có `scrollTop=0`, vị trí và chiều cao không đổi.
- Nút đóng và điều hướng file vẫn hoạt động. Không thay đổi luồng lưu hoặc upload nền.

Ảnh: `screenshots/review-side-by-side.png`.
