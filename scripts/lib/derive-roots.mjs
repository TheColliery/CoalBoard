// ROOT-SET DERIVATION (CWK-078, extracted from verify.mjs in the findings-back round so the
// membership property has a return value a test can assert on directly). verify.mjs is a
// top-level-executing gate file with no main-guard -- importing it runs the whole gate as a
// side effect -- so this pure function is the only way to unit-test `.github`-shaped
// hidden-but-tracked entries never entering `ourRoots` without spawning a child process.
//
// Enumerate every top-level entry (files AND hidden), feed each to `git check-ignore`;
// `ourRoots` = non-hidden entries git does not ignore. Never parse `.gitignore` directly --
// one source of truth, the same rule `.gitignore` itself exists to keep. Degrades to
// `{ ok: false }` -- never throws, never fabricates a set -- when git cannot answer
// (CoalHearth's design lesson: the caller decides whether that is a FAIL or a named SKIP;
// this function only reports what it could determine).
//
// `ignoredRoots` IS STILL RETURNED, AND IS NO LONGER THE POINTER GATE'S SOURCE FOR THAT
// QUESTION (CWK-079) -- named here so it never reads as a dead second answer nobody
// explained. verify.mjs's own gitignored-root citation check now derives `ignoredRoots`
// from the CITED tokens the funnel actually produced (existence-independent -- see that
// file's own comment), because THIS disk-derived set runs at ZERO on every clean clone and
// every CI leg by construction: a clean clone carries no gitignored files at all. Kept here
// anyway because it is a genuine, free byproduct of the SAME walk that must already
// classify every top-level entry to compute `ourRoots` correctly (a non-hidden gitignored
// entry, e.g. this room's own `scratchpad`, must be excluded from `ourRoots` too, so the
// check-ignore call happens regardless) -- and because `derive-roots.test.mjs`'s own
// `.github`-shape test uses it directly to prove a hidden-but-not-ignored entry lands in
// NEITHER set, a property this function's return shape is the only place that can assert.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { gitEnv } from './git-env.mjs';

// testing.md/coding-style Error Handling item 6: every spawn has a finite clock. Measured 2026-10-18 on this box (n=5, `git check-ignore --quiet` in a fresh repo): min 124, median 158,
// max 241 ms, so 30 s is about 120x the slowest. A killed git has status null (and `error` ETIMEDOUT), which the fail-closed test below reads as FAIL, never as 'not ignored'.
const CHECK_IGNORE_TIMEOUT_MS = 30000;

// 18c (t179 #1): a test passes a sandbox HOME, so the git child reads that HOME's git config and excludes and a developer's global ones cannot move the sets.
// Without it (verify.mjs's call) the env is gitEnv() alone, byte for byte what it was. The helper has two plain returns, the shape the git spawn census reads whole.
function childEnv(ceiling, home) {
  if (home === undefined) return gitEnv(ceiling);
  const tmp = path.join(home, 'tmp');
  const xdg = path.join(home, '.config');
  return { ...gitEnv(ceiling), GIT_CONFIG_NOSYSTEM: '1', HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: xdg, TMPDIR: tmp, TMP: tmp, TEMP: tmp }; // NOSYSTEM: the machine's own git config cannot move a sandboxed walk either (18e2)
}

export function deriveRootSets(dir, sandboxHome) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let fed = 0;
  const ourRoots = new Set();
  const ignoredRoots = new Set();
  for (const e of entries) {
    fed++; // counted BEFORE the git call, so a mid-loop bail reports what was actually
            // visited, never the full directory size assumed
    const res = spawnSync('git', ['check-ignore', '--quiet', '--', e.name], { cwd: dir, env: childEnv(path.dirname(dir), sandboxHome), timeout: CHECK_IGNORE_TIMEOUT_MS, killSignal: 'SIGKILL' });
    if (res.error || (res.status !== 0 && res.status !== 1)) return { ok: false, fed };
    if (res.status === 0) ignoredRoots.add(e.name);
    else if (!e.name.startsWith('.')) ourRoots.add(e.name);
  }
  return { ok: true, fed, ignoredCount: ignoredRoots.size, ourRoots, ignoredRoots };
}
