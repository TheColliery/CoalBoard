// R15 item 2 (CWK-160): one red-first mutant per safeguard. Each test removes or breaks ONE part of the contract in
// references/run-safety.md (or the places a model reads it) and asserts the gate names exactly that part.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkRunSafety, parseSafeguardLedger } from './run-safety.mjs';
import { checkSeatRights, parseSeatLedger, parseAgentTools, shellHolders } from './seat-rights.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const skillDir = path.join(root, 'skills', 'coalboard');
const read = (p) => fs.readFileSync(p, 'utf8');
const realFiles = () => [
  { rel: 'skills/coalboard/SKILL.md', text: read(path.join(skillDir, 'SKILL.md')) },
  ...fs.readdirSync(path.join(skillDir, 'references')).filter((f) => f.endsWith('.md')).map((f) => ({ rel: `skills/coalboard/references/${f}`, text: read(path.join(skillDir, 'references', f)) })),
];
const REF = 'skills/coalboard/references/run-safety.md';
const mutate = (rel, from, to) => realFiles().map((f) => {
  if (f.rel !== rel) return f;
  assert.equal(f.text.split(from).length - 1, 1, `fixture anchor must match exactly once: ${from.slice(0, 60)}`);
  return { ...f, text: f.text.replace(from, () => to) };
});
const dropRow = (id) => realFiles().map((f) => (f.rel === REF ? { ...f, text: f.text.split('\n').filter((l) => !l.startsWith(`| **${id}`)).join('\n') } : f));

test('the shipped contract passes', () => {
  assert.deepEqual(checkRunSafety({ files: realFiles() }), []);
});

test('the run-capable actors are DERIVED from SKILL.md: the two shell seats plus main', () => {
  const ledger = parseSeatLedger(read(path.join(skillDir, 'SKILL.md')));
  assert.deepEqual(shellHolders(ledger).sort(), ['adversary', 'feeling']);
});

test('RED-FIRST, the old source set: with no run-safety reference a run has no survey, backup, compare or cleanup', () => {
  const old = realFiles().filter((f) => f.rel !== REF);
  const f = checkRunSafety({ files: old });
  assert.equal(f.length, 1);
  assert.match(f[0], /run-safety\.md is missing/);
});

for (const id of ['S1', 'S2', 'S3', 'S4', 'S5', 'N1', 'N2']) {
  test(`mutant: a ledger without the ${id} row is named`, () => {
    const f = checkRunSafety({ files: dropRow(id) });
    assert.ok(f.some((m) => m.includes(`no ${id} row`)), f.join('\n'));
  });
}

test('S1/S2/S3/S5 bind every run-capable actor: dropping `adversary` from S2 is a finding naming S2 and adversary', () => {
  const ref = realFiles().find((f) => f.rel === REF).text;
  const s2 = ref.split('\n').find((l) => l.startsWith('| **S2'));
  const f = checkRunSafety({ files: mutate(REF, s2, s2.replace('main · feeling · adversary', 'main · feeling')) });
  assert.ok(f.some((m) => /S2 does not bind `adversary`/.test(m)), f.join('\n'));
});

test('a safeguard that states no proof for the return is a finding (S3)', () => {
  const ref = realFiles().find((f) => f.rel === REF).text;
  const s3 = ref.split('\n').find((l) => l.startsWith('| **S3'));
  const cells = s3.split('|');
  cells[4] = ' ';
  const f = checkRunSafety({ files: mutate(REF, s3, cells.join('|')) });
  assert.ok(f.some((m) => /S3 names no proof/.test(m)), f.join('\n'));
});

test('S4 (the box) is OPTIONAL by contract: REQUIRED, or no probe, or no fallback to S1-S3, is a finding', () => {
  assert.ok(checkRunSafety({ files: mutate(REF, '**S4 THE BOX** (OPTIONAL)', '**S4 THE BOX** (REQUIRED)') }).some((m) => /S4 \(the box\) must be marked OPTIONAL/.test(m)));
  const s4 = realFiles().find((f) => f.rel === REF).text.split('\n').find((l) => l.startsWith('| **S4'));
  assert.ok(checkRunSafety({ files: mutate(REF, s4, s4.replace(/probe/gi, 'lookup')) }).some((m) => /S4 names no capability probe/.test(m)));
  assert.ok(checkRunSafety({ files: mutate(REF, 'S1-S3 only, said in one line', 'nothing, said in one line') }).some((m) => /S4 names no fallback to S1-S3/.test(m)));
});

test('N1 must name the environment-variable form of pretend isolation', () => {
  const f = checkRunSafety({ files: mutate(REF, '**Never fake isolation with an environment variable**', '**Never fake isolation**') });
  assert.ok(f.some((m) => /N1 must name the environment-variable form/.test(m)), f.join('\n'));
});

test('the duty must reach the seat: a lens-prompts FIXED rule missing, or missing an id, is a finding', () => {
  const lensRel = 'skills/coalboard/references/lens-prompts.md';
  const line = realFiles().find((f) => f.rel === lensRel).text.split('\n').find((l) => /run-safety\.md/.test(l) && /^-\s/.test(l));
  assert.ok(checkRunSafety({ files: mutate(lensRel, line, '- (removed)') }).some((m) => /no FIXED rule that points at references\/run-safety\.md/.test(m)));
  assert.ok(checkRunSafety({ files: mutate(lensRel, ' · S5 remove your clone', ' · remove your clone') }).some((m) => /lens-prompts\.md FIXED rule does not name S5/.test(m)));
});

test("main's own runs: Step 4.2 must point at the ledger and the references table must list it MANDATORY", () => {
  const skill = 'skills/coalboard/SKILL.md';
  assert.ok(checkRunSafety({ files: mutate(skill, 'Isolation = `references/run-safety.md` S1-S5', 'Isolation = ') }).some((m) => /Step 4\.2 does not point at references\/run-safety\.md/.test(m)));
  assert.ok(checkRunSafety({ files: mutate(skill, '| **MANDATORY before ANY command is run against a target**', '| on-demand') }).some((m) => /not as MANDATORY/.test(m)));
});

test('the ledger parser reads ids, binds and proofs (S1 carries real paths and hashes as its proof)', () => {
  const rows = parseSafeguardLedger(realFiles().find((f) => f.rel === REF).text);
  assert.deepEqual(Object.keys(rows).sort(), ['N1', 'N2', 'S1', 'S2', 'S3', 'S4', 'S5']);
  assert.match(rows.S1.proof, /hashes/);
});

// The duty adds no RIGHT: the seats' tool rights stay exactly the ledger's (P19), agent defs agree.
const agentDefs = () => fs.readdirSync(path.join(root, 'agents')).filter((f) => f.endsWith('.md')).map((f) => ({ rel: `agents/${f}`, text: read(path.join(root, 'agents', f)) }));
const withTools = (seat, fn) => agentDefs().map((d) => (d.rel === `agents/cb-${seat}.md` ? { ...d, text: d.text.replace(/^tools:\s*(.+)$/m, (_, t) => `tools: ${fn(t.split(',').map((x) => x.trim())).join(', ')}`) } : d));
const skillText = () => read(path.join(skillDir, 'SKILL.md'));

test('the real agent defs match the Seat-permissions ledger exactly', () => {
  assert.deepEqual(checkSeatRights({ skillText: skillText(), agentDefs: agentDefs() }), []);
  assert.deepEqual(parseAgentTools(agentDefs()).data, ['Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch']);
});

test('a widened right is a finding: a shell on cb-truth, fetch on cb-feeling, a write tool anywhere, a missing fetch pair', () => {
  const f1 = checkSeatRights({ skillText: skillText(), agentDefs: withTools('truth', (t) => [...t, 'Bash']) });
  assert.ok(f1.some((m) => /cb-truth: grants Bash but the ledger row says no run/.test(m)), f1.join('\n'));
  const f2 = checkSeatRights({ skillText: skillText(), agentDefs: withTools('feeling', (t) => [...t, 'WebFetch']) });
  assert.ok(f2.some((m) => /cb-feeling: grants WebFetch but the ledger row says no fetch/.test(m)), f2.join('\n'));
  const f3 = checkSeatRights({ skillText: skillText(), agentDefs: withTools('adversary', (t) => [...t, 'Write']) });
  assert.ok(f3.some((m) => /cb-adversary: grants Write, which NO seat is ever granted/.test(m)), f3.join('\n'));
  const f4 = checkSeatRights({ skillText: skillText(), agentDefs: withTools('data', (t) => t.filter((x) => x !== 'WebSearch')) });
  assert.ok(f4.some((m) => /cb-data: the ledger row says fetch but WebSearch is not granted/.test(m)), f4.join('\n'));
});

test('a ledger row edited without its agent def is a finding (a data seat given a shell in the ledger only)', () => {
  const widened = skillText().replace('| **data** (sub1 empirical) | ✔ | ✖ | ✔ |', '| **data** (sub1 empirical) | ✔ | ✔ | ✔ |');
  assert.notEqual(widened, skillText());
  const f = checkSeatRights({ skillText: widened, agentDefs: agentDefs() });
  assert.ok(f.some((m) => /cb-data: the ledger row says run but no shell tool is granted/.test(m)), f.join('\n'));
});

// R15 findings-back round 1 (MEDIUM-2, LOW-1): content anchors, one red mutant per row of the reviewer's table.
const sentenceCases = [
  ['S1', "Record each one's mtime and SHA-256. ", '', /S1 must say to record each real file's mtime and SHA-256/],
  ['S2', 'RESTORE the file from the backup and report it', 'report it', /S2 must say a changed real file is RESTORED/],
  ['S3', 'Never in the session scratchpad.', 'The session scratchpad is fine.', /S3 must keep the clone outside the home tree/],
  ['S5', 'a NARROW delete: exactly the directory this run created', 'a recursive delete of the whole lab root', /S5 must keep the NARROW delete/],
];
for (const [id, from, to, expect] of sentenceCases) {
  test(`MEDIUM-2: reversing the ${id} sentence is a finding (the owner's amendment is bound, not just the row)`, () => {
    const f = checkRunSafety({ files: mutate(REF, from, to) });
    assert.ok(f.some((m) => expect.test(m)), `${id}: ${f.join(' | ')}`);
  });
}

test('MEDIUM-2: N2 must keep "HOME stays real unless a real box is in use"', () => {
  const f = checkRunSafety({ files: mutate(REF, 'stays real unless a real box (S4) is in use', 'may point at a temp directory when no box exists') });
  assert.ok(f.some((m) => /N2 must keep "HOME stays real"/.test(m)), f.join(' | '));
});

test('LOW-1: the S4 probe section asks BOTH ways out of a WSL box: launched Windows processes and the drives (manual and fstab mounts)', () => {
  const noInterop = checkRunSafety({ files: mutate(REF, '`[interop] enabled`', '`[interop-removed] enabled`') });
  assert.ok(noInterop.some((m) => /\[interop\]/.test(m)), noInterop.join(' | '));
  const noFstab = checkRunSafety({ files: realFiles().map((f) => (f.rel === REF ? { ...f, text: f.text.replace(/fstab/g, 'a table') } : f)) });
  assert.ok(noFstab.some((m) => /\[automount\]/.test(m)), noFstab.join(' | '));
  const text = realFiles().find((f) => f.rel === REF).text;
  assert.ok(text.includes('https://learn.microsoft.com/en-us/windows/wsl/wsl-config'), 'the wsl.conf page is cited');
  assert.ok(/no probe command is fixed here/.test(text), 'no probe command is invented');
});
