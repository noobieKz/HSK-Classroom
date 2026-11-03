import * as nextEnv from '@next/env';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { strict as assert } from 'node:assert';
import { DEV_DRIVE_ROOT, PRODUCTION_DRIVE_ROOT, environment } from '../src/lib/environment';
import { FOLDER, getFile, listFolder, generatedId, assertEnvironmentRoot } from '../src/lib/drive';
import { googleJson } from '../src/lib/google';

type Node = {
  source_id: string;
  target_id: string;
  parent_source_id: string;
  name: string;
  path: string[];
};
export type MirrorReport = {
  source_root: string;
  target_root: string;
  folders: Node[];
  verified_at?: string;
  folders_verified?: number;
  extra_dev_folders?: number;
  production_files_copied: number;
  production_writes: number;
};
const reportPath = 'test-results/dev-folder-mirror.json';

async function save(report: MirrorReport) {
  await mkdir('test-results', { recursive: true });
  await writeFile(`${reportPath}.tmp`, JSON.stringify(report, null, 2));
  await rename(`${reportPath}.tmp`, reportPath);
}
async function inventory(root: string) {
  const result: { id: string; parent: string; name: string; path: string[] }[] = [];
  const queue = [{ id: root, path: [] as string[] }];
  const seen = new Set<string>();
  while (queue.length) {
    const current = queue.shift()!;
    assert.ok(!seen.has(current.id) && seen.size < 10000, 'Invalid or oversized folder tree');
    seen.add(current.id);
    for (const file of await listFolder(current.id, Date.now() + 120000)) {
      if (file.mimeType !== FOLDER) continue;
      const path = [...current.path, file.name];
      result.push({ id: file.id, parent: current.id, name: file.name, path });
      queue.push({ id: file.id, path });
    }
  }
  return result;
}
async function main() {
  nextEnv.loadEnvConfig(process.cwd());
  assert.equal(environment().mode, 'development');
  assert.equal(environment().root, DEV_DRIVE_ROOT);
  assert.notEqual(DEV_DRIVE_ROOT, PRODUCTION_DRIVE_ROOT);
  assert.equal((await getFile(DEV_DRIVE_ROOT)).mimeType, FOLDER);
  assert.equal((await getFile(PRODUCTION_DRIVE_ROOT)).mimeType, FOLDER);
  const source = await inventory(PRODUCTION_DRIVE_ROOT);
  console.log(`READ ONLY: production has ${source.length} descendant folders`);
  let report: MirrorReport = {
    source_root: PRODUCTION_DRIVE_ROOT,
    target_root: DEV_DRIVE_ROOT,
    folders: [],
    production_files_copied: 0,
    production_writes: 0,
  };
  try {
    const saved: MirrorReport = JSON.parse(await readFile(reportPath, 'utf8'));
    if (saved.target_root === DEV_DRIVE_ROOT && saved.source_root === PRODUCTION_DRIVE_ROOT)
      report = saved;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
  const targets = new Map<string, string>([[PRODUCTION_DRIVE_ROOT, DEV_DRIVE_ROOT]]);
  for (const node of source) {
    const parent = targets.get(node.parent);
    assert.ok(parent, 'Parent was not mirrored');
    await assertEnvironmentRoot(parent); // Every mutation is bounded by the NEW DEV root.
    let item = report.folders.find((r) => r.source_id === node.id);
    const siblings = await listFolder(parent);
    const tagged = siblings.filter(
      (f) => f.mimeType === FOLDER && f.appProperties?.tm_mirror_source === node.id,
    );
    assert.ok(tagged.length <= 1, 'Duplicate mirrored source ID requires review');
    if (!item) {
      if (!tagged.length)
        assert.ok(
          !siblings.some((f) => f.name === node.name && !f.appProperties?.tm_mirror_source),
          'An existing untracked name needs manual review',
        );
      item = {
        source_id: node.id,
        target_id: tagged[0]?.id || (await generatedId()),
        parent_source_id: node.parent,
        name: node.name,
        path: node.path,
      };
      report.folders.push(item);
      await save(report); // Stable pre-generated ID survives an unknown create response.
    }
    if (!tagged.some((f) => f.id === item!.target_id)) {
      await googleJson(
        'https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: item.target_id,
            name: node.name,
            mimeType: FOLDER,
            parents: [parent],
            appProperties: { tm_mirror_source: node.id, tm_environment: 'development' },
          }),
        },
      );
    }
    const verified = await getFile(item.target_id);
    assert.equal(verified.name, node.name);
    assert.equal(verified.mimeType, FOLDER);
    assert.deepEqual(verified.parents, [parent]);
    targets.set(node.id, item.target_id);
    console.log(
      `MIRRORED ${targets.size - 1}/${source.length}: exact folder name and parent verified`,
    );
  }
  const target = await inventory(DEV_DRIVE_ROOT);
  const sourcePaths = source.map((n) => JSON.stringify(n.path)).sort();
  const targetPaths = target.map((n) => JSON.stringify(n.path)).sort();
  const remaining = new Map<string, number>();
  for (const path of targetPaths) remaining.set(path, (remaining.get(path) || 0) + 1);
  for (const path of sourcePaths) {
    assert.ok((remaining.get(path) || 0) > 0, 'A production folder path is missing in DEV');
    remaining.set(path, remaining.get(path)! - 1);
  }
  const extraFolders = [...remaining.values()].reduce((a, b) => a + b, 0);
  const sourceAfter = await inventory(PRODUCTION_DRIVE_ROOT);
  assert.deepEqual(
    sourceAfter.map((n) => JSON.stringify([n.id, n.parent, n.name])).sort(),
    source.map((n) => JSON.stringify([n.id, n.parent, n.name])).sort(),
    'Production tree changed during mirroring',
  );
  report.verified_at = new Date().toISOString();
  report.folders_verified = source.length;
  report.extra_dev_folders = extraFolders;
  await save(report);
  console.log(
    `PASS: all ${source.length} source folder paths match, including Unicode and spaces; ${extraFolders} extra DEV-only folders retained. No file content copied; no production writes.`,
  );
}
main().catch((e) => {
  console.error('DEV MIRROR FAILED:', e instanceof Error ? e.message : 'Unknown error');
  process.exitCode = 1;
});
