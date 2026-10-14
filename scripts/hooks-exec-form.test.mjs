// CWK2-027: every hook entry is the EXEC form (`command: "node"` + one `args` path), never a shell string.
// A shell-form string carrying ${CLAUDE_PLUGIN_ROOT} is handed to PowerShell on Windows when Git for Windows is absent, where
// `${CLAUDE_PLUGIN_ROOT}` is a PowerShell variable that expands to nothing: node gets no script and the hook fails (measured by
// the CoalWash room, CWK2-020 item 1). Exec form has no shell; on Windows `command` must be a real executable, so `node`, never
// a shim (hooks-safety.md section 3). Shape follows CoalWash's scripts/hooks-exec-form.test.mjs; this room's manifest has two
// entries (SessionStart, UserPromptSubmit), no matcher, no PreToolUse.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLACEHOLDER = '${CLAUDE_PLUGIN_ROOT}';
const CONDUCTOR_ARG = `${PLACEHOLDER}/hooks/coalboard-conductor.js`;
const EVENTS = ['SessionStart', 'UserPromptSubmit'];

function entries(root) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'hooks', 'hooks.json'), 'utf8'));
  const out = [];
  for (const [event, groups] of Object.entries(manifest.hooks)) {
    for (const g of groups) for (const h of g.hooks) out.push({ event, h });
  }
  return out;
}

for (const [label, root] of [['source', REPO], ['dist', path.join(REPO, 'plugin')]]) {
  test(`hooks.json (${label}): every entry is exec form, node + one args path to the conductor, no shell or onFailure`, () => {
    const all = entries(root);
    assert.deepEqual(all.map((e) => e.event).sort(), EVENTS.slice().sort(), 'exactly the two conductor entries');
    for (const { event, h } of all) {
      assert.equal(h.type, 'command', event);
      assert.equal(h.command, 'node', `${event}: command is the executable alone, never a shell string (got ${JSON.stringify(h.command)})`);
      assert.deepEqual(h.args, [CONDUCTOR_ARG], event);
      assert.ok(!('shell' in h), `${event}: no shell field`);
      assert.ok(!('onFailure' in h), `${event}: no onFailure (hooks-safety section 1: never block on a fail-silent hook)`);
      assert.ok(!String(h.command).includes(PLACEHOLDER), `${event}: no placeholder inside a command string`);
    }
  });
}

test('the SessionStart entry runs the way exec form runs it: no shell, node + the resolved path, exit 0, sanctioned output only', (t) => {
  const tmp = fs.realpathSync.native(os.tmpdir());
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(tmp, 'cb-execform-')));
  t.after(() => {
    assert.ok(dir.startsWith(tmp + path.sep), `refusing to remove ${dir}`);
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const home = path.join(dir, 'home');
  const proj = path.join(home, 'proj');
  fs.mkdirSync(proj, { recursive: true });
  const entry = entries(REPO).find((e) => e.event === 'SessionStart');
  assert.ok(entry && Array.isArray(entry.h.args), 'the SessionStart entry carries args (exec form)');
  const args = entry.h.args.map((a) => a.split(PLACEHOLDER).join(REPO));
  const env = { ...process.env, HOME: home, USERPROFILE: home, TEMP: home, TMP: home, TMPDIR: home, CLAUDE_PLUGIN_ROOT: REPO, CLAUDE_PROJECT_DIR: proj };
  delete env.NODE_TEST_CONTEXT;
  const r = spawnSync(entry.h.command === 'node' ? process.execPath : entry.h.command, args,
    { cwd: proj, env, input: JSON.stringify({ hook_event_name: 'SessionStart' }), encoding: 'utf8', timeout: 20000, killSignal: 'SIGKILL', windowsHide: true, shell: false });
  assert.equal(r.status, 0, `stderr: ${r.stderr}`);
  assert.equal(r.stderr, '');
  assert.ok(r.stdout.includes('Consensus board available'), `the board contract is announced: ${r.stdout}`);
});
