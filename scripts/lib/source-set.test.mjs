// R15 item 1 (CWK-159): the widened source set. Each test breaks ONE part of the contract and asserts the gate names it.
// The central property, tested by mutants: every ledger row is executed by an actor that ALREADY holds the right, so the
// widened source set adds no tool right to any seat.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkSourceSet, parseSourceLedger } from './source-set.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const skillDir = path.join(root, 'skills', 'coalboard');
const read = (p) => fs.readFileSync(p, 'utf8');
const realFiles = () => [
  { rel: 'skills/coalboard/SKILL.md', text: read(path.join(skillDir, 'SKILL.md')) },
  ...fs.readdirSync(path.join(skillDir, 'references')).filter((f) => f.endsWith('.md')).map((f) => ({ rel: `skills/coalboard/references/${f}`, text: read(path.join(skillDir, 'references', f)) })),
];
const REF = 'skills/coalboard/references/source-set.md';
const LENS = 'skills/coalboard/references/lens-prompts.md';
const SKILL = 'skills/coalboard/SKILL.md';
const mutate = (rel, from, to) => realFiles().map((f) => {
  if (f.rel !== rel) return f;
  assert.equal(f.text.split(from).length - 1, 1, `fixture anchor must match exactly once: ${from.slice(0, 60)}`);
  return { ...f, text: f.text.replace(from, () => to) };
});
const row = (id) => realFiles().find((f) => f.rel === REF).text.split('\n').find((l) => l.startsWith(`| **${id}**`));
const mutateRow = (id, fn) => mutate(REF, row(id), fn(row(id)));
const run = (files = realFiles()) => checkSourceSet({ files });

test('the shipped source set passes', () => {
  assert.deepEqual(run(), []);
});

test('RED-FIRST, the old source set: no reference means nothing past the cut-off is read and no class is walked', () => {
  const f = run(realFiles().filter((x) => x.rel !== REF));
  assert.equal(f.length, 1);
  assert.match(f[0], /source-set\.md is missing/);
});

test('the ledger covers the four additions by class, one row id each (A alerts, C catalogue, L live, E posix)', () => {
  const rows = parseSourceLedger(realFiles().find((f) => f.rel === REF).text);
  assert.deepEqual(Object.keys(rows).sort(), ['A1', 'A2', 'A3', 'C1', 'E1', 'L1', 'L2', 'L3', 'L4', 'L5']);
  assert.deepEqual([...new Set(Object.values(rows).map((r) => r.klass))].sort(), ['alerts', 'catalogue', 'live-db', 'posix-seat']);
});

test('a class with no row is a finding (dropping every live-db row; dropping the posix row)', () => {
  const noLive = realFiles().map((f) => (f.rel === REF ? { ...f, text: f.text.split('\n').filter((l) => !/^\| \*\*L\d\*\*/.test(l)).join('\n') } : f));
  assert.ok(run(noLive).some((m) => /no row of class `live-db`/.test(m)));
  const noE = realFiles().map((f) => (f.rel === REF ? { ...f, text: f.text.split('\n').filter((l) => !l.startsWith('| **E1**')).join('\n') } : f));
  assert.ok(run(noE).some((m) => /no row of class `posix-seat`/.test(m)));
});

test('NO RIGHT IS WIDENED: a fetch given to a seat without the fetch cell, a run given to the data seat, an execute given to a seat', () => {
  const fetchByFeeling = run(mutateRow('L1', (r) => r.replace('| data |', '| feeling |')));
  assert.ok(fetchByFeeling.some((m) => /L1: `feeling` is asked to fetch, but only data hold that right/.test(m)), fetchByFeeling.join('\n'));
  const runByData = run(mutateRow('E1', (r) => r.replace('| adversary | run |', '| data | run |')));
  assert.ok(runByData.some((m) => /E1: `data` is asked to run, but only feeling, adversary hold that right/.test(m)), runByData.join('\n'));
  const execBySeat = run(mutateRow('A1', (r) => r.replace('| main | execute |', '| adversary | execute |')));
  assert.ok(execBySeat.some((m) => /A1: `adversary` is asked to execute, but only main hold that right/.test(m)), execBySeat.join('\n'));
});

test('alert rows are main alone: a credential must never reach the seat that can fetch', () => {
  const f = run(mutateRow('A2', (r) => r.replace('| main | execute |', '| main · data | execute |')));
  assert.ok(f.some((m) => /A2: `data` is asked to execute/.test(m)), f.join('\n'));
  assert.ok(f.some((m) => /A2: alert rows are main's alone/.test(m)), f.join('\n'));
});

test('A3 (secret-scanning) must say a secret VALUE is never carried', () => {
  const f = run(mutateRow('A3', (r) => r.replace('**the secret value, ever** (a value never enters a prompt, a report or a log)', 'nothing in particular')));
  assert.ok(f.some((m) => /A3 \(secret-scanning\) must say a secret VALUE is never carried/.test(m)), f.join('\n'));
});

test('an unreachable source must be a NAMED gap, never silent (any row)', () => {
  const f = run(mutateRow('L3', (r) => r.replace('`NOT-CHECKED (NVD)`', 'skipped')));
  assert.ok(f.some((m) => /L3 says nothing named NOT-CHECKED or NOT-WALKED/.test(m)), f.join('\n'));
});

test('E1 must name the box S4, the S1-S3 limit and an ENVIRONMENT gap when no box exists', () => {
  assert.ok(run(mutateRow('E1', (r) => r.replace(/S4/g, 'the box'))).some((m) => /E1 must name run-safety S4/.test(m)));
  assert.ok(run(mutateRow('E1', (r) => r.replace('`NOT-CHECKED (environment)`: the class is NAMED as environment-gated, never clean', '`NOT-CHECKED`: skipped'))).some((m) => /E1 must name the unreachable case as an ENVIRONMENT gap/.test(m)));
});

test('the duty reaches the seats: the placeholder, the code checklist, the TRACE rule and the data role line', () => {
  assert.ok(run(mutate(LENS, '- `{class-trace}` —', '- `{trace-list}` —')).some((m) => /no `\{class-trace\}` placeholder entry/.test(m)));
  assert.ok(run(mutate(LENS, ' · then walk each `{class-trace}` class from untrusted source to dangerous sink.', '.')).some((m) => /code checklist does not walk `\{class-trace\}`/.test(m)));
  assert.ok(run(mutate(LENS, 'Without one it is UNTRACED: a lead the judge must run, never CRITICAL or HIGH on its own.', 'Without one it is fine.')).some((m) => /no FIXED TRACE rule/.test(m)));
  assert.ok(run(mutate(LENS, 'The live sources are the `L` rows of `references/source-set.md`', 'The live sources are your own judgment')).some((m) => /sub1 \(data\) role line does not point/.test(m)));
});

test("main's read is named, not hidden: Step 1's brief rail, GATE 1's TARGET block and the network row's one exception", () => {
  assert.ok(run(mutate(SKILL, 'a source main cannot reach is `NOT-CHECKED`, never clean, and no seat gains a right.', 'done.')).some((m) => /Step 1 has no rail that builds the alert brief/.test(m)));
  assert.ok(run(mutate(SKILL, ' · the SOURCE SET reachable this run (A1-A3 alerts, L1-L5 live sources, E1 box — `references/source-set.md`) with each unreachable one named;', ';')).some((m) => /TARGET block does not list the source set/.test(m)));
  assert.ok(run(mutate(SKILL, ', except A1-A3\'s read-only alert GET through its `execute` grant (`references/source-set.md`)', '')).some((m) => /network row says main never fetches but does not name A1-A3/.test(m)));
});

test('the references table lists it MANDATORY at its moment', () => {
  assert.ok(run(mutate(SKILL, '| **MANDATORY for a code / CI / config target or a repo audit**', '| on-demand')).some((m) => /not as MANDATORY/.test(m)));
});

// R15 findings-back round 1 (MEDIUM-1, HIGH-1): the ledger's CONTENT anchors, each with the reviewer's mutant.
test('MEDIUM-1: an alert row whose carries cell names a value is a finding (A3 edited to carry the secret value)', () => {
  const f = run(mutateRow('A3', (r) => r.replace('| the type, state and path |', '| the type, state, path and the secret value |')));
  assert.ok(f.some((m) => /A3: an alert row's carries cell must not name a value/.test(m)), f.join('\n'));
});

test('HIGH-1: A3 must name the request form with hide_secret=true, and the text must keep the never-sent / discard-unread rule', () => {
  const noParam = run(mutateRow('A3', (r) => r.replace('?state=open&hide_secret=true', '?state=open')));
  assert.ok(noParam.some((m) => /A3 must name its request form with `hide_secret=true`/.test(m)), noParam.join('\n'));
  const noDiscard = run(mutate(REF, 'is discarded unread and the row is reported', 'is kept and the row is reported'));
  assert.ok(noDiscard.some((m) => /never sent and a response still carrying a `secret` field is discarded unread/.test(m)), noDiscard.join('\n'));
  const noNever = run(mutate(REF, 'without `hide_secret=true` is NEVER sent', 'without `hide_secret=true` is usually not sent'));
  assert.ok(noNever.some((m) => /never sent and a response still carrying/.test(m)), noNever.join('\n'));
});

test('MEDIUM-1: E1 keeps "ONLY inside a box": a host run when no box is found is a finding even with S4 and S1-S3 still named', () => {
  const f = run(mutateRow('E1', (r) => r.replace('and ONLY inside a box S4 found', 'and, when S4 finds no box, on the host under S1-S3')));
  assert.ok(f.some((m) => /E1 must keep "ONLY inside a box"/.test(m)), f.join('\n'));
});

test('the shipped provider facts are stated with their vendor page, and only NVD\'s rate limit and the WSL probe stay unverified', () => {
  const t = realFiles().find((x) => x.rel === REF).text;
  for (const url of ['docs.github.com/en/rest/code-scanning/code-scanning', 'docs.github.com/en/rest/dependabot/alerts', 'docs.github.com/en/rest/secret-scanning/secret-scanning', 'docs.github.com/en/rest/security-advisories/global-advisories', 'google.github.io/osv.dev/api', 'nvd.nist.gov/developers/vulnerabilities']) {
    assert.ok(t.includes(url), `the vendor page ${url} is cited`);
  }
  const unverified = t.split('\n').flatMap((l) => (l.match(/⚠️ unverified:.*?probe command\./g) || []));
  assert.equal(unverified.length, 1, unverified.join('|'));
  assert.match(unverified[0], /NVD's keyless rate limit/);
  assert.match(unverified[0], /wsl\.exe/);
});
