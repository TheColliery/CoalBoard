// Zero-dep unit tests for the CoalBoard core libs (scripts-quality §2): the AND-gate
// detection, the rigor preset, the secret scrubber, and the config validators.
// Run: node --test lib.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectStatic, detectFileWrite, isExcluded } from './trigger.mjs';
import { rigorPreset, applyRigor } from './rigor.mjs';
import { scrub, hasSecret } from './secrets.mjs';
import { CONFIG_SCHEMA, validateValue } from './config-schema.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

test('trigger — config-robustness: additive keywords, empty-array guards, timing-attack space', () => {
  // criticalKeywords is ADDITIVE: a custom keyword fires AND the built-in seed still fires
  assert.equal(detectStatic('process the surgical approval', { criticalKeywords: ['surgical'] }).hit, true, 'custom keyword fires');
  assert.equal(detectStatic('fix the auth bug', { criticalKeywords: ['surgical'] }).hit, true, 'default seed still fires alongside a custom list');
  assert.equal(detectStatic('list the readme files', { criticalKeywords: ['surgical'] }).hit, false, 'benign stays benign');
  // excludePaths: [] must NOT disable exclusions (empty -> fall back to defaults)
  assert.equal(detectFileWrite('node_modules/auth/x.js', 'import crypto', { excludePaths: [] }).hit, false, 'empty excludePaths -> defaults, node_modules still excluded');
  // criticalPaths: [''] must NOT disable the gate (empty -> fall back to defaults)
  assert.equal(detectFileWrite('src/auth/jwt.ts', 'import jsonwebtoken from "x"', { criticalPaths: [''] }).hit, true, "empty-string criticalPaths -> defaults, gate still fires");
  // "timing attack" (space form — natural language) now fires
  assert.equal(detectStatic('prevent a timing attack on the login').hit, true, 'space form of timing attack');
});

test('rigor — presets + explicit override + unknown falls to standard', () => {
  assert.equal(rigorPreset('nasa').observerOnMaxStakes, true);
  assert.equal(rigorPreset('relaxed').active, false);
  assert.equal(rigorPreset('bogus').qaStrictness, rigorPreset('standard').qaStrictness, 'unknown -> standard');
  // an explicit key overrides the preset
  assert.equal(applyRigor({ rigor: 'nasa', applyConsent: false }).applyConsent, false);
  assert.equal(applyRigor({ rigor: 'nasa' }).applyConsent, true);
});

test('rigor — sharpness levers are tiered by preset, explicit key overrides', () => {
  // standard = cheap default: no extra workers/compute
  assert.equal(rigorPreset('standard').adversaryLens, false);
  assert.equal(rigorPreset('standard').tier2Verify, false);
  // high turns on the adversary lens, ground-truth verify, and the contested round
  assert.equal(rigorPreset('high').adversaryLens, true);
  assert.equal(rigorPreset('high').tier2Verify, true);
  assert.equal(rigorPreset('high').contestedRound, true);
  assert.equal(rigorPreset('high').diversifyModels, false, 'generation-spread is nasa-only');
  // nasa = everything, including model-generation diversity
  assert.equal(rigorPreset('nasa').diversifyModels, true);
  assert.equal(rigorPreset('nasa').adversaryLens, true);
  // explicit keys win both ways
  assert.equal(applyRigor({ rigor: 'standard', adversaryLens: true }).adversaryLens, true, 'force a lever ON at standard');
  assert.equal(applyRigor({ rigor: 'nasa', tier2Verify: false }).tier2Verify, false, 'force a lever OFF at nasa');
});

test('rigor — the shipped factory config does NOT neuter the preset (copy + rigor:nasa stays nasa) [audit #1]', () => {
  const factoryPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'platform-configs', '.coalboard.json');
  const raw = fs.readFileSync(factoryPath, 'utf8');
  // strip JSONC comments (strings preserved) — same approach as the conductor's parseJsonc
  const factory = JSON.parse(raw.replace(/"(?:\\.|[^"\\])*"|\/\/.*|\/\*[\s\S]*?\*\//g, (m) => (m[0] === '"' ? m : '')));
  const eff = applyRigor({ ...factory, rigor: 'nasa' });
  assert.equal(eff.adversaryLens, true, 'factory + rigor:nasa still enables the adversary lens');
  assert.equal(eff.tier2Verify, true, 'factory + rigor:nasa still enables ground-truth verify');
  assert.equal(eff.observerOnMaxStakes, true, 'factory + rigor:nasa still observer-always');
  assert.equal(eff.diversifyModels, true, 'factory + rigor:nasa still diversifies models');
  assert.equal(eff.contestedRound, true, 'factory + rigor:nasa still runs the contested round');
  assert.equal(eff.qaStrictness, 'strict', 'factory + rigor:nasa still strict verify');
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

test('secrets.scrub — board-audit gaps closed (compound env-var, quoted, token-keys, URL-@, JWT-pad, providers)', () => {
  // CRITICAL: compound underscore env-var names (the \b-boundary miss)
  assert.match(scrub('AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY'), /AWS_SECRET_ACCESS_KEY=\[REDACTED\]/);
  assert.match(scrub('DB_PASSWORD=hunter2'), /DB_PASSWORD=\[REDACTED\]/);
  assert.match(scrub('API_SECRET=abc123def456'), /API_SECRET=\[REDACTED\]/);
  // HIGH: quoted multi-word value (fully redacted, no inner leak)
  assert.match(scrub('password="my secret password"'), /password=\[REDACTED\]/);
  assert.match(scrub("client_secret='multi word value'"), /client_secret=\[REDACTED\]/);
  assert.ok(!/my secret password/.test(scrub('password="my secret password"')), 'quoted value fully redacted');
  // HIGH: standalone token: / refresh_token: / oauth_token:
  assert.match(scrub('token: ya29.a0AfH6SMBxxxxxxabcdef'), /token: \[REDACTED\]/);
  assert.match(scrub('refresh_token: 1//abcdefghijklmno'), /refresh_token: \[REDACTED\]/);
  assert.match(scrub('oauth_token: ya29.xxxxxxabcdef'), /oauth_token: \[REDACTED\]/);
  // HIGH: URL userinfo password containing a literal '@' (no partial leak)
  assert.match(scrub('postgres://u:pass@word@host/db'), /u:\[REDACTED\]@host/);
  assert.ok(!/pass@word/.test(scrub('postgres://u:pass@word@host/db')), 'no partial password leak');
  // MED: JWT with base64 '=' padding
  assert.match(scrub('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0=.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV'), /\[REDACTED:jwt\]/);
  // MED: missing provider prefixes
  assert.match(scrub('hf_abcdefghijklmnopqrstuvwxyz12345678'), /\[REDACTED:hf-token\]/);
  assert.match(scrub('r8_abcdefghijklmnopqrstuvwxyz1234567890'), /\[REDACTED:replicate-token\]/);
  assert.match(scrub('GOCSPX-abcdefghijklmnopqrstuvwxyz12'), /\[REDACTED:google-oauth-secret\]/);
  // no over-redaction of plain prose (no separator+value)
  assert.equal(hasSecret('the access token rotates daily per policy'), false, 'prose untouched');
  // HIGH: Authorization: Bearer/Basic with a SHORT token (under the standalone 12-char floor) — no leak
  assert.ok(!/abc123/.test(scrub('Authorization: Bearer abc123')), 'short bearer token not leaked');
  assert.match(scrub('Authorization: Bearer abc123'), /Authorization: \[REDACTED\]/);
  assert.ok(!/YTpiYzpk/.test(scrub('Authorization: Basic YTpiYzpk')), 'short basic token not leaked');
});

test('secrets.scrub — JSON quoted-key + unquoted multi-word passphrase (audit #2)', () => {
  // JSON "key": "value" — the dominant diff/config format; the closing key-quote used to defeat the separator
  assert.match(scrub('"password": "Pr0d!Master2026"'), /"password": \[REDACTED\]/);
  assert.ok(!/Pr0d!Master2026/.test(scrub('"password": "Pr0d!Master2026"')), 'JSON value fully redacted');
  assert.equal(hasSecret('"password": "Pr0d!Master2026"'), true, 'hasSecret no longer asserts a JSON secret is clean');
  assert.match(scrub('"apiKey": "live_abc123def456ghi789"'), /"apiKey": \[REDACTED\]/);
  // unquoted multi-word passphrase — used to leak after word 1
  assert.match(scrub('ADMIN_PASSWORD = correct horse battery staple'), /ADMIN_PASSWORD = \[REDACTED\]/);
  assert.ok(!/horse battery staple/.test(scrub('ADMIN_PASSWORD = correct horse battery staple')), 'whole passphrase redacted, no word-2+ leak');
  // regression: a keyword with NO separator stays untouched (the ["']? separator addition must not over-match)
  assert.equal(hasSecret('the password rotates per policy'), false, 'prose without a separator untouched');
});

test('secrets.scrub — no catastrophic backtracking (ReDoS guard: returns, does not hang)', () => {
  assert.equal(typeof scrub('A_'.repeat(20000) + '=value'), 'string');
  assert.equal(typeof scrub('-----BEGIN X PRIVATE KEY-----' + 'A'.repeat(50000)), 'string');
  assert.equal(typeof scrub('SECRET'.repeat(5000) + '=x'), 'string');
});

test('secrets.scrub — v1.0.11 added formats (npm/gitlab/sendgrid/square/azure) + google over-length fully redacted', () => {
  // secret-shaped fixtures are ASSEMBLED at runtime (prefix split from body) so the SOURCE carries
  // no contiguous token literal — otherwise GitHub push-protection flags the fixture and blocks the push.
  assert.match(scrub('npm' + '_' + 'a'.repeat(36)), /\[REDACTED:npm-token\]/);
  assert.match(scrub('glpat' + '-' + 'a'.repeat(20)), /\[REDACTED:gitlab-token\]/);
  assert.match(scrub('SG' + '.' + 'a'.repeat(22) + '.' + 'b'.repeat(43)), /\[REDACTED:sendgrid-key\]/);
  assert.match(scrub('sq0atp' + '-' + 'a'.repeat(22)), /\[REDACTED:square-token\]/);
  const azure = 'AccountKey' + '=' + 'b'.repeat(24);
  assert.match(scrub(azure), /AccountKey=\[REDACTED\]/);
  assert.ok(!/bbbbbbbb/.test(scrub(azure)), 'azure account key value not leaked');
  // google-key {35,}: an over-length run is FULLY redacted, no leaked tail (was {35} -> leaked the tail)
  const over = scrub('AIza' + 'A'.repeat(50));
  assert.match(over, /\[REDACTED:google-key\]/);
  assert.ok(!/AAAAA/.test(over), 'over-length google key fully redacted, no tail leak');
});

test('secrets.scrub — M2: empty-value key does NOT eat the next line (DB_HOST survives)', () => {
  // "password=\nDB_HOST=localhost" — the separator must not cross the newline; DB_HOST is NOT a secret
  const result = scrub('password=\nDB_HOST=localhost');
  assert.ok(result.includes('DB_HOST=localhost'), 'DB_HOST line is preserved unchanged');
  assert.ok(!result.includes('password=\n[REDACTED]') || result.includes('DB_HOST=localhost'), 'empty-value redaction never consumes the following line');
  // a non-empty value on the same line is still redacted
  assert.match(scrub('password=hunter2\nDB_HOST=localhost'), /password=\[REDACTED\]/);
  assert.ok(scrub('password=hunter2\nDB_HOST=localhost').includes('DB_HOST=localhost'), 'DB_HOST survives when password has a value');
});

test('secrets.scrub — M3: over-length AWS key (21+ chars) IS redacted; normal 16-char AKIA still redacted', () => {
  // Normal 20-char AKIA (standard format)
  assert.match(scrub('AKIA' + 'A'.repeat(16)), /\[REDACTED:aws-key\]/, '16-char AKIA still redacted');
  // Over-length key (21+ chars) — {16} exact + \b would fail the boundary; {16,} catches it
  const overLength = 'AKIA' + 'IOSFODNN7EXAMPLEX9A';  // 19 chars -> total 23
  assert.match(scrub(overLength), /\[REDACTED:aws-key\]/, 'over-length AKIA key is redacted');
  assert.ok(!/IOSFODNN7EXAMPLEX9A/.test(scrub(overLength)), 'no tail leak from over-length AWS key');
  // The exact over-length example from the bug report
  assert.match(scrub('AKIAIOSFODNN7EXAMPLEX9'), /\[REDACTED:aws-key\]/, '21-char AKIA from bug report is redacted');
});

test('secrets.scrub — v1.0.12: over-length token run fully redacted ({N,}) + AccountKey casing preserved', () => {
  // {N,} not {N}+\b: an over-length token-shaped run is fully redacted, never leaked whole
  const glOver = scrub('glpat' + '-' + 'a'.repeat(40));
  assert.match(glOver, /\[REDACTED:gitlab-token\]/);
  assert.ok(!/aaaaa/.test(glOver), 'over-length gitlab token fully redacted (exact {N} would leak the whole run)');
  // AccountKey replacement preserves the original key casing (no re-case of a lowercase key)
  assert.match(scrub('accountkey' + '=' + 'b'.repeat(24)), /accountkey=\[REDACTED\]/);
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
  // lenses is a value-constrained strArr (audit E): only data/truth/feeling
  assert.equal(validateValue(byKey('lenses'), ['data', 'truth']), null);
  assert.ok(validateValue(byKey('lenses'), ['dat']), "a typo'd lens name fails");
  assert.ok(validateValue(byKey('lenses'), ['data', 'bogus']), 'one bad lens in the list fails');
  assert.ok(validateValue(byKey('lenses'), []), 'empty lenses list fails — a value-constrained strArr must be non-empty (no empty board)');
  assert.equal(validateValue(byKey('criticalPaths'), ['anything', 'goes']), null, 'an unconstrained strArr still accepts any string');
  // sharpness-lever keys validate by type/bound
  assert.equal(validateValue(byKey('adversaryLens'), true), null);
  assert.ok(validateValue(byKey('adversaryLens'), 'yes'), 'non-bool fails');
  assert.equal(validateValue(byKey('tier2Verify'), false), null);
  assert.equal(validateValue(byKey('fuzzTimeboxSeconds'), 60), null);
  assert.ok(validateValue(byKey('fuzzTimeboxSeconds'), 4), 'below-min fuzz timebox fails');
  assert.equal(validateValue(byKey('formalCommand'), ''), null);
  assert.ok(validateValue(byKey('formalCommand'), 5), 'non-string formal command fails');
});

test('config-schema — lensTiers + verifyGates validators', () => {
  const lensTiers = CONFIG_SCHEMA.find((s) => s.key === 'lensTiers');
  assert.equal(validateValue(lensTiers, { judge: 'opus', data: ['haiku', 'sonnet'] }), null);
  assert.ok(validateValue(lensTiers, { bogusRole: 'x' }), 'unknown role fails');
  assert.ok(validateValue(lensTiers, { judge: 123 }), 'non-string/array pin fails');
  const verifyGates = CONFIG_SCHEMA.find((s) => s.key === 'verifyGates');
  assert.equal(validateValue(verifyGates, { code: ['compile', 'test'] }), null);
  assert.ok(validateValue(verifyGates, { bogusDomain: ['x'] }), 'unknown domain fails');
  // empty / empty-string entries are NOT usable — must fail loud, not pass as "valid"
  assert.ok(validateValue(lensTiers, { judge: [''] }), 'empty-string chain entry fails');
  assert.ok(validateValue(lensTiers, { judge: '' }), 'empty-string pin fails');
  assert.ok(validateValue(verifyGates, { code: [] }), 'empty gate list fails');
  assert.ok(validateValue(verifyGates, { code: [''] }), 'empty-string gate fails');
});

test('config-schema — rigorLensTiers validator (deterministic rigor->tier map)', () => {
  const spec = CONFIG_SCHEMA.find((s) => s.key === 'rigorLensTiers');
  assert.ok(spec, 'rigorLensTiers key exists in the schema');
  assert.equal(validateValue(spec, { relaxed: 'haiku', standard: 'haiku', high: 'sonnet', nasa: 'opus' }), null, 'the factory default map is valid');
  assert.equal(validateValue(spec, { nasa: ['opus', 'sonnet'] }), null, 'a priority chain is valid');
  assert.ok(validateValue(spec, { bogusRigor: 'opus' }), 'an unknown rigor name fails');
  assert.ok(validateValue(spec, { nasa: 123 }), 'a non-string/array tier fails');
  assert.ok(validateValue(spec, { nasa: '' }), 'an empty-string tier fails');
  assert.ok(validateValue(spec, { high: [''] }), 'an empty-string chain entry fails');
  // the shipped factory config's rigorLensTiers must itself validate (no drift)
  const factoryPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'platform-configs', '.coalboard.json');
  const factory = JSON.parse(fs.readFileSync(factoryPath, 'utf8').replace(/"(?:\\.|[^"\\])*"|\/\/.*|\/\*[\s\S]*?\*\//g, (m) => (m[0] === '"' ? m : '')));
  assert.equal(validateValue(spec, factory.rigorLensTiers), null, 'the shipped factory rigorLensTiers validates');
});
