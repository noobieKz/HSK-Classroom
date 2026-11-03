import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyData,
  submissionStatus,
  includedStudents,
  average,
  csv,
  lastReview,
} from '../src/lib/model';
import { excluded } from '../src/lib/drive';
import { cellsRequest } from '../src/lib/sheets';

function fixture() {
  const d = emptyData();
  d.Classes.push({ id: 'class', name: 'HSK_UET' });
  d.Students.push({ id: 'student', name: 'Học viên thử · 测试' });
  d.Enrollments.push({
    id: 'enroll',
    class_id: 'class',
    student_id: 'student',
    joined_at: '2026-11-01',
    left_at: '',
    status: 'active',
  });
  d.Sessions.push({
    id: 'session',
    class_id: 'class',
    date: '2026-11-02',
    deadline: '2026-11-03T00:00:00Z',
  });
  const a = { id: 'assignment', class_id: 'class', session_id: 'session', student_ids: '[]' };
  d.Assignments.push(a);
  d.DriveMappings.push({
    id: 'mapping',
    assignment_id: a.id,
    student_id: 'student',
    verified_at: '2026-11-02T00:00:00Z',
  });
  d.Submissions.push({
    id: 'submission',
    assignment_id: a.id,
    student_id: 'student',
    synced_at: '2026-11-04T00:00:00Z',
    submitted_at: '',
    timing_source: '',
  });
  d.SyncLogs.push({
    id: 'sync',
    assignment_id: a.id,
    status: 'success',
    finished_at: '2026-11-04T00:00:01Z',
  });
  return { d, a };
}
test('Missing requires a verified mapping, successful current-scope sync and passed deadline', () => {
  const { d, a } = fixture();
  const now = Date.parse('2026-11-05');
  assert.equal(submissionStatus(d, a, 'student', now).status, 'missing');
  assert.equal(submissionStatus(d, a, 'student', Date.parse('2026-11-02')).status, 'awaiting');
  d.DriveMappings[0].verified_at = '2026-11-04T01:00:00Z';
  assert.equal(submissionStatus(d, a, 'student', now).status, 'unknown');
  d.DriveMappings = [];
  assert.equal(submissionStatus(d, a, 'student', now).status, 'folder_missing');
});
test('API failure never turns old submissions or empty scopes into missing', () => {
  const { d, a } = fixture();
  d.SyncLogs.push({ id: 'error', assignment_id: a.id, status: 'error' });
  assert.equal(submissionStatus(d, a, 'student').status, 'sync_error');
  d.SubmissionFiles.push({ id: 'file', submission_id: 'submission', present: 'true' });
  assert.equal(submissionStatus(d, a, 'student').files.length, 1);
  assert.equal(submissionStatus(d, a, 'student').status, 'sync_error');
});
test('Drive timestamps are not a late-submission proof; teacher-confirmed times are', () => {
  const { d, a } = fixture();
  d.SubmissionFiles.push({
    id: 'file',
    submission_id: 'submission',
    present: 'true',
    modified_at: '2026-11-04',
    created_at: '2026-11-02',
  });
  assert.equal(submissionStatus(d, a, 'student').status, 'timing_unknown');
  Object.assign(d.Submissions[0], {
    timing_source: 'teacher_verified',
    submitted_at: '2026-11-04T00:00:00Z',
  });
  assert.equal(submissionStatus(d, a, 'student').status, 'late');
  d.Submissions[0].submitted_at = '2026-11-02T23:00:00Z';
  assert.equal(submissionStatus(d, a, 'student').status, 'submitted');
});
test('Historical enrollment and explicit assignment lists determine required students', () => {
  const { d, a } = fixture();
  assert.equal(includedStudents(d, a).length, 1);
  d.Enrollments[0].joined_at = '2026-11-03';
  assert.equal(includedStudents(d, a).length, 0);
  d.Enrollments[0].joined_at = '2026-11-01';
  d.Enrollments[0].left_at = '2026-11-01';
  assert.equal(includedStudents(d, a).length, 0);
  d.Enrollments[0].left_at = '';
  a.student_ids = '["other"]';
  assert.equal(includedStudents(d, a).length, 0);
});
test('Zero survives latest review selection and average; blank is ungraded', () => {
  assert.equal(average(['0', '10', '', undefined, null]), 5);
  assert.equal(average(['0']), 0);
  assert.equal(average(['', undefined]), null);
  const { d } = fixture();
  d.Reviews.push(
    { id: 'r1', submission_id: 'submission', version: '1', score: '9' },
    { id: 'r2', submission_id: 'submission', version: '2', score: '0' },
  );
  assert.equal(lastReview(d, 'submission')?.score, '0');
  assert.equal(d.Reviews.length, 2);
});
test('Feedback folders, app-owned feedback and system files are excluded', () => {
  for (const name of ['Nhan_xet_GV', 'Nhận xét GV', '.DS_Store', 'Thumbs.db', 'desktop.ini'])
    assert.equal(excluded({ id: 'id', name, mimeType: 'x' }), true, name);
  assert.equal(excluded({ id: 'id', name: 'Bài nộp.mov', mimeType: 'video/quicktime' }), false);
  assert.equal(excluded({ id: 'id', name: 'BTVN.txt', mimeType: 'text/plain' }), false);
  assert.equal(
    excluded({
      id: 'id',
      name: 'BTVN.txt',
      mimeType: 'text/plain',
      appProperties: { tm_homework: 'true' },
    }),
    true,
  );
  assert.equal(
    excluded({
      id: 'id',
      name: 'Video chữa bài.mp4',
      mimeType: 'video/mp4',
      appProperties: { tm_feedback: 'true' },
    }),
    true,
  );
});
test('Sheets values are explicit strings, never executable formulas', () => {
  const row = {
    id: 'review',
    score: '0',
    comment: '=IMPORTXML("https://example.invalid")\nTiếng Việt 中文',
  };
  const request = cellsRequest('Reviews', [row], 1);
  const values = request.updateCells.rows[1].values;
  assert.deepEqual(values[3], { userEnteredValue: { stringValue: '0' } });
  assert.deepEqual(values[4], { userEnteredValue: { stringValue: row.comment } });
});
test('CSV has UTF-8 BOM, preserves Unicode and quotes newlines; neutralizes formulas', () => {
  const value = csv([
    ['Điểm', 'Nhận xét'],
    [0, '=1+1'],
    ['中文', '\t@SUM(1)'],
    ['Tiếng Việt', 'Xuống\ndòng "quoted"'],
  ]);
  assert.ok(value.startsWith('\uFEFF'));
  assert.ok(value.includes('"0"'));
  assert.ok(value.includes('"\'=1+1"'));
  assert.ok(value.includes("'\t@SUM"));
  assert.ok(value.includes('中文'));
  assert.ok(value.includes('"Xuống\ndòng ""quoted"""'));
});
