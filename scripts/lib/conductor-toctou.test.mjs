// The hook's project-config read (29oa, T-29nh-1, the class of 29nw's sweep and main's ruling c195 1). readProjectConfig checked the config's path (a
// realpath containment check) and then read it BY NAME: a file swapped in between was read, and its keys reached the session. The fix takes the identity from
// the one resolved path the check looked at: lstat it, open it, fstat the handle, compare dev and ino, read through that handle, close it on every path. A
// mismatch refuses with the reason 'replaced while it was read', which SessionStart prints as an UNREADABLE line.
// The seam is the reviewer's (scratchpad/29nw/conductor-witness.mjs): a CJS preload swaps the config name for a hard link to a victim file just before the
// first open of that path. Observable: the project file says coalboardMode "ask" (the SessionStart board contract prints); the victim says "off" (the
// contract is suppressed when it is read). Legs: CONTROL (no swap), INSIDE (another file in the project), OUTSIDE (a file outside the project), and REAL-LINK
// (a link at the config path to a file outside: refused on both the old and the new code; it guards the containment that the fix keeps).
// Each leg spawns the REAL hook with a sandboxed HOME and temp folders, under one temp root made here, removed by its own name after its real path is
// checked under the real temp root. One child at a time, under a heap cap and a kill-timeout. Every spawn carries a timeout.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HOOK = path.join(HERE, '..', '..', 'hooks', 'coalboard-conductor.js');
const CHILD_TIMEOUT_MS = 60000;
const HEAP_MB = 512;
const TEMP_ROOT_PREFIX = 'cb-29oa-';
const MARK = 'Consensus board available';
const OWN = '{"coalboardMode":"ask"}\n';
const VICTIM = '{"coalboardMode":"off"}\n';

// The seam: on the first open of the config path (compared by real path), swap the name to a hard link to the victim just before the real open.
const PRELOAD = `const fs = require('fs');
const path = require('path');
const real = (p) => { try { return fs.realpathSync.native(p); } catch { return path.resolve(String(p)); } };
const T = process.env.A_TARGET ? real(process.env.A_TARGET) : '';
const V = process.env.A_VICTIM || '';
const oOpen = fs.openSync;
let fired = false;
fs.openSync = function (p, ...r) {
  if (V && !fired && typeof p === 'string' && real(p) === T) {
    fired = true; fs.rmSync(T); fs.linkSync(V, T);
    process.stderr.write('[swap] config -> hard link to ' + path.basename(V) + ' before the open\\n');
  }
  return oOpen.call(fs, p, ...r);
};
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

// One sandbox per leg: a home with a project in it, its own config (OWN), a folder outside the project, and a temp folder for the hook.
function sandbox(t) {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), TEMP_ROOT_PREFIX)));
  t.after(() => removeRoot(root));
  const home = path.join(root, 'home');
  const proj = path.join(home, 'work', 'proj');
  const tmp = path.join(root, 'tmp');
  const outside = path.join(root, 'outside');
  for (const d of [proj, tmp, outside]) fs.mkdirSync(d, { recursive: true });
  fs.mkdirSync(path.join(proj, '.git'));
  const cfg = path.join(proj, '.claude', 'coal', 'coalboard.json');
  fs.mkdirSync(path.dirname(cfg), { recursive: true });
  fs.writeFileSync(cfg, OWN);
  return { root, home, proj, tmp, outside, cfg };
}

// One SessionStart run of the real hook. The preload (when given) swaps the name to the victim; the environment is the sandbox's own.
function runHook(sb, victim) {
  const pre = path.join(sb.root, 'preload.cjs');
  fs.writeFileSync(pre, PRELOAD);
  const env = {};
  for (const k of ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'ComSpec', 'PATHEXT']) if (process.env[k] !== undefined) env[k] = process.env[k];
  Object.assign(env, { HOME: sb.home, USERPROFILE: sb.home, TEMP: sb.tmp, TMP: sb.tmp, TMPDIR: sb.tmp, A_TARGET: sb.cfg, A_VICTIM: victim || '' });
  const r = spawnSync(process.execPath, ['--max-old-space-size=' + HEAP_MB, '--require', pre, HOOK], {
    cwd: sb.proj, env, input: JSON.stringify({ hook_event_name: 'SessionStart', cwd: sb.proj }), encoding: 'utf8', timeout: CHILD_TIMEOUT_MS, killSignal: 'SIGKILL',
  });
  assert.equal(r.error, undefined, `spawn failed: ${r.error}`);
  return r;
}

const CHANGED = /UNREADABLE: .* \(replaced while it was read\)/;

// ---- CONTROL: no swap. The project's own file is read: the contract prints and no notice is raised.
test('T29oa control: with no swap the project config is read and the board contract prints, with no UNREADABLE notice', (t) => {
  const sb = sandbox(t);
  const r = runHook(sb, '');
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stdout.includes(MARK), `the contract prints: ${r.stdout}`);
  assert.doesNotMatch(r.stdout, /UNREADABLE/, 'no notice on the control');
});

// ---- INSIDE: the name is swapped to another file inside the project. The victim's "off" must not apply: the read is refused, with a notice.
test('T29oa inside: a config swapped for another file inside the project is refused, its keys are not read, and the notice says it changed', (t) => {
  const sb = sandbox(t);
  const other = path.join(sb.proj, 'other.json');
  fs.writeFileSync(other, VICTIM);
  const r = runHook(sb, other);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, CHANGED, `the notice names the change: ${r.stdout}`);
  assert.ok(r.stdout.includes(MARK), `the victim's coalboardMode off did not suppress the contract: ${r.stdout}`);
  assert.equal(fs.readFileSync(other, 'utf8'), VICTIM, 'the other file keeps its bytes');
});

// ---- OUTSIDE: the name is swapped to a file outside the project. The same refusal, on every platform.
test('T29oa outside: a config swapped for a file outside the project is refused, its keys are not read, and the notice says it changed', (t) => {
  const sb = sandbox(t);
  const victim = path.join(sb.outside, 'victim.json');
  fs.writeFileSync(victim, VICTIM);
  const r = runHook(sb, victim);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, CHANGED, `the notice names the change: ${r.stdout}`);
  assert.ok(r.stdout.includes(MARK), `the outside file's coalboardMode off did not suppress the contract: ${r.stdout}`);
  assert.equal(fs.readFileSync(victim, 'utf8'), VICTIM, 'the outside file keeps its bytes');
});

// ---- REAL-LINK: a folder link (a junction on Windows, a directory link on POSIX) in the config path, pointing at a folder outside the project. A junction
// needs no privilege, so this leg runs on Windows too; the probe skips visibly where this account cannot make one. Refused as an outside resolution on the old
// and the new code alike: a guard that the fix keeps, not the race.
test('T29oa real link: a folder link in the config path to a folder outside the project is refused as outside its folder (skipped where no link can be made)', (t) => {
  const sb = sandbox(t);
  const linked = path.join(sb.outside, 'claude');
  fs.mkdirSync(path.join(linked, 'coal'), { recursive: true });
  fs.writeFileSync(path.join(linked, 'coal', 'coalboard.json'), VICTIM);
  fs.rmSync(path.join(sb.proj, '.claude'), { recursive: true, force: true });
  try {
    fs.symlinkSync(linked, path.join(sb.proj, '.claude'), process.platform === 'win32' ? 'junction' : 'dir');
  } catch (e) {
    t.skip(`this account cannot make a folder link (${e.code})`);
    return;
  }
  const r = runHook(sb, '');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /UNREADABLE: .* \(resolves outside its folder\)/, `the link is refused: ${r.stdout}`);
  assert.ok(r.stdout.includes(MARK), `the outside file's off does not apply: ${r.stdout}`);
  assert.equal(fs.readFileSync(path.join(linked, 'coal', 'coalboard.json'), 'utf8'), VICTIM, 'the outside file keeps its bytes');
});
