import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, createHmac } from 'node:crypto';
import { encrypt } from '../../src/lib/crypto';

test(
  'Hosted auth disables passwords, binds Google OAuth, and checks teacher permissions on every API request',
  { timeout: 60000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), 'classroom-hosted-auth-'));
    const appUrl = 'http://localhost:3101';
    const secret = randomBytes(48).toString('base64');
    const encryptionKey = randomBytes(32).toString('base64');
    const env = {
      ...process.env,
      APP_URL: appUrl,
      CLASSROOM_ENV: 'production',
      PRIVATE_DATA_DIR: dir,
      STORAGE_DRIVER: 'file',
      NETLIFY: '',
      CONTEXT: '',
      SESSION_SECRET: secret,
      ENCRYPTION_KEY: encryptionKey,
      GOOGLE_CLIENT_ID: 'test-client',
      GOOGLE_CLIENT_SECRET: 'test-secret',
      GOOGLE_ALLOWED_EMAILS: 'teacher@example.invalid',
      GOOGLE_SPREADSHEET_ID: '',
    };
    const oldKey = process.env.ENCRYPTION_KEY;
    process.env.ENCRYPTION_KEY = encryptionKey;
    await writeFile(
      join(dir, 'session%3Atest-google-session.json'),
      JSON.stringify({ etag: 'test', data: encrypt({ active: true }) }),
    );
    if (oldKey) process.env.ENCRYPTION_KEY = oldKey;
    else delete process.env.ENCRYPTION_KEY;
    const server = spawn(
      process.execPath,
      ['node_modules/next/dist/bin/next', 'start', '-p', '3101', '-H', '127.0.0.1'],
      { cwd: process.cwd(), env, stdio: 'ignore' },
    );
    const post = (action: string, payload: unknown = {}) =>
      fetch(`${appUrl}/api/app`, {
        method: 'POST',
        headers: { origin: appUrl, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, payload }),
      });
    const signed = (email: string) => {
      const data = Buffer.from(
        JSON.stringify({
          id: 'test-google-session',
          exp: Date.now() + 3600000,
          version: 'google-v1',
          csrf: 'test-csrf',
          method: 'google',
          email,
          sub: 'google-test-sub',
        }),
      ).toString('base64url');
      return `tm_session=${data}.${createHmac('sha256', secret).update(data).digest('base64url')}`;
    };
    try {
      for (let i = 0; i < 100; i++) {
        try {
          if ((await fetch(`${appUrl}/api/app`)).ok) break;
        } catch {}
        await new Promise((resolve) => setTimeout(resolve, 100));
        if (i === 99) throw new Error('Server not ready');
      }
      const bootstrap = await (await fetch(`${appUrl}/api/app`)).json();
      assert.deepEqual(bootstrap, {
        authenticated: false,
        login: { google: true, localPassword: false },
      });
      assert.equal((await post('login', { username: 'admin', password: 'admin' })).status, 403);
      const started = await post('google-login');
      assert.equal(started.status, 200);
      assert.match(started.headers.get('set-cookie')!, /HttpOnly/);
      assert.match(started.headers.get('set-cookie')!, /SameSite=lax/i);
      const url = new URL((await started.json()).url);
      assert.equal(url.searchParams.get('scope'), 'openid email');
      const callback = await fetch(
        `${appUrl}/api/google/callback?state=${url.searchParams.get('state')}&code=test-code`,
        { redirect: 'manual' },
      );
      assert.equal(callback.status, 303);
      assert.equal(
        callback.headers.get('location'),
        `${appUrl}/?login=failed`,
        'Missing browser binding cannot create a login session',
      );
      assert.ok(!(callback.headers.get('set-cookie') || '').includes('tm_session='));
      const allowed = await (
        await fetch(`${appUrl}/api/app`, { headers: { cookie: signed('teacher@example.invalid') } })
      ).json();
      assert.equal(allowed.authenticated, true);
      assert.equal(allowed.user.email, 'teacher@example.invalid');
      for (const action of ['data', 'health', 'export', 'drive', 'review-text', 'homework-folder'])
        assert.equal(
          (
            await fetch(`${appUrl}/api/app?action=${action}`, {
              headers: { cookie: signed('outsider@example.invalid') },
            })
          ).status,
          401,
          action,
        );
      const denied = await (
        await fetch(`${appUrl}/api/app`, {
          headers: { cookie: signed('outsider@example.invalid') },
        })
      ).json();
      assert.equal(denied.authenticated, false);
    } finally {
      server.kill();
      await new Promise<void>((resolve) => {
        if (server.exitCode !== null) resolve();
        else server.once('exit', () => resolve());
      });
      await rm(dir, { recursive: true, force: true });
    }
  },
);
