// Hermetic spawn tests for scripts/verify.mjs (CWK-078) -- the gate has no per-item report
// contract to unit-test in isolation (it operates on THIS repo's own tree, not a parameter),
// so its two new derivation properties are proven the way node/runtime.md's own testing
// convention asks for a gate/CLI entry: spawn the real file, assert exit code and the
// sanctioned-output shape. Every mutation is reverted in a finally block; nothing here
// leaves the tree touched on either the pass or the fail path.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const verifyPath = path.join(root, 'scripts', 'verify.mjs');

function runVerify(env) {
  return spawnSync(process.execPath, [verifyPath], { cwd: root, env: env ?? process.env, encoding: 'utf8' });
}

test('pointer check root-derivation degrades to a named SKIP, never a FAIL, when git is unavailable', () => {
  // Only pcResolve() and the new pcDeriveRootSets() shell out to git in this file (grep-
  // confirmed) -- stripping any PATH entry that could resolve `git` makes both unreachable,
  // which is exactly the condition this test exists to exercise, without touching anything
  // else the gate checks.
  const scrubbed = (process.env.PATH || process.env.Path || '')
    .split(path.delimiter)
    .filter((p) => !/git/i.test(p))
    .join(path.delimiter);
  const env = { ...process.env, PATH: scrubbed, Path: scrubbed };
  const res = runVerify(env);
  assert.match(res.stdout, /pointer check.*(could not derive|SKIPPED)/i, res.stdout);
  assert.doesNotMatch(res.stdout, /FAIL pointer check/);
  assert.equal(res.status, 0, `expected the gate to still PASS overall with git absent -- got:\n${res.stdout}`);
});

test('the derived ignoredRoots (git check-ignore, not a hardcoded literal) still FAILs a citation into a non-hidden gitignored dir', () => {
  const skillPath = path.join(root, 'skills', 'coalboard', 'SKILL.md');
  const original = fs.readFileSync(skillPath, 'utf8');
  try {
    fs.writeFileSync(
      skillPath,
      `${original}\n<!-- verify.test.mjs fixture: see \`scratchpad/verify-test-fixture-cwk078.md\` -->\n`,
    );
    const res = runVerify();
    assert.notEqual(res.status, 0);
    assert.match(res.stdout, /gitignored `scratchpad\//);
  } finally {
    fs.writeFileSync(skillPath, original);
  }
});
