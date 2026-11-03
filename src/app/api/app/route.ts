import { sheetStateKey } from '@/lib/sheets';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { login, logout, requireSession, getSession, sameOrigin, csrf } from '@/lib/auth';
import { googleStatus, disconnectGoogle, googleConfig, callbackUrl, SCOPES } from '@/lib/google';
import {
  loadData,
  sheetConfig,
  initializeSheets,
  resumeInitialization,
  assertCertain,
} from '@/lib/sheets';
import { mutate, syncAssignment, find } from '@/lib/business';
import { listFolder, inside, assertEnvironmentRoot } from '@/lib/drive';
import { environment } from '@/lib/environment';
import { publicError, invariant } from '@/lib/errors';
import { readState, writeState, withLock, Lock } from '@/lib/store';
import { randomToken, digest } from '@/lib/crypto';
import { csv, includedStudents, submissionStatus, statusLabels } from '@/lib/model';
import { initUpload, uploadStatus, reconcileUpload } from '@/lib/uploads';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
function json(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers: { 'Cache-Control': 'no-store, private' } });
}
function failure(e: unknown) {
  if (e instanceof z.ZodError)
    return json(
      {
        error:
          'Dữ liệu chưa hợp lệ: ' +
          e.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(';'),
      },
      400,
    );
  const err = publicError(e);
  return json({ error: err.message, code: err.code }, err.status);
}
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const action = url.searchParams.get('action') || 'bootstrap';
    if (action === 'bootstrap') {
      const session = await getSession();
      if (!session) return json({ authenticated: false });
      return json({
        authenticated: true,
        csrf: session.csrf,
        google: await googleStatus(),
        sheet: await sheetConfig(),
        environment: environment(),
      });
    }
    await requireSession();
    if (action === 'data') return json({ data: await loadData() });
    if (action === 'drive') {
      const data = await loadData();
      const cls = find(data, 'Classes', url.searchParams.get('class_id') || '');
      const folder = url.searchParams.get('folder_id') || cls.root_id;
      await assertEnvironmentRoot(cls.root_id);
      await inside(folder, cls.root_id);
      return json({ files: await listFolder(folder) });
    }
    if (action === 'health') {
      const [lock, uncertain] = await Promise.all([
        readState<Lock>('lock:business'),
        readState<{ id: string; at: number; resolved?: boolean }>(
          sheetStateKey('business-uncertain'),
        ),
      ]);
      return json({
        lock: lock?.value || null,
        uncertain: uncertain?.value || null,
        google: await googleStatus(),
        sheet: await sheetConfig(),
      });
    }
    if (action === 'export') {
      const data = await loadData();
      const classId = url.searchParams.get('class_id') || '';
      find(data, 'Classes', classId);
      const rows: unknown[][] = [
        [
          'Lớp',
          'Buổi',
          'Bài tập',
          'Học viên',
          'Trạng thái',
          'Điểm',
          'Nhận xét',
          'Chấm lúc',
          'Đồng bộ lúc',
        ],
      ];
      for (const a of data.Assignments.filter((a) => a.class_id === classId))
        for (const s of includedStudents(data, a)) {
          const state = submissionStatus(data, a, s.id);
          rows.push([
            find(data, 'Classes', classId).name,
            find(data, 'Sessions', a.session_id).name,
            a.name,
            s.name,
            statusLabels[state.status],
            state.review?.score ?? '',
            state.review?.comment || '',
            state.review?.created_at || '',
            state.syncedAt,
          ]);
        }
      return new Response(csv(rows), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="tue-minh-bao-cao.csv"',
          'Cache-Control': 'no-store, private',
        },
      });
    }
    return json({ error: 'Không có chức năng này.' }, 404);
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    invariant(
      Number(request.headers.get('content-length') || 0) <= 256 * 1024,
      'Yêu cầu quá lớn.',
      413,
    );
    const text = await request.text();
    invariant(Buffer.byteLength(text) <= 256 * 1024, 'Yêu cầu quá lớn.', 413);
    const body = z
      .object({
        action: z.string().max(40),
        payload: z.unknown().optional(),
        operationId: z
          .string()
          .regex(/^[a-zA-Z0-9_-]{8,90}$/)
          .optional(),
      })
      .parse(JSON.parse(text));
    if (body.action === 'login') {
      const p = z
        .object({ username: z.string().max(100), password: z.string().max(128) })
        .parse(body.payload);
      await login(p.username, p.password);
      return json({ ok: true });
    }
    const session = await requireSession();
    csrf(request, session);
    if (body.action === 'logout') {
      await logout(session);
      return json({ ok: true });
    }
    await requireSession();
    if (body.action === 'google-connect') {
      const config = googleConfig();
      const state = randomToken();
      const verifier = randomToken();
      await writeState(
        `oauth:${digest(state)}`,
        {
          state,
          verifier,
          session_id: session.id,
          expires: Date.now() + 10 * 60000,
          consumed: false,
        },
        { onlyIfNew: true },
      );
      const params = new URLSearchParams({
        client_id: config.client_id,
        redirect_uri: callbackUrl(),
        response_type: 'code',
        scope: SCOPES.join(' '),
        state,
        access_type: 'offline',
        prompt: 'consent',
        include_granted_scopes: 'true',
        code_challenge: Buffer.from(digest(verifier), 'hex').toString('base64url'),
        code_challenge_method: 'S256',
      });
      return json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
    }
    if (body.action === 'google-disconnect') {
      await disconnectGoogle();
      return json({ ok: true });
    }
    if (body.action === 'initialize') return json(await initializeSheets());
    if (body.action === 'resume-initialize') return json(await resumeInitialization());
    if (body.action === 'recover-lock') {
      const p = z
        .object({
          name: z
            .string()
            .regex(
              /^(business|google|login|credentials|upload:[a-zA-Z0-9_-]+|feedback:[a-zA-Z0-9_-]+|sync:[a-zA-Z0-9_-]+)$/,
            ),
        })
        .parse(body.payload);
      const key = `lock:${p.name}`;
      const entry = await readState<Lock>(key);
      invariant(entry?.value.busy, 'Khóa hiện không bận.');
      invariant(
        Date.now() - entry.value.started > 5 * 60000,
        'Chờ ít nhất 5 phút sau thao tác bị ngắt để yêu cầu cũ kết thúc.',
        409,
      );
      invariant(
        await writeState(key, { ...entry.value, busy: false }, { onlyIfMatch: entry.etag }),
        'Khóa đã thay đổi. Tải lại.',
        409,
      );
      return json({ ok: true });
    }
    if (body.action === 'reconcile-write') {
      return json(
        await withLock('business', async () => {
          const uncertain = (
            await readState<{ id: string; at: number; resolved?: boolean }>(
              sheetStateKey('business-uncertain'),
            )
          )?.value;
          invariant(uncertain && !uncertain.resolved, 'Không có lần ghi cần đối soát.');
          invariant(
            Date.now() - uncertain.at > 5 * 60000,
            'Chờ 5 phút để yêu cầu Google cũ kết thúc.',
            409,
          );
          const data = await loadData();
          const receipt = data.Operations.find((o) => o.id === uncertain.id);
          await writeState(sheetStateKey('business-uncertain'), { ...uncertain, resolved: true });
          return {
            ok: true,
            result: receipt
              ? 'Google Sheets đã ghi và có biên nhận. Tải lại dữ liệu.'
              : 'Không thấy biên nhận trên Sheets. Có thể thử lại với cùng mã thao tác.',
          };
        }),
      );
    }
    invariant(body.operationId, 'Thiếu mã thao tác.');
    if (body.action === 'upload-init') {
      await assertCertain();
      return json(await initUpload(body.payload, body.operationId, session.id));
    }
    if (body.action === 'upload-status') {
      const p = z.object({ id: z.string() }).parse(body.payload);
      return json(await uploadStatus(p.id, session.id));
    }
    if (body.action === 'upload-reconcile') {
      const p = z.object({ id: z.string() }).parse(body.payload);
      return json(await reconcileUpload(p.id));
    }
    if (body.action === 'sync') {
      const p = z.object({ assignment_id: z.string().min(1) }).parse(body.payload);
      return json(await syncAssignment(p.assignment_id, body.operationId));
    }
    invariant(
      [
        'class',
        'student',
        'students-import',
        'enrollment',
        'session',
        'assignment',
        'mapping',
        'review',
        'submission-time',
      ].includes(body.action),
      'Chức năng không hợp lệ.',
    );
    return json(await mutate(body.action, body.payload, body.operationId));
  } catch (e) {
    return failure(e);
  }
}
