'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="login">
      <h1>Chưa thể mở lớp học</h1>
      <p>Kiểm tra kết nối rồi tải lại trang.</p>
      <button onClick={reset}>Thử lại</button>
    </main>
  );
}
