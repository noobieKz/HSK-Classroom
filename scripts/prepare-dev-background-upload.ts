import * as nextEnv from '@next/env';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { environment, DEV_DRIVE_ROOT } from '../src/lib/environment';
import { loadData } from '../src/lib/sheets';
import { listFolder, FOLDER, generatedId, assertEnvironmentRoot } from '../src/lib/drive';
import { matchesStudentFolder } from '../src/lib/roster';
import { googleJson, googleFetch } from '../src/lib/google';
import { syncAssignment } from '../src/lib/business';
async function main() {
  nextEnv.loadEnvConfig(process.cwd());
  assert.equal(environment().mode, 'development');
  assert.equal(environment().root, DEV_DRIVE_ROOT);
  const fixture = JSON.parse(await readFile('test-results/dev-student-submission.json', 'utf8'));
  const data = await loadData();
  const session = data.Sessions.find((s) => s.id === fixture.session_id)!;
  assert.ok(session);
  const student = data.Students.find((s) => s.name === 'Bùi Minh Đức')!;
  assert.ok(student);
  const folder = (await listFolder(session.folder_id)).find(
    (f) => f.mimeType === FOLDER && matchesStudentFolder(f.name, student.name),
  )!;
  assert.ok(folder);
  await assertEnvironmentRoot(folder.id);
  const name = 'BTVN_mau_hang_doi_DEV.txt';
  const existing = (await listFolder(folder.id)).filter((f) => f.name === name);
  assert.ok(existing.length <= 1);
  const fileId = existing[0]?.id || (await generatedId());
  if (!existing.length)
    await googleJson('https://www.googleapis.com/drive/v3/files?fields=id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: fileId,
        name,
        mimeType: 'text/plain',
        parents: [folder.id],
        appProperties: { tm_dev_submission: 'true' },
      }),
    });
  await googleFetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    body: 'BÀI MẪU DEV — kiểm thử chấm học viên khác khi upload nền. Không phải bài làm thật.\n',
  });
  const result = await syncAssignment(fixture.assignment_id, randomUUID());
  assert.ok(!('error' in result), JSON.stringify(result));
  const bytes = Buffer.alloc(8 * 1024 * 1024 + 23, 'a');
  bytes.write('DEV ONLY — attachment for background upload test. Not a real teacher document.\n');
  await writeFile('test-results/teacher-background-dev.bin', bytes);
  const report = {
    dev_only: true,
    second_student_id: student.id,
    second_folder_id: folder.id,
    second_submission_file_id: fileId,
    first_student_folder_id: fixture.folder_id,
    attachment_name: 'teacher-background-dev.bin',
    attachment_bytes: bytes.length,
  };
  await writeFile('test-results/background-upload-fixture.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : 'Failed');
  process.exitCode = 1;
});
