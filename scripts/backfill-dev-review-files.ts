import * as nextEnv from '@next/env';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { environment, DEV_DRIVE_ROOT } from '../src/lib/environment';
import { transaction } from '../src/lib/sheets';
import { listFolder, FOLDER, feedbackFolder, saveTextFile, fileLink } from '../src/lib/drive';
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
      for (const row of data.Reviews) {
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
        const name = `Nhan_xet_v${row.version.padStart(2, '0')}.txt`;
        const content = `Học viên: ${student.name}\nBuổi học: ${session.name}\nĐiểm: ${row.score === '' ? 'Chưa cho điểm' : `${row.score}/10`}\n\nNhận xét:\n${row.comment}\n`;
        const fileId = await saveTextFile(parent, name, content, 'feedback');
        const text = await (
          await googleFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`)
        ).text();
        assert.equal(text, content);
        const id = `${row.id}~text`;
        if (!data.ReviewFiles.some((f) => f.id === id))
          data.ReviewFiles.push({
            id,
            class_id: row.class_id,
            review_id: row.id,
            drive_id: fileId,
            name,
            url: fileLink(fileId),
            mime: 'text/plain',
            size: String(Buffer.byteLength(content, 'utf8')),
            created_at: row.created_at,
            operation_id: randomUUID(),
          });
        reports.push({ file_id: fileId, name, parent, content_verified: true });
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
