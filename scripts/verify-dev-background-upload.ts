import * as nextEnv from '@next/env';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { environment, DEV_DRIVE_ROOT } from '../src/lib/environment';
import { loadData } from '../src/lib/sheets';
import { getFile } from '../src/lib/drive';
import { lastReview } from '../src/lib/model';
import { googleFetch } from '../src/lib/google';
async function main() {
  nextEnv.loadEnvConfig(process.cwd());
  assert.equal(environment().mode, 'development');
  assert.equal(environment().root, DEV_DRIVE_ROOT);
  const fixture = JSON.parse(await readFile('test-results/background-upload-fixture.json', 'utf8'));
  const first = JSON.parse(await readFile('test-results/dev-student-submission.json', 'utf8'));
  const data = await loadData();
  const attachment = data.ReviewFiles.filter((f) => f.name === fixture.attachment_name).at(-1)!;
  assert.ok(attachment);
  const review = data.Reviews.find((r) => r.id === attachment.review_id)!;
  const submission = data.Submissions.find((s) => s.id === review.submission_id)!;
  assert.equal(submission.student_id, first.student_id);
  const file = await getFile(attachment.drive_id);
  assert.equal(Number(file.size), fixture.attachment_bytes);
  const parent = await getFile(file.parents![0]);
  assert.equal(parent.name, 'Nhan_xet_GV');
  assert.deepEqual(parent.parents, [fixture.first_student_folder_id]);
  const secondSub = data.Submissions.find(
    (s) => s.assignment_id === first.assignment_id && s.student_id === fixture.second_student_id,
  )!;
  assert.ok(secondSub);
  const secondReview = lastReview(data, secondSub.id)!;
  assert.ok(secondReview.comment.includes('KIỂM THỬ DEV'));
  assert.equal(secondReview.score, '');
  const firstText = data.ReviewFiles.find((f) => f.id === `${submission.id}~text`)!;
  const secondText = data.ReviewFiles.find((f) => f.id === `${secondSub.id}~text`)!;
  assert.ok(firstText && secondText);
  const readText = async (id: string) =>
    (await googleFetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`)).text();
  assert.ok((await readText(firstText.drive_id)).includes(attachment.url));
  assert.ok(!(await readText(secondText.drive_id)).includes(attachment.url));
  const report = {
    dev_only: true,
    upload_completed_after_popup_closed: true,
    attachment_id: file.id,
    bytes: Number(file.size),
    correct_student_folder: true,
    second_student_review_saved: true,
    second_review_id: secondReview.id,
    attachment_not_mixed_with_second_student: true,
  };
  await writeFile('test-results/background-upload-result.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : 'Failed');
  process.exitCode = 1;
});
