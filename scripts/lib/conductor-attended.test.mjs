// 29eh: the conductor decides the session's attended state from the machine, never from a reader. CLAUDE_CODE_SESSION_ATTENDED: only the exact
// value "1" is attended; any other value, and an absent variable, is unattended. The SessionStart line carries the decided sentence; the per-prompt
// line carries no attended state of its own (it is replayed on --resume) and points at the start line. Hermetic spawn tests (hooks-safety section 7)
// on the real hook, both surfaces (the source and the dist copy), every value of the variable. The env is built from every process.env key except
// the CLAUDE_* ones, so a seat's own CLAUDE_CODE_SESSION_ATTENDED is never inherited. The T-29eb-2 leg: the update stamp is written temp-then-rename.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { removeTree } from './test-teardown.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SURFACES = ['hooks/coalboard-conductor.js', 'plugin/hooks/coalboard-conductor.js'];
// The four states the variable can be in: absent, the one attended value, and two unattended values (0 and an odd one).
const STATES = [undefined, '1', '0', 'yes'];
const SESSION_ATTENDED = 'A user can answer this session, so the consent steps run as written.';
const SESSION_UNATTENDED = 'No user can answer this session, so the board is not convened';
const PROMPT_POINTER = "act on this session's CoalBoard start line";
const OLD_ASK = 'HALT and ask the user (question-box)';
const OLD_CONSENT = 'then ask whether to convene the board; do not write until consent';
// A prompt that trips two D_KEYWORDS seeds (auth, token), so the per-prompt CRITICAL line is emitted.
const TRIP = 'rotate the auth token in the login flow';

function label(v) { return v === undefined ? 'unset' : `"${v}"`; }

function sandbox(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-conductor-attended-'));
  t.after(() => removeTree(dir));
  const home = path.join(dir, 'home');
  const proj = path.join(dir, 'proj');
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(proj, { recursive: true });
  return { dir, home, proj };
}

function env(sb, attended) {
  const e = { ...process.env };
  for (const k of Object.keys(e)) if (k.startsWith('CLAUDE_')) delete e[k];
  Object.assign(e, { HOME: sb.home, USERPROFILE: sb.home, TEMP: sb.dir, TMP: sb.dir, TMPDIR: sb.dir, CLAUDE_PROJECT_DIR: sb.proj });
  if (attended !== undefined) e.CLAUDE_CODE_SESSION_ATTENDED = attended;
  return e;
}

function run(hookRel, sb, attended, payload) {
  return spawnSync(process.execPath, [path.join(repo, hookRel)], {
    cwd: sb.proj, env: env(sb, attended), input: JSON.stringify(payload), encoding: 'utf8', timeout: 30000,
  });
}

function assertClean(r) {
  assert.equal(r.status, 0, `exit 0 on every leg, got ${r.status}: ${r.stderr}`);
  assert.equal(r.stderr, '', 'no stderr on any leg');
}

function writeGlobal(sb, cfg) {
  fs.mkdirSync(path.join(sb.home, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(sb.home, '.claude', '.coalboard.json'), JSON.stringify(cfg));
}

for (const hook of SURFACES) {
  test(`${hook}: attended "1" carries the attended sentence and no unattended one (SessionStart)`, (t) => {
    const sb = sandbox(t);
    const r = run(hook, sb, '1', { hook_event_name: 'SessionStart' });
    assertClean(r);
    assert.ok(r.stdout.includes(SESSION_ATTENDED), `attended sentence missing: ${r.stdout}`);
    assert.ok(!r.stdout.includes(SESSION_UNATTENDED), `unattended sentence leaked into attended: ${r.stdout}`);
  });

  for (const v of STATES.filter((x) => x !== '1')) {
    test(`${hook}: attended ${label(v)} carries the unattended sentence and not the attended one (SessionStart)`, (t) => {
      const sb = sandbox(t);
      const r = run(hook, sb, v, { hook_event_name: 'SessionStart' });
      assertClean(r);
      assert.ok(r.stdout.includes(SESSION_UNATTENDED), `unattended sentence missing for ${label(v)}: ${r.stdout}`);
      assert.ok(!r.stdout.includes(SESSION_ATTENDED), `attended sentence leaked for ${label(v)}: ${r.stdout}`);
    });
  }

  for (const v of STATES) {
    test(`${hook}: the per-prompt CRITICAL line for ${label(v)} points at the start line, with no ask gate and no attended state of its own`, (t) => {
      const sb = sandbox(t);
      const r = run(hook, sb, v, { hook_event_name: 'UserPromptSubmit', prompt: TRIP });
      assertClean(r);
      assert.ok(r.stdout.includes('[CoalBoard] CRITICAL signal'), `the critical line did not fire: ${r.stdout}`);
      assert.ok(r.stdout.includes(PROMPT_POINTER), `the line does not point at the start line: ${r.stdout}`);
      assert.ok(!r.stdout.includes(OLD_ASK), `the old HALT-and-ask clause is still emitted: ${r.stdout}`);
      assert.ok(!r.stdout.includes(OLD_CONSENT), `the old consent clause is still emitted: ${r.stdout}`);
      assert.ok(!r.stdout.includes(SESSION_ATTENDED) && !r.stdout.includes(SESSION_UNATTENDED), `the per-prompt line carries attended state: ${r.stdout}`);
    });
  }

  test(`${hook}: coalboardMode off in the global config keeps the board lines silent in both events, attended or not`, (t) => {
    const sb = sandbox(t);
    writeGlobal(sb, { coalboardMode: 'off', updateMode: 'off' });
    for (const v of ['1', undefined]) {
      const s = run(hook, sb, v, { hook_event_name: 'SessionStart' });
      assertClean(s);
      assert.ok(!s.stdout.includes('Consensus board'), `board line emitted under off (${label(v)}): ${s.stdout}`);
      assert.ok(!s.stdout.includes(SESSION_ATTENDED) && !s.stdout.includes(SESSION_UNATTENDED), `decided line emitted under off (${label(v)}): ${s.stdout}`);
      const p = run(hook, sb, v, { hook_event_name: 'UserPromptSubmit', prompt: TRIP });
      assertClean(p);
      assert.equal(p.stdout, '', `per-prompt line emitted under off (${label(v)}): ${p.stdout}`);
    }
  });

  test(`${hook}: the update stamp is written and no temp file survives the write (T-29eb-2)`, (t) => {
    const sb = sandbox(t);
    writeGlobal(sb, { updateMode: 'auto' });
    const r = run(hook, sb, '0', { hook_event_name: 'SessionStart' });
    assertClean(r);
    const dir = path.join(sb.home, '.claude', 'coal', 'coalboard');
    const names = fs.readdirSync(dir);
    assert.deepEqual(names.filter((n) => n !== 'update-check'), [], `a temp file survived the stamp write: ${names}`);
    const stamp = Number(fs.readFileSync(path.join(dir, 'update-check'), 'utf8'));
    assert.ok(Number.isFinite(stamp) && stamp > 0 && stamp <= Date.now(), `the stamp holds a timestamp: ${stamp}`);
  });
}
