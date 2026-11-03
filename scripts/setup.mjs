import { randomBytes } from 'node:crypto';
import { writeFile, access } from 'node:fs/promises';
try {
  await access('.env.local');
  console.log('.env.local đã có. Giữ nguyên cấu hình.');
  process.exit(0);
} catch {}
await writeFile(
  '.env.local',
  [
    'APP_URL=http://localhost:3000',
    'CLASSROOM_ENV=development',
    'DRIVE_ROOT_ID=1bS5c-YREy8CyeBrEPQ_s8Vrxna2-MBdt',
    'STORAGE_DRIVER=file',
    'TECHNICAL_NAMESPACE=default',
    'PRIVATE_DATA_DIR=.private',
    'ENCRYPTION_KEY=' + randomBytes(32).toString('base64'),
    'SESSION_SECRET=' + randomBytes(48).toString('base64url'),
    'GOOGLE_CLIENT_ID=',
    'GOOGLE_CLIENT_SECRET=',
    'GOOGLE_SPREADSHEET_ID=',
    '',
  ].join('\n'),
  { flag: 'wx', mode: 0o600 },
);
console.log('Đã tạo .env.local (gitignore). Đăng nhập bằng tài khoản cố định của website.');
