// 27b: the shipped plugin must load every agent under Antigravity's own loader. agy 1.4.8 reads the YAML
// frontmatter of plugin/agents/*.md and refuses a `tools` field written as a comma string ("cannot unmarshal
// !!str ... into []string. The loader skips this agent"), so components.agents reads 0. The validator is the
// reader that matters, so the check runs agy's own `plugin validate` on a BUILT copy, never a regex over the
// frontmatter. agy is probed, not decided by platform: where it is not on PATH the test skips VISIBLY.
// Shape ported from CoalMine scripts/agy-validate.test.mjs (commit 04ae068).
//
// THE ONE NAMED DIVERGENCE (27b). CoalMine's dist carries a root plugin.json, its native AG install route. CoalBoard's
// dist does not, by product decision: agy would stop at one error ("no plugin.json found at the plugin root") and read
// components.agents 0 without opening any agent. So the witness copies the built plugin/ into a temp folder and writes a
// root plugin.json there, holding only name, version and description from plugin/.claude-plugin/plugin.json. The shipped
// dist keeps no root plugin.json: that would be a native AG route, not in this unit. Warnings (commands and hooks that
// never load, the SKILL body over 24000 bytes) are not asserted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { probeAgy } from './lib/agy-probe.mjs';
import { removeTree } from './lib/test-teardown.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLUGIN = path.join(repo, 'plugin');
const AGY_TIMEOUT_MS = 120000;

test('agy validate: the built plugin has no error finding and every agent loads', (t) => {
  // Skip ONLY when agy is absent; a probe that hangs or fails is a failure (27b round 2).
  const probe = probeAgy({ timeoutMs: AGY_TIMEOUT_MS });
  if (probe.state === 'absent') { t.skip('agy not on PATH: AG plugin validation not run'); return; }
  assert.equal(probe.state, 'present', `agy probe failed (not a skip): ${probe.reason}`);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-agy-validate-'));
  t.after(() => removeTree(tmp));
  const staged = path.join(tmp, 'plugin');
  fs.cpSync(PLUGIN, staged, { recursive: true });
  const manifest = JSON.parse(fs.readFileSync(path.join(PLUGIN, '.claude-plugin', 'plugin.json'), 'utf8'));
  const { name, version, description } = manifest;
  fs.writeFileSync(path.join(staged, 'plugin.json'), JSON.stringify({ name, version, description }, null, 2) + '\n');
  const expectedAgents = fs.readdirSync(path.join(PLUGIN, 'agents')).filter((f) => f.endsWith('.md')).length;

  const r = spawnSync('agy', ['plugin', 'validate', staged, '--json'], { encoding: 'utf8', timeout: AGY_TIMEOUT_MS });
  assert.equal(r.error, undefined, `agy plugin validate did not run: ${r.error && r.error.code}`);

  let report;
  try { report = JSON.parse(r.stdout); } catch (e) {
    assert.fail(`agy plugin validate printed no JSON report (exit ${r.status}): ${e.message}\n${r.stdout}\n${r.stderr}`);
  }

  const errors = (report.findings || []).filter((f) => f.severity === 'error');
  assert.deepEqual(
    errors.map((f) => `${f.file}: ${f.message}`), [],
    'agy reports error findings on the built plugin',
  );
  assert.equal(report.components.agents, expectedAgents, `agy loads ${report.components.agents} of ${expectedAgents} agents`);
});
