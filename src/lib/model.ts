export const schema = {
  Meta: ['id', 'version'],
  Classes: ['id', 'name', 'root_id', 'expected_students', 'status', 'version'],
  Students: ['id', 'name', 'email', 'status', 'version'],
  Enrollments: ['id', 'class_id', 'student_id', 'joined_at', 'left_at', 'status', 'version'],
  Sessions: [
    'id',
    'class_id',
    'name',
    'date',
    'deadline',
    'folder_id',
    'content',
    'status',
    'version',
  ],
  Assignments: [
    'id',
    'class_id',
    'session_id',
    'name',
    'requirements',
    'student_ids',
    'status',
    'version',
  ],
  DriveMappings: [
    'id',
    'class_id',
    'session_id',
    'assignment_id',
    'student_id',
    'drive_id',
    'kind',
    'verified_at',
    'version',
  ],
  Submissions: [
    'id',
    'class_id',
    'session_id',
    'assignment_id',
    'student_id',
    'synced_at',
    'submitted_at',
    'timing_source',
    'version',
  ],
  SubmissionFiles: [
    'id',
    'class_id',
    'submission_id',
    'drive_id',
    'name',
    'mime',
    'url',
    'created_at',
    'modified_at',
    'first_seen',
    'present',
    'version',
  ],
  Reviews: [
    'id',
    'class_id',
    'submission_id',
    'score',
    'comment',
    'reviewer',
    'created_at',
    'version',
    'operation_id',
  ],
  ReviewFiles: [
    'id',
    'class_id',
    'review_id',
    'drive_id',
    'name',
    'url',
    'mime',
    'size',
    'created_at',
    'operation_id',
  ],
  SyncLogs: [
    'id',
    'class_id',
    'session_id',
    'assignment_id',
    'started_at',
    'finished_at',
    'status',
    'message',
  ],
  Operations: ['id', 'fingerprint', 'created_at', 'result'],
} as const;
export type Table = keyof typeof schema;
export type Row = Record<string, string>;
export type Data = Record<Table, Row[]>;
export const tables = Object.keys(schema) as Table[];
export const emptyData = () => Object.fromEntries(tables.map((t) => [t, []])) as unknown as Data;
export const SCHEMA_VERSION = '1';
export function stableId(...parts: string[]) {
  // All input IDs exclude '~'; preserve unambiguous, deterministic identities.
  return parts.join('~');
}
export function includedStudents(data: Data, assignment: Row): Row[] {
  const session = data.Sessions.find((s) => s.id === assignment.session_id);
  const explicit: string[] = JSON.parse(assignment.student_ids || '[]');
  return data.Students.filter(
    (student) =>
      data.Enrollments.some(
        (e) =>
          e.student_id === student.id &&
          e.class_id === assignment.class_id &&
          (!session?.date || e.joined_at.slice(0, 10) <= session.date) &&
          (!e.left_at || !session?.date || e.left_at.slice(0, 10) >= session.date),
      ) &&
      (!explicit.length || explicit.includes(student.id)),
  );
}
export function lastReview(data: Data, submissionId: string) {
  return data.Reviews.filter((r) => r.submission_id === submissionId).sort(
    (a, b) => Number(b.version) - Number(a.version),
  )[0];
}
export function submissionStatus(data: Data, assignment: Row, studentId: string, now = Date.now()) {
  const submission = data.Submissions.find(
    (s) => s.assignment_id === assignment.id && s.student_id === studentId,
  );
  const files = data.SubmissionFiles.filter(
    (f) => f.submission_id === submission?.id && f.present === 'true',
  );
  const session = data.Sessions.find((s) => s.id === assignment.session_id);
  const latestLog = data.SyncLogs.filter((l) => l.assignment_id === assignment.id).at(-1);
  const success = latestLog?.status === 'success';
  const mappings = data.DriveMappings.filter(
    (m) =>
      m.assignment_id === assignment.id &&
      m.student_id === studentId &&
      m.verified_at &&
      m.kind !== 'ignore',
  );
  const mapping = mappings.length > 0;
  const currentScope =
    submission &&
    mappings.every((m) => m.verified_at <= submission.synced_at) &&
    submission.synced_at <= (latestLog?.finished_at || '');
  const deadline = Date.parse(session?.deadline || '');
  let status: string;
  if (!success || !currentScope) status = latestLog?.status === 'error' ? 'sync_error' : 'unknown';
  else if (!mapping) status = 'folder_missing';
  else if (files.length)
    status =
      submission?.submitted_at &&
      submission.timing_source === 'teacher_verified' &&
      Number.isFinite(deadline)
        ? Date.parse(submission.submitted_at) > deadline
          ? 'late'
          : 'submitted'
        : 'timing_unknown';
  else status = Number.isFinite(deadline) && now > deadline ? 'missing' : 'awaiting';
  const review = submission && lastReview(data, submission.id);
  return { submission, files, review, status, syncedAt: latestLog?.finished_at || '' };
}
export const statusLabels: Record<string, string> = {
  folder_missing: 'Chưa có thư mục',
  sync_error: 'Lỗi đồng bộ',
  unknown: 'Chưa đồng bộ',
  late: 'Nộp muộn',
  submitted: 'Đã nộp',
  timing_unknown: 'Đã nộp · chưa rõ thời điểm',
  missing: 'Chưa nộp',
  awaiting: 'Chưa đến hạn',
};
export function average(scores: (string | null | undefined)[]) {
  const values = scores
    .filter((s) => s !== '' && s != null)
    .map(Number)
    .filter(Number.isFinite);
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}
export function csvCell(value: unknown) {
  let text = String(value ?? '');
  if (/^[\s\uFEFF]*[=+\-@\t\r\n]/u.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
export function csv(rows: unknown[][]) {
  return '\uFEFF' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
}
