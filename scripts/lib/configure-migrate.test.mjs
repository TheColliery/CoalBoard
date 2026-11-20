// The config-migration read window (CW-084, main's ruling HIGH): configure.mjs reads the legacy project config, writes the
// new one, then deletes the legacy file. An edit made to the legacy file between that read and the delete is in neither
// file. This test spawns the REAL scripts/configure.mjs with a preload that changes the legacy file right after the first
// read of it returns, so the change sits inside the window whatever re-check a fix adds before the delete.
//   Leg A (an append, and a same-size replace): the legacy file is kept, the exit is non-zero, a "kept" line prints.
//   Leg B (no change): the migration still removes the legacy file, writes the new config and exits 0.
// The preload watches fs.readFileSync, which configure.mjs uses for that read. If a later change reads the legacy file
// another way, the preload never fires, the legacy file is deleted, and leg A goes red (loud, never a false green).
// Zero deps. Each run works in one temp root made here (sandbox HOME, USERPROFILE, TEMP, TMP, TMPDIR; no git ancestor, so
// configure's git check answers "not tracked"), removed only by its own name after its real path is checked under the
// real temp root. One child at a time, under a heap cap and a kill-timeout.
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
const LEGACY_TEXT = '{"rigor":"standard"}\n';
const SAME_SIZE_TEXT = '{"rigor":"nasa"}    \n'; // the same byte length, different bytes

const PRELOAD = `import fs from 'node:fs';
import path from 'node:path';
import { syncBuiltinESMExports } from 'node:module';
// Both sides are compared by their real path (the runner's 8.3 TEMP spelling and the long spelling name one file).
const real = (p) => { try { return fs.realpathSync.native(p); } catch { return path.resolve(p); } };
const target = real(process.env.CB_WITNESS_LEGACY);
const mode = process.env.CB_WITNESS_MODE;
const origRead = fs.readFileSync;
let fired = false;
fs.readFileSync = function (p, ...rest) {
  const out = origRead.call(this, p, ...rest);
  if (!fired && typeof p === 'string' && real(p) === target) {
    fired = true;
    if (mode === 'append') fs.appendFileSync(target, ' ');
    if (mode === 'replace') {
      const tmp = target + '.witness-tmp';
      fs.writeFileSync(tmp, process.env.CB_WITNESS_REPLACE);
      fs.renameSync(tmp, target);
    }
    if (mode === 'append' || mode === 'replace') process.stderr.write('[witness] changed the legacy config after its first read\\n');
  }
  return out;
};
syncBuiltinESMExports();
`;

// The cleanup is registered on the line after the root exists, before anything else can throw (scripts-quality §2).
function makeRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-migrate-'));
  t.after(() => removeRoot(root));
  for (const d of ['home/proj', 'tmp']) fs.mkdirSync(path.join(root, d), { recursive: true });
  return root;
}

// Removes only the folder makeRoot made, after its real path is checked to sit strictly inside the real temp root.
function removeRoot(root) {
  const tmpReal = fs.realpathSync.native(os.tmpdir());
  const rootReal = fs.realpathSync.native(root);
  const rel = path.relative(tmpReal, rootReal);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel) || !path.basename(rootReal).startsWith('cb-migrate-')) {
    throw new Error(`refusing to remove ${rootReal}: not a cb-migrate- folder under ${tmpReal}`);
  }
  fs.rmSync(rootReal, { recursive: true, force: true });
}

function runConfigure(root, mode) {
  const home = path.join(root, 'home');
  const proj = path.join(home, 'proj');
  const legacy = path.join(proj, '.coalboard.json');
  fs.writeFileSync(legacy, LEGACY_TEXT);
  const preload = path.join(root, 'preload.mjs');
  fs.writeFileSync(preload, PRELOAD);
  const tmp = path.join(root, 'tmp');
  const env = {};
  for (const k of ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'ComSpec', 'PATHEXT']) if (process.env[k] !== undefined) env[k] = process.env[k];
  Object.assign(env, {
    HOME: home, USERPROFILE: home, TEMP: tmp, TMP: tmp, TMPDIR: tmp,
    CB_WITNESS_LEGACY: legacy, CB_WITNESS_MODE: mode, CB_WITNESS_REPLACE: SAME_SIZE_TEXT,
  });
  const r = spawnSync(process.execPath, [`--max-old-space-size=${HEAP_MB}`, '--import', pathToFileURL(preload).href, CONFIGURE, '--rigor', 'high'], {
    cwd: proj, env, encoding: 'utf8', timeout: CHILD_TIMEOUT_MS, killSignal: 'SIGKILL',
  });
  return { r, legacy, newCfg: path.join(proj, '.claude', 'coal', 'coalboard.json') };
}

for (const mode of ['append', 'replace']) {
  test(`leg A (${mode}): a legacy config changed inside the read window is kept, the exit is non-zero and a kept line prints`, (t) => {
    const root = makeRoot(t);
    const { r, legacy } = runConfigure(root, mode);
    const out = `${r.stdout}\n${r.stderr}`;
    assert.equal(r.error, undefined, `spawn failed: ${r.error}`);
    assert.match(r.stderr, /\[witness\] changed the legacy config/, `the preload never fired (configure no longer reads the legacy file with fs.readFileSync?); output:\n${out}`);
    assert.ok(fs.existsSync(legacy), `the changed legacy config was deleted (exit ${r.status}); output:\n${out}`);
    assert.notEqual(r.status, 0, `exit 0 although the legacy file changed; output:\n${out}`);
    assert.match(out, /\bkept\b/i, `no kept line; output:\n${out}`);
  });
}

test('leg B (no change): an unchanged legacy config is still migrated and removed, exit 0', (t) => {
  const root = makeRoot(t);
  const { r, legacy, newCfg } = runConfigure(root, 'none');
  const out = `${r.stdout}\n${r.stderr}`;
  assert.equal(r.error, undefined, `spawn failed: ${r.error}`);
  assert.equal(r.status, 0, `exit ${r.status}; output:\n${out}`);
  assert.ok(!fs.existsSync(legacy), `the unchanged legacy config was left behind; output:\n${out}`);
  assert.equal(JSON.parse(fs.readFileSync(newCfg, 'utf8')).rigor, 'high');
});
