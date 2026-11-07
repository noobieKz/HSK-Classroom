import { z } from 'zod';
import { googleFetch, accessToken } from './google';
import { loadData, transaction } from './sheets';
import { find, persistReviewText } from './business';
import { lastReview } from './model';
import {
  getFile,
  inside,
  feedbackFolder,
  generatedId,
  fileLink,
  FOLDER,
  assertEnvironmentRoot,
} from './drive';
import { readState, writeState, withLock } from './store';
import { digest } from './crypto';
import { invariant, AppError } from './errors';
export const CHUNK_SIZE = 1024 * 1024;
export type Upload = {
  id: string;
  fingerprint: string;
  session_id: string;
  review_id: string;
  class_id: string;
  parent: string;
  mapping_id: string;
  mapping_drive_id: string;
  mapping_version: string;
  name: string;
  mime: string;
  size: number;
  drive_id: string;
  uri: string;
  offset: number;
  expires: number;
  complete: boolean;
  recorded: boolean;
};
function validUri(uri: string) {
  const url = new URL(uri);
  invariant(
    url.origin === 'https://www.googleapis.com' &&
      url.pathname.startsWith('/upload/drive/v3/files'),
    'Địa chỉ upload Google không hợp lệ.',
    502,
  );
}
export async function initUpload(raw: unknown, operationId: string, sessionId: string) {
  const p = z
    .object({
      review_id: z.string().min(1),
      name: z
        .string()
        .trim()
        .min(1)
        .max(240)
        .refine((s) => !/[\x00-\x1f/\\]/.test(s)),
      mime: z
        .string()
        .regex(/^[\w.+-]+\/[\w.+-]+$/)
        .max(150),
      size: z
        .number()
        .int()
        .min(1)
        .max(10 * 1024 ** 3),
    })
    .parse(raw);
  invariant(/^[a-zA-Z0-9_-]{8,100}$/.test(operationId), 'Mã upload không hợp lệ.');
  return withLock(`upload:${operationId}`, async () => {
    const fingerprint = digest(JSON.stringify(p));
    let record = (await readState<Upload>(`upload:${operationId}`))?.value;
    if (record)
      invariant(
        record.fingerprint === fingerprint && record.session_id === sessionId,
        'Mã upload đã được sử dụng.',
        409,
      );
    if (record?.uri || record?.complete) {
      await assertEnvironmentRoot(record.parent);
      return safeUpload(record);
    }
    const data = await loadData();
    const review = find(data, 'Reviews', p.review_id);
    const sub = find(data, 'Submissions', review.submission_id);
    const session = find(data, 'Sessions', sub.session_id);
    const cls = find(data, 'Classes', sub.class_id);
    await assertEnvironmentRoot(cls.root_id);
    const mappings = data.DriveMappings.filter(
      (m) =>
        m.assignment_id === sub.assignment_id &&
        m.student_id === sub.student_id &&
        m.kind === 'folder',
    );
    invariant(
      mappings.length === 1,
      'Cần xác minh một folder học viên cho bài tập này trước khi upload.',
      409,
    );
    const mapping = mappings[0];
    await inside(mapping.drive_id, session.folder_id);
    await inside(session.folder_id, cls.root_id);
    invariant(
      (await getFile(mapping.drive_id)).mimeType === FOLDER,
      'Folder học viên không còn hợp lệ.',
    );
    const parent = await feedbackFolder(mapping.drive_id);
    if (!record) {
      record = {
        id: operationId,
        fingerprint,
        session_id: sessionId,
        review_id: review.id,
        class_id: sub.class_id,
        parent,
        mapping_id: mapping.id,
        mapping_drive_id: mapping.drive_id,
        mapping_version: mapping.version,
        name: p.name,
        mime: p.mime,
        size: p.size,
        drive_id: await generatedId(),
        uri: '',
        offset: 0,
        expires: Date.now() + 6 * 86400_000,
        complete: false,
        recorded: false,
      };
      await writeState(`upload:${operationId}`, record);
    }
    // Pre-generated file identity survives lost init responses; retries cannot create two files.
    const response = await googleFetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id,name,size,parents,mimeType',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Upload-Content-Type': record.mime,
          'X-Upload-Content-Length': String(record.size),
        },
        body: JSON.stringify({
          id: record.drive_id,
          name: record.name,
          mimeType: record.mime,
          parents: [record.parent],
          appProperties: { tm_feedback: 'true', tm_upload: record.id, tm_review: record.review_id },
        }),
      },
    );
    const uri = response.headers.get('location');
    invariant(uri, 'Google chưa cấp phiên upload.', 502);
    validUri(uri);
    record.uri = uri;
    await writeState(`upload:${operationId}`, record);
    return safeUpload(record);
  }, 10000, true);
}
function safeUpload(u: Upload) {
  return {
    id: u.id,
    name: u.name,
    size: u.size,
    offset: u.offset,
    complete: u.complete,
    recorded: u.recorded,
    drive_id: u.complete ? u.drive_id : '',
    chunkSize: CHUNK_SIZE,
  };
}
async function requireUpload(id: string, sessionId: string) {
  invariant(/^[a-zA-Z0-9_-]{8,100}$/.test(id), 'Mã upload không hợp lệ.');
  const upload = (await readState<Upload>(`upload:${id}`))?.value;
  invariant(upload, 'Không tìm thấy phiên upload.', 404);
  await assertEnvironmentRoot(upload.parent);
  invariant(
    upload.session_id === sessionId,
    'Phiên upload thuộc lần đăng nhập khác. Dùng chức năng Đối soát theo mã upload.',
    403,
  );
  invariant(
    upload.expires > Date.now() || upload.complete,
    'Phiên upload đã hết hạn. Đối soát file trên Drive trước khi tạo phiên mới.',
    410,
  );
  return upload;
}
async function finalize(upload: Upload) {
  await assertEnvironmentRoot(upload.parent);
  const file = await getFile(upload.drive_id);
  invariant(
    file.parents?.includes(upload.parent) &&
      file.appProperties?.tm_upload === upload.id &&
      Number(file.size) === upload.size,
    'Chưa xác minh được file hoàn chỉnh trên Drive.',
    409,
  );
  upload.complete = true;
  upload.offset = upload.size;
  await writeState(`upload:${upload.id}`, upload); // persist Drive success before Sheets write
  await transaction(`upload_${upload.id}`, { upload_id: upload.id }, async (data) => {
    const review = find(data, 'Reviews', upload.review_id);
    invariant(review.class_id === upload.class_id, 'Liên kết lần chấm không hợp lệ.');
    const mapping = data.DriveMappings.find((m) => m.id === upload.mapping_id);
    invariant(
      mapping &&
        mapping.drive_id === upload.mapping_drive_id &&
        mapping.version === upload.mapping_version,
      'Ánh xạ đã thay đổi trong khi upload. File đã có trên Drive; kiểm tra ánh xạ cũ trước khi đối soát.',
      409,
    );
    if (!data.ReviewFiles.some((r) => r.drive_id === upload.drive_id))
      data.ReviewFiles.push({
        id: upload.id,
        class_id: upload.class_id,
        review_id: upload.review_id,
        drive_id: file.id,
        name: file.name,
        url: fileLink(file.id),
        mime: file.mimeType,
        size: file.size || '',
        created_at: new Date().toISOString(),
        operation_id: upload.id,
      });
    const latest = lastReview(data, review.submission_id);
    invariant(latest, 'Không tìm thấy nhận xét hiện tại.');
    await persistReviewText(data, latest, upload.parent);
    return { id: upload.id };
  });
  upload.recorded = true;
  await writeState(`upload:${upload.id}`, upload);
  return safeUpload(upload);
}
async function protocol(upload: Upload, body: Buffer | null, offset = 0) {
  validUri(upload.uri);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${await accessToken()}`,
    'Content-Length': String(body?.length || 0),
    'Content-Range': body
      ? `bytes ${offset}-${offset + body.length - 1}/${upload.size}`
      : `bytes */${upload.size}`,
  };
  if (body) headers['Content-Type'] = upload.mime;
  const response = await fetch(upload.uri, {
    method: 'PUT',
    headers,
    body: body ? new Uint8Array(body) : undefined,
    redirect: 'manual',
    signal: AbortSignal.timeout(18000),
    cache: 'no-store',
  });
  if (response.status === 200 || response.status === 201) return finalize(upload);
  if (response.status === 308) {
    const range = response.headers.get('range');
    upload.offset = range ? Number(range.split('-')[1]) + 1 : 0;
    await writeState(`upload:${upload.id}`, upload);
    return safeUpload(upload);
  }
  if (response.status === 404 || response.status === 410)
    throw new AppError(
      410,
      'Phiên Drive hết hạn. Dùng Đối soát theo mã upload để kiểm tra file hoàn chỉnh.',
    );
  throw new AppError(
    502,
    'Upload chưa được xác nhận. Bấm Kiểm tra / tiếp tục để hỏi lại Drive trước khi gửi thêm.',
  );
}
export async function uploadStatus(id: string, sessionId: string) {
  return withLock(`upload:${id}`, async () => {
    const upload = await requireUpload(id, sessionId);
    if (upload.complete) return upload.recorded ? safeUpload(upload) : finalize(upload);
    invariant(upload.uri, 'Phiên chưa khởi tạo xong. Thử lại Khởi tạo với cùng mã.');
    return protocol(upload, null);
  }, 10000, true);
}
export async function uploadChunk(id: string, sessionId: string, offset: number, body: Buffer) {
  return withLock(`upload:${id}`, async () => {
    const upload = await requireUpload(id, sessionId);
    if (upload.complete) return upload.recorded ? safeUpload(upload) : finalize(upload);
    invariant(
      Number.isSafeInteger(offset) && offset === upload.offset,
      'Vị trí upload đã thay đổi. Kiểm tra lại tiến độ.',
      409,
    );
    invariant(
      body.length > 0 && body.length <= CHUNK_SIZE && offset + body.length <= upload.size,
      'Dung lượng phần upload không hợp lệ.',
    );
    invariant(
      offset + body.length === upload.size || body.length % 262144 === 0,
      'Phần upload phải là bội số 256 KB.',
    );
    return protocol(upload, body, offset);
  }, 10000, true);
}
export async function reconcileUpload(id: string) {
  invariant(/^[a-zA-Z0-9_-]{8,100}$/.test(id), 'Mã upload không hợp lệ.');
  return withLock(`upload:${id}`, async () => {
    const upload = (await readState<Upload>(`upload:${id}`))?.value;
    invariant(upload, 'Không tìm thấy nhật ký upload.', 404);
    return finalize(upload); // deliberate admin recovery across sessions; no re-upload
  }, 10000, true);
}
