// Zero-dep tests for scripts/lib/test-teardown.mjs (16e, CWK2-041). The held-cwd test is the red the helper exists for: on Windows a plain fs.rmSync of a
// directory a live child holds as its cwd raises EPERM/EBUSY, and removeTree clears it once the child lets go. On POSIX the removal succeeds either way, so
// the held-cwd leg passes there without proving the cure; the budget and the code split are proved on every platform through the injected rm.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { removeTree } from './test-teardown.mjs';

const hold = (code) => Object.assign(new Error(`${code}: held`), { code });
// 29gl: the guard accepts only a target under the OS temp folder, so the injected-rm legs name a path there (the target string is the only change).
const UNUSED = path.join(os.tmpdir(), 'cb-teardown-unused');

// T-16e-2 (CodeRabbit t126): whether a live child's cwd blocks a plain removal is a property of the volume, so the leg PROBES it with one plain rmSync and skips visibly where it
// does not block (POSIX, usually). The injected-clock legs below prove the loop on every platform; this is the one skippable leg and it stands alone.
test('removeTree removes a temp project while a child process still holds it as its cwd', async (t) => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cb-teardown-held-')));
  const child = spawn(process.execPath, ['-e', "process.stdout.write('ready\\n'); setTimeout(() => {}, 2000);"], { cwd: dir, stdio: ['ignore', 'pipe', 'ignore'] });
  // hooks run in registration order: the child is stopped first, then the directory goes (removeTree waits out the exit lag; a failed run leaves nothing behind)
  t.after(() => child.kill());
  t.after(() => removeTree(dir));
  await new Promise((resolve, reject) => { child.once('error', reject); child.stdout.once('data', resolve); });
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* blocked: the case removeTree exists for */ }
  if (!fs.existsSync(dir)) { t.skip('a live child cwd does not block a plain removal on this volume (capability probe), so the held-cwd case cannot be built here'); return; }
  removeTree(dir); // synchronous: the child's own timer lets go while this waits
  assert.equal(fs.existsSync(dir), false, 'the held directory is gone once the child exits');
});

test('removeTree retries a hold code with fresh calls and returns when one succeeds', () => {
  let calls = 0;
  const rm = () => { calls += 1; if (calls < 3) throw hold(calls === 1 ? 'EBUSY' : 'ENOTEMPTY'); };
  removeTree(UNUSED, { rm, pollMs: 1, budgetMs: 5000 });
  assert.equal(calls, 3);
});

// T-16e-2: the budget is judged on an INJECTED clock (now) that only the injected wait advances, so the test asserts exact retries and the deadline with no wall time.
test('removeTree gives up at the budget with the hold error, so a real leak stays loud', () => {
  let calls = 0;
  let clock = 0;
  const rm = () => { calls += 1; throw hold('EPERM'); };
  assert.throws(() => removeTree(UNUSED, { rm, pollMs: 50, budgetMs: 200, now: () => clock, wait: (ms) => { clock += ms; } }), (e) => e.code === 'EPERM');
  assert.equal(calls, 5, 'one call at each of clock 0, 50, 100, 150 and 200, then the deadline');
  assert.equal(clock, 200, 'it kept trying exactly until the budget, and did not wait past it');
});

test('removeTree before the deadline keeps retrying: one poll short of the budget it is still trying', () => {
  let calls = 0;
  let clock = 0;
  const rm = () => { calls += 1; if (clock < 150) throw hold('EBUSY'); };
  removeTree(UNUSED, { rm, pollMs: 50, budgetMs: 200, now: () => clock, wait: (ms) => { clock += ms; } });
  assert.equal(calls, 4, 'it succeeded on the call at clock 150, inside the budget');
});

test('removeTree never retries a code that is not a hold: it throws at once', () => {
  let calls = 0;
  const rm = () => { calls += 1; throw hold('EACCES'); };
  assert.throws(() => removeTree(UNUSED, { rm, pollMs: 1, budgetMs: 5000 }), (e) => e.code === 'EACCES');
  assert.equal(calls, 1);
});

test('removeTree on a path that is already gone is a no-op (force)', () => {
  const gone = path.join(os.tmpdir(), 'cb-teardown-never-made-' + process.pid);
  assert.doesNotThrow(() => removeTree(gone));
});

// 29gl: containment before any delete. Every leg below either deletes a folder it owns under os.tmpdir() or uses an injected rm that must never be called.
test('removeTree refuses a folder outside its root and deletes nothing', (t) => {
  const parent = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cb-teardown-sibling-')));
  t.after(() => removeTree(parent));
  const rootA = path.join(parent, 'a');
  const folderB = path.join(parent, 'b');
  fs.mkdirSync(rootA);
  fs.mkdirSync(folderB);
  const marker = path.join(folderB, 'marker.txt');
  fs.writeFileSync(marker, 'x');
  assert.throws(() => removeTree(folderB, { root: rootA }), (e) => e instanceof Error && e.message.includes(folderB) && e.message.includes(rootA));
  assert.equal(fs.existsSync(marker), true, 'the marker in the refused folder survives');
});

test('removeTree refuses an empty target before any delete', () => {
  let calls = 0;
  const rm = () => { calls += 1; };
  assert.throws(() => removeTree('', { rm }), (e) => e instanceof Error);
  assert.equal(calls, 0);
});

test('removeTree refuses the root itself as a target', () => {
  let calls = 0;
  const rm = () => { calls += 1; };
  assert.throws(() => removeTree(os.tmpdir(), { rm }), (e) => e instanceof Error);
  assert.equal(calls, 0);
});

test('removeTree with no root option refuses a target outside the OS temp folder', () => {
  let calls = 0;
  const rm = () => { calls += 1; };
  assert.throws(() => removeTree(path.join(os.tmpdir(), '..', 'cb-teardown-outside'), { rm }), (e) => e instanceof Error);
  assert.equal(calls, 0);
});

test('removeTree removes a folder inside its root', (t) => {
  const parent = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cb-teardown-inside-')));
  t.after(() => removeTree(parent));
  const rootA = path.join(parent, 'a');
  const inner = path.join(rootA, 'inner');
  fs.mkdirSync(inner, { recursive: true });
  fs.writeFileSync(path.join(inner, 'marker.txt'), 'x');
  removeTree(inner, { root: rootA });
  assert.equal(fs.existsSync(inner), false, 'the folder inside the root is removed as before');
});
