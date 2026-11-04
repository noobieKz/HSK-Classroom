# Đăng nhập Google cho giáo viên

Ứng dụng dùng OAuth/OIDC Google đang có, không cần Firebase. Nút đăng nhập chỉ yêu cầu `openid email`, không yêu cầu Drive hoặc offline access. Kết nối Drive/Sheets trong Cài đặt vẫn là luồng riêng; đăng nhập không thay refresh token hay tài khoản Drive đang kết nối.

## Cấu hình

- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`: OAuth Web client hiện có.
- `GOOGLE_ALLOWED_EMAILS`: danh sách email giáo viên chính xác, phân cách dấu phẩy. Email không phân biệt hoa/thường. Không tự cho phép tài khoản đầu tiên đăng nhập, không cho phép theo toàn bộ domain.
- `APP_URL`: origin thực tế của môi trường; đăng ký `${APP_URL}/api/google/callback` trong OAuth client. Dùng lại callback hiện có nên localhost không cần thêm redirect URI.
- Local đã chạy script `scripts/configure-local-google-login.ts`: lấy email GV đang kết nối Drive làm allowlist trong `.env.local`; không ghi email thật vào source. Khi triển khai cần cấu hình riêng biến này trên hosting cùng các secrets; env thật không được push.
- `admin/admin` chỉ hoạt động khi cấu hình rõ `CLASSROOM_ENV=development`, `APP_URL` trỏ localhost/loopback và không chạy trong Netlify/CONTEXT hosting. Production, domain khác và Netlify chặn API mật khẩu và cả phiên mật khẩu cũ. Thiếu allowlist/OAuth sẽ chặn đăng nhập Google thay vì mở quyền.

## Kiểm tra bảo mật

Authorization code + PKCE S256, state ngẫu nhiên gắn cookie HttpOnly/SameSite=Lax (Secure trên HTTPS), nonce và thời hạn 10 phút. Callback dùng CAS tiêu thụ state một lần; callback kết nối Drive vẫn yêu cầu phiên quản trị và không lẫn với callback đăng nhập.

Thư viện jose xác minh chữ ký RS256 bằng Google JWKS, issuer, audience, azp khi có, iat/exp, nonce, subject và email_verified. Chỉ email trong allowlist mới được cấp cookie phiên HttpOnly/SameSite=Lax/Secure HTTPS; phiên có hạn 8 giờ và trạng thái thu hồi trong technical store mã hóa. Mỗi API kiểm tra phiên và allowlist lại, nên bỏ email khỏi danh sách sẽ chặn phiên cũ ở yêu cầu tiếp theo. API ghi tiếp tục kiểm tra CSRF.

Kiểm thử dùng token RSA ký cục bộ và Google endpoints giả lập, không cần credentials Google thật. Có ca tài khoản ngoài danh sách, email giả dạng hậu tố, email chưa xác minh, sai chữ ký/issuer/audience/azp/nonce, token hết hạn, callback replay, sai cookie trình duyệt và chặn mật khẩu khi hosted/production. HTTP production kiểm tra chặn đăng nhập mật khẩu và từ chối phiên Google ngoài allowlist trên API.

Kiểm tra ngày 04/11/2026: build/TypeScript, 33 unit/workflow tests và 2 HTTP integration tests đều qua. Trình duyệt local đã mở đúng màn hình Google cho ứng dụng Tuệ Minh Classroom DEV với scope `openid email`, callback localhost cũ và PKCE. Phiên trình duyệt này chưa đăng nhập Google, nên chưa hoàn tất đăng nhập Google thật qua callback; chủ tài khoản cần tự đăng nhập để thử bước cuối. Ảnh màn hình đăng nhập: `screenshots/google-login.png`.

Tài liệu giao thức: https://developers.google.com/identity/openid-connect/openid-connect
