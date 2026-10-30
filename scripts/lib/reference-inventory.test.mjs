// 29b-c1 (CR-2): each shipped reference keeps the level-2 headings the inventory snapshots, and platform-antigravity.md keeps the reap rail's
// content anchor (manage_subagents and kill_all on one line). Fixtures are built in memory from the real files; nothing under the tree is written.
// The v2.9.0 case is the reviewer's witness: the 4-line file that CR-2 found green through every gate. It is an inline copy, byte-equal to
// `git show v2.9.0:…` (proven at 29b-c1 CI-red), so the test never reads git history and runs in a shallow clone with no tags.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REFERENCE_HEADINGS, REAP_RAIL, checkReferenceInventory } from './reference-inventory.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const refDir = path.join(root, 'skills', 'coalboard', 'references');
const read = (p) => fs.readFileSync(p, 'utf8');
const SRC = 'skills/coalboard/';
const DIST = 'plugin/skills/coalboard/';
const treeFiles = (prefix) => fs.readdirSync(refDir).filter((f) => f.endsWith('.md')).sort().map((f) => ({ rel: `${prefix}references/${f}`, text: read(path.join(refDir, f)) }));
const withText = (files, rel, fn) => files.map((f) => (f.rel === rel ? { ...f, text: fn(f.text) } : f));
const ANTIGRAVITY = 'platform-antigravity.md';
const V290 = [
  "# CoalBoard on Antigravity (validated, measured 2026-10-29)",
  "",
  "> Loaded ON-DEMAND when running the board on Antigravity. The SKILL.md flow is the same on every platform; this maps the platform-agnostic contract to AG's tools and the caveats. Measured 2026-10-29 with agy 1.4.8 (a self-run headless check, not third-party-audited): the SKILL.md body is 21,047 bytes, under Antigravity's 24,000-byte load, and the mandatory references `references/rails.md` and `references/steps.md` are read on demand; a report-only `/coalboard` load check read them and reached Step 4 with every rail read. The 2026-06-22 validation (Claude Opus 4.6, self-run) predates the 2.8.10 and 2.8.11 bodies (51,244 and 51,554 bytes), which did not fit; 2.9.0 moved the steps and the standing rails into references.",
  "A platform with no read-only/leaf toggle OR no reap tool \u2192 fall back to the SKILL's conservative path (fewer workers, sequential, flag UNVERIFIED). AG has both, so the tool mapping above applies.",
  "",
].join('\n');

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
