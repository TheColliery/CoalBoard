// Dev-only test helper (16e, CWK2-041): the TEARDOWN removal of a temp project that ran git. scripts/ never reaches plugin/ (build-plugin.mjs copies skills, hooks,
// commands, agents, plugin.json and the plugin README only), so nothing here ships; the shipped code never imports it.
//
// THE CLASS. Windows refuses to remove a directory a live process holds as its cwd. When spawnSync kills Git for Windows' launcher (cmd\git.exe) on a timeout,
// on ENOBUFS, or on a stdin error, the real git.exe the launcher started lives on with its cwd inside the test project, and spawnSync cannot wait for a
// grandchild. A plain fs.rmSync in the test's teardown then raises EBUSY or EPERM (CI: windows-latest, where the launcher is first on PATH; this box finds the
// real git first and never shows it). The cure is CoalWash's removeTree (v1.12.4, CoalWorks/CoalWash/scripts/lib/test-plan.mjs): fresh rmSync calls, retried
// on a hold code until a budget, then a throw so a real leak stays loud. Its three readings are cited by path, not pasted here:
//   - the witness and the linger time (2.9-7.6 s, n=6): CoalWash scratchpad/14a, e63-witness.out and e63-linger.out, in the "Fire 63" section of
//     CoalWorks/CoalWash/scratchpad/r15/build.return.md;
//   - why node's own { maxRetries, retryDelay } is not the instrument (it waits for one holding shape and not another): e63-retryopt-2.out, e63-rmprobe.out;
//   - the held-cwd red and green: test-plan.test.mjs in CoalWash, and scripts/lib/test-teardown.test.mjs here.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const TEARDOWN_BUDGET_MS = 30000; // about 4x the longest linger CoalWash measured (7,639 ms), inside the per-test clock of scripts/test.mjs
export const TEARDOWN_POLL_MS = 100;
const HELD = new Set(['EBUSY', 'EPERM', 'ENOTEMPTY']);

// rm, now and wait are injectable so the budget and the code split are testable on every platform with no wall time (T-16e-2); the defaults are the real call, the
// real clock and a real synchronous wait, so the helper behaves as before.
const sleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); // a synchronous wait: teardowns run in finally blocks and t.after alike
// 29gl containment: the target must sit strictly INSIDE root (default: the OS temp folder) before the first rm. Both sides are realpathed with the .native
// resolver; a target that does not exist yet is realpathed through its nearest existing ancestor. A refusal throws and deletes nothing.
function resolveForContainment(target) {
  const rest = [];
  let current = path.resolve(target);
  for (;;) {
    try { return path.join(fs.realpathSync.native(current), ...rest); } catch (e) {
      const parent = path.dirname(current);
      if (e.code !== 'ENOENT' || parent === current) throw e;
      rest.unshift(path.basename(current));
      current = parent;
    }
  }
}
function assertInsideRoot(dir, root) {
  if (typeof dir !== 'string' || dir === '') throw new Error(`removeTree refused: target "${dir}" is not a non-empty path (root "${root}"); nothing was deleted`);
  let rootReal;
  let targetReal;
  try { rootReal = fs.realpathSync.native(root); } catch (e) { throw new Error(`removeTree refused: root "${root}" cannot be resolved (target "${dir}"); nothing was deleted`, { cause: e }); }
  try { targetReal = resolveForContainment(dir); } catch (e) { throw new Error(`removeTree refused: target "${dir}" cannot be resolved (root "${root}"); nothing was deleted`, { cause: e }); }
  const rel = path.relative(rootReal, targetReal);
  if (rel === '' || rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
    throw new Error(`removeTree refused: target "${dir}" resolves to "${targetReal}", which is not strictly inside root "${root}"; nothing was deleted`);
  }
}

export function removeTree(dir, { budgetMs = TEARDOWN_BUDGET_MS, pollMs = TEARDOWN_POLL_MS, rm = fs.rmSync, now = Date.now, wait = sleepSync, root = os.tmpdir() } = {}) {
  assertInsideRoot(dir, root);
  const until = now() + budgetMs;
  for (;;) {
    try { rm(dir, { recursive: true, force: true }); return; } catch (e) {
      if (!(e && HELD.has(e.code)) || now() >= until) throw e; // another code is a real error at once; a hold past the budget is a real leak
      wait(pollMs);
    }
  }
}
