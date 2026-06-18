// Zero-dep unit tests for the CoalBoard core libs (scripts-quality §2): the AND-gate
// detection, the rigor preset, the secret scrubber, and the config validators.
// Run: node --test lib.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectStatic, detectFileWrite, isExcluded } from './trigger.mjs';
import { rigorPreset, applyRigor } from './rigor.mjs';
import { scrub, hasSecret } from './secrets.mjs';
import { CONFIG_SCHEMA, validateValue } from './config-schema.mjs';

test('trigger.detectStatic — hits a critical signal, ignores benign', () => {
  assert.equal(detectStatic('fix the auth crypto timing bug').hit, true);
  assert.equal(detectStatic('list the readme files').hit, false);
  // reasons name the matched kinds
  const r = detectStatic('migrate the payment ledger');
  assert.equal(r.hit, true);
  assert.ok(r.reasons.length > 0 && r.reasons.every((x) => typeof x === 'string'), 'fires with string reasons');
});

test('trigger.detectFileWrite — needs BOTH a critical path and a critical import', () => {
  assert.equal(detectFileWrite('src/auth/jwt.ts', 'import jsonwebtoken from "x"').hit, true);
  assert.equal(detectFileWrite('src/auth/jwt.ts', 'const x = 1').hit, false, 'path alone is not enough');
  assert.equal(detectFileWrite('src/util/x.ts', 'import crypto from "x"').hit, false, 'import alone is not enough');
  assert.equal(detectFileWrite('node_modules/auth/x.js', 'import crypto').hit, false, 'excluded dir never fires');
});

test('trigger.isExcluded — vendored/build dirs are excluded', () => {
  assert.equal(isExcluded('node_modules/foo/bar.js'), true);
  assert.equal(isExcluded('src/auth/jwt.ts'), false);
});

test('rigor — presets + explicit override + unknown falls to standard', () => {
  assert.equal(rigorPreset('nasa').observerOnMaxStakes, true);
  assert.equal(rigorPreset('relaxed').active, false);
  assert.equal(rigorPreset('bogus').qaStrictness, rigorPreset('standard').qaStrictness, 'unknown -> standard');
  // an explicit key overrides the preset
  assert.equal(applyRigor({ rigor: 'nasa', applyConsent: false }).applyConsent, false);
  assert.equal(applyRigor({ rigor: 'nasa' }).applyConsent, true);
});

test('secrets.scrub — redacts keys, JWTs, Bearer (space + colon), key=value; leaves prose', () => {
  assert.match(scrub('api_key: sk-abcdefghij0123456789xyz'), /\[REDACTED\]/);
  assert.match(scrub('Authorization: Bearer abcdefghijklmnop1234'), /\[REDACTED\]/);
  assert.match(scrub('password=hunter2secretvalue'), /password=\[REDACTED\]/);
  assert.equal(hasSecret('Bearer abcdefghijklmnop1234'), true);
  assert.equal(hasSecret('use the Bearer pattern from the readme'), false, 'no benign over-match');
  // gaps the pre-release review found:
  assert.match(scrub('STRIPE_KEY=sk_live_abcdefghij1234567890'), /\[REDACTED/, 'stripe sk_live_');
  assert.match(scrub('DATABASE_URL=postgres://dbuser:s3cretpass@db:5432/app'), /:\[REDACTED\]@/, 'URL userinfo password');
  assert.equal(hasSecret('AIzaSyA0123456789abcdefghijklmnopqrstuv0'), true, 'google AIza key');
});

test('config-schema — validateValue enforces each type/bound; bad input fails loud', () => {
  const byKey = (k) => CONFIG_SCHEMA.find((s) => s.key === k);
  assert.equal(validateValue(byKey('triggerConfidence'), 90), null);
  assert.ok(validateValue(byKey('triggerConfidence'), 200), 'out-of-range int fails');
  assert.ok(validateValue(byKey('triggerConfidence'), 1.5), 'non-integer fails');
  assert.equal(validateValue(byKey('coalboardMode'), 'ask'), null);
  assert.ok(validateValue(byKey('coalboardMode'), 'bogus'), 'bad enum fails');
  assert.equal(validateValue(byKey('criticalPaths'), ['auth', 'crypto']), null);
  assert.ok(validateValue(byKey('criticalPaths'), [1, 2]), 'non-string array fails');
});

test('config-schema — lensTiers + verifyGates validators', () => {
  const lensTiers = CONFIG_SCHEMA.find((s) => s.key === 'lensTiers');
  assert.equal(validateValue(lensTiers, { judge: 'opus', data: ['haiku', 'sonnet'] }), null);
  assert.ok(validateValue(lensTiers, { bogusRole: 'x' }), 'unknown role fails');
  assert.ok(validateValue(lensTiers, { judge: 123 }), 'non-string/array pin fails');
  const verifyGates = CONFIG_SCHEMA.find((s) => s.key === 'verifyGates');
  assert.equal(validateValue(verifyGates, { code: ['compile', 'test'] }), null);
  assert.ok(validateValue(verifyGates, { bogusDomain: ['x'] }), 'unknown domain fails');
});
