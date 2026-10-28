// 28b: the load set is the three files an agent reads before Step 0 (SKILL.md, references/steps.md, references/rails.md), held as one named constant
// in load-set.mjs. These tests pin the constant to the References ledger: a reference the ledger drops, or lists as anything but MANDATORY, is a
// finding, and so is a load-set file that was not supplied. Fixtures are built in memory from the real files; nothing under the tree is written.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOAD_SET, LOAD_REFS, SKILL_REL, loadSetFiles, checkLoadSet, checkAntigravityLoad, ANTIGRAVITY_BODY_CAP } from './load-set.mjs';

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

// BOUNCE 1 (INSPECT F1, F2): the Antigravity load facts and the one-source heading rule. Red on the mutants n5, n2, n1, n1b (F1) and n4, n6 (F2).
const withoutSection = (text, heading) => {
  const a = text.indexOf(heading);
  if (a < 0) throw new Error(`no ${heading}`);
  const n = text.indexOf('\n## ', a + heading.length);
  return text.slice(0, a) + (n === -1 ? '' : text.slice(n + 1));
};
const sectionOf = (text, heading) => {
  const a = text.indexOf(heading);
  const n = text.indexOf('\n## ', a + heading.length);
  return text.slice(a, n === -1 ? text.length : n + 1);
};
const PAD = ('Padding prose that an edit might add to the intro. ').repeat(70);

test('the shipped skill passes the Antigravity load facts: body within the cap, ## The steps inside it, and the MANDATORY line names both references', () => {
  const skill = realFiles().find((f) => f.rel === SKILL_REL);
  assert.deepEqual(checkAntigravityLoad(skill), []);
  assert.equal(ANTIGRAVITY_BODY_CAP, 24000);
});

test('n5: a SKILL.md body grown past 24,000 bytes is a finding (the Antigravity load is cut at the cap)', () => {
  const grown = withText(realFiles(), SKILL_REL, (t) => t.replace('\n## Entry', '\n' + PAD + '\n\n## Entry')).find((f) => f.rel === SKILL_REL);
  const f = checkAntigravityLoad(grown);
  assert.ok(f.some((m) => /body is \d+ bytes, over the 24000-byte Antigravity load/.test(m)), f.join('\n'));
});

test('n5b: ## The steps pushed past the first 24,000 body bytes is a finding, whatever the body total', () => {
  const pushed = withText(realFiles(), SKILL_REL, (t) => t.replace('\n## The steps', '\n' + PAD + PAD + '\n## The steps')).find((f) => f.rel === SKILL_REL);
  const f = checkAntigravityLoad(pushed);
  assert.ok(f.some((m) => /## The steps begins at body byte \d+, past the 24000-byte load/.test(m)), f.join('\n'));
});

test('n2: deleting the MANDATORY read line from ## The steps is a finding', () => {
  const cut = withText(realFiles(), SKILL_REL, (t) => t.split('\n').filter((l) => !l.startsWith('**MANDATORY: read `references/rails.md`')).join('\n')).find((f) => f.rel === SKILL_REL);
  const f = checkAntigravityLoad(cut);
  assert.ok(f.some((m) => /## The steps does not name references\/rails\.md and references\/steps\.md as MANDATORY before Step 0/.test(m)), f.join('\n'));
});

test('n1: the steps.md ledger row demoted to on-demand is a finding', () => {
  const demoted = withText(realFiles(), SKILL_REL, (t) => t.replace('| `references/steps.md` | **MANDATORY before Step 0, every lane and every mode** —', '| `references/steps.md` | on-demand (no longer MANDATORY) —'));
  const f = checkLoadSet(demoted);
  assert.ok(f.some((m) => /lists references\/steps\.md but not as MANDATORY before Step 0, every lane/.test(m)), f.join('\n'));
});

test('n1b: the rails.md ledger row narrowed to "MANDATORY on the manual lane" is a finding (the exact phrase is held, not the bare word)', () => {
  const narrowed = withText(realFiles(), SKILL_REL, (t) => t.replace('| `references/rails.md` | **MANDATORY before Step 0, every lane and every mode** —', '| `references/rails.md` | **MANDATORY on the manual lane** —'));
  const f = checkLoadSet(narrowed);
  assert.ok(f.some((m) => /lists references\/rails\.md but not as MANDATORY before Step 0, every lane/.test(m)), f.join('\n'));
});

test('n4: a second copy of ## Step 4 in SKILL.md is a finding (each step is one heading across the load set)', () => {
  const step4 = sectionOf(read(path.join(skillDir, 'references', 'steps.md')), '## Step 4');
  const doubled = withText(realFiles(), SKILL_REL, (t) => t.replace('\n## Self error-report', '\n' + step4 + '## Self error-report'));
  const f = checkLoadSet(doubled);
  assert.ok(f.some((m) => /## Step 4 appears 2 times across the load set/.test(m)), f.join('\n'));
});

test('n6: ## Step 2 deleted from steps.md is a finding (a missing heading, not a silent pass)', () => {
  const cut = withText(realFiles(), STEPS, (t) => withoutSection(t, '## Step 2 — '));
  const f = checkLoadSet(cut);
  assert.ok(f.some((m) => /## Step 2 appears 0 times across the load set/.test(m)), f.join('\n'));
});

test('every standing rail heading (Memory & resume, Modes, Grants & denials, Always) appears exactly once in the shipped load set', () => {
  assert.deepEqual(checkLoadSet(realFiles()), []);
  const counts = ['## Memory & resume', '## Modes', '## Grants & denials', '## Always'].map((h) => realFiles().filter((f) => LOAD_SET.includes(f.rel)).flatMap((f) => f.text.split('\n')).filter((l) => l.startsWith(h)).length);
  assert.deepEqual(counts, [1, 1, 1, 1]);
});
