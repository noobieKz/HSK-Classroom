# Thời điểm nộp tự động

Theo yêu cầu ngày 04/11/2026, thời điểm nộp mặc định là `createdTime` sớm nhất trong các file bài nộp hiện diện. Lưu trên Sheets vào `Submissions.submitted_at`, `timing_source=drive_created`; hiển thị giờ Việt Nam trên bảng và từng file trong popup/xem trước. Không dùng `modifiedTime` hay thời điểm web phát hiện file.

File chuyển từ folder khác giữ ngày tạo gốc. GV có thể điều chỉnh; giá trị `teacher_verified` hợp lệ được ưu tiên và giữ khi đồng bộ, kể cả GV chỉnh trong lúc đang quét Drive. Xóa điều chỉnh cho phép lần đồng bộ kế tiếp lấy lại ngày tạo từ Drive. Nếu không còn file hiện diện, giờ tự động được xóa. Thiếu ngày tạo hợp lệ mới hiển thị chưa rõ thời điểm.

Có giờ nộp thì trạng thái là Đã nộp; nếu có hạn hợp lệ và giờ nộp sau hạn thì Nộp muộn. File hệ thống, BTVN.txt và nhận xét GV vẫn được loại khỏi bài nộp.

Kiểm tra: 30 unit/workflow tests qua; TypeScript và production build qua. Script `scripts/verify-dev-submission-times.ts` đã đồng bộ duy nhất DEV, xác nhận 13 file của 5 học viên có giờ nộp, 7 học viên chưa có file giữ giờ trống. Báo cáo: `dev-submission-times.json`. Không thay đổi điểm/nhận xét hoặc production.
