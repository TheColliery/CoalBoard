// Hermetic spawn tests for scripts/configure.mjs (CWK-023): the real CLI is
// spawned as a child process against a sandboxed HOME/cwd, never imported --
// same shape as CoalLedger's own configure.test.mjs (the freshest sibling
// precedent), adapted for CoalBoard's own schema (obj/noFlag keys) AND for
// CoalBoard's own root-walk mechanism, which is NOT CL's: CB's
// findProjectCfg has no git/marker-resolved root, it checks all 4 read-order
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
function clean({ home }) { fs.rmSync(home, { recursive: true, force: true }); }

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
