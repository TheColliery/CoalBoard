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

// 29b-c1 (T-28b-1): the ## The steps line must name "every lane" as well as "before Step 0". x1 keeps "before Step 0" and narrows the rest to the manual lane.
test('x1: the ## The steps line narrowed to "on the manual lane only" is a finding (the phrase must name every lane, not only before Step 0)', () => {
  const x1 = withText(realFiles(), SKILL_REL, (t) => t.replace('in full before Step 0, on every lane and in every mode.', 'in full before Step 0, on the manual lane only.')).find((f) => f.rel === SKILL_REL);
  assert.ok(x1.text.includes('on the manual lane only'), 'the x1 mutation changed nothing');
  const f = checkAntigravityLoad(x1);
  assert.ok(f.some((m) => /## The steps does not name references\/rails\.md and references\/steps\.md as MANDATORY before Step 0, every lane/.test(m)), f.join('\n'));
});

// 29js (T-29jq-1): under auto, a missing session-start line renders the box as under ask (P2). The phrase must sit in the source and in the shipped copy.
test('29js: references/steps.md and its plugin copy both say that with no session-start line the box renders as under ask', () => {
  const PHRASE = 'when no session-start line is in context, render the box as under `ask`';
  for (const rel of [STEPS, 'plugin/skills/coalboard/references/steps.md']) {
    assert.ok(read(path.join(root, rel)).includes(PHRASE), `${rel} lacks the phrase: ${PHRASE}`);
  }
});

// 29oh (T-29og-1, T-29oh-1): nothing outside .coalboard/ is written until the GATE 3 apply is answered; CONFIRM at GATE 1 only convenes.
// The two phrases must sit in steps.md and in its plugin copy.
test('29oh: references/steps.md and its plugin copy say nothing outside .coalboard/ is written until the GATE 3 apply is answered', () => {
  const PHRASES = ['nothing outside `.coalboard/` is written until the GATE 3 apply is answered', 'CONFIRM at GATE 1 only convenes the board'];
  for (const rel of [STEPS, 'plugin/skills/coalboard/references/steps.md']) {
    for (const phrase of PHRASES) {
      assert.ok(read(path.join(root, rel)).includes(phrase), `${rel} lacks the phrase: ${phrase}`);
    }
  }
});

// 29ow (T-29oh-1): CONFIRM at GATE 1 only convenes; a missing cb-* type stages and asks GATE 3; no live write from a CONFIRM whose board cannot convene.
// Three legs, on steps.md and its plugin copy: (1) the box names CONFIRM's meaning; (2) the missing-type branch names proposed/, NOT-CHECKED and GATE 3;
// (3) the old sign-off and the old CANCEL-scoped-to-no-board wording are gone, and CANCEL alone reaches the board-less path.
test('29ow: references/steps.md and its plugin copy name CONFIRM as convene only, branch a missing cb-* type to staging and GATE 3, and scope the board-less path to CANCEL', () => {
  const BOX = 'CONFIRM = convene the board on this bill and nothing more; no file outside `.coalboard/` changes until a separate GATE 3 question is answered';
  const BRANCH_START = 'A missing or unspawnable `cb-*` type';
  const BRANCH_END = '**WHY structural-not-prose';
  const OLD_SIGNOFF = 'the CONFIRM is the sign-off';
  const OLD_CANCEL = 'proceed with the underlying request normally, board-less, saying so in one line';
  const NEW_CANCEL = 'only the user\'s CANCEL reaches this path';
  for (const rel of [STEPS, 'plugin/skills/coalboard/references/steps.md']) {
    const text = read(path.join(root, rel));
    assert.ok(text.includes(BOX), `${rel} lacks the CONFIRM box meaning: ${BOX}`);
    const a = text.indexOf(BRANCH_START);
    assert.ok(a !== -1, `${rel} lacks the missing-type branch: ${BRANCH_START}`);
    const b = text.indexOf(BRANCH_END, a);
    const branch = text.slice(a, b === -1 ? undefined : b);
    for (const token of ['`.coalboard/proposed/`', 'NOT-CHECKED', 'GATE 3']) {
      assert.ok(branch.includes(token), `${rel}: the missing-type branch lacks ${token}`);
    }
    assert.ok(!text.includes(OLD_SIGNOFF), `${rel} still says: ${OLD_SIGNOFF}`);
    assert.ok(!text.includes(OLD_CANCEL), `${rel} still says the board-less path without CANCEL scope: ${OLD_CANCEL}`);
    assert.ok(text.includes(NEW_CANCEL), `${rel} lacks the CANCEL-only scope: ${NEW_CANCEL}`);
  }
});

// 29qi (T-29pf-1, T-29pj-1, T-29oh-3): the pins a text fix must keep, on the source and the plugin copy. Each predicate is also run on a
// copy with its phrase removed and must then fail, so a pin that matches nothing cannot pass.
const carries = (text, phrases) => phrases.every((p) => text.includes(p));
const onBoth = (rel) => [rel, path.join('plugin', rel)];
const FAILMODES = 'skills/coalboard/references/failure-modes.md';
const F7_PHRASES = ['staged under `.coalboard/proposed/` with GATE 3 still asked', 'a missing `cb-*` type is the same case'];
const RAIL_PHRASE = 'keeps every write rail, and stages under `.coalboard/proposed/` until GATE 3';
const ACT_START = "The judge's verdict is not itself an ask.";
const ACT_END = 'UNLESS one of these three fires';
const ACT_PHRASE = 'the opinion run itself writes no file';
const LEDGER_PHRASES = ['S2 backup and S3 clone', 'On-disk output'];
const actParagraph = (text) => {
  const a = text.indexOf(ACT_START);
  const b = a === -1 ? -1 : text.indexOf(ACT_END, a);
  return b === -1 ? '' : text.slice(a, b);
};
const actOk = (text) => { const p = actParagraph(text); return p.includes(ACT_PHRASE) && !/GATE 3|staging/.test(p); };

// T-29pf-1 pin 1: SKILL.md's F7 line names the staging to GATE 3 and the missing-type case.
test('29qi pin 1: SKILL.md F7 names GATE 3 staging and the missing cb-* type, on the source and the plugin copy', () => {
  for (const rel of onBoth(SKILL_REL)) {
    assert.ok(carries(read(path.join(root, rel)), F7_PHRASES), `${rel} lacks an F7 phrase`);
  }
  const mutant = read(path.join(root, SKILL_REL)).replace(F7_PHRASES[0], '');
  assert.equal(carries(mutant, F7_PHRASES), false, 'a copy without the F7 phrase must fail the pin');
});

// T-29pf-1 pin 2: the parenthesis at failure-modes.md:19 and steps.md:36 says the same thing, in both homes and both copies.
test('29qi pin 2: failure-modes.md and steps.md carry the inline-self staging parenthesis, on the source and the plugin copy', () => {
  for (const rel of [...onBoth(FAILMODES), ...onBoth(STEPS)]) {
    assert.ok(read(path.join(root, rel)).includes(RAIL_PHRASE), `${rel} lacks: ${RAIL_PHRASE}`);
  }
  const mutant = read(path.join(root, FAILMODES)).replace(RAIL_PHRASE, '');
  assert.equal(mutant.includes(RAIL_PHRASE), false, 'a copy without the parenthesis must fail the pin');
});

// T-29pf-1 pin 3 (T-29pj-1's antibody): the opinion-lane ACT paragraph names neither GATE 3 nor staging, and says the opinion run writes no file.
// Scoped to the ACT paragraph (from its opening sentence to the ESCALATE list): the GATE 3 bullet in the same section says "no GATE 3 there" and is
// not an ACT line.
test('29qi pin 3: the opinion-lane ACT paragraph names no GATE 3 and no staging, and says the opinion run writes no file', () => {
  for (const rel of onBoth(SKILL_REL)) {
    assert.ok(actOk(read(path.join(root, rel))), `${rel}: the ACT paragraph names GATE 3 or staging, or lacks "${ACT_PHRASE}"`);
  }
  const mutant = read(path.join(root, SKILL_REL)).replace(ACT_PHRASE, 'staging is part of acting, and no live change is made before GATE 3');
  assert.equal(actOk(mutant), false, 'the 2.9.21 ACT text must fail the pin');
});

// T-29oh-3 ledger pin: the On-disk output ledger names the S2 backup and the S3 clone, the copies the skill writes before GATE 3.
test('29qi ledger pin: SKILL.md\'s On-disk output ledger names the S2 backup and the S3 clone, on the source and the plugin copy', () => {
  for (const rel of onBoth(SKILL_REL)) {
    assert.ok(carries(read(path.join(root, rel)), LEDGER_PHRASES), `${rel} lacks a ledger phrase: ${LEDGER_PHRASES.join(' | ')}`);
  }
  const mutant = read(path.join(root, SKILL_REL)).replace(LEDGER_PHRASES[0], '');
  assert.equal(carries(mutant, LEDGER_PHRASES), false, 'a ledger without the S2 backup and S3 clone must fail the pin');
});

// 29qi M1 (INSPECT 29qi-4): each pointer to the pre-GATE-3 exceptions says the change the task asks for is never one of them and waits for GATE 3.
// The pointer sentence is "The skill's own writes are excepted: ..."; every such sentence carries the new words, in steps.md, SKILL.md and the conductor line.
const M1_PHRASE = 'the change the task asks for is never one of them: it waits for GATE 3';
const M1_POINTER = 'own writes are excepted';
test('29qi M1: each pointer to the pre-GATE-3 exceptions also says the task\'s requested change is never excepted and waits for GATE 3, on the source and the plugin copy', () => {
  for (const rel of [...onBoth(STEPS), ...onBoth(SKILL_REL), ...onBoth('hooks/coalboard-conductor.js')]) {
    const text = read(path.join(root, rel));
    const pointers = text.split(M1_POINTER).length - 1;
    const withWords = text.split(M1_PHRASE).length - 1;
    assert.ok(pointers >= 1, `${rel} has no pointer to the exceptions`);
    assert.equal(withWords, pointers, `${rel}: ${pointers} pointer(s), ${withWords} carrying the GATE 3 words`);
  }
});
