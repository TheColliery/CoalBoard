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

test('S4 (the box) is OPTIONAL in general by contract: REQUIRED, or no probe, or no fallback to S1-S3, is a finding', () => {
  assert.ok(checkRunSafety({ files: mutate(REF, '**S4 THE BOX** (OPTIONAL; MANDATORY for non-file effects)', '**S4 THE BOX** (REQUIRED)') }).some((m) => /S4 \(the box\) must be marked OPTIONAL/.test(m)));
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
  // u2: the lens line's closing sentence now also says "S1, S2 or S5", so dropping the S5 clause alone no longer drops the id; both go.
  const noS5 = mutate(lensRel, ' · S5 remove your clone', ' · remove your clone').map((f) => (f.rel === lensRel ? { ...f, text: f.text.replace('You cannot do S1, S2 or S5', 'You cannot do the above') } : f));
  assert.ok(checkRunSafety({ files: noS5 }).some((m) => /lens-prompts\.md FIXED rule does not name S5/.test(m)));
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

// A page is CITED when it appears as a whole link token, never as a substring of a longer URL (a substring test also
// passes "https://other.example/<url>", the shape CodeQL's js/incomplete-url-substring-sanitization names).
const urlTokens = (text) => text.match(/https?:\/\/[^\s)\],;`'"<>]+/g) || [];
const cites = (text, url) => urlTokens(text).some((tok) => tok.replace(/\/+$/, '') === url);

test('cites(): a whole link token passes; a removed, extended or host-prefixed URL does not', () => {
  const url = 'https://learn.microsoft.com/en-us/windows/wsl/wsl-config';
  assert.ok(cites(`Microsoft Learn (${url}), read`, url));
  assert.ok(!cites('no link here', url), 'removed');
  assert.ok(!cites(`${url}-evil`, url), 'altered: a longer path');
  assert.ok(!cites(`https://evil.example/${url}`, url), 'a substring of another host\'s URL');
});

test('LOW-1: the S4 probe section asks BOTH ways out of a WSL box: launched Windows processes and the drives (manual and fstab mounts)', () => {
  const noInterop = checkRunSafety({ files: mutate(REF, '`[interop] enabled`', '`[interop-removed] enabled`') });
  assert.ok(noInterop.some((m) => /\[interop\]/.test(m)), noInterop.join(' | '));
  const noFstab = checkRunSafety({ files: realFiles().map((f) => (f.rel === REF ? { ...f, text: f.text.replace(/fstab/g, 'a table') } : f)) });
  assert.ok(noFstab.some((m) => /\[automount\]/.test(m)), noFstab.join(' | '));
  const text = realFiles().find((f) => f.rel === REF).text;
  assert.ok(cites(text, 'https://learn.microsoft.com/en-us/windows/wsl/wsl-config'), 'the wsl.conf page is cited as a whole link');
  assert.ok(/no probe command is fixed here/.test(text), 'no probe command is invented');
});

// UMB2-008 (owner 2026-10-07, verbatim: "ถ้างั้นอยู่ที่ไหนก็ได้ แต่ต้องลบ clone ทั้งหมด เมื่อรันจบ"): the clone may live anywhere, the
// whole clone is removed when the run ends, and the one class S2 cannot restore (non-file effects) never runs outside a box.
// One red mutant per NEW anchor: each edits ONE cell of ONE row (or the lens line) and the gate must name exactly that part.
const refText = () => realFiles().find((f) => f.rel === REF).text;
const mutateCell = (id, cell, from, to, all = false) => {
  const line = refText().split('\n').find((l) => l.startsWith(`| **${id}`));
  const cells = line.split('|');
  const n = cells[cell].split(from).length - 1;
  assert.ok(all ? n >= 1 : n === 1, `${id} cell ${cell} must hold "${from}" ${all ? 'at least' : 'exactly'} once`);
  cells[cell] = cells[cell].split(from).join(to);
  return mutate(REF, line, cells.join('|'));
};
const LENS = 'skills/coalboard/references/lens-prompts.md';
const lensLineText = () => realFiles().find((f) => f.rel === LENS).text.split('\n').find((l) => /run-safety\.md/.test(l) && /^-\s/.test(l));
// These two index the RAW row.split('|') used by mutateCell, where cell 0 is the empty text before the leading pipe and cell 1 the id. They sit one
// off from parseSafeguardLedger's cells (it takes slice(1, -1), so its safeguard is cells[1] and its proof cells[3]): a swap to the parser's cells
// would shift every mutant by one without a failure (t24 #3).
const SAFEGUARD = 2;
const PROOF = 4;
const LEARN = 'https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/icacls';
const newAnchors = [
  // UMB2-008 round 2
  ['S2 inside the run directory', () => mutateCell('S2', SAFEGUARD, 'inside the run directory', 'somewhere the run cannot reach'), /S2 must put the backup inside the run directory/],
  ['S2 SIBLING of the clone', () => mutateCell('S2', SAFEGUARD, 'SIBLING of the clone', 'child of the clone'), /S2 must put the backup beside the clone as a SIBLING/],
  ['S2 never an ancestor', () => mutateCell('S2', SAFEGUARD, 'never an ancestor of the clone', 'sometimes above the clone'), /S2 must say the backup is never an ancestor of the clone/],
  ['S2 manifest.txt', () => mutateCell('S2', SAFEGUARD, 'manifest.txt', 'notes'), /S2 must name backup files by SHA-256 and keep the original paths in one manifest\.txt/],
  ['S3 RUN DIRECTORY', () => mutateCell('S3', SAFEGUARD, 'RUN DIRECTORY', 'folder'), /S3 must name the RUN DIRECTORY/],
  ['S3 restrict to the current user', () => mutateCell('S3', SAFEGUARD, 'restrict the run directory to the current user', 'leave the run directory as it is'), /S3 must advise restricting the run directory to the current user/],
  ['S3 icacls', () => mutateCell('S3', SAFEGUARD, 'icacls', 'attrib', true), /S3 must give the icacls form/],
  ['S3 /inheritancelevel:r', () => mutateCell('S3', SAFEGUARD, '/inheritancelevel:r', '/inheritance:r', true), /S3 must give the icacls form/],
  ['S5 together with its backup', () => mutateCell('S5', SAFEGUARD, 'together with its backup', 'alone'), /S5 must remove the backup together with the clone/],
  ['S5 AFTER the restore', () => mutateCell('S5', SAFEGUARD, "AFTER S2's restore", 'at any time'), /S5 must run AFTER S2's restore/],
  ['S5 proof backup gone', () => mutateCell('S5', PROOF, 'the clone and the backup are gone', 'the clone is gone'), /S5 proof must state the backup is gone too/],
  ['S5 proof run directory', () => mutateCell('S5', PROOF, 'run directory', 'folder'), /S5 proof must name the run directory path/],
  ['lens: backup never above the clone', () => mutate(LENS, 'never above the clone', 'anywhere'), /lens-prompts\.md FIXED rule must put the S2 backup beside the clone/],
  ['lens: backup removed with the clone', () => mutate(LENS, 'clone and S2 backup together', 'the clone'), /lens-prompts\.md FIXED rule must remove the S2 backup with the clone/],
  ['S3 RECOMMENDED roots', () => mutateCell('S3', SAFEGUARD, 'RECOMMENDED roots', 'optional roots'), /S3 must name RECOMMENDED lab roots/],
  ['S3 %ProgramData%', () => mutateCell('S3', SAFEGUARD, '%ProgramData%', '%CommonProgramFiles%', true), /S3 must name RECOMMENDED lab roots/],
  ['S3 mktemp -d', () => mutateCell('S3', SAFEGUARD, 'mktemp -d', 'a temp folder'), /S3 must name RECOMMENDED lab roots/],
  ['S3 MAY use another place', () => mutateCell('S3', SAFEGUARD, 'MAY use another place', 'must use one of these'), /S3 must say a run MAY use another place/],
  ['S3 the drive-root instruction is back', () => mutateCell('S3', SAFEGUARD, 'MAY use another place', 'MAY use another place, but use a directory off the drive root'), /S3 must not tell Windows to use a directory off the drive root/],
  ['S3 proof names the path', () => mutateCell('S3', PROOF, 'NAMES the path the run used', 'states a path'), /S3 proof must have the return name the path the run used/],
  ['S4 label hides the mandatory class', () => mutate(REF, '(OPTIONAL; MANDATORY for non-file effects)', '(OPTIONAL)'), /S4 \(the box\) label must say MANDATORY/],
  ['S4 OPTIONAL in general', () => mutateCell('S4', SAFEGUARD, 'OPTIONAL in general', 'a nicety'), /S4 must say it is OPTIONAL in general/],
  ['S4 effects are not files', () => mutateCell('S4', SAFEGUARD, 'effects are not files', 'effects are unusual'), /S4 must name the non-file-effects class/],
  ['S4 registry', () => mutateCell('S4', SAFEGUARD, 'registry writes', 'config writes'), /S4 must name the non-file-effects class/],
  ['S4 Appx', () => mutateCell('S4', SAFEGUARD, 'Appx', 'app'), /S4 must name the non-file-effects class/],
  ['S4 NEVER executed outside a real S4 box', () => mutateCell('S4', SAFEGUARD, 'NEVER executed outside a real S4 box', 'executed wherever the seat likes'), /S4 must say the non-file-effects class is NEVER executed outside a real S4 box/],
  ['S4 read statically', () => mutateCell('S4', SAFEGUARD, 'read statically', 'skimmed', true), /S4 must say that class is read statically/],
  ['S5 WHOLE clone', () => mutateCell('S5', SAFEGUARD, 'WHOLE clone', 'lab files'), /S5 must remove the WHOLE clone/],
  ['S5 EVERY run', () => mutateCell('S5', SAFEGUARD, 'EVERY run', 'a failed run'), /S5 must apply to EVERY run/],
  ['S5 root it was created in', () => mutateCell('S5', SAFEGUARD, 'under the root it was created in', 'under the lab root'), /S5 must assert the real path under the root the clone was created in/],
  ['S5 never forced', () => mutateCell('S5', SAFEGUARD, 'never forced', 'forced when needed'), /S5 must say a refused delete is reported, never forced/],
  ['S5 NOT met done-criteria', () => mutateCell('S5', SAFEGUARD, 'has NOT met its own done-criteria', 'is fine'), /S5 must say a run that leaves its clone has NOT met its own done-criteria/],
  ['S5 proof clone removed', () => mutateCell('S5', PROOF, 'clone removed', 'cleaned up'), /S5 proof must be `clone removed`/],
  ['S5 proof gone', () => mutateCell('S5', PROOF, 'gone', 'absent'), /S5 proof must state the path is gone/],
  ['lens: NEVER run outside a real box', () => mutate(LENS, 'NEVER run outside a real box', 'run anywhere'), /lens-prompts\.md FIXED rule must say the non-file-effects class is NEVER run outside a real box/],
  ['lens: read statically', () => mutate(LENS, 'only read statically', 'only skimmed'), /lens-prompts\.md FIXED rule must say that class is read statically/],
  ['lens: clone removed', () => mutate(LENS, 'and say `clone removed`', 'and say it is clean'), /lens-prompts\.md FIXED rule must carry the clone-removal proof/],
  ['lens: gone', () => mutate(LENS, 'and that it is gone', 'and nothing more'), /lens-prompts\.md FIXED rule must say the removal proof includes that the path is gone/],
];
for (const [name, build, expect] of newAnchors) {
  test(`UMB2-008 red mutant: ${name}`, () => {
    const f = checkRunSafety({ files: build() });
    assert.ok(f.some((m) => expect.test(m)), `${name}: ${f.join(' | ')}`);
  });
}

test('UMB2-008 round 2: the Learn page is cited as a whole link with the date read, and the shipped S3 icacls form is the one the page documents', () => {
  const text = refText();
  assert.ok(cites(text, LEARN), 'the icacls Learn page is cited as a whole link token');
  assert.ok(!cites(text.replace(LEARN, LEARN + '-evil'), LEARN), 'an extended URL is not the citation');
  const s3 = parseSafeguardLedger(text).S3.safeguard;
  assert.match(s3, /read 2026-10-08/);
  assert.ok(!/\/inheritance:r/.test(s3), 'the page documents /inheritancelevel:r, never the short form');
});

test('UMB2-008: the shipped text carries the owner ruling (no drive-root instruction, the S4 label names the mandatory class, S5 is the hard rule)', () => {
  const rows = parseSafeguardLedger(refText());
  assert.ok(!/off the drive root/.test(rows.S3.safeguard), 'S3 must not carry the drive-root instruction');
  assert.match(rows.S4.first, /OPTIONAL; MANDATORY for non-file effects/);
  for (const re of [/WHOLE clone/, /EVERY run/, /NOT met its own done-criteria/]) assert.match(rows.S5.safeguard, re);
  assert.match(lensLineText(), /NEVER run outside a real box/);
});

// u2 (CodeRabbit t24 #6 and #7, 08b R2-MEDIUM-1 and R2-LOW-2, the S8 walk note): the lens line is all a shell seat reads, so every S3 clause the
// ledger carries reaches it; S3 asserts the run directory's real path is outside the home tree before the copy; S4's class line says a box the
// probe passes is used. One red mutant per NEW anchor, as above.
const u2Anchors = [
  ['S3 real path asserted before the copy', () => mutateCell('S3', SAFEGUARD, 'outside the home tree BEFORE anything is copied in', 'outside the home tree sometime'), /S3 must assert the run directory's real path is outside the home tree BEFORE anything is copied in/],
  ['S3 says real path', () => mutateCell('S3', SAFEGUARD, 'real path', 'location', true), /S3 must assert the run directory's real path is outside the home tree BEFORE anything is copied in/],
  ['S3 a TMPDIR inside home falls back to /tmp', () => mutateCell('S3', SAFEGUARD, 'so then use `/tmp`', 'so carry on'), /S3 must say a TMPDIR inside the home tree falls back to \/tmp/],
  ['S3 no outside place: S2 carries the weight', () => mutateCell('S3', SAFEGUARD, 'let S2 carry the weight', 'carry on'), /S3 must say, with no outside place, to say so and let S2 carry the weight/],
  ['S4 a box the probe passes is used', () => mutateCell('S4', SAFEGUARD, 'with a box the probe passes, run it inside that box', 'use a box if you like'), /S4 must say that with a box the probe passes the non-file class runs inside that box/],
  ['lens: ONE run directory', () => mutate(LENS, 'S3 make ONE run directory holding', 'S3 make a folder holding'), /lens-prompts\.md FIXED rule must name the ONE run directory that holds clone\/ and backup\//],
  ['lens: real path asserted before the copy', () => mutate(LENS, 'assert its real path is outside the home tree BEFORE anything is copied in', 'check it later'), /lens-prompts\.md FIXED rule must assert the run directory's real path is outside the home tree BEFORE anything is copied in/],
  ['lens: a TMPDIR inside home falls back to /tmp (t29 #4)', () => mutate(LENS, 'then use `/tmp`, or state why not', 'carry on'), /lens-prompts\.md FIXED rule must say a TMPDIR inside the home tree falls back to \/tmp/],
  ['lens: Windows restrict step', () => mutate(LENS, '/inheritancelevel:r', '/inheritance:r'), /lens-prompts\.md FIXED rule must carry the Windows restrict-to-your-user step \(icacls \/inheritancelevel:r\)/],
  ['lens: no outside place', () => mutate(LENS, 'let S2 carry the weight', 'carry on'), /lens-prompts\.md FIXED rule must say, with no outside place, to say so and let S2 carry the weight/],
  ['lens: NOT-CHECKED covers S5', () => mutate(LENS, 'You cannot do S1, S2 or S5', 'You cannot do S1-S2'), /lens-prompts\.md FIXED rule must say a seat that cannot do S1, S2 or S5 does not run/],
  ['lens: a box the probe passes is used', () => mutate(LENS, 'with a box the probe passes, run it inside that box', 'use a box if you like'), /lens-prompts\.md FIXED rule must say that with a box the probe passes the non-file class runs inside that box/],
];
for (const [name, build, expect] of u2Anchors) {
  test(`u2 red mutant: ${name}`, () => {
    const f = checkRunSafety({ files: build() });
    assert.ok(f.some((m) => expect.test(m)), `${name}: ${f.join(' | ')}`);
  });
}

test('u2 (R2-LOW-2): the icacls page is a WRAPPED link in S3 (angle brackets), still one whole link token', () => {
  const s3 = parseSafeguardLedger(refText()).S3.safeguard;
  assert.ok(s3.includes('(<' + LEARN + '>,'), 'the bare URL is wrapped as <...>');
  assert.ok(cites(s3, LEARN), 'the wrapped link is still cited as a whole link token');
});
