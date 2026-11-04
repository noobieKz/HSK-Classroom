import { NextResponse } from 'next/server';
import { requireSession, origin, issueGoogleSession } from '@/lib/auth';
import { cookies } from 'next/headers';
import { completeGoogleLogin, googleLoginCookie } from '@/lib/google-login';
import { readState, writeState } from '@/lib/store';
import { digest } from '@/lib/crypto';
import { saveConnection } from '@/lib/google';
import { invariant } from '@/lib/errors';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const state = params.get('state') || '';
  if (state.startsWith('login_')) {
    const jar = await cookies();
    const cookie = googleLoginCookie(origin().startsWith('https:'));
    let loggedIn = false;
    try {
      invariant(!params.has('error'), 'Google chưa cho phép đăng nhập.', 403);
      const identity = await completeGoogleLogin(
        state,
        jar.get(cookie)?.value || '',
        params.get('code') || '',
      );
      await issueGoogleSession(identity);
      loggedIn = true;
    } catch {
      /* Never log callback URL, codes, tokens or identity claims. */
    }
    jar.delete(cookie);
    return NextResponse.redirect(`${origin()}/?login=${loggedIn ? 'success' : 'failed'}`, {
      status: 303,
      headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
    });
  }
  let success = false;
  try {
    const session = await requireSession();
    invariant(/^[\w-]{40,100}$/.test(state), 'OAuth state không hợp lệ.', 403);
    const key = `oauth:${digest(state)}`;
    const entry = await readState<{
      state: string;
      verifier: string;
      session_id: string;
      expires: number;
      consumed: boolean;
    }>(key);
    invariant(
      entry &&
        !entry.value.consumed &&
        entry.value.state === state &&
        entry.value.session_id === session.id &&
        entry.value.expires > Date.now(),
      'Phiên OAuth không hợp lệ hoặc đã hết hạn.',
      403,
    );
    invariant(
      await writeState(key, { ...entry.value, consumed: true }, { onlyIfMatch: entry.etag }),
      'Phiên OAuth đã được sử dụng.',
      403,
    );
    invariant(!params.has('error') && params.get('code'), 'Google chưa cấp quyền.');
    await saveConnection(params.get('code')!, entry.value.verifier);
    success = true;
  } catch {
    /* Never log callback URL, authorization code or token errors. */
  }
  return NextResponse.redirect(`${origin()}/?oauth=${success ? 'connected' : 'failed'}`, {
    status: 303,
    headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
  });
}
