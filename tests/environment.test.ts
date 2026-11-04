import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { DEV_DRIVE_ROOT, PRODUCTION_DRIVE_ROOT, environment } from '../src/lib/environment';
import { sheetConfig, sheetStateKey } from '../src/lib/sheets';
import { assertEnvironmentRoot, inside, FOLDER } from '../src/lib/drive';
import { writeState } from '../src/lib/store';

test('DEV root cannot be pointed to a production folder by changing DRIVE_ROOT_ID', () => {
  process.env.CLASSROOM_ENV = 'development';
  process.env.DRIVE_ROOT_ID = 'other_folder_01';
  assert.throws(environment, /dev chỉ được dùng/);
  process.env.DRIVE_ROOT_ID = DEV_DRIVE_ROOT;
  assert.equal(environment().root, DEV_DRIVE_ROOT);
});
test('DEV ancestry guard rejects outside roots and submission mapping rejects feedback descendants', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'tm-env-'));
  const original = global.fetch;
  process.env.STORAGE_DRIVER = 'file';
  process.env.PRIVATE_DATA_DIR = dir;
  process.env.ENCRYPTION_KEY = randomBytes(32).toString('base64');
  process.env.CLASSROOM_ENV = 'development';
  process.env.DRIVE_ROOT_ID = DEV_DRIVE_ROOT;
  const files: Record<string, unknown> = {
    folder_dev_child: {
      id: 'folder_dev_child',
      name: 'DEV CHILD',
      mimeType: FOLDER,
      parents: [DEV_DRIVE_ROOT],
    },
    folder_outside_01: { id: 'folder_outside_01', name: 'OUTSIDE', mimeType: FOLDER, parents: [] },
    folder_feedback01: {
      id: 'folder_feedback01',
      name: 'Nhan_xet_GV',
      mimeType: FOLDER,
      parents: ['folder_dev_child'],
    },
    teacher_video_01: {
      id: 'teacher_video_01',
      name: 'Video.mp4',
      mimeType: 'video/mp4',
      parents: ['folder_feedback01'],
    },
  };
  global.fetch = async (input) =>
    new Response(JSON.stringify(files[String(input).split('?')[0].split('/').at(-1)!] || {}), {
      headers: { 'Content-Type': 'application/json' },
    });
  try {
    await writeState('google', { refresh: 'test', access: 'test', expires: Date.now() + 1000000 });
    await assertEnvironmentRoot('folder_dev_child');
    await assert.rejects(assertEnvironmentRoot('folder_outside_01'), /thư mục cha/);
    await assertEnvironmentRoot('folder_feedback01'); // Writing teacher feedback is allowed inside DEV.
    await assert.rejects(inside('teacher_video_01', 'folder_dev_child'), /nhận xét GV/); // Counting it as a submission is not.
  } finally {
    global.fetch = original;
    await rm(dir, { recursive: true, force: true });
  }
});

test('Sheets configuration is isolated by environment and root and ignores legacy DEV configuration', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'tm-root-config-'));
  process.env.PRIVATE_DATA_DIR = dir;
  process.env.STORAGE_DRIVER = 'file';
  process.env.ENCRYPTION_KEY = randomBytes(32).toString('base64');
  process.env.CLASSROOM_ENV = 'development';
  process.env.DRIVE_ROOT_ID = DEV_DRIVE_ROOT;
  try {
    await writeState('sheet-config', { id: 'legacy_sheet_01' });
    assert.equal(await sheetConfig(), null);
    const devKey = sheetStateKey('sheet-config');
    await writeState(devKey, { id: 'new_dev_sheet_01' });
    assert.equal((await sheetConfig())?.id, 'new_dev_sheet_01');
    process.env.CLASSROOM_ENV = 'production';
    process.env.CLASSROOM_TEST_STORAGE = 'isolated';
    process.env.DRIVE_ROOT_ID = PRODUCTION_DRIVE_ROOT;
    assert.notEqual(sheetStateKey('sheet-config'), devKey);
    assert.equal(await sheetConfig(), null);
    await writeState(sheetStateKey('sheet-config'), { id: 'production_sheet_01' });
    process.env.CLASSROOM_ENV = 'development';
    process.env.DRIVE_ROOT_ID = DEV_DRIVE_ROOT;
    assert.equal((await sheetConfig())?.id, 'new_dev_sheet_01');
  } finally {
    delete process.env.CLASSROOM_TEST_STORAGE;
    process.env.CLASSROOM_ENV = 'development';
    process.env.DRIVE_ROOT_ID = DEV_DRIVE_ROOT;
    await rm(dir, { recursive: true, force: true });
  }
});
