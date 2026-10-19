import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const entry = fileURLToPath(new URL('../dist/main.js', import.meta.url));
const guard = new URL('./fixtures/block-network.mjs', import.meta.url).href;
const scenario = new URL('./fixtures/response-scenario.mjs', import.meta.url).href;
const run = (args, env) => {
  const cwd = mkdtempSync(join(tmpdir(), 'scrobblez-test-'));
  try {
    return spawnSync(process.execPath, ['--import', guard, '--import', scenario, entry, ...args],
      { cwd, env: { ...process.env, ...env }, encoding: 'utf8', timeout: 15000 });
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
};

test('offline demo runs two batches with networking blocked and never prints real credentials', () => {
  const result = run(['--demo'], {
    LASTFM_API_KEY: 'private-key-sentinel', LASTFM_SHARED_SECRET: 'private-secret-sentinel',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /OFFLINE DEMO/);
  assert.match(result.stdout, /50\/55 processed/);
  assert.match(result.stdout, /55\/55 processed/);
  assert.match(result.stdout, /Completed: 55 accepted, 0 ignored/);
  assert.doesNotMatch(result.stdout + result.stderr, /private-key-sentinel|private-secret-sentinel/);
});

test('live mode fails early without credentials and does not attempt a request', () => {
  const result = run([], { LASTFM_API_KEY: '', LASTFM_SHARED_SECRET: '' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /API credentials not found/);
  assert.doesNotMatch(result.stderr, /Network access is forbidden/);
});

test('ignored records are reported separately and produce a failing exit status', () => {
  const result = run(['--demo'], { SCROBBLEZ_TEST_SCENARIO: 'ignored' });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /Completed: 53 accepted, 2 ignored/);
});

for (const failure of ['error', 'malformed']) {
  test(`${failure} API response stops submission without a success summary`, () => {
    const result = run(['--demo'], { SCROBBLEZ_TEST_SCENARIO: failure });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Batch stopped after 0 confirmed responses/);
    assert.doesNotMatch(result.stdout, /Completed:|Progress:|Would you like to scrobble more/);
  });
}
