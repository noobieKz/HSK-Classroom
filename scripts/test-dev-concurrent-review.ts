import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
async function main() {
  const app = 'http://localhost:3000';
  let cookie = '',
    csrf = '';
  async function post(action: string, payload: unknown, operationId = randomUUID()) {
    const response = await fetch(`${app}/api/app`, {
      method: 'POST',
      headers: { origin: app, cookie, 'Content-Type': 'application/json', 'x-csrf-token': csrf },
      body: JSON.stringify({ action, payload, operationId }),
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
  const before = (await get('data')).data;
  const submission = before.Submissions.find(
    (s: any) => s.assignment_id === fixture.assignment_id && s.student_id === fixture.student_id,
  );
  assert.ok(submission);
  const reviews = before.Reviews.filter((r: any) => r.submission_id === submission.id);
  const latest = reviews.sort((a: any, b: any) => Number(b.version) - Number(a.version))[0];
  assert.ok(
    latest?.comment.startsWith('KIỂM THỬ DEV'),
    'Only the marked DEV test review can be changed',
  );
  const syncId = randomUUID();
  let syncFinished = false;
  const sync = post('sync', { assignment_id: fixture.assignment_id }, syncId).finally(() => {
    syncFinished = true;
  });
  try {
    const limit = Date.now() + 20000;
    let scanning = false;
    while (Date.now() < limit) {
      const snapshot = (await get('data')).data;
      if (snapshot.SyncLogs.some((l: any) => l.id === syncId && l.status === 'running')) {
        scanning = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(scanning, 'Live Drive scan did not start');
    const review = await post('review', {
      submission_id: submission.id,
      expected_version: Number(latest.version),
      score: 8,
      comment:
        'KIỂM THỬ DEV — điểm thử 8/10 cho BTVN_mau_DEV.txt. Kiểm tra lưu điểm trong khi Drive đang đồng bộ; không phải điểm học thật.',
    });
    assert.equal(syncFinished, false, 'Review must finish before the scan releases');
    await sync;
    const after = (await get('data')).data;
    assert.equal(after.Reviews.find((r: any) => r.id === review.id)?.score, '8');
    assert.equal(
      after.SubmissionFiles.filter(
        (f: any) => f.submission_id === submission.id && f.present === 'true',
      ).length,
      1,
    );
    const report = {
      dev_only: true,
      concurrent_review: true,
      review_id: review.id,
      scan_id: syncId,
      tested_at: new Date().toISOString(),
    };
    await writeFile('test-results/concurrent-review.json', JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  } finally {
    await sync;
  }
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : 'Failed');
  process.exitCode = 1;
});
