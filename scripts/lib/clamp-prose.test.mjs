// R15 item 3: the prose half of the config-cascade clamp (hooks-safety.md section 9). The gate binds two things the
// hook clamp cannot: the clause the AGENT follows agrees with the schema and the hook, and no read site is written
// as if it read the raw project file. It does NOT bind that a model obeys (clamp-prose.mjs header).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkClampProse, hookClampedKeys, hookClampedDefaults, hookClampedOrders } from './clamp-prose.mjs';
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
const run = (files = realFiles(), clampedKeys = hookClampedKeys(conductor), clampedDefaults = hookClampedDefaults(conductor), clampedOrders = hookClampedOrders(conductor)) => checkClampProse({ files, schemaEnums, clampedKeys, clampedDefaults, clampedOrders });
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

// R15 findings-back round 1 (LOW-2): the absent / default RULE of the canonical clause, not only its keys and values.
test('LOW-2: the schema defaults are derived from the conductor, and the clause must carry the global fallback to that default', () => {
  assert.deepEqual(hookClampedDefaults(conductor), { coalboardMode: 'ask', updateMode: 'ask' });
  const f = run(mutate(SKILL, "a global's to the default `ask`", "a global's to `auto`"));
  assert.ok(f.some((m) => /a global's out-of-set value reads as the schema default `ask`/.test(m)), f.join('\n'));
});

test("LOW-2: the clause must say a project's out-of-set value falls back to the global value", () => {
  const f = run(mutate(SKILL, "a project's falls back to the global value", "a project's is used as written"));
  assert.ok(f.some((m) => /falls back to the global value/.test(m)), f.join('\n'));
});

test('LOW-2: no derivable defaults is a finding, never a silent pass', () => {
  assert.ok(run(realFiles(), hookClampedKeys(conductor), {}).some((m) => /no schema defaults were derived/.test(m)));
});

// PR 19 #17 (u2): the clause states the ORDER the hook clamps by, not only the values. The old text said `off`<`ask`/`remind`<`auto` (ask and
// remind equal), while SAFER_ENUM.updateMode.order is off, remind, ask, auto: a project ask over a global remind clamps to remind in the hook
// but read as allowed in the prose. The gate now compares the stated order, key by key, to the conductor's SAFER_ENUM.
const UPDATE_ORDER = '`updateMode` ranks `off`<`remind`<`ask`<`auto`';
const BOARD_ORDER = '`coalboardMode` ranks `off`<`ask`<`auto`';

test("the hook's clamp ORDER is derived from the conductor, not listed here", () => {
  assert.deepEqual(hookClampedOrders(conductor), { coalboardMode: ['off', 'ask', 'auto'], updateMode: ['off', 'remind', 'ask', 'auto'] });
  assert.deepEqual(hookClampedOrders('no clamp table here'), {});
});

test('RED-FIRST PR 19 #17: the stated order must equal SAFER_ENUM, so ask and remind as equals, a swap and a reversal are each a finding', () => {
  const isOrder = (key) => (m) => m.includes('`' + key + '`') && /order/.test(m);
  const equal = run(mutate(SKILL, UPDATE_ORDER, '`updateMode` ranks `off`<`ask`/`remind`<`auto`'));
  assert.ok(equal.some(isOrder('updateMode')), equal.join('\n'));
  const swapped = run(mutate(SKILL, UPDATE_ORDER, '`updateMode` ranks `off`<`ask`<`remind`<`auto`'));
  assert.ok(swapped.some(isOrder('updateMode')), swapped.join('\n'));
  const reversed = run(mutate(SKILL, BOARD_ORDER, '`coalboardMode` ranks `auto`<`ask`<`off`'));
  assert.ok(reversed.some(isOrder('coalboardMode')), reversed.join('\n'));
});

test('a clause that states no order for a hook-clamped key is a finding', () => {
  const none = run(mutate(SKILL, BOARD_ORDER + '; ', ''));
  assert.ok(none.some((m) => m.includes('`coalboardMode`') && /order/.test(m)), none.join('\n'));
});

test('no derivable orders is a finding, never a silent pass', () => {
  assert.ok(run(realFiles(), hookClampedKeys(conductor), hookClampedDefaults(conductor), {}).some((m) => /no clamp order was derived/.test(m)));
});

// t29 #2 (09a): a clamped key whose order was not derived used to be skipped with a bare `continue`, so a reversed statement for it passed. It is a finding now.
test('RED-FIRST t29 #2: a clamped key with no derived order is a finding even when another key has one, and the stated order of that key is not silently unchecked', () => {
  const REVERSED = '`updateMode` ranks `auto`<`ask`<`remind`<`off`';
  const orders = hookClampedOrders(conductor);
  const { updateMode, ...onlyBoard } = orders;
  assert.ok(updateMode, 'precondition: the conductor derives an updateMode order');
  const files = mutate(SKILL, UPDATE_ORDER, REVERSED);
  const f = run(files, hookClampedKeys(conductor), hookClampedDefaults(conductor), onlyBoard);
  assert.ok(f.some((m) => /no clamp order was derived for `updateMode`/.test(m)), f.join('\n'));
  assert.ok(!f.some((m) => /no clamp order was derived from the conductor/.test(m)), 'one key missing is the per-key finding, not the all-missing one');
});

test('t29 #2: an order that SAFER_ENUM states after a nested brace is not derived (named limit), and the gate says so for that key instead of passing it', () => {
  const nested = conductor.replace(/(updateMode\s*:\s*\{[^}]*?)(order:)/, "$1meta: { x: 1 }, $2");
  assert.notEqual(nested, conductor, 'precondition: the mutation reached the updateMode entry');
  assert.ok(!('updateMode' in hookClampedOrders(nested)), 'the pattern stops at the first closing brace');
  const f = run(realFiles(), hookClampedKeys(nested), hookClampedDefaults(nested), hookClampedOrders(nested));
  assert.ok(f.some((m) => /no clamp order was derived for `updateMode`/.test(m)), f.join('\n'));
});
