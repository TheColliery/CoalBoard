// Hermetic spawn tests for scripts/configure.mjs (CWK-023): the real CLI is
// spawned as a child process against a sandboxed HOME/cwd, never imported --
// same shape as CoalLedger's own configure.test.mjs (the freshest sibling
// precedent), adapted for CoalBoard's own schema (obj/noFlag keys) AND for
// CoalBoard's own root-walk mechanism, which is NOT CL's: CB's
// findProjectCfg has no git/marker-resolved root, it checks all 5 read-order
// candidates at EVERY directory level from cwd up to home, stopping the
// INSTANT `dir === home` -- BEFORE checking that level's own candidates
// (hooks/coalboard-conductor.js's own comment: "this room's existing
// upward walk has no root-marker concept"). That stop condition requires
// HOME TO BE A GENUINE ANCESTOR OF cwd, never the SAME directory and never
// an unrelated sibling:
//   - two INDEPENDENT sibling tmpdirs (CL's own sandbox() shape, which this
//     file's first draft copied verbatim) never satisfy `dir === home` at
//     all, so the walk silently escapes PAST the fake home into the REAL
//     filesystem tree and can find (and overwrite) a real config there.
//     Caught live: that first draft wrote a real ~/.claude/.coalboard.json
//     on this machine.
//   - cwd === home (this file's SECOND draft, matching a DIFFERENT existing
//     test in conductor.test.mjs that legitimately tests the GLOBAL read
//     path) breaks on i=0 BEFORE checking cwd's own candidates -- so a
//     config placed directly at cwd is NEVER found; a migration test built
//     on this shape silently exercises the wrong code path and reports a
//     false pass on the wrong assertion.
// The pattern that is actually correct for "a real project nested under a
// real home" is already proven in this room's OWN conductor.test.mjs
// ("project config read from a PARENT when cwd is a subdir" -- `root` holds
// the project files, a genuinely separate `home` is used only for the
// global layer) and its "findProjectCfg STOPS at home" test (`home =
// path.join(base, 'h')`, `proj = path.join(home, 'proj')` -- home a real
// ancestor of proj, never equal, never a sibling). This file's sandbox now
// matches that shape: home is a fresh tmpdir, proj is a real subdirectory
// of home.
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CONFIG_SCHEMA } from './lib/config-schema.mjs';
import { gitEnv } from './lib/git-env.mjs';
import { removeTree } from './lib/test-teardown.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '..');
const CLI = path.join(REPO, 'scripts', 'configure.mjs');

// home = a fresh tmpdir; proj = a REAL subdirectory of home (never equal,
// never a sibling) -- findProjectCfg's upward walk from proj reaches home
// after exactly one `path.dirname` step and stops there, so a config placed
// AT proj is found on i=0, and nothing above home is ever reachable.
function sandbox() {
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cb-cfg-home-')));
  const proj = path.join(home, 'project');
  fs.mkdirSync(proj, { recursive: true });
  return { home, proj };
}
function clean({ home }) { removeTree(home); }

function run(args, { home, proj }) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd: proj,
    encoding: 'utf8',
    env: { ...process.env, HOME: home, USERPROFILE: home },
    timeout: 20000,
  });
}

const PROJECT_TARGET = (proj) => path.join(proj, '.claude', 'coal', 'coalboard.json');
const GLOBAL_TARGET = (home) => path.join(home, '.claude', '.coalboard.json');

test('configure: a valid write lands at the own-dir project path (.claude/coal/coalboard.json)', () => {
  const sb = sandbox();
  try {
    const r = run(['--language', 'th'], sb);
    assert.strictEqual(r.status, 0, `expected exit 0, stderr: ${r.stderr}`);
    assert.ok(fs.existsSync(PROJECT_TARGET(sb.proj)), 'config must be written at the own-dir default');
    const cfg = JSON.parse(fs.readFileSync(PROJECT_TARGET(sb.proj), 'utf8'));
    assert.strictEqual(cfg.language, 'th');
  } finally { clean(sb); }
});

// R16e T3 (vehicle thread, Copilot): the per-key check passes each of these two values alone; the PAIR is gateless auto-apply (both human gates removed). The CLI runs the
// schema's cross-key validateConfig on the final object BEFORE any write and refuses with a non-zero exit, so no file is created and an existing one stays byte-equal.
test('configure (R16e T3): coalboardMode auto with applyConsent false is refused: non-zero exit, no file created', () => {
  const sb = sandbox();
  try {
    const r = run(['--global', '--coalboardMode', 'auto', '--applyConsent', 'false'], sb);
    assert.notStrictEqual(r.status, 0, 'the gateless combination must exit non-zero: ' + r.stdout);
    assert.ok(/gateless/.test(r.stderr), 'the refusal names the problem: ' + r.stderr);
    assert.strictEqual(fs.existsSync(GLOBAL_TARGET(sb.home)), false, 'nothing is written');
  } finally { clean(sb); }
});
test('configure (R16e T3): the same refusal leaves an EXISTING config byte-equal, and a cross-layer-free pair still writes', () => {
  const sb = sandbox();
  try {
    fs.mkdirSync(path.dirname(GLOBAL_TARGET(sb.home)), { recursive: true });
    const before = JSON.stringify({ updateMode: 'ask' }, null, 2) + '\n';
    fs.writeFileSync(GLOBAL_TARGET(sb.home), before);
    const bad = run(['--global', '--coalboardMode', 'auto', '--applyConsent', 'false'], sb);
    assert.notStrictEqual(bad.status, 0);
    assert.strictEqual(fs.readFileSync(GLOBAL_TARGET(sb.home), 'utf8'), before, 'an existing config must be byte-equal after a refused write');
    const ok = run(['--global', '--coalboardMode', 'auto', '--applyConsent', 'true'], sb);
    assert.strictEqual(ok.status, 0, ok.stderr);
    assert.strictEqual(JSON.parse(fs.readFileSync(GLOBAL_TARGET(sb.home), 'utf8')).applyConsent, true);
  } finally { clean(sb); }
});
// R16e L1: the cross-key refusal comes BEFORE the malformed-config backup, so a refused write over a malformed config creates no .bak (a refusal writes nothing at all).
test('configure (R16e L1): a refused gateless write over a MALFORMED config creates no .bak and leaves the original untouched', () => {
  const sb = sandbox();
  try {
    fs.mkdirSync(path.dirname(GLOBAL_TARGET(sb.home)), { recursive: true });
    const before = '{ "coalboardMode": ';
    fs.writeFileSync(GLOBAL_TARGET(sb.home), before);
    const r = run(['--global', '--coalboardMode', 'auto', '--applyConsent', 'false'], sb);
    assert.strictEqual(r.status, 1, 'the refusal exits 1: ' + r.stdout + r.stderr);
    assert.strictEqual(fs.readFileSync(GLOBAL_TARGET(sb.home), 'utf8'), before, 'the malformed original is untouched');
    assert.strictEqual(fs.existsSync(GLOBAL_TARGET(sb.home) + '.bak'), false, 'a refused write creates no .bak');
  } finally { clean(sb); }
});
test('configure: --global writes .claude/.coalboard.json under HOME, not the project own-dir path', () => {
  const sb = sandbox();
  try {
    const r = run(['--global', '--updateMode', 'auto'], sb);
    assert.strictEqual(r.status, 0, `expected exit 0, stderr: ${r.stderr}`);
    assert.ok(fs.existsSync(GLOBAL_TARGET(sb.home)), 'global config must land at HOME/.claude/.coalboard.json');
    const cfg = JSON.parse(fs.readFileSync(GLOBAL_TARGET(sb.home), 'utf8'));
    assert.strictEqual(cfg.updateMode, 'auto');
    assert.strictEqual(fs.existsSync(PROJECT_TARGET(sb.proj)), false, 'a --global write must NOT also touch the project own-dir config');
  } finally { clean(sb); }
});

test('configure: an invalid enum value exits non-zero and writes NOTHING', () => {
  const sb = sandbox();
  try {
    const r = run(['--coalboardMode', 'banana'], sb);
    assert.notStrictEqual(r.status, 0, 'invalid enum must fail loud (scripts-quality.md §1)');
    assert.ok(r.stderr.includes('coalboardMode'), 'the error must name the offending key');
    assert.strictEqual(fs.existsSync(PROJECT_TARGET(sb.proj)), false, 'a rejected value must write nothing');
  } finally { clean(sb); }
});

test('configure: an unrecognised flag exits non-zero and writes NOTHING', () => {
  const sb = sandbox();
  try {
    const r = run(['--not-a-real-flag', 'x'], sb);
    assert.notStrictEqual(r.status, 0, 'an unknown flag must fail loud');
    assert.ok(r.stderr.includes('Unrecognized option'));
    assert.strictEqual(fs.existsSync(PROJECT_TARGET(sb.proj)), false, 'a rejected flag must write nothing');
  } finally { clean(sb); }
});

test('configure: a LEGACY-location config (.claude/.coalboard.json AT the project dir) migrates on write, old file removed', () => {
  const sb = sandbox();
  try {
    fs.mkdirSync(path.join(sb.proj, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(sb.proj, '.claude', '.coalboard.json'), JSON.stringify({ updateCheckDays: 30 }));
    const r = run(['--language', 'en'], sb);
    assert.strictEqual(r.status, 0, `expected exit 0, stderr: ${r.stderr}`);
    assert.ok(fs.existsSync(PROJECT_TARGET(sb.proj)), 'the config must land at the new own-dir location');
    const cfg = JSON.parse(fs.readFileSync(PROJECT_TARGET(sb.proj), 'utf8'));
    assert.strictEqual(cfg.updateCheckDays, 30, 'the pre-existing value survives the migration');
    assert.strictEqual(cfg.language, 'en', 'the new CLI-set value is also present');
    assert.strictEqual(fs.existsSync(path.join(sb.proj, '.claude', '.coalboard.json')), false, 'the legacy file must be removed after a successful migration');
    assert.ok(r.stdout.includes('Migrated the project config'), 'the migration must be announced, not silent');
  } finally { clean(sb); }
});

test('configure (UMB-133): a ROOT-legacy config (<project>/.coalboard.json) is FOUND, migrates on write to the canonical path, old file removed', () => {
  const sb = sandbox();
  try {
    fs.writeFileSync(path.join(sb.proj, '.coalboard.json'), JSON.stringify({ updateCheckDays: 30 }));
    const r = run(['--language', 'en'], sb);
    assert.strictEqual(r.status, 0, `expected exit 0, stderr: ${r.stderr}`);
    assert.ok(fs.existsSync(PROJECT_TARGET(sb.proj)), 'the config must land at the canonical own-dir location');
    const cfg = JSON.parse(fs.readFileSync(PROJECT_TARGET(sb.proj), 'utf8'));
    assert.strictEqual(cfg.updateCheckDays, 30, 'the value read from the root legacy file survives the migration -- proof the CLI FOUND it, not just planted a fresh config');
    assert.strictEqual(cfg.language, 'en');
    assert.strictEqual(fs.existsSync(path.join(sb.proj, '.coalboard.json')), false, 'the root legacy file must be removed after a successful migration');
    assert.ok(r.stdout.includes('Migrated the project config'), 'the migration must be announced, not silent');
  } finally { clean(sb); }
});

test('configure: an .agents-only project (no .claude/ dir anywhere) does NOT get a foreign .claude/ planted', () => {
  const sb = sandbox();
  try {
    fs.mkdirSync(path.join(sb.proj, '.agents'), { recursive: true });
    const r = run(['--language', 'th'], sb);
    assert.strictEqual(r.status, 0, `expected exit 0, stderr: ${r.stderr}`);
    const agentsTarget = path.join(sb.proj, '.agents', 'coal', 'coalboard.json');
    assert.ok(fs.existsSync(agentsTarget), 'the write must land under the agent dir the project already has');
    assert.strictEqual(fs.existsSync(path.join(sb.proj, '.claude')), false, 'no foreign .claude/ may be planted into an .agents-only project');
  } finally { clean(sb); }
});

test('configure: a noFlag key (lensTiers) is rejected as an unrecognised flag, not silently accepted', () => {
  const sb = sandbox();
  try {
    const r = run(['--lensTiers', '{"data":"opus"}'], sb);
    assert.notStrictEqual(r.status, 0, 'a nested-object key must not be settable as a single CLI value');
    assert.ok(r.stderr.includes('Unrecognized option'), 'lensTiers/rigorLensTiers/verifyGates are noFlag -- --help lists them separately, the flag map must not register them');
    assert.strictEqual(fs.existsSync(PROJECT_TARGET(sb.proj)), false);
  } finally { clean(sb); }
});

test('configure: --help lists every CLI-settable key and separately names the noFlag ones', () => {
  const sb = sandbox();
  try {
    const r = run(['--help'], sb);
    assert.strictEqual(r.status, 0);
    for (const spec of CONFIG_SCHEMA) {
      if (spec.noFlag) {
        assert.ok(r.stdout.includes(spec.key), `--help must name noFlag key '${spec.key}' in its own list`);
      } else {
        assert.ok(r.stdout.includes(`--${spec.key}`), `--help must list --${spec.key}`);
      }
    }
  } finally { clean(sb); }
});

// --------------------------------------------------------------------------
// THE ENUMERATE-EVERY-KEY TEST (CoalLedger's own paid-for lesson, applied
// here): every CLI-settable key in the schema is driven through the REAL
// binary with a representative valid value, and the written JSON is read
// back and asserted -- not merely "the process exited 0". A per-type value
// generator, not hand-picked cases, so a key added to the schema later is
// covered automatically without anyone remembering to add a line here.
// --------------------------------------------------------------------------
function representativeValue(spec) {
  switch (spec.type) {
    case 'bool': return { arg: 'true', expect: true };
    case 'int': {
      const v = spec.min != null ? spec.min : (spec.max != null ? spec.max : 1);
      return { arg: String(v), expect: v };
    }
    case 'enum': {
      const v = spec.values[0];
      return { arg: v, expect: v };
    }
    case 'str': return { arg: 'a-representative-string', expect: 'a-representative-string' };
    case 'strArr': {
      const items = spec.values ? [spec.values[0]] : ['alpha', 'beta'];
      const lowered = spec.lower ? items.map((s) => s.toLowerCase()) : items;
      return { arg: items.join(','), expect: lowered };
    }
    default: throw new Error(`no representative value generator for type '${spec.type}'`);
  }
}

const SETTABLE = CONFIG_SCHEMA.filter((s) => !s.noFlag);

test(`configure: every one of the ${SETTABLE.length} CLI-settable keys round-trips through the real binary`, () => {
  const sb = sandbox();
  try {
    // One combined invocation (all 28 flags in one process) -- proves the
    // parser handles the full flag set together, not just one key in
    // isolation, and is far cheaper than 28 separate spawns.
    const args = [];
    const expected = {};
    for (const spec of SETTABLE) {
      const { arg, expect } = representativeValue(spec);
      args.push(`--${spec.key}`, arg);
      expected[spec.key] = expect;
    }
    const r = run(args, sb);
    assert.strictEqual(r.status, 0, `expected exit 0 driving all ${SETTABLE.length} keys at once, stderr: ${r.stderr}`);
    const cfg = JSON.parse(fs.readFileSync(PROJECT_TARGET(sb.proj), 'utf8'));
    for (const spec of SETTABLE) {
      assert.deepStrictEqual(cfg[spec.key], expected[spec.key], `key '${spec.key}' (type ${spec.type}) did not round-trip: wrote ${JSON.stringify(expected[spec.key])}, read back ${JSON.stringify(cfg[spec.key])}`);
    }
  } finally { clean(sb); }
});

// The strArr-CLEAR hole CoalLedger's own round found: passing "" must clear
// the list to [], never leave the old value or error.
test('configure: strArr keys clear to [] on an empty-string value (the CL strArr-clear hole)', () => {
  const sb = sandbox();
  try {
    const r1 = run(['--criticalKeywords', 'foo,bar'], sb);
    assert.strictEqual(r1.status, 0, `stderr: ${r1.stderr}`);
    let cfg = JSON.parse(fs.readFileSync(PROJECT_TARGET(sb.proj), 'utf8'));
    assert.deepStrictEqual(cfg.criticalKeywords, ['foo', 'bar']);
    const r2 = run(['--criticalKeywords', ''], sb);
    assert.strictEqual(r2.status, 0, `stderr: ${r2.stderr}`);
    cfg = JSON.parse(fs.readFileSync(PROJECT_TARGET(sb.proj), 'utf8'));
    assert.deepStrictEqual(cfg.criticalKeywords, [], 'an empty-string value must clear the list to [], not leave it unchanged');
  } finally { clean(sb); }
});

// The `lower` normalization hole (findings-back CWK-052b): the enumerate-
// every-key test above generates strArr values that are ALREADY lowercase
// ('alpha'/'beta', or spec.values[0] for an enum-restricted strArr like
// 'lenses'), so it never actually exercises parseValue's `if (spec.lower)
// items = items.map(toLowerCase)` line -- deleting that line fails no test.
// This one drives a genuinely MIXED-CASE value through criticalKeywords
// (lower: true, free-form -- not enum-restricted, so no risk of the
// mixed-case form failing an enum membership check first) and asserts the
// written value is lowercased.
test('configure: a lower:true strArr key (criticalKeywords) normalizes a MIXED-CASE value to lowercase', () => {
  const sb = sandbox();
  try {
    const spec = CONFIG_SCHEMA.find((s) => s.key === 'criticalKeywords');
    assert.ok(spec?.lower, 'this test assumes criticalKeywords is lower:true -- if the schema changed, retarget it at another free-form lower:true key');
    const r = run(['--criticalKeywords', 'ALPHA,Beta'], sb);
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    const cfg = JSON.parse(fs.readFileSync(PROJECT_TARGET(sb.proj), 'utf8'));
    assert.deepStrictEqual(cfg.criticalKeywords, ['alpha', 'beta'], 'a lower:true strArr key must lowercase a mixed-case input, not store it verbatim');
  } finally { clean(sb); }
});

// The bool-STRICTNESS hole CoalLedger's own round found: only the literal
// strings "true"/"false" are valid -- anything else (a truthy-looking
// string, a number) must be rejected, never silently coerced.
test('configure: bool keys reject anything but the literal strings "true"/"false"', () => {
  const sb = sandbox();
  try {
    for (const bad of ['1', '0', 'yes', 'True', 'TRUE', 'on']) {
      const r = run(['--applyConsent', bad], sb);
      assert.notStrictEqual(r.status, 0, `bool key must reject '${bad}', not coerce it`);
      assert.strictEqual(fs.existsSync(PROJECT_TARGET(sb.proj)), false, `a rejected bool value ('${bad}') must write nothing`);
    }
  } finally { clean(sb); }
});

// int min/max clamp: a value outside the schema's declared bound is
// REJECTED at the CLI, not silently clamped or truncated (validateValue is
// the same function verify.mjs runs on the JSON value, so the two paths
// cannot drift apart on this).
test('configure: int keys reject a value outside their declared min/max', () => {
  const sb = sandbox();
  try {
    const spec = CONFIG_SCHEMA.find((s) => s.type === 'int' && s.max != null);
    assert.ok(spec, 'schema must have at least one int key with a max, or this test cannot run');
    const r = run([`--${spec.key}`, String(spec.max + 1)], sb);
    assert.notStrictEqual(r.status, 0, `${spec.key} must reject a value above its declared max (${spec.max})`);
    assert.ok(r.stderr.includes(spec.key));
    assert.strictEqual(fs.existsSync(PROJECT_TARGET(sb.proj)), false);
  } finally { clean(sb); }
});

// ---- r12 item 2 / CWK-125: the CLI's findProjectCfg mirrors the hook's walk and carried the same plain
// realpathSync physical(): a HOME spelled as its 8.3 alias never equalled the long-spelled cwd, so the walk
// escaped above home and the CLI WROTE through a FOREIGN config (the legacy-migrate branch rewrites the file
// it found). Capability probe, never process.platform; the same probe as conductor.test.mjs's shortAlias.
function shortAlias(dir) {
  try {
    const r = spawnSync('cmd.exe', ['/d', '/c', 'for %I in ("' + dir + '") do @echo %~sI'], { encoding: 'utf8', windowsVerbatimArguments: true, timeout: 20000 });
    const a = r.status === 0 ? String(r.stdout).trim() : '';
    return a && a.toLowerCase() !== dir.toLowerCase() && fs.existsSync(a) ? a : null;
  } catch { return null; }
}
test('configure CWK-125: HOME spelled as its 8.3 ALIAS -- the walk stops at home, a foreign config above it is neither read nor rewritten', (t) => {
  const base = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'cb-cfg-125-')));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const home = path.join(base, 'a-long-home-directory-name-cwk125');
  const proj = path.join(home, 'a-long-project-directory-name');
  fs.mkdirSync(proj, { recursive: true });
  fs.mkdirSync(path.join(base, '.claude'), { recursive: true });
  const foreign = path.join(base, '.claude', '.coalboard.json');
  const before = JSON.stringify({ language: 'foreign' });
  fs.writeFileSync(foreign, before);
  const alias = shortAlias(home);
  if (!alias) { t.skip('this volume makes no 8.3 alias (capability probe)'); return; }
  const r = run(['--updateMode', 'remind'], { home: alias, proj });
  assert.strictEqual(r.status, 0, 'stderr: ' + r.stderr);
  assert.strictEqual(fs.readFileSync(foreign, 'utf8'), before, 'the foreign config above home must be left untouched');
  assert.ok(fs.existsSync(PROJECT_TARGET(proj)), 'the write must land at the project own-dir default');
});

// ---- CI red on 396cabb: a legacy config must still MIGRATE when cwd is spelled as its 8.3 alias. findProjectCfg
// returns paths built from the EXPANDED cwd (CWK-125) while legacyPaths was built from the raw process.cwd(), so
// the string compare missed and the CLI rewrote the legacy file in place. A dev box with a short username makes
// no alias for its own TEMP, so the runner's condition is built here through the capability probe instead.
for (const [label, legacyRel] of [['nested .claude/.coalboard.json', ['.claude', '.coalboard.json']], ['root .coalboard.json', ['.coalboard.json']]]) {
  test(`configure: a LEGACY config (${label}) migrates on write when cwd is spelled as its 8.3 ALIAS`, (t) => {
    const base = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'cb-cfg-alias-')));
    t.after(() => fs.rmSync(base, { recursive: true, force: true }));
    const home = path.join(base, 'a-long-home-directory-name-migr');
    const proj = path.join(home, 'a-long-project-directory-name');
    fs.mkdirSync(path.dirname(path.join(proj, ...legacyRel)), { recursive: true });
    const legacy = path.join(proj, ...legacyRel);
    fs.writeFileSync(legacy, JSON.stringify({ updateCheckDays: 30 }));
    const alias = shortAlias(proj);
    if (!alias) { t.skip('this volume makes no 8.3 alias (capability probe)'); return; }
    const r = run(['--language', 'en'], { home, proj: alias });
    assert.strictEqual(r.status, 0, 'stderr: ' + r.stderr);
    assert.ok(fs.existsSync(PROJECT_TARGET(proj)), 'the config must land at the own-dir location, not be rewritten in place');
    assert.strictEqual(JSON.parse(fs.readFileSync(PROJECT_TARGET(proj), 'utf8')).updateCheckDays, 30, 'the legacy value survives the migration');
    assert.strictEqual(fs.existsSync(legacy), false, 'the legacy file is removed after the migration');
    assert.ok(r.stdout.includes('Migrated the project config'), 'the migration is announced');
  });
}

// ---- PR 19 #15 (u2): the migration must never delete a file git tracks (the room's own CodeRabbit path instruction). A tracked legacy file
// survives with a printed note; an untracked one is removed as before; with no git on PATH behaviour is unchanged (git stays optional).
const gitIn = (dir, ...args) => spawnSync('git', args, { cwd: dir, encoding: 'utf8', timeout: 20000, env: gitEnv(path.dirname(dir)) });
const legacyRepo = (sb, rel) => {
  const legacy = path.join(sb.proj, ...rel);
  fs.mkdirSync(path.dirname(legacy), { recursive: true });
  fs.writeFileSync(legacy, JSON.stringify({ updateCheckDays: 30 }));
  assert.strictEqual(gitIn(sb.proj, 'init', '--quiet').status, 0);
  return legacy;
};
for (const [label, rel] of [['nested .claude/.coalboard.json', ['.claude', '.coalboard.json']], ['root .coalboard.json', ['.coalboard.json']]]) {
  test(`configure (PR 19 #15): a git-TRACKED legacy config (${label}) survives the migration with a printed note, and the new config is written`, () => {
    const sb = sandbox();
    try {
      const legacy = legacyRepo(sb, rel);
      assert.strictEqual(gitIn(sb.proj, 'add', '--', path.join(...rel)).status, 0);
      const r = run(['--language', 'en'], sb);
      assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
      assert.ok(fs.existsSync(legacy), 'a file git tracks must not be deleted');
      assert.ok(/git tracks/.test(r.stdout), 'the kept file is announced: ' + r.stdout);
      assert.strictEqual(JSON.parse(fs.readFileSync(PROJECT_TARGET(sb.proj), 'utf8')).updateCheckDays, 30, 'the migration still writes the new config');
    } finally { clean(sb); }
  });
}
test('configure (PR 19 #15): an UNTRACKED legacy config inside a git repository is still removed by the migration', () => {
  const sb = sandbox();
  try {
    const legacy = legacyRepo(sb, ['.coalboard.json']);
    const r = run(['--language', 'en'], sb);
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    assert.strictEqual(fs.existsSync(legacy), false, 'an untracked legacy file is removed as before');
    assert.ok(r.stdout.includes('Migrated the project config'));
  } finally { clean(sb); }
});
// R16e T7 (vehicle thread, the head ruled FIXED; reverses the PR 19 #15 pin that deleted here): with no git on PATH, git cannot say whether it tracks the file, the same
// unknown answer as status 128, so the file is KEPT wherever a .git entry surrounds it (insideRepoTree is a filesystem walk and needs no git). Only with no repository at all does the delete run.
const noGitEnv = (sb) => {
  const emptyBin = path.join(sb.home, 'empty-bin');
  fs.mkdirSync(emptyBin, { recursive: true });
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^path$/i.test(k)));
  return { ...env, PATH: emptyBin, HOME: sb.home, USERPROFILE: sb.home };
};
test('configure (R16e T7): with no git on PATH a legacy config inside a repository tree is KEPT, with the note (git cannot say, so the delete does not run)', () => {
  const sb = sandbox();
  try {
    const legacy = legacyRepo(sb, ['.coalboard.json']);
    assert.strictEqual(gitIn(sb.proj, 'add', '--', '.coalboard.json').status, 0);
    const r = spawnSync(process.execPath, [CLI, '--language', 'en'], { cwd: sb.proj, encoding: 'utf8', env: noGitEnv(sb), timeout: 20000 });
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    assert.ok(fs.existsSync(legacy), 'with no git on PATH and a .git around it the legacy file must survive');
    assert.ok(/git tracks it \(or could not say\)/.test(r.stdout), 'the kept file is announced: ' + r.stdout);
    assert.ok(fs.existsSync(PROJECT_TARGET(sb.proj)), 'the migration still writes the new config');
  } finally { clean(sb); }
});
// R16e L4: insideRepoTree walks to the drive root, and os.tmpdir() sits under the home folder on Windows, so a machine whose home (or any parent of the temp dir) is a git
// repository would fail this leg for a reason that is not the code's. Probe for a .git ancestor of the sandbox first and skip visibly (one skippable leg).
const hasGitAncestor = (dir) => { for (let d = dir; ; d = path.dirname(d)) { if (fs.existsSync(path.join(d, '.git'))) return true; if (path.dirname(d) === d) return false; } };
test('configure (R16e T7): with no git on PATH and NO repository anywhere above, the legacy config is still removed by the migration', (t) => {
  const sb = sandbox();
  try {
    if (hasGitAncestor(sb.proj)) { t.skip('a .git sits above the temp dir on this machine (capability probe), so the no-repository case cannot be built here'); return; }
    const legacy = path.join(sb.proj, '.coalboard.json');
    fs.writeFileSync(legacy, JSON.stringify({ updateCheckDays: 30 }));
    const r = spawnSync(process.execPath, [CLI, '--language', 'en'], { cwd: sb.proj, encoding: 'utf8', env: noGitEnv(sb), timeout: 20000 });
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    assert.strictEqual(fs.existsSync(legacy), false, 'with no git and no .git anywhere the legacy file is removed as before');
    assert.ok(r.stdout.includes('Migrated the project config'));
  } finally { clean(sb); }
});

// ---- t29 #1 (09a): git is asked about the file, and an answer that is neither "tracked" nor "not tracked" keeps it where a repository exists.
// Only status 1 (a repository answered: not tracked) lets the migration delete where a repository exists. A corrupt index, a repository git refuses
// (dubious ownership, a broken .git file), a timeout and, since R16e T7, no git on PATH all answer something else, so the file stays when a .git entry (file or
// directory) sits in its directory or above it. No git at all deletes the file only when no .git surrounds it (the R16e T7 legs above and the nested-legacy migration legs).
test('configure (t29 #1): a legacy config committed to a repository whose index is CORRUPT survives the migration, with the note', () => {
  const sb = sandbox();
  try {
    const legacy = legacyRepo(sb, ['.coalboard.json']);
    assert.strictEqual(gitIn(sb.proj, 'add', '--', '.coalboard.json').status, 0);
    assert.strictEqual(gitIn(sb.proj, '-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'x').status, 0);
    fs.writeFileSync(path.join(sb.proj, '.git', 'index'), 'not an index');
    assert.notStrictEqual(gitIn(sb.proj, 'ls-files', '--error-unmatch', '--', '.coalboard.json').status, 0, 'precondition: git cannot read the index');
    const r = run(['--language', 'en'], sb);
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    assert.ok(fs.existsSync(legacy), 'git could not say, and a repository exists: the file must not be deleted');
    assert.ok(/git tracks/.test(r.stdout), 'the kept file is announced: ' + r.stdout);
    assert.strictEqual(JSON.parse(fs.readFileSync(PROJECT_TARGET(sb.proj), 'utf8')).updateCheckDays, 30, 'the new config is still written');
  } finally { clean(sb); }
});
test('configure (t29 #1): a .git FILE git cannot follow (a broken worktree pointer) is still a repository entry, so the legacy config is kept', () => {
  const sb = sandbox();
  try {
    const legacy = path.join(sb.proj, '.coalboard.json');
    fs.writeFileSync(legacy, JSON.stringify({ updateCheckDays: 30 }));
    fs.writeFileSync(path.join(sb.proj, '.git'), 'gitdir: ' + path.join(sb.home, 'nowhere') + '\n');
    const r = run(['--language', 'en'], sb);
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    assert.ok(fs.existsSync(legacy), 'a .git file is an entry: the walk tests existence, not isDirectory');
  } finally { clean(sb); }
});
test('configure (t29 #1): the repository may sit ABOVE the file (an ancestor .git), and a broken one still keeps a nested legacy config', () => {
  const sb = sandbox();
  try {
    fs.writeFileSync(path.join(sb.home, '.git'), 'gitdir: ' + path.join(sb.home, 'nowhere') + '\n');
    const legacy = path.join(sb.proj, '.claude', '.coalboard.json');
    fs.mkdirSync(path.dirname(legacy), { recursive: true });
    fs.writeFileSync(legacy, JSON.stringify({ updateCheckDays: 30 }));
    const r = run(['--language', 'en'], sb);
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    assert.ok(fs.existsSync(legacy), 'an ancestor .git entry counts');
  } finally { clean(sb); }
});

// ---- 16f wave 2 (CWK2-042, the mkdir-before-guard class; found by CoalLedger): configure.mjs made the parent folder with a recursive mkdir BEFORE anything judged
// the path, so a .claude junction (Windows) or symlink (POSIX) planted by a cloned repo got a folder made OUTSIDE the project and the config written there too, and
// the target file itself was written through a link. Every link-capable leg probes its capability and skips visibly (t.skip, one leg per test); they run on CI.
const probeLink = (kind) => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-cfg-probe-'));
  try {
    if (kind === 'dir') { fs.mkdirSync(path.join(d, 'a')); fs.symlinkSync(path.join(d, 'a'), path.join(d, 'b'), 'junction'); }
    else { fs.writeFileSync(path.join(d, 'a'), 'x'); fs.symlinkSync(path.join(d, 'a'), path.join(d, 'b'), 'file'); }
    return true;
  } catch { return false; } finally { removeTree(d); }
};
const CAN_DIR_LINK = probeLink('dir');
const CAN_FILE_LINK = probeLink('file');
const SKIP_DIR = CAN_DIR_LINK ? false : 'this box cannot create a directory link (capability probe)';
const SKIP_FILE = CAN_FILE_LINK ? false : 'this box cannot create a file symlink (capability probe, no privilege)';
const refusal = (r) => { assert.strictEqual(r.status, 1, 'exit 1: ' + r.stdout + r.stderr); assert.ok(/^Error: .*(refus|link|junction)/mi.test(r.stderr), 'an Error line names the refusal: ' + r.stderr); };

test('configure (CWK2-042): a .claude JUNCTION to a folder outside the project is refused: exit 1, nothing made outside, nothing written anywhere', { skip: SKIP_DIR }, () => {
  const sb = sandbox();
  try {
    const outside = path.join(sb.home, 'outside');
    fs.mkdirSync(outside);
    fs.symlinkSync(outside, path.join(sb.proj, '.claude'), 'junction');
    const r = run(['--language', 'en'], sb);
    refusal(r);
    assert.deepStrictEqual(fs.readdirSync(outside), [], 'no folder and no file appears outside the project');
  } finally { clean(sb); }
});

test('configure (CWK2-042): a junction AT .claude/coal is refused the same way', { skip: SKIP_DIR }, () => {
  const sb = sandbox();
  try {
    const outside = path.join(sb.home, 'outside');
    fs.mkdirSync(outside);
    fs.mkdirSync(path.join(sb.proj, '.claude'));
    fs.symlinkSync(outside, path.join(sb.proj, '.claude', 'coal'), 'junction');
    const r = run(['--language', 'en'], sb);
    refusal(r);
    assert.deepStrictEqual(fs.readdirSync(outside), [], 'nothing is written through the link');
  } finally { clean(sb); }
});

test('configure (CWK2-042): a link AT the target file is refused and the file it points to stays byte-equal', { skip: SKIP_FILE }, () => {
  const sb = sandbox();
  try {
    const victim = path.join(sb.home, 'victim.json');
    const before = JSON.stringify({ updateCheckDays: 30 }) + '\n';
    fs.writeFileSync(victim, before);
    fs.mkdirSync(path.dirname(PROJECT_TARGET(sb.proj)), { recursive: true });
    fs.symlinkSync(victim, PROJECT_TARGET(sb.proj), 'file');
    const r = run(['--language', 'en'], sb);
    refusal(r);
    assert.strictEqual(fs.readFileSync(victim, 'utf8'), before, 'the write did not follow the link');
  } finally { clean(sb); }
});

test('configure (CWK2-042): the plain case, a missing .claude and a missing coal folder inside the project, still write', () => {
  const a = sandbox();
  const b = sandbox();
  try {
    assert.strictEqual(run(['--language', 'en'], a).status, 0);
    assert.ok(fs.existsSync(PROJECT_TARGET(a.proj)), 'both folders are made inside the project');
    fs.mkdirSync(path.join(b.proj, '.claude'));
    assert.strictEqual(run(['--language', 'en'], b).status, 0);
    assert.ok(fs.existsSync(PROJECT_TARGET(b.proj)), 'the missing coal folder is made inside the existing .claude');
  } finally { clean(a); clean(b); }
});

test('configure (CWK2-042): the global config (no project root) still makes ~/.claude and writes, and a ~/.claude that is itself a link (a dotfile manager) still works', { skip: SKIP_DIR }, () => {
  const a = sandbox();
  const b = sandbox();
  try {
    assert.strictEqual(run(['--global', '--language', 'en'], a).status, 0);
    assert.ok(fs.existsSync(GLOBAL_TARGET(a.home)), 'the global folder is made and the file written');
    const managed = path.join(b.home, 'dotfiles');
    fs.mkdirSync(managed);
    fs.symlinkSync(managed, path.join(b.home, '.claude'), 'junction');
    const r = run(['--global', '--language', 'en'], b);
    assert.strictEqual(r.status, 0, r.stderr);
    assert.ok(fs.existsSync(path.join(managed, '.coalboard.json')), 'the write lands in the managed folder, as before');
  } finally { clean(a); clean(b); }
});

test('configure (CWK2-042): a refused write over a MALFORMED config leaves no .bak (the guard runs before the backup)', { skip: SKIP_DIR }, () => {
  const sb = sandbox();
  try {
    const outside = path.join(sb.home, 'outside');
    fs.mkdirSync(path.join(outside, 'coal'), { recursive: true });
    const malformed = '{ "language": ';
    fs.writeFileSync(path.join(outside, 'coal', 'coalboard.json'), malformed);
    fs.symlinkSync(outside, path.join(sb.proj, '.claude'), 'junction');
    const r = run(['--language', 'en'], sb);
    refusal(r);
    assert.deepStrictEqual(fs.readdirSync(path.join(outside, 'coal')), ['coalboard.json'], 'no .bak and nothing else appears beside the malformed file');
    assert.strictEqual(fs.readFileSync(path.join(outside, 'coal', 'coalboard.json'), 'utf8'), malformed, 'the file behind the link is untouched');
  } finally { clean(sb); }
});

// ---- 17a (INSPECT round 1 of wave 2): the guard also covers the two other names the run reads or writes through: the .bak copy's destination (H1) and a legacy read source (M1).
const runAt = (args, { home }, cwd) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env: { ...process.env, HOME: home, USERPROFILE: home }, timeout: 20000 });
const MALFORMED = '{ "language": ';
const malformedProject = (sb) => { fs.mkdirSync(path.dirname(PROJECT_TARGET(sb.proj)), { recursive: true }); fs.writeFileSync(PROJECT_TARGET(sb.proj), MALFORMED); };

test('configure (H1): a FILE symlink at <config>.bak is refused and the file it points to stays byte-equal', { skip: SKIP_FILE }, () => {
  const sb = sandbox();
  try {
    const victim = path.join(sb.home, 'victim.txt');
    fs.writeFileSync(victim, 'keep');
    malformedProject(sb);
    fs.symlinkSync(victim, PROJECT_TARGET(sb.proj) + '.bak', 'file');
    const r = run(['--language', 'en'], sb);
    refusal(r);
    assert.strictEqual(fs.readFileSync(victim, 'utf8'), 'keep', 'the backup did not write through the link');
    assert.strictEqual(fs.readFileSync(PROJECT_TARGET(sb.proj), 'utf8'), MALFORMED, 'the config is untouched');
  } finally { clean(sb); }
});

test('configure (H1): a JUNCTION at <config>.bak is refused before anything is rewritten', { skip: SKIP_DIR }, () => {
  const sb = sandbox();
  try {
    const outside = path.join(sb.home, 'outside');
    fs.mkdirSync(outside);
    malformedProject(sb);
    fs.symlinkSync(outside, PROJECT_TARGET(sb.proj) + '.bak', 'junction');
    const r = run(['--language', 'en'], sb);
    refusal(r);
    assert.strictEqual(fs.readFileSync(PROJECT_TARGET(sb.proj), 'utf8'), MALFORMED, 'a refused run rewrites nothing');
    assert.deepStrictEqual(fs.readdirSync(outside), [], 'nothing lands behind the link');
  } finally { clean(sb); }
});

test('configure (M1): a legacy <cwd>/.coalboard.json that is a FILE symlink is refused: its target is never read into the project', { skip: SKIP_FILE }, () => {
  const sb = sandbox();
  try {
    const victim = path.join(sb.home, 'secret.json');
    const before = JSON.stringify({ auths: { x: { auth: 'c2VjcmV0' } } });
    fs.writeFileSync(victim, before);
    fs.symlinkSync(victim, path.join(sb.proj, '.coalboard.json'), 'file');
    const r = run(['--language', 'en'], sb);
    refusal(r);
    assert.ok(!fs.existsSync(PROJECT_TARGET(sb.proj)), 'no config is written from the linked source');
    assert.strictEqual(fs.readFileSync(victim, 'utf8'), before);
  } finally { clean(sb); }
});

test('configure (M1): a legacy <cwd>/.coalboard.json that is a JUNCTION is refused, nothing is migrated', { skip: SKIP_DIR }, () => {
  const sb = sandbox();
  try {
    const outside = path.join(sb.home, 'outside');
    fs.mkdirSync(outside);
    fs.symlinkSync(outside, path.join(sb.proj, '.coalboard.json'), 'junction');
    const r = run(['--language', 'en'], sb);
    refusal(r);
    assert.ok(!fs.existsSync(PROJECT_TARGET(sb.proj)), 'no config is written');
    assert.deepStrictEqual(fs.readdirSync(outside), []);
  } finally { clean(sb); }
});

test('configure (L1): a legacy config found at an ANCESTOR folder is updated in place, and a .claude junction above cwd still refuses', { skip: SKIP_DIR }, () => {
  const a = sandbox();
  const b = sandbox();
  try {
    const sub = path.join(a.proj, 'sub');
    fs.mkdirSync(sub);
    fs.writeFileSync(path.join(a.proj, '.coalboard.json'), JSON.stringify({ updateCheckDays: 30 }));
    const r = runAt(['--language', 'en'], a, sub);
    assert.strictEqual(r.status, 0, r.stderr);
    assert.strictEqual(JSON.parse(fs.readFileSync(path.join(a.proj, '.coalboard.json'), 'utf8')).language, 'en', 'written in place at the ancestor');
    assert.ok(!fs.existsSync(path.join(sub, '.claude')), 'nothing is made at cwd');

    const outside = path.join(b.home, 'outside');
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, '.coalboard.json'), JSON.stringify({ updateCheckDays: 30 }));
    fs.symlinkSync(outside, path.join(b.proj, '.claude'), 'junction');
    fs.mkdirSync(path.join(b.proj, 'sub'));
    const r2 = runAt(['--language', 'en'], b, path.join(b.proj, 'sub'));
    refusal(r2);
    assert.strictEqual(JSON.parse(fs.readFileSync(path.join(outside, '.coalboard.json'), 'utf8')).language, undefined, 'the file behind the link is unchanged');
  } finally { clean(a); clean(b); }
});

test('configure (H1): the .bak name is judged only when a backup will be made, so a link there does not block a write over a VALID config', { skip: SKIP_DIR }, () => {
  const sb = sandbox();
  try {
    const outside = path.join(sb.home, 'outside');
    fs.mkdirSync(outside);
    fs.mkdirSync(path.dirname(PROJECT_TARGET(sb.proj)), { recursive: true });
    fs.writeFileSync(PROJECT_TARGET(sb.proj), JSON.stringify({ updateCheckDays: 30 }));
    fs.symlinkSync(outside, PROJECT_TARGET(sb.proj) + '.bak', 'junction');
    const r = run(['--language', 'en'], sb);
    assert.strictEqual(r.status, 0, r.stderr);
    assert.strictEqual(JSON.parse(fs.readFileSync(PROJECT_TARGET(sb.proj), 'utf8')).language, 'en');
    assert.deepStrictEqual(fs.readdirSync(outside), []);
  } finally { clean(sb); }
});

// ---- 17c (T-16f-1): the config write is temp-then-rename in the target's own folder (node/runtime.md section 5). COALBOARD_TEST_STEP is the script's test seam.
const runStep = (args, sb, step) => spawnSync(process.execPath, [CLI, ...args], { cwd: sb.proj, encoding: 'utf8', env: { ...process.env, HOME: sb.home, USERPROFILE: sb.home, COALBOARD_TEST_STEP: step }, timeout: 20000 });
const tmpsBeside = (file) => fs.readdirSync(path.dirname(file)).filter((n) => n.endsWith('.tmp'));

test('configure (17c): a failure between the temp write and the rename leaves the old config byte-equal, no .tmp beside it, and a non-zero exit', () => {
  const sb = sandbox();
  try {
    const old = JSON.stringify({ updateCheckDays: 30 }) + '\n';
    fs.mkdirSync(path.dirname(PROJECT_TARGET(sb.proj)), { recursive: true });
    fs.writeFileSync(PROJECT_TARGET(sb.proj), old);
    const r = runStep(['--language', 'en'], sb, 'fail');
    assert.strictEqual(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stderr, /Failed to write to config file/);
    assert.strictEqual(fs.readFileSync(PROJECT_TARGET(sb.proj), 'utf8'), old, 'the old file is untouched');
    assert.deepStrictEqual(tmpsBeside(PROJECT_TARGET(sb.proj)), [], 'the temp is deleted');
  } finally { clean(sb); }
});

test('configure (17c): a rename that really fails (the target name is a non-empty directory) leaves nothing torn and no .tmp, on every OS', () => {
  const sb = sandbox();
  try {
    const dirAtTarget = PROJECT_TARGET(sb.proj);
    fs.mkdirSync(dirAtTarget, { recursive: true });
    fs.writeFileSync(path.join(dirAtTarget, 'keep.txt'), 'keep');
    const r = run(['--language', 'en'], sb);
    assert.strictEqual(r.status, 1, r.stdout + r.stderr);
    assert.strictEqual(fs.readFileSync(path.join(dirAtTarget, 'keep.txt'), 'utf8'), 'keep');
    assert.deepStrictEqual(tmpsBeside(dirAtTarget), [], 'the temp is deleted');
  } finally { clean(sb); }
});

test('configure (17c): a file symlink planted at the target name AFTER the guards is replaced by the rename, never written through (POSIX leg; needs a file symlink)', { skip: SKIP_FILE }, () => {
  const sb = sandbox();
  try {
    const victim = path.join(sb.home, 'victim.txt');
    fs.writeFileSync(victim, 'keep');
    const r = runStep(['--language', 'en'], sb, 'plant:' + victim);
    assert.strictEqual(r.status, 0, r.stdout + r.stderr);
    assert.strictEqual(fs.readFileSync(victim, 'utf8'), 'keep', 'the victim is not written through');
    assert.ok(!fs.lstatSync(PROJECT_TARGET(sb.proj)).isSymbolicLink(), 'the target is a regular file again');
    assert.strictEqual(JSON.parse(fs.readFileSync(PROJECT_TARGET(sb.proj), 'utf8')).language, 'en');
    assert.deepStrictEqual(tmpsBeside(PROJECT_TARGET(sb.proj)), []);
  } finally { clean(sb); }
});

test('configure (17c): the happy path writes the same bytes as before and leaves no .tmp', () => {
  const sb = sandbox();
  try {
    const r = run(['--language', 'en'], sb);
    assert.strictEqual(r.status, 0, r.stderr);
    assert.strictEqual(fs.readFileSync(PROJECT_TARGET(sb.proj), 'utf8'), JSON.stringify({ language: 'en' }, null, 2) + '\n');
    assert.deepStrictEqual(tmpsBeside(PROJECT_TARGET(sb.proj)), []);
  } finally { clean(sb); }
});

test('configure (17c): a HARD link at the target (no privilege needed, every OS) is replaced by the rename, never written through', () => {
  const sb = sandbox();
  try {
    const victim = path.join(sb.home, 'victim.json');
    const before = JSON.stringify({ updateCheckDays: 30 }) + '\n';
    fs.writeFileSync(victim, before);
    fs.mkdirSync(path.dirname(PROJECT_TARGET(sb.proj)), { recursive: true });
    fs.linkSync(victim, PROJECT_TARGET(sb.proj));
    const r = run(['--language', 'en'], sb);
    assert.strictEqual(r.status, 0, r.stdout + r.stderr);
    assert.strictEqual(fs.readFileSync(victim, 'utf8'), before, 'the other name of the file is untouched');
    assert.strictEqual(JSON.parse(fs.readFileSync(PROJECT_TARGET(sb.proj), 'utf8')).language, 'en');
    assert.strictEqual(JSON.parse(fs.readFileSync(PROJECT_TARGET(sb.proj), 'utf8')).updateCheckDays, 30, 'the existing keys were read and kept');
  } finally { clean(sb); }
});
