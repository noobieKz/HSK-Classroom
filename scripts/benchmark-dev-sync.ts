import * as nextEnv from '@next/env';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { environment, DEV_DRIVE_ROOT } from '../src/lib/environment';
import { syncAssignment } from '../src/lib/business';
async function main() {
  nextEnv.loadEnvConfig(process.cwd());
  assert.equal(environment().mode, 'development');
  assert.equal(environment().root, DEV_DRIVE_ROOT);
  const fixture = JSON.parse(await readFile('test-results/dev-student-submission.json', 'utf8'));
  const original = global.fetch;
  const calls: Record<string, { count: number; ms: number }> = {};
  global.fetch = (async (input: any, options: any) => {
    const url = new URL(String(input));
    const kind =
      url.hostname === 'sheets.googleapis.com'
        ? url.pathname.endsWith(':batchUpdate')
          ? 'sheets-write'
          : url.pathname.includes('/values:')
            ? 'sheets-read'
            : 'sheets-schema'
        : url.pathname === '/drive/v3/files'
          ? 'drive-list'
          : url.pathname.startsWith('/drive/v3/files/')
            ? 'drive-metadata'
            : 'other';
    const start = performance.now();
    try {
      return await original(input, options);
    } finally {
      const metric = (calls[kind] ||= { count: 0, ms: 0 });
      metric.count++;
      metric.ms += performance.now() - start;
    }
  }) as typeof fetch;
  const start = performance.now();
  try {
    let result: Awaited<ReturnType<typeof syncAssignment>> | undefined;
    for (let attempt = 0; attempt < 15; attempt++) {
      try {
        result = await syncAssignment(fixture.assignment_id, randomUUID());
        break;
      } catch (e) {
        if ((e as any).code !== 'LOCKED') throw e;
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    assert.ok(result && !('error' in result), JSON.stringify(result));
    const report = {
      dev_only: true,
      phase: process.argv[2] || 'sync',
      elapsed_ms: Math.round(performance.now() - start),
      calls: Object.fromEntries(
        Object.entries(calls).map(([key, value]) => [
          key,
          { count: value.count, ms: Math.round(value.ms) },
        ]),
      ),
      result,
    };
    await writeFile(
      `test-results/sync-benchmark-${report.phase}.json`,
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report));
  } finally {
    global.fetch = original;
  }
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : 'Failed');
  process.exitCode = 1;
});
