import { invariant } from './errors';
export const DEV_DRIVE_ROOT = '1bS5c-YREy8CyeBrEPQ_s8Vrxna2-MBdt';
export const PRODUCTION_DRIVE_ROOT = '1A6QYngslOJiRt7FV9TXE5CI6Uoivf1e8';
export function environment() {
  const mode = process.env.CLASSROOM_ENV || 'development';
  invariant(mode === 'development' || mode === 'production', 'CLASSROOM_ENV không hợp lệ.', 503);
  const root =
    mode === 'development' ? DEV_DRIVE_ROOT : process.env.DRIVE_ROOT_ID || PRODUCTION_DRIVE_ROOT;
  invariant(
    mode !== 'development' ||
      !process.env.DRIVE_ROOT_ID ||
      process.env.DRIVE_ROOT_ID === DEV_DRIVE_ROOT,
    'Môi trường dev chỉ được dùng Drive root thử nghiệm.',
    503,
  );
  return { mode, root };
}
