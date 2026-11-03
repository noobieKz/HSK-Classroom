import * as nextEnv from '@next/env';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { strict as assert } from 'node:assert';
import { environment, DEV_DRIVE_ROOT } from '../src/lib/environment';
import {
  assertEnvironmentRoot,
  listFolder,
  getFile,
  FOLDER,
  generatedId,
  excluded,
} from '../src/lib/drive';
import { googleJson, googleFetch, accessToken, type GoogleConnection } from '../src/lib/google';
import { readState, writeState, withLock } from '../src/lib/store';
import { type Data, lastReview, submissionStatus } from '../src/lib/model';
import type { MirrorReport } from './mirror-dev-folders';

// Live, opt-in smoke test. Every new file/row is clearly marked TM_TEST and is
// confined to the owner's current DEV root. It never accesses production.
async function main() {
  nextEnv.loadEnvConfig(process.cwd());
  const env = environment();
  assert.equal(env.mode, 'development', 'Live smoke test must only run in DEV');
  assert.equal(env.root, DEV_DRIVE_ROOT);
  const app = new URL(process.env.APP_URL || 'http://localhost:3000').origin;
  assert.ok(['localhost', '127.0.0.1'].includes(new URL(app).hostname), 'Local DEV only');
  let cookie = '';
  let csrf = '';
  async function post(action: string, payload: unknown = {}, operationId = randomUUID()) {
    const response = await fetch(`${app}/api/app`, {
      method: 'POST',
      headers: { origin: app, cookie, 'Content-Type': 'application/json', 'x-csrf-token': csrf },
      body: JSON.stringify({ action, payload, operationId }),
    });
    const result = await response.json();
    if (!response.ok || result.error) throw new Error(result.error || `${action} failed`);
    if (action === 'login') cookie = response.headers.get('set-cookie')!.split(';')[0];
    return result;
  }
  async function get(action: string) {
    const response = await fetch(`${app}/api/app?action=${action}`, { headers: { cookie } });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `${action} failed`);
    return result;
  }
  const data = async (): Promise<Data> => (await get('data')).data;
  async function folder(parent: string, name: string) {
    await assertEnvironmentRoot(parent);
    const matches = (await listFolder(parent)).filter((f) => f.name === name);
    assert.ok(matches.length <= 1 && matches.every((f) => f.mimeType === FOLDER));
    if (matches.length) return matches[0].id;
    const id = await generatedId();
    const result = await googleJson<{ id: string }>(
      'https://www.googleapis.com/drive/v3/files?fields=id&supportsAllDrives=true',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          name,
          mimeType: FOLDER,
          parents: [parent],
          appProperties: { tm_smoke: 'true' },
        }),
      },
    );
    return result.id;
  }
  async function fixture(parent: string, name: string, feedback = false) {
    await assertEnvironmentRoot(parent);
    const existing = (await listFolder(parent)).filter((f) => f.name === name);
    assert.ok(existing.length <= 1);
    if (existing.length) return existing[0].id;
    const id = await generatedId();
    const boundary = `tm_${randomUUID()}`;
    const bytes = await readFile('tests/fixtures/upload-smoke.txt');
    const metadata = {
      id,
      name,
      mimeType: 'text/plain',
      parents: [parent],
      appProperties: feedback ? { tm_smoke: 'true', tm_feedback: 'true' } : { tm_smoke: 'true' },
    };
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: text/plain\r\n\r\n`,
      ),
      bytes,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const response = await googleFetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id',
      {
        method: 'POST',
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body: new Uint8Array(body),
      },
    );
    return (await response.json()).id as string;
  }
  await post('login', { username: 'admin', password: 'admin' });
  let boot = await get('bootstrap');
  csrf = boot.csrf;
  assert.equal(boot.google?.connected, true, 'Connect Google from the website first');
  console.log('PASS: website OAuth callback and persisted Google connection');
  if (!boot.sheet) {
    await post('initialize');
    boot = await get('bootstrap');
  }
  let snapshot = await data();
  console.log('PASS: real Sheets initialization and schema readback');
  const mirrorMode = process.argv.includes('--mirrored');
  const mirror: MirrorReport | null = mirrorMode
    ? JSON.parse(await readFile('test-results/dev-folder-mirror.json', 'utf8'))
    : null;
  if (mirror) {
    assert.equal(mirror.target_root, DEV_DRIVE_ROOT);
    assert.ok(mirror.verified_at);
  }
  const candidates =
    mirror?.folders.filter(
      (n) =>
        n.path.length === 3 &&
        n.path[0].trim().toUpperCase() === 'BVN' &&
        !excluded({ id: n.target_id, name: n.name, mimeType: FOLDER }),
    ) || [];
  const mirroredStudent =
    candidates.find((n) =>
      mirror!.folders.some((f) => f.parent_source_id === n.source_id && f.name === 'Nhan_xet_GV'),
    ) || candidates[0];
  const mirroredSession =
    mirroredStudent &&
    mirror?.folders.find((n) => n.source_id === mirroredStudent.parent_source_id);
  if (mirrorMode)
    assert.ok(mirroredSession && mirroredStudent, 'No unambiguous student-folder branch under BVN');
  const classRoot = mirrorMode
    ? DEV_DRIVE_ROOT
    : await folder(DEV_DRIVE_ROOT, 'TM_CLASSROOM_LIVE_TEST_20261103');
  const sessionFolder = mirroredSession?.target_id || (await folder(classRoot, 'TM_TEST_BUOI'));
  const studentFolder =
    mirroredStudent?.target_id || (await folder(sessionFolder, 'TM_TEST_HOC_VIEN'));
  const feedbackFolder = await folder(studentFolder, 'Nhan_xet_GV');
  const submissionFile = await fixture(studentFolder, 'TM_TEST_bai_nop.txt');
  const teacherFile = await fixture(feedbackFolder, 'TM_TEST_GV_ignored.txt', true);
  let cls = snapshot.Classes.find((c) => c.root_id === classRoot);
  if (!cls) {
    const created = await post('class', {
      name: 'TM_TEST_CLASS · DỮ LIỆU THỬ',
      root_id: classRoot,
      expected_students: 1,
      status: 'active',
    });
    snapshot = await data();
    cls = snapshot.Classes.find((c) => c.id === created.id)!;
  }
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }).format(
    new Date(),
  );
  let student = snapshot.Students.find(
    (s) =>
      s.name === 'TM_TEST_HOC_VIEN' &&
      snapshot.Enrollments.some((e) => e.class_id === cls!.id && e.student_id === s.id),
  );
  if (!student) {
    await post('student', {
      class_id: cls.id,
      students: [{ name: 'TM_TEST_HOC_VIEN', email: '', status: 'active', joined_at: today }],
    });
    snapshot = await data();
    student = snapshot.Students.find(
      (s) =>
        s.name === 'TM_TEST_HOC_VIEN' &&
        snapshot.Enrollments.some((e) => e.class_id === cls!.id && e.student_id === s.id),
    )!;
  }
  let session = snapshot.Sessions.find(
    (s) => s.class_id === cls!.id && s.folder_id === sessionFolder,
  );
  if (!session) {
    const created = await post('session', {
      class_id: cls.id,
      name: mirroredSession ? `${mirroredSession.name} · DEV TEST` : 'TM_TEST_BUOI',
      date: today,
      deadline: new Date(Date.now() - 60_000).toISOString(),
      folder_id: sessionFolder,
      content: 'Dữ liệu kiểm thử riêng, không phải buổi học thật.',
      status: 'active',
    });
    snapshot = await data();
    session = snapshot.Sessions.find((s) => s.id === created.id)!;
  }
  let assignment = snapshot.Assignments.find(
    (a) => a.session_id === session!.id && a.name === 'TM_TEST_BAI',
  );
  if (!assignment) {
    const created = await post('assignment', {
      session_id: session.id,
      name: 'TM_TEST_BAI',
      requirements: 'Bài tập thử cho kiểm tra Google APIs.',
      student_ids: [student.id],
      status: 'active',
    });
    snapshot = await data();
    assignment = snapshot.Assignments.find((a) => a.id === created.id)!;
  }
  const mapping = snapshot.DriveMappings.find(
    (m) =>
      m.assignment_id === assignment!.id && m.student_id === student!.id && m.kind === 'folder',
  );
  await post('mapping', {
    assignment_id: assignment.id,
    student_id: student.id,
    drive_id: studentFolder,
    version: mapping?.version,
  });
  await post('sync', { assignment_id: assignment.id });
  snapshot = await data();
  const submission = snapshot.Submissions.find(
    (s) => s.assignment_id === assignment!.id && s.student_id === student!.id,
  )!;
  assert.ok(submission);
  const files = snapshot.SubmissionFiles.filter(
    (f) => f.submission_id === submission.id && f.present === 'true',
  );
  assert.equal(files.length, 1);
  assert.equal(files[0].drive_id, submissionFile);
  assert.ok(!snapshot.SubmissionFiles.some((f) => f.drive_id === teacherFile));
  const count = snapshot.SubmissionFiles.length;
  await post('sync', { assignment_id: assignment.id });
  snapshot = await data();
  assert.equal(snapshot.SubmissionFiles.length, count);
  console.log('PASS: actual Drive files, verified mapping, repeat sync, teacher-file exclusion');
  let mirroredScenarios: Record<string, boolean> | undefined;
  if (mirror) {
    async function addStudent(name: string) {
      let current = await data();
      let row = current.Students.find(
        (s) =>
          s.name === name &&
          current.Enrollments.some((e) => e.class_id === cls!.id && e.student_id === s.id),
      );
      if (!row) {
        await post('student', {
          class_id: cls!.id,
          students: [{ name, email: '', status: 'active', joined_at: today }],
        });
        current = await data();
        row = current.Students.find(
          (s) =>
            s.name === name &&
            current.Enrollments.some((e) => e.class_id === cls!.id && e.student_id === s.id),
        );
      }
      assert.ok(row);
      return row;
    }
    const direct = await addStudent('TM_TEST_TRUC_TIEP');
    const empty = await addStudent('TM_TEST_FOLDER_RONG');
    const unknown = await addStudent('TM_TEST_CHUA_XAC_MINH');
    const emptyBranch = candidates.find(
      (n) =>
        n.parent_source_id === mirroredStudent!.parent_source_id &&
        n.source_id !== mirroredStudent!.source_id,
    );
    assert.ok(emptyBranch, 'Need a second mirrored student folder to check empty submissions');
    const directFile = await fixture(sessionFolder, 'TM_TEST_bai_nop_truc_tiep.txt');
    snapshot = await data();
    assignment = snapshot.Assignments.find((a) => a.id === assignment!.id)!;
    await post('assignment', {
      id: assignment.id,
      version: assignment.version,
      session_id: session.id,
      name: assignment.name,
      requirements: assignment.requirements,
      student_ids: [student.id, direct.id, empty.id, unknown.id],
      status: 'active',
    });
    for (const pair of [
      { student: direct, drive_id: directFile },
      { student: empty, drive_id: emptyBranch.target_id },
    ]) {
      const previous = snapshot.DriveMappings.find(
        (m) =>
          m.assignment_id === assignment!.id &&
          m.student_id === pair.student.id &&
          m.drive_id === pair.drive_id,
      );
      await post('mapping', {
        assignment_id: assignment.id,
        student_id: pair.student.id,
        drive_id: pair.drive_id,
        version: previous?.version,
      });
    }
    await post('sync', { assignment_id: assignment.id });
    snapshot = await data();
    assignment = snapshot.Assignments.find((a) => a.id === assignment!.id)!;
    assert.equal(submissionStatus(snapshot, assignment, direct.id).files.length, 1);
    assert.equal(submissionStatus(snapshot, assignment, empty.id).status, 'missing');
    assert.equal(submissionStatus(snapshot, assignment, unknown.id).status, 'unverified');
    const directSubmission = submissionStatus(snapshot, assignment, direct.id).submission!;
    await post('submission-time', {
      submission_id: directSubmission.id,
      version: directSubmission.version,
      submitted_at: new Date(Date.parse(session.deadline) + 1000).toISOString(),
    });
    snapshot = await data();
    assert.equal(submissionStatus(snapshot, assignment, direct.id).status, 'late');
    mirroredScenarios = {
      direct_session_file: true,
      empty_verified_folder_missing_after_deadline: true,
      unverified_student_not_missing: true,
      teacher_confirmed_late_submission: true,
    };
    console.log(
      'PASS: mirrored session layout, direct file mapping, empty folder, unverified roster and confirmed late status',
    );
  }
  const reviewPayload = {
    submission_id: submission.id,
    expected_version: Number(lastReview(snapshot, submission.id)?.version || 0),
    score: 0,
    comment: '=1+1\nNhận xét thử · 中文 · điểm 0',
  };
  const reviewOperation = randomUUID();
  const zero = await post('review', reviewPayload, reviewOperation);
  assert.deepEqual(await post('review', reviewPayload, reviewOperation), zero);
  snapshot = await data();
  assert.equal(lastReview(snapshot, submission.id)?.score, '0');
  assert.equal(lastReview(snapshot, submission.id)?.comment, reviewPayload.comment);
  assert.equal(snapshot.Reviews.filter((r) => r.id === zero.id).length, 1);
  const revised = await post('review', {
    ...reviewPayload,
    expected_version: Number(lastReview(snapshot, submission.id)!.version),
    score: 9,
    comment: 'TM_TEST: đã sửa điểm; giữ lại phiên bản 0. 中文',
  });
  snapshot = await data();
  assert.equal(snapshot.Reviews.find((r) => r.id === zero.id)?.score, '0');
  assert.equal(lastReview(snapshot, submission.id)?.id, revised.id);
  console.log(
    'PASS: score zero, Unicode/newline/formula safety, immutable review history, idempotent save',
  );
  const uploadBytes = Buffer.alloc(2 * 1024 * 1024 + 23, 'a');
  uploadBytes.write('TM_TEST — DỮ LIỆU CHỮ THỬ, KHÔNG PHẢI BÀI CHỮA THẬT.\n');
  const uploadPayload = {
    review_id: revised.id,
    name: `TM_TEST_chua_bai_${Date.now()}.txt`,
    mime: 'text/plain',
    size: uploadBytes.length,
  };
  const uploadOperation = randomUUID();
  let progress = await post('upload-init', uploadPayload, uploadOperation);
  assert.deepEqual(await post('upload-init', uploadPayload, uploadOperation), progress);
  let chunks = 0;
  while (!progress.complete) {
    const end = Math.min(progress.offset + progress.chunkSize, uploadBytes.length);
    const response = await fetch(`${app}/api/uploads/${encodeURIComponent(progress.id)}`, {
      method: 'PUT',
      headers: {
        origin: app,
        cookie,
        'x-csrf-token': csrf,
        'x-upload-offset': String(progress.offset),
      },
      body: new Uint8Array(uploadBytes.subarray(progress.offset, end)),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Upload failed');
    assert.ok(result.offset > progress.offset);
    progress = result;
    chunks++;
    console.log(
      `PASS: resumable chunk ${chunks}, confirmed ${progress.offset}/${uploadBytes.length} bytes`,
    );
  }
  assert.equal(progress.recorded, true);
  assert.equal(chunks, 3);
  assert.equal((await post('upload-status', { id: progress.id })).recorded, true);
  assert.equal((await post('upload-reconcile', { id: progress.id })).recorded, true);
  snapshot = await data();
  const reviewFiles = snapshot.ReviewFiles.filter((f) => f.id === progress.id);
  assert.equal(reviewFiles.length, 1);
  assert.equal(reviewFiles[0].review_id, revised.id);
  const uploaded = await getFile(reviewFiles[0].drive_id);
  assert.deepEqual(uploaded.parents, [feedbackFolder]);
  assert.equal(Number(uploaded.size), uploadBytes.length);
  console.log(
    'PASS: real upload in correct Nhan_xet_GV, Sheets linkage and duplicate-free reconciliation',
  );
  await withLock('google', async () => {
    const previous = await readState<GoogleConnection>('google');
    assert.ok(previous?.value.refresh);
    await writeState('google', { ...previous.value, expires: 0 });
  });
  await accessToken();
  await getFile(DEV_DRIVE_ROOT);
  assert.ok((await readState<GoogleConnection>('google'))!.value.expires > Date.now());
  console.log('PASS: actual OAuth refresh and authenticated Drive read after refresh');
  const report = {
    tested_at: new Date().toISOString(),
    environment: 'development',
    drive_root: DEV_DRIVE_ROOT,
    test_class_root: classRoot,
    class_id: cls.id,
    student_id: student.id,
    session_id: session.id,
    assignment_id: assignment.id,
    submission_id: submission.id,
    zero_review_id: zero.id,
    revised_review_id: revised.id,
    uploaded_file_id: uploaded.id,
    uploaded_file_url: uploaded.webViewLink,
    upload_bytes: uploadBytes.length,
    chunks,
    sheet_url: boot.sheet.url,
    oauth_refresh: true,
    production_touched: false,
    mirror_mode: mirrorMode,
    mirrored_folder_count: mirror?.folders_verified,
    mirrored_scenarios: mirroredScenarios,
  };
  await mkdir('test-results', { recursive: true });
  await writeFile('test-results/google-dev-smoke.json', JSON.stringify(report, null, 2));
  console.log('LIVE DEV SMOKE PASS — report saved to test-results/google-dev-smoke.json');
}
main().catch((error) => {
  // Only our known assertions / app errors are printed; never serialize Google responses or credentials.
  console.error('LIVE DEV SMOKE FAILED:', error instanceof Error ? error.message : 'Unknown error');
  process.exitCode = 1;
});
