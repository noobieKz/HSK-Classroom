import * as nextEnv from '@next/env';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { environment, DEV_DRIVE_ROOT } from '../src/lib/environment';
import { loadData } from '../src/lib/sheets';
import { listFolder, FOLDER, generatedId, assertEnvironmentRoot, getFile } from '../src/lib/drive';
import { matchesStudentFolder } from '../src/lib/roster';
import { googleJson, googleFetch } from '../src/lib/google';
import { syncAssignment } from '../src/lib/business';
import { submissionStatus } from '../src/lib/model';

async function main() {
  nextEnv.loadEnvConfig(process.cwd());
  assert.equal(environment().mode, 'development');
  assert.equal(environment().root, DEV_DRIVE_ROOT);
  const fixture = JSON.parse(await readFile('test-results/dev-student-submission.json', 'utf8'));
  const data = await loadData();
  const assignment = data.Assignments.find((a) => a.id === fixture.assignment_id)!;
  assert.ok(assignment);
  const session = data.Sessions.find((s) => s.id === assignment.session_id)!;
  await assertEnvironmentRoot(session.folder_id);
  const folders = await listFolder(session.folder_id);
  const media = [
    { source: 'DEV_01_anh.png', name: '01_anh.png', mime: 'image/png' },
    { source: 'DEV_02_anh.png', name: '02_anh.png', mime: 'image/png' },
    { source: 'DEV_03_video.mp4', name: '03_video.mp4', mime: 'video/mp4' },
    { source: 'DEV_03_video.mp4', name: '04_video.mp4', mime: 'video/mp4' },
  ];
  const cases = [
    { name: 'multiple-images', student: 'Đặng Ngọc Anh Vũ', media: media.slice(0, 2) },
    { name: 'multiple-videos', student: 'Đặng Ngọc Đức', media: media.slice(2) },
    { name: 'mixed-images-videos', student: 'Đặng Phương Dung', media },
  ];
  const reports = [];
  const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
  for (const test of cases) {
    const student = data.Students.find((s) => s.name === test.student)!;
    assert.ok(student);
    const folder = folders.find(
      (f) => f.mimeType === FOLDER && matchesStudentFolder(f.name, student.name),
    )!;
    assert.ok(folder);
    await assertEnvironmentRoot(folder.id);
    const children = await listFolder(folder.id);
    // Upload each batch concurrently, as when multiple files arrive in a student folder.
    const outcomes = await Promise.allSettled(
      test.media.map(async (item) => {
        const name = `DEV_BATCH_${item.name}`;
        const bytes = await readFile(`test-results/${item.source}`);
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
              mimeType: item.mime,
              parents: [folder.id],
              appProperties: { tm_dev_submission: 'true' },
            }),
          });
        await googleFetch(
          `https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=media`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': item.mime },
            body: new Uint8Array(bytes),
          },
        );
        const metadata = await getFile(id);
        assert.equal(metadata.mimeType, item.mime);
        assert.equal(Number(metadata.size), bytes.length);
        assert.deepEqual(metadata.parents, [folder.id]);
        const downloaded = new Uint8Array(
          await (
            await googleFetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`)
          ).arrayBuffer(),
        );
        assert.equal(digest(downloaded), digest(bytes));
        return { id, name, mime: item.mime, bytes: bytes.length, sha256: digest(bytes) };
      }),
    );
    const failures = outcomes.filter((o) => o.status === 'rejected');
    assert.deepEqual(failures, [], `Upload failure in ${test.name}`);
    const files = outcomes.map((o) => {
      assert.equal(o.status, 'fulfilled');
      return o.value;
    });
    reports.push({
      case: test.name,
      student_id: student.id,
      student: student.name,
      folder_id: folder.id,
      files,
    });
  }
  const syncs = [];
  for (let pass = 1; pass <= 2; pass++) {
    const result = await syncAssignment(assignment.id, randomUUID());
    assert.ok(!('error' in result), JSON.stringify(result));
    const after = await loadData();
    const statuses = reports.map((test) => {
      const state = submissionStatus(after, assignment, test.student_id);
      for (const uploaded of test.files) {
        const matches = state.files.filter((f) => f.drive_id === uploaded.id);
        assert.equal(matches.length, 1, `Missing/duplicate ${uploaded.name}, pass ${pass}`);
        assert.equal(matches[0].mime, uploaded.mime);
      }
      assert.ok(
        ['timing_unknown', 'submitted', 'late'].includes(state.status),
        state.status,
      );
      return { case: test.case, status: state.status, files: state.files.length };
    });
    syncs.push({ pass, result, statuses });
  }
  const report = {
    dev_only: true,
    tested_at: new Date().toISOString(),
    cases: reports,
    syncs,
    video_note: 'Two distinct Drive files use the same CC0 flower.mp4 source clip.',
  };
  await writeFile('test-results/dev-media-batches.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
