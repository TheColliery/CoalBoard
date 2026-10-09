// scripts/lib/test-suite.mjs is the room's test runner core (09a): scripts/test.mjs enumerates the roster and hands it to the canon wave-run.mjs, and the suite is judged by the
// TAP the files print, never by an exit code alone (testing.md: a gate judges a run by the TAP test names it expects). Hermetic: the roster is a temp repository of fixture files.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { driftProblems, runSuite } from './test-suite.mjs';

const LIMITS = { heapMb: 512, fileTimeoutMs: 20000, deadlineMs: 60000 };
const FILES = {
  'ok.test.mjs': "import { test } from 'node:test';\ntest('real check', () => {});\n",
  'bad.test.mjs': "import { test } from 'node:test'; import assert from 'node:assert/strict';\ntest('bad one', () => assert.equal(1, 2));\n",
  // exits 0 before a test registers: the runner prints "# pass 1" and exits 0, byte for byte like a pass (Node 24.19, UMB2-026)
  'vacuous.test.mjs': "import { test } from 'node:test';\nprocess.exit(0);\ntest('never registered', () => {});\n",
};

function repoWith(t, names, extraOnDisk = []) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-test-suite-'));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  fs.mkdirSync(path.join(repo, 'scripts', 'lib'), { recursive: true });
  for (const n of [...names, ...extraOnDisk]) fs.writeFileSync(path.join(repo, 'scripts', n), FILES[n.split('/').pop()] ?? FILES['ok.test.mjs']);
  return repo;
}
async function suite(repo, tests) {
  const out = [];
  const err = [];
  const code = await runSuite({ repo, tests, limits: LIMITS, serial: true, out: (s) => out.push(s), err: (s) => err.push(s) });
  return { code, out: out.join('\n'), err: err.join('\n') };
}

test('a roster of passing files is green: exit 0, one summary line reconciled against the roster', async (t) => {
  const repo = repoWith(t, ['ok.test.mjs']);
  const r = await suite(repo, ['scripts/ok.test.mjs']);
  assert.equal(r.code, 0, r.out + r.err);
  assert.match(r.out, /wave-run: 1 file · pass 1 · fail 0 .* reconciled 1 of 1 — GREEN/);
});

test('RED-FIRST 09a: a file that exits 0 before its tests registered is VACUOUS and the suite is RED, whatever its exit code says', async (t) => {
  const repo = repoWith(t, ['ok.test.mjs', 'vacuous.test.mjs']);
  // the premise: run alone, the vacuous file exits 0 and prints a pass line, exactly what an exit-code gate would believe
  const alone = spawnSync(process.execPath, ['--test', 'scripts/vacuous.test.mjs'], { cwd: repo, encoding: 'utf8', timeout: 30000 });
  assert.equal(alone.status, 0, 'precondition: the vacuous fixture exits 0 on its own');
  const r = await suite(repo, ['scripts/ok.test.mjs', 'scripts/vacuous.test.mjs']);
  assert.equal(r.code, 1, 'a vacuous file turns the suite red');
  assert.match(r.out, /VACUOUS scripts\/vacuous\.test\.mjs: /);
  assert.match(r.out, /pass 1 · fail 0 .* vacuous 1 \(scripts\/vacuous\.test\.mjs\) .* RED/);
});

test('a failing file is red and named; the green file beside it is still counted', async (t) => {
  const repo = repoWith(t, ['ok.test.mjs', 'bad.test.mjs']);
  const r = await suite(repo, ['scripts/ok.test.mjs', 'scripts/bad.test.mjs']);
  assert.equal(r.code, 1);
  assert.match(r.out, /FAIL scripts\/bad\.test\.mjs: not ok: bad one/);
  assert.match(r.out, /pass 1 · fail 1 \(scripts\/bad\.test\.mjs\)/);
});

test('drift is loud in BOTH directions and nothing runs: a listed file that is missing, and a test on disk that is not listed', async (t) => {
  const repo = repoWith(t, ['ok.test.mjs'], ['lib/extra.test.mjs']);
  const missing = await suite(repo, ['scripts/ok.test.mjs', 'scripts/gone.test.mjs', 'scripts/lib/extra.test.mjs']);
  assert.equal(missing.code, 1);
  assert.match(missing.err, /test runner: 1 listed test file\(s\) MISSING — scripts\/gone\.test\.mjs/);
  assert.equal(missing.out, '', 'no summary: the suite did not run');
  const orphan = await suite(repo, ['scripts/ok.test.mjs']);
  assert.equal(orphan.code, 1);
  assert.match(orphan.err, /test runner: 1 on-disk test\(s\) NOT in the suite — scripts\/lib\/extra\.test\.mjs\. Add to scripts\/test\.mjs\./);
  assert.deepEqual(driftProblems(repo, ['scripts/ok.test.mjs', 'scripts/lib/extra.test.mjs']), []);
});
