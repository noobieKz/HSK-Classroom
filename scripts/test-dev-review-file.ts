import * as nextEnv from '@next/env';
import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { getFile } from '../src/lib/drive';
import { googleFetch } from '../src/lib/google';
async function main() {
  nextEnv.loadEnvConfig(process.cwd());
  const app = 'http://localhost:3000';
  let cookie = '',
    csrf = '';
  async function post(action: string, payload: unknown) {
    const response = await fetch(`${app}/api/app`, {
      method: 'POST',
      headers: { origin: app, cookie, 'Content-Type': 'application/json', 'x-csrf-token': csrf },
      body: JSON.stringify({ action, payload, operationId: randomUUID() }),
    });
    if (action === 'login') cookie = response.headers.get('set-cookie')!.split(';')[0];
    const result = await response.json();
    assert.ok(response.ok && !result.error, result.error);
    return result;
  }
  async function get(action: string) {
    const response = await fetch(`${app}/api/app?action=${action}`, { headers: { cookie } });
    assert.ok(response.ok);
    return response.json();
  }
  await post('login', { username: 'admin', password: 'admin' });
  const boot = await get('bootstrap');
  csrf = boot.csrf;
  assert.equal(boot.environment.mode, 'development');
  assert.equal(boot.environment.root, '1bS5c-YREy8CyeBrEPQ_s8Vrxna2-MBdt');
  const fixture = JSON.parse(await readFile('test-results/dev-student-submission.json', 'utf8'));
  const data = (await get('data')).data;
  const submission = data.Submissions.find(
    (s: any) => s.assignment_id === fixture.assignment_id && s.student_id === fixture.student_id,
  );
  assert.ok(submission);
  const latest = data.Reviews.filter((r: any) => r.submission_id === submission.id).sort(
    (a: any, b: any) => Number(b.version) - Number(a.version),
  )[0];
  assert.ok(latest.comment.startsWith('KIỂM THỬ DEV'));
  const saved = await post('review', {
    submission_id: submission.id,
    expected_version: Number(latest.version),
    score: Number(latest.score),
    comment: latest.comment,
  });
  assert.ok(saved.file_id);
  const file = await getFile(saved.file_id);
  assert.ok(file.name.endsWith('.txt'));
  assert.equal(file.parents?.length, 1);
  const parent = await getFile(file.parents![0]);
  assert.equal(parent.name, 'Nhan_xet_GV');
  assert.deepEqual(parent.parents, [fixture.folder_id]);
  const text = await (
    await googleFetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`)
  ).text();
  assert.ok(text.includes(latest.comment));
  assert.ok(text.includes('Điểm: 8/10'));
  const after = (await get('data')).data;
  assert.equal(
    after.ReviewFiles.filter((f: any) => f.review_id === saved.id && f.drive_id === file.id).length,
    1,
  );
  const report = {
    dev_only: true,
    review_id: saved.id,
    file_id: file.id,
    name: file.name,
    parent_id: parent.id,
    student_folder_id: fixture.folder_id,
    content_verified: true,
    file_url: `https://drive.google.com/file/d/${file.id}/view`,
  };
  await writeFile('test-results/review-file.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : 'Failed');
  process.exitCode = 1;
});
