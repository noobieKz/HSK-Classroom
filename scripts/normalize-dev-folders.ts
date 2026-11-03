import * as nextEnv from '@next/env';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { environment, DEV_DRIVE_ROOT } from '../src/lib/environment';
import { loadData, transaction } from '../src/lib/sheets';
import { listFolder, renameFolder, ensureFolder, FOLDER } from '../src/lib/drive';
import { syncAssignment } from '../src/lib/business';
import {
  classroomRoster,
  matchesStudentFolder,
  studentFolderNames,
  sessionFolderName,
} from '../src/lib/roster';
async function main() {
  nextEnv.loadEnvConfig(process.cwd());
  assert.equal(environment().mode, 'development');
  assert.equal(environment().root, DEV_DRIVE_ROOT);
  const data = await loadData();
  const bvn = (await listFolder(DEV_DRIVE_ROOT)).find(
    (f) => f.mimeType === FOLDER && f.name.trim() === 'BVN',
  )!;
  assert.ok(bvn);
  const folders = (await listFolder(bvn.id)).filter((f) => f.mimeType === FOLDER);
  folders.sort(
    (a, b) =>
      (Number(a.name.match(/^Buổi\s+(\d+)_/u)?.[1]) || 9999) -
      (Number(b.name.match(/^Buổi\s+(\d+)_/u)?.[1]) || 9999),
  );
  const names = studentFolderNames([...classroomRoster]);
  const updates: { id: string; name: string }[] = [];
  let maximum = Math.max(
    0,
    ...folders.map((f) => Number(f.name.match(/^Buổi\s+(\d+)_/u)?.[1]) || 0),
  );
  let renamedStudents = 0;
  for (const folder of folders) {
    const session = data.Sessions.find((s) => s.folder_id === folder.id);
    assert.ok(session, 'Unknown session: stop rather than invent a date');
    const number = Number(folder.name.match(/^Buổi\s+(\d+)_/u)?.[1]) || ++maximum;
    const name = sessionFolderName(number, session.date);
    await renameFolder(folder.id, name);
    updates.push({ id: session.id, name });
    const children = (await listFolder(folder.id)).filter((f) => f.mimeType === FOLDER);
    for (const student of classroomRoster) {
      const matches = children.filter((f) => matchesStudentFolder(f.name, student));
      assert.ok(matches.length <= 1);
      if (matches.length) {
        await renameFolder(matches[0].id, names.get(student)!);
        renamedStudents++;
      } else {
        await ensureFolder(folder.id, names.get(student)!);
        renamedStudents++;
      }
    }
  }
  await transaction(randomUUID(), { action: 'normalize-owner-folder-rule', updates }, (d) => {
    for (const update of updates) {
      const session = d.Sessions.find((s) => s.id === update.id)!;
      session.name = update.name;
      session.version = String(Number(session.version) + 1);
    }
    return { count: updates.length };
  });
  for (const update of updates) {
    const session = data.Sessions.find((s) => s.id === update.id)!;
    const children = await listFolder(session.folder_id);
    assert.ok(
      children
        .filter((f) => f.mimeType === FOLDER && !f.name.startsWith('Nhan'))
        .every((f) => /^\d{2,}\. /u.test(f.name)),
    );
  }
  for (const assignment of data.Assignments.filter((a) => a.status === 'active')) {
    const result = await syncAssignment(assignment.id, randomUUID());
    assert.ok(!('error' in result), JSON.stringify(result));
  }
  console.log(
    JSON.stringify({ dev_only: true, sessions: updates, student_folders: renamedStudents }),
  );
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : 'Failed');
  process.exitCode = 1;
});
