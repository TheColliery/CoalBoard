// 27b (ported from CoalMine scripts/lib/agy-probe.test.mjs, commit 04ae068): the agy probe SKIPS only when agy is absent.
// A probe that hangs, or that fails in any other way, must FAIL the caller, never read as a named absence.
// The forced failures run process.execPath (a real child that hangs or exits non-zero), so no fake agy is needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { probeAgy } from './agy-probe.mjs';
import { removeTree } from './test-teardown.mjs';

test('agy probe: a command that is not on PATH is absent, so the caller skips', () => {
  const p = probeAgy({ command: 'no-such-binary-27b-agy-probe', timeoutMs: 20000 });
  assert.equal(p.state, 'absent');
});

test('agy probe: a probe that hangs past its timeout FAILS and names ETIMEDOUT, never reads as absent', () => {
  const p = probeAgy({ command: process.execPath, args: ['-e', 'setTimeout(() => {}, 60000)'], timeoutMs: 300 });
  assert.equal(p.state, 'failed');
  assert.match(p.reason, /ETIMEDOUT/);
});

test('agy probe: an agy that exits non-zero on --version FAILS and names the exit code', () => {
  const p = probeAgy({ command: process.execPath, args: ['-e', 'process.exit(3)'], timeoutMs: 20000 });
  assert.equal(p.state, 'failed');
  assert.match(p.reason, /exited 3/);
});

test('agy probe: a runnable agy that exits 0 is present', () => {
  const p = probeAgy({ command: process.execPath, args: ['--version'], timeoutMs: 20000 });
  assert.equal(p.state, 'present');
});

// 28a (T-27c-1, CodeRabbit t213 CR-1): the probe runs its command with the environment it is GIVEN, so a sandboxed HOME, TEMP and the other
// user-profile variables reach the agy child, never the owner's real profile. WITNESS: the child compares every sandboxed variable with the sandbox
// path it is handed as argv, and exits 3 on any mismatch. Before the env option existed the child inherited the real environment and failed.
const SANDBOX_KEYS = ['HOME', 'USERPROFILE', 'TEMP', 'TMP', 'TMPDIR', 'APPDATA', 'LOCALAPPDATA', 'XDG_CONFIG_HOME'];
test('agy probe: the child runs with the sandboxed environment it is given, and not the real profile', (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-agy-probe-env-'));
  t.after(() => removeTree(home));
  const env = { ...process.env };
  for (const k of SANDBOX_KEYS) env[k] = home;
  const check = `const want = process.argv[1]; const keys = ${JSON.stringify(SANDBOX_KEYS)}; if (!keys.every((k) => process.env[k] === want)) { console.error('a sandboxed variable did not reach the child'); process.exit(3); }`;
  const p = probeAgy({ command: process.execPath, args: ['-e', check, home], timeoutMs: 20000, env });
  assert.equal(p.state, 'present', p.reason);
});
