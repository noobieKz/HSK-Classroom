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
    'CLASSROOM_ENV=production',
    'DRIVE_ROOT_ID=1A6QYngslOJiRt7FV9TXE5CI6Uoivf1e8',
    'STORAGE_DRIVER=netlify',
    'TECHNICAL_NAMESPACE=tmhsk6c9e4f2a8b1d',
    'NETLIFY_SITE_ID=a21d7b00-801e-476d-939b-7434696dbbc0',
    'NETLIFY_AUTH_TOKEN=',
    'ENCRYPTION_KEY=' + randomBytes(32).toString('base64'),
    'SESSION_SECRET=' + randomBytes(48).toString('base64url'),
    'GOOGLE_CLIENT_ID=',
    'GOOGLE_CLIENT_SECRET=',
    'GOOGLE_SPREADSHEET_ID=1PXje-9wVQm_ts3F0j5NWKqIRKB_DJWcp2HQFqemidX4',
    '',
  ].join('\n'),
  { flag: 'wx', mode: 0o600 },
);
console.log('Đã tạo .env.local (gitignore). Cần điền secrets production và Netlify token trước khi chạy.');
