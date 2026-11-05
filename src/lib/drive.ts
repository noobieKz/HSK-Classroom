import { googleJson, googleFetch } from './google';
import { invariant } from './errors';
import { readOptionalState, writeState, withLock } from './store';
import { environment } from './environment';
import type { Row } from './model';
export const FOLDER = 'application/vnd.google-apps.folder';
export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  parents?: string[];
  createdTime?: string;
  modifiedTime?: string;
  webViewLink?: string;
  size?: string;
  trashed?: boolean;
  appProperties?: Record<string, string>;
};
const fields =
  'id,name,mimeType,parents,createdTime,modifiedTime,webViewLink,size,trashed,appProperties';
export function driveId(value: string) {
  invariant(
    /^[a-zA-Z0-9_-]{10,150}$/.test(value),
    'Drive ID không hợp lệ. Dùng ID hoặc chọn mục trong trình duyệt Drive.',
  );
  return value;
}
export const fileLink = (id: string) => `https://drive.google.com/file/d/${driveId(id)}/view`;
export async function getFile(id: string) {
  return googleJson<DriveFile>(
    `https://www.googleapis.com/drive/v3/files/${driveId(id)}?supportsAllDrives=true&fields=${fields}`,
  );
}
// A 404 can also mean lost access. Only confirmed trash may hide a session.
export async function sessionFolderStates(sessions: Row[]) {
  return Promise.all(
    sessions.map(async (session) => {
      try {
        const folder = await getFile(session.folder_id);
        return {
          id: session.id,
          state:
            folder.trashed === true
              ? 'trashed'
              : folder.mimeType === FOLDER
                ? 'present'
                : 'unknown',
        };
      } catch {
        return { id: session.id, state: 'unknown' };
      }
    }),
  );
}
export async function listFolder(id: string, deadline = Date.now() + 25000) {
  return listFolders([id], deadline);
}
export async function listFolders(ids: string[], deadline = Date.now() + 25000) {
  invariant(ids.length > 0 && ids.length <= 25, 'Phạm vi đọc thư mục không hợp lệ.');
  ids.forEach(driveId);
  const result: DriveFile[] = [];
  let pageToken = '';
  do {
    invariant(
      Date.now() < deadline,
      'Thư mục quá lớn cho một lần đồng bộ. Chia nhỏ phạm vi theo bài tập.',
      422,
    );
    const q = new URLSearchParams({
      q:
        ids.length === 1
          ? `'${ids[0]}' in parents and trashed = false`
          : `(${ids.map((id) => `'${id}' in parents`).join(' or ')}) and trashed = false`,
      fields: `nextPageToken,files(${fields})`,
      pageSize: '1000',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
    });
    if (pageToken) q.set('pageToken', pageToken);
    const page = await googleJson<{ files: DriveFile[]; nextPageToken?: string }>(
      `https://www.googleapis.com/drive/v3/files?${q}`,
    );
    result.push(...page.files);
    pageToken = page.nextPageToken || '';
  } while (pageToken);
  return result;
}
export async function inside(id: string, ancestor: string, allowExcluded = false) {
  let current = driveId(id);
  const seen = new Set<string>();
  for (let depth = 0; depth < 30; depth++) {
    if (current === ancestor) return;
    invariant(!seen.has(current), 'Cấu trúc Drive có vòng lặp.');
    seen.add(current);
    const file = await getFile(current);
    invariant(
      allowExcluded || !excluded(file),
      'Không chọn mục nằm trong thư mục nhận xét GV hoặc mục hệ thống.',
      403,
    );
    invariant(
      !file.trashed && file.parents?.length === 1,
      'Không xác minh được thư mục cha của mục Drive.',
      403,
    );
    current = file.parents![0];
  }
  invariant(false, 'Mục Drive không nằm trong phạm vi được cấu hình.', 403);
}
export async function assertEnvironmentRoot(id: string) {
  const config = environment();
  if (config.mode === 'development') await inside(id, config.root, true);
}
export function excluded(file: DriveFile) {
  const name = file.name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .toLowerCase()
    .replace(/[\s_-]/g, '');
  return (
    name === 'nhanxetgv' ||
    (file.mimeType === FOLDER && name === 'btvn') ||
    !!file.appProperties?.tm_homework ||
    file.name.startsWith('.') ||
    /^thumbs\.db$|^desktop\.ini$/i.test(file.name) ||
    !!file.appProperties?.tm_feedback
  );
}
export async function submissionFiles(
  folder: string,
  deadline: number,
  ignored = new Set<string>(),
): Promise<DriveFile[]> {
  const result: DriveFile[] = [];
  const queue = [folder];
  const seen = new Set<string>();
  while (queue.length) {
    invariant(
      seen.size < 100 && result.length < 2000 && Date.now() < deadline,
      'Phạm vi đồng bộ quá lớn. Chọn thư mục bài tập nhỏ hơn.',
      422,
    );
    const id = queue.shift()!;
    invariant(!seen.has(id), 'Phát hiện thư mục Drive trùng lặp.');
    seen.add(id);
    for (const file of await listFolder(id, deadline)) {
      if (excluded(file) || ignored.has(file.id)) continue;
      if (file.mimeType === FOLDER) queue.push(file.id);
      else if (file.mimeType !== 'application/vnd.google-apps.shortcut') result.push(file);
    }
  }
  return result;
}
export async function submissionFilesByFolder(
  roots: string[],
  deadline: number,
  ignored = new Set<string>(),
) {
  const result = new Map<string, DriveFile[]>(roots.map((id) => [id, []]));
  let pending = roots.map((id) => ({ id, owner: id }));
  const seen = new Set<string>();
  const folderCounts = new Map<string, number>();
  while (pending.length) {
    const current = pending.splice(0, 25);
    for (const folder of current) {
      invariant(!seen.has(folder.id), 'Phát hiện thư mục Drive trùng lặp.');
      seen.add(folder.id);
      const count = (folderCounts.get(folder.owner) || 0) + 1;
      invariant(count <= 100, 'Phạm vi đồng bộ quá lớn. Chọn thư mục bài tập nhỏ hơn.', 422);
      folderCounts.set(folder.owner, count);
    }
    invariant(Date.now() < deadline, 'Phạm vi đồng bộ quá lớn. Chọn thư mục bài tập nhỏ hơn.', 422);
    const owners = new Map(current.map((f) => [f.id, f.owner]));
    const children = await listFolders(
      current.map((f) => f.id),
      deadline,
    );
    for (const file of children) {
      if (
        excluded(file) ||
        ignored.has(file.id) ||
        file.mimeType === 'application/vnd.google-apps.shortcut'
      )
        continue;
      const parents = (file.parents || []).filter((parent) => owners.has(parent));
      invariant(parents.length === 1, 'Không xác định được folder học viên của file Drive.', 409);
      const owner = owners.get(parents[0])!;
      if (file.mimeType === FOLDER) pending.push({ id: file.id, owner });
      else {
        invariant(result.get(owner)!.length < 2000, 'Phạm vi đồng bộ quá lớn.', 422);
        result.get(owner)!.push(file);
      }
    }
  }
  return result;
}
export async function generatedId() {
  const result = await googleJson<{ ids: string[] }>(
    'https://www.googleapis.com/drive/v3/files/generateIds?count=1&space=drive&type=files',
  );
  return result.ids[0];
}
export async function saveHomeworkFile(parent: string, requirements: string) {
  return saveTextFile(await homeworkFolder(parent), 'BTVN.txt', requirements, 'homework');
}
export async function homeworkFolder(session: string) {
  await assertEnvironmentRoot(session);
  return withLock(`homework-folder:${session}`, async () => {
    const folder = await ensureFolder(session, 'BTVN');
    const legacy = (await listFolder(session)).filter((f) => f.name === 'BTVN.txt');
    const current = (await listFolder(folder)).filter((f) => f.name === 'BTVN.txt');
    invariant(
      legacy.length + current.length <= 1 &&
        [...legacy, ...current].every((f) => f.mimeType === 'text/plain'),
      'BTVN.txt bị trùng hoặc không phải file văn bản. Kiểm tra Drive trước khi lưu.',
      409,
    );
    if (legacy.length) {
      await googleJson(
        `https://www.googleapis.com/drive/v3/files/${driveId(legacy[0].id)}?supportsAllDrives=true&addParents=${driveId(folder)}&removeParents=${driveId(session)}&fields=id,parents`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        },
      );
    }
    return folder;
  });
}
export async function saveFeedbackText(parent: string, content: string) {
  await assertEnvironmentRoot(parent);
  return withLock(`feedback-text:${parent}`, async () => {
    const children = await listFolder(parent);
    const canonical = children.filter((f) => f.name === 'Nhan_xet.txt');
    invariant(canonical.length <= 1, 'Có nhiều file Nhan_xet.txt trong folder nhận xét.', 409);
    invariant(
      !canonical[0]?.appProperties?.tm_upload,
      'Tên Nhan_xet.txt đang được dùng bởi file upload thủ công. Đổi tên file upload trước khi lưu.',
      409,
    );
    const legacy = children
      .filter(
        (f) =>
          f.mimeType === 'text/plain' &&
          f.appProperties?.tm_feedback === 'true' &&
          !f.appProperties?.tm_upload &&
          /^Nhan_xet_v\d+\.txt$/.test(f.name),
      )
      .sort((a, b) => Number(b.name.match(/v(\d+)/)?.[1]) - Number(a.name.match(/v(\d+)/)?.[1]));
    const keep = canonical[0] || legacy[0];
    if (keep && keep.name !== 'Nhan_xet.txt')
      await googleJson(
        `https://www.googleapis.com/drive/v3/files/${driveId(keep.id)}?supportsAllDrives=true&fields=id`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Nhan_xet.txt' }),
        },
      );
    return saveTextFile(parent, 'Nhan_xet.txt', content, 'feedback');
  });
}
export async function saveTextFile(
  parent: string,
  name: string,
  requirements: string,
  kind: 'homework' | 'feedback',
) {
  await assertEnvironmentRoot(parent);
  return withLock(`text-file:${parent}:${name}`, async () => {
    const matches = (await listFolder(parent)).filter((f) => f.name === name);
    invariant(
      matches.length <= 1 && matches.every((f) => f.mimeType === 'text/plain'),
      `${name} bị trùng hoặc không phải file văn bản. Kiểm tra Drive rồi lưu lại.`,
      409,
    );
    let id = matches[0]?.id;
    if (!id) {
      const key = `text-file-intent:${parent}:${name}`;
      const intent = await readOptionalState<{ id: string }>(key);
      id = intent?.value.id || (await generatedId());
      if (!intent) await writeState(key, { id });
      await googleJson(
        'https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id,
            name,
            mimeType: 'text/plain',
            parents: [parent],
            appProperties: kind === 'homework' ? { tm_homework: 'true' } : { tm_feedback: 'true' },
          }),
        },
      );
    }
    await googleFetch(
      `https://www.googleapis.com/upload/drive/v3/files/${driveId(id)}?uploadType=media&supportsAllDrives=true`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        body: requirements,
      },
    );
    return id;
  });
}
export async function ensureFolder(parent: string, name: string) {
  await assertEnvironmentRoot(parent);
  return withLock(`classroom-folder:${parent}:${name}`, async () => {
    const matches = (await listFolder(parent)).filter((f) => f.name.trim() === name.trim());
    invariant(
      matches.length <= 1 && matches.every((f) => f.mimeType === FOLDER),
      `Tên “${name}” bị trùng trên Drive. Kiểm tra thư mục trước khi lưu.`,
      409,
    );
    if (matches.length) return matches[0].id;
    const key = `classroom-folder-intent:${parent}:${name}`;
    const intent = await readOptionalState<{ id: string }>(key);
    const id = intent?.value.id || (await generatedId());
    if (!intent) await writeState(key, { id });
    await googleJson('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name, mimeType: FOLDER, parents: [parent] }),
    });
    return id;
  });
}
export async function renameFolder(id: string, name: string) {
  await assertEnvironmentRoot(id);
  const folder = await getFile(id);
  invariant(folder.mimeType === FOLDER && !folder.trashed, 'Thư mục không hợp lệ.');
  if (folder.name === name) return;
  await googleJson(
    `https://www.googleapis.com/drive/v3/files/${driveId(id)}?supportsAllDrives=true&fields=id,name`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    },
  );
}
export async function feedbackFolder(parent: string) {
  return withLock(`feedback:${parent}`, async () => {
    const matches = (await listFolder(parent)).filter((f) => f.name === 'Nhan_xet_GV');
    invariant(
      matches.length <= 1 && matches.every((f) => f.mimeType === FOLDER),
      'Có nhiều mục Nhan_xet_GV hoặc trùng tên với file. Cần giáo viên xử lý trong Drive trước.',
      409,
    );
    if (matches.length) return matches[0].id;
    const intent = (await readOptionalState<{ id: string }>(`feedback-folder:${parent}`))?.value;
    const id = intent?.id || (await generatedId());
    if (!intent) await writeState(`feedback-folder:${parent}`, { id });
    await googleJson('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id,
        name: 'Nhan_xet_GV',
        mimeType: FOLDER,
        parents: [parent],
        appProperties: { tm_feedback: 'true' },
      }),
    });
    return id;
  });
}
