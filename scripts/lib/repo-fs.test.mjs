// Zero-dep tests for scripts/lib/repo-fs.mjs (16f wave 2, CWK2-042). The link-capable legs probe their capability and skip visibly (t.skip, one leg per test); they run on CI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ConfigWriteRefused, escapesRoot, mkdirRepoParents, refuseLinkedTarget } from './repo-fs.mjs';
import { removeTree } from './test-teardown.mjs';

const probe = (kind) => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-repofs-probe-'));
  try {
    if (kind === 'dir') { fs.mkdirSync(path.join(d, 'a')); fs.symlinkSync(path.join(d, 'a'), path.join(d, 'b'), 'junction'); }
    else { fs.writeFileSync(path.join(d, 'a'), 'x'); fs.symlinkSync(path.join(d, 'a'), path.join(d, 'b'), 'file'); }
    return true;
  } catch { return false; } finally { removeTree(d); }
};
const SKIP_DIR = probe('dir') ? false : 'this box cannot create a directory link (capability probe)';
const SKIP_FILE = probe('file') ? false : 'this box cannot create a file symlink (capability probe, no privilege)';

// a project root with an outside folder beside it, both under a throwaway base that is removed even when a leg fails
const fixture = (t) => {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cb-repofs-')));
  t.after(() => {
    // a link is unlinked first, so removal never walks into its target
    for (const name of ['proj/.claude', 'proj/.claude/coal']) { try { if (fs.lstatSync(path.join(base, name)).isSymbolicLink()) fs.rmdirSync(path.join(base, name)); } catch { /* absent */ } }
    removeTree(base);
  });
  const proj = path.join(base, 'proj');
  const outside = path.join(base, 'outside');
  fs.mkdirSync(proj);
  fs.mkdirSync(outside);
  return { base, proj, outside };
};
const refused = (fn) => assert.throws(fn, (e) => e instanceof ConfigWriteRefused && /^refusing to write the config: .*Fix: .*then re-run\.$/.test(e.message));

test('mkdirRepoParents: the plain case makes every missing folder inside the root, one component at a time', (t) => {
  const { proj } = fixture(t);
  mkdirRepoParents(path.join(proj, '.claude', 'coal'), proj);
  assert.ok(fs.statSync(path.join(proj, '.claude', 'coal')).isDirectory());
});

test('mkdirRepoParents: a null root (the global config) does the plain recursive make', (t) => {
  const { base } = fixture(t);
  mkdirRepoParents(path.join(base, 'home', '.claude'), null);
  assert.ok(fs.statSync(path.join(base, 'home', '.claude')).isDirectory());
});

test('mkdirRepoParents: the root itself ("") returns and makes nothing', (t) => {
  const { proj } = fixture(t);
  mkdirRepoParents(proj, proj);
  assert.deepEqual(fs.readdirSync(proj), []);
});

test('mkdirRepoParents: a folder outside the root is refused and nothing is made', (t) => {
  const { proj, outside } = fixture(t);
  refused(() => mkdirRepoParents(path.join(outside, 'x'), proj));
  refused(() => mkdirRepoParents(path.join(proj, '..', 'sibling'), proj));
  assert.deepEqual(fs.readdirSync(outside), []);
  assert.equal(fs.existsSync(path.join(path.dirname(proj), 'sibling')), false);
});

test('escapesRoot: the test is on the first SEGMENT, so a real folder named "..cfg" passes and ".." does not', (t) => {
  assert.equal(escapesRoot('..'), true);
  assert.equal(escapesRoot('..' + path.sep + 'x'), true);
  assert.equal(escapesRoot(path.resolve('/abs')), true);
  assert.equal(escapesRoot('..cfg'), false);
  assert.equal(escapesRoot(path.join('..cfg', 'coal')), false);
  const { proj } = fixture(t);
  mkdirRepoParents(path.join(proj, '..cfg', 'coal'), proj);
  assert.ok(fs.statSync(path.join(proj, '..cfg', 'coal')).isDirectory());
});

test('mkdirRepoParents: a component that exists and is not a directory is refused', (t) => {
  const { proj } = fixture(t);
  fs.writeFileSync(path.join(proj, '.claude'), 'a file where the agent folder should be');
  refused(() => mkdirRepoParents(path.join(proj, '.claude', 'coal'), proj));
  assert.equal(fs.readFileSync(path.join(proj, '.claude'), 'utf8'), 'a file where the agent folder should be');
});

test('mkdirRepoParents: a link at the first component is refused wherever it points, and nothing is made through it', { skip: SKIP_DIR }, (t) => {
  const { proj, outside } = fixture(t);
  fs.symlinkSync(outside, path.join(proj, '.claude'), 'junction');
  refused(() => mkdirRepoParents(path.join(proj, '.claude', 'coal'), proj));
  assert.deepEqual(fs.readdirSync(outside), []);
});

test('mkdirRepoParents: a link whose target is INSIDE the project is refused too (the pin is on the literal location)', { skip: SKIP_DIR }, (t) => {
  const { proj } = fixture(t);
  fs.mkdirSync(path.join(proj, 'real'));
  fs.symlinkSync(path.join(proj, 'real'), path.join(proj, '.claude'), 'junction');
  refused(() => mkdirRepoParents(path.join(proj, '.claude', 'coal'), proj));
  assert.deepEqual(fs.readdirSync(path.join(proj, 'real')), []);
});

test('mkdirRepoParents: a link at the SECOND component is refused and nothing is made beyond the checked first one', { skip: SKIP_DIR }, (t) => {
  const { proj, outside } = fixture(t);
  fs.mkdirSync(path.join(proj, '.claude'));
  fs.symlinkSync(outside, path.join(proj, '.claude', 'coal'), 'junction');
  refused(() => mkdirRepoParents(path.join(proj, '.claude', 'coal', 'deeper'), proj));
  assert.deepEqual(fs.readdirSync(outside), []);
});

test('refuseLinkedTarget: a missing target and a regular file pass', (t) => {
  const { proj } = fixture(t);
  refuseLinkedTarget(path.join(proj, 'none.json'));
  fs.writeFileSync(path.join(proj, 'real.json'), '{}');
  refuseLinkedTarget(path.join(proj, 'real.json'));
});

test('refuseLinkedTarget: a symlink at the target is refused, wherever it points', { skip: SKIP_FILE }, (t) => {
  const { proj, outside } = fixture(t);
  fs.writeFileSync(path.join(outside, 'victim.json'), '{}');
  fs.symlinkSync(path.join(outside, 'victim.json'), path.join(proj, 'cfg.json'), 'file');
  refused(() => refuseLinkedTarget(path.join(proj, 'cfg.json')));
});
