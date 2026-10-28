// Planted-link witnesses for the conductor's project-config READ (14a, the E2-4 class; hooks-safety.md section 6 row 10,
// node/runtime.md section 4). A junction (Windows) or symlink (POSIX) planted under the project's own state folder must
// never make the hook read a file OUTSIDE that folder: the candidate's realpath has to sit inside the hand-joined expected
// folder (<dir>/.claude/coal, <dir>/.claude, or <dir>), a refused candidate contributes nothing, keeps the walk's selection,
// and is REPORTED on SessionStart. Every witness reads a config that SILENCES the board (coalboardMode off): if the hook
// read the outside file, the SessionStart line would be empty; refused, it carries the board contract plus the notice.
// One file by design (the conductor's own test is 1,000+ lines; a second concern gets its own roster line).
// Junction legs run on every platform (a directory link needs no privilege); file-symlink legs are capability-probed and
// t.skip VISIBLY when the box cannot make one, one skippable leg per test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HOOK = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'hooks', 'coalboard-conductor.js');
const BOARD = 'Consensus board available';
const REASON = 'resolves outside its folder';
const QUIET = { coalboardMode: 'off', updateMode: 'off' };
const KW = { criticalKeywords: ['frobnicate'], updateMode: 'off' };

const mk = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cb-link-'));
const write = (p, cfg) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(cfg)); };

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
const FILE_LINK = canLink('file');
const DIR_LINK = canLink('dir');
const SKIP_FILE = FILE_LINK ? false : 'this box cannot create a file symlink (no privilege)';
const SKIP_DIR = DIR_LINK ? false : 'this box cannot create a directory link';

// home/outer/proj (the walk stops at the sandboxed home, never a real ancestor) + a separate OUTSIDE root.
function sandbox(t) {
  const home = mk();
  const outside = mk();
  const outer = path.join(home, 'outer');
  const proj = path.join(outer, 'proj');
  fs.mkdirSync(proj, { recursive: true });
  t.after(() => {
    fs.rmSync(home, { recursive: true, force: true });
    // the guard: removing the sandbox must never have followed a planted link into the outside root
    const survived = fs.existsSync(outside) && fs.readdirSync(outside).length > 0;
    fs.rmSync(outside, { recursive: true, force: true });
    assert.ok(survived, 'cleanup of the sandbox emptied the outside root: a link was followed');
  });
  return { home, outer, proj, outside };
}
const link = (target, at, type) => { fs.mkdirSync(path.dirname(at), { recursive: true }); fs.symlinkSync(target, at, type); };

function run(event, cwd, home, extra = {}) {
  const input = event === 'SessionStart' ? { hook_event_name: 'SessionStart' } : { hook_event_name: 'UserPromptSubmit', prompt: extra.prompt || '' };
  // hooks-safety.md section 7: the host exports these to every hook process, so a value inherited from the real session must never reach the test
  const env = { ...process.env, USERPROFILE: home, HOME: home, TEMP: home, TMP: home, TMPDIR: home };
  delete env.CLAUDE_PROJECT_DIR; delete env.CLAUDE_PLUGIN_ROOT; delete env.CLAUDE_PLUGIN_DATA; delete env.NODE_TEST_CONTEXT;
  const args = extra.preload ? ['--require', extra.preload, HOOK] : [HOOK];
  return spawnSync(process.execPath, args, { input: JSON.stringify(input), cwd, env, encoding: 'utf8', timeout: 20000 });
}
const start = (s, extra) => run('SessionStart', s.proj, s.home, extra);

// the refusal contract: exit 0, silent stderr, ONE line, the board contract still there, the notice names the file and the reason
function assertRefused(r, file) {
  assert.equal(r.status, 0);
  assert.equal(r.stderr, '');
  assert.ok(!r.stdout.includes('\n'), 'one line');
  assert.ok(r.stdout.includes(BOARD), 'refused config contributes nothing: the board contract is still announced');
  assert.ok(r.stdout.includes(`UNREADABLE: ${file} exists but is not a readable config (${REASON})`), `notice missing: ${r.stdout}`);
}
const phys = (p) => fs.realpathSync.native(p);

// ---- the read class: a link at a folder level -------------------------------------------------------------------------
test('a junction at <proj>/.claude to an outside folder is refused, nothing is read (canonical candidate)', { skip: SKIP_DIR }, (t) => {
  const s = sandbox(t);
  write(path.join(s.outside, 'agent', 'coal', 'coalboard.json'), QUIET);
  link(path.join(s.outside, 'agent'), path.join(s.proj, '.claude'), 'junction');
  assertRefused(start(s), path.join(phys(s.proj), '.claude', 'coal', 'coalboard.json'));
});

test('a junction at <proj>/.claude/coal to an outside folder is refused, nothing is read', { skip: SKIP_DIR }, (t) => {
  const s = sandbox(t);
  write(path.join(s.outside, 'coal', 'coalboard.json'), QUIET);
  fs.mkdirSync(path.join(s.proj, '.claude'));
  link(path.join(s.outside, 'coal'), path.join(s.proj, '.claude', 'coal'), 'junction');
  assertRefused(start(s), path.join(phys(s.proj), '.claude', 'coal', 'coalboard.json'));
});

test('a junction at <proj>/.agents is refused (the second agent dir has its own expected folder)', { skip: SKIP_DIR }, (t) => {
  const s = sandbox(t);
  write(path.join(s.outside, 'agent', 'coal', 'coalboard.json'), QUIET);
  link(path.join(s.outside, 'agent'), path.join(s.proj, '.agents'), 'junction');
  assertRefused(start(s), path.join(phys(s.proj), '.agents', 'coal', 'coalboard.json'));
});

test('a junction at <proj>/.claude whose outside folder holds the LEGACY nested file is refused', { skip: SKIP_DIR }, (t) => {
  const s = sandbox(t);
  write(path.join(s.outside, 'agent', '.coalboard.json'), QUIET);
  link(path.join(s.outside, 'agent'), path.join(s.proj, '.claude'), 'junction');
  assertRefused(start(s), path.join(phys(s.proj), '.claude', '.coalboard.json'));
});

test('a junction INSIDE the project but outside the expected folder is refused (the expected side is never re-resolved)', { skip: SKIP_DIR }, (t) => {
  const s = sandbox(t);
  fs.writeFileSync(path.join(s.outside, 'keep'), 'x');
  write(path.join(s.proj, 'elsewhere', 'coalboard.json'), QUIET);
  fs.mkdirSync(path.join(s.proj, '.claude'));
  link(path.join(s.proj, 'elsewhere'), path.join(s.proj, '.claude', 'coal'), 'junction');
  assertRefused(start(s), path.join(phys(s.proj), '.claude', 'coal', 'coalboard.json'));
});

test('a junction at <proj>/.claude to a folder inside the project holding the LEGACY file is refused (legacy 1 is held to <dir>/.claude)', { skip: SKIP_DIR }, (t) => {
  const s = sandbox(t);
  fs.writeFileSync(path.join(s.outside, 'keep'), 'x');
  write(path.join(s.proj, 'elsewhere', '.coalboard.json'), QUIET);
  link(path.join(s.proj, 'elsewhere'), path.join(s.proj, '.claude'), 'junction');
  assertRefused(start(s), path.join(phys(s.proj), '.claude', '.coalboard.json'));
});

test('a junction AT the candidate name to an outside DIRECTORY is refused as outside, not read as a directory', { skip: SKIP_DIR }, (t) => {
  const s = sandbox(t);
  fs.mkdirSync(path.join(s.outside, 'dir'));
  fs.writeFileSync(path.join(s.outside, 'dir', 'keep'), 'x');
  fs.mkdirSync(path.join(s.proj, '.claude', 'coal'), { recursive: true });
  link(path.join(s.outside, 'dir'), path.join(s.proj, '.claude', 'coal', 'coalboard.json'), 'junction');
  assertRefused(start(s), path.join(phys(s.proj), '.claude', 'coal', 'coalboard.json'));
});

test('a junction AT the candidate name to the parent of its folder (rel is ..) is refused as outside', { skip: SKIP_DIR }, (t) => {
  const s = sandbox(t);
  fs.writeFileSync(path.join(s.outside, 'keep'), 'x');
  fs.mkdirSync(path.join(s.proj, '.claude', 'coal'), { recursive: true });
  link(path.join(s.proj, '.claude'), path.join(s.proj, '.claude', 'coal', 'coalboard.json'), 'junction');
  assertRefused(start(s), path.join(phys(s.proj), '.claude', 'coal', 'coalboard.json'));
});

// ---- the read class: a link at the file --------------------------------------------------------------------------------
test('a file symlink at the canonical candidate to an outside file is refused', { skip: SKIP_FILE }, (t) => {
  const s = sandbox(t);
  write(path.join(s.outside, 'evil.json'), QUIET);
  link(path.join(s.outside, 'evil.json'), path.join(s.proj, '.claude', 'coal', 'coalboard.json'), 'file');
  assertRefused(start(s), path.join(phys(s.proj), '.claude', 'coal', 'coalboard.json'));
});

test('a file symlink at legacy 1 (<proj>/.claude/.coalboard.json) to an outside file is refused', { skip: SKIP_FILE }, (t) => {
  const s = sandbox(t);
  write(path.join(s.outside, 'evil.json'), QUIET);
  link(path.join(s.outside, 'evil.json'), path.join(s.proj, '.claude', '.coalboard.json'), 'file');
  assertRefused(start(s), path.join(phys(s.proj), '.claude', '.coalboard.json'));
});

test('a file symlink at legacy 2 (<proj>/.coalboard.json) to an outside file is refused', { skip: SKIP_FILE }, (t) => {
  const s = sandbox(t);
  write(path.join(s.outside, 'evil.json'), QUIET);
  link(path.join(s.outside, 'evil.json'), path.join(s.proj, '.coalboard.json'), 'file');
  assertRefused(start(s), path.join(phys(s.proj), '.coalboard.json'));
});

test('a file symlink at legacy 1 to a file INSIDE the project but outside <proj>/.claude is refused', { skip: SKIP_FILE }, (t) => {
  const s = sandbox(t);
  fs.writeFileSync(path.join(s.outside, 'keep'), 'x');
  write(path.join(s.proj, 'other.json'), QUIET);
  link(path.join(s.proj, 'other.json'), path.join(s.proj, '.claude', '.coalboard.json'), 'file');
  assertRefused(start(s), path.join(phys(s.proj), '.claude', '.coalboard.json'));
});

// ---- nothing from the outside target reaches a later event, and the walk keeps its selection --------------------------------
test('UserPromptSubmit: an outside config seeding a keyword does not fire the signal through a planted junction', { skip: SKIP_DIR }, (t) => {
  const s = sandbox(t);
  write(path.join(s.outside, 'agent', 'coal', 'coalboard.json'), KW);
  link(path.join(s.outside, 'agent'), path.join(s.proj, '.claude'), 'junction');
  const r = run('UserPromptSubmit', s.proj, s.home, { prompt: 'please frobnicate the thing' });
  assert.equal(r.status, 0);
  assert.equal(r.stderr, '');
  assert.equal(r.stdout, '', 'the outside keyword seed must not be read');
});

test('a refused winner keeps the walk\'s selection: the ancestor level is not consulted', { skip: SKIP_DIR }, (t) => {
  const s = sandbox(t);
  write(path.join(s.outside, 'agent', 'coal', 'coalboard.json'), QUIET);
  write(path.join(s.outer, '.claude', 'coal', 'coalboard.json'), QUIET); // a legit config one level up that WOULD silence the board
  link(path.join(s.outside, 'agent'), path.join(s.proj, '.claude'), 'junction');
  assertRefused(start(s), path.join(phys(s.proj), '.claude', 'coal', 'coalboard.json'));
});

// ---- unresolvable = refused ---------------------------------------------------------------------------------------------
test('a candidate whose realpath cannot be resolved is refused (fail closed)', (t) => {
  const s = sandbox(t);
  fs.writeFileSync(path.join(s.outside, 'keep'), 'x');
  write(path.join(s.proj, '.claude', 'coal', 'coalboard.json'), QUIET);
  const pre = path.join(s.outside, 'pre.cjs');
  fs.writeFileSync(pre, "const fs = require('fs'); const orig = fs.realpathSync.native; fs.realpathSync.native = function (p) { if (String(p).endsWith('coalboard.json')) { const e = new Error('planted'); e.code = 'EIO'; throw e; } return orig.apply(this, arguments); };");
  assertRefused(start(s, { preload: pre }), path.join(phys(s.proj), '.claude', 'coal', 'coalboard.json'));
});

// a candidate whose realpath is DENIED (EACCES, as an ACL gives) is still reported as unreadable when it is a real in-folder file,
// and is refused when it is a link: the fallback resolves the directory and lstat-checks the file.
const EACCES_PRE = "const fs = require('fs'); const orig = fs.realpathSync.native; fs.realpathSync.native = function (p) { if (String(p).endsWith('coalboard.json')) { const e = new Error('denied'); e.code = 'EACCES'; throw e; } return orig.apply(this, arguments); };";
test('a real in-folder file whose realpath is denied (EACCES) is NOT called outside: it falls to the normal read', (t) => {
  const s = sandbox(t);
  fs.writeFileSync(path.join(s.outside, 'keep'), 'x');
  write(path.join(s.proj, '.claude', 'coal', 'coalboard.json'), QUIET);
  const pre = path.join(s.outside, 'pre.cjs');
  fs.writeFileSync(pre, EACCES_PRE);
  const r = start(s, { preload: pre });
  assert.equal(r.status, 0);
  assert.ok(!r.stdout.includes(REASON), r.stdout);
  assert.ok(!r.stdout.includes(BOARD), 'the readable in-folder config was read (it silences the board)');
});

test('a LINK at the candidate whose realpath is denied (EACCES) is refused as outside', { skip: SKIP_DIR }, (t) => {
  const s = sandbox(t);
  fs.mkdirSync(path.join(s.outside, 'dir'));
  fs.writeFileSync(path.join(s.outside, 'dir', 'keep'), 'x');
  fs.mkdirSync(path.join(s.proj, '.claude', 'coal'), { recursive: true });
  link(path.join(s.outside, 'dir'), path.join(s.proj, '.claude', 'coal', 'coalboard.json'), 'junction');
  const pre = path.join(s.outside, 'pre.cjs');
  fs.writeFileSync(pre, EACCES_PRE);
  assertRefused(start(s, { preload: pre }), path.join(phys(s.proj), '.claude', 'coal', 'coalboard.json'));
});

test('a denied-realpath file inside a junctioned folder is refused (the fallback resolves the directory, not the lexical path)', { skip: SKIP_DIR }, (t) => {
  const s = sandbox(t);
  write(path.join(s.outside, 'agent', 'coal', 'coalboard.json'), QUIET);
  link(path.join(s.outside, 'agent'), path.join(s.proj, '.claude'), 'junction');
  const pre = path.join(s.outside, 'pre2.cjs');
  fs.writeFileSync(pre, EACCES_PRE);
  assertRefused(start(s, { preload: pre }), path.join(phys(s.proj), '.claude', 'coal', 'coalboard.json'));
});

test('a denied-realpath file whose directory also cannot be resolved is refused (the outer fail-closed catch)', (t) => {
  const s = sandbox(t);
  fs.writeFileSync(path.join(s.outside, 'keep'), 'x');
  write(path.join(s.proj, '.claude', 'coal', 'coalboard.json'), QUIET);
  const pre = path.join(s.outside, 'pre3.cjs');
  fs.writeFileSync(pre, "const fs = require('fs'); const path = require('path'); const orig = fs.realpathSync.native; fs.realpathSync.native = function (p) { const q = String(p); if (q.endsWith('coalboard.json') || q.endsWith(path.sep + 'coal')) { const e = new Error('denied'); e.code = q.endsWith('coalboard.json') ? 'EACCES' : 'EIO'; throw e; } return orig.apply(this, arguments); };");
  assertRefused(start(s, { preload: pre }), path.join(phys(s.proj), '.claude', 'coal', 'coalboard.json'));
});

// MEDIUM-1 / M8: across drives path.relative returns an ABSOLUTE path, which the lexical prefix tests alone would accept. The leg needs no second
// volume: a preload makes realpath.native answer an other-drive path for the candidate. Keyed on the CAPABILITY (this path module returns an absolute
// path across two drive roots), never on process.platform; elsewhere it t.skips visibly.
const CROSS_DRIVE = path.isAbsolute(path.relative('C:' + String.fromCharCode(92) + 'a', 'D:' + String.fromCharCode(92) + 'b'));
test('a candidate whose realpath is on ANOTHER drive is refused (path.relative returns an absolute path)', { skip: CROSS_DRIVE ? false : 'path.relative does not return an absolute path across drive roots here' }, (t) => {
  const s = sandbox(t);
  fs.writeFileSync(path.join(s.outside, 'keep'), 'x');
  write(path.join(s.proj, '.claude', 'coal', 'coalboard.json'), QUIET);
  const pre = path.join(s.outside, 'pre-xvol.cjs');
  fs.writeFileSync(pre, "const fs = require('fs'); const path = require('path'); const orig = fs.realpathSync.native; const here = path.parse(orig(process.cwd())).root.slice(0, 2).toUpperCase(); const other = here === 'D:' ? 'C:' : 'D:'; fs.realpathSync.native = function (p) { if (String(p).endsWith('coalboard.json')) return other + path.sep + 'cb-xvol' + path.sep + 'coalboard.json'; return orig.apply(this, arguments); };");
  assertRefused(start(s, { preload: pre }), path.join(phys(s.proj), '.claude', 'coal', 'coalboard.json'));
});

// M7 / LOW-3: a junction AT the file name pointing to its OWN folder has rel === '' and is refused AS OUTSIDE (the reason text), not read as a directory.
test('a junction AT the candidate name pointing at its own folder is refused as outside, with the reason text (rel is empty)', { skip: SKIP_DIR }, (t) => {
  const s = sandbox(t);
  fs.writeFileSync(path.join(s.outside, 'keep'), 'x');
  fs.mkdirSync(path.join(s.proj, '.claude', 'coal'), { recursive: true });
  link(path.join(s.proj, '.claude', 'coal'), path.join(s.proj, '.claude', 'coal', 'coalboard.json'), 'junction');
  assertRefused(start(s), path.join(phys(s.proj), '.claude', 'coal', 'coalboard.json'));
});

// ---- controls (pass before and after): a real config in every read-order shape is still read ---------------------------------
const SHAPES = [
  ['canonical .claude/coal/coalboard.json', ['.claude', 'coal', 'coalboard.json'], false],
  ['canonical .agents/coal/coalboard.json', ['.agents', 'coal', 'coalboard.json'], false],
  ['canonical .gemini/coal/coalboard.json', ['.gemini', 'coal', 'coalboard.json'], false],
  ['legacy 1 .claude/.coalboard.json', ['.claude', '.coalboard.json'], true],
  ['legacy 2 .coalboard.json', ['.coalboard.json'], true],
];
for (const [name, rel, legacy] of SHAPES) {
  test(`control: a real ${name} is still read (no board line, no refusal)`, (t) => {
    const s = sandbox(t);
    fs.writeFileSync(path.join(s.outside, 'keep'), 'x');
    write(path.join(s.proj, ...rel), QUIET);
    const r = start(s);
    assert.equal(r.status, 0);
    assert.equal(r.stderr, '');
    assert.ok(!r.stdout.includes(BOARD), `the config was not read: ${r.stdout}`);
    assert.ok(!r.stdout.includes(REASON), 'a real config must not be refused');
    assert.equal(r.stdout.includes('LEGACY config read'), legacy);
  });
}

// ---- the prose half (SKILL.md's on-disk ledger): a MITIGATION the agent follows, anchored so deletion or drift fails loud.
// An anchor catches deletion and reword, never reversal (verify.mjs / clamp-prose style); the rule's strength is prose, not a guarantee.
for (const [label, rel] of [['source', ['skills', 'coalboard', 'SKILL.md']], ['dist', ['plugin', 'skills', 'coalboard', 'SKILL.md']]]) {
  test(`SKILL.md (${label}) carries the link rule for .coalboard/ reads, writes and deletes and the by-name memory cleanup`, () => {
    // 28b: the anchors follow the text into the load set of the same tree (SKILL.md, references/steps.md, references/rails.md), source or dist alike.
    const base = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', ...rel.slice(0, -1));
    const body = ['SKILL.md', 'references/steps.md', 'references/rails.md'].map((f) => fs.readFileSync(path.join(base, f), 'utf8')).join('\n');
    for (const anchor of ['a mitigation you follow, never a guarantee', 'before the first read, write or delete under', 'resolve `<project root>` to its real path', 'AT or BELOW `<project root>/.coalboard`', 'never one taken from a link', 'touch NOTHING and tell the user', 'then `rmdir` (never recursive)', 'remove the files THIS run created there, by name, then `rmdir` the directory only if it is a real directory and not a link', 'never `rm -r`, never a trailing-slash or `*` remove', '(removed by name)', 'if `rmdir` refuses, leave the directory and say so', 'node scripts/apply-target.mjs <project root> <each target>', 'a REFUSE target (one of four reasons: a link, outside the project, unresolvable, or `name`, a trailing dot or space or a drive prefix)', 'so "apply all" never covers it', 'write only OK targets', 'a local process that plants a link in that gap is outside what the check stops','write NO live file and courier the fixes']) {
      assert.ok(body.includes(anchor), `missing anchor: ${anchor}`);
    }
  });
}
