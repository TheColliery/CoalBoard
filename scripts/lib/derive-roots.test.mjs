// Zero-dep unit tests for scripts/lib/derive-roots.mjs (CWK-078 findings-back). Each test
// builds a throwaway git repo in a temp dir and drives `deriveRootSets` against it directly
// -- no spawning verify.mjs, no fixture writes into the real tree.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { deriveRootSets } from './derive-roots.mjs';
import { gitEnv } from './git-env.mjs';

function makeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cwk078-derive-'));
  execFileSync('git', ['init', '--quiet'], { cwd: dir, env: gitEnv(path.dirname(dir)) });
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
  t.after(() => fs.rmSync(sandbox, { recursive: true, force: true }));
  execFileSync('git', ['init', '--quiet'], { cwd: sandbox, env: gitEnv(path.dirname(sandbox)) });
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
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
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
    fs.rmSync(dir, { recursive: true, force: true });
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
    fs.rmSync(dir, { recursive: true, force: true });
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
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
