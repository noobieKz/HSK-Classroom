import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { Data, Row, Table, stableId, includedStudents, lastReview } from './model';
import { transaction, upsert, loadData } from './sheets';
import { invariant, publicError } from './errors';
import {
  driveId,
  getFile,
  inside,
  FOLDER,
  excluded,
  submissionFiles,
  fileLink,
  assertEnvironmentRoot,
  saveFeedbackText,
  feedbackFolder,
} from './drive';
import { withLock } from './store';
import { matchesStudentFolder, studentFolderNames, sessionFolderName } from './roster';
import { listFolder, ensureFolder, renameFolder, saveHomeworkFile } from './drive';

const id = z.string().min(1).max(160);
const text = z.string().trim().min(1).max(200);
const note = z.string().max(10000);
const version = z.string().regex(/^\d+$/);
const optionalId = z.string().max(160).optional();
export function find(data: Data, table: Table, value: string) {
  const row = data[table].find((r) => r.id === value);
  invariant(row, `Không tìm thấy bản ghi ${table}.`, 404);
  return row;
}
function nextVersion(row?: Row, expected?: string) {
  invariant(
    !row || row.version === expected,
    'Dữ liệu đã thay đổi ở phiên khác. Tải lại trước khi lưu.',
    409,
  );
  return String(Number(row?.version || 0) + 1);
}
function assignmentContext(data: Data, assignmentId: string, studentId?: string) {
  const assignment = find(data, 'Assignments', assignmentId);
  const session = find(data, 'Sessions', assignment.session_id);
  const cls = find(data, 'Classes', assignment.class_id);
  if (studentId)
    invariant(
      includedStudents(data, assignment).some((s) => s.id === studentId),
      'Học viên không thuộc diện phải nộp bài này.',
    );
  return { assignment, session, cls };
}
const iso = z.string().datetime({ offset: true });
export async function mutate(action: string, raw: unknown, operationId: string) {
  return transaction(operationId, { action, raw }, async (data) => {
    if (action === 'class') {
      const p = z
        .object({
          id: optionalId,
          version: version.optional(),
          name: text,
          root_id: text,
          expected_students: z.coerce.number().int().min(0).max(10000),
          status: z.enum(['active', 'inactive']),
        })
        .parse(raw);
      driveId(p.root_id);
      await assertEnvironmentRoot(p.root_id);
      const folder = await getFile(p.root_id);
      invariant(folder.mimeType === FOLDER, 'Drive root phải là thư mục.');
      const row = p.id ? find(data, 'Classes', p.id) : undefined;
      const result = {
        ...p,
        id: p.id || randomUUID(),
        expected_students: String(p.expected_students),
        version: nextVersion(row, p.version),
      };
      upsert(data, 'Classes', result);
      return { id: result.id };
    }
    if (action === 'student' || action === 'students-import') {
      const p = z
        .object({
          class_id: id,
          students: z
            .array(
              z.object({
                id: optionalId,
                version: version.optional(),
                name: text,
                email: z.union([z.email(), z.literal('')]),
                status: z.enum(['active', 'inactive']),
                joined_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
              }),
            )
            .min(1)
            .max(200),
        })
        .parse(raw);
      find(data, 'Classes', p.class_id);
      for (const input of p.students) {
        const old = input.id ? find(data, 'Students', input.id) : undefined;
        const studentId = input.id || randomUUID();
        upsert(data, 'Students', {
          id: studentId,
          name: input.name,
          email: input.email,
          status: input.status,
          version: nextVersion(old, input.version),
        });
        const enrollmentId = stableId(p.class_id, studentId);
        const enrollment = data.Enrollments.find((e) => e.id === enrollmentId);
        upsert(data, 'Enrollments', {
          id: enrollmentId,
          class_id: p.class_id,
          student_id: studentId,
          joined_at: input.joined_at,
          left_at:
            input.status === 'inactive'
              ? enrollment?.left_at || new Date().toISOString().slice(0, 10)
              : '',
          status: input.status,
          version: String(Number(enrollment?.version || 0) + 1),
        });
      }
      return { count: p.students.length };
    }
    if (action === 'enrollment') {
      const p = z
        .object({
          class_id: id,
          student_id: id,
          joined_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        })
        .parse(raw);
      find(data, 'Classes', p.class_id);
      find(data, 'Students', p.student_id);
      invariant(
        !data.Enrollments.some((e) => e.class_id === p.class_id && e.student_id === p.student_id),
        'Học viên đã có trong lớp. Hãy chỉnh sửa bản ghi hiện có.',
        409,
      );
      const row = {
        id: stableId(p.class_id, p.student_id),
        class_id: p.class_id,
        student_id: p.student_id,
        joined_at: p.joined_at,
        left_at: '',
        status: 'active',
        version: '1',
      };
      data.Enrollments.push(row);
      return { id: row.id };
    }
    if (action === 'session') {
      const p = z
        .object({
          id: optionalId,
          version: version.optional(),
          class_id: id,
          name: z.string().max(200).optional().default(''),
          session_number: z.coerce.number().int().min(1).max(999).optional(),
          date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          deadline: z.union([iso, z.literal('')]),
          folder_id: z.string().trim().max(200).optional().default(''),
          content: note,
          status: z.enum(['active', 'inactive']),
        })
        .parse(raw);
      const cls = find(data, 'Classes', p.class_id);
      await assertEnvironmentRoot(cls.root_id);
      const old = p.id ? find(data, 'Sessions', p.id) : undefined;
      invariant(!old || old.class_id === p.class_id, 'Không chuyển buổi sang lớp khác.');
      const rowVersion = nextVersion(old, p.version);
      const number = p.session_number ?? Number(p.name.match(/^Buổi\s+(\d+)_/u)?.[1]);
      invariant(
        Number.isInteger(number) && number >= 1 && number <= 999,
        'Nhập số buổi hợp lệ. Tên thư mục phải theo mẫu Buổi xx_DD/MM/YYYY.',
      );
      try {
        p.name = sessionFolderName(number, p.date);
      } catch {
        invariant(false, 'Ngày học không hợp lệ.');
      }
      const enrolled = data.Enrollments.filter(
        (e) => e.class_id === cls.id && e.status === 'active',
      );
      const students = data.Students.filter(
        (s) => s.status === 'active' && enrolled.some((e) => e.student_id === s.id),
      );
      if (!old) {
        invariant(
          new Set(students.map((s) => s.name.trim().normalize('NFC'))).size === students.length,
          'Danh sách có học viên trùng họ tên. Phân biệt tên trước khi tạo folder.',
          409,
        );
        if (!p.folder_id) {
          const bvn = await ensureFolder(cls.root_id, 'BVN');
          p.folder_id = await ensureFolder(bvn, p.name);
        }
      }
      const folder = await getFile(p.folder_id);
      invariant(folder.mimeType === FOLDER && !excluded(folder), 'Chọn thư mục buổi học hợp lệ.');
      await inside(p.folder_id, cls.root_id);
      const { session_number: _number, ...fields } = p;
      const row = { ...fields, id: p.id || randomUUID(), version: rowVersion };
      if (old && old.folder_id !== p.folder_id)
        invariant(
          !data.DriveMappings.some((m) => m.session_id === old.id),
          'Buổi đã có ánh xạ. Tạo buổi mới để đổi folder và giữ lịch sử.',
        );
      await renameFolder(p.folder_id, p.name);
      if (!old) {
        // Retry reuses already-created folders if Drive/Sheets interrupted partway through.
        for (let start = 0; start < students.length; start += 4)
          await Promise.all(
            students
              .slice(start, start + 4)
              .map((s) =>
                ensureFolder(
                  p.folder_id,
                  studentFolderNames(students.map((s) => s.name)).get(s.name)!,
                ),
              ),
          );
      }
      upsert(data, 'Sessions', row);
      return { id: row.id };
    }
    if (action === 'assignment') {
      const p = z
        .object({
          id: optionalId,
          version: version.optional(),
          session_id: id,
          requirements: z.string().trim().min(1, 'Nhập yêu cầu bài tập.').max(10000),
        })
        .parse(raw);
      const session = find(data, 'Sessions', p.session_id);
      const old = p.id
        ? find(data, 'Assignments', p.id)
        : data.Assignments.find((a) => a.session_id === session.id && a.status === 'active');
      invariant(!old || old.session_id === p.session_id, 'Không chuyển bài tập sang buổi khác.');
      const row = {
        ...p,
        id: old?.id || randomUUID(),
        class_id: session.class_id,
        name: 'BTVN',
        student_ids: '[]',
        status: 'active',
        version: nextVersion(old, p.version ?? (!p.id ? old?.version : undefined)),
      };
      const cls = find(data, 'Classes', session.class_id);
      await assertEnvironmentRoot(cls.root_id);
      await inside(session.folder_id, cls.root_id);
      const fileId = await saveHomeworkFile(session.folder_id, p.requirements);
      for (const other of data.Assignments.filter(
        (a) => a.session_id === session.id && a.id !== row.id && a.status === 'active',
      )) {
        other.status = 'inactive';
        other.version = String(Number(other.version || 0) + 1);
      }
      upsert(data, 'Assignments', row);
      return { id: row.id, file_id: fileId };
    }
    if (action === 'mapping') {
      const p = z
        .object({
          assignment_id: id,
          student_id: id,
          drive_id: id,
          version: version.optional(),
          ignore: z.boolean().optional(),
        })
        .parse(raw);
      const { assignment, session, cls } = assignmentContext(data, p.assignment_id, p.student_id);
      await assertEnvironmentRoot(cls.root_id);
      const file = await getFile(p.drive_id);
      invariant(
        !excluded(file) &&
          file.mimeType !== 'application/vnd.google-apps.shortcut' &&
          !file.trashed,
        'Không được gán file hệ thống, shortcut hoặc mục nhận xét GV.',
      );
      invariant(file.id !== session.folder_id, 'Không gán cả thư mục buổi học cho một học viên.');
      await inside(file.id, session.folder_id);
      await inside(session.folder_id, cls.root_id);
      // A file/folder cannot silently belong to two people or two assignments.
      invariant(
        !data.DriveMappings.some(
          (m) =>
            m.drive_id === file.id &&
            (m.student_id !== p.student_id || m.assignment_id !== p.assignment_id),
        ),
        'Mục Drive đã được gán cho học viên hoặc bài tập khác.',
      );
      const kind = p.ignore ? 'ignore' : file.mimeType === FOLDER ? 'folder' : 'file';
      if (kind === 'folder')
        for (const m of data.DriveMappings.filter(
          (m) =>
            m.kind === 'folder' && m.assignment_id === p.assignment_id && m.drive_id !== file.id,
        )) {
          // Reject overlapping roots. Ancestry comparisons run in both directions.
          const contains = async (a: string, b: string) => {
            try {
              await inside(a, b);
              return true;
            } catch (e) {
              if (publicError(e).status === 403) return false;
              throw e;
            }
          };
          invariant(
            !(await contains(file.id, m.drive_id)) && !(await contains(m.drive_id, file.id)),
            'Thư mục ánh xạ chồng lấn với ánh xạ đã có.',
          );
        }
      const key = stableId(
        p.assignment_id,
        p.student_id,
        kind,
        kind !== 'folder' ? file.id : 'root',
      );
      const old = data.DriveMappings.find((m) => m.id === key);
      upsert(data, 'DriveMappings', {
        id: key,
        class_id: assignment.class_id,
        session_id: session.id,
        assignment_id: assignment.id,
        student_id: p.student_id,
        drive_id: file.id,
        kind,
        verified_at: new Date().toISOString(),
        version: nextVersion(old, p.version),
      });
      return { id: key };
    }
    if (action === 'review') {
      const p = z
        .object({
          submission_id: id,
          expected_version: z.coerce.number().int().min(0),
          score: z.union([z.number().min(0).max(10), z.null()]),
          comment: note,
        })
        .parse(raw);
      const submission = find(data, 'Submissions', p.submission_id);
      invariant(
        data.SubmissionFiles.some((f) => f.submission_id === submission.id && f.present === 'true'),
        'Chưa có file bài nộp đã xác minh.',
      );
      const previous = lastReview(data, submission.id);
      invariant(
        Number(previous?.version || 0) === p.expected_version,
        'Điểm đã được sửa ở phiên khác. Tải lại để xem lịch sử.',
        409,
      );
      const row = {
        id: randomUUID(),
        class_id: submission.class_id,
        submission_id: submission.id,
        score: p.score === null ? '' : String(p.score),
        comment: p.comment,
        reviewer: process.env.ADMIN_USERNAME || 'admin',
        created_at: new Date().toISOString(),
        version: String(p.expected_version + 1),
        operation_id: operationId,
      };
      const { session, cls } = assignmentContext(data, submission.assignment_id);
      await assertEnvironmentRoot(cls.root_id);
      await inside(session.folder_id, cls.root_id);
      const student = find(data, 'Students', submission.student_id);
      const folders = (await listFolder(session.folder_id)).filter(
        (f) => f.mimeType === FOLDER && matchesStudentFolder(f.name, student.name),
      );
      invariant(
        folders.length === 1,
        'Không tìm được duy nhất folder học viên trong buổi để lưu file nhận xét.',
      );
      const parent = await feedbackFolder(folders[0].id);
      const name = 'Nhan_xet.txt';
      const content = `Học viên: ${student.name}\nBuổi học: ${session.name}\nĐiểm: ${row.score === '' ? 'Chưa cho điểm' : `${row.score}/10`}\n\nNhận xét:\n${row.comment}\n`;
      const fileId = await saveFeedbackText(parent, content);
      data.Reviews.push(row);
      const reviewIds = new Set(
        data.Reviews.filter((r) => r.submission_id === submission.id).map((r) => r.id),
      );
      data.ReviewFiles = data.ReviewFiles.filter(
        (f) =>
          !(
            reviewIds.has(f.review_id) &&
            (f.name === 'Nhan_xet.txt' || /^Nhan_xet_v\d+\.txt$/.test(f.name))
          ),
      );
      data.ReviewFiles.push({
        id: stableId(submission.id, 'text'),
        class_id: row.class_id,
        review_id: row.id,
        drive_id: fileId,
        name,
        url: fileLink(fileId),
        mime: 'text/plain',
        size: String(Buffer.byteLength(content, 'utf8')),
        created_at: row.created_at,
        operation_id: operationId,
      });
      return { id: row.id, file_id: fileId };
    }
    if (action === 'submission-time') {
      const p = z
        .object({ submission_id: id, version, submitted_at: z.union([iso, z.literal('')]) })
        .parse(raw);
      const old = find(data, 'Submissions', p.submission_id);
      upsert(data, 'Submissions', {
        ...old,
        submitted_at: p.submitted_at,
        timing_source: p.submitted_at ? 'teacher_verified' : '',
        version: nextVersion(old, p.version),
      });
      return { id: old.id };
    }
    invariant(false, 'Chức năng không hợp lệ.');
  });
}
export async function syncAssignment(assignmentId: string, operationId: string) {
  return withLock(`sync:${assignmentId}`, async () => {
    const started = new Date().toISOString();
    await transaction(`${operationId}_start`, { assignmentId }, (data) => {
      const { assignment } = assignmentContext(data, assignmentId);
      data.SyncLogs.push({
        id: operationId,
        class_id: assignment.class_id,
        session_id: assignment.session_id,
        assignment_id: assignment.id,
        started_at: started,
        finished_at: '',
        status: 'running',
        message: '',
      });
      return { id: operationId };
    });
    // Drive traversal is read-only and must not hold the Sheets writer mutex.
    const work = await loadData();
    const scope = (data: Data) => {
      const { assignment, session, cls } = assignmentContext(data, assignmentId);
      return JSON.stringify([
        assignment,
        session,
        cls.root_id,
        includedStudents(data, assignment).map((s) => [s.id, s.name]),
      ]);
    };
    const originalScope = scope(work);
    const log = { ...work.SyncLogs.find((l) => l.id === operationId)! };
    let outcome: { count: number } | { error: string };
    try {
      const { assignment, session, cls } = assignmentContext(work, assignmentId);
      await assertEnvironmentRoot(cls.root_id);
      await inside(session.folder_id, cls.root_id);
      const students = includedStudents(work, assignment);
      // Discover only direct student folders of the selected session.
      const sessionFolders = (await listFolder(session.folder_id)).filter(
        (f) => f.mimeType === FOLDER && !excluded(f),
      );
      // Folder names are the source of ownership; no manual verification workflow.
      work.DriveMappings = work.DriveMappings.filter((m) => m.assignment_id !== assignmentId);
      for (const student of students) {
        const candidates = sessionFolders.filter((f) => matchesStudentFolder(f.name, student.name));
        invariant(
          candidates.length <= 1,
          `Có nhiều folder khớp tên ${student.name}. Đổi tên folder trùng trên Drive rồi đồng bộ lại.`,
          409,
        );
        if (!candidates.length) continue;
        const folder = candidates[0];
        if (
          work.DriveMappings.some(
            (m) => m.assignment_id === assignmentId && m.drive_id === folder.id,
          )
        )
          continue;
        upsert(work, 'DriveMappings', {
          id: stableId(assignmentId, student.id, 'folder', 'root'),
          class_id: cls.id,
          session_id: session.id,
          assignment_id: assignmentId,
          student_id: student.id,
          drive_id: folder.id,
          kind: 'folder',
          verified_at: new Date().toISOString(),
          version: '1',
        });
      }
      const deadline = Date.now() + 28000;
      const ignored = new Set(
        work.DriveMappings.filter(
          (m) => m.kind === 'ignore' && m.assignment_id === assignmentId,
        ).map((m) => m.drive_id),
      );
      let count = 0;
      const used = new Map<string, string>();
      for (const student of students) {
        const mappings = work.DriveMappings.filter(
          (m) =>
            m.assignment_id === assignmentId &&
            m.student_id === student.id &&
            m.verified_at &&
            m.kind !== 'ignore',
        );
        const files = new Map<string, Awaited<ReturnType<typeof getFile>>>();
        for (const mapping of mappings) {
          invariant(Date.now() < deadline, 'Đồng bộ quá thời gian. Chia nhỏ bài tập.');
          const root = sessionFolders.find((f) => f.id === mapping.drive_id);
          invariant(root, 'Không tìm thấy folder học viên trong buổi học. Đồng bộ lại.');
          invariant(!excluded(root), 'Ánh xạ đang trỏ tới mục nhận xét GV.');
          for (const f of mapping.kind === 'folder'
            ? await submissionFiles(mapping.drive_id, deadline, ignored)
            : [root]) {
            if (ignored.has(f.id)) continue;
            invariant(
              !used.has(f.id) || used.get(f.id) === student.id,
              'Một file khớp nhiều học viên. Cần sửa ánh xạ.',
              409,
            );
            used.set(f.id, student.id);
            files.set(f.id, f);
          }
        }
        const subId = stableId(assignmentId, student.id);
        const old = work.Submissions.find((s) => s.id === subId);
        upsert(work, 'Submissions', {
          id: subId,
          class_id: cls.id,
          session_id: session.id,
          assignment_id: assignmentId,
          student_id: student.id,
          synced_at: new Date().toISOString(),
          submitted_at: old?.submitted_at || '',
          timing_source: old?.timing_source || '',
          version: String(Number(old?.version || 0) + 1),
        });
        for (const oldFile of work.SubmissionFiles.filter((f) => f.submission_id === subId))
          oldFile.present = 'false';
        for (const file of files.values()) {
          if (
            excluded(file) ||
            file.mimeType === FOLDER ||
            file.mimeType === 'application/vnd.google-apps.shortcut'
          )
            continue;
          const fileId = stableId(subId, file.id);
          const previous = work.SubmissionFiles.find((f) => f.id === fileId);
          upsert(work, 'SubmissionFiles', {
            id: fileId,
            class_id: cls.id,
            submission_id: subId,
            drive_id: file.id,
            name: file.name,
            mime: file.mimeType,
            url: fileLink(file.id),
            created_at: file.createdTime || '',
            modified_at: file.modifiedTime || '',
            first_seen: previous?.first_seen || new Date().toISOString(),
            present: 'true',
            version: String(Number(previous?.version || 0) + 1),
          });
          count++;
        }
      }
      Object.assign(log, {
        status: 'success',
        finished_at: new Date().toISOString(),
        message: `${count} file; ${students.filter((s) => !work.DriveMappings.some((m) => m.assignment_id === assignmentId && m.student_id === s.id)).length} học viên chưa có thư mục.`,
      });
      outcome = { count };
    } catch (e) {
      Object.assign(log, {
        status: 'error',
        finished_at: new Date().toISOString(),
        message: publicError(e).message,
      });
      // No partial file changes are committed on API errors.
      outcome = { error: log.message };
    }
    return transaction(`${operationId}_finish`, { assignmentId }, (data) => {
      const currentLog = data.SyncLogs.find((l) => l.id === operationId)!;
      if ('count' in outcome && scope(data) !== originalScope) {
        Object.assign(currentLog, {
          status: 'error',
          finished_at: new Date().toISOString(),
          message: 'Nội dung buổi học vừa thay đổi. Web sẽ đồng bộ lại.',
        });
        return { error: currentLog.message };
      }
      if ('count' in outcome) {
        const rows = work.Submissions.filter((s) => s.assignment_id === assignmentId);
        const subIds = new Set(rows.map((s) => s.id));
        data.DriveMappings = [
          ...data.DriveMappings.filter((m) => m.assignment_id !== assignmentId),
          ...work.DriveMappings.filter((m) => m.assignment_id === assignmentId),
        ];
        for (const row of rows) {
          const current = data.Submissions.find((s) => s.id === row.id);
          upsert(data, 'Submissions', {
            ...row,
            submitted_at: current?.submitted_at || '',
            timing_source: current?.timing_source || '',
            version: String(Number(current?.version || 0) + 1),
          });
        }
        data.SubmissionFiles = [
          ...data.SubmissionFiles.filter((f) => !subIds.has(f.submission_id)),
          ...work.SubmissionFiles.filter((f) => subIds.has(f.submission_id)),
        ];
      }
      Object.assign(currentLog, log);
      return outcome;
    });
  });
}
