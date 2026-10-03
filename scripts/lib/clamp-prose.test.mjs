// R15 item 3: the prose half of the config-cascade clamp (hooks-safety.md section 9). The gate binds two things the
// hook clamp cannot: the clause the AGENT follows agrees with the schema and the hook, and no read site is written
// as if it read the raw project file. It does NOT bind that a model obeys (clamp-prose.mjs header).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkClampProse, hookClampedKeys } from './clamp-prose.mjs';
import { CONFIG_SCHEMA } from './config-schema.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const skillDir = path.join(root, 'skills', 'coalboard');
const read = (p) => fs.readFileSync(p, 'utf8');
const realFiles = () => [
  { rel: 'skills/coalboard/SKILL.md', text: read(path.join(skillDir, 'SKILL.md')) },
  ...fs.readdirSync(path.join(skillDir, 'references')).filter((f) => f.endsWith('.md')).map((f) => ({ rel: `skills/coalboard/references/${f}`, text: read(path.join(skillDir, 'references', f)) })),
];
const schemaEnums = Object.fromEntries(CONFIG_SCHEMA.filter((s) => s.type === 'enum').map((s) => [s.key, s.values]));
const conductor = read(path.join(root, 'hooks', 'coalboard-conductor.js'));
const run = (files = realFiles(), clampedKeys = hookClampedKeys(conductor)) => checkClampProse({ files, schemaEnums, clampedKeys });
const mutate = (rel, from, to) => realFiles().map((f) => {
  if (f.rel !== rel) return f;
  assert.equal(f.text.split(from).length - 1, 1, `fixture anchor must match exactly once: ${from.slice(0, 50)}`);
  return { ...f, text: f.text.replace(from, () => to) };
});
const SKILL = 'skills/coalboard/SKILL.md';

test("the hook's clamped keys are derived from the conductor, not listed here", () => {
  assert.deepEqual(hookClampedKeys(conductor), ['coalboardMode', 'updateMode']);
  assert.deepEqual(hookClampedKeys('no clamp table here'), []);
});

test('the shipped skill text passes: one canonical clause, schema-equal values, every read site merged', () => {
  assert.deepEqual(run(), []);
});

test('RED-FIRST: a read site written without the merged qualifier is named by file:line', () => {
  const f = run(mutate(SKILL, 'by the MERGED `coalboardMode` (Always):', 'by `coalboardMode`:'));
  assert.equal(f.length, 1);
  assert.match(f[0], /skills\/coalboard\/SKILL\.md:\d+ reads `coalboardMode` without saying it is the MERGED/);
});

test('every agent-read consent key is held to the same rule (fableConsent, applyConsent)', () => {
  assert.equal(run(mutate(SKILL, 'AND the MERGED `fableConsent` is `ask`;', 'AND `fableConsent` is `ask`;')).length, 1);
  assert.equal(run(mutate(SKILL, '(the MERGED `applyConsent` = explicit approval', '(`applyConsent` = explicit approval')).length, 1);
});

test('the canonical clause must name the two unclamped consent keys it states a rule for', () => {
  const f = run(mutate(SKILL, '`fableConsent` (`ask`/`always`/`never`, default `ask`) and `applyConsent` (a boolean, default `true`) in particular', 'the consent keys in particular'));
  assert.ok(f.some((m) => /does not name `fableConsent`/.test(m)), f.join('\n'));
  assert.ok(f.some((m) => /does not name `applyConsent`/.test(m)), f.join('\n'));
});

test('the clause cannot drift off the schema: a dropped or an invented enum value is a finding', () => {
  const dropped = run(mutate(SKILL, '`updateMode`: `off`/`remind`/`ask`/`auto`;', '`updateMode`: `off`/`ask`/`auto`;'));
  assert.ok(dropped.some((m) => /`updateMode` without the schema value\(s\) `remind`/.test(m)), dropped.join('\n'));
  const invented = run(mutate(SKILL, '`coalboardMode`: `off`/`ask`/`auto`;', '`coalboardMode`: `off`/`ask`/`auto`/`always`;'));
  assert.ok(invented.some((m) => /does not declare: `always`/.test(m)), invented.join('\n'));
});

test('a key the HOOK newly clamps but the clause never names is a finding (derived, so a new key cannot slip by)', () => {
  const f = run(realFiles(), [...hookClampedKeys(conductor), 'zzNewKey']);
  assert.ok(f.some((m) => /does not name `zzNewKey`/.test(m)), f.join('\n'));
});

test('no derivable hook clamp, or no / two canonical clauses, is a finding, never a silent pass', () => {
  assert.ok(run(realFiles(), []).some((m) => /no hook-clamped keys were derived/.test(m)));
  const none = run(mutate(SKILL, 'counts as ABSENT', 'counts as missing'));
  assert.ok(none.some((m) => /exactly ONE canonical clamp-aware clause.*found 0/.test(m)), none.join('\n'));
  const two = realFiles().map((f) => (f.rel === SKILL ? { ...f, text: `${f.text}\nA second ABSENT rule under safer-value-wins.\n` } : f));
  assert.ok(run(two).some((m) => /found 2/.test(m)));
});

test('a persist (write) site and a preset-table row are not read sites', () => {
  const extra = realFiles().map((f) => (f.rel === SKILL ? { ...f, text: `${f.text}\nGATE 2 persists \`fableConsent\` to the project config.\n| applyConsent | off | on |\n` } : f));
  assert.deepEqual(run(extra), []);
});

test('the persist exemption is per MENTION: a read later on the same line as a persist is still held to the rule', () => {
  const extra = realFiles().map((f) => (f.rel === SKILL ? { ...f, text: `${f.text}\nGATE 2 persists \`fableConsent\` to the project config; then, well past that write and in the same line, the agent asks when \`applyConsent\` is false.\n` } : f));
  const f = run(extra);
  assert.equal(f.length, 1, f.join('\n'));
  assert.match(f[0], /reads `applyConsent`/);
});
