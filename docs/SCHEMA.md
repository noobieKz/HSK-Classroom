# Schema v1

Nguồn định nghĩa chính xác: `src/lib/model.ts`. Header phải giữ nguyên tên và thứ tự. Mỗi hàng có ID ổn định; số dòng chỉ là vị trí ghi, không là định danh.

| Tab             | Nội dung / quan hệ                                                                                                               |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Meta            | Hàng `schema`, version `1`                                                                                                       |
| Classes         | id, tên, Drive root, số lượng dự kiến, trạng thái, version                                                                       |
| Students        | id, tên đã xác minh, email, trạng thái, version                                                                                  |
| Enrollments     | class_id + student_id, ngày tham gia/ngừng, trạng thái, version                                                                  |
| Sessions        | class_id, tên, ngày học, hạn nộp ISO, Drive folder, nội dung, trạng thái, version                                                |
| Assignments     | class_id, session_id, tên/yêu cầu, student_ids dạng JSON, trạng thái, version                                                    |
| DriveMappings   | class_id/session_id/assignment_id/student_id, drive_id, kind: folder/file/ignore, verified_at, version                           |
| Submissions     | ID composite assignment + student, class/session/assignment/student, synced_at, submitted_at đã xác nhận, timing_source, version |
| SubmissionFiles | ID composite submission + Drive ID, class_id/submission_id, Drive metadata, first_seen, present, version                         |
| Reviews         | ID riêng từng lần chấm, class_id/submission_id, score (rỗng hoặc 0–10), nhận xét, người chấm, thời gian, version, operation_id   |
| ReviewFiles     | ID upload, class_id/review_id, Drive ID, tên/link/mime/size, thời gian, operation_id                                             |
| SyncLogs        | ID thao tác, class/session/assignment, bắt đầu/kết thúc, running/success/error, thông báo                                        |
| Operations      | Biên nhận idempotency: operation ID, fingerprint, created_at, JSON result                                                        |

Drive IDs được xác minh trước khi ghi ánh xạ. Không dùng tên để tự gán. Dữ liệu chưa đủ 11 người được hiển thị rõ, không tự sinh học viên.

Lưu điểm là append-only trên Reviews, version tăng theo submission. ReviewFiles liên kết **đúng phiên bản nhận xét**, không chỉ học viên. Khi file không còn trong phạm vi đồng bộ, SubmissionFiles giữ hàng và đổi `present=false`, không xóa lịch sử chấm.

Sync thành công là theo từng assignment. Scope thay đổi sau lần sync phải đồng bộ lại; không dùng kết quả trước ánh xạ mới để kết luận thiếu bài. Lần sync lỗi giữ nguyên các hàng file cũ, ghi log error.

Sheets là nguồn nghiệp vụ duy nhất. Netlify Blobs chứa trạng thái kỹ thuật của kết nối, bảo mật và giao thức upload; không được dùng làm bảng điểm hoặc danh sách học viên.
