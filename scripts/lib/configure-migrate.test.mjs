// The legacy-config migration (BB-533, signed 2026-11-21): configure.mjs writes the new home, then MOVES the legacy file aside with ONE rename to
// <legacy>.bak, reads the backup back and compares it with the text the seed read. It removes nothing. These legs spawn the REAL scripts/configure.mjs
// from a temp project. A preload (--import) makes the one thing that can go wrong at each step happen on purpose, by MODE:
//   none            no interference: the move, the read-back and the one line (legs B, the earlier-backup leg, the malformed leg, the git legs)
//   window          bytes appended to the legacy file after its last look and before the rename (W-c1: the study's witness; the old delete form lost them)
//   replace         a same-size replacement of the legacy file in the same window (leg A, replace)
//   writer-after    a writer appends to the backup right after the rename, before the read-back (W-b1's shape)
//   refuse          the rename throws EBUSY (W-b2: a held file)
//   unchecked       the rename throws EPERM and the lstat of the legacy path then throws EACCES (M1: the state cannot be checked)
//   gone            another actor moves the legacy file away, then the rename throws ENOENT (F1: a failed rename does not prove the source is there)
//   bak-unreadable  the backup cannot be opened for the read-back
// Zero deps. Each run works in one temp root made here (sandbox HOME, USERPROFILE, TEMP, TMP, TMPDIR), removed only by its own name after its real
// path is checked under the real temp root. One child at a time, under a heap cap and a kill-timeout. Every spawn carries a timeout.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gitEnv } from './git-env.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CONFIGURE = path.join(HERE, '..', 'configure.mjs');
const CHILD_TIMEOUT_MS = 60000;
const HEAP_MB = 512;
const LEGACY_TEXT = '{"rigor":"standard"}\n';
const SAME_SIZE_TEXT = '{"rigor":"nasa"}    \n'; // the same byte length, different bytes
const MARKER = '// WRITTEN-IN-WINDOW\n';
const SHAPES = [['root .coalboard.json', ['.coalboard.json']], ['nested .claude/.coalboard.json', ['.claude', '.coalboard.json']]];

const PRELOAD = `import fs from 'node:fs';
import path from 'node:path';
import { syncBuiltinESMExports } from 'node:module';
// Both sides by real path: the runner's 8.3 TEMP spelling and the long spelling name one file (CWK-125).
const real = (p) => { try { return fs.realpathSync.native(p); } catch { return path.resolve(p); } };
const LEGACY = real(process.env.CB_LEGACY);
const BAK = LEGACY + '.bak';
const NEW = process.env.CB_NEW;
const MODE = process.env.CB_WITNESS_MODE;
const MARKER = '// WRITTEN-IN-WINDOW\\n';
const origLstat = fs.lstatSync;
const origRename = fs.renameSync;
const origOpen = fs.openSync;
const origWrite = fs.writeFileSync;
const isLegacy = (p) => typeof p === 'string' && real(p) === LEGACY;
const isBak = (p) => typeof p === 'string' && real(p) === BAK;
const note = (m) => process.stderr.write('[witness] ' + m + '\\n');
let fired = false;
let blockBak = false;
let lstatBlock = false;
// window: the migration's last look at the legacy name is its lstat after the new home exists (the old delete's residual window); the append lands after it.
fs.lstatSync = function (p, ...rest) {
  if (lstatBlock && isLegacy(p)) { const e = new Error('EACCES: permission denied, lstat'); e.code = 'EACCES'; throw e; }
  const out = origLstat.call(this, p, ...rest);
  if (MODE === 'window' && !fired && isLegacy(p) && fs.existsSync(NEW)) {
    fired = true;
    fs.appendFileSync(LEGACY, MARKER);
    note('changed the legacy config after its last look');
  }
  return out;
};
fs.renameSync = function (from, to, ...rest) {
  if (isLegacy(from) && !fired) {
    if (MODE === 'window') { fired = true; fs.appendFileSync(LEGACY, MARKER); note('changed the legacy config before the move'); }
    if (MODE === 'replace') {
      fired = true;
      const tmp = LEGACY + '.witness-tmp';
      origWrite.call(fs, tmp, process.env.CB_WITNESS_REPLACE);
      origRename.call(fs, tmp, LEGACY);
      note('replaced the legacy config before the move');
    }
    if (MODE === 'refuse') { fired = true; const e = new Error('EBUSY: resource busy or locked, rename'); e.code = 'EBUSY'; throw e; }
    if (MODE === 'unchecked') { fired = true; lstatBlock = true; const e = new Error('EPERM: operation not permitted, rename'); e.code = 'EPERM'; throw e; }
    if (MODE === 'gone') {
      fired = true;
      origRename.call(fs, LEGACY, LEGACY + '.elsewhere');
      const e = new Error('ENOENT: no such file or directory, rename'); e.code = 'ENOENT'; throw e;
    }
  }
  const out = origRename.call(this, from, to, ...rest);
  if (isLegacy(from) && MODE === 'writer-after' && !fired) { fired = true; fs.appendFileSync(to, MARKER); note('wrote the backup after the move'); }
  if (isLegacy(from) && MODE === 'bak-unreadable') blockBak = true;
  return out;
};
fs.openSync = function (p, ...rest) {
  if (blockBak && isBak(p)) { const e = new Error('EACCES: permission denied, open'); e.code = 'EACCES'; throw e; }
  return origOpen.call(this, p, ...rest);
};
syncBuiltinESMExports();
`;

// Removes only the folder sandbox() made, after its real path is checked to sit strictly inside the real temp root.
function removeRoot(root) {
  const tmpReal = fs.realpathSync.native(os.tmpdir());
  const rootReal = fs.realpathSync.native(root);
  const rel = path.relative(tmpReal, rootReal);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel) || !path.basename(rootReal).startsWith('cb-migrate-')) {
    throw new Error(`refusing to remove ${rootReal}: not a cb-migrate- folder under ${tmpReal}`);
  }
  fs.rmSync(rootReal, { recursive: true, force: true });
}

// The cleanup is registered on the line after the root exists, before anything else can throw (scripts-quality §2).
function sandbox(t) {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'cb-migrate-')));
  t.after(() => removeRoot(root));
  const home = path.join(root, 'home');
  const proj = path.join(home, 'proj');
  const tmp = path.join(root, 'tmp');
  fs.mkdirSync(proj, { recursive: true });
  fs.mkdirSync(tmp, { recursive: true });
  return { root, home, proj, tmp, newCfg: path.join(proj, '.claude', 'coal', 'coalboard.json') };
}

function legacyAt(sb, rel, text = LEGACY_TEXT) {
  const p = path.join(sb.proj, ...rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text);
  return p;
}

// One run of the real CLI from the temp project, with the preload MODE. Returns the child, its combined output and the backup's path.
function migrate(sb, legacy, mode = 'none') {
  const preload = path.join(sb.root, 'preload.mjs');
  fs.writeFileSync(preload, PRELOAD);
  const env = {};
  for (const k of ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'ComSpec', 'PATHEXT']) if (process.env[k] !== undefined) env[k] = process.env[k];
  Object.assign(env, {
    HOME: sb.home, USERPROFILE: sb.home, TEMP: sb.tmp, TMP: sb.tmp, TMPDIR: sb.tmp,
    CB_LEGACY: legacy, CB_NEW: sb.newCfg, CB_WITNESS_MODE: mode, CB_WITNESS_REPLACE: SAME_SIZE_TEXT,
  });
  const r = spawnSync(process.execPath, [`--max-old-space-size=${HEAP_MB}`, '--import', pathToFileURL(preload).href, CONFIGURE, '--rigor', 'high'], {
    cwd: sb.proj, env, encoding: 'utf8', timeout: CHILD_TIMEOUT_MS, killSignal: 'SIGKILL',
  });
  assert.equal(r.error, undefined, `spawn failed: ${r.error}`);
  return { r, out: `${r.stdout}\n${r.stderr}`, bak: legacy + '.bak' };
}

const read = (p) => fs.readFileSync(p, 'utf8');

// ---- W-c1: the study's witness (CoalFace 4a01c31 was red on it; the old delete lost the appended bytes with the file, exit 0).
for (const [label, rel] of SHAPES) {
  test(`W-c1 window (${label}): bytes appended after the last look and before the move are kept in <legacy>.bak, named in one warning, exit 1`, (t) => {
    const sb = sandbox(t);
    const legacy = legacyAt(sb, rel);
    const { r, out, bak } = migrate(sb, legacy, 'window');
    assert.match(r.stderr, /\[witness\] changed the legacy config/, `the preload never fired: ${out}`);
    assert.equal(r.status, 1, `exit 1 expected: ${out}`);
    assert.equal(fs.existsSync(legacy), false, `the legacy name is gone, the file was moved: ${out}`);
    assert.ok(read(bak).includes(MARKER), `the appended bytes are in the backup: ${out}`);
    assert.ok(/^Warning: /m.test(r.stderr) && r.stderr.includes(bak) && r.stderr.includes(sb.newCfg), `the warning names both files: ${out}`);
    assert.ok(/changed after this migration read it/.test(r.stderr), `the warning says when the change landed, not "after the move": ${out}`);
    assert.ok(!/written after the move/.test(out), out);
    assert.ok(!/Migrated the project config/.test(out), `no success line: ${out}`);
    assert.equal(JSON.parse(read(sb.newCfg)).rigor, 'high', 'the new home is written');
  });
}

for (const [label, rel] of SHAPES) {
  test(`W-c1 replace (${label}): a same-size replacement made before the move is in the backup, named in one warning, exit 1`, (t) => {
    const sb = sandbox(t);
    const legacy = legacyAt(sb, rel);
    const { r, out, bak } = migrate(sb, legacy, 'replace');
    assert.match(r.stderr, /\[witness\] replaced the legacy config/, `the preload never fired: ${out}`);
    assert.equal(r.status, 1, out);
    assert.equal(read(bak), SAME_SIZE_TEXT, `the backup holds the replaced bytes: ${out}`);
    assert.ok(/^Warning: /m.test(r.stderr) && r.stderr.includes(bak) && r.stderr.includes(sb.newCfg), `the warning names both files: ${out}`);
  });
}

// ---- Leg B: no change. The one line names the new home, the backup and that there was none before.
for (const [label, rel] of SHAPES) {
  test(`leg B (${label}): an unchanged legacy config is moved to <legacy>.bak with one line naming it (no earlier backup), exit 0`, (t) => {
    const sb = sandbox(t);
    const legacy = legacyAt(sb, rel);
    const { r, out, bak } = migrate(sb, legacy, 'none');
    assert.equal(r.status, 0, out);
    assert.equal(fs.existsSync(legacy), false, `the legacy name is gone, the file was moved: ${out}`);
    assert.equal(read(bak), LEGACY_TEXT, 'the backup holds the moved bytes');
    assert.match(r.stdout, new RegExp(`Migrated the project config to .*; the old file is kept as .*\\.coalboard\\.json\\.bak \\(no earlier backup\\)\\.`), out);
    assert.equal(r.stderr.trim(), '', `nothing on stderr: ${out}`);
    assert.equal(JSON.parse(read(sb.newCfg)).rigor, 'high');
  });
}

test('an earlier backup is replaced, and the run says so', (t) => {
  const sb = sandbox(t);
  const legacy = legacyAt(sb, ['.coalboard.json']);
  fs.writeFileSync(legacy + '.bak', 'OLD BACKUP\n');
  const { r, out, bak } = migrate(sb, legacy, 'none');
  assert.equal(r.status, 0, out);
  assert.ok(out.includes('(replaced an earlier backup)'), `the run says it replaced one: ${out}`);
  assert.equal(read(bak), LEGACY_TEXT, 'the backup now holds the migrated legacy bytes');
});

test('a malformed legacy config is copied, then moved: one backup, and the run says there was no earlier one', (t) => {
  const sb = sandbox(t);
  const legacy = legacyAt(sb, ['.coalboard.json'], '{ not json\n');
  const { r, out, bak } = migrate(sb, legacy, 'none');
  assert.equal(r.status, 1, `malformed config exits 1: ${out}`);
  assert.equal(read(bak), '{ not json\n', 'the backup holds the malformed bytes once');
  assert.equal(fs.existsSync(legacy), false, 'the legacy name is gone');
  assert.ok(out.includes('(no earlier backup)'), `the copy made before the move is not reported as an earlier backup: ${out}`);
});

// ---- W-b1 shape: a writer after the move. The read-back sees a change the new home lacks, so the run names both files.
test('a writer that writes the backup after the move (before the read-back) is named in one warning, exit 1', (t) => {
  const sb = sandbox(t);
  const legacy = legacyAt(sb, ['.coalboard.json']);
  const { r, out, bak } = migrate(sb, legacy, 'writer-after');
  assert.equal(r.status, 1, out);
  assert.ok(read(bak).includes(MARKER), `the late bytes are in the backup: ${out}`);
  assert.ok(/^Warning: /m.test(r.stderr) && r.stderr.includes(bak) && r.stderr.includes(sb.newCfg), `the warning names both files: ${out}`);
  assert.ok(!/Migrated the project config/.test(out), out);
});

// ---- W-b2: a refused move. Reported with its code, the legacy file kept byte for byte, no backup, no success line, no retry.
test('a refused move (EBUSY) keeps the legacy file byte for byte, makes no backup, exits 1, names the code and prints no success line', (t) => {
  const sb = sandbox(t);
  const legacy = legacyAt(sb, ['.coalboard.json']);
  const { r, out, bak } = migrate(sb, legacy, 'refuse');
  assert.equal(r.status, 1, out);
  assert.ok(r.stderr.includes('EBUSY') && /kept at /.test(r.stderr), `the code is named and the file is said kept: ${out}`);
  assert.equal(read(legacy), LEGACY_TEXT, 'the legacy bytes are where they were');
  assert.equal(fs.existsSync(bak), false, 'no backup was made');
  assert.ok(!/Migrated the project config/.test(out), out);
});

// ---- M1: the move is refused AND the lstat that would say where the file is also fails (EACCES, not ENOENT). The file is still there, but the run
// cannot say so from the name alone: it must say the state could not be checked, never "no longer at that path", and exit 1.
test('a refused move whose re-check also fails (EPERM, then lstat EACCES) says the state could not be checked, never "no longer at that path"; the legacy file still exists; exit 1', (t) => {
  const sb = sandbox(t);
  const legacy = legacyAt(sb, ['.coalboard.json']);
  const { r, out, bak } = migrate(sb, legacy, 'unchecked');
  assert.equal(r.status, 1, out);
  assert.ok(/its state could not be checked \(EACCES\)/.test(r.stderr), `the third state is said, with its code: ${out}`);
  assert.ok(!/no longer at that path/.test(out), `never read a failed lstat as absence: ${out}`);
  assert.ok(fs.existsSync(legacy), 'the legacy file is still there');
  assert.equal(read(legacy), LEGACY_TEXT, 'the legacy bytes are where they were');
  assert.equal(fs.existsSync(bak), false, 'no backup was made');
  assert.ok(!/Migrated the project config/.test(out), out);
});

// ---- F1: the source is not there after a failed rename. The run says so, and never says "kept".
test('the source moved away mid-run (ENOENT) is reported as no longer at that path: no "kept", exit 1, no success line, the moved bytes exist', (t) => {
  const sb = sandbox(t);
  const legacy = legacyAt(sb, ['.coalboard.json']);
  const { r, out } = migrate(sb, legacy, 'gone');
  assert.equal(r.status, 1, out);
  assert.ok(r.stderr.includes('ENOENT') && /no longer at that path/.test(r.stderr), `the move is reported as failed with where the file is: ${out}`);
  assert.ok(!/\bkept\b/i.test(out), `no "kept" when the name is gone: ${out}`);
  assert.ok(!/Migrated the project config/.test(out), out);
  assert.equal(read(legacy + '.elsewhere'), LEGACY_TEXT, 'the other actor moved the bytes, and they still exist');
});

// ---- A backup that cannot be read back is unchecked: exit 1, no success line, the moved bytes stay in the backup.
test('a backup that cannot be read back is said to be unchecked: exit 1, no success line, the moved bytes stay in the backup', (t) => {
  const sb = sandbox(t);
  const legacy = legacyAt(sb, ['.coalboard.json']);
  const { r, out, bak } = migrate(sb, legacy, 'bak-unreadable');
  assert.equal(r.status, 1, out);
  assert.ok(/could not be read back/.test(r.stderr), `the run says it is unchecked: ${out}`);
  assert.equal(read(bak), LEGACY_TEXT, 'the moved bytes are still in the backup');
  assert.ok(!/Migrated the project config/.test(out), out);
});

// ---- A null seed moves nothing: the legacy path is there but cannot be read as a file. The new home is written as before; exit 1.
test('a null seed moves nothing: the legacy path cannot be read as a file, exit 1, the path stays in place, no backup', (t) => {
  const sb = sandbox(t);
  const legacy = path.join(sb.proj, '.coalboard.json');
  fs.mkdirSync(legacy);
  const { r, out, bak } = migrate(sb, legacy, 'none');
  assert.equal(r.status, 1, out);
  assert.ok(/could not be read at the start, so nothing was moved/.test(r.stderr), `the run says nothing was moved: ${out}`);
  assert.ok(fs.statSync(legacy).isDirectory(), 'the legacy path is still where it was');
  assert.equal(fs.existsSync(bak), false, 'no backup was made');
  assert.equal(JSON.parse(read(sb.newCfg)).rigor, 'high', 'the new home is written as before');
});

// ---- git: the git answer is asked before the move and reported after it. Git-free machines skip these visibly.
const gitOk = spawnSync('git', ['--version'], { encoding: 'utf8', timeout: 20000, env: gitEnv() }).status === 0;
// The git children get gitEnv() (GIT_* stripped, the ceiling at the sandbox root) and the sandbox HOME/TEMP keys (the git-spawn census reads this literal).
const gitIn = (sb, ...args) => spawnSync('git', args, {
  cwd: sb.proj, encoding: 'utf8', timeout: 20000,
  env: { ...gitEnv(sb.root), HOME: sb.home, USERPROFILE: sb.home, TMPDIR: sb.tmp, TMP: sb.tmp, TEMP: sb.tmp },
});

test('a git-TRACKED legacy config is moved; the run says to commit its removal, and the backup is named as untracked', (t) => {
  if (!gitOk) { t.skip('git is not on PATH (visible skip: the tracked sentence cannot be built here)'); return; }
  const sb = sandbox(t);
  const legacy = legacyAt(sb, ['.coalboard.json']);
  assert.equal(gitIn(sb, 'init', '--quiet').status, 0);
  assert.equal(gitIn(sb, 'add', '--', '.coalboard.json').status, 0);
  const { r, out, bak } = migrate(sb, legacy, 'none');
  assert.equal(r.status, 0, out);
  assert.ok(out.includes(`${legacy} is tracked by git: commit its removal (git add -A -- ${legacy}).`), `the commit step is named: ${out}`);
  assert.ok(out.includes(`${bak} is untracked and yours to keep or delete.`), `the backup is named as the user's: ${out}`);
  assert.equal(fs.existsSync(legacy), false, 'the tracked file is moved, not deleted');
  assert.equal(read(bak), LEGACY_TEXT, 'the backup holds its bytes');
});

test('a git-UNTRACKED legacy config inside a repository is moved, and git says nothing about it', (t) => {
  if (!gitOk) { t.skip('git is not on PATH (visible skip)'); return; }
  const sb = sandbox(t);
  const legacy = legacyAt(sb, ['.coalboard.json']);
  assert.equal(gitIn(sb, 'init', '--quiet').status, 0);
  const { r, out, bak } = migrate(sb, legacy, 'none');
  assert.equal(r.status, 0, out);
  assert.ok(!/tracked by git|could not say/.test(out), `no git sentence for an untracked file: ${out}`);
  assert.equal(read(bak), LEGACY_TEXT, 'the backup holds the moved bytes');
});

test('inside a repository git cannot answer (a broken .git file): the run says git could not say, and still moves the file aside', (t) => {
  const sb = sandbox(t);
  const legacy = legacyAt(sb, ['.coalboard.json']);
  fs.writeFileSync(path.join(sb.proj, '.git'), 'gitdir: ' + path.join(sb.root, 'nowhere') + '\n');
  const { r, out, bak } = migrate(sb, legacy, 'none');
  assert.equal(r.status, 0, out);
  assert.ok(out.includes(`git could not say whether ${legacy} is tracked`), `the unknown answer is said: ${out}`);
  assert.equal(fs.existsSync(legacy), false, 'the file is moved');
  assert.equal(read(bak), LEGACY_TEXT, 'the backup holds its bytes');
});
