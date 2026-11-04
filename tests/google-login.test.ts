import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import {
  beginGoogleLogin,
  completeGoogleLogin,
  verifyGoogleLoginToken,
} from '../src/lib/google-login';
import { readState, writeState } from '../src/lib/store';
import { digest } from '../src/lib/crypto';
import { allowedGoogleEmails, localPasswordEnabled } from '../src/lib/login-policy';

test('Google login validates signature/claims, browser binding, expiry, replay and exact teacher allowlist', async () => {
  const saved = { ...process.env };
  const originalFetch = global.fetch;
  const dir = await mkdtemp(join(tmpdir(), 'classroom-google-login-'));
  const pair = await generateKeyPair('RS256');
  const jwk = {
    ...(await exportJWK(pair.publicKey)),
    kid: 'google-test-key',
    alg: 'RS256',
    use: 'sig',
  };
  Object.assign(process.env, {
    APP_URL: 'http://localhost:3000',
    CLASSROOM_ENV: 'development',
    STORAGE_DRIVER: 'file',
    PRIVATE_DATA_DIR: dir,
    ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    GOOGLE_CLIENT_ID: 'test-client',
    GOOGLE_CLIENT_SECRET: 'test-secret',
    GOOGLE_ALLOWED_EMAILS: 'Teacher@example.invalid',
    NETLIFY: '',
    CONTEXT: '',
  });
  let nonce = '',
    verifier = '',
    exchanges = 0;
  const sign = (claims: Record<string, unknown> = {}) =>
    new SignJWT({
      sub: 'google-teacher-sub',
      email: 'teacher@example.invalid',
      email_verified: true,
      nonce,
      iss: 'https://accounts.google.com',
      aud: 'test-client',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
      ...claims,
    })
      .setProtectedHeader({ alg: 'RS256', kid: jwk.kid })
      .sign(pair.privateKey);
  global.fetch = (async (input: any, options: any) => {
    const url = String(input);
    if (url === 'https://www.googleapis.com/oauth2/v3/certs') return Response.json({ keys: [jwk] });
    if (url === 'https://oauth2.googleapis.com/token') {
      exchanges++;
      verifier = options.body.get('code_verifier');
      assert.equal(options.body.get('redirect_uri'), 'http://localhost:3000/api/google/callback');
      return Response.json({
        id_token: await sign(),
        access_token: 'unused-login-access',
        expires_in: 3600,
      });
    }
    throw new Error('Unexpected external request in Google login test');
  }) as typeof fetch;
  try {
    const started = await beginGoogleLogin();
    const params = new URL(started.url).searchParams;
    nonce = params.get('nonce')!;
    const state = params.get('state')!;
    assert.equal(params.get('scope'), 'openid email');
    assert.equal(params.get('code_challenge_method'), 'S256');
    assert.equal(params.get('access_type'), null);
    await assert.rejects(completeGoogleLogin(state, 'x'.repeat(43), 'test-code'));
    assert.equal(exchanges, 0);
    assert.deepEqual(await completeGoogleLogin(state, started.binding, 'test-code'), {
      email: 'teacher@example.invalid',
      sub: 'google-teacher-sub',
    });
    assert.equal(
      Buffer.from(digest(verifier), 'hex').toString('base64url'),
      params.get('code_challenge'),
    );
    await assert.rejects(completeGoogleLogin(state, started.binding, 'test-code'));
    assert.equal(exchanges, 1);
    assert.equal(await readState('google'), null, 'Login never replaces the Drive connection');
    for (const claims of [
      { email: 'outsider@example.invalid' },
      { email: 'teacher@example.invalid.attacker.test' },
      { email_verified: false },
      { nonce: 'wrong' },
      { aud: 'other-client' },
      { iss: 'https://attacker.invalid' },
      { exp: 1 },
      { azp: 'other-client' },
      { iat: Math.floor(Date.now() / 1000) - 2000 },
      { sub: '' },
    ])
      await assert.rejects(verifyGoogleLoginToken(await sign(claims), nonce));
    const wrongPair = await generateKeyPair('RS256');
    const forged = await new SignJWT({ sub: 'forged' })
      .setProtectedHeader({ alg: 'RS256', kid: jwk.kid })
      .sign(wrongPair.privateKey);
    await assert.rejects(verifyGoogleLoginToken(forged, nonce));
    const expired = await beginGoogleLogin();
    const expiredState = new URL(expired.url).searchParams.get('state')!;
    const key = `login-oauth:${digest(expiredState)}`;
    const entry = await readState<any>(key);
    await writeState(key, { ...entry!.value, expires: Date.now() - 1 });
    await assert.rejects(completeGoogleLogin(expiredState, expired.binding, 'test-code'));
    process.env.GOOGLE_ALLOWED_EMAILS = '';
    await assert.rejects(beginGoogleLogin());
    assert.equal(allowedGoogleEmails().size, 0);
  } finally {
    global.fetch = originalFetch;
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
    await rm(dir, { recursive: true, force: true });
  }
});

test('Password login is available only on localhost DEV, never hosted previews or production', () => {
  const saved = { ...process.env };
  try {
    Object.assign(process.env, {
      APP_URL: 'http://localhost:3000',
      CLASSROOM_ENV: 'development',
      NETLIFY: '',
      CONTEXT: '',
    });
    assert.ok(localPasswordEnabled());
    process.env.APP_URL = 'https://private-classroom.example';
    assert.equal(localPasswordEnabled(), false);
    process.env.APP_URL = 'http://localhost:3000';
    process.env.CLASSROOM_ENV = 'production';
    assert.equal(localPasswordEnabled(), false);
    process.env.CLASSROOM_ENV = 'development';
    process.env.NETLIFY = 'true';
    assert.equal(localPasswordEnabled(), false);
    process.env.NETLIFY = '';
    process.env.CONTEXT = 'deploy-preview';
    assert.equal(localPasswordEnabled(), false);
    process.env.CONTEXT = '';
    delete process.env.APP_URL;
    assert.equal(localPasswordEnabled(), false);
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  }
});
