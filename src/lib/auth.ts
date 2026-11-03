import { cookies } from 'next/headers';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { verifyPassword, randomToken, digest } from './crypto';
import { readState, writeState } from './store';
import { AppError, invariant } from './errors';

export type Credentials = { hash: string; version: string };
export type Session = { id: string; exp: number; version: string; csrf: string };
export function origin() {
  const url = new URL(process.env.APP_URL || 'http://localhost:3000');
  invariant(
    url.pathname === '/' && !url.search && !url.hash,
    'APP_URL phải là origin của website.',
    503,
  );
  invariant(
    url.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(url.hostname),
    'Website phải dùng HTTPS.',
    503,
  );
  return url.origin;
}
const cookieName = () => (origin().startsWith('https:') ? '__Host-tm_session' : 'tm_session');
function signature(value: string) {
  invariant((process.env.SESSION_SECRET || '').length >= 32, 'Chưa cấu hình SESSION_SECRET.', 503);
  return createHmac('sha256', process.env.SESSION_SECRET!).update(value).digest('base64url');
}
// Fixed server-side account requested by the owner. No password-change flow.
const ADMIN_HASH =
  'scrypt:8786c0959d087d6b4e881cce35abe1cd:86c378779d2efdef505fbeba4a41a968fce8cfe4823a527d9b44747b2854f710fafd40e8406bbbd3b782bb6668acf63df6f99a95395b41fd3460ede334199f34';
export async function credentials(): Promise<Credentials> {
  return { hash: ADMIN_HASH, version: digest(ADMIN_HASH) };
}
export async function getSession(): Promise<Session | null> {
  const raw = (await cookies()).get(cookieName())?.value;
  if (!raw) return null;
  const [data, sig] = raw.split('.');
  const expected = signature(data);
  if (
    !/^[A-Za-z0-9_-]{43}$/.test(sig || '') ||
    !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  )
    return null;
  try {
    const session = JSON.parse(Buffer.from(data, 'base64url').toString()) as Session;
    const cred = await credentials();
    if (session.exp < Date.now() || session.version !== cred.version) return null;
    const record = await readState<{ active: boolean }>(`session:${session.id}`);
    return record?.value.active ? session : null;
  } catch {
    return null;
  }
}
export async function requireSession() {
  const session = await getSession();
  invariant(session, 'Vui lòng đăng nhập.', 401);
  return session;
}
export function sameOrigin(request: Request) {
  invariant(request.headers.get('origin') === origin(), 'Nguồn yêu cầu không hợp lệ.', 403);
}
export function csrf(request: Request, session: Session) {
  sameOrigin(request);
  invariant(
    request.headers.get('x-csrf-token') === session.csrf,
    'Phiên bảo vệ đã hết hạn. Tải lại trang.',
    403,
  );
}
async function issue(cred: Credentials) {
  const session: Session = {
    id: randomToken(),
    csrf: randomToken(),
    version: cred.version,
    exp: Date.now() + 8 * 3600_000,
  };
  await writeState(`session:${session.id}`, { active: true, expires: session.exp });
  const data = Buffer.from(JSON.stringify(session)).toString('base64url');
  (await cookies()).set(cookieName(), `${data}.${signature(data)}`, {
    httpOnly: true,
    secure: origin().startsWith('https:'),
    sameSite: 'lax',
    path: '/',
    maxAge: 8 * 3600,
  });
}
export async function login(username: string, password: string) {
  const cred = await credentials();
  const valid = verifyPassword(password, cred.hash);
  if (username !== 'admin' || !valid) {
    throw new AppError(401, 'Tên đăng nhập hoặc mật khẩu chưa đúng.');
  }
  await issue(cred);
}
export async function logout(session: Session) {
  await writeState(`session:${session.id}`, { active: false });
  (await cookies()).delete(cookieName());
}
