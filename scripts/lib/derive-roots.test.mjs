// Zero-dep unit tests for scripts/lib/derive-roots.mjs (CWK-078 findings-back). Each test
// builds a throwaway git repo in a temp dir and drives `deriveRootSets` against it directly
// -- no spawning verify.mjs, no fixture writes into the real tree.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
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

// 18c: the walk runs inside the test's sandbox: root/home is the HOME the git child reads (the tmp folder under it is made here; 18e2 N1: the side-effect call to sandboxVars is gone, makeRepo already made root/home).
function walk(dir, root) {
  const home = path.join(root, 'home');
  fs.mkdirSync(path.join(home, 'tmp'), { recursive: true });
  return deriveRootSets(dir, home);
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
    const r = walk(dir, path.dirname(dir));
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
    const r = walk(dir, path.dirname(dir));
    assert.ok(r.ignoredRoots.has('ignored-dir'));
    assert.ok(r.ignoredRoots.has('ignored-file.txt'));
    assert.equal(r.ignoredCount, 2);
    assert.ok(!r.ourRoots.has('ignored-dir'), 'an ignored entry must never also appear in ourRoots');
  } finally {
    removeTree(path.dirname(dir));
  }
});

test('deriveRootSets: fed counts entries actually visited, not the directory size -- a non-repo bails on entry 1', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cwk078-derive-nogit-'));
  const dir = path.join(root, 'plain');
  fs.mkdirSync(dir);
  try {
    fs.writeFileSync(path.join(dir, 'a.txt'), 'x');
    fs.writeFileSync(path.join(dir, 'b.txt'), 'x');
    // No `git init` -- `git check-ignore` in a non-repo exits fatal (neither 0 nor 1), which
    // is the "git cannot answer" path regardless of which entry is visited first.
    const r = walk(dir, root);
    assert.equal(r.ok, false);
    assert.equal(r.fed, 1, 'must report the ONE entry it actually tried, never the full 2-entry directory');
  } finally {
    removeTree(root);
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
    const r = spawnSync(path.join(bin, 'git'), [], { env: sandboxVars(bin), timeout: CALL_TIMEOUT_MS, killSignal: CALL_KILL });
    return r.signal === 'SIGKILL' ? false : 'a self-killing shell script cannot be run here (capability probe) -- a CI leg';
  } catch { return 'a self-killing shell script cannot be built here (capability probe) -- a CI leg'; } finally { if (bin) removeTree(bin); }
})();

test('deriveRootSets: a git killed by a signal (status null) is a FAIL, never "not ignored" (L-d, POSIX leg)', (t) => {
  if (SKIP_KILLED) { t.skip(SKIP_KILLED); return; }
  const dir = makeRepo();
  const bin = fakeKilledGit();
  const savedPath = process.env.PATH;
  try {
    process.env.PATH = bin + path.delimiter + savedPath;
    const r = walk(dir, path.dirname(dir));
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
    const r = walk(dir, path.dirname(dir));
    assert.equal(r.ok, false, 'a git that never ran must not be read as an answer');
    assert.equal(r.fed, 1, 'it bails on the first entry');
  } finally {
    process.env.PATH = savedPath;
    removeTree(empty);
    removeTree(path.dirname(dir));
  }
});

// 18c (t179 #1), red first: a git exclude planted in a HOST-shaped HOME (XDG ignore file) changes what the walk reports when that env reaches git, and a sandboxed call does not see it.
// Against the pre-18c deriveRootSets (no sandbox HOME parameter) the first assert fails: the planted HOME never reaches git, so tracked-dir stays in ourRoots.
test('deriveRootSets (18c): the HOME handed in reaches git, so a global exclude in a host-shaped HOME moves the sets and the sandbox keeps them stable', (t) => {
  const dir = makeRepo();
  const root = path.dirname(dir);
  t.after(() => removeTree(root));
  const hostHome = path.join(root, 'hosthome');
  fs.mkdirSync(path.join(hostHome, '.config', 'git'), { recursive: true });
  fs.writeFileSync(path.join(hostHome, '.config', 'git', 'ignore'), 'tracked-dir' + String.fromCharCode(10));
  fs.mkdirSync(path.join(hostHome, 'tmp'), { recursive: true });
  const hostShaped = deriveRootSets(dir, hostHome);
  assert.equal(hostShaped.ok, true);
  assert.ok(hostShaped.ignoredRoots.has('tracked-dir'), 'the planted global exclude must reach git through the HOME parameter');
  assert.ok(!hostShaped.ourRoots.has('tracked-dir'));
  const sandboxed = walk(dir, root);
  assert.ok(sandboxed.ourRoots.has('tracked-dir'), 'inside the sandbox HOME the same walk is stable');
  assert.ok(!sandboxed.ignoredRoots.has('tracked-dir'));
});

// ---- 18e2 (INSPECT 18c L2): the 18c leg pins that A sandbox variable reaches git, not WHICH one. Each leg below needs exactly one of them, so dropping that variable from childEnv turns its leg red.
// HOME: a global ~/.gitconfig in the handed-in HOME names an excludesFile that lists tracked-dir. (On Windows git reads HOME, else USERPROFILE; both come from the one handed-in home.)
const NL = String.fromCharCode(10);
test('deriveRootSets (18e2): HOME alone reaches git: an excludesFile named in the handed-in HOME .gitconfig moves the sets', (t) => {
  const dir = makeRepo();
  const root = path.dirname(dir);
  t.after(() => removeTree(root));
  const hostHome = path.join(root, 'hosthome');
  fs.mkdirSync(path.join(hostHome, 'tmp'), { recursive: true });
  const listFile = path.join(hostHome, 'global-ignore');
  fs.writeFileSync(listFile, 'tracked-dir' + NL);
  fs.writeFileSync(path.join(hostHome, '.gitconfig'), '[core]' + NL + String.fromCharCode(9) + 'excludesFile = ' + listFile.split(path.sep).join('/') + NL);
  const r = deriveRootSets(dir, hostHome);
  assert.equal(r.ok, true);
  assert.ok(r.ignoredRoots.has('tracked-dir'), 'the handed-in HOME .gitconfig must reach git');
});

// XDG_CONFIG_HOME: the CALLER's environment carries a host-shaped XDG_CONFIG_HOME with a git ignore file naming tracked-dir; a child process (never a process.env change here) calls deriveRootSets with a clean sandbox home.
// childEnv must override that ambient variable, or a developer's XDG ignore file moves the sets.
const DERIVE_URL = pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), 'derive-roots.mjs')).href;
const CHILD_CODE = 'import(process.argv[1]).then((m) => { const r = m.deriveRootSets(process.argv[2], process.argv[3]); process.stdout.write(JSON.stringify({ ok: r.ok, ours: [...r.ourRoots], ignored: [...r.ignoredRoots] })); });';
test('deriveRootSets (18e2): XDG_CONFIG_HOME in the caller environment never reaches git: the sandbox overrides it', (t) => {
  const dir = makeRepo();
  const root = path.dirname(dir);
  t.after(() => removeTree(root));
  const hostXdg = path.join(root, 'hostxdg');
  fs.mkdirSync(path.join(hostXdg, 'git'), { recursive: true });
  fs.writeFileSync(path.join(hostXdg, 'git', 'ignore'), 'tracked-dir' + NL);
  const home = path.join(root, 'home');
  fs.mkdirSync(path.join(home, 'tmp'), { recursive: true });
  const c = spawnSync(process.execPath, ['-e', CHILD_CODE, DERIVE_URL, dir, home], { env: { ...process.env, XDG_CONFIG_HOME: hostXdg }, encoding: 'utf8', timeout: CALL_TIMEOUT_MS, killSignal: CALL_KILL });
  assert.equal(c.status, 0, c.stderr);
  const out = JSON.parse(c.stdout);
  assert.equal(out.ok, true);
  assert.ok(out.ours.includes('tracked-dir'), 'the host XDG ignore file must not reach git inside the sandbox');
  assert.ok(!out.ignored.includes('tracked-dir'));
});
