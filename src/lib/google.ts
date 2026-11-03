import { randomToken } from './crypto';
import { origin } from './auth';
import { readState, writeState, withLock } from './store';
import { AppError, invariant } from './errors';
export const SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/userinfo.email',
];
// Backend-only selection of arbitrary pre-existing folders requires Drive scope.
// drive.file is NOT assumed to authorize existing folders. Sheets also accepts drive.
// The app never edits, shares, moves or deletes originals despite the broad grant.
export type GoogleConnection = {
  refresh: string;
  access: string;
  expires: number;
  email: string;
  scopes: string[];
  disconnected?: boolean;
};
export const callbackUrl = () => `${origin()}/api/google/callback`;
export function googleConfig() {
  invariant(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
    'Chưa cấu hình Google OAuth. Xem README mục Google Cloud.',
    503,
  );
  return {
    client_id: process.env.GOOGLE_CLIENT_ID!,
    client_secret: process.env.GOOGLE_CLIENT_SECRET!,
  };
}
export async function googleStatus() {
  const item = await readState<GoogleConnection>('google');
  return {
    configured: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    connected: !!item?.value.refresh && !item.value.disconnected,
    email: item?.value.email || '',
    callback: callbackUrl(),
  };
}
export async function exchange(params: Record<string, string>) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({ ...googleConfig(), ...params }),
    signal: AbortSignal.timeout(15000),
    cache: 'no-store',
  });
  if (!response.ok)
    throw new AppError(
      401,
      'Google từ chối kết nối. Kiểm tra cấu hình hoặc kết nối lại.',
      'GOOGLE_RECONNECT',
    );
  return response.json() as Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope?: string;
  }>;
}
export async function saveConnection(code: string, verifier: string) {
  await withLock('google', async () => {
    const tokens = await exchange({
      code,
      code_verifier: verifier,
      redirect_uri: callbackUrl(),
      grant_type: 'authorization_code',
    });
    const scopes = (tokens.scope || '').split(' ');
    invariant(
      SCOPES.every((s) => scopes.includes(s)),
      'Chưa cấp đủ quyền Drive/Sheets. Kết nối lại và chọn đầy đủ quyền.',
      403,
    );
    const profile = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
      signal: AbortSignal.timeout(15000),
      cache: 'no-store',
    });
    invariant(profile.ok, 'Không xác minh được tài khoản Google.', 502);
    const { email } = await profile.json();
    const previous = (await readState<GoogleConnection>('google'))?.value;
    // Never reuse a refresh token belonging to another Google identity.
    const refresh =
      tokens.refresh_token ||
      (previous && previous.email === email && !previous.disconnected ? previous.refresh : '');
    invariant(refresh, 'Google chưa cấp quyền offline. Ngắt kết nối và cấp lại quyền.', 400);
    await writeState('google', {
      refresh,
      access: tokens.access_token,
      expires: Date.now() + tokens.expires_in * 1000,
      email,
      scopes,
    });
  });
}
export async function accessToken(): Promise<string> {
  let entry = (await readState<GoogleConnection>('google'))?.value;
  invariant(entry?.refresh && !entry.disconnected, 'Vui lòng kết nối Google trong Cài đặt.', 409);
  if (entry.expires > Date.now() + 60_000) return entry.access;
  return withLock('google', async () => {
    entry = (await readState<GoogleConnection>('google'))?.value;
    invariant(entry?.refresh && !entry.disconnected, 'Vui lòng kết nối lại Google.', 401);
    if (entry.expires > Date.now() + 60_000) return entry.access;
    const result = await exchange({ refresh_token: entry.refresh, grant_type: 'refresh_token' });
    await writeState('google', {
      ...entry,
      access: result.access_token,
      refresh: result.refresh_token || entry.refresh,
      expires: Date.now() + result.expires_in * 1000,
    });
    return result.access_token;
  });
}
export async function disconnectGoogle() {
  await withLock('google', async () => {
    const entry = (await readState<GoogleConnection>('google'))?.value;
    if (entry?.refresh) {
      const response = await fetch('https://oauth2.googleapis.com/revoke', {
        method: 'POST',
        body: new URLSearchParams({ token: entry.refresh }),
        signal: AbortSignal.timeout(15000),
      });
      invariant(
        response.ok || response.status === 400,
        'Chưa xác nhận được thu hồi quyền Google. Hãy thử lại.',
        502,
      );
    }
    await writeState('google', {
      disconnected: true,
      refresh: '',
      access: '',
      expires: 0,
      email: '',
      scopes: [],
    });
  });
}
export async function googleFetch(url: string, options: RequestInit = {}) {
  // Call sites use only fixed Google API hosts, never client-supplied URLs.
  const response = await fetch(url, {
    ...options,
    headers: { ...options.headers, Authorization: `Bearer ${await accessToken()}` },
    signal: AbortSignal.timeout(18000),
    cache: 'no-store',
  });
  if (!response.ok) {
    const code = response.status;
    if (code === 401)
      throw new AppError(
        401,
        'Quyền Google đã hết hạn hoặc bị thu hồi. Hãy kết nối lại.',
        'GOOGLE_RECONNECT',
      );
    if (code === 403)
      throw new AppError(
        403,
        'Google từ chối quyền hoặc đã hết hạn mức. Kiểm tra chia sẻ Drive và quyền OAuth.',
      );
    if (code === 404)
      throw new AppError(404, 'Không tìm thấy mục Google hoặc tài khoản không có quyền truy cập.');
    throw new AppError(
      502,
      'Google API chưa hoàn tất. Kiểm tra kết quả trước khi thử lại.',
      'GOOGLE_FAILED',
    );
  }
  return response;
}
export async function googleJson<T>(url: string, options: RequestInit = {}): Promise<T> {
  return (await googleFetch(url, options)).json();
}
export const newOAuthState = randomToken;
