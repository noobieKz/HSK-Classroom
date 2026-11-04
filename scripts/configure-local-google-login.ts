import * as nextEnv from '@next/env';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { environment, DEV_DRIVE_ROOT } from '../src/lib/environment';
import { localPasswordEnabled } from '../src/lib/login-policy';
import { googleStatus } from '../src/lib/google';

async function main() {
  nextEnv.loadEnvConfig(process.cwd());
  assert.equal(environment().mode, 'development');
  assert.equal(environment().root, DEV_DRIVE_ROOT);
  assert.ok(localPasswordEnabled());
  const connected = await googleStatus();
  assert.ok(connected.connected && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(connected.email));
  const file = '.env.local';
  const content = await readFile(file, 'utf8');
  if (/^GOOGLE_ALLOWED_EMAILS=/m.test(content)) {
    assert.ok(
      process.env.GOOGLE_ALLOWED_EMAILS?.trim(),
      'Configure the existing empty allowlist manually.',
    );
    console.log('Existing local teacher allowlist preserved.');
    return;
  }
  await writeFile(
    file,
    `${content.trimEnd()}\nGOOGLE_ALLOWED_EMAILS=${connected.email.toLowerCase()}\n`,
  );
  console.log(
    'Local Google login configured for the existing connected teacher. No credentials printed.',
  );
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : 'Failed');
  process.exitCode = 1;
});
