// The room's test runner core (09a). scripts/test.mjs holds the ROSTER and its numbers and calls runSuite(); this file holds how the suite is judged.
//
// THE SUITE IS JUDGED BY THE TAP, NEVER BY AN EXIT CODE ALONE (testing.md, the TAP-names MUST; UMB2-026, measured on Node 24.19): a test file that calls process.exit(0)
// before its tests register prints "# pass 1" and exits 0, byte for byte like a real pass. So each file runs as its own `node --test --test-reporter=tap` child through
// the canon wave-run.mjs (BB-87, adopted by blob id from .github templates/overlay-coal-skill/), the next file admitted only while a FRESH machine reading says BREATHE
// (the first always runs), under the heap cap (NODE_OPTIONS, inherited by every process a test starts), a clock per test, an optional clock per file and a whole-run
// deadline that kills the tree. The EXPECTED NAME of a file is any test name of its own: a file whose only result line names the FILE itself is VACUOUS, its own status
// beside PASS, FAIL, SKIP and NOT-RUN, and the run is RED whatever the exit code was. The one summary line reconciles the five counts against the roster.
// NAMED OPEN (wave-run.mjs states it): no per-file floor of expected tests is kept here, so a test that exits 0 AFTER another test already passed, from a timer the runner
// never sees finish, reads as a PASS with the tests that completed; no TAP reader can see a test that vanished before it reported.
//
// SOLO FILES run one at a time AFTER the waves, outside wave-run, judged by the same TAP reader: wave-run puts the stdout-sync preload on the NODE_OPTIONS of every child it
// starts, and a file whose own tests spawn a child that must NOT inherit that preload (the canon wave-run.test.mjs: its recorder has to load before the preload) fails
// when run inside a wave (measured 2026-10-09, one test of 34). The room lists such a file in `solo`; the canon file is never edited.
//
// DRIFT STAYS LOUD IN BOTH DIRECTIONS, before anything runs: a listed file that is missing (node --test would ignore it or fail late), and an on-disk *.test.mjs that the
// roster does not list (it would silently never run). Node builtins plus ./wave-run.mjs only (Phoenix #2).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { runWaves, classifyFile, summarize, nodeOptionsWithHeap, STATUS } from './wave-run.mjs';

// The roster against the disk, both directions. Returns the problems (empty = in sync).
export function driftProblems(repo, tests, dirs = ['scripts', 'scripts/lib']) {
  const problems = [];
  const missing = tests.filter((t) => !fs.existsSync(path.join(repo, t)));
  if (missing.length) problems.push(`${missing.length} listed test file(s) MISSING — ${missing.join(', ')}`);
  const onDisk = [];
  for (const dir of dirs) {
    const full = path.join(repo, dir);
    if (!fs.existsSync(full)) continue;
    for (const f of fs.readdirSync(full)) if (f.endsWith('.test.mjs')) onDisk.push(`${dir}/${f}`);
  }
  const orphans = onDisk.filter((f) => !tests.includes(f));
  if (orphans.length) problems.push(`${orphans.length} on-disk test(s) NOT in the suite — ${orphans.join(', ')}. Add to scripts/test.mjs.`);
  return problems;
}

// One file, alone, with the child env the caller gave (no preload added), judged by the canon TAP classifier. spawnSync kills the direct child at the file clock.
export function runSolo({ repo, file, env, limits }) {
  const childEnv = { ...env, NODE_OPTIONS: nodeOptionsWithHeap(env.NODE_OPTIONS, limits.heapMb) };
  delete childEnv.NODE_TEST_CONTEXT; // a parent runner's variable switches a nested `node --test` to a binary format with no TAP
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', `--test-timeout=${limits.fileTimeoutMs}`, '--test-force-exit', file], {
    cwd: repo, env: childEnv, encoding: 'utf8', timeout: limits.fileClockMs ?? limits.deadlineMs, killSignal: 'SIGKILL', maxBuffer: 256 * 1024 * 1024, windowsHide: true,
  });
  const timedOut = r.error && r.error.code === 'ETIMEDOUT';
  const res = r.error && !timedOut
    ? { file, status: STATUS.FAIL, reason: `could not start: ${r.error.code ?? r.error.message}`, counts: null, failing: [] }
    : classifyFile({ file, code: r.status, signal: r.signal, stdout: r.stdout ?? '', killedBy: timedOut ? `killed at the file clock (${limits.fileClockMs ?? limits.deadlineMs} ms)` : null });
  res.name = file;
  if (res.status === STATUS.FAIL || res.status === STATUS.VACUOUS) { res.stdout = r.stdout ?? ''; res.stderr = r.stderr ?? ''; }
  return res;
}

// Run the roster. `limits` is { heapMb, fileTimeoutMs, deadlineMs, fileClockMs? }: the room's numbers, never defaulted here. Returns the exit code (0 green, 1 red).
export async function runSuite({ repo, tests, limits, solo = [], env = process.env, serial = false, out = console.log, err = console.error }) {
  const problems = driftProblems(repo, tests);
  if (problems.length) {
    for (const p of problems) err(`test runner: ${p}`);
    return 1;
  }
  const notListed = solo.filter((f) => !tests.includes(f));
  if (notListed.length) {
    err(`test runner: solo file(s) not in the roster — ${notListed.join(', ')}`);
    return 1;
  }
  let run;
  try {
    run = await runWaves({ files: tests.filter((f) => !solo.includes(f)), cwd: repo, env, serial, ...limits });
  } catch (e) {
    err(`test runner: the suite did not run — ${e && e.message ? e.message : 'error'}`);
    return 1;
  }
  const results = [...run.results, ...solo.map((file) => runSolo({ repo, file, env, limits }))];
  const summary = solo.length ? summarize(results, tests.length) : run.summary;
  for (const r of results) {
    if (r.status === STATUS.PASS || r.status === STATUS.SKIP) continue;
    out(`${r.status} ${r.name}: ${r.reason}`);
    if (r.stdout || r.stderr) err(`--- ${r.name} (${r.status}) ---\n${r.stdout ?? ''}${r.stderr ?? ''}`);
  }
  out(summary.line);
  return summary.red ? 1 : 0;
}
