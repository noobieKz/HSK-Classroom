import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Tuệ Minh Classroom',
  description: 'Không gian quản lý lớp học Tiếng Trung Tuệ Minh',
  robots: { index: false, follow: false },
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
