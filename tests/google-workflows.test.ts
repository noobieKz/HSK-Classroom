import { sheetStateKey } from '../src/lib/sheets';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { emptyData, tables, schema, SCHEMA_VERSION, submissionStatus } from '../src/lib/model';
import { writeState, readState } from '../src/lib/store';
import { transaction, loadData } from '../src/lib/sheets';
import { mutate, syncAssignment } from '../src/lib/business';
import { accessToken } from '../src/lib/google';
import { initUpload, uploadChunk, uploadStatus, reconcileUpload } from '../src/lib/uploads';
import { FOLDER, excluded, saveFeedbackText, submissionFilesByFolder } from '../src/lib/drive';
import { assertEnvironmentRoot } from '../src/lib/drive';
import { classroomRoster, studentFolderNames } from '../src/lib/roster';

async function withGoogle(fn: (mock: ReturnType<typeof googleMock>) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), 'tue-minh-google-'));
  const original = global.fetch;
  process.env.PRIVATE_DATA_DIR = dir;
  process.env.STORAGE_DRIVER = 'file';
  process.env.ENCRYPTION_KEY = randomBytes(32).toString('base64');
  process.env.GOOGLE_CLIENT_ID = 'test-client';
  process.env.GOOGLE_CLIENT_SECRET = 'test-secret';
  const mock = googleMock();
  global.fetch = mock.fetch as typeof fetch;
  await writeState('google', {
    refresh: 'test-refresh',
    access: 'test-access',
    expires: Date.now() + 3600000,
    email: 'teacher@example.invalid',
    scopes: [],
  });
  await writeState(sheetStateKey('sheet-config'), {
    id: 'test-spreadsheet',
    url: 'https://docs.google.com/spreadsheets/d/test-spreadsheet/edit',
  });
  try {
    await fn(mock);
  } finally {
    global.fetch = original;
    await rm(dir, { recursive: true, force: true });
  }
}
function googleMock() {
  let data = emptyData();
  data.Meta = [{ id: 'schema', version: SCHEMA_VERSION }];
  data.Classes = [{ id: 'class', root_id: 'folder_root_0001', name: 'LỚP THỬ' }];
  data.Students = [{ id: 'student', name: 'HỌC VIÊN THỬ' }];
  data.Enrollments = [
    {
      id: 'enrollment',
      class_id: 'class',
      student_id: 'student',
      joined_at: '2026-01-01',
      left_at: '',
      status: 'active',
    },
  ];
  data.Sessions = [
    {
      id: 'session',
      class_id: 'class',
      folder_id: 'folder_session_01',
      date: '2026-11-01',
      deadline: '2026-11-02T00:00:00Z',
    },
  ];
  data.Assignments = [
    {
      id: 'assignment',
      class_id: 'class',
      session_id: 'session',
      name: 'BÀI THỬ',
      student_ids: '[]',
      status: 'active',
    },
  ];
  data.DriveMappings = [
    {
      id: 'mapping',
      class_id: 'class',
      session_id: 'session',
      assignment_id: 'assignment',
      student_id: 'student',
      drive_id: 'folder_student01',
      kind: 'folder',
      verified_at: '2026-01-01T00:00:00Z',
      version: '1',
    },
  ];
  const root = {
    id: 'folder_root_0001',
    name: 'LỚP THỬ',
    mimeType: FOLDER,
    parents: ['1bS5c-YREy8CyeBrEPQ_s8Vrxna2-MBdt'],
  };
  const session = {
    id: 'folder_session_01',
    name: 'BUỔI THỬ',
    mimeType: FOLDER,
    parents: [root.id],
  };
  const student = {
    id: 'folder_student01',
    name: 'HỌC VIÊN THỬ',
    mimeType: FOLDER,
    parents: [session.id],
  };
  const feedback = {
    id: 'folder_feedback01',
    name: 'Nhan_xet_GV',
    mimeType: FOLDER,
    parents: [student.id],
  };
  const file = {
    id: 'submission_file01',
    name: 'Bài nộp thử 中文.pdf',
    mimeType: 'application/pdf',
    parents: [student.id],
    createdTime: '2026-11-01T00:00:00Z',
    modifiedTime: '2026-11-03T00:00:00Z',
    size: '10',
  };
  const state = {
    data,
    batches: 0,
    failRead: false,
    unknownCommit: false,
    completedUpload: false,
    uploadedBytes: 0,
    uploadCreates: 0,
    refreshes: 0,
  };
  const files: Record<string, any> = Object.fromEntries(
    [root, session, student, feedback, file].map((f) => [f.id, f]),
  );
  files['test-spreadsheet'] = {
    id: 'test-spreadsheet',
    name: 'BẢNG THỬ',
    mimeType: 'application/vnd.google-apps.spreadsheet',
    parents: ['1bS5c-YREy8CyeBrEPQ_s8Vrxna2-MBdt'],
  };
  const json = (value: unknown, status = 200) =>
    new Response(JSON.stringify(value), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  let generatedCount = 0;
  const fetch = async (input: string | URL | Request, options: RequestInit = {}) => {
    const url = new URL(String(input));
    if (url.hostname === 'oauth2.googleapis.com') {
      state.refreshes++;
      return json({ access_token: 'refreshed-access', expires_in: 3600 });
    }
    if (url.hostname === 'sheets.googleapis.com') {
      if (url.pathname.endsWith('/values:batchGet'))
        return json({
          valueRanges: tables.map((t) => ({
            values: [[...schema[t]], ...state.data[t].map((r) => schema[t].map((k) => r[k] || ''))],
          })),
        });
      if (url.pathname.endsWith(':batchUpdate')) {
        const requests = JSON.parse(String(options.body)).requests;
        for (const r of requests)
          if (r.updateCells) {
            const { range: start, rows } = r.updateCells;
            const table = tables[start.sheetId];
            state.data[table] = rows
              .slice(1)
              .map((r: any) =>
                Object.fromEntries(
                  schema[table].map((k, i) => [k, r.values[i].userEnteredValue.stringValue]),
                ),
              );
          }
        state.batches++;
        if (state.unknownCommit) {
          state.unknownCommit = false;
          throw new Error('Simulated transport failure after Google committed');
        }
        return json({});
      }
      return json({
        sheets: tables.map((title, sheetId) => ({
          properties: { title, sheetId, gridProperties: { rowCount: 1000, columnCount: 26 } },
        })),
      });
    }
    if (url.pathname === '/drive/v3/files/generateIds')
      return json({
        ids: [`generated_file_${String(++generatedCount).padStart(2, '0')}`],
      });
    if (url.pathname.startsWith('/upload/drive/v3/files')) {
      if (options.method === 'PATCH' && url.searchParams.get('uploadType') === 'media') {
        files[url.pathname.split('/').at(-1)!].content = String(options.body);
        return json({ id: url.pathname.split('/').at(-1) });
      }
      if (options.method === 'POST') {
        state.uploadCreates++;
        const metadata = JSON.parse(String(options.body));
        files[metadata.id] = { ...metadata, size: '10' };
        return new Response(null, {
          status: 200,
          headers: { location: 'https://www.googleapis.com/upload/drive/v3/files?upload_id=test' },
        });
      }
      if (options.method === 'PUT') {
        const headers = options.headers as Record<string, string>;
        if (headers['Content-Range'].startsWith('bytes */'))
          return state.completedUpload
            ? json(files.generated_file_01)
            : new Response(null, {
                status: 308,
                headers: state.uploadedBytes ? { range: `bytes=0-${state.uploadedBytes - 1}` } : {},
              });
        state.uploadedBytes += Number(headers['Content-Length']);
        state.completedUpload = true;
        return json(files.generated_file_01);
      }
    }
    if (url.pathname === '/drive/v3/files') {
      if (options.method === 'POST') {
        const metadata = JSON.parse(String(options.body));
        files[metadata.id] = metadata;
        return json(metadata);
      }
      if (state.failRead) return json({ error: 'Upstream failed' }, 503);
      const query = url.searchParams.get('q') || '';
      if (query.includes(session.id))
        return json({ files: Object.values(files).filter((f) => f.parents?.includes(session.id)) });
      if (query.includes(student.id)) {
        // Two pages; feedback subtree and app-owned teacher files must be ignored.
        if (!url.searchParams.has('pageToken'))
          return json({ files: [file], nextPageToken: 'page2' });
        return json({
          files: [
            feedback,
            {
              id: 'teacher_file_001',
              name: 'Video GV.mp4',
              mimeType: 'video/mp4',
              appProperties: { tm_feedback: 'true' },
            },
          ],
        });
      }
      const parent = query.match(/^'([^']+)' in parents/)?.[1];
      return json({
        files: Object.values(files).filter((f) => !f.trashed && f.parents?.includes(parent)),
      });
    }
    const fileId = url.pathname.split('/').at(-1)!;
    if (files[fileId]) {
      if (options.method === 'PATCH')
        Object.assign(files[fileId], JSON.parse(String(options.body)));
      return json(files[fileId]);
    }
    return json({ error: 'Not found' }, 404);
  };
  return { state, fetch, files };
}
test('New session creates BVN/session/12 student folders and retries reuse folders', async () =>
  withGoogle(async (mock) => {
    mock.state.data.Students = classroomRoster.map((name, i) => ({
      id: `owner${i}`,
      name,
      status: 'active',
    }));
    mock.state.data.Enrollments = mock.state.data.Students.map((s) => ({
      id: `enroll${s.id}`,
      class_id: 'class',
      student_id: s.id,
      status: 'active',
    }));
    const payload = {
      class_id: 'class',
      session_number: 2,
      date: '2026-11-03',
      deadline: '',
      content: '',
      status: 'active',
    };
    const before = Object.keys(mock.files).length;
    await assert.rejects(
      mutate(
        'session',
        { ...payload, session_number: undefined, name: 'KIỂM THỬ linh tinh' },
        'session_invalid_01',
      ),
      /số buổi/,
    );
    assert.equal(Object.keys(mock.files).length, before);
    const first = await mutate('session', payload, 'session_create_0001');
    assert.deepEqual(await mutate('session', payload, 'session_create_0001'), first);
    const session = mock.state.data.Sessions.find((s) => s.id === first.id)!;
    const bvn = Object.values(mock.files).find((f) => f.name === 'BVN')!;
    assert.deepEqual(mock.files[session.folder_id].parents, [bvn.id]);
    const children = Object.values(mock.files).filter((f) =>
      f.parents?.includes(session.folder_id),
    );
    assert.deepEqual(
      children.map((f) => f.name).sort(),
      [...studentFolderNames([...classroomRoster]).values()].sort(),
    );
    assert.equal(session.name, 'Buổi 02_03/11/2026');
    await mutate('session', payload, 'session_create_0002');
    assert.equal(
      Object.values(mock.files).filter((f) => f.parents?.includes(session.folder_id)).length,
      12,
    );
    assert.equal(Object.values(mock.files).filter((f) => f.name === session.name).length, 1);
  }));

test('Homework save creates BTVN.txt, edits the same file, keeps Unicode and uses whole class', async () =>
  withGoogle(async (mock) => {
    const requirements = 'Bài tập tiếng Việt · 中文\nLàm bài 1–3.';
    const first = await mutate(
      'assignment',
      { session_id: 'session', requirements },
      'homework_create_01',
    );
    assert.deepEqual(
      await mutate('assignment', { session_id: 'session', requirements }, 'homework_create_01'),
      first,
    );
    assert.ok(first.file_id);
    const file = mock.files[first.file_id];
    assert.equal(file.name, 'BTVN.txt');
    assert.deepEqual(file.parents, ['folder_session_01']);
    assert.equal(file.content, requirements);
    assert.equal(mock.state.data.Assignments.filter((a) => a.status === 'active').length, 1);
    const saved = mock.state.data.Assignments.find((a) => a.id === first.id)!;
    assert.equal(saved.student_ids, '[]');
    const updated = await mutate(
      'assignment',
      {
        id: saved.id,
        version: saved.version,
        session_id: 'session',
        requirements: 'Nội dung đã sửa\n中文',
      },
      'homework_update_01',
    );
    assert.equal(updated.file_id, first.file_id);
    assert.equal(mock.files[first.file_id].content, 'Nội dung đã sửa\n中文');
    assert.equal(Object.values(mock.files).filter((f) => f.name === 'BTVN.txt').length, 1);
    assert.ok(excluded(file));
    await assert.rejects(
      mutate('assignment', { session_id: 'session', requirements: '   ' }, 'homework_empty_01'),
    );
  }));

test('Feedback text reuses the newest legacy ID, trashes old generated versions and preserves uploads', async () =>
  withGoogle(async (mock) => {
    mock.files.legacy_file_01 = {
      id: 'legacy_file_01',
      name: 'Nhan_xet_v01.txt',
      mimeType: 'text/plain',
      parents: ['folder_feedback01'],
      appProperties: { tm_feedback: 'true' },
    };
    mock.files.legacy_file_02 = {
      id: 'legacy_file_02',
      name: 'Nhan_xet_v02.txt',
      mimeType: 'text/plain',
      parents: ['folder_feedback01'],
      appProperties: { tm_feedback: 'true' },
    };
    mock.files.manual_file_01 = {
      id: 'manual_file_01',
      name: 'Nhan_xet_v99.txt',
      mimeType: 'text/plain',
      parents: ['folder_feedback01'],
      appProperties: { tm_feedback: 'true', tm_upload: 'manual-upload' },
    };
    const first = await saveFeedbackText('folder_feedback01', 'Nội dung mới');
    assert.equal(first, 'legacy_file_02');
    assert.equal(mock.files.legacy_file_02.name, 'Nhan_xet.txt');
    assert.equal(mock.files.legacy_file_01.trashed, true);
    assert.ok(!mock.files.manual_file_01.trashed);
    assert.equal(await saveFeedbackText('folder_feedback01', 'Đã chỉnh sửa'), first);
    assert.equal(mock.files[first].content, 'Đã chỉnh sửa');
    assert.equal(
      Object.values(mock.files).filter((f) => !f.trashed && f.name === 'Nhan_xet.txt').length,
      1,
    );
  }));

test('Sheets transaction receipts prevent duplicates, retain zero and reject stale versions', async () =>
  withGoogle(async (mock) => {
    mock.state.data.Submissions.push({
      id: 'sub',
      class_id: 'class',
      assignment_id: 'assignment',
      student_id: 'student',
      session_id: 'session',
    });
    mock.state.data.SubmissionFiles.push({ id: 'file', submission_id: 'sub', present: 'true' });
    const payload = {
      submission_id: 'sub',
      expected_version: 0,
      score: 0,
      comment: '=1+1\n中文 · nhận xét thử',
    };
    const first = await mutate('review', payload, 'review_test_0001');
    const again = await mutate('review', payload, 'review_test_0001');
    assert.deepEqual(first, again);
    assert.equal(mock.state.data.Reviews.length, 1);
    assert.equal(mock.state.data.Reviews[0].score, '0');
    assert.ok(first.file_id);
    assert.equal(mock.files[first.file_id].name, 'Nhan_xet.txt');
    assert.deepEqual(mock.files[first.file_id].parents, ['folder_feedback01']);
    assert.ok(mock.files[first.file_id].content.includes('Điểm: 0/10'));
    assert.ok(mock.files[first.file_id].content.includes(payload.comment));
    assert.equal(mock.state.data.ReviewFiles.length, 1);
    assert.equal(mock.state.batches, 1);
    await assert.rejects(
      mutate('review', { ...payload, score: 1 }, 'review_test_0001'),
      /nội dung khác/,
    );
    await assert.rejects(mutate('review', payload, 'review_test_0002'), /phiên khác/);
    const edited = await mutate(
      'review',
      { ...payload, expected_version: 1, score: 9, comment: 'Đã sửa nhận xét · 中文' },
      'review_test_0003',
    );
    assert.equal(mock.state.data.Reviews.length, 2);
    assert.equal(mock.state.data.ReviewFiles.length, 1);
    assert.equal(edited.file_id, first.file_id);
    assert.equal(mock.files[first.file_id].name, 'Nhan_xet.txt');
    assert.ok(mock.files[first.file_id].content.includes('Đã sửa nhận xét · 中文'));
    assert.ok(mock.files[first.file_id].content.includes('Điểm: 9/10'));
    assert.equal(mock.state.data.Reviews[0].score, '0');
  }));
test('Unknown Sheets outcome freezes writes; its receipt permits safe same-operation recovery', async () =>
  withGoogle(async (mock) => {
    mock.state.unknownCommit = true;
    await assert.rejects(
      transaction('unknown_test_0001', { test: true }, (data) => {
        data.Students.push({ id: 'new', name: 'THỬ' });
        return { id: 'new' };
      }),
    );
    assert.ok((await loadData()).Operations.some((o) => o.id === 'unknown_test_0001'));
    await assert.rejects(
      transaction('other_test_0001', {}, () => null),
      /chưa xác định/,
    );
    const marker = await readState<Record<string, unknown>>(sheetStateKey('business-uncertain'));
    await writeState(sheetStateKey('business-uncertain'), { ...marker!.value, resolved: true });
    const result = await transaction('unknown_test_0001', { test: true }, () => {
      throw new Error('Must not run twice');
    });
    assert.deepEqual(result, { id: 'new' });
    assert.equal(mock.state.data.Students.filter((s) => s.id === 'new').length, 1);
  }));
test('Teacher can grade and confirm submission time while Drive scan is in flight', async () =>
  withGoogle(async (mock) => {
    await syncAssignment('assignment', 'parallel_initial_01');
    const submission = mock.state.data.Submissions[0];
    let unblock!: () => void, entered!: () => void;
    const gate = new Promise<void>((resolve) => {
      unblock = resolve;
    });
    const scanning = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const original = global.fetch;
    let blocked = false;
    global.fetch = (async (input: any, options: any) => {
      const url = new URL(String(input));
      if (
        url.pathname === '/drive/v3/files' &&
        url.searchParams.get('q')?.includes('folder_student01') &&
        !blocked
      ) {
        blocked = true;
        entered();
        await gate;
      }
      return original(input, options);
    }) as typeof fetch;
    const sync = syncAssignment('assignment', 'parallel_scan_01');
    try {
      await scanning;
      const review = await mutate(
        'review',
        {
          submission_id: submission.id,
          expected_version: 0,
          score: 8,
          comment: 'Concurrent teacher review',
        },
        'parallel_review_01',
      );
      await mutate(
        'submission-time',
        {
          submission_id: submission.id,
          version: submission.version,
          submitted_at: '2026-11-01T01:00:00Z',
        },
        'parallel_timing_01',
      );
      unblock();
      assert.deepEqual(await sync, { count: 1 });
      const result = await loadData();
      assert.equal(result.Reviews.find((r) => r.id === review.id)?.score, '8');
      assert.equal(result.Submissions[0].submitted_at, '2026-11-01T01:00:00Z');
      assert.equal(result.Submissions[0].timing_source, 'teacher_verified');
    } finally {
      unblock();
      await sync;
      global.fetch = original;
    }
  }));

test('Batched Drive reads keep owners across pages and nested folders and skip feedback/shortcuts', async () =>
  withGoogle(async (mock) => {
    mock.files.folder_student02 = {
      id: 'folder_student02',
      name: 'B',
      mimeType: FOLDER,
      parents: ['folder_session_01'],
    };
    mock.files.file_student02 = {
      id: 'file_student02',
      name: 'b.pdf',
      mimeType: 'application/pdf',
      parents: ['folder_student02'],
    };
    mock.files.nested_folder01 = {
      id: 'nested_folder01',
      name: 'Bài thêm',
      mimeType: FOLDER,
      parents: ['folder_student01'],
    };
    mock.files.nested_file_001 = {
      id: 'nested_file_001',
      name: 'a-extra.pdf',
      mimeType: 'application/pdf',
      parents: ['nested_folder01'],
    };
    mock.files.shortcut_file01 = {
      id: 'shortcut_file01',
      name: 'shortcut',
      mimeType: 'application/vnd.google-apps.shortcut',
      parents: ['folder_student01'],
    };
    const queries: string[][] = [];
    const original = global.fetch;
    global.fetch = (async (input: any, options: any) => {
      const url = new URL(String(input));
      if (url.pathname !== '/drive/v3/files') return original(input, options);
      const parents = [...url.searchParams.get('q')!.matchAll(/'([^']+)' in parents/g)].map(
        (m) => m[1],
      );
      queries.push(parents);
      const files = Object.values(mock.files).filter(
        (f) => !f.trashed && f.parents?.some((p: string) => parents.includes(p)),
      );
      return Response.json(
        parents.length === 2
          ? url.searchParams.has('pageToken')
            ? { files: files.slice(2) }
            : { files: files.slice(0, 2), nextPageToken: 'second' }
          : { files },
      );
    }) as typeof fetch;
    const result = await submissionFilesByFolder(
      ['folder_student01', 'folder_student02'],
      Date.now() + 5000,
    );
    assert.deepEqual(
      result
        .get('folder_student01')!
        .map((f) => f.id)
        .sort(),
      ['submission_file01', 'nested_file_001'].sort(),
    );
    assert.deepEqual(
      result.get('folder_student02')!.map((f) => f.id),
      ['file_student02'],
    );
    assert.equal(queries.length, 3);
    assert.deepEqual(queries[0], ['folder_student01', 'folder_student02']);
    assert.ok(!queries.flat().includes('folder_feedback01'));
  }));

test('Drive pagination, repeat sync, feedback exclusions and failure preservation', async () =>
  withGoogle(async (mock) => {
    mock.files.folder_student01.name = '01. HỌC VIÊN THỬ';
    mock.state.data.DriveMappings[0].drive_id = 'obsolete_wrong_folder';
    assert.deepEqual(await syncAssignment('assignment', 'sync_test_0001'), { count: 1 });
    assert.deepEqual(await syncAssignment('assignment', 'sync_test_0002'), { count: 1 });
    assert.equal(mock.state.data.Submissions.length, 1);
    assert.equal(mock.state.data.DriveMappings.length, 1);
    assert.equal(mock.state.data.DriveMappings[0].drive_id, 'folder_student01');
    assert.equal(mock.state.data.SubmissionFiles.length, 1);
    assert.equal(mock.state.data.SubmissionFiles[0].name, 'Bài nộp thử 中文.pdf');
    mock.state.failRead = true;
    const result = await syncAssignment('assignment', 'sync_test_0003');
    assert.ok('error' in result);
    assert.equal(mock.state.data.SubmissionFiles[0].present, 'true');
    assert.equal(mock.state.data.SyncLogs.at(-1)?.status, 'error');
    assert.equal(
      submissionStatus(mock.state.data, mock.state.data.Assignments[0], 'student').status,
      'sync_error',
    );
  }));

test('Missing student folder needs no manual verification and is picked up automatically on next sync', async () =>
  withGoogle(async (mock) => {
    mock.state.data.Students[0].name = 'Không có folder';
    await syncAssignment('assignment', 'sync_no_folder_01');
    assert.equal(
      submissionStatus(mock.state.data, mock.state.data.Assignments[0], 'student').status,
      'folder_missing',
    );
    assert.equal(mock.state.data.DriveMappings.length, 0);
    mock.state.data.Students[0].name = 'HỌC VIÊN THỬ';
    await syncAssignment('assignment', 'sync_found_folder_01');
    assert.equal(
      submissionStatus(mock.state.data, mock.state.data.Assignments[0], 'student').files.length,
      1,
    );
    mock.files.folder_student02 = { ...mock.files.folder_student01, id: 'folder_student02' };
    const duplicate = await syncAssignment('assignment', 'sync_duplicate_01');
    assert.ok('error' in duplicate);
    assert.equal(
      submissionStatus(mock.state.data, mock.state.data.Assignments[0], 'student').status,
      'sync_error',
    );
    assert.equal(mock.state.data.SubmissionFiles[0].present, 'true');
  }));
test('OAuth automatic refresh keeps the old refresh token when Google omits a replacement', async () =>
  withGoogle(async (mock) => {
    const entry = await readState<any>('google');
    await writeState('google', { ...entry!.value, expires: 0 });
    assert.equal(await accessToken(), 'refreshed-access');
    assert.equal(mock.state.refreshes, 1);
    assert.equal((await readState<any>('google'))!.value.refresh, 'test-refresh');
    assert.equal(await accessToken(), 'refreshed-access');
    assert.equal(mock.state.refreshes, 1);
  }));
test('Resumable upload verifies Drive and recovers Sheets linkage without uploading again', async () =>
  withGoogle(async (mock) => {
    mock.state.data.Submissions.push({
      id: 'sub',
      class_id: 'class',
      assignment_id: 'assignment',
      student_id: 'student',
      session_id: 'session',
    });
    mock.state.data.Reviews.push({
      id: 'review',
      class_id: 'class',
      submission_id: 'sub',
      version: '1',
    });
    const progress = await initUpload(
      { review_id: 'review', name: 'TEST ONLY.pdf', mime: 'application/pdf', size: 10 },
      'upload_test_0001',
      'session-id',
    );
    assert.ok(!('uri' in progress));
    assert.equal(progress.offset, 0);
    mock.state.unknownCommit = true;
    await assert.rejects(uploadChunk(progress.id, 'session-id', 0, Buffer.from('0123456789')));
    assert.equal(mock.state.uploadedBytes, 10);
    assert.equal((await readState<any>(`upload:${progress.id}`))!.value.complete, true);
    const marker = await readState<any>(sheetStateKey('business-uncertain'));
    await writeState(sheetStateKey('business-uncertain'), { ...marker!.value, resolved: true });
    const final = await reconcileUpload(progress.id);
    assert.equal(final.recorded, true);
    assert.equal(mock.state.data.ReviewFiles.filter((f) => f.id === progress.id).length, 1);
    const feedback = mock.state.data.ReviewFiles.find((f) => f.name === 'Nhan_xet.txt')!;
    assert.ok(feedback);
    assert.ok(mock.files[feedback.drive_id].content.includes('TEST ONLY.pdf'));
    assert.ok(
      mock.files[feedback.drive_id].content.includes(
        'https://drive.google.com/file/d/generated_file_01/view',
      ),
    );
    assert.equal(mock.state.uploadCreates, 1);
    assert.equal(mock.state.uploadedBytes, 10);
    assert.equal((await uploadStatus(progress.id, 'session-id')).recorded, true);
    await assert.rejects(uploadStatus(progress.id, 'other-session'), /đăng nhập khác/);
  }));
