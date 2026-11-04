import * as nextEnv from '@next/env';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { environment, DEV_DRIVE_ROOT } from '../src/lib/environment';
import { loadData } from '../src/lib/sheets';
import { homeworkFolder, listFolder, assertEnvironmentRoot } from '../src/lib/drive';
import { googleFetch } from '../src/lib/google';
import { syncAssignment } from '../src/lib/business';
import { randomUUID } from 'node:crypto';

async function main() {
  nextEnv.loadEnvConfig(process.cwd());
  assert.equal(environment().mode, 'development');
  assert.equal(environment().root, DEV_DRIVE_ROOT);
  const data = await loadData();
  const reports = [];
  for (const session of data.Sessions) {
    await assertEnvironmentRoot(session.folder_id);
    const legacy = (await listFolder(session.folder_id)).filter((f) => f.name === 'BTVN.txt');
    assert.ok(legacy.length <= 1);
    const content = legacy.length
      ? await (
          await googleFetch(`https://www.googleapis.com/drive/v3/files/${legacy[0].id}?alt=media`)
        ).text()
      : undefined;
    const folder = await homeworkFolder(session.folder_id);
    assert.equal(await homeworkFolder(session.folder_id), folder);
    assert.equal(
      (await listFolder(session.folder_id)).filter((f) => f.name === 'BTVN.txt').length,
      0,
    );
    const files = await listFolder(folder);
    if (legacy.length) {
      assert.ok(files.some((f) => f.id === legacy[0].id));
      assert.equal(
        await (
          await googleFetch(`https://www.googleapis.com/drive/v3/files/${legacy[0].id}?alt=media`)
        ).text(),
        content,
      );
    }
    reports.push({
      session: session.name,
      folder_id: folder,
      file_ids: files.map((f) => f.id),
      legacy_moved_this_run: legacy.length > 0,
    });
  }
  const syncs = [];
  for (const assignment of data.Assignments.filter((a) => a.status === 'active')) {
    const result = await syncAssignment(assignment.id, randomUUID());
    assert.ok(!('error' in result), JSON.stringify(result));
    const after = await loadData();
    const submissions = new Set(
      after.Submissions.filter((s) => s.assignment_id === assignment.id).map((s) => s.id),
    );
    const present = (rows: typeof data.SubmissionFiles) =>
      rows
        .filter((f) => submissions.has(f.submission_id) && f.present === 'true')
        .map((f) => f.drive_id)
        .sort();
    assert.deepEqual(present(after.SubmissionFiles), present(data.SubmissionFiles));
    syncs.push({ assignment_id: assignment.id, result, student_file_ids_unchanged: true });
  }
  const report = { dev_only: true, tested_at: new Date().toISOString(), reports, syncs };
  await writeFile('docs/dev-homework-folders.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
