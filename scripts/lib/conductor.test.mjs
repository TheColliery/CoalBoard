// Hermetic spawn test for the CoalBoard conductor (hooks-safety §7).
// Spawns the REAL hook with fixture stdin in a sandbox (TEMP + USERPROFILE/HOME point at
// a throwaway dir, so real session state / the update stamp can never affect the test);
// asserts exit 0 on every path, silence except the sanctioned stdout, and the right state.
// Run: node --test conductor.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HOOK = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'hooks', 'coalboard-conductor.js');

// `home` sandboxes the GLOBAL config + the update stamp: point USERPROFILE/HOME at a
// throwaway dir so os.homedir() inside the hook resolves there, never the real machine.
function run(input, cwd, home) {
  const stdin = typeof input === 'string' ? input : JSON.stringify(input);
  const env = { ...process.env };
  if (home) { env.USERPROFILE = home; env.HOME = home; }
  return spawnSync(process.execPath, [HOOK], { input: stdin, cwd, env, encoding: 'utf8', timeout: 20000 });
}
const mk = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cb-hook-'));
const writeCfg = (dir, cfg) => {
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.claude', '.coalboard.json'), JSON.stringify(cfg));
};

test('SessionStart -> board contract, exit 0, no stderr', () => {
  const tmp = mk();
  try {
    const r = run({ hook_event_name: 'SessionStart' }, tmp, tmp);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /\[CoalBoard\].*board/i);
    assert.equal(r.stderr, '');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('UserPromptSubmit with a critical signal -> HALT/CONSENT directive', () => {
  const tmp = mk();
  try {
    const r = run({ hook_event_name: 'UserPromptSubmit', prompt: 'fix the auth crypto timing bug' }, tmp, tmp);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /CRITICAL signal/);
    assert.match(r.stdout, /HALT/);
    assert.equal(r.stderr, '');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('UserPromptSubmit benign -> fully silent', () => {
  const tmp = mk();
  try {
    const r = run({ hook_event_name: 'UserPromptSubmit', prompt: 'list the readme files' }, tmp, tmp);
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('non-English critical prompt -> the grade-by-meaning nudge fires', () => {
  const tmp = mk();
  try {
    // Thai script + a Latin keyword so Layer-1 fires; the non-English nudge must appear.
    const r = run({ hook_event_name: 'UserPromptSubmit', prompt: 'แก้ crypto ใน auth' }, tmp, tmp);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /CRITICAL signal/);
    assert.match(r.stdout, /non-English/);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('coalboardMode:off -> fully silent on every event', () => {
  const tmp = mk();
  try {
    writeCfg(tmp, { coalboardMode: 'off' });
    const r1 = run({ hook_event_name: 'SessionStart' }, tmp, tmp);
    const r2 = run({ hook_event_name: 'UserPromptSubmit', prompt: 'fix the auth crypto bug' }, tmp, tmp);
    assert.equal(r1.status, 0); assert.equal(r1.stdout, '');
    assert.equal(r2.status, 0); assert.equal(r2.stdout, '');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('garbage + valid-but-non-object stdin -> exit 0, no crash (Phoenix fail-silent)', () => {
  const tmp = mk();
  try {
    for (const payload of ['not json at all', 'null', '42', '[1,2,3]']) {
      const r = run(payload, tmp, tmp);
      assert.equal(r.status, 0, `exit 0 for stdin ${payload}`);
      assert.equal(r.stderr, '', `no stderr for stdin ${payload}`);
    }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
