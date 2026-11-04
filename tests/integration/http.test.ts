import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, createHmac } from 'node:crypto';
import { encrypt } from '../../src/lib/crypto';

test(
  'Built HTTP app: fixed admin account, private API gates, CSRF, logout and no login lockout',
  { timeout: 60000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tue-minh-http-'));
    const appUrl = 'http://localhost:3100';
    const env = {
      ...process.env,
      APP_URL: appUrl,
      PRIVATE_DATA_DIR: dir,
      STORAGE_DRIVER: 'file',
      NETLIFY: '',
      CONTEXT: '',
      ENCRYPTION_KEY: randomBytes(32).toString('base64'),
      SESSION_SECRET: randomBytes(48).toString('base64'),
      GOOGLE_CLIENT_ID: '',
      GOOGLE_CLIENT_SECRET: '',
      GOOGLE_SPREADSHEET_ID: '',
    };
    const previousKey = process.env.ENCRYPTION_KEY;
    process.env.ENCRYPTION_KEY = env.ENCRYPTION_KEY;
    await writeFile(
      join(dir, 'login-limit.json'),
      JSON.stringify({
        etag: 'old-lockout',
        data: encrypt({ failures: 999, until: Date.now() + 24 * 3600000 }),
      }),
    );
    await writeFile(
      join(dir, 'lock%3Alogin.json'),
      JSON.stringify({
        etag: 'old-login-lock',
        data: encrypt({ busy: true, owner: 'legacy', started: Date.now() }),
      }),
    );
    if (previousKey) process.env.ENCRYPTION_KEY = previousKey;
    else delete process.env.ENCRYPTION_KEY;
    const server = spawn(
      process.execPath,
      ['node_modules/next/dist/bin/next', 'start', '-p', '3100', '-H', '127.0.0.1'],
      { cwd: process.cwd(), env, stdio: 'pipe' },
    );
    // Do not print request logs or environment; tests report assertions only.
    let output = '';
    server.stdout.on('data', (d) => {
      output += String(d);
    });
    server.stderr.on('data', (d) => {
      output += String(d);
    });
    const get = async (action: string, cookie = '') =>
      fetch(`${appUrl}/api/app?action=${action}`, { headers: { cookie } });
    const post = async (
      action: string,
      payload: unknown = {},
      cookie = '',
      token = '',
      origin = appUrl,
    ) =>
      fetch(`${appUrl}/api/app`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', origin, cookie, 'x-csrf-token': token },
        body: JSON.stringify({ action, payload, operationId: crypto.randomUUID() }),
      });
    const cookieOf = (response: Response) => response.headers.get('set-cookie')!.split(';')[0];
    try {
      for (let i = 0; i < 100; i++) {
        try {
          const r = await get('bootstrap');
          if (r.ok) break;
        } catch {}
        await new Promise((r) => setTimeout(r, 100));
        if (i === 99) throw new Error('Test server did not become ready.');
      }
      assert.deepEqual(await (await get('bootstrap')).json(), { authenticated: false });
      for (const action of ['data', 'drive', 'health', 'export', 'review-text'])
        assert.equal((await get(action)).status, 401, action);
      assert.equal(
        (
          await post(
            'login',
            { username: 'admin', password: 'admin' },
            '',
            '',
            'https://attacker.invalid',
          )
        ).status,
        403,
      );
      const logged = await post('login', { username: 'admin', password: 'admin' });
      assert.equal(logged.status, 200);
      const cookie = cookieOf(logged);
      assert.match(logged.headers.get('set-cookie')!, /HttpOnly/i);
      assert.match(logged.headers.get('set-cookie')!, /SameSite=lax/i);
      const bootstrap = await (await get('bootstrap', cookie)).json();
      assert.equal(bootstrap.authenticated, true);
      assert.ok(!('mustChange' in bootstrap));
      assert.equal(
        (await post('password', { old: 'admin', password: 'other' }, cookie, bootstrap.csrf))
          .status,
        400,
        'Password-change feature does not exist',
      );
      const [cookieName, rawCookie] = cookie.split('=');
      const session = JSON.parse(Buffer.from(rawCookie.split('.')[0], 'base64url').toString());
      const expired = Buffer.from(JSON.stringify({ ...session, exp: Date.now() - 1000 })).toString(
        'base64url',
      );
      const expiredCookie = `${cookieName}=${expired}.${createHmac('sha256', env.SESSION_SECRET).update(expired).digest('base64url')}`;
      assert.equal(
        (await get('health', expiredCookie)).status,
        401,
        'Expired signed session is rejected',
      );
      const badCallback = await fetch(
        `${appUrl}/api/google/callback?state=invalid&code=test-only`,
        { headers: { cookie }, redirect: 'manual' },
      );
      assert.equal(badCallback.status, 303);
      assert.equal(badCallback.headers.get('location'), `${appUrl}/?oauth=failed`);
      assert.equal(
        (await get('data', cookie)).status,
        409,
        'No fake data when no Google Sheets exists',
      );
      assert.equal(
        (await post('google-connect', {}, cookie, bootstrap.csrf)).status,
        503,
        'Missing Google config gives actionable error',
      );
      assert.equal((await post('student', {}, cookie, 'wrong')).status, 403);
      const home = await (await fetch(appUrl)).text();
      assert.ok(!home.includes('Đặt mật khẩu riêng'));
      const loggedOut = await post('logout', {}, cookie, bootstrap.csrf);
      assert.equal(loggedOut.status, 200);
      assert.equal(
        (await get('health', cookie)).status,
        401,
        'Logged-out cookie is revoked server-side',
      );
      for (let i = 0; i < 12; i++)
        assert.equal((await post('login', { username: 'admin', password: 'wrong' })).status, 401);
      assert.equal(
        (await post('login', { username: 'admin', password: 'admin' })).status,
        200,
        'Correct admin credentials work after repeated mistakes and ignore legacy lockout state',
      );
      assert.ok(!output.includes('password='), 'Passwords never appear in server output');
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
