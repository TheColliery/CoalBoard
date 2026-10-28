// 28b: the load set is the three files an agent reads before Step 0 (SKILL.md, references/steps.md, references/rails.md), held as one named constant
// in load-set.mjs. These tests pin the constant to the References ledger: a reference the ledger drops, or lists as anything but MANDATORY, is a
// finding, and so is a load-set file that was not supplied. Fixtures are built in memory from the real files; nothing under the tree is written.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOAD_SET, LOAD_REFS, SKILL_REL, loadSetFiles, checkLoadSet } from './load-set.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const skillDir = path.join(root, 'skills', 'coalboard');
const read = (p) => fs.readFileSync(p, 'utf8');
const realFiles = () => [
  { rel: 'skills/coalboard/SKILL.md', text: read(path.join(skillDir, 'SKILL.md')) },
  ...fs.readdirSync(path.join(skillDir, 'references')).filter((f) => f.endsWith('.md')).map((f) => ({ rel: `skills/coalboard/references/${f}`, text: read(path.join(skillDir, 'references', f)) })),
];
const STEPS = 'skills/coalboard/references/steps.md';
const RAILS = 'skills/coalboard/references/rails.md';
const withText = (files, rel, fn) => files.map((f) => (f.rel === rel ? { ...f, text: fn(f.text) } : f));
const dropLine = (rel, pred) => (text) => text.split('\n').filter((l) => !pred(l)).join('\n');

test('the load set is SKILL.md plus the two references, in that order, and the constant names exactly those', () => {
  assert.deepEqual(LOAD_REFS, ['references/steps.md', 'references/rails.md']);
  assert.deepEqual(LOAD_SET, [SKILL_REL, STEPS, RAILS]);
  assert.deepEqual(loadSetFiles(realFiles()).map((f) => f.rel), LOAD_SET);
});

test('the shipped skill passes: both references are MANDATORY rows of the References ledger, and every load-set file is supplied', () => {
  assert.deepEqual(checkLoadSet(realFiles()), []);
});

test('m3: deleting references/steps.md from the References ledger is a finding (the load set is the ledger, not a comment)', () => {
  const dropped = withText(realFiles(), SKILL_REL, dropLine(SKILL_REL, (l) => l.startsWith('|') && l.includes('references/steps.md')));
  const f = checkLoadSet(dropped);
  assert.ok(f.some((m) => /SKILL\.md References table has no row for references\/steps\.md/.test(m)), f.join('\n'));
});

test('a load-set reference the ledger lists as anything but MANDATORY is a finding', () => {
  const demoted = withText(realFiles(), SKILL_REL, (t) => t.replace('| `references/rails.md` | **MANDATORY before Step 0', '| `references/rails.md` | on-demand before Step 0'));
  const f = checkLoadSet(demoted);
  assert.ok(f.some((m) => /lists references\/rails\.md but not as MANDATORY before Step 0/.test(m)), f.join('\n'));
});

test('a load-set file that is not supplied is a finding, never a silent pass', () => {
  const missing = realFiles().filter((f) => f.rel !== STEPS);
  const f = checkLoadSet(missing);
  assert.ok(f.some((m) => /references\/steps\.md is in the load set but was not supplied/.test(m)), f.join('\n'));
});

test('a file outside the load set is not counted: lens-prompts.md is read by its own gates, never by the load set', () => {
  const names = loadSetFiles(realFiles()).map((f) => f.rel);
  assert.ok(!names.includes('skills/coalboard/references/lens-prompts.md'));
  assert.ok(names.includes(RAILS) && names.includes(STEPS));
});
