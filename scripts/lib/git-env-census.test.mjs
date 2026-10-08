import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { censusGitSpawns, collectSources, blobId, EXEMPT_CARRIERS } from './git-env-census.mjs';

// Fixture source text is BUILT, never written as a literal call: this file is itself scanned by the census
// (scripts/**/*.mjs), and a literal git spawn inside a string would be read as a real one.
const GIT = "'git'";
const call = (opts, fn = 'spawnSync') => fn + '(' + GIT + ", ['status'], " + opts + ');';
const files = (text, rel = 'scripts/x.mjs') => [{ rel, text }];
const refused = (text) => censusGitSpawns(files(text)).findings;

test('RED-FIRST CWK-136: env: process.env on a git spawn is REFUSED (the hole the presence census passes)', () => {
  const r = refused(call('{ cwd: d, env: process.env }'));
  assert.equal(r.length, 1);
  assert.match(r[0], /process\.env/);
  assert.match(r[0], /scripts\/x\.mjs:1/);
});

test('a spread of process.env beside other keys is refused, and a missing env: is refused', () => {
  assert.equal(refused(call("{ env: { ...process.env, X: '1' } }", 'execFileSync')).length, 1);
  const none = refused(call('{ cwd: d }'));
  assert.equal(none.length, 1);
  assert.match(none[0], /no 'env:'/);
});

test('gitEnv(...) alone passes, with and without a ceiling, and across a multi-line call', () => {
  assert.deepEqual(refused(call('{ cwd: d, env: gitEnv(path.dirname(d)) }')), []);
  assert.deepEqual(refused(call('{\n  cwd: d,\n  env: gitEnv(),\n}', 'execFileSync')), []);
});

test('an identifier passes only when declared const X = gitEnv(...) and never mutated', () => {
  const use = call('{ env: E }');
  assert.deepEqual(refused('const E = gitEnv();\n' + use), []);
  assert.equal(refused('const E = { ...process.env };\n' + use).length, 1, 'declared from process.env');
  assert.equal(refused("const E = gitEnv();\nE.GIT_DIR = 'x';\n" + use).length, 1, 'mutated after');
  assert.equal(refused('const E = gitEnv();\ndelete E.GIT_CEILING_DIRECTORIES;\n' + use).length, 1, 'deleted from');
  assert.equal(refused(call('{ env: someUndeclared }')).length, 1, 'no declaration at all');
});

test('an expression that merely CONTAINS gitEnv( is refused: presence of the helper is not the property', () => {
  assert.equal(refused(call('{ env: base || gitEnv() }')).length, 1);
  assert.equal(refused(call('{ env: Object.assign(gitEnv(), extra) }')).length, 1);
  assert.equal(refused(call("{ env: { ...gitEnv(), X: '1' } }")).length, 1);
});

// r12 findings-back L-5: CALL_RE took only ' and " as the quote around git, so a quote-less template literal
// spawn was unseen AND not named open. The backtick is built (String.fromCharCode) so this file stays clean
// of a literal call the census would read.
const BT = String.fromCharCode(96);
const btCall = (opts, fn = 'spawnSync') => fn + '(' + BT + 'git' + BT + ", ['status'], " + opts + ');';
test('L-5: a backtick-quoted git command is SEEN and refused without gitEnv, and passes with it', () => {
  const bad = censusGitSpawns(files(btCall('{ cwd: d, env: process.env }')));
  assert.equal(bad.spawns, 1, 'the census must count the backtick-quoted spawn');
  assert.equal(bad.findings.length, 1);
  assert.match(bad.findings[0], /process\.env/);
  assert.equal(refused(btCall('{ cwd: d }', 'execFileSync')).length, 1, 'a missing env: is refused too');
  const ok = censusGitSpawns(files(btCall('{ cwd: d, env: gitEnv() }')));
  assert.equal(ok.spawns, 1);
  assert.deepEqual(ok.findings, []);
});

test('a comment mention, a node child and a non-git command are not git spawns', () => {
  const text = [
    '// ' + call('{ env: process.env }'),
    '  * ' + call('{}'),
    'spawnSync(process.execPath, ["a"], { env: process.env });',
    "spawnSync('cmd.exe', ['/c'], {});",
  ].join('\n');
  const r = censusGitSpawns(files(text));
  assert.deepEqual(r.findings, []);
  assert.equal(r.spawns, 0);
});

test('unbalanced parens report as a finding, never a silent pass', () => {
  assert.match(refused('spawnSync(' + GIT + ", ['init'], { env: gitEnv()")[0], /unbalanced/);
});

test("THIS room's own sources pass: every git spawn takes env from gitEnv() alone", () => {
  const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const r = censusGitSpawns(collectSources(repo));
  assert.deepEqual(r.findings, []);
  assert.ok(r.spawns >= 10, "the census must actually SEE this room's spawns, saw " + r.spawns);
});

test('R14 CWK-174: an exempt carrier passes ONLY while its content is exactly the pinned blob', () => {
  const rel = 'scripts/carrier.test.mjs';
  const text = call('{ cwd: d }');
  assert.equal(censusGitSpawns(files(text, rel)).findings.length, 1, 'not exempt: the bare spawn is refused');
  const exempt = { [rel]: blobId(text) };
  assert.equal(censusGitSpawns(files(text, rel), exempt).findings.length, 0, 'pinned blob: exempt');
  const edited = censusGitSpawns(files(text + ' // edit', rel), exempt).findings;
  assert.equal(edited.length, 1, 'any edit makes it a finding again');
  assert.match(edited[0], /re-derive/);
  assert.equal(censusGitSpawns(files(text, 'scripts/other.mjs'), exempt).findings.length, 1, 'the exemption names a path, nothing else');
});

test('R14 CWK-174: blobId matches git hash-object for a known blob, and the pins name only the three org-carried files', () => {
  assert.equal(blobId(''), 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391');
  assert.equal(blobId('hello' + String.fromCharCode(10)), 'ce013625030ba8dba906f756967f9e9ca394464a');
  assert.deepEqual(Object.keys(EXEMPT_CARRIERS).sort(), ['scripts/release-notes.test.mjs', 'scripts/secret-gate.test.mjs', 'scripts/secret-scan.test.mjs']);
});

// UMB-456 (2), 08c: the census learns the ALLOWLIST env shape. Fixtures are built, never written as a literal call (see GIT above).
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const NOSYS = "GIT_CONFIG_NOSYSTEM: '1'";
const KEEP = "const keep = ['PATH', 'Path', 'SystemRoot', 'GIT_CEILING_DIRECTORIES'];\n";
const FILTERED = '...Object.fromEntries(keep.filter((k) => process.env[k] !== undefined).map((k) => [k, process.env[k]]))';
const allow = (extra = '') => '{ ' + FILTERED + ', ' + NOSYS + extra + ' }';

test('UMB-456 (2) RED-FIRST: an allowlist env passes: named keys, a filtered read of process.env, GIT_CONFIG_NOSYSTEM=1', () => {
  assert.deepEqual(refused(KEEP + 'const env = ' + allow() + ';\n' + call('{ cwd: d, env }')), [], 'a declared object, shorthand use');
  assert.deepEqual(refused(KEEP + call('{ cwd: d, env: ' + allow(", GIT_TERMINAL_PROMPT: '0'") + ' }')), [], 'an inline object');
  assert.deepEqual(refused(call("{ env: { PATH: process.env.PATH, GIT_CONFIG_NOSYSTEM: '1' } }")), [], 'named keys, property reads');
});

test('UMB-456 (2) RED-FIRST: the canon release-notes.mjs, as committed, passes the census with NO pin', () => {
  const text = fs.readFileSync(path.join(repoRoot, 'scripts', 'release-notes.mjs'), 'utf8');
  const r = censusGitSpawns([{ rel: 'scripts/release-notes.mjs', text }], {});
  assert.equal(r.spawns, 1, 'the census must SEE its one git spawn');
  assert.deepEqual(r.findings, []);
});

test('UMB-456 (2): an UNFILTERED process.env is still refused, however the object is dressed', () => {
  for (const [why, env] of [
    ['a spread beside the sentinel', '{ ...process.env, ' + NOSYS + ' }'],
    ['Object.assign', 'Object.assign({}, process.env, { ' + NOSYS + ' })'],
    ['the whole env as entries', '{ ...Object.fromEntries(Object.entries(process.env)), ' + NOSYS + ' }'],
    ['a spread of an identifier the census cannot see through', '{ PATH: process.env.PATH, ...extra, ' + NOSYS + ' }'],
  ]) assert.equal(refused(call('{ env: ' + env + ' }')).length, 1, why);
  assert.equal(refused(KEEP + 'const env = { ...process.env, ' + NOSYS + ' };\n' + call('{ env }')).length, 1, 'declared with the spread');
});

test('UMB-456 (2): an allowlist needs GIT_CONFIG_NOSYSTEM=1 and no repository-aiming GIT_* key, in the object or the key list it filters', () => {
  assert.equal(refused(KEEP + call('{ env: { ' + FILTERED + ' } }')).length, 1, 'no sentinel');
  assert.equal(refused(KEEP + call("{ env: { " + FILTERED + ", GIT_CONFIG_NOSYSTEM: '0' } }")).length, 1, 'sentinel off');
  assert.equal(refused(KEEP + call('{ env: ' + allow(", GIT_DIR: '/x'") + ' }')).length, 1, 'GIT_DIR in the object');
  assert.equal(refused(KEEP.replace("'Path'", "'GIT_INDEX_FILE'") + call('{ env: ' + allow() + ' }')).length, 1, 'GIT_INDEX_FILE in the key list');
  assert.equal(refused(call('{ env: ' + allow() + ' }')).length, 1, 'a key list the census cannot find is refused');
  assert.equal(refused(KEEP + 'const env = ' + allow() + ";\nenv.GIT_DIR = 'x';\n" + call('{ env }')).length, 1, 'mutated after its declaration');
});
