import * as nextEnv from '@next/env';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { environment, DEV_DRIVE_ROOT } from '../src/lib/environment';
import { transaction } from '../src/lib/sheets';
import { listFolder, FOLDER, feedbackFolder } from '../src/lib/drive';
import { persistReviewText } from '../src/lib/business';
import { matchesStudentFolder } from '../src/lib/roster';
import { googleFetch } from '../src/lib/google';
async function main() {
  nextEnv.loadEnvConfig(process.cwd());
  assert.equal(environment().mode, 'development');
  assert.equal(environment().root, DEV_DRIVE_ROOT);
  const result = await transaction(
    randomUUID(),
    { action: 'backfill-owner-review-text' },
    async (data) => {
      const reports = [];
      const latest = data.Submissions.map(
        (s) =>
          data.Reviews.filter((r) => r.submission_id === s.id).sort(
            (a, b) => Number(b.version) - Number(a.version),
          )[0],
      ).filter(Boolean);
      for (const row of latest) {
        const sub = data.Submissions.find((s) => s.id === row.submission_id)!;
        assert.ok(sub);
        const session = data.Sessions.find((s) => s.id === sub.session_id)!;
        assert.ok(session);
        const student = data.Students.find((s) => s.id === sub.student_id)!;
        assert.ok(student);
        const folders = (await listFolder(session.folder_id)).filter(
          (f) => f.mimeType === FOLDER && matchesStudentFolder(f.name, student.name),
        );
        assert.equal(folders.length, 1);
        const parent = await feedbackFolder(folders[0].id);
        const name = 'Nhan_xet.txt';
        const fileId = await persistReviewText(data, row, parent);
        const text = await (
          await googleFetch('https://www.googleapis.com/drive/v3/files/' + fileId + '?alt=media')
        ).text();
        assert.ok(text.includes(row.comment || ''));
        const remaining = (await listFolder(parent)).filter(
          (f) =>
            !f.appProperties?.tm_upload &&
            (f.name === 'Nhan_xet.txt' || /^Nhan_xet_v\d+\.txt$/.test(f.name)),
        );
        assert.equal(remaining.length, 1);
        reports.push({
          file_id: fileId,
          name,
          parent,
          content_verified: true,
          file_count: remaining.length,
        });
      }
      return { dev_only: true, reports };
    },
  );
  console.log(JSON.stringify(result));
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : 'Failed');
  process.exitCode = 1;
});
