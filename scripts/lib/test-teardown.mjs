// Dev-only test helper (16e, CWK2-041): the TEARDOWN removal of a temp project that ran git. scripts/ never reaches plugin/ (build-plugin.mjs copies skills, hooks,
// commands, agents and plugin.json only), so nothing here ships; the shipped code never imports it.
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

export const TEARDOWN_BUDGET_MS = 30000; // about 4x the longest linger CoalWash measured (7,639 ms), inside the per-test clock of scripts/test.mjs
export const TEARDOWN_POLL_MS = 100;
const HELD = new Set(['EBUSY', 'EPERM', 'ENOTEMPTY']);

// rm, now and wait are injectable so the budget and the code split are testable on every platform with no wall time (T-16e-2); the defaults are the real call, the
// real clock and a real synchronous wait, so the helper behaves as before.
const sleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); // a synchronous wait: teardowns run in finally blocks and t.after alike
export function removeTree(dir, { budgetMs = TEARDOWN_BUDGET_MS, pollMs = TEARDOWN_POLL_MS, rm = fs.rmSync, now = Date.now, wait = sleepSync } = {}) {
  const until = now() + budgetMs;
  for (;;) {
    try { rm(dir, { recursive: true, force: true }); return; } catch (e) {
      if (!(e && HELD.has(e.code)) || now() >= until) throw e; // another code is a real error at once; a hold past the budget is a real leak
      wait(pollMs);
    }
  }
}
