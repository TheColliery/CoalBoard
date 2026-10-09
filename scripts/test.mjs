#!/usr/bin/env node
// CoalBoard test runner — the canonical gate suite. Enumerates EVERY test file
// explicitly and FAILS LOUD on drift in BOTH directions:
//   listed-but-missing — `node --test` silently ignores missing file args, and
//     the directory form is unreliable on Node 24 (MODULE_NOT_FOUND);
//   on-disk-but-unlisted — an orphan *.test.mjs would silently never run.
// Run by CI + manually alongside verify.mjs. Fail-loud CLI (not a hook).
//
// 09a: the roster runs through scripts/lib/test-suite.mjs and the canon scripts/lib/wave-run.mjs (BB-87): one `node --test --test-reporter=tap` child per file, the next
// admitted only while a fresh machine reading says BREATHE, and the suite is judged by the TAP the files print, never by an exit code alone (testing.md: a file that exits 0
// before its tests registered is VACUOUS and the run is red). The drift checks above live in test-suite.mjs and run first.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// The complete suite — keep in sync when adding a test (the orphan check fails the gate if you forget).
const TESTS = [
  'scripts/lib/lib.test.mjs',
  'scripts/lib/conductor.test.mjs',
  'scripts/lib/ladder.test.mjs',
  'scripts/lib/dist-compare.test.mjs',
  'scripts/lib/config-keys.test.mjs',
  'scripts/lib/pointer-check.test.mjs',
  'scripts/lib/derive-roots.test.mjs',
  'scripts/lib/git-env.test.mjs',
  'scripts/lib/git-env-census.test.mjs',
  'scripts/lib/git-spawn-room.test.mjs',
  'scripts/lib/node-options.test.mjs',
  'scripts/lib/clamp-prose.test.mjs',
  'scripts/lib/run-safety.test.mjs',
  'scripts/lib/source-set.test.mjs',
  'scripts/lib/link-check.test.mjs',
  'scripts/lib/release-shape.test.mjs',
  'scripts/lib/wave-run.test.mjs',
  'scripts/lib/test-suite.test.mjs',
  'scripts/secret-scan.test.mjs',
  'scripts/secret-gate.test.mjs',
  'scripts/release-notes.test.mjs',
  'scripts/verify-release-shape.test.mjs',
  'scripts/configure.test.mjs',
  'scripts/verify.test.mjs',
];

// Run one at a time AFTER the waves, outside wave-run (scripts/lib/test-suite.mjs, SOLO FILES): wave-run puts its stdout-sync preload on NODE_OPTIONS of every file it runs, and the
// canon wave-run.test.mjs has a test whose child must load a recorder BEFORE that preload, so inside a wave it fails (1 of 34, measured 2026-10-09; reported to the chief).
const SOLO = ['scripts/lib/wave-run.test.mjs'];

// A finite clock (testing.md, Determinism): a hung test would otherwise hold a runner for the 6 h job default. The NUMBERS are this room's own, sized from its measured suite:
// TEST_TIMEOUT_MS is per test (measured 2026-10-02, 327 tests serial, 60.3 s whole suite: the slowest single test took 4.5 s, so 60 s is ~13x that, wide enough for a slower
// runner, a macOS box or a Windows 8.3 TEMP, and still a hard stop). FILE_CLOCK_MS ends ONE file at its own wall clock (its tree is killed and the file is FAIL; measured 2026-10-09 with 23 files
// in waves: the slowest file, secret-scan.test.mjs, took 51 s and the next, secret-gate.test.mjs, 40 s, so 300 s is ~6x), so a hang
// before the first test, which --test-timeout never reaches, no longer waits for the whole run. SUITE_TIMEOUT_MS bounds the whole run at ~10x the measured serial suite time.
// The heap cap rides the child's NODE_OPTIONS (scripts/lib/node-options.mjs EXTENDS the caller's, except that a caller's cap above 2048 is replaced by 2048: the zone's ninth
// amendment, a runaway test child once took the box down), so every process a test starts inherits it.
const TEST_TIMEOUT_MS = 60000;
const FILE_CLOCK_MS = 300000;
const SUITE_TIMEOUT_MS = 600000;

async function main() {
  // Imported inside main (node/runtime.md section 1): an absent lib is a clean message and a red exit, never a link-time stack.
  let nodeOptionsLib;
  let suite;
  try {
    nodeOptionsLib = await import(pathToFileURL(path.join(repo, 'scripts', 'lib', 'node-options.mjs')).href);
    suite = await import(pathToFileURL(path.join(repo, 'scripts', 'lib', 'test-suite.mjs')).href);
  } catch (e) {
    console.error(`test runner: cannot load its libraries (${e && e.code ? e.code : e.message}). Restore scripts/lib/node-options.mjs, test-suite.mjs and wave-run.mjs from git; the suite is not run without them.`);
    process.exitCode = 1;
    return;
  }
  const nodeOptions = nodeOptionsLib.childNodeOptions(process.env.NODE_OPTIONS);
  if (process.argv.includes('--print-child-options')) { console.log(nodeOptions); return; }
  process.exitCode = await suite.runSuite({
    repo,
    tests: TESTS,
    solo: SOLO,
    env: { ...process.env, NODE_OPTIONS: nodeOptions },
    limits: { heapMb: nodeOptionsLib.HEAP_CAP_MB, fileTimeoutMs: TEST_TIMEOUT_MS, fileClockMs: FILE_CLOCK_MS, deadlineMs: SUITE_TIMEOUT_MS },
  });
}

main().catch((e) => { console.error(`test runner crashed: ${e && e.message ? e.message : 'error'}`); process.exitCode = 1; });
