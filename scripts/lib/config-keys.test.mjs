// Zero-dep unit tests for scripts/lib/config-keys.mjs (CWK-060). Drives
// checkConfigKeys in-memory via its `read` callback -- no tmpdir needed, the
// module's whole contract is a pure function over strings it is handed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkConfigKeys, hookWriteSites, PENDING_KEYS, NOT_CONFIG, BLIND_KEYS } from './config-keys.mjs';

function reader(files) {
  return (f) => { if (!(f in files)) throw new Error(`ENOENT: ${f}`); return files[f]; };
}

test('a clean surface set with no drift reports zero hard findings', () => {
  const files = { 'README.md': 'The `coalboardMode` key controls activation.\n' };
  const { findings } = checkConfigKeys({
    schemaKeys: ['coalboardMode'],
    mdFiles: ['README.md'],
    read: reader(files),
    pending: {},
    notConfig: {},
    blind: {},
  });
  assert.deepEqual(findings, []);
});

test('a backticked key absent from the schema FAILs, naming the file', () => {
  const files = { 'README.md': 'A stray `bogusRetryLimit` mention.\n' };
  const { findings } = checkConfigKeys({
    schemaKeys: ['coalboardMode'],
    mdFiles: ['README.md'],
    read: reader(files),
    pending: {},
    notConfig: {},
    blind: {},
  });
  const fails = findings.filter((f) => f.level === 'FAIL');
  assert.equal(fails.length, 1);
  assert.match(fails[0].msg, /bogusRetryLimit/);
  assert.match(fails[0].msg, /README\.md/);
});

test('an undeclared KEY_SHAPE-invisible schema key is a hard FAIL (the mandatory precondition)', () => {
  const { findings } = checkConfigKeys({
    schemaKeys: ['rigor'], // all-lowercase, no internal capital -- fails KEY_SHAPE
    mdFiles: [],
    read: reader({}),
    pending: {},
    notConfig: {},
    blind: {}, // NOT declared
  });
  const fails = findings.filter((f) => f.level === 'FAIL');
  assert.ok(fails.some((f) => /rigor/.test(f.msg) && /cannot be detected/.test(f.msg)));
});

test('a DECLARED blind key emits a SKIP, not a silent pass (disclosure is owed even when declared)', () => {
  const { findings } = checkConfigKeys({
    schemaKeys: ['rigor'],
    mdFiles: [],
    read: reader({}),
    pending: {},
    notConfig: {},
    blind: { rigor: 'an ordinary lowercase word' },
  });
  assert.equal(findings.filter((f) => f.level === 'FAIL').length, 0);
  const skips = findings.filter((f) => f.level === 'SKIP');
  assert.ok(skips.some((s) => s.msg.startsWith('blind to') && /rigor/.test(s.msg)));
});

test('a NOT_CONFIG-declared token is not flagged even though it never resolves', () => {
  const files = { 'SKILL.md': 'Reconcile every launched lens by its `agentId`.\n' };
  const { findings } = checkConfigKeys({
    schemaKeys: ['coalboardMode'],
    mdFiles: ['SKILL.md'],
    read: reader(files),
    pending: {},
    notConfig: { agentId: 'the CC worker identifier, never a config key' },
    blind: {},
  });
  assert.equal(findings.filter((f) => f.level === 'FAIL').length, 0);
});

test('SELF-CLEANING RULE 1: a NOT_CONFIG entry that now resolves in the schema is a lie -- FAIL', () => {
  const { findings } = checkConfigKeys({
    schemaKeys: ['agentId'], // now a REAL key
    mdFiles: [],
    read: reader({}),
    pending: {},
    notConfig: { agentId: 'stale reason' },
    blind: {},
  });
  assert.ok(findings.some((f) => f.level === 'FAIL' && /agentId/.test(f.msg) && /now resolves/.test(f.msg)));
});

test('SELF-CLEANING RULE 2: a NOT_CONFIG entry no surface mentions protects nothing -- FAIL on a COMPLETE scan', () => {
  const files = { 'README.md': 'Nothing relevant here.\n' };
  const { findings } = checkConfigKeys({
    schemaKeys: ['coalboardMode'],
    mdFiles: ['README.md'],
    read: reader(files),
    pending: {},
    notConfig: { agentId: 'never mentioned in this fixture' },
    blind: {},
  });
  assert.ok(findings.some((f) => f.level === 'FAIL' && /protects nothing/.test(f.msg)));
});

test('SELF-CLEANING RULE 2 degrades to a SKIP, never a false accusation, on a PARTIAL scan', () => {
  const { findings } = checkConfigKeys({
    schemaKeys: ['coalboardMode'],
    mdFiles: ['MISSING.md'], // unreadable -- the caller named it, but read() throws
    read: reader({}),
    pending: {},
    notConfig: { agentId: 'never mentioned in this fixture' },
    blind: {},
  });
  assert.equal(findings.filter((f) => /protects nothing/.test(f.msg)).length, 0);
  assert.ok(findings.some((f) => f.level === 'SKIP' && /declaration-pruning not checked/.test(f.msg)));
});

test('hook site scanning handles all three quote forms this room actually uses, interpolation stripped', () => {
  const hookText = [
    "process.stdout.write('[CoalBoard] plain single-quoted, no key here');",
    'process.stdout.write("a double-quoted notice mentioning `bogusFlagName`");',
    'const reasons = [];',
    'process.stdout.write(`CRITICAL (${reasons.join(\' \')}) -- also names unresolvedKeyHere for real`);',
  ].join('\n');
  const sites = hookWriteSites(hookText);
  assert.equal(sites.length, 3, 'exactly 3 process.stdout.write( occurrences');
  const { findings } = checkConfigKeys({
    schemaKeys: ['coalboardMode'],
    hookFiles: ['hooks/fake-conductor.js'],
    read: reader({ 'hooks/fake-conductor.js': hookText }),
    pending: {},
    notConfig: {},
    blind: {},
  });
  const names = findings.filter((f) => f.level === 'FAIL').map((f) => f.msg);
  assert.ok(names.some((m) => /bogusFlagName/.test(m)), 'the double-quoted site must be scanned');
  assert.ok(names.some((m) => /unresolvedKeyHere/.test(m)), 'the backtick-template site must be scanned past its own interpolation');
});

test('the `${...}` interpolation body itself never becomes a false-positive candidate', () => {
  const hookText = 'process.stdout.write(`Signal (${someInternalVarName.join(\' \')}) fired`);';
  const { findings } = checkConfigKeys({
    schemaKeys: ['coalboardMode'],
    hookFiles: ['hooks/fake.js'],
    read: reader({ 'hooks/fake.js': hookText }),
    pending: {},
    notConfig: {},
    blind: {},
  });
  assert.equal(findings.filter((f) => f.level === 'FAIL').length, 0, 'someInternalVarName lives inside ${...} -- code, never a user-visible key name');
});

test('ZERO-MATCHES-MUST-FAIL: a readable hook file with no write-call sites at all is a broken locator', () => {
  const { findings } = checkConfigKeys({
    schemaKeys: ['coalboardMode'],
    hookFiles: ['hooks/silent.js'],
    read: reader({ 'hooks/silent.js': 'module.exports = () => {};' }),
    pending: {},
    notConfig: {},
    blind: {},
  });
  assert.ok(findings.some((f) => f.level === 'FAIL' && /found 0/.test(f.msg) && /silent\.js|hook site locator/.test(f.msg)));
});

test('an unreadable hook file does NOT trip the zero-sites hard fail (nothing was scanned, not a broken scan)', () => {
  const { findings } = checkConfigKeys({
    schemaKeys: ['coalboardMode'],
    hookFiles: ['hooks/missing.js'],
    read: reader({}),
    pending: {},
    notConfig: {},
    blind: {},
  });
  assert.equal(findings.filter((f) => /hook site locator/.test(f.msg)).length, 0);
});

test('ZERO-MATCHES-MUST-FAIL: a key-table heading that is not found is a broken locator, not an empty table', () => {
  const { findings, coverage } = checkConfigKeys({
    schemaKeys: ['coalboardMode'],
    read: reader({ 'README.md': '# Title\n\nNo Configure section here.\n' }),
    keyTables: [{ file: 'README.md', heading: 'Configure' }],
    pending: {},
    notConfig: {},
    blind: {},
  });
  assert.ok(findings.some((f) => f.level === 'FAIL' && /heading "Configure" not found/.test(f.msg)));
  assert.equal(coverage.keyTables[0].found, false);
});

test('a heading that IS found but bounds zero rows is reported in coverage, never a hard fail', () => {
  const text = '# Title\n\n## Configure\n\nProse only, no table.\n\n## Next\n';
  const { findings, coverage } = checkConfigKeys({
    schemaKeys: ['coalboardMode'],
    read: reader({ 'README.md': text }),
    keyTables: [{ file: 'README.md', heading: 'Configure' }],
    pending: {},
    notConfig: {},
    blind: {},
  });
  assert.equal(findings.filter((f) => f.level === 'FAIL').length, 0);
  assert.deepEqual(coverage.keyTables[0], { file: 'README.md', heading: 'Configure', found: true, rows: 0 });
});

test('the structured table pass catches a shape-blind (all-lowercase) key drift that free prose cannot see', () => {
  const text = '## Configure\n\n| key | help |\n| --- | --- |\n| `staleoption` | old |\n\n## Next\n';
  const { findings } = checkConfigKeys({
    schemaKeys: ['coalboardMode'],
    read: reader({ 'README.md': text }),
    keyTables: [{ file: 'README.md', heading: 'Configure' }],
    pending: {},
    notConfig: {},
    blind: {},
  });
  // 'staleoption' has NO internal capital -- KEY_SHAPE would never see it in
  // free prose, but the table's own position-is-the-signal contract catches it.
  assert.ok(findings.some((f) => f.level === 'FAIL' && /staleoption/.test(f.msg) && /key table/.test(f.msg)));
});

test('a table row already declared in PENDING_KEYS is reported once, never doubled by the free-text pass', () => {
  const text = '## Configure\n\n| key |\n| --- |\n| `notYetShipped` |\n\nAlso mentioned in prose: `notYetShipped`.\n';
  const { findings } = checkConfigKeys({
    schemaKeys: ['coalboardMode'],
    read: reader({ 'README.md': text }),
    keyTables: [{ file: 'README.md', heading: 'Configure' }],
    pending: { notYetShipped: 'CWK-999, landing next release' },
    notConfig: {},
    blind: {},
  });
  assert.equal(findings.filter((f) => f.level === 'FAIL').length, 0);
});

test('CoalBoard\'s own live BLIND_KEYS/NOT_CONFIG/PENDING_KEYS ship with no stale entries', () => {
  // Every declared token must still exist in a hypothetical schema that includes
  // it -- this is a shape sanity check on the shipped constants themselves, not
  // a live-schema check (that lives in verify.mjs, which imports the real
  // CONFIG_SCHEMA). Guards against a key being renamed/removed and a stale
  // declaration left behind with nothing pointing back at it.
  for (const k of Object.keys(BLIND_KEYS)) assert.equal(typeof BLIND_KEYS[k], 'string', `BLIND_KEYS.${k} must carry a reason`);
  for (const k of Object.keys(NOT_CONFIG)) assert.equal(typeof NOT_CONFIG[k], 'string', `NOT_CONFIG.${k} must carry a reason`);
  assert.deepEqual(PENDING_KEYS, {}, 'no pending key today -- an empty object is the correct, tested state');
});
