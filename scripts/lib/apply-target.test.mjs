// Tests for the GATE 3 apply checker (15b5, CWK2-038): skills/coalboard/scripts/apply-target.mjs, run by the AGENT before every live write.
// A target path in a cloned repo can itself be, or pass through, a planted symlink or junction, so an approved diff naming the LINK path would land on
// the link's target outside the project. The checker refuses (never surface-and-apply) any target with a link AT or BELOW the project root, or whose real
// path is not inside the real root; a link ABOVE the root is the user's layout. It is a CLI, so it fails LOUD (hooks-safety.md section 1.0): exit 0 every
// target OK, 1 any refused, 2 a usage error. These tests SPAWN the real script (never an extracted import), sandbox HOME/USERPROFILE/TEMP/TMP/TMPDIR
// (hooks-safety.md section 7), build fixtures under os.tmpdir() with registered teardown, and probe link capability (t.skip, one skippable leg per test).
// Junction legs run on every platform; file-symlink legs skip visibly when the box cannot make one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, '..', '..', 'skills', 'coalboard', 'scripts', 'apply-target.mjs');
const DIST_SCRIPT = path.join(HERE, '..', '..', 'plugin', 'skills', 'coalboard', 'scripts', 'apply-target.mjs');

const mk = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cb-apply-'));
function canLink(kind) {
  const d = mk();
  try {
    fs.mkdirSync(path.join(d, 'dir'));
    fs.writeFileSync(path.join(d, 'file'), 'x');
    if (kind === 'file') fs.symlinkSync(path.join(d, 'file'), path.join(d, 'l'), 'file');
    else fs.symlinkSync(path.join(d, 'dir'), path.join(d, 'l'), 'junction');
    return true;
  } catch { return false; } finally { fs.rmSync(d, { recursive: true, force: true }); }
}
const SKIP_FILE = canLink('file') ? false : 'this box cannot create a file symlink (no privilege)';
const SKIP_DIR = canLink('dir') ? false : 'this box cannot create a directory link';

// base/proj is the project root; base2 is a separate OUTSIDE root. The teardown also proves no link was followed into the outside root.
function sandbox(t) {
  const base = mk();
  const outside = mk();
  const proj = path.join(base, 'proj');
  fs.mkdirSync(proj, { recursive: true });
  fs.writeFileSync(path.join(outside, 'keep'), 'x');
  t.after(() => {
    fs.rmSync(base, { recursive: true, force: true });
    const survived = fs.existsSync(path.join(outside, 'keep'));
    fs.rmSync(outside, { recursive: true, force: true });
    assert.ok(survived, 'cleanup of the sandbox removed the outside root content: a link was followed');
  });
  return { base, proj, outside, realProj: fs.realpathSync.native(proj) };
}
const touch = (p, text = 'x') => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); };
const link = (target, at, type) => { fs.mkdirSync(path.dirname(at), { recursive: true }); fs.symlinkSync(target, at, type); };

function run(s, args, extra = {}) {
  const env = { ...process.env, HOME: s.base, USERPROFILE: s.base, TEMP: s.base, TMP: s.base, TMPDIR: s.base, CLAUDE_PROJECT_DIR: '', CLAUDE_PLUGIN_ROOT: '', CLAUDE_PLUGIN_DATA: '' };
  delete env.NODE_TEST_CONTEXT;
  const argv = extra.preload ? ['--require', extra.preload, extra.script || SCRIPT, ...args] : [extra.script || SCRIPT, ...args];
  return spawnSync(process.execPath, argv, { cwd: s.base, env, encoding: 'utf8', timeout: 20000, killSignal: 'SIGKILL', windowsHide: true, shell: false });
}
const lines = (r) => r.stdout.split('\n').filter(Boolean);

// ---- exit codes and the output line ------------------------------------------------------------------------------------------------
test('exit 0 and one OK line when every target is a plain in-root file or a new in-root file', (t) => {
  const s = sandbox(t);
  touch(path.join(s.proj, 'src', 'a.js'));
  const r = run(s, [s.proj, 'src/a.js', 'src/new.js', 'deep/er/new.js']);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.equal(r.stderr, '');
  assert.deepEqual(lines(r), ['OK src/a.js', 'OK src/new.js', 'OK deep/er/new.js']);
});

test('exit 1 when any target is refused, with one line per target, the refused one naming its reason and its link text', (t) => {
  if (SKIP_DIR) { t.skip(SKIP_DIR); return; }
  const s = sandbox(t);
  touch(path.join(s.proj, 'ok.js'));
  link(s.outside, path.join(s.proj, 'ln'), 'junction');
  const r = run(s, [s.proj, 'ok.js', 'ln/x.js']);
  assert.equal(r.status, 1);
  const l = lines(r);
  assert.equal(l.length, 2);
  assert.equal(l[0], 'OK ok.js');
  // the checker prints the link's own target text (readlink, never resolved): compare with what Node returns for the same link, not with a realpath
  const linkText = fs.readlinkSync(path.join(s.proj, 'ln'));
  assert.equal(l[1], `REFUSE ln/x.js link ${linkText}`, `the refusal names the link's own text: ${l[1]}`);
});

test('exit 2 on a usage error: no arguments, no target, an unresolvable root, an unknown flag', (t) => {
  const s = sandbox(t);
  for (const args of [[], [s.proj], [path.join(s.base, 'no-such-root'), 'a.js'], ['--bogus', s.proj, 'a.js']]) {
    const r = run(s, args);
    assert.equal(r.status, 2, `args ${JSON.stringify(args)}: ${r.stdout}${r.stderr}`);
    assert.equal(r.stdout, '', 'a usage error prints nothing on stdout');
    assert.ok(r.stderr.length > 0);
  }
});

test('an unknown flag is a usage error even when a folder of that name exists (it is never taken as the root)', (t) => {
  const s = sandbox(t);
  fs.mkdirSync(path.join(s.base, '-x'));
  const r = run(s, ['-x', 'a.js']);
  assert.equal(r.status, 2);
  assert.equal(r.stdout, '');
  assert.ok(r.stderr.includes('unknown flag'), r.stderr);
});

test('--help prints usage to stdout and exits 0', (t) => {
  const s = sandbox(t);
  const r = run(s, ['--help']);
  assert.equal(r.status, 0);
  assert.ok(r.stdout.includes('apply-target.mjs'));
});

test('a control character in a target never forges a second output line', (t) => {
  const s = sandbox(t);
  const r = run(s, [s.proj, 'a' + String.fromCharCode(10) + 'OK forged.js']);
  assert.equal(lines(r).length, 1, r.stdout);
});

// ---- link refusals ---------------------------------------------------------------------------------------------------------------------
test('a junction AS the target\'s directory, pointing outside the root, is refused as link', (t) => {
  if (SKIP_DIR) { t.skip(SKIP_DIR); return; }
  const s = sandbox(t);
  link(s.outside, path.join(s.proj, 'dir'), 'junction');
  const r = run(s, [s.proj, 'dir/x.js']);
  assert.equal(r.status, 1);
  assert.ok(lines(r)[0].startsWith('REFUSE dir/x.js link '), r.stdout);
});

test('a junction in the MIDDLE of the path is refused as link', (t) => {
  if (SKIP_DIR) { t.skip(SKIP_DIR); return; }
  const s = sandbox(t);
  fs.mkdirSync(path.join(s.proj, 'a'));
  link(s.outside, path.join(s.proj, 'a', 'ln'), 'junction');
  const r = run(s, [s.proj, 'a/ln/b/c.js']);
  assert.equal(r.status, 1);
  assert.ok(lines(r)[0].startsWith('REFUSE a/ln/b/c.js link '), r.stdout);
});

test('a junction to another folder INSIDE the root is refused as link, not accepted as inside', (t) => {
  if (SKIP_DIR) { t.skip(SKIP_DIR); return; }
  const s = sandbox(t);
  touch(path.join(s.proj, 'real', 'f.js'));
  link(path.join(s.proj, 'real'), path.join(s.proj, 'alias'), 'junction');
  const r = run(s, [s.proj, 'alias/f.js']);
  assert.equal(r.status, 1);
  assert.ok(lines(r)[0].startsWith('REFUSE alias/f.js link '), r.stdout);
});

test('a NEW file under a junction is refused as link (the missing tail does not hide the link)', (t) => {
  if (SKIP_DIR) { t.skip(SKIP_DIR); return; }
  const s = sandbox(t);
  link(s.outside, path.join(s.proj, 'dir'), 'junction');
  const r = run(s, [s.proj, 'dir/not-yet/new.js']);
  assert.equal(r.status, 1);
  assert.ok(lines(r)[0].startsWith('REFUSE dir/not-yet/new.js link '), r.stdout);
  assert.ok(!fs.existsSync(path.join(s.outside, 'not-yet')), 'the checker writes nothing');
});

test('a junction AT the target name is refused as link', (t) => {
  if (SKIP_DIR) { t.skip(SKIP_DIR); return; }
  const s = sandbox(t);
  link(s.outside, path.join(s.proj, 'x.js'), 'junction');
  const r = run(s, [s.proj, 'x.js']);
  assert.equal(r.status, 1);
  assert.ok(lines(r)[0].startsWith('REFUSE x.js link '), r.stdout);
});

test('a file symlink AT the target to an outside file is refused as link', (t) => {
  if (SKIP_FILE) { t.skip(SKIP_FILE); return; }
  const s = sandbox(t);
  touch(path.join(s.outside, 'victim.txt'));
  link(path.join(s.outside, 'victim.txt'), path.join(s.proj, 'f.js'), 'file');
  const r = run(s, [s.proj, 'f.js']);
  assert.equal(r.status, 1);
  assert.ok(lines(r)[0].startsWith('REFUSE f.js link '), r.stdout);
});

test('a file symlink AT the target to a file INSIDE the root is refused as link', (t) => {
  if (SKIP_FILE) { t.skip(SKIP_FILE); return; }
  const s = sandbox(t);
  touch(path.join(s.proj, 'real.js'));
  link(path.join(s.proj, 'real.js'), path.join(s.proj, 'f.js'), 'file');
  const r = run(s, [s.proj, 'f.js']);
  assert.equal(r.status, 1);
  assert.ok(lines(r)[0].startsWith('REFUSE f.js link '), r.stdout);
});

// ---- outside ----------------------------------------------------------------------------------------------------------------------------
test('a target with .. that leaves the root is refused as outside', (t) => {
  const s = sandbox(t);
  fs.mkdirSync(path.join(s.proj, 'a'));
  const r = run(s, [s.proj, '../x.js', 'a/../../x.js']);
  assert.equal(r.status, 1);
  const l = lines(r);
  assert.ok(l[0].startsWith('REFUSE ../x.js outside '), l[0]);
  assert.ok(l[1].startsWith('REFUSE a/../../x.js outside '), l[1]);
});

test('a .. that stays inside the root is OK', (t) => {
  const s = sandbox(t);
  fs.mkdirSync(path.join(s.proj, 'a'));
  touch(path.join(s.proj, 'b.js'));
  const r = run(s, [s.proj, 'a/../b.js']);
  assert.equal(r.status, 0, r.stdout);
  assert.deepEqual(lines(r), ['OK a/../b.js']);
});

test('a .. after a junction is judged by the REAL parent, not the lexical one (a/link/../b)', (t) => {
  if (SKIP_DIR) { t.skip(SKIP_DIR); return; }
  const s = sandbox(t);
  fs.mkdirSync(path.join(s.proj, 'a'));
  link(s.outside, path.join(s.proj, 'a', 'ln'), 'junction');
  const r = run(s, [s.proj, 'a/ln/../b.js']);
  assert.equal(r.status, 1);
  assert.ok(lines(r)[0].startsWith('REFUSE a/ln/../b.js link '), r.stdout);
});

test('an absolute target outside the root is refused as outside; an absolute target inside is OK', (t) => {
  const s = sandbox(t);
  touch(path.join(s.proj, 'in.js'));
  const r = run(s, [s.proj, path.join(s.outside, 'x.js'), path.join(s.proj, 'in.js')]);
  assert.equal(r.status, 1);
  const l = lines(r);
  assert.ok(l[0].startsWith('REFUSE ') && l[0].includes(' outside '), l[0]);
  assert.ok(l[1].startsWith('OK '), l[1]);
});

test('the project root itself is not a file target', (t) => {
  const s = sandbox(t);
  const r = run(s, [s.proj, '.']);
  assert.equal(r.status, 1);
  assert.ok(lines(r)[0].startsWith('REFUSE . unresolvable '), r.stdout);
});

// ---- the root reached through a link ABOVE it (the user's layout) -------------------------------------------------------------------------
test('a root reached through a junction ABOVE it is OK, by its relative and its absolute spelling', (t) => {
  if (SKIP_DIR) { t.skip(SKIP_DIR); return; }
  const s = sandbox(t);
  touch(path.join(s.proj, 'f.js'));
  const via = path.join(s.base, 'via');
  link(s.proj, via, 'junction');
  const r = run(s, [via, 'f.js', path.join(via, 'f.js'), 'new.js']);
  assert.equal(r.status, 0, r.stdout);
  assert.deepEqual(lines(r), ['OK f.js', 'OK ' + path.join(via, 'f.js'), 'OK new.js']);
});

// ---- unresolvable = refused (fail closed) -----------------------------------------------------------------------------------------------
const EACCES_REALPATH = "const fs = require('fs'); const orig = fs.realpathSync.native; fs.realpathSync.native = function (p) { if (String(p).endsWith('guarded.js')) { const e = new Error('denied'); e.code = 'EPERM'; throw e; } return orig.apply(this, arguments); };";
test('a target whose realpath is denied (EPERM) is refused as unresolvable', (t) => {
  const s = sandbox(t);
  touch(path.join(s.proj, 'guarded.js'));
  const pre = path.join(s.outside, 'pre.cjs');
  fs.writeFileSync(pre, EACCES_REALPATH);
  const r = run(s, [s.proj, 'guarded.js'], { preload: pre });
  assert.equal(r.status, 1);
  assert.ok(lines(r)[0].startsWith('REFUSE guarded.js unresolvable '), r.stdout);
});

test('a component whose lstat is denied (EACCES) is refused as unresolvable', (t) => {
  const s = sandbox(t);
  fs.mkdirSync(path.join(s.proj, 'locked'));
  const pre = path.join(s.outside, 'pre2.cjs');
  fs.writeFileSync(pre, "const fs = require('fs'); const orig = fs.lstatSync; fs.lstatSync = function (p) { if (String(p).endsWith('locked')) { const e = new Error('denied'); e.code = 'EACCES'; throw e; } return orig.apply(this, arguments); };");
  const r = run(s, [s.proj, 'locked/f.js'], { preload: pre });
  assert.equal(r.status, 1);
  assert.ok(lines(r)[0].startsWith('REFUSE locked/f.js unresolvable '), r.stdout);
});

test('a path through a plain FILE (ENOTDIR) is refused as unresolvable, not guessed', (t) => {
  const s = sandbox(t);
  touch(path.join(s.proj, 'plain.txt'));
  const r = run(s, [s.proj, 'plain.txt/x.js']);
  assert.equal(r.status, 1);
  assert.ok(lines(r)[0].startsWith('REFUSE plain.txt/x.js unresolvable '), r.stdout);
});

test('the final guard judges containment with path.relative, not a string prefix (a sibling folder sharing the root name)', (t) => {
  const s = sandbox(t);
  touch(path.join(s.proj, 'f.js'));
  const pre = path.join(s.outside, 'pre3.cjs');
  fs.writeFileSync(pre, "const fs = require('fs'); const path = require('path'); const orig = fs.realpathSync.native; fs.realpathSync.native = function (p) { if (String(p).endsWith('f.js')) return orig.call(this, path.dirname(path.dirname(String(p)))) + path.sep + 'proj-evil' + path.sep + 'f.js'; return orig.apply(this, arguments); };");
  const r = run(s, [s.proj, 'f.js'], { preload: pre });
  assert.equal(r.status, 1);
  assert.ok(lines(r)[0].startsWith('REFUSE f.js outside '), r.stdout);
});

// path.join would collapse the .. itself, so the absolute spelling under test is built by hand
const dotdot = (base, through, file) => [base, through, '..', file].join(path.sep);
// R2 HIGH-1: the ABSOLUTE spelling must not collapse .. before the walk. On POSIX the kernel resolves the link first and then .., so a/ln/../b is outside the
// project while a lexical collapse reads inside it. Both branches now go through one textual segment strip and one lstat walk.
test('an ABSOLUTE target with a .. after a junction is judged by the real parent, like the relative spelling (<root>/ln/../x.js)', (t) => {
  if (SKIP_DIR) { t.skip(SKIP_DIR); return; }
  const s = sandbox(t);
  link(s.outside, path.join(s.proj, 'ln'), 'junction');
  const rel = run(s, [s.proj, 'ln/../x.js']);
  const abs = run(s, [s.proj, dotdot(s.realProj, 'ln', 'x.js')]);
  assert.equal(rel.status, 1);
  assert.equal(abs.status, 1, abs.stdout);
  assert.ok(lines(abs)[0].includes(' link '), abs.stdout);
});

test('an ABSOLUTE .. after a junction is refused through the lexical spelling of the root too (a root reached through a junction above it)', (t) => {
  if (SKIP_DIR) { t.skip(SKIP_DIR); return; }
  const s = sandbox(t);
  const via = path.join(s.base, 'via');
  link(s.proj, via, 'junction');
  link(s.outside, path.join(s.proj, 'ln'), 'junction');
  const r = run(s, [via, dotdot(via, 'ln', 'x.js')]);
  assert.equal(r.status, 1, r.stdout);
  assert.ok(lines(r)[0].includes(' link '), r.stdout);
});

// R3 MEDIUM-1: a missing component is forward-only. After it the lstat walk has nothing to judge, so a later .. would let the lexical join step back onto a link
// further along the path (nope/../lnk/x.txt) and answer OK for a path that is REFUSE link when spelled lnk/x.txt. Fail closed as unresolvable.
test('a missing component followed by .. that then passes an in-project junction is refused (relative spelling nope/../lnk/canary.txt)', (t) => {
  if (SKIP_DIR) { t.skip(SKIP_DIR); return; }
  const s = sandbox(t);
  fs.mkdirSync(path.join(s.proj, 'inproj'));
  link(path.join(s.proj, 'inproj'), path.join(s.proj, 'lnk'), 'junction');
  const direct = run(s, [s.proj, 'lnk/canary.txt']);
  const r = run(s, [s.proj, 'nope/../lnk/canary.txt']);
  assert.ok(lines(direct)[0].startsWith('REFUSE lnk/canary.txt link '), direct.stdout);
  assert.equal(r.status, 1, r.stdout);
  assert.ok(lines(r)[0].startsWith('REFUSE nope/../lnk/canary.txt unresolvable '), r.stdout);
});

test('a missing component followed by .. that then passes an in-project junction is refused (ABSOLUTE spelling <root>/nope/../lnk/canary.txt)', (t) => {
  if (SKIP_DIR) { t.skip(SKIP_DIR); return; }
  const s = sandbox(t);
  fs.mkdirSync(path.join(s.proj, 'inproj'));
  link(path.join(s.proj, 'inproj'), path.join(s.proj, 'lnk'), 'junction');
  const r = run(s, [s.proj, dotdot(s.realProj, 'nope', 'lnk' + path.sep + 'canary.txt')]);
  assert.equal(r.status, 1, r.stdout);
  assert.ok(lines(r)[0].includes(' unresolvable '), r.stdout);
});

test('a missing component followed by .. is refused even with no link anywhere (forward-only tail), and a plain missing tail stays OK', (t) => {
  const s = sandbox(t);
  const bad = run(s, [s.proj, 'nope/../x.js']);
  const ok = run(s, [s.proj, 'nope/x.js']);
  assert.equal(bad.status, 1, bad.stdout);
  assert.ok(lines(bad)[0].startsWith('REFUSE nope/../x.js unresolvable '), bad.stdout);
  assert.equal(ok.status, 0, ok.stdout);
});

// R2 LOW-1 / M5: where this platform's own path.relative folds case (win32), a case-variant absolute target is the SAME file and is OK; a string-prefix test would refuse it.
const CASE_FOLDS = path.relative('a', 'A') === '';
test('a case-variant ABSOLUTE target is OK where path.relative folds case (C:/PROJ/F.JS for root C:/proj)', (t) => {
  if (!CASE_FOLDS) { t.skip('path.relative does not fold case on this platform'); return; }
  const s = sandbox(t);
  touch(path.join(s.proj, 'f.js'));
  const variant = path.join(s.realProj, 'f.js').toUpperCase();
  const r = run(s, [s.proj, variant]);
  assert.equal(r.status, 0, r.stdout);
  assert.deepEqual(lines(r), ['OK ' + variant]);
});

function aclDenyWorks() {
  const d = mk();
  try {
    const f = path.join(d, 'probe');
    fs.writeFileSync(f, 'x');
    const me = os.userInfo().username;
    const r = spawnSync('icacls', [f, '/deny', me + ':(R)'], { encoding: 'utf8', timeout: 20000 });
    if (r.error || r.status !== 0) return false;
    try { fs.realpathSync.native(f); return false; } catch (e) { return !!e && (e.code === 'EPERM' || e.code === 'EACCES'); }
  } catch { return false; } finally {
    try { spawnSync('icacls', [path.join(d, 'probe'), '/reset'], { encoding: 'utf8', timeout: 20000 }); } catch {}
    fs.rmSync(d, { recursive: true, force: true });
  }
}
const ACL = aclDenyWorks();
test('a real ACL-denied file (icacls /deny R) is refused as unresolvable', (t) => {
  if (!ACL) { t.skip('no read denial via icacls on this volume or OS (capability probe)'); return; }
  const s = sandbox(t);
  const f = path.join(s.proj, 'acl.js');
  touch(f);
  spawnSync('icacls', [f, '/deny', os.userInfo().username + ':(R)'], { encoding: 'utf8', timeout: 20000 });
  let r;
  try { r = run(s, [s.proj, 'acl.js']); } finally { spawnSync('icacls', [f, '/reset'], { encoding: 'utf8', timeout: 20000 }); } // reset BEFORE the sandbox teardown runs
  assert.equal(r.status, 1);
  assert.ok(lines(r)[0].startsWith('REFUSE acl.js unresolvable '), r.stdout);
});

// ---- the dist copy is the same script (the agent reads it from the installed plugin) -------------------------------------------------------
test('the dist copy answers the same as the source', (t) => {
  const s = sandbox(t);
  touch(path.join(s.proj, 'a.js'));
  const a = run(s, [s.proj, 'a.js', '../x.js']);
  const b = run(s, [s.proj, 'a.js', '../x.js'], { script: DIST_SCRIPT });
  assert.equal(b.status, a.status);
  assert.equal(b.stdout, a.stdout);
});

// ---- 18e (T-15b5-1): a target segment below the root that ends in a dot or a space is refused as `name`, on every platform ----------------
// Windows strips a trailing dot or space from a path component, so `foo.`, `foo ` and `foo` are one file there and a target could be checked under one spelling and written under
// another. The rule judges the RAW segments, before any file-system call; `.` and `..` keep their meaning, and the root's own segments are the user's layout.
// 18e r2 (INSPECT M1): a trailing dot or space right before an NTFS stream colon is the same name once Windows strips it (a.txt.::$DATA is a.txt.), so it is refused too.
const NAME_CASES = ['sub./a.txt', 'sub /a.txt', 'a.txt.', 'a.txt ', '.../a', 'ok/b. /c', 'a.txt.::$DATA', 'sub :x/f.txt', 'sub.:s/x'];
test('a segment ending in a dot or a space is refused as name, whichever segment it is (relative spelling)', (t) => {
  const s = sandbox(t);
  touch(path.join(s.proj, 'ok.txt'));
  const r = run(s, [s.proj, ...NAME_CASES]);
  assert.equal(r.status, 1, r.stdout);
  assert.deepEqual(lines(r), NAME_CASES.map((c) => `REFUSE ${c} name -`));
});

test('the same segments are refused as name in the ABSOLUTE spelling', (t) => {
  const s = sandbox(t);
  const abs = NAME_CASES.map((c) => s.proj + path.sep + c.split('/').join(path.sep));
  const r = run(s, [s.proj, ...abs]);
  assert.equal(r.status, 1, r.stdout);
  assert.deepEqual(lines(r), abs.map((c) => `REFUSE ${c} name -`));
});

test('names that merely contain a dot or start with one stay OK, and so does a .. that stays inside the root (relative and absolute)', (t) => {
  const s = sandbox(t);
  fs.mkdirSync(path.join(s.proj, 'sub'));
  touch(path.join(s.proj, 'ok.txt'));
  // a.txt::$DATA is the main stream of a.txt; ab:c/x and sub:s are names with a colon that are legal on POSIX and stay OK (18e r2). A drive-letter start (c:d/x) moved to the refused cases in 18f.
  // sub/z:foo/x and ./z:foo are OK because the drive-like text is not at the very start of the target: a resolving writer only reads a drive prefix there (18f, probed).
  const rel = ['a.b/c.txt', '.hidden/x', 'sub/../ok.txt', 'sp ace/f.txt', 'new.d/file', 'a.txt::$DATA', 'ab:c/x', 'sub:s', 'sub/z:foo/x', './z:foo/x'];
  const abs = rel.map((c) => s.proj + path.sep + c.split('/').join(path.sep));
  const r = run(s, [s.proj, ...rel, ...abs]);
  assert.equal(r.status, 0, r.stdout);
  assert.deepEqual(lines(r), [...rel, ...abs].map((c) => `OK ${c}`));
});

test('a root whose OWN path has a trailing-dot folder above it is not judged (the root is the user\'s layout; capability leg, it runs wherever the platform can make such a folder)', (t) => {
  const base = mk();
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const up = path.join(base, 'up.');
  try { fs.mkdirSync(up); } catch { /* the probe below decides */ }
  if (!fs.readdirSync(base).includes('up.')) { t.skip('this platform cannot make a folder whose name ends in a dot (capability probe) -- a CI leg'); return; }
  const proj = path.join(up, 'proj');
  fs.mkdirSync(proj);
  const s = { base, proj };
  const r = run(s, [proj, 'a.txt', proj + path.sep + 'b.txt']);
  assert.equal(r.status, 0, r.stdout);
  assert.deepEqual(lines(r), ['OK a.txt', 'OK ' + proj + path.sep + 'b.txt']);
});

// ---- 18f (T-18e-2, INSPECT 18e D1): a RELATIVE target that starts with a drive prefix (one letter and a colon) is refused as name, on every platform ----------------------------------------
// path.isAbsolute('z:foo/x.txt') is false on win32, so the checker would judge it joined to the root, while a writer that RESOLVES it (path.win32.resolve(root, 'z:foo/x.txt')) lands on z:\foo\x.txt, on another drive.
// The rule reads the raw target's first characters only: a colon later in the name stays OK, and so does an ABSOLUTE spelling (see the next test).
const DRIVE_CASES = ['z:foo/x.txt', 'Z:foo/x.txt', 'c:d/x', 'C:D/x', 'x:y', 'X:y'];
test('a relative target that starts with a drive prefix is refused as name, in both letter cases', (t) => {
  const s = sandbox(t);
  const r = run(s, [s.proj, ...DRIVE_CASES]);
  assert.equal(r.status, 1, r.stdout);
  assert.deepEqual(lines(r), DRIVE_CASES.map((c) => `REFUSE ${c} name -`));
});

test('an ABSOLUTE target whose below-root first segment looks like a drive prefix stays OK: a writer is handed the whole path, and a drive prefix is read only at its start', (t) => {
  const s = sandbox(t);
  const abs = ['z:foo/x.txt', 'c:d/x', 'x:y'].map((c) => s.proj + path.sep + c.split('/').join(path.sep));
  const r = run(s, [s.proj, ...abs]);
  assert.equal(r.status, 0, r.stdout);
  assert.deepEqual(lines(r), abs.map((c) => `OK ${c}`));
});

// ---- 28a: a REFUSED target never reaches a file-system resolve ---------------------------------------------------------------------------
// A CJS preload wraps fs.realpathSync.native and fs.lstatSync and logs every path it is handed, so the log is the checker's own file-system trace.
// The assertions read that trace, never the verdict alone: a correct REFUSE line with a resolve of the refused path is still the defect. A network
// path is refused on its raw text; an outside target and a link are refused without resolving them (a link's own target text is read, never followed).
// fakeLink (optional): a path ending in that name reports as a symbolic link at lstat, so the link branch runs on a box with no symlink privilege.
function traced(s, fakeLink = null) {
  const log = path.join(s.outside, 'fs-trace.log');
  const pre = path.join(s.outside, 'fs-trace.cjs');
  fs.writeFileSync(pre, [
    "const fs = require('fs');",
    `const LOG = ${JSON.stringify(log)};`,
    `const FAKE = ${JSON.stringify(fakeLink)};`,
    "const note = (kind, p) => fs.appendFileSync(LOG, kind + ' ' + String(p) + '\\n');",
    'const realNative = fs.realpathSync.native;',
    "fs.realpathSync.native = function (p) { note('realpath', p); return realNative.apply(this, arguments); };",
    'const realLstat = fs.lstatSync;',
    "fs.lstatSync = function (p) { note('lstat', p); if (FAKE !== null && String(p).endsWith(FAKE)) return { isSymbolicLink: () => true, isDirectory: () => false }; return realLstat.apply(this, arguments); };",
  ].join('\n'));
  return { log, pre };
}
const trace = (tr) => (fs.existsSync(tr.log) ? fs.readFileSync(tr.log, 'utf8').split('\n').filter(Boolean) : []);
const resolved = (tr) => trace(tr).filter((l) => l.startsWith('realpath ')).map((l) => l.slice('realpath '.length));
const insideRoot = (p, root) => { const rel = path.relative(root, p); return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel)); };

test('28a: a network-path target (UNC, //host/share, \\\\?\\UNC) is refused on its raw text, before any file-system call, on every platform', (t) => {
  const s = sandbox(t);
  const tr = traced(s);
  const cases = ['\\\\zzhost\\share\\x.js', '//zzhost/share/x.js', '\\\\?\\UNC\\zzhost\\share\\x.js'];
  for (const c of cases) {
    fs.rmSync(tr.log, { force: true });
    const r = run(s, [s.proj, c], { preload: tr.pre });
    assert.equal(r.status, 1, r.stdout);
    assert.deepEqual(trace(tr).filter((l) => l.includes('zzhost')), [], `a file-system call reached the refused network path ${c}`);
    assert.deepEqual(lines(r), [`REFUSE ${c} outside ${c}`]);
  }
});

test('28a: a plain absolute target outside the root is refused without a resolve of any path outside the root', (t) => {
  const s = sandbox(t);
  const tr = traced(s);
  const r = run(s, [s.proj, path.join(s.outside, 'x.js')], { preload: tr.pre });
  assert.equal(r.status, 1, r.stdout);
  assert.ok(lines(r)[0].startsWith('REFUSE ') && lines(r)[0].includes(' outside '), r.stdout);
  const escaped = resolved(tr).filter((p) => !insideRoot(p, s.proj) && !insideRoot(p, s.realProj));
  assert.deepEqual(escaped, [], `the checker resolved a path outside the root: ${escaped.join(', ')}`);
});

test('28a: a target that climbs out of the root with .. is refused without a resolve of any path above the root', (t) => {
  const s = sandbox(t);
  const tr = traced(s);
  const r = run(s, [s.proj, '../zzclimb/x.js'], { preload: tr.pre });
  assert.equal(r.status, 1, r.stdout);
  assert.ok(lines(r)[0].startsWith('REFUSE ../zzclimb/x.js outside '), r.stdout);
  const escaped = resolved(tr).filter((p) => !insideRoot(p, s.proj) && !insideRoot(p, s.realProj));
  assert.deepEqual(escaped, [], `the checker resolved a path above the root: ${escaped.join(', ')}`);
});

test('28a: a link is refused as link without a resolve of the link path (the link is simulated at lstat, so no symlink privilege is needed)', (t) => {
  const s = sandbox(t);
  const tr = traced(s, 'ln.js');
  const r = run(s, [s.proj, 'ln.js'], { preload: tr.pre });
  assert.equal(r.status, 1, r.stdout);
  assert.ok(lines(r)[0].startsWith('REFUSE ln.js link '), r.stdout);
  const hit = resolved(tr).filter((p) => p === path.join(s.realProj, 'ln.js') || p === path.join(s.proj, 'ln.js'));
  assert.deepEqual(hit, [], `the checker resolved the refused link: ${hit.join(', ')}`);
});
