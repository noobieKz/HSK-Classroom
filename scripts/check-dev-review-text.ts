import * as nextEnv from '@next/env';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { environment, DEV_DRIVE_ROOT } from '../src/lib/environment';
import { loadData } from '../src/lib/sheets';
import { getFile } from '../src/lib/drive';
import { googleFetch } from '../src/lib/google';
async function main() {
  nextEnv.loadEnvConfig(process.cwd());
  assert.equal(environment().mode, 'development');
  assert.equal(environment().root, DEV_DRIVE_ROOT);
  const fixture = JSON.parse(await readFile('test-results/dev-student-submission.json', 'utf8'));
  const data = await loadData();
  const sub = data.Submissions.find(
    (s) => s.assignment_id === fixture.assignment_id && s.student_id === fixture.student_id,
  )!;
  assert.ok(sub);
  const reviews = data.Reviews.filter((r) => r.submission_id === sub.id).sort(
    (a, b) => Number(b.version) - Number(a.version),
  );
  const canonical = data.ReviewFiles.find((f) => f.id === `${sub.id}~text`)!;
  assert.ok(canonical);
  const meta = await getFile(canonical.drive_id);
  const content = await (
    await googleFetch(`https://www.googleapis.com/drive/v3/files/${meta.id}?alt=media`)
  ).text();
  const app = 'http://localhost:3000';
  const login = await fetch(`${app}/api/app`, {
    method: 'POST',
    headers: { origin: app, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'login', payload: { username: 'admin', password: 'admin' } }),
  });
  assert.ok(login.ok);
  const cookie = login.headers.get('set-cookie')!.split(';')[0];
  const preview = await fetch(
    `${app}/api/app?action=review-text&submission_id=${encodeURIComponent(sub.id)}&v=${reviews[0]?.version}`,
    { headers: { cookie }, cache: 'no-store' },
  );
  assert.ok(preview.ok);
  assert.ok(preview.headers.get('cache-control')?.includes('no-store'));
  assert.equal(await preview.text(), content);
  console.log(
    JSON.stringify({
      latest_version: reviews[0]?.version,
      submission_id: sub.id,
      fresh_preview_matches_drive: true,
      latest_has_testtt: reviews[0]?.comment.includes('testtt'),
      versions_with_testtt: reviews
        .filter((r) => r.comment.includes('testtt'))
        .map((r) => r.version),
      file_name: meta.name,
      file_id: meta.id,
      file_modified: meta.modifiedTime,
      file_has_testtt: content.includes('testtt'),
      matches_latest: content.includes(reviews[0]?.comment),
      linked_review_id: canonical.review_id,
      latest_review_id: reviews[0]?.id,
    }),
  );
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : 'Failed');
  process.exitCode = 1;
});
