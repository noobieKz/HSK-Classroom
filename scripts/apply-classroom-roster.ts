import * as nextEnv from '@next/env';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { environment, DEV_DRIVE_ROOT } from '../src/lib/environment';
import { classroomRoster } from '../src/lib/roster';
import { listFolder, FOLDER, assertEnvironmentRoot } from '../src/lib/drive';
import { transaction, loadData, upsert } from '../src/lib/sheets';
import { googleJson } from '../src/lib/google';
import { syncAssignment } from '../src/lib/business';

async function main() {
  throw new Error('Script DEV lịch sử đã ngừng sử dụng vì có thao tác xóa dữ liệu. Không chạy lại.');
  nextEnv.loadEnvConfig(process.cwd());
  assert.equal(environment().mode, 'development');
  assert.equal(environment().root, DEV_DRIVE_ROOT);
  // Only disposable TM_TEST files in the explicitly selected DEV root are trashed.
  async function clean(parent: string) {
    await assertEnvironmentRoot(parent);
    for (const file of await listFolder(parent)) {
      if (file.mimeType === FOLDER) await clean(file.id);
      else if (file.name.startsWith('TM_TEST')) {
        await googleJson(`https://www.googleapis.com/drive/v3/files/${file.id}?fields=id,trashed`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ trashed: true }),
        });
      }
    }
  }
  await clean(DEV_DRIVE_ROOT);
  const bvn = (await listFolder(DEV_DRIVE_ROOT)).filter(
    (f) => f.mimeType === FOLDER && f.name.trim() === 'BVN',
  );
  assert.equal(bvn.length, 1);
  const sessions = (await listFolder(bvn[0].id)).filter((f) => f.mimeType === FOLDER);
  assert.ok(sessions.length);
  const result = await transaction(randomUUID(), { action: 'apply-owner-roster-v1' }, (data) => {
    const cls = data.Classes.find((c) => c.root_id === DEV_DRIVE_ROOT)!;
    assert.ok(cls);
    const testStudents = new Set(
      data.Students.filter((s) => s.name.startsWith('TM_TEST')).map((s) => s.id),
    );
    const testAssignments = new Set(
      data.Assignments.filter((a) => a.class_id === cls.id && a.name.startsWith('TM_TEST')).map(
        (a) => a.id,
      ),
    );
    const testSubmissions = new Set(
      data.Submissions.filter(
        (s) =>
          testAssignments.has(s.assignment_id) ||
          testStudents.has(s.student_id) ||
          !data.Assignments.some((a) => a.id === s.assignment_id),
      ).map((s) => s.id),
    );
    const testReviews = new Set(
      data.Reviews.filter((r) => testSubmissions.has(r.submission_id)).map((r) => r.id),
    );
    data.ReviewFiles = data.ReviewFiles.filter((r) => !testReviews.has(r.review_id));
    data.Reviews = data.Reviews.filter((r) => !testReviews.has(r.id));
    data.SubmissionFiles = data.SubmissionFiles.filter(
      (r) => !testSubmissions.has(r.submission_id),
    );
    data.Submissions = data.Submissions.filter((r) => !testSubmissions.has(r.id));
    data.DriveMappings = data.DriveMappings.filter(
      (r) =>
        !testAssignments.has(r.assignment_id) &&
        !testStudents.has(r.student_id) &&
        data.Assignments.some((a) => a.id === r.assignment_id) &&
        data.Students.some((s) => s.id === r.student_id),
    );
    data.SyncLogs = data.SyncLogs.filter(
      (r) =>
        !testAssignments.has(r.assignment_id) &&
        data.Assignments.some((a) => a.id === r.assignment_id),
    );
    data.Assignments = data.Assignments.filter((r) => !testAssignments.has(r.id));
    data.Enrollments = data.Enrollments.filter((r) => !testStudents.has(r.student_id));
    data.Students = data.Students.filter((r) => !testStudents.has(r.id));
    cls.name = 'HSK_UET · DEV';
    cls.expected_students = '12';
    cls.version = String(Number(cls.version) + 1);
    for (const name of classroomRoster) {
      const student = data.Students.find((s) => s.name === name) || {
        id: randomUUID(),
        name,
        email: '',
        status: 'active',
        version: '1',
      };
      upsert(data, 'Students', student);
      const enrollment = data.Enrollments.find(
        (e) => e.class_id === cls.id && e.student_id === student.id,
      );
      if (!enrollment)
        data.Enrollments.push({
          id: `${cls.id}~${student.id}`,
          class_id: cls.id,
          student_id: student.id,
          joined_at: '',
          left_at: '',
          status: 'active',
          version: '1',
        });
    }
    const assignmentIds: string[] = [];
    for (const folder of sessions) {
      const old = data.Sessions.find((s) => s.class_id === cls.id && s.folder_id === folder.id);
      const session = {
        id: old?.id || randomUUID(),
        class_id: cls.id,
        name: folder.name,
        date: (() => {
          const match = folder.name.match(/(\d{2})\/(\d{2})\/(\d{4})/);
          return match ? `${match[3]}-${match[2]}-${match[1]}` : old?.date || '';
        })(),
        deadline: '',
        folder_id: folder.id,
        content: 'Bài về nhà trong BVN → buổi học → folder học viên.',
        status: 'active',
        version: String(Number(old?.version || 0) + 1),
      };
      upsert(data, 'Sessions', session);
      let assignment = data.Assignments.find(
        (a) => a.session_id === session.id && a.status === 'active',
      );
      if (!assignment) {
        assignment = {
          id: randomUUID(),
          class_id: cls.id,
          session_id: session.id,
          name: 'Bài về nhà',
          requirements:
            'Học viên tạo folder mang tên mình bên trong folder buổi học và upload BVN vào đó.',
          student_ids: '[]',
          status: 'active',
          version: '1',
        };
        data.Assignments.push(assignment);
      }
      assignmentIds.push(assignment.id);
    }
    return { assignmentIds };
  });
  for (const assignmentId of result.assignmentIds) await syncAssignment(assignmentId, randomUUID());
  const data = await loadData();
  assert.equal(data.Students.filter((s) => s.status === 'active').length, 12);
  assert.equal(
    data.Students.some((s) => s.name.startsWith('TM_TEST')),
    false,
  );
  assert.equal(data.DriveMappings.length, 3);
  console.log(
    'PASS: 12 confirmed students, real session hierarchy, 3 matching folders, no test students or reviews. DEV only.',
  );
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : 'Roster update failed');
  process.exitCode = 1;
});
