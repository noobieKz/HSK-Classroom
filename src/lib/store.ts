import { mkdir, readFile, rename, writeFile, rmdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { getStore } from '@netlify/blobs';
import { decrypt, encrypt } from './crypto';
import { AppError, invariant } from './errors';
import { environment } from './environment';

// Only technical state: credentials, OAuth, sessions, upload protocol state, mutexes.
// Business records live exclusively in Sheets. Strong reads are essential for revocation.
type Entry<T> = { value: T; etag: string };
type Condition = { onlyIfNew?: boolean; onlyIfMatch?: string };
const localOrigin = () => {
  const hostname = new URL(process.env.APP_URL || 'http://localhost:3000').hostname;
  return hostname === 'localhost' || hostname === '127.0.0.1';
};
function driver() {
  const value = process.env.STORAGE_DRIVER || (process.env.NETLIFY ? 'netlify' : 'file');
  invariant(
    value === 'netlify' || (value === 'file' && !process.env.NETLIFY),
    'Cấu hình storage bền vững chưa đúng.',
    503,
  );
  invariant(
    environment().mode !== 'production' ||
      value === 'netlify' ||
      process.env.CLASSROOM_TEST_STORAGE === 'isolated',
    'Production phải dùng chung Netlify Blobs để bảo vệ khóa ghi và phiên kết nối.',
    503,
  );
  if (value === 'netlify' && localOrigin())
    invariant(
      Boolean(process.env.NETLIFY_SITE_ID && process.env.NETLIFY_AUTH_TOKEN),
      'Local cần NETLIFY_SITE_ID và NETLIFY_AUTH_TOKEN để dùng chung storage production.',
      503,
    );
  if (['deploy-preview', 'branch-deploy'].includes(process.env.CONTEXT || ''))
    invariant(
      process.env.TECHNICAL_NAMESPACE && process.env.TECHNICAL_NAMESPACE !== 'production',
      'Deploy preview cần namespace và tài khoản Google thử riêng.',
      503,
    );
  return value;
}
const blobs = () =>
  getStore({
    name: `tue-minh-technical-v1-${environment().mode}-${process.env.TECHNICAL_NAMESPACE || 'default'}`,
    consistency: 'strong',
    ...(localOrigin() && process.env.NETLIFY_SITE_ID && process.env.NETLIFY_AUTH_TOKEN
      ? { siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_AUTH_TOKEN }
      : {}),
  });
function privateDirectory() {
  return resolve(/* turbopackIgnore: true */ process.env.PRIVATE_DATA_DIR || '.private');
}
function path(key: string) {
  return join(privateDirectory(), `${encodeURIComponent(key)}.json`);
}
export async function readState<T>(key: string): Promise<Entry<T> | null> {
  if (driver() === 'netlify') {
    const item = await blobs().getWithMetadata(key, { type: 'text' });
    if (!item) return null;
    invariant(
      typeof item.data === 'string' && item.etag,
      'Không đọc được trạng thái kỹ thuật.',
      503,
    );
    return { value: decrypt<T>(item.data), etag: item.etag };
  }
  try {
    const item = JSON.parse(await readFile(path(key), 'utf8'));
    return { value: decrypt<T>(item.data), etag: item.etag };
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
}
// Optional configuration keys may not exist on a new production site. Checking the
// listing first avoids an upstream Blobs GET that can stall on a missing key.
export async function readOptionalState<T>(key: string): Promise<Entry<T> | null> {
  if (driver() === 'netlify') {
    const entries = await blobs().list({ prefix: key });
    if (!entries.blobs.some((entry) => entry.key === key)) return null;
  }
  return readState<T>(key);
}
export async function writeState(
  key: string,
  value: unknown,
  condition: Condition = {},
): Promise<string | null> {
  if (driver() === 'netlify') {
    const options = condition.onlyIfNew
      ? { onlyIfNew: true as const }
      : condition.onlyIfMatch
        ? { onlyIfMatch: condition.onlyIfMatch }
        : {};
    const result = await blobs().set(key, encrypt(value), options);
    if (!result.modified) return null;
    // Fail closed even on SDK versions that incorrectly report success without an ETag.
    if (!result.etag) throw new AppError(503, 'Không xác nhận được ghi cấu hình.');
    return result.etag;
  }
  const target = path(key);
  await mkdir(privateDirectory(), { recursive: true, mode: 0o700 });
  const guard = `${target}.lock`;
  try {
    await mkdir(guard);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'EEXIST')
      throw new AppError(409, 'Một thao tác đang chạy. Thử lại sau.', 'LOCKED');
    throw e;
  }
  try {
    const previous = await readState(key);
    if (
      (condition.onlyIfNew && previous) ||
      (condition.onlyIfMatch && previous?.etag !== condition.onlyIfMatch)
    )
      return null;
    const etag = randomUUID();
    const tmp = `${target}.${etag}.tmp`;
    await writeFile(tmp, JSON.stringify({ etag, data: encrypt(value) }), { mode: 0o600 });
    await rename(tmp, target);
    return etag;
  } finally {
    await rmdir(guard);
  }
}
export type Lock = { busy: boolean; owner: string; started: number };
export async function withLock<T>(name: string, fn: () => Promise<T>, waitMs = 0): Promise<T> {
  const key = `lock:${name}`;
  const until = Date.now() + waitMs;
  let current = await readOptionalState<Lock>(key);
  while (current?.value.busy && Date.now() < until) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    current = await readOptionalState<Lock>(key);
  }
  if (current?.value.busy)
    throw new AppError(
      409,
      'Đang có thao tác khác. Nếu thao tác bị ngắt, vào Cài đặt để phục hồi khóa.',
      'LOCKED',
    );
  const owner = randomUUID();
  let etag: string | null;
  try {
    etag = await writeState(
      key,
      { busy: true, owner, started: Date.now() },
      current ? { onlyIfMatch: current.etag } : { onlyIfNew: true },
    );
  } catch (error) {
    if (error instanceof AppError && error.code === 'LOCKED' && Date.now() < until) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return withLock(name, fn, Math.max(0, until - Date.now()));
    }
    throw error;
  }
  if (!etag) {
    if (Date.now() < until) return withLock(name, fn, until - Date.now());
    throw new AppError(409, 'Một thao tác khác vừa bắt đầu. Hãy thử lại.', 'LOCKED');
  }
  // No time-based lock stealing: a timed-out Google write may have an unknown outcome.
  try {
    return await fn();
  } finally {
    await writeState(key, { busy: false, owner, started: Date.now() }, { onlyIfMatch: etag });
  }
}
