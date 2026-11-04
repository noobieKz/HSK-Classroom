import { createRemoteJWKSet, jwtVerify, customFetch } from 'jose';
import { randomToken, digest } from './crypto';
import { readState, writeState } from './store';
import { googleConfig, callbackUrl, exchange } from './google';
import { allowedGoogleEmails, loginOptions } from './login-policy';
import { invariant } from './errors';

const keys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'), {
  [customFetch]: (url, options) => fetch(url, { ...options, cache: 'no-store' }),
});
type LoginAttempt = {
  binding: string;
  verifier: string;
  nonce: string;
  expires: number;
  consumed: boolean;
};
export const googleLoginCookie = (secure: boolean) =>
  secure ? '__Host-tm_google_login' : 'tm_google_login';

export async function beginGoogleLogin() {
  invariant(
    loginOptions().google,
    'Chưa cấu hình OAuth hoặc danh sách email giáo viên được phép đăng nhập.',
    503,
  );
  const state = `login_${randomToken()}`;
  const binding = randomToken();
  const verifier = randomToken();
  const nonce = randomToken();
  invariant(
    await writeState(
      `login-oauth:${digest(state)}`,
      {
        binding: digest(binding),
        verifier,
        nonce,
        expires: Date.now() + 10 * 60000,
        consumed: false,
      },
      { onlyIfNew: true },
    ),
    'Không khởi tạo được phiên đăng nhập Google.',
    503,
  );
  const params = new URLSearchParams({
    client_id: googleConfig().client_id,
    redirect_uri: callbackUrl(),
    response_type: 'code',
    scope: 'openid email',
    state,
    nonce,
    prompt: 'select_account',
    code_challenge: Buffer.from(digest(verifier), 'hex').toString('base64url'),
    code_challenge_method: 'S256',
  });
  return { url: `https://accounts.google.com/o/oauth2/v2/auth?${params}`, binding };
}
export async function verifyGoogleLoginToken(token: string, nonce: string) {
  const clientId = googleConfig().client_id;
  const { payload } = await jwtVerify(token, keys, {
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    audience: clientId,
    algorithms: ['RS256'],
    requiredClaims: ['sub', 'exp', 'iat', 'email', 'email_verified', 'nonce'],
    maxTokenAge: '10m',
    clockTolerance: 30,
  });
  invariant(payload.nonce === nonce, 'Phiên đăng nhập Google không hợp lệ.', 403);
  invariant(
    (!payload.azp || payload.azp === clientId) &&
      (!Array.isArray(payload.aud) || payload.azp === clientId),
    'Google token không dành cho ứng dụng này.',
    403,
  );
  invariant(
    payload.email_verified === true && typeof payload.email === 'string' && !!payload.sub,
    'Google chưa xác minh email của tài khoản này.',
    403,
  );
  const email = payload.email.toLowerCase();
  invariant(
    allowedGoogleEmails().has(email),
    'Tài khoản Google không có quyền truy cập lớp học.',
    403,
  );
  return { email, sub: payload.sub };
}
export async function completeGoogleLogin(state: string, binding: string, code: string) {
  invariant(
    /^login_[\w-]{40,100}$/.test(state) && /^[\w-]{40,100}$/.test(binding),
    'Phiên đăng nhập không hợp lệ.',
    403,
  );
  const key = `login-oauth:${digest(state)}`;
  const entry = await readState<LoginAttempt>(key);
  invariant(
    entry &&
      !entry.value.consumed &&
      entry.value.expires > Date.now() &&
      entry.value.binding === digest(binding),
    'Phiên đăng nhập hết hạn hoặc không khớp trình duyệt.',
    403,
  );
  invariant(
    await writeState(key, { ...entry.value, consumed: true }, { onlyIfMatch: entry.etag }),
    'Phiên đăng nhập đã được sử dụng.',
    403,
  );
  invariant(code.length > 0 && code.length <= 4096, 'Google chưa cấp mã đăng nhập.', 403);
  const token = await exchange({
    code,
    code_verifier: entry.value.verifier,
    redirect_uri: callbackUrl(),
    grant_type: 'authorization_code',
  });
  invariant(token.id_token, 'Google chưa trả thông tin đăng nhập.', 403);
  // Login does not persist access/refresh tokens or replace the existing Drive connection.
  return verifyGoogleLoginToken(token.id_token, entry.value.nonce);
}
