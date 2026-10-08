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

// 08d: the census reads TOKENS, so a comment is a comment wherever it sits. The old line-prefix test fed a bare `*` line; a real
// block comment is the honest form of the same case.
test('a comment mention, a node child and a non-git command are not git spawns', () => {
  const text = [
    '// ' + call('{ env: process.env }'),
    '/*',
    ' * ' + call('{}'),
    ' */',
    'spawnSync(process.execPath, ["a"], { env: process.env });',
    "spawnSync('cmd.exe', ['/c'], {});",
  ].join('\n');
  const r = censusGitSpawns(files(text));
  assert.deepEqual(r.findings, []);
  assert.equal(r.spawns, 0);
});

test('unbalanced parens report as a finding, never a silent pass', () => {
  assert.match(refused('spawnSync(' + GIT + ", ['init'], { env: gitEnv()")[0], /unbalanced/);
  assert.match(refused('spawnSync(' + GIT + ", ['init'], { env: gitEnv( }); ")[0], /unbalanced/);
});

test("THIS room's own sources pass: every git spawn takes env from gitEnv() or a checked allowlist", () => {
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
  assert.deepEqual(Object.keys(EXEMPT_CARRIERS).sort(), ['scripts/secret-gate.mjs', 'scripts/secret-gate.test.mjs', 'scripts/secret-scan.test.mjs']);
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

// ------------------------------------------------------------------------------------------------------------------------------
// 08d: THE CENSUS WITNESS LIST (U/scratchpad/dispatch/08d-census-witness-list.md): F1-F42 must FAIL, R1-R2 must be COUNTED and FAIL,
// P1-P6 must PASS with no pin. One test per vector; a vector that declares a `const env` runs BOTH call forms ({ env } and env: env).
// The probe text exists only in memory, handed to the pure census with no exemptions.
// ------------------------------------------------------------------------------------------------------------------------------
const HEAD = "import { spawnSync } from 'node:child_process';\n";
const spawnText = (opts) => 'spawnSync(' + GIT + ", ['status'], " + opts + ');\n';
const verdict = (text) => censusGitSpawns([{ rel: 'scripts/vector.mjs', text }], {});
const KEEP2 = "const keep = ['PATH', 'HOME'];\n";
const MAPPED = '...Object.fromEntries(keep.map((k) => [k, process.env[k]]))';
const SAFE_ENV = '{ PATH: process.env.PATH, ' + NOSYS + ' }';
const FORMS = ['{ env }', '{ env: env }'];

// [id, why, text before the spawn, the env expression written inline]
const FAIL_INLINE = [
  ['F2', 'Object.fromEntries(Object.entries(process.env)) copies the whole env', '', '{ ...Object.fromEntries(Object.entries(process.env)), ' + NOSYS + ' }'],
  ['F3', 'a filter over the whole env is not a named key list', '', '{ ...Object.fromEntries(Object.entries(process.env).filter(() => true)), ' + NOSYS + ' }'],
  ['F4', "process['env'] spread", '', "{ ...process['env'], " + NOSYS + ' }'],
  ['F5', 'an imported alias of process.env spread', "import { env as penv } from 'node:process';\n", '{ ...penv, ' + NOSYS + ' }'],
  ['F6', 'process.env spread after gitEnv()', '', '{ ...gitEnv(d), ...process.env }'],
  ['F7', 'a copy of process.env spread after gitEnv()', 'const base = { ...process.env };\n', '{ ...gitEnv(d), ...base }'],
  ['F8', 'process.env spread in a nested object', '', '{ ' + NOSYS + ', extra: { ...process.env } }'],
  ['F9', 'the tail of an allowed spread: .concat(Object.entries(process.env))', KEEP2, '{ ...Object.fromEntries(keep.filter(Boolean).map((k) => [k, process.env[k]]).concat(Object.entries(process.env))), ' + NOSYS + ' }'],
  ['F10', 'flatMap over Object.entries(process.env) inside the spread', KEEP2, '{ ...Object.fromEntries(keep.filter(Boolean).flatMap(() => Object.entries(process.env))), ' + NOSYS + ' }'],
  ['F11', 'a value that IS process.env', '', '{ ' + NOSYS + ', all: process.env }'],
  ['F12', 'a helper returning process.env inside fromEntries', 'function all() { return process.env; }\n', '{ ...Object.fromEntries(Object.entries(all())), ' + NOSYS + ' }'],
  ['F13', 'a helper with a clean first return and process.env on a second path', 'function mk(x) { if (x) return ' + SAFE_ENV + '; return process.env; }\n', 'mk(d)'],
  ['F14', 'a helper CALL the census cannot follow', '', 'sandboxEnv(cwd)'],
  ['F18', 'the key list mutated after its declaration', "const KEYS = ['PATH'];\nKEYS.push('GIT_DIR');\n", '{ ...Object.fromEntries(KEYS.map((k) => [k, process.env[k]])), ' + NOSYS + ' }'],
  ['F19', 'a key list carrying GIT_DIR', "const keep = ['PATH', 'GIT_DIR'];\n", '{ ' + MAPPED + ', ' + NOSYS + ' }'],
  ['F20', 'GIT_DIR two consts away', "const k2 = ['GIT_DIR'];\nconst keep = ['PATH', ...k2];\n", '{ ' + MAPPED + ', ' + NOSYS + ' }'],
  ['F21', 'a computed GIT_ name in the key list', "const keep = ['PATH', 'GIT_' + 'DIR'];\n", '{ ' + MAPPED + ', ' + NOSYS + ' }'],
  ['F22', 'a computed property key in the object', '', "{ " + NOSYS + ", ['GIT' + '_DIR']: process.env['GIT' + '_DIR'] }"],
  ['F23', 'GIT_CONFIG_NOSYSTEM set to 0', '', "{ PATH: process.env.PATH, GIT_CONFIG_NOSYSTEM: '0' }"],
  ['F24', 'a duplicate sentinel, the last one wins', '', "{ " + NOSYS + ", GIT_CONFIG_NOSYSTEM: '0' }"],
  ['F25', "the sentinel '1' then a spread that sets '0'", KEEP2 + "const over = { GIT_CONFIG_NOSYSTEM: '0' };\n", '{ ' + NOSYS + ', ' + MAPPED + ', ...over }'],
  ['F25b', 'a key-list spread AFTER the sentinel can overwrite it', KEEP2, '{ ' + NOSYS + ', ' + MAPPED + ' }'],
  ['F26', 'no GIT_CONFIG_NOSYSTEM at all', '', '{ PATH: process.env.PATH }'],
  ['F27', 'GIT_CONFIG_NOSYSTEM not a literal', "const flag = '1';\n", '{ GIT_CONFIG_NOSYSTEM: flag }'],
  ['F28a', 'the sentinel only inside a block comment', '', "{ PATH: process.env.PATH /* GIT_CONFIG_NOSYSTEM: '1' */ }"],
  ['F28b', 'the sentinel only inside a line comment', '', "{\n  PATH: process.env.PATH,\n  // GIT_CONFIG_NOSYSTEM: '1'\n}"],
  ['F29', 'a lower-case git_dir key (a Windows env is case-insensitive)', '', '{ ' + NOSYS + ', git_dir: d }'],
  ['F30', 'an explicit GIT_DIR key', '', '{ ' + NOSYS + ', GIT_DIR: x }'],
  ['F41a', "a regex literal holding a quote before a GIT_DIR entry", '', "{ A: /'/.source, " + NOSYS + ', GIT_DIR: d }'],
  ['F41b', 'a template value holding a backtick before a GIT_DIR entry', '', '{ A: ' + BT + 'x${' + "'" + BT + "'" + '}y' + BT + ', ' + NOSYS + ', GIT_DIR: d }'],
  ['F41c', 'a regex literal earlier in the file does not hide a GIT_DIR entry', 'const re = /"/;\nconst re2 = /\'/;\n', '{ ' + NOSYS + ', GIT_DIR: d }'],
  ['F42a', 'a file-local helper NAMED gitEnv that spreads process.env', 'function gitEnv() { return { ...process.env }; }\n', 'gitEnv()'],
  ['F42b', 'a file-local helper NAMED gitTestEnv that returns process.env', 'const gitTestEnv = () => process.env;\n', 'gitTestEnv(d)'],
  ['F42c', 'gitEnv imported under an alias from somewhere else', "import { other as gitEnv } from './x.mjs';\n", 'gitEnv()'],
];

// [id, why, build(use)] -- every one declares `const env`, so both call forms run. F31-F34 are the scope-binding vectors.
const FAIL_DECL = [
  ['F1', 'a copy of process.env one hop away', (u) => 'const base = { ...process.env };\nconst env = { ...base, ' + NOSYS + ' };\n' + spawnText(u)],
  ['F15', 'Object.assign(env, process.env) after the declaration', (u) => 'const env = ' + SAFE_ENV + ';\nObject.assign(env, process.env);\n' + spawnText(u)],
  ['F16', 'a for-of copy of process.env into env', (u) => 'const env = { ' + NOSYS + ' };\nfor (const k of Object.keys(process.env)) env[k] = process.env[k];\n' + spawnText(u)],
  ['F17', 'env.GIT_DIR assigned after the declaration', (u) => 'const env = ' + SAFE_ENV + ";\nenv.GIT_DIR = '/elsewhere/.git';\n" + spawnText(u)],
  ['F31', 'a clean env in function a(), process.env in function b() where the spawn is', (u) => 'function a() { const env = ' + SAFE_ENV + '; return env; }\nfunction b() { const env = { ...process.env }; ' + spawnText(u) + ' }\n'],
  ['F32', 'a module-level clean env shadowed by an inner let at the spawn', (u) => 'const env = ' + SAFE_ENV + ';\nfunction f() { let env = { ...process.env }; ' + spawnText(u) + ' }\n'],
  ['F33', 'env is a function PARAMETER at the spawn, a clean env elsewhere', (u) => 'const env = ' + SAFE_ENV + ';\nfunction f(env) { ' + spawnText(u) + ' }\n'],
  ['F35', 'an alias, then a for-in copy through the alias', (u) => 'const env = ' + SAFE_ENV + ';\nconst alias = env;\nfor (const k in process.env) alias[k] = process.env[k];\n' + spawnText(u)],
  ['F36', 'the copy moved into a helper that is handed env', (u) => 'const env = ' + SAFE_ENV + ';\nfunction fill(o) { for (const k in process.env) o[k] = process.env[k]; }\nfill(env);\n' + spawnText(u)],
  ['F37', 'Reflect.set(env, GIT_DIR, ...)', (u) => 'const env = ' + SAFE_ENV + ";\nReflect.set(env, 'GIT_DIR', d);\n" + spawnText(u)],
  ['F38', 'an alias, then alias.GIT_DIR = ...', (u) => 'const env = ' + SAFE_ENV + ';\nconst alias = env;\nalias.GIT_DIR = d;\n' + spawnText(u)],
  ['F39', 'Object.assign(Object(env), { GIT_DIR })', (u) => 'const env = ' + SAFE_ENV + ';\nObject.assign(Object(env), { GIT_DIR: d });\n' + spawnText(u)],
  ['F40', 'a method call on the env object that is not in any mutator list', (u) => 'const env = ' + SAFE_ENV + ";\nenv.__defineGetter__('GIT_DIR', () => d);\n" + spawnText(u)],
  ['F40b', 'a method call on the env object: Object.defineProperty', (u) => 'const env = ' + SAFE_ENV + ";\nObject.defineProperty(env, 'GIT_DIR', { value: d });\n" + spawnText(u)],
  ['F43', 'a declared env that is exported (an importer can mutate it)', (u) => 'export const env = ' + SAFE_ENV + ';\n' + spawnText(u)],
];

for (const [id, why, pre, envExpr] of FAIL_INLINE) {
  test('08d ' + id + ' MUST FAIL: ' + why, () => {
    const r = verdict(HEAD + pre + spawnText('{ env: ' + envExpr + ' }'));
    assert.equal(r.spawns, 1, 'the census must COUNT the spawn');
    assert.ok(r.findings.length >= 1, 'a finding is required for: ' + envExpr);
  });
}

for (const [id, why, build] of FAIL_DECL) {
  for (const use of FORMS) {
    test('08d ' + id + ' MUST FAIL (' + use + '): ' + why, () => {
      const r = verdict(HEAD + build(use));
      assert.equal(r.spawns, 1, 'the census must COUNT the spawn');
      assert.ok(r.findings.length >= 1, 'a finding is required for ' + id);
    });
  }
}

test('08d F34 MUST FAIL: env: e2 where two functions each declare const e2, the first clean, the second process.env', () => {
  const text = HEAD + 'function a() { const e2 = ' + SAFE_ENV + '; return e2; }\nfunction b() { const e2 = { ...process.env }; ' + spawnText('{ env: e2 }') + ' }\n';
  const r = verdict(text);
  assert.equal(r.spawns, 1);
  assert.ok(r.findings.length >= 1);
});

for (const [id, text] of [
  ['R1', 'spawnSync(' + BT + 'git' + BT + ", ['status'], { env: process.env });\n"],
  ['R2', "spawnSync('git.exe', ['status'], { env: process.env });\n"],
  ['R3', "spawnSync('/usr/bin/git', ['status'], { env: process.env });\n"],
  ['R4', "child_process.spawnSync('git', ['status'], { env: process.env });\n"],
]) {
  test('08d ' + id + ' MUST BE COUNTED then FAIL: ' + text.slice(0, 40), () => {
    const r = verdict(HEAD + text);
    assert.equal(r.spawns, 1, 'the census must COUNT the spawn');
    assert.ok(r.findings.length >= 1);
  });
}

// P1: the on-disk canon release-notes.mjs is the R15 test above ('the canon release-notes.mjs, as committed, passes ... NO pin').
// P2 (the canon release-notes.test.mjs at 7e779ef8) is added with its re-copy.
for (const [id, why, pre, envExpr] of [
  ['P3a', 'env: gitEnv(d)', '', 'gitEnv(d)'],
  ['P4', 'an inline allowlist literal of named keys', '', "{ PATH: process.env.PATH, HOME: process.env.HOME, " + NOSYS + ' }'],
  ['P5', 'the named-pick form with nothing after the final paren', KEEP2, '{ ...Object.fromEntries(keep.filter((k) => k in process.env).map((k) => [k, process.env[k]])), ' + NOSYS + ' }'],
  ['P5b', 'the pick without a filter', KEEP2, '{ ' + MAPPED + ', ' + NOSYS + ' }'],
  ['P6', 'the three allowed GIT_* names together', KEEP2, '{ ' + MAPPED + ', ' + NOSYS + ", GIT_TERMINAL_PROMPT: '0', GIT_CEILING_DIRECTORIES: d }"],
]) {
  test('08d ' + id + ' MUST PASS with no pin: ' + why, () => {
    const r = verdict(HEAD + pre + spawnText('{ env: ' + envExpr + ' }'));
    assert.equal(r.spawns, 1);
    assert.deepEqual(r.findings, []);
  });
}

for (const use of FORMS) {
  test('08d P3b MUST PASS with no pin (' + use + '): const env = gitEnv(d)', () => {
    const r = verdict(HEAD + 'const env = gitEnv(d);\n' + spawnText(use));
    assert.equal(r.spawns, 1);
    assert.deepEqual(r.findings, []);
  });
  test('08d P4b MUST PASS with no pin (' + use + '): a declared allowlist read by two spawns', () => {
    const r = verdict(HEAD + KEEP2 + 'const env = { ' + MAPPED + ', ' + NOSYS + ' };\n' + spawnText(use) + spawnText(use));
    assert.equal(r.spawns, 2);
    assert.deepEqual(r.findings, []);
  });
}

// P2: the canon release-notes.test.mjs (overlay blob 7e779ef8) takes `env: sandboxEnv(cwd)` from a helper it defines in the same file as one literal
// of named keys. Its pin comes OUT: the census reads a same-file helper that returns one allowlist object (iv).
test('08d P2 MUST PASS with no pin: the canon release-notes.test.mjs (sandboxEnv is one allowlist literal in the same file)', () => {
  const text = fs.readFileSync(path.join(repoRoot, 'scripts', 'release-notes.test.mjs'), 'utf8');
  const r = censusGitSpawns([{ rel: 'scripts/release-notes.test.mjs', text }], {});
  assert.ok(r.spawns >= 1, 'the census must SEE its git spawns, saw ' + r.spawns);
  assert.deepEqual(r.findings, []);
});

// Same-file helpers (iv): a helper this file defines once, with a body that is one `return {allowlist}`, and only ever calls.
const HELPER = "const mk = (dir) => ({ PATH: process.env.PATH, HOME: dir, " + NOSYS + ' });\n';
for (const [id, why, text] of [
  ['P7a', 'a same-file arrow helper returning one allowlist object', HELPER + spawnText('{ env: mk(d) }')],
  ['P7b', 'a same-file block-bodied arrow helper with one return', 'const mk = (dir) => { return { PATH: process.env.PATH, HOME: dir, ' + NOSYS + ' }; };\n' + spawnText('{ env: mk(d) }')],
  ['P7c', 'a same-file function declaration with one return', 'function mk(dir) { return { PATH: process.env.PATH, HOME: dir, ' + NOSYS + ' }; }\n' + spawnText('{ env: mk(d) }')],
  ['P7d', 'a declared env that holds a helper call, read by shorthand', HELPER + 'const env = mk(d);\n' + spawnText('{ env }')],
  ['P8', 'a regex literal inside an allowlist value is lexed, not trusted', "const strip = (p) => ({ PATH: p.replace(/[/]+$/, ''), " + NOSYS + ' });\n' + spawnText('{ env: strip(d) }')],
  ['P9', 'gitEnv imported from the room helper is trusted by name', "import { gitEnv } from './git-env.mjs';\n" + spawnText('{ env: gitEnv(d) }')],
]) {
  test('08d ' + id + ' MUST PASS with no pin: ' + why, () => {
    const r = verdict(HEAD + text);
    assert.equal(r.spawns, 1);
    assert.deepEqual(r.findings, []);
  });
}
for (const [id, why, text] of [
  ['F13b', 'a helper with a second return path', 'const mk = (dir) => { if (dir) return ' + SAFE_ENV + '; return process.env; };\n' + spawnText('{ env: mk(d) }')],
  ['F13c', 'a helper defined twice (the second returns process.env)', HELPER + 'function mk(dir) { return { ...process.env }; }\n' + spawnText('{ env: mk(d) }')],
  ['F13d', 'a helper reassigned after its definition', 'let mk = (dir) => (' + SAFE_ENV + ');\nmk = (dir) => process.env;\n' + spawnText('{ env: mk(d) }')],
  ['F13e', 'a helper also used as a value (aliased)', HELPER + 'const alias = mk;\n' + spawnText('{ env: mk(d) }')],
  ['F13f', 'a helper with a default parameter', 'const mk = (dir = process.env.GIT_DIR) => (' + SAFE_ENV + ');\n' + spawnText('{ env: mk(d) }')],
  ['F13g', 'a helper name shadowed by a parameter at the spawn', HELPER + 'function f(mk) { ' + spawnText('{ env: mk(d) }') + ' }\n'],
  ['F13h', 'a helper with a statement before its return', 'function mk(dir) { process.env.X = 1; return ' + SAFE_ENV + '; }\n' + spawnText('{ env: mk(d) }')],
  ['F13i', 'a helper whose returned object spreads process.env', 'const mk = (dir) => ({ ...process.env, ' + NOSYS + ' });\n' + spawnText('{ env: mk(d) }')],
  ['F14b', 'a helper imported from another file is not followed', "import { sandboxEnv } from './sandbox.mjs';\n" + spawnText('{ env: sandboxEnv(d) }')],
]) {
  test('08d ' + id + ' MUST FAIL: ' + why, () => {
    const r = verdict(HEAD + text);
    assert.equal(r.spawns, 1, 'the census must COUNT the spawn');
    assert.ok(r.findings.length >= 1);
  });
}

// 08d round 2 (reviewer 938ee6bc, witness rev-census.mjs N1a-N2b).
// F44: a __proto__ key in an object literal SETS THE PROTOTYPE; Node's spawn walks the env with for...in, so git inherits whatever the
// prototype holds (measured by the reviewer: GIT_DIR through the prototype reaches git). The census refuses the key, quoted or not.
const PROTO_SAFE = "PATH: process.env.PATH, " + NOSYS;
for (const [id, why, pre, envExpr] of [
  ['F44a', '__proto__: an imported alias of process.env', "import { env as penv } from 'node:process';\n", '{ __proto__: penv, ' + PROTO_SAFE + ' }'],
  ['F44b', "a quoted '__proto__' key whose value is a helper call returning process.env", 'function all() { return process.env; }\n', "{ '__proto__': all(), " + PROTO_SAFE + ' }'],
  ['F44c', 'a same-file helper (iv) that takes the prototype as a parameter', 'const mk = (b) => ({ __proto__: b, ' + PROTO_SAFE + ' });\n', 'mk(process.env)'],
  ['F44e', 'a shorthand __proto__ property', 'const __proto__ = process.env;\n', '{ __proto__, ' + PROTO_SAFE + ' }'],
]) {
  test('08d ' + id + ' MUST FAIL: ' + why, () => {
    const r = verdict(HEAD + pre + spawnText('{ env: ' + envExpr + ' }'));
    assert.equal(r.spawns, 1, 'the census must COUNT the spawn');
    assert.ok(r.findings.length >= 1, 'a finding is required for: ' + envExpr);
    assert.match(r.findings[0], /__proto__|prototype/, 'the finding must name the prototype');
  });
}
for (const use of FORMS) {
  test('08d F44d MUST FAIL (' + use + '): const env with __proto__ over a copy of process.env', () => {
    const r = verdict(HEAD + 'const base = { ...process.env };\nconst env = { __proto__: base, ' + NOSYS + ' };\n' + spawnText(use));
    assert.equal(r.spawns, 1);
    assert.ok(r.findings.length >= 1);
  });
}

// F45: a regex literal after the ) of an if/while/for/with, or after a block }, must be lexed as a regex. Read as division, the quote
// inside it opens a string that swallows the next statement, so a MUTATION of the env hides while the spawn the census sees passes.
for (const [id, why, tail] of [
  ['F45a', 'a regex after if (...)', "if (true) /'/.test(''); Object.assign(env, process.env); //'\n"],
  ['F45b', 'a regex after a block }', "function f() {}\n/'/.test(''); Object.assign(env, process.env); //'\n"],
  ['F45c', 'a regex after while (...)', "while (false) /'/.test(''); Object.assign(env, process.env); //'\n"],
  ['F45d', 'a regex after for (...)', "for (;false;) /'/.test(''); Object.assign(env, process.env); //'\n"],
  ['F45e', 'a regex after an else block', "if (false) { } else { }\n/'/.test(''); Object.assign(env, process.env); //'\n"],
]) {
  for (const use of FORMS) {
    test('08d ' + id + ' MUST FAIL (' + use + '): the mutation is not hidden by ' + why, () => {
      const r = verdict(HEAD + 'const env = ' + SAFE_ENV + ';\n' + tail + spawnText(use));
      assert.equal(r.spawns, 1);
      assert.ok(r.findings.length >= 1, 'the Object.assign(env, process.env) must be seen');
    });
  }
}
test('08d F45 control: a division after a non-control ) or an object } stays a division and the file is read whole', () => {
  const text = HEAD + "const half = (a + b) / 2, third = ({ x: 1 }.x) / 'x'.length, obj = { y: 2 } / 3;\n" + spawnText('{ env: ' + SAFE_ENV + ' }');
  const r = verdict(text);
  assert.equal(r.spawns, 1);
  assert.deepEqual(r.findings, []);
});

test('08d: a file the census cannot read whole is a finding, never a silent pass', () => {
  const r = censusGitSpawns([{ rel: 'scripts/broken.mjs', text: "const s = 'never closed;\n" + spawnText('{ env: process.env }') }], {});
  assert.equal(r.findings.length, 1);
  assert.match(r.findings[0], /cannot be read whole/);
});
