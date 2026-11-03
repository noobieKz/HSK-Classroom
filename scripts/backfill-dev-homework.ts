import * as nextEnv from '@next/env';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { environment, DEV_DRIVE_ROOT } from '../src/lib/environment';
import { loadData } from '../src/lib/sheets';
import { mutate } from '../src/lib/business';
import { listFolder } from '../src/lib/drive';
import { googleFetch } from '../src/lib/google';
async function main() {
  nextEnv.loadEnvConfig(process.cwd());
  assert.equal(environment().mode, 'development');
  assert.equal(environment().root, DEV_DRIVE_ROOT);
  const data = await loadData();
  const reports = [];
  for (const session of data.Sessions) {
    const homework = data.Assignments.filter(
      (a) => a.session_id === session.id && a.status === 'active' && a.requirements.trim(),
    ).at(-1);
    if (!homework) continue;
    const result = await mutate(
      'assignment',
      {
        id: homework.id,
        version: homework.version,
        session_id: session.id,
        requirements: homework.requirements,
      },
      randomUUID(),
    );
    const files = (await listFolder(session.folder_id)).filter((f) => f.name === 'BTVN.txt');
    assert.equal(files.length, 1);
    const text = await (
      await googleFetch(`https://www.googleapis.com/drive/v3/files/${files[0].id}?alt=media`)
    ).text();
    assert.equal(text, homework.requirements.trim());
    reports.push({ session: session.name, file_id: result.file_id, content_verified: true });
  }
  console.log(JSON.stringify({ dev_only: true, reports }));
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : 'Failed');
  process.exitCode = 1;
});
