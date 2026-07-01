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

test('PURE-Thai critical prompt (NO Latin keyword) -> still fires via the non-Latin script signal (CB-7)', () => {
  const tmp = mk();
  try {
    // The exact CB-7 case: a critical prompt entirely in Thai matches ZERO English seed.
    // Before the fix this returned no reasons -> the conductor emitted nothing for a
    // Thai-speaking user's critical prompt. The script-presence signal must now fire it.
    const r = run({ hook_event_name: 'UserPromptSubmit', prompt: 'แก้บั๊กการเข้ารหัสในระบบยืนยันตัวตน' }, tmp, tmp);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /CRITICAL signal/, 'a pure-Thai critical prompt must not be silent');
    assert.match(r.stdout, /non-English/, 'and it carries the grade-by-meaning nudge');
    assert.equal(r.stderr, '');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('multi-line ENGLISH critical prompt -> CRITICAL signal but NO non-English nudge (C0 control-char guard, audit A)', () => {
  const tmp = mk();
  try {
    // a newline used to make hasNonLatin false-fire (C0 controls sit below the excluded U+0020)
    const r = run({ hook_event_name: 'UserPromptSubmit', prompt: 'fix the auth crypto bug\nin the login flow' }, tmp, tmp);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /CRITICAL signal/);
    assert.doesNotMatch(r.stdout, /non-English/, 'a multi-line English prompt must NOT receive the non-English nudge');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('emoji in an English prompt -> CRITICAL signal but NO non-English nudge (emoji guard, round-3 #7)', () => {
  const tmp = mk();
  try {
    // emoji built from a code point (no literal in source); only non-Latin LETTERS should trigger the nudge
    const r = run({ hook_event_name: 'UserPromptSubmit', prompt: 'fix the auth crypto bug ' + String.fromCodePoint(0x1F600) }, tmp, tmp);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /CRITICAL signal/);
    assert.doesNotMatch(r.stdout, /non-English/, 'an emoji must NOT trigger the non-English nudge (only non-Latin letters do)');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('coalboardMode:off -> board contract + AND-gate silent, but self-update is orthogonal', () => {
  const tmp = mk();
  try {
    writeCfg(tmp, { coalboardMode: 'off' });
    // SessionStart: the board contract is suppressed, but the self-update is due (fresh sandbox,
    // updateMode defaults to ask) -> only the self-update directive fires, NOT the board contract.
    const r1 = run({ hook_event_name: 'SessionStart' }, tmp, tmp);
    const r2 = run({ hook_event_name: 'UserPromptSubmit', prompt: 'fix the auth crypto bug' }, tmp, tmp);
    assert.equal(r1.status, 0);
    assert.match(r1.stdout, /self-update due/, 'self-update is orthogonal to the board and still fires when off');
    assert.doesNotMatch(r1.stdout, /Consensus board available/, 'the board contract is suppressed when coalboardMode:off');
    assert.equal(r2.status, 0); assert.equal(r2.stdout, '', 'the UserPromptSubmit AND-gate stays silent when the board is off');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('coalboardMode:off + updateMode:off -> fully silent on every event', () => {
  const tmp = mk();
  try {
    writeCfg(tmp, { coalboardMode: 'off', updateMode: 'off' });
    const r1 = run({ hook_event_name: 'SessionStart' }, tmp, tmp);
    const r2 = run({ hook_event_name: 'UserPromptSubmit', prompt: 'fix the auth crypto bug' }, tmp, tmp);
    assert.equal(r1.status, 0); assert.equal(r1.stdout, '', 'board off + update off -> SessionStart fully silent');
    assert.equal(r2.status, 0); assert.equal(r2.stdout, '');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('project config read from a PARENT when cwd is a subdir (cwd walk-up, round-4 #2)', () => {
  const root = mk();
  const home = mk(); // a DIFFERENT home so the GLOBAL read finds nothing — only the walk-up can supply the config
  try {
    writeCfg(root, { coalboardMode: 'off' });           // config at the project ROOT
    const sub = path.join(root, 'pkg', 'src');
    fs.mkdirSync(sub, { recursive: true });
    const r = run({ hook_event_name: 'UserPromptSubmit', prompt: 'fix the auth crypto bug' }, sub, home);
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '', 'coalboardMode:off at the root is found by walking up from a subdir cwd -> silent');
  } finally { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(home, { recursive: true, force: true }); }
});

test('findProjectCfg STOPS at home -- a .coalboard.json ABOVE the sandboxed home is IGNORED (no walk-above-home escape; hermetic isolation, issue #2 follow-up)', () => {
  const base = mk();
  try {
    writeCfg(base, { updateMode: 'off' });                       // a config ABOVE home: must be IGNORED (it would suppress self-update if the walk escaped up to it)
    const home = path.join(base, 'h');
    writeCfg(home, { updateMode: 'auto', updateCheckDays: 14 });  // the GLOBAL: self-update IS due (first ever)
    const proj = path.join(home, 'proj');
    fs.mkdirSync(proj, { recursive: true });                     // cwd = a subdir of home -> the walk-up must STOP at home, never reach base
    const r = run({ hook_event_name: 'SessionStart' }, proj, home);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /self-update due/, 'the global updateMode:auto fires; the {updateMode:off} ABOVE home must NOT be picked up by walking above home');
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
});

test('non-SessionStart non-UPS event -> fully silent (over-fire guard, v1.0.11)', () => {
  const tmp = mk();
  try {
    for (const ev of ['PreToolUse', 'PostToolUse', 'Notification', 'Stop']) {
      const r = run({ hook_event_name: ev }, tmp, tmp);
      assert.equal(r.status, 0, `exit 0 for ${ev}`);
      assert.equal(r.stdout, '', `${ev} must be silent (only SessionStart + UserPromptSubmit emit)`);
    }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('updateCheckDays:0 is CLAMPED -> the 2nd SessionStart is throttled, not re-nagged (#3 regression)', () => {
  // With an UNCLAMPED read, days=0 makes the window `now-last < 0` never true -> the
  // self-update nudge would fire on EVERY session. The clamp (out-of-range -> 14) restores
  // the throttle: run #1 schedules + nudges, run #2 (same sandbox home -> same stamp) is silent.
  const tmp = mk();
  try {
    writeCfg(tmp, { updateMode: 'auto', updateCheckDays: 0 });
    const r1 = run({ hook_event_name: 'SessionStart' }, tmp, tmp);
    const r2 = run({ hook_event_name: 'SessionStart' }, tmp, tmp);
    assert.equal(r1.status, 0); assert.equal(r2.status, 0);
    assert.match(r1.stdout, /self-update due/, 'run #1 (first ever) is due -> nudges + stamps');
    assert.doesNotMatch(r2.stdout, /self-update due/, 'run #2 must be throttled: updateCheckDays:0 clamps to 14, the window holds');
    assert.equal(r2.stderr, '');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('updateCheckDays:14 (in range) stays silent within the window on the 2nd SessionStart (#3 control)', () => {
  // The in-range control for the clamp test: a valid value behaves identically to the
  // clamped-0 case -> run #1 nudges, run #2 within the 14-day window is throttled.
  const tmp = mk();
  try {
    writeCfg(tmp, { updateMode: 'auto', updateCheckDays: 14 });
    const r1 = run({ hook_event_name: 'SessionStart' }, tmp, tmp);
    const r2 = run({ hook_event_name: 'SessionStart' }, tmp, tmp);
    assert.equal(r1.status, 0); assert.equal(r2.status, 0);
    assert.match(r1.stdout, /self-update due/, 'run #1 (first ever) is due -> nudges + stamps');
    assert.doesNotMatch(r2.stdout, /self-update due/, 'run #2 within the 14-day window must be throttled');
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

test('a __proto__-poisoned project config cannot inject settings through the prototype (proto-pollution guard)', () => {
  const tmp = mk();
  try {
    // A malicious cloned-repo config tries to inject coalboardMode:"off" via __proto__ (NO own
    // coalboardMode key). Without the parse guard, Object.assign's [[Set]] of "__proto__" in readCfg
    // would set the merged config's prototype, so out.coalboardMode would INHERIT "off" and silently
    // suppress the board. The reviver drops __proto__, so the injection is ignored and the board
    // contract still fires on SessionStart. (Raw JSON string: JSON.stringify won't emit an own __proto__.)
    fs.mkdirSync(path.join(tmp, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(tmp, '.claude', '.coalboard.json'), '{"__proto__":{"coalboardMode":"off"}}');
    const r = run({ hook_event_name: 'SessionStart' }, tmp, tmp);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /\[CoalBoard\].*board/i, 'the board contract must still fire: a coalboardMode injected via __proto__ must NOT be honored');
    assert.equal(r.stderr, '');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
