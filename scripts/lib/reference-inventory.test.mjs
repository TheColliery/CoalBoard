// 29b-c1 (CR-2): each shipped reference keeps the level-2 headings the inventory snapshots, and platform-antigravity.md keeps the reap rail's
// content anchor (manage_subagents and kill_all on one line). Fixtures are built in memory from the real files; nothing under the tree is written.
// The v2.9.0 case is the reviewer's witness: the 4-line file that CR-2 found green through every gate.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { REFERENCE_HEADINGS, REAP_RAIL, checkReferenceInventory } from './reference-inventory.mjs';
import { gitEnv } from './git-env.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const refDir = path.join(root, 'skills', 'coalboard', 'references');
const read = (p) => fs.readFileSync(p, 'utf8');
const SRC = 'skills/coalboard/';
const DIST = 'plugin/skills/coalboard/';
const treeFiles = (prefix) => fs.readdirSync(refDir).filter((f) => f.endsWith('.md')).sort().map((f) => ({ rel: `${prefix}references/${f}`, text: read(path.join(refDir, f)) }));
const withText = (files, rel, fn) => files.map((f) => (f.rel === rel ? { ...f, text: fn(f.text) } : f));
const ANTIGRAVITY = 'platform-antigravity.md';
const V290 = execFileSync('git', ['show', 'v2.9.0:skills/coalboard/references/platform-antigravity.md'], { cwd: root, encoding: 'utf8', env: gitEnv(root), timeout: 30000 });

test('the shipped references pass the inventory on source and on dist', () => {
  assert.deepEqual(checkReferenceInventory(treeFiles(SRC), SRC), []);
  assert.deepEqual(checkReferenceInventory(treeFiles(DIST), DIST), []);
});

test('the inventory names every shipped reference, and each heading it lists is a level-2 heading of its file', () => {
  const onDisk = fs.readdirSync(refDir).filter((f) => f.endsWith('.md')).sort();
  assert.deepEqual(Object.keys(REFERENCE_HEADINGS).sort(), onDisk);
  for (const [file, headings] of Object.entries(REFERENCE_HEADINGS)) {
    assert.ok(headings.length > 0, `${file} has no headings listed`);
    const lines = read(path.join(refDir, file)).split('\n');
    for (const h of headings) assert.ok(lines.includes(h), `${file} lacks ${h}`);
  }
});

test('a level-2 heading the inventory lists and its file lost is a finding (named file and heading)', () => {
  const cut = withText(treeFiles(SRC), `${SRC}references/${ANTIGRAVITY}`, (t) => t.split('\n').filter((l) => l !== '## Verified caveats').join('\n'));
  const f = checkReferenceInventory(cut, SRC);
  assert.ok(f.some((m) => m.includes('platform-antigravity.md') && m.includes('## Verified caveats')), f.join('\n'));
});

test('f7b1f6d: the 4-line platform-antigravity.md is red, naming the three missing headings and the reap anchor', () => {
  const restored = withText(treeFiles(SRC), `${SRC}references/${ANTIGRAVITY}`, () => V290);
  const f = checkReferenceInventory(restored, SRC);
  for (const h of ['## Tool mapping (Claude Code → Antigravity)', '## Verified caveats', '## Degrade']) {
    assert.ok(f.some((m) => m.includes(h)), `no finding for ${h}\n${f.join('\n')}`);
  }
  assert.ok(f.some((m) => m.includes('manage_subagents') && m.includes('kill_all')), f.join('\n'));
});

test('m3: the kill_all reap row deleted alone, headings intact, is a finding on the reap anchor', () => {
  const noReap = withText(treeFiles(SRC), `${SRC}references/${ANTIGRAVITY}`, (t) => t.split('\n').filter((l) => !(l.includes('manage_subagents') && l.includes('kill_all'))).join('\n'));
  const f = checkReferenceInventory(noReap, SRC);
  assert.ok(f.some((m) => m.includes('manage_subagents') && m.includes('kill_all')), f.join('\n'));
  assert.ok(!f.some((m) => m.includes('## ')), f.join('\n'));
});

test('a reference the inventory names that is missing from disk is a finding', () => {
  const missing = treeFiles(SRC).filter((f) => !f.rel.endsWith('/wizard.md'));
  const f = checkReferenceInventory(missing, SRC);
  assert.ok(f.some((m) => m.includes('wizard.md') && /missing|not supplied|not found/.test(m)), f.join('\n'));
});

test('the reap anchor is a single line holding both terms, and the file it names is the Antigravity reference', () => {
  assert.equal(REAP_RAIL.file, ANTIGRAVITY);
  assert.deepEqual(REAP_RAIL.terms, ['manage_subagents', 'kill_all']);
  const onOneLine = read(path.join(refDir, ANTIGRAVITY)).split('\n').some((l) => REAP_RAIL.terms.every((t) => l.includes(t)));
  assert.ok(onOneLine);
});
