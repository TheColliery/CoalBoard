#!/usr/bin/env node
// CoalBoard test runner — the canonical gate suite. Enumerates EVERY test file
// explicitly and FAILS LOUD on drift in BOTH directions:
//   listed-but-missing — `node --test` silently ignores missing file args, and
//     the directory form is unreliable on Node 24 (MODULE_NOT_FOUND);
//   on-disk-but-unlisted — an orphan *.test.mjs would silently never run.
// Run by CI + manually alongside verify.mjs. Fail-loud CLI (not a hook).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// The complete suite — keep in sync when adding a test (the orphan check below
// fails the gate if you forget).
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
  'scripts/lib/node-options.test.mjs',
  'scripts/lib/clamp-prose.test.mjs',
  'scripts/lib/run-safety.test.mjs',
  'scripts/lib/source-set.test.mjs',
  'scripts/lib/link-check.test.mjs',
  'scripts/lib/release-shape.test.mjs',
  'scripts/secret-scan.test.mjs',
  'scripts/secret-gate.test.mjs',
  'scripts/release-notes.test.mjs',
  'scripts/verify-release-shape.test.mjs',
  'scripts/configure.test.mjs',
  'scripts/verify.test.mjs',
];

const missing = TESTS.filter((t) => !fs.existsSync(path.join(repo, t)));
if (missing.length) {
  console.error(`test runner: ${missing.length} listed test file(s) MISSING — ${missing.join(', ')}`);
  process.exit(1);
}

const onDisk = [];
for (const dir of ['scripts', 'scripts/lib']) {
  for (const f of fs.readdirSync(path.join(repo, dir))) if (f.endsWith('.test.mjs')) onDisk.push(`${dir}/${f}`);
}
const orphans = onDisk.filter((f) => !TESTS.includes(f));
if (orphans.length) {
  console.error(`test runner: ${orphans.length} on-disk test(s) NOT in the suite — ${orphans.join(', ')}. Add to scripts/test.mjs.`);
  process.exit(1);
}

// A finite clock (testing.md, Determinism): a hung test would otherwise hold a runner for the 6 h job default.
// TEST_TIMEOUT_MS is per test. Basis, measured 2026-10-02 on this box (327 tests, serial, 60.3 s whole suite): the
// slowest single test took 4.5 s, so 60 s is ~13x that, wide enough for a slower runner (macOS, a Windows 8.3
// TEMP) and still a hard stop. SUITE_TIMEOUT_MS bounds the whole run at ~10x the measured suite time. The heap cap
// and one-file-at-a-time ride the child (a runaway test child once took the box down, AGENTS.md 2026-09-25).
// The child's NODE_OPTIONS EXTENDS the caller's (scripts/lib/node-options.mjs), never replaces it, except that a
// caller's heap cap above 2048 is replaced by 2048 (the zone's ninth amendment: the cap is 2048 or lower).
const TEST_TIMEOUT_MS = 60000;
const SUITE_TIMEOUT_MS = 600000;
const { childNodeOptions } = await import(pathToFileURL(path.join(repo, 'scripts', 'lib', 'node-options.mjs')).href);
const nodeOptions = childNodeOptions(process.env.NODE_OPTIONS);
if (process.argv.includes('--print-child-options')) { console.log(nodeOptions); process.exit(0); }
const r = spawnSync(
  process.execPath,
  ['--test', '--test-concurrency=1', `--test-timeout=${TEST_TIMEOUT_MS}`, ...TESTS],
  {
    cwd: repo,
    stdio: 'inherit',
    timeout: SUITE_TIMEOUT_MS,
    env: { ...process.env, NODE_OPTIONS: nodeOptions },
  },
);
if (r.error) console.error(`test runner: the suite did not finish — ${r.error.code || r.error.message}`);
process.exit(r.status ?? 1);
