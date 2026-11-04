import * as nextEnv from '@next/env';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { environment, DEV_DRIVE_ROOT } from '../src/lib/environment';
import { listFolder, generatedId, assertEnvironmentRoot } from '../src/lib/drive';
import { googleJson, googleFetch } from '../src/lib/google';
import { syncAssignment } from '../src/lib/business';
async function main() {
  nextEnv.loadEnvConfig(process.cwd());
  assert.equal(environment().mode, 'development');
  assert.equal(environment().root, DEV_DRIVE_ROOT);
  const fixture = JSON.parse(await readFile('test-results/dev-student-submission.json', 'utf8'));
  await assertEnvironmentRoot(fixture.folder_id);
  const children = await listFolder(fixture.folder_id);
  const reports = [];
  for (const [name, mime] of [
    ['DEV_01_anh.png', 'image/png'],
    ['DEV_02_anh.png', 'image/png'],
    ['DEV_03_video.mp4', 'video/mp4'],
  ]) {
    const bytes = await readFile(`test-results/${name}`);
    if (mime === 'video/mp4') assert.equal(bytes.subarray(4, 8).toString(), 'ftyp');
    const existing = children.filter((f) => f.name === name);
    assert.ok(existing.length <= 1);
    if (existing[0]) assert.equal(existing[0].appProperties?.tm_dev_submission, 'true');
    const id = existing[0]?.id || (await generatedId());
    if (!existing.length)
      await googleJson('https://www.googleapis.com/drive/v3/files?fields=id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          name,
          mimeType: mime,
          parents: [fixture.folder_id],
          appProperties: { tm_dev_submission: 'true' },
        }),
      });
    await googleFetch(`https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=media`, {
      method: 'PATCH',
      headers: { 'Content-Type': mime },
      body: new Uint8Array(bytes),
    });
    reports.push({ name, id, mime });
  }
  const result = await syncAssignment(fixture.assignment_id, randomUUID());
  assert.ok(!('error' in result), JSON.stringify(result));
  const report = {
    dev_only: true,
    files: reports,
    video_source: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
    result,
  };
  await writeFile('test-results/multiple-preview-fixture.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : 'Failed');
  process.exitCode = 1;
});
