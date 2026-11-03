import * as nextEnv from '@next/env';
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { readState, type Lock } from '../src/lib/store';
import { sheetStateKey } from '../src/lib/sheets';
async function main() {
  nextEnv.loadEnvConfig(process.cwd());
  const names = await readdir(resolve(process.env.PRIVATE_DATA_DIR || '.private'));
  for (const name of names.filter((n) => n.endsWith('.json'))) {
    const key = decodeURIComponent(name.slice(0, -5));
    if (!key.startsWith('lock:')) continue;
    const state = await readState<Lock>(key);
    if (state?.value.busy) console.log(JSON.stringify({ key, ...state.value }));
  }
  console.log(
    JSON.stringify({ uncertain: (await readState(sheetStateKey('business-uncertain')))?.value }),
  );
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
