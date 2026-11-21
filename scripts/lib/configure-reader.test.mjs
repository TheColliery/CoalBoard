// The reader fix (29mn-1 COMMIT R, T-29mg-D1, the reader study's witness, CW-092). A config that EXISTS but cannot be read used to be treated as an
// empty config, so the next write replaced it with only the key just set, exit 0. Now only ENOENT means "no config yet". Any other read failure (a denied
// read, a directory or another non-file at the name, an I/O error) prints one sentence naming the file and the code, says nothing was written, writes
// nothing (no new home, no .bak, no temp) and exits 1. The legacy seed takes the same rule before the new home is written.
// Each leg spawns the REAL scripts/configure.mjs from a temp project under one temp root made here, removed by its own name after its real path is
// checked under the real temp root. A denied read is made by icacls on Windows (the grant is restored in a finally) and by mode 000 on POSIX as a
// non-root user; a leg whose deny does not bind this process probes it and skips VISIBLY (a root user's mode 000 always reads).
// Zero deps. One child at a time, under a heap cap and a kill-timeout. Every spawn carries a timeout.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CONFIGURE = path.join(HERE, '..', 'configure.mjs');
const CHILD_TIMEOUT_MS = 60000;
const ICACLS_TIMEOUT_MS = 30000;
const HEAP_MB = 512;
const ORIGINAL = '{"rigor":"standard"}\n';
const SHAPES = [['root .coalboard.json', ['.coalboard.json']], ['nested .claude/.coalboard.json', ['.claude', '.coalboard.json']]];
const TEMP_ROOT_PREFIX = 'cb-reader-';

// Removes one temp root this file made: only a directory named with this prefix, directly under the real temp folder, and only after its real path is checked.
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
  fs.mkdirSync(proj, { recursive: true });
  fs.mkdirSync(tmp, { recursive: true });
  return { root, home, proj, tmp, newCfg: path.join(proj, '.claude', 'coal', 'coalboard.json') };
}

// One run of the real CLI from the temp project. The environment is the sandbox's own, plus the Windows system folders the child needs to start.
function runCli(sb, args) {
  const env = {};
  for (const k of ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'ComSpec', 'PATHEXT']) if (process.env[k] !== undefined) env[k] = process.env[k];
  Object.assign(env, { HOME: sb.home, USERPROFILE: sb.home, TEMP: sb.tmp, TMP: sb.tmp, TMPDIR: sb.tmp });
  const r = spawnSync(process.execPath, [`--max-old-space-size=${HEAP_MB}`, CONFIGURE, ...args], {
    cwd: sb.proj, env, encoding: 'utf8', timeout: CHILD_TIMEOUT_MS, killSignal: 'SIGKILL',
  });
  assert.equal(r.error, undefined, `spawn failed: ${r.error}`);
  return r;
}

// Makes a read of `file` fail for this process and returns the grant that undoes it, or null when the deny does not bind here (the leg then skips).
function denyRead(file) {
  if (process.platform === 'win32') {
    const user = os.userInfo().username;
    const set = spawnSync('icacls', [file, '/deny', `${user}:(RD)`], { encoding: 'utf8', timeout: ICACLS_TIMEOUT_MS });
    if (set.error || set.status !== 0) return null;
    return bindsOrNull(file, () => {
      const back = spawnSync('icacls', [file, '/remove:d', user], { encoding: 'utf8', timeout: ICACLS_TIMEOUT_MS });
      assert.equal(back.status, 0, `icacls could not restore the grant on ${file}: ${back.stderr}`);
    });
  }
  if (typeof process.getuid === 'function' && process.getuid() === 0) return null; // a root user reads a mode 000 file
  fs.chmodSync(file, 0o000);
  return bindsOrNull(file, () => fs.chmodSync(file, 0o644));
}

// The deny is kept only when a read of the file now fails; otherwise it is undone and the leg cannot prove anything.
function bindsOrNull(file, restore) {
  try { fs.readFileSync(file); } catch { return { restore }; }
  restore();
  return null;
}

// Runs the CLI with a denied read on `file`; the grant is restored in a finally before this returns. Null when the deny does not bind (skip).
function runWithDeniedRead(sb, file, args) {
  const grant = denyRead(file);
  if (!grant) return null;
  try { return runCli(sb, args); } finally { grant.restore(); }
}

// Every assertion of a refused run: exit 1, the sentence with the file's name and the code, the bytes unchanged, and no backup or temp left in any folder named.
function assertRefusedUntouched(r, file, expectedBytes, folders) {
  assert.equal(r.status, 1, `exit ${r.status}: ${r.stdout}\n${r.stderr}`);
  assert.match(r.stderr, /could not be read \([A-Z_]+\); nothing was written/, r.stderr);
  assert.ok(r.stderr.includes(path.basename(file)), `the sentence names the file: ${r.stderr}`);
  assert.equal(fs.readFileSync(file, 'utf8'), expectedBytes, 'the unreadable file keeps its bytes');
  for (const dir of folders) {
    for (const name of fs.readdirSync(dir)) {
      assert.ok(!name.endsWith('.bak') && !name.endsWith('.tmp'), `nothing was written in ${dir}: found ${name}`);
    }
  }
}

// ---- project config (the canonical home): a denied read leaves it untouched.
test('R project: a config that exists but cannot be read is left untouched, the run says so, exit 1', (t) => {
  const sb = sandbox(t);
  const dir = path.join(sb.proj, '.claude', 'coal');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(sb.newCfg, ORIGINAL);
  const r = runWithDeniedRead(sb, sb.newCfg, ['--rigor', 'high']);
  if (!r) { t.skip('the read deny does not bind this process here'); return; }
  assertRefusedUntouched(r, sb.newCfg, ORIGINAL, [dir]);
});

// ---- global config: the same rule at ~/.claude/.coalboard.json.
test('R global: an unreadable global config is left untouched, the run says so, exit 1', (t) => {
  const sb = sandbox(t);
  const dir = path.join(sb.home, '.claude');
  fs.mkdirSync(dir, { recursive: true });
  const globalCfg = path.join(dir, '.coalboard.json');
  fs.writeFileSync(globalCfg, ORIGINAL);
  const r = runWithDeniedRead(sb, globalCfg, ['--global', '--rigor', 'high']);
  if (!r) { t.skip('the read deny does not bind this process here'); return; }
  assertRefusedUntouched(r, globalCfg, ORIGINAL, [dir]);
});

// ---- legacy seed: the same rule, and the new home is NOT written (the old run wrote it with only the flag).
for (const [label, rel] of SHAPES) {
  test(`R legacy (${label}): an unreadable legacy config is left untouched and no new home is written, exit 1`, (t) => {
    const sb = sandbox(t);
    const legacy = path.join(sb.proj, ...rel);
    fs.mkdirSync(path.dirname(legacy), { recursive: true });
    fs.writeFileSync(legacy, ORIGINAL);
    const r = runWithDeniedRead(sb, legacy, ['--rigor', 'high']);
    if (!r) { t.skip('the read deny does not bind this process here'); return; }
    assertRefusedUntouched(r, legacy, ORIGINAL, [path.dirname(legacy)]);
    assert.ok(!fs.existsSync(sb.newCfg), 'the new home was not written');
  });
}

// ---- a directory at the config's path: every platform, no permission needed. The directory stays and nothing is written.
test('R directory at the config path: refused, the directory stays, nothing is written, exit 1', (t) => {
  const sb = sandbox(t);
  const dir = path.join(sb.proj, '.claude', 'coal');
  fs.mkdirSync(sb.newCfg, { recursive: true }); // a folder where the config file belongs
  const r = runCli(sb, ['--rigor', 'high']);
  assert.equal(r.status, 1, `exit ${r.status}: ${r.stdout}\n${r.stderr}`);
  assert.match(r.stderr, /could not be read \([A-Z_]+\); nothing was written/, r.stderr);
  assert.ok(fs.statSync(sb.newCfg).isDirectory(), 'the directory is still there');
  for (const name of fs.readdirSync(dir)) {
    assert.ok(!name.endsWith('.bak') && !name.endsWith('.tmp'), `nothing was written in ${dir}: found ${name}`);
  }
});
