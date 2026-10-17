// Zero-dep unit tests for scripts/lib/derive-roots.mjs (CWK-078 findings-back). Each test
// builds a throwaway git repo in a temp dir and drives `deriveRootSets` against it directly
// -- no spawning verify.mjs, no fixture writes into the real tree.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import { deriveRootSets } from './derive-roots.mjs';
import { gitEnv } from './git-env.mjs';
import { removeTree } from './test-teardown.mjs';

// testing.md MUST: every spawn in a test has a finite clock.
const CALL_TIMEOUT_MS = 30000; // measured 2026-10-17 on this box: git init max 215 ms, git add max 216 ms, git commit max 429 ms, the link-check engine on one file max 167 ms (n=5 each); ~70x the slowest call, ~180x the engine
const CALL_KILL = 'SIGKILL';

// hooks-safety.md section 7 (t170 #1): a git child gets HOME/USERPROFILE/TMPDIR/TMP/TEMP inside the test's own sandbox root; gitEnv() keeps its GIT_* cleanup and ceiling.
function sandboxVars(root) {
  const home = path.join(root, 'home');
  const tmp = path.join(root, 'tmp');
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(tmp, { recursive: true });
  return { HOME: home, USERPROFILE: home, TMPDIR: tmp, TMP: tmp, TEMP: tmp };
}

// The fixture repo is root/repo; root also holds the sandbox home and tmp, so a teardown removes the whole root.
function makeRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cwk078-derive-'));
  const dir = path.join(root, 'repo');
  fs.mkdirSync(dir);
  execFileSync('git', ['init', '--quiet'], { cwd: dir, env: { ...gitEnv(root), ...sandboxVars(root) }, timeout: CALL_TIMEOUT_MS, killSignal: CALL_KILL });
  fs.writeFileSync(path.join(dir, '.gitignore'), 'ignored-dir/\nignored-file.txt\n');
  fs.mkdirSync(path.join(dir, 'ignored-dir'));
  fs.writeFileSync(path.join(dir, 'ignored-file.txt'), 'x');
  fs.mkdirSync(path.join(dir, 'tracked-dir'));
  fs.writeFileSync(path.join(dir, 'README.md'), 'x');
  // hidden AND NOT gitignored -- the exact `.github` shape this test exists to pin.
  fs.mkdirSync(path.join(dir, '.github'));
  return dir;
}

// CWK-133 / C-4 (exemplar CoalFace 0a614ae): inside a LINKED worktree a git hook exports an ABSOLUTE
// GIT_DIR and GIT_INDEX_FILE, both of which override cwd and GIT_CEILING_DIRECTORIES, so a fixture's
// `git init` re-initialises the REAL enclosing repository (core.bare flipped to true, 2026-09-10 and
// 2026-09-23). Reproduced SAFELY: S is a throwaway sandbox repo standing in for the real one, the hook's
// env is planted AT S (never anywhere outside this test's own tmp), the room's fixture builder runs, and
// S's config must be byte-identical while the fixture gets its OWN .git.
test('CWK-133: a planted ABSOLUTE GIT_DIR / GIT_INDEX_FILE never redirects the fixture init onto another repo', (t) => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'cwk133-sandbox-'));
  t.after(() => removeTree(sandbox));
  execFileSync('git', ['init', '--quiet'], { cwd: sandbox, env: { ...gitEnv(path.dirname(sandbox)), ...sandboxVars(sandbox) }, timeout: CALL_TIMEOUT_MS, killSignal: CALL_KILL });
  const cfg = path.join(sandbox, '.git', 'config');
  assert.ok(fs.existsSync(cfg), 'fixture precondition: the sandbox repo exists');
  const before = fs.readFileSync(cfg, 'utf8');
  const saved = { GIT_DIR: process.env.GIT_DIR, GIT_INDEX_FILE: process.env.GIT_INDEX_FILE };
  process.env.GIT_DIR = path.join(sandbox, '.git');
  process.env.GIT_INDEX_FILE = path.join(sandbox, '.git', 'index');
  let fixture;
  try { fixture = makeRepo(); } finally {
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
  t.after(() => removeTree(path.dirname(fixture)));
  assert.equal(fs.readFileSync(cfg, 'utf8'), before, 'the sandbox repo (the stand-in for the REAL enclosing repo) must be untouched');
  assert.ok(fs.existsSync(path.join(fixture, '.git')), 'the fixture must get its OWN .git, not re-init the planted one');
});

test('deriveRootSets: a hidden-but-not-ignored dir (the .github shape) never enters ourRoots', () => {
  const dir = makeRepo();
  try {
    const r = deriveRootSets(dir);
    assert.equal(r.ok, true);
    assert.ok(!r.ourRoots.has('.github'), 'a hidden entry must never enter ourRoots even when git does not ignore it');
    assert.ok(!r.ignoredRoots.has('.github'), 'and it must not land in ignoredRoots either -- it is neither, by construction');
    assert.ok(r.ourRoots.has('tracked-dir'));
    assert.ok(r.ourRoots.has('README.md'));
  } finally {
    removeTree(path.dirname(dir));
  }
});

test('deriveRootSets: a non-hidden gitignored directory AND a gitignored file both land in ignoredRoots', () => {
  const dir = makeRepo();
  try {
    const r = deriveRootSets(dir);
    assert.ok(r.ignoredRoots.has('ignored-dir'));
    assert.ok(r.ignoredRoots.has('ignored-file.txt'));
    assert.equal(r.ignoredCount, 2);
    assert.ok(!r.ourRoots.has('ignored-dir'), 'an ignored entry must never also appear in ourRoots');
  } finally {
    removeTree(path.dirname(dir));
  }
});

test('deriveRootSets: fed counts entries actually visited, not the directory size -- a non-repo bails on entry 1', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cwk078-derive-nogit-'));
  try {
    fs.writeFileSync(path.join(dir, 'a.txt'), 'x');
    fs.writeFileSync(path.join(dir, 'b.txt'), 'x');
    // No `git init` -- `git check-ignore` in a non-repo exits fatal (neither 0 nor 1), which
    // is the "git cannot answer" path regardless of which entry is visited first.
    const r = deriveRootSets(dir);
    assert.equal(r.ok, false);
    assert.equal(r.fed, 1, 'must report the ONE entry it actually tried, never the full 2-entry directory');
  } finally {
    removeTree(dir);
  }
});

// 18a2 (L-d): a git killed by a signal has status null and no exit code. deriveRootSets must read that as FAIL (ok: false), never as 'not ignored' (CWK-090 fail-closed). The fake git is a
// shell script that kills itself; the leg probes whether such a script can be built and run here and skips visibly where it cannot (Windows does not run a shebang script). CI's leg.
function fakeKilledGit() {
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'cwk-fakegit-'));
  const script = path.join(bin, 'git');
  fs.writeFileSync(script, '#!/bin/sh' + String.fromCharCode(10) + 'kill -9 $$' + String.fromCharCode(10));
  fs.chmodSync(script, 0o755);
  return bin;
}
const SKIP_KILLED = (() => {
  let bin = null;
  try {
    bin = fakeKilledGit();
    const r = spawnSync(path.join(bin, 'git'), [], { timeout: CALL_TIMEOUT_MS, killSignal: CALL_KILL });
    return r.signal === 'SIGKILL' ? false : 'a self-killing shell script cannot be run here (capability probe) -- a CI leg';
  } catch { return 'a self-killing shell script cannot be built here (capability probe) -- a CI leg'; } finally { if (bin) removeTree(bin); }
})();

test('deriveRootSets: a git killed by a signal (status null) is a FAIL, never "not ignored" (L-d, POSIX leg)', { skip: SKIP_KILLED }, () => {
  const dir = makeRepo();
  const bin = fakeKilledGit();
  const savedPath = process.env.PATH;
  try {
    process.env.PATH = bin + path.delimiter + savedPath;
    const r = deriveRootSets(dir);
    assert.equal(r.ok, false, 'a killed git must not be read as an answer');
    assert.equal(r.fed, 1, 'it bails on the first entry');
  } finally {
    process.env.PATH = savedPath;
    removeTree(bin);
    removeTree(path.dirname(dir));
  }
});
test('deriveRootSets: a git that cannot be started (status null, no exit code) is a FAIL, never "not ignored" (L-d, every platform)', () => {
  const dir = makeRepo();
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'cwk-nogit-'));
  const savedPath = process.env.PATH;
  try {
    process.env.PATH = empty;
    const r = deriveRootSets(dir);
    assert.equal(r.ok, false, 'a git that never ran must not be read as an answer');
    assert.equal(r.fed, 1, 'it bails on the first entry');
  } finally {
    process.env.PATH = savedPath;
    removeTree(empty);
    removeTree(path.dirname(dir));
  }
});
