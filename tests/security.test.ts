import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { hashPassword, verifyPassword, encrypt, decrypt } from '../src/lib/crypto';
import { readState, writeState, withLock } from '../src/lib/store';
import { publicError } from '../src/lib/errors';
process.env.ENCRYPTION_KEY = randomBytes(32).toString('base64');
process.env.STORAGE_DRIVER = 'file';
test('Password hashes have unique salts and reject wrong passwords', () => {
  const hash = hashPassword('Mật khẩu thử 12345');
  assert.notEqual(hash, hashPassword('Mật khẩu thử 12345'));
  assert.ok(verifyPassword('Mật khẩu thử 12345', hash));
  assert.equal(verifyPassword('wrong', hash), false);
  assert.equal(verifyPassword('x', 'malformed'), false);
});
test('AES-GCM preserves Unicode and rejects ciphertext tampering', () => {
  const payload = { refresh: 'token-for-tests', text: 'Tiếng Việt\n中文' };
  const data = encrypt(payload);
  assert.deepEqual(decrypt(data), payload);
  assert.ok(!data.includes('token-for-tests'));
  const bytes = Buffer.from(data, 'base64');
  bytes[30] ^= 1;
  assert.throws(() => decrypt(bytes.toString('base64')));
});
test('Technical state uses encryption, CAS and a mutex which is not stolen', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'tue-minh-test-'));
  process.env.PRIVATE_DATA_DIR = dir;
  try {
    const etag = await writeState('test', { token: 'secret' }, { onlyIfNew: true });
    assert.ok(etag);
    assert.equal(await writeState('test', { token: 'other' }, { onlyIfNew: true }), null);
    assert.equal(await writeState('test', { token: 'other' }, { onlyIfMatch: 'wrong' }), null);
    assert.deepEqual((await readState('test'))?.value, { token: 'secret' });
    assert.ok(!(await readFile(join(dir, 'test.json'), 'utf8')).includes('secret'));
    await withLock('test', async () => {
      await assert.rejects(
        withLock('test', async () => true),
        /thao tác khác/,
      );
    });
    assert.equal(await withLock('test', async () => 42), 42);
    const sequence: string[] = [];
    await Promise.all(
      [1, 2, 3].map((index) =>
        withLock(
          'queued',
          async () => {
            sequence.push(`start${index}`);
            await new Promise((resolve) => setTimeout(resolve, 20));
            sequence.push(`end${index}`);
          },
          2000,
        ),
      ),
    );
    assert.equal(sequence.length, 6);
    for (let i = 0; i < sequence.length; i += 2)
      assert.equal(sequence[i].slice(5), sequence[i + 1].slice(3));
    const lock = await readState('lock:test');
    assert.ok(lock);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('Unexpected errors never expose upstream tokens, secrets or callback codes', () => {
  const result = publicError(new Error('client_secret=SECRET&code=CODE&access_token=TOKEN'));
  assert.equal(result.status, 500);
  assert.ok(!JSON.stringify(result).match(/SECRET|CODE|TOKEN/));
});
