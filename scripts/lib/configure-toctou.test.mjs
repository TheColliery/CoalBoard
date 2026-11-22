// The check-then-use window in the config reader (29nh T, the reader study 29nh-1 T YES; main's ruling c195 1). The reader checked a NAME (existsSync,
// lstat) and then opened it BY NAME: a file swapped in between was read and written into the project. The fix walks the folder chain from the project
// root by lstat BEFORE the open (a link or junction in the chain refuses, nothing is opened), lstats the target as bigint, opens, then fstats the handle
// as bigint and compares dev and ino with that lstat: a mismatch closes the handle and refuses, fail closed. The seam is the reviewer's: a preload
// reassigns fs.openSync so that, on the FIRST open of the config path, the name is swapped (rm, then a hard link to a victim file) just before the real
// open. No privilege needed. Legs: (1) swapped to a file OUTSIDE the project, (2) swapped to another file INSIDE the project, (3) a junction (Windows) or
// a directory link (POSIX) in the folder chain: the outside file must not be opened at all.
// Each leg spawns the REAL scripts/configure.mjs from a temp project under one temp root made here, removed by its own name after its real path is checked
// under the real temp root. One child at a time, under a heap cap and a kill-timeout. Every spawn carries a timeout.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CONFIGURE = path.join(HERE, '..', 'configure.mjs');
const CHILD_TIMEOUT_MS = 60000;
const HEAP_MB = 512;
const TEMP_ROOT_PREFIX = 'cb-toctou-';
const OWN = '{"rigor":"standard","coalboardMode":"ask"}\n';
const VICTIM = '{"rigor":"standard","coalboardMode":"off"}\n';

// The seam: on the first open of A_TARGET, swap the name to a hard link to A_VICTIM. Logs an open that lands under A_OUTSIDE (the realpath compare).
const PRELOAD = `import fs from 'node:fs';
import path from 'node:path';
import { syncBuiltinESMExports } from 'node:module';
const real = (p) => { try { return fs.realpathSync.native(p); } catch { return path.resolve(String(p)); } };
const T = process.env.A_TARGET ? path.resolve(process.env.A_TARGET) : '';
const V = process.env.A_VICTIM || '';
const OUT = process.env.A_OUTSIDE ? real(process.env.A_OUTSIDE) : '';
const oOpen = fs.openSync;
let fired = false;
fs.openSync = function (p, ...rest) {
  if (V && !fired && path.resolve(String(p)) === T) {
    fired = true; fs.rmSync(T); fs.linkSync(V, T);
    process.stderr.write('[swap] the name was swapped before the open\\n');
  }
  if (OUT) { const r = real(p); if (r === OUT || r.startsWith(OUT + path.sep)) process.stderr.write('[open-outside] ' + path.basename(r) + '\\n'); }
  return oOpen.call(fs, p, ...rest);
};
syncBuiltinESMExports();
`;

// Removes one temp root this file made: only a directory named with this prefix, directly under the real temp folder, after its real path is checked.
function removeRoot(root) {
  const realTemp = fs.realpathSync.native(os.tmpdir());
  const real = fs.realpathSync.native(root);
  if (path.dirname(real) !== realTemp || !path.basename(real).startsWith(TEMP_ROOT_PREFIX)) {
    throw new Error(`refusing to remove ${real}: it is not a temp root this test made`);
  }
  fs.rmSync(real, { recursive: true, force: true });
}

function sandbox(t) {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), TEMP_ROOT_PREFIX)));
  t.after(() => removeRoot(root));
  const home = path.join(root, 'home');
  const proj = path.join(home, 'proj');
  const tmp = path.join(root, 'tmp');
  const outside = path.join(root, 'outside');
  for (const d of [proj, tmp, outside]) fs.mkdirSync(d, { recursive: true });
  const cfg = path.join(proj, '.claude', 'coal', 'coalboard.json');
  fs.mkdirSync(path.dirname(cfg), { recursive: true });
  fs.writeFileSync(cfg, OWN);
  return { root, home, proj, tmp, outside, cfg };
}

// One run of the real CLI with the seam preloaded. Extra variables name the target, the victim and (leg 3) the outside folder.
function runWithSwap(sb, extra) {
  const preload = path.join(sb.root, 'preload.mjs');
  fs.writeFileSync(preload, PRELOAD);
  const env = {};
  for (const k of ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'ComSpec', 'PATHEXT']) if (process.env[k] !== undefined) env[k] = process.env[k];
  Object.assign(env, { HOME: sb.home, USERPROFILE: sb.home, TEMP: sb.tmp, TMP: sb.tmp, TMPDIR: sb.tmp }, extra);
  const r = spawnSync(process.execPath, [`--max-old-space-size=${HEAP_MB}`, '--import', pathToFileURL(preload).href, CONFIGURE, '--rigor', 'high'], {
    cwd: sb.proj, env, encoding: 'utf8', timeout: CHILD_TIMEOUT_MS, killSignal: 'SIGKILL',
  });
  assert.equal(r.error, undefined, `spawn failed: ${r.error}`);
  return r;
}

const read = (p) => fs.readFileSync(p, 'utf8');

// Assertions shared by the swap legs: refused by name, exit 1, nothing written, the file the tool was pointed at keeps the bytes the swap gave it
// (the tool wrote nothing through it), and no temp file is left beside it.
function assertRefusedNothingWritten(r, sb, cfgBytes, victimPath) {
  assert.equal(r.status, 1, `exit ${r.status}: ${r.stdout}\n${r.stderr}`);
  assert.match(r.stderr, /changed while it was being read; nothing was written/, r.stderr);
  assert.doesNotMatch(r.stdout, /Successfully updated/, 'the run did not report success');
  assert.equal(read(sb.cfg), cfgBytes, 'the config path holds the bytes the swap gave it: nothing was written through it');
  if (victimPath) assert.equal(read(victimPath), VICTIM, 'the swapped-in victim file keeps its bytes');
  for (const name of fs.readdirSync(path.dirname(sb.cfg))) {
    assert.ok(!name.endsWith('.tmp') && !name.endsWith('.bak'), `nothing was written beside the config: found ${name}`);
  }
}

// ---- Leg 1: the name is swapped to a file OUTSIDE the project between the check and the open. The old reader read the outside file and wrote its
// coalboardMode into the project. The fixed reader opens the handle, sees its dev and ino differ from the lstat, and refuses.
test('T leg 1: a config swapped for a file OUTSIDE the project between its check and its open is refused, nothing read into the project, exit 1', (t) => {
  const sb = sandbox(t);
  const victim = path.join(sb.outside, 'victim.json');
  fs.writeFileSync(victim, VICTIM);
  const r = runWithSwap(sb, { A_TARGET: sb.cfg, A_VICTIM: victim });
  assertRefusedNothingWritten(r, sb, VICTIM, victim);
});

// ---- Leg 2: the same swap to ANOTHER file INSIDE the project: the compare refuses it too (a different inode, never the file the lstat named).
test('T leg 2: a config swapped for another file INSIDE the project between its check and its open is refused, nothing read into the project, exit 1', (t) => {
  const sb = sandbox(t);
  const other = path.join(sb.proj, 'other.json');
  fs.writeFileSync(other, VICTIM);
  const r = runWithSwap(sb, { A_TARGET: sb.cfg, A_VICTIM: other });
  assertRefusedNothingWritten(r, sb, VICTIM, other);
});

// ---- Leg 3: a junction (Windows) or directory link (POSIX) in the folder chain. The chain is walked by lstat BEFORE the open, so the outside file must
// not be opened at all (the old reader opened it once and refused only at the write).
test('T leg 3: a junction or directory link in the folder chain refuses before any open of the outside file, exit 1', (t) => {
  const sb = sandbox(t);
  // The legacy shape: proj/.claude is a link to outside/claude, which holds the legacy .coalboard.json. No canonical config is made here.
  fs.rmSync(path.join(sb.proj, '.claude'), { recursive: true, force: true });
  const tgt = path.join(sb.outside, 'claude');
  fs.mkdirSync(tgt, { recursive: true });
  const outsideFile = path.join(tgt, '.coalboard.json');
  fs.writeFileSync(outsideFile, VICTIM);
  try {
    fs.symlinkSync(tgt, path.join(sb.proj, '.claude'), process.platform === 'win32' ? 'junction' : 'dir');
  } catch (e) {
    t.skip(`this account cannot make a folder link (${e.code})`);
    return;
  }
  const r = runWithSwap(sb, { A_OUTSIDE: sb.outside });
  assert.equal(r.status, 1, `exit ${r.status}: ${r.stdout}\n${r.stderr}`);
  assert.match(r.stderr, /a link or junction sits on the path to the config folder/, r.stderr);
  assert.doesNotMatch(r.stderr, /\[open-outside\]/, `the outside file was opened: ${r.stderr}`);
  assert.equal(read(outsideFile), VICTIM, 'the outside file keeps its bytes');
  assert.doesNotMatch(r.stdout, /Successfully updated/);
});
