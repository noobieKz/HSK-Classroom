import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { readState, withLock, writeState } from '../src/lib/store';

test('Only an upload lock older than five minutes can be resumed', async () => {
  process.env.PRIVATE_DATA_DIR = await mkdtemp(join(tmpdir(), 'tue-minh-upload-lock-'));
  process.env.STORAGE_DRIVER = 'file';
  process.env.ENCRYPTION_KEY = randomBytes(32).toString('base64');
  process.env.CLASSROOM_ENV = 'development';
  const id = 'upload-test-id';
  await writeState(`lock:upload:${id}`, {
    busy: true,
    owner: 'previous',
    started: Date.now() - 6 * 60_000,
  });
  assert.equal(await withLock(`upload:${id}`, async () => 42, 0, true), 42);
  assert.equal((await readState<{ busy: boolean }>(`lock:upload:${id}`))?.value.busy, false);
  await writeState('lock:business', {
    busy: true,
    owner: 'previous',
    started: Date.now() - 6 * 60_000,
  });
  await assert.rejects(withLock('business', async () => 0), /thao tác khác/);
  assert.equal((await readState<{ busy: boolean }>('lock:business'))?.value.busy, true);
});
