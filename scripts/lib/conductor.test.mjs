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
// Namespace campaign (#69+#39): write a config at an explicit read-order candidate --
// own-dir (.claude/coal/coalboard.json), another known agent dir (.agents/.../.gemini/...),
// or the LEGACY shape (reuses writeCfg above).
const writeCfgOwnDir = (dir, cfg) => {
  const p = path.join(dir, '.claude', 'coal', 'coalboard.json');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(cfg));
};
const writeCfgAgentsDir = (dir, cfg) => {
  const p = path.join(dir, '.agents', 'coal', 'coalboard.json');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(cfg));
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

test('UserPromptSubmit with a critical signal -> HALT/CONSENT directive + the arbitration cue', () => {
  const tmp = mk();
  try {
    const r = run({ hook_event_name: 'UserPromptSubmit', prompt: 'fix the auth crypto timing bug' }, tmp, tmp);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /CRITICAL signal/);
    assert.match(r.stdout, /HALT/);
    assert.match(r.stdout, /ARBITRATE/, 'CB carries its own arbitration cue on every HARD-reason hit -- CT\'s conditional per-turn cue is not congruent with CB\'s substring seed set');
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

test('PURE-Thai critical prompt (NO Latin keyword) -> the lean one-liner, not the full CRITICAL block (CB-7 + HOOK-LEAN downgrade)', () => {
  const tmp = mk();
  try {
    // The exact CB-7 case: a critical prompt entirely in Thai matches ZERO English seed -> zero
    // HARD reasons, script-only. Before CB-7 this returned no reasons -> silent; CB-7 then fired
    // the FULL CRITICAL block on every non-Latin turn; HOOK-LEAN (2026-07-15) downgrades a
    // script-only signal to a one-line reminder -- the "judge by MEANING" rail already lives in
    // the resident SessionStart contract, this just re-surfaces it.
    const r = run({ hook_event_name: 'UserPromptSubmit', prompt: 'แก้บั๊กการเข้ารหัสในระบบยืนยันตัวตน' }, tmp, tmp);
    assert.equal(r.status, 0);
    assert.doesNotMatch(r.stdout, /CRITICAL signal/, 'a script-only signal must NOT pay the full CRITICAL block');
    assert.match(r.stdout, /Non-English prompt/, 'the lean one-liner still fires -- a pure-Thai critical prompt is never silent');
    assert.match(r.stdout, /MEANING/);
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

test('SAFER-VALUE-WINS: project cannot escalate coalboardMode past global (off -> auto rejected, hooks-safety.md §9)', () => {
  const root = mk();
  const home = mk();
  try {
    writeCfg(home, { coalboardMode: 'off', updateMode: 'off' }); // GLOBAL: user explicitly turned everything off
    writeCfg(root, { coalboardMode: 'auto' });                   // PROJECT (untrusted clone) tries to escalate coalboardMode only
    const r1 = run({ hook_event_name: 'SessionStart' }, root, home);
    const r2 = run({ hook_event_name: 'UserPromptSubmit', prompt: 'fix the auth crypto bug' }, root, home);
    assert.equal(r1.status, 0); assert.equal(r1.stdout, '', 'global coalboardMode:off must survive a project escalation attempt to auto');
    assert.equal(r2.status, 0); assert.equal(r2.stdout, '', 'the AND-gate must stay silent -- off was not escalated');
  } finally { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(home, { recursive: true, force: true }); }
});

test('SAFER-VALUE-WINS: project MAY quieten coalboardMode (auto -> off accepted)', () => {
  const root = mk();
  const home = mk();
  try {
    writeCfg(home, { coalboardMode: 'auto', updateMode: 'off' }); // GLOBAL: standing opt-in
    writeCfg(root, { coalboardMode: 'off' });                     // PROJECT: this one project opts out
    const r = run({ hook_event_name: 'UserPromptSubmit', prompt: 'fix the auth crypto bug' }, root, home);
    assert.equal(r.status, 0); assert.equal(r.stdout, '', 'a project quietening coalboardMode to off must be honored');
  } finally { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(home, { recursive: true, force: true }); }
});

test('SAFER-VALUE-WINS: project cannot escalate updateMode past global (off -> auto rejected, hooks-safety.md §9)', () => {
  const root = mk();
  const home = mk();
  try {
    writeCfg(home, { updateMode: 'off' });
    writeCfg(root, { updateMode: 'auto' });
    const r = run({ hook_event_name: 'SessionStart' }, root, home);
    assert.equal(r.status, 0);
    assert.doesNotMatch(r.stdout, /self-update due/, 'global updateMode:off must survive a project escalation attempt to auto');
  } finally { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(home, { recursive: true, force: true }); }
});

test('SAFER-VALUE-WINS: project MAY quieten updateMode (auto -> off accepted)', () => {
  const root = mk();
  const home = mk();
  try {
    writeCfg(home, { updateMode: 'auto' });
    writeCfg(root, { updateMode: 'off' });
    const r = run({ hook_event_name: 'SessionStart' }, root, home);
    assert.equal(r.status, 0);
    assert.doesNotMatch(r.stdout, /self-update due/, 'a project quietening updateMode to off must be honored');
  } finally { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(home, { recursive: true, force: true }); }
});

test('SAFER-VALUE-WINS: case-fold — mixed-case values still clamp correctly (R4, hooks-safety.md §9)', () => {
  const root = mk();
  const home = mk();
  try {
    writeCfg(home, { coalboardMode: 'OFF', updateMode: 'off' }); // GLOBAL: uppercase
    writeCfg(root, { coalboardMode: 'Auto' });                   // PROJECT: mixed-case escalation attempt
    const r = run({ hook_event_name: 'UserPromptSubmit', prompt: 'fix the auth crypto bug' }, root, home);
    assert.equal(r.status, 0); assert.equal(r.stdout, '', 'a case-varied escalation attempt must still be rejected');
  } finally { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(home, { recursive: true, force: true }); }
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

// ---------------------------------------------------------------------------
// Namespace campaign (#69+#39, owner-designated 2026-08-08): per-project config read
// order -- own-dir (.claude/coal/coalboard.json) -> other known agent dirs (fixed
// order) -> LEGACY (.claude/.coalboard.json). Precedence x3 + the clamp-unchanged
// regression (incl. seedList additive) + the move-on-write grep-proof + the
// update-check stamp's read-new-fallback-old / write-new-drop-old shape.
// ---------------------------------------------------------------------------

test('namespace campaign precedence 1/3: own-dir wins over another known agent dir AND legacy, even when all three exist', () => {
  const root = mk();
  const home = mk(); // a DIFFERENT home so the global read can never supply the value
  try {
    writeCfgOwnDir(root, { coalboardMode: 'off', updateMode: 'off' });   // own-dir: silence
    writeCfgAgentsDir(root, { coalboardMode: 'auto' });                  // other known dir: would NOT be silent
    writeCfg(root, { coalboardMode: 'auto' });                           // LEGACY: would NOT be silent either
    const r1 = run({ hook_event_name: 'SessionStart' }, root, home);
    const r2 = run({ hook_event_name: 'UserPromptSubmit', prompt: 'fix the auth crypto bug' }, root, home);
    assert.equal(r1.status, 0); assert.equal(r1.stdout, '', 'own-dir silence must win even with louder values at .agents and the legacy path');
    assert.equal(r2.status, 0); assert.equal(r2.stdout, '');
  } finally { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(home, { recursive: true, force: true }); }
});

test('namespace campaign precedence 2/3: own-dir absent -> the other-known-dir candidate wins over LEGACY', () => {
  const root = mk();
  const home = mk();
  try {
    writeCfgAgentsDir(root, { coalboardMode: 'off', updateMode: 'off' }); // other known dir: silence
    writeCfg(root, { coalboardMode: 'auto' });                           // LEGACY: would NOT be silent
    const r = run({ hook_event_name: 'UserPromptSubmit', prompt: 'fix the auth crypto bug' }, root, home);
    assert.equal(r.status, 0); assert.equal(r.stdout, '', 'the .agents candidate must be read when own-dir is absent, ahead of legacy');
  } finally { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(home, { recursive: true, force: true }); }
});

test('namespace campaign precedence 3/3: nothing new-shape exists anywhere -> the LEGACY config is still read normally (no breakage for an existing user)', () => {
  const root = mk();
  const home = mk();
  try {
    writeCfg(root, { coalboardMode: 'off', updateMode: 'off' }); // ONLY the legacy shape exists
    const r = run({ hook_event_name: 'UserPromptSubmit', prompt: 'fix the auth crypto bug' }, root, home);
    assert.equal(r.status, 0); assert.equal(r.stdout, '', 'a legacy-only project must read exactly as it did before the campaign');
  } finally { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(home, { recursive: true, force: true }); }
});

// INSPECT findings-back: the two clamp-unchanged tests below originally wrote ONLY via
// writeCfgOwnDir -- the "regardless of which candidate" claim was true by construction
// (candidate identity is erased before the merge), never actually demonstrated across
// more than one candidate. Both now loop over three genuinely different candidates
// (own-dir, another known agent dir, and the legacy shape) in independent sandboxes.
const CANDIDATE_WRITERS = [
  ['own-dir (.claude/coal/coalboard.json)', writeCfgOwnDir],
  ['another known agent dir (.agents/coal/coalboard.json)', writeCfgAgentsDir],
  ['the legacy shape (.claude/.coalboard.json)', writeCfg],
];

test('clamp-unchanged regression: safer-value-wins rejects escalation regardless of which read-order candidate supplied the project value', () => {
  for (const [label, writeProjectCfg] of CANDIDATE_WRITERS) {
    const root = mk();
    const home = mk();
    try {
      writeCfg(home, { coalboardMode: 'off' });           // GLOBAL: explicit off
      writeProjectCfg(root, { coalboardMode: 'auto' });   // PROJECT value arrives via THIS candidate
      const r = run({ hook_event_name: 'UserPromptSubmit', prompt: 'fix the auth crypto bug' }, root, home);
      assert.equal(r.status, 0); assert.equal(r.stdout, '', `a project may not escalate past global off via ${label} -- only the ADDRESS moved, the clamp did not`);
    } finally { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(home, { recursive: true, force: true }); }
  }
});

test('clamp-unchanged regression: criticalKeywords stay UNION/additive regardless of which read-order candidate supplied them', () => {
  for (const [label, writeProjectCfg] of CANDIDATE_WRITERS) {
    const root = mk();
    const home = mk();
    try {
      // a project-added keyword via THIS candidate -- must ADD to, not replace, the built-in seed
      writeProjectCfg(root, { criticalKeywords: ['bespoke-term'] });
      const rCustom = run({ hook_event_name: 'UserPromptSubmit', prompt: 'a bespoke-term appears here' }, root, home);
      const rBuiltin = run({ hook_event_name: 'UserPromptSubmit', prompt: 'fix the auth crypto bug' }, root, home);
      assert.match(rCustom.stdout, /CRITICAL signal/, `the project-added keyword via ${label} must fire on its own`);
      assert.match(rBuiltin.stdout, /CRITICAL signal/, `the built-in default keywords must still fire via ${label} -- the project addition did not REPLACE the seed list`);
    } finally { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(home, { recursive: true, force: true }); }
  }
});

test('move-on-CONFIG-WRITE-only (Phoenix #5): no code path anywhere writes .coalboard.json -- the fableConsent persistence is agent prose (SKILL.md), never a code path here', () => {
  const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const dirs = [path.join(repo, 'scripts'), path.join(repo, 'scripts', 'lib'), path.join(repo, 'hooks')];
  const offenders = [];
  for (const dir of dirs) {
    // board #117 (CodeQL js/file-system-race, CWE-367): withFileTypes:true returns each
    // entry's type from the SAME readdir syscall that enumerated it -- entry.isDirectory()
    // is not a second stat-by-name call, so there is no separate check-then-use pair on
    // `full` between "is it a dir" and "read its contents" (the prior statSync(full) + a
    // later readFileSync(full) were two independent lookups of the same NAME, the exact
    // CWE-367 shape). readFileSync below is still one lookup-by-name, same as any file
    // read; a full fd-based open+fstat+read would close that too, but this is a test
    // reading its OWN checked-out source tree in CI, not an untrusted multi-writer
    // environment -- over-engineering that for a threat model that does not apply here.
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const f = entry.name;
      const full = path.join(dir, f);
      if (entry.isDirectory()) continue;
      if (!/\.(mjs|js)$/.test(f) || f.endsWith('.test.mjs')) continue;
      const text = fs.readFileSync(full, 'utf8');
      if (/writeFileSync\([^)]*coalboard\.json/i.test(text)) offenders.push(path.relative(repo, full));
    }
  }
  assert.deepStrictEqual(offenders, [], 'if this ever fires, the room now has a real writer and the design-doc write-new-drop-old step is owed for real, in code');
});

test('update-check stamp: read-new-fallback-old -- a stamp only at the OLD root location is honored (migration read)', () => {
  const home = mk();
  try {
    writeCfg(home, { updateMode: 'auto' }); // GLOBAL: self-update on
    const oldStamp = path.join(home, '.claude', '.coalboard-update-check');
    fs.mkdirSync(path.dirname(oldStamp), { recursive: true });
    fs.writeFileSync(oldStamp, String(Date.now() - 86400000)); // 1 day ago -- well inside the default 14-day window
    const r = run({ hook_event_name: 'SessionStart' }, home, home);
    assert.equal(r.status, 0);
    assert.doesNotMatch(r.stdout, /self-update due/, 'a recent OLD-location stamp must be READ via fallback and throttle the nudge -- if it were ignored, last would read 0 and fire immediately');
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
});

test('update-check stamp: write-new-drop-old -- scheduling moves the stamp to the new home and deletes the old one', () => {
  const home = mk();
  try {
    writeCfg(home, { updateMode: 'auto' });
    const oldStamp = path.join(home, '.claude', '.coalboard-update-check');
    const newStamp = path.join(home, '.claude', 'coal', 'coalboard', 'update-check');
    fs.mkdirSync(path.dirname(oldStamp), { recursive: true });
    fs.writeFileSync(oldStamp, String(Date.now() - 30 * 86400000)); // 30 days ago -- past the window, due
    const r = run({ hook_event_name: 'SessionStart' }, home, home);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /self-update due/, 'a stale OLD stamp is due -- fires the nudge');
    assert.equal(fs.existsSync(newStamp), true, 'the NEW stamp location must now exist');
    assert.equal(fs.existsSync(oldStamp), false, 'the OLD stamp must be dropped in the same write (no-old-version-leftover)');
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
});
