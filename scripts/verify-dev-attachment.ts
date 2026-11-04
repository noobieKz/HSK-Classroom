import * as nextEnv from '@next/env';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { environment, DEV_DRIVE_ROOT } from '../src/lib/environment';
import { loadData } from '../src/lib/sheets';
import { getFile, listFolder } from '../src/lib/drive';
import { googleFetch } from '../src/lib/google';
async function main() {
  nextEnv.loadEnvConfig(process.cwd());
  assert.equal(environment().mode, 'development');
  assert.equal(environment().root, DEV_DRIVE_ROOT);
  const fixture = JSON.parse(await readFile('test-results/dev-student-submission.json', 'utf8'));
  const data = await loadData();
  const file = data.ReviewFiles.filter((f) => f.name === 'gv-feedback-dev.txt').at(-1)!;
  assert.ok(file);
  const review = data.Reviews.find((r) => r.id === file.review_id)!;
  assert.ok(review);
  const sub = data.Submissions.find((s) => s.id === review.submission_id)!;
  assert.equal(sub.student_id, fixture.student_id);
  const metadata = await getFile(file.drive_id);
  const parent = await getFile(metadata.parents![0]);
  assert.equal(parent.name, 'Nhan_xet_GV');
  assert.deepEqual(parent.parents, [fixture.folder_id]);
  const reviewIds = new Set(
    data.Reviews.filter((r) => r.submission_id === sub.id).map((r) => r.id),
  );
  const canonical = data.ReviewFiles.find(
    (f) => f.name === 'Nhan_xet.txt' && reviewIds.has(f.review_id),
  )!;
  assert.ok(canonical);
  const content = await (
    await googleFetch(`https://www.googleapis.com/drive/v3/files/${canonical.drive_id}?alt=media`)
  ).text();
  assert.ok(content.includes(file.name));
  assert.ok(content.includes(file.url));
  assert.equal((await listFolder(parent.id)).filter((f) => f.name === 'Nhan_xet.txt').length, 1);
  const report = {
    dev_only: true,
    ui_upload_verified: true,
    file_id: file.drive_id,
    feedback_folder_id: parent.id,
    student_folder_id: fixture.folder_id,
    review_file_id: canonical.drive_id,
    attachment_link_in_text: true,
    single_review_text: true,
  };
  await writeFile('test-results/review-attachment.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : 'Failed');
  process.exitCode = 1;
});
