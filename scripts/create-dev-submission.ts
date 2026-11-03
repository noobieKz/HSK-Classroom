import * as nextEnv from '@next/env';
import assert from 'node:assert/strict';
import { writeFile, mkdir } from 'node:fs/promises';
import { environment, DEV_DRIVE_ROOT } from '../src/lib/environment';
import { loadData } from '../src/lib/sheets';
import { listFolder, FOLDER, generatedId, assertEnvironmentRoot } from '../src/lib/drive';
import { matchesStudentFolder } from '../src/lib/roster';
import { googleJson, googleFetch } from '../src/lib/google';
async function main() {
  nextEnv.loadEnvConfig(process.cwd());
  assert.equal(environment().mode, 'development');
  assert.equal(environment().root, DEV_DRIVE_ROOT);
  const data = await loadData();
  const session = data.Sessions.find((s) => s.name.startsWith('Buổi 01_'))!;
  assert.ok(session);
  const assignment = data.Assignments.find(
    (a) => a.session_id === session.id && a.status === 'active',
  )!;
  assert.ok(assignment);
  const student = data.Students.find((s) => s.name === 'Bùi Danh Thái')!;
  const folder = (await listFolder(session.folder_id)).find(
    (f) => f.mimeType === FOLDER && matchesStudentFolder(f.name, student.name),
  )!;
  assert.ok(folder);
  await assertEnvironmentRoot(folder.id);
  const name = 'BTVN_mau_DEV.txt';
  const existing = (await listFolder(folder.id)).filter((f) => f.name === name);
  assert.ok(existing.length <= 1);
  let fileId = existing[0]?.id;
  if (!fileId) {
    fileId = await generatedId();
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
  }
  await googleFetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    body: 'BÀI NỘP MẪU DEV — kiểm thử chức năng, không phải bài làm thật.\nHọc viên: Bùi Danh Thái\nNội dung mẫu: 中文 · Bài tập 1.\n',
  });
  const report = {
    dev_only: true,
    session_id: session.id,
    assignment_id: assignment.id,
    student_id: student.id,
    file_id: fileId,
    folder_id: folder.id,
  };
  await mkdir('test-results', { recursive: true });
  await writeFile('test-results/dev-student-submission.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : 'Failed');
  process.exitCode = 1;
});
