// Zero-dep unit tests for the CoalBoard per-seat LADDER + fable consent plan
// (scripts-quality §2). Run: node --test ladder.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALIAS_FLOOR, FAMILY_RANK, SEAT_ROLES, RIGOR_RANGE, RIGOR_SEATS, MAIN,
  isFable, stripFable, highestNonFable, observerTier, resolveSeatTiers, fableSeats, fableCount, fablePlan, degradeSeats,
} from './ladder.mjs';
import { validateValue } from './config-schema.mjs';
import { CONFIG_SCHEMA } from './config-schema.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

test('rank — fable derives at the TOP rung (haiku<sonnet<opus<fable), first-class', () => {
  assert.deepEqual(ALIAS_FLOOR, ['haiku', 'sonnet', 'opus', 'fable']);
  assert.deepEqual(FAMILY_RANK, { haiku: 0, sonnet: 1, opus: 2, fable: 3 });
  assert.ok(FAMILY_RANK.fable > FAMILY_RANK.opus, 'fable outranks opus (was UNKNOWN->strong; now explicit top)');
});

test('highestNonFable — DERIVED from the rank, is opus today (never hardcoded)', () => {
  assert.equal(highestNonFable(), 'opus');
});

test('isFable — head of a string or a priority chain', () => {
  assert.equal(isFable('fable'), true);
  assert.equal(isFable('FABLE'), true, 'case-insensitive');
  assert.equal(isFable(['fable', 'opus']), true, 'chain head is fable');
  assert.equal(isFable(['opus', 'fable']), false, 'chain head is opus, not fable');
  assert.equal(isFable('opus'), false);
});

test('ladder — the per-seat factory resolution per rigor (rank/range derived: support=floor, reason=ceil/fable-first)', () => {
  // support seats (data, feeling) = range floor; reasoning seats (truth then adversary) = ceil, fable-first
  assert.deepEqual(resolveSeatTiers({}, 'relaxed'),  { data: 'haiku',  truth: 'sonnet', feeling: 'haiku',  adversary: 'sonnet' });
  assert.deepEqual(resolveSeatTiers({}, 'standard'), { data: 'sonnet', truth: 'opus',   feeling: 'sonnet', adversary: 'opus' });
  assert.deepEqual(resolveSeatTiers({}, 'high'),     { data: 'opus',   truth: 'fable',  feeling: 'opus',   adversary: 'opus' });
  assert.deepEqual(resolveSeatTiers({}, 'nasa'),     { data: 'opus',   truth: 'fable',  feeling: 'opus',   adversary: 'fable' });
  // tallies (sorted) — a 2-tier mix per rigor + fable at the top (the model MULTISET is unchanged from
  // the old ladder; only WHICH seat gets which model moved: fable is now on reasoning seats, not data)
  const tally = (r) => Object.values(resolveSeatTiers({}, r)).sort();
  assert.deepEqual(tally('relaxed'),  ['haiku', 'haiku', 'sonnet', 'sonnet']);  // haiku x2 + sonnet x2
  assert.deepEqual(tally('standard'), ['opus', 'opus', 'sonnet', 'sonnet']);    // sonnet x2 + opus x2
  assert.deepEqual(tally('high'),     ['fable', 'opus', 'opus', 'opus']);       // opus x3 + fable x1
  assert.deepEqual(tally('nasa'),     ['fable', 'fable', 'opus', 'opus']);      // opus x2 + fable x2
  // every rigor uses exactly 2 distinct tiers (a LIGHT mix, NOT a full spread — high/nasa opus-heavy by design)
  const distinct = (r) => new Set(Object.values(resolveSeatTiers({}, r))).size;
  for (const r of ['relaxed', 'standard', 'high', 'nasa']) assert.equal(distinct(r), 2, `${r} uses 2 distinct tiers`);
  // RIGOR_SEATS is DERIVED from RIGOR_RANGE (no hardcoded model-name literals; each range is a 2-tier window)
  for (const r of ['relaxed', 'standard', 'high', 'nasa']) {
    const { lo, hi } = RIGOR_RANGE[r];
    assert.ok(hi === lo + 1, `${r} range is a 2-tier window`);
    assert.equal(resolveSeatTiers({}, r).data, ALIAS_FLOOR[lo], `${r} support seat = range floor`);
  }
  // unknown rigor falls to standard (never throws / never empty)
  assert.deepEqual(resolveSeatTiers({}, 'bogus'), resolveSeatTiers({}, 'standard'));
});

test('ladder — monotonic per seat by rigor (a locked constraint)', () => {
  const rigors = ['relaxed', 'standard', 'high', 'nasa'];
  for (const role of SEAT_ROLES) {
    let prev = -1;
    for (const r of rigors) {
      const rank = FAMILY_RANK[resolveSeatTiers({}, r)[role]];
      assert.ok(rank >= prev, `${role} rank non-decreasing at ${r} (got ${rank}, prev ${prev})`);
      prev = rank;
    }
  }
  // fable count per rigor stays the locked 0/0/1/2
  assert.deepEqual([0, 0, 1, 2], rigors.map((r) => fableCount({}, r)));
});

test('ladder — adversary is fable-ELIGIBLE (nasa only); data is NEVER fable at any rigor', () => {
  // adversary: NOT fable at relaxed/standard/high; IS fable at nasa (the factory reasoning seat)
  assert.equal(isFable(resolveSeatTiers({}, 'relaxed').adversary), false);
  assert.equal(isFable(resolveSeatTiers({}, 'standard').adversary), false);
  assert.equal(isFable(resolveSeatTiers({}, 'high').adversary), false, 'high adversary = opus (only truth is fable at high)');
  assert.equal(isFable(resolveSeatTiers({}, 'nasa').adversary), true, 'nasa adversary IS fable (no longer stripped)');
  // a user override seating fable on the adversary is HONORED (adversary is NOT a security seat now)
  assert.equal(resolveSeatTiers({ rigorLensTiers: { high: { adversary: 'fable' } } }, 'high').adversary, 'fable');
  assert.deepEqual(resolveSeatTiers({ rigorLensTiers: { high: { adversary: ['fable', 'opus'] } } }, 'high').adversary, ['fable', 'opus'], 'a chain is left intact, head fable and all');
  // data (a support seat = range floor) is NEVER fable, at ANY rigor (empirical/fetch-bound)
  for (const r of ['relaxed', 'standard', 'high', 'nasa']) {
    assert.equal(isFable(resolveSeatTiers({}, r).data), false, `${r} data is not fable`);
  }
});

test('stripFable — removes fable from a string or ANY chain position', () => {
  assert.equal(stripFable('fable'), 'opus');
  assert.equal(stripFable('opus'), 'opus', 'non-fable string unchanged');
  assert.deepEqual(stripFable(['fable', 'opus']), ['opus'], 'head fable stripped');
  assert.deepEqual(stripFable(['opus', 'fable']), ['opus'], 'tail fable stripped (the head-only bug)');
  assert.deepEqual(stripFable(['opus', 'sonnet']), ['opus', 'sonnet'], 'non-fable chain unchanged');
  assert.deepEqual(stripFable(['fable']), ['opus'], 'all-fable chain -> [highest non-fable]');
});

test('substring fable-detection — a pinned CONCRETE fable id trips the real-money guard (fail-safe)', () => {
  // A user pinning a concrete fable-family id (claude-fable-5) into a seat MUST still trip the
  // consent gate — an exact match (=== 'fable') would MISS it and silently spawn a real-money worker.
  assert.equal(isFable('claude-fable-5'), true, 'concrete fable id detected (substring, not exact)');
  assert.equal(isFable(['claude-fable-5', 'opus']), true, 'concrete fable id as a chain head');
  assert.equal(isFable('opus'), false, 'a non-fable name is not over-caught');
  // stripFable removes the concrete id (string AND any chain position)
  assert.equal(stripFable('claude-fable-5'), 'opus', 'a concrete fable string -> highest non-fable');
  assert.deepEqual(stripFable(['opus', 'claude-fable-5']), ['opus'], 'the concrete fable id is stripped from a chain');
  // the consent gate FIRES on a pinned concrete id even at standard rigor (no factory fable there)
  assert.equal(fablePlan({ lensTiers: { truth: 'claude-fable-5' } }, 'standard').decision, 'ask',
    'a pinned concrete fable id on a seat -> ask (never a silent seat)');
});

test('observerTier — the sub4/observer tier is resolved AND enforced non-fable', () => {
  assert.equal(observerTier({}), 'opus', 'default = highest non-fable');
  assert.equal(observerTier({ lensTiers: { observer: 'sonnet' } }), 'sonnet', 'a pin is honored');
  assert.equal(observerTier({ lensTiers: { observer: 'fable' } }), 'opus', 'a fable pin is stripped');
  assert.deepEqual(observerTier({ lensTiers: { observer: ['opus', 'fable'] } }), ['opus'], 'a chain fable is stripped at any position');
});

test('ask trigger — fable count fires ONLY at high (1) / nasa (2); relaxed/standard = 0', () => {
  assert.equal(fableCount({}, 'relaxed'), 0);
  assert.equal(fableCount({}, 'standard'), 0);
  assert.equal(fableCount({}, 'high'), 1);
  assert.equal(fableCount({}, 'nasa'), 2);
  assert.deepEqual(fableSeats({}, 'high'), ['truth']);              // high: only truth is fable
  assert.deepEqual(fableSeats({}, 'nasa'), ['truth', 'adversary']); // nasa: truth + adversary
  // adversary is counted via adversaryLens (the rigor preset), NOT via `lenses` — disabling the
  // epistemic lenses does not drop the nasa adversary fable seat
  assert.equal(fableCount({ lenses: ['feeling'] }, 'nasa'), 1, 'feeling(opus) + adversary(fable) -> 1');
  assert.equal(fableCount({ lenses: ['data'] }, 'nasa'), 1, 'data(opus) + adversary(fable) -> 1');
  assert.equal(fableCount({ lenses: ['truth'] }, 'nasa'), 2, 'truth(fable) + adversary(fable) -> 2');
  // forcing the adversary lens OFF drops its fable seat -> nasa count falls to just truth
  assert.equal(fableCount({ adversaryLens: false }, 'nasa'), 1, 'adversary off -> only truth is fable');
  assert.equal(fableCount({ lenses: ['feeling'], adversaryLens: false }, 'nasa'), 0, 'feeling only + no adversary -> 0');
});

test('fablePlan — consent decision: ask (default) fires at high/nasa, seat elsewhere', () => {
  assert.equal(fablePlan({}, 'standard').decision, 'seat', 'no fable -> nothing to gate');
  assert.equal(fablePlan({}, 'high').decision, 'ask', 'default consent ask + fable seated -> ask');
  assert.equal(fablePlan({}, 'nasa').decision, 'ask');
  assert.equal(fablePlan({}, 'high').fableCount, 1);
  assert.equal(fablePlan({}, 'nasa').fableCount, 2);
});

test('fablePlan — always (persisted "always this project") seats without asking', () => {
  const p = fablePlan({ fableConsent: 'always' }, 'nasa');
  assert.equal(p.decision, 'seat');
  assert.equal(isFable(p.seats.truth), true, 'fable still seated under always');
  assert.equal(isFable(p.seats.adversary), true, 'the nasa adversary fable seat stays under always');
  assert.equal(isFable(p.seats.data), false, 'data is opus (never fable) even under always');
});

test('fablePlan — never / the "no" fallback: every fable seat stripped, at ANY chain position', () => {
  const never = fablePlan({ fableConsent: 'never' }, 'nasa');
  assert.equal(never.decision, 'fallback');
  assert.equal(never.fallbackSeats.truth, 'opus', 'the truth fable seat -> highest non-fable');
  assert.equal(never.fallbackSeats.adversary, 'opus', 'the adversary fable seat -> highest non-fable');
  assert.equal(never.fallbackSeats.data, 'opus', 'a non-fable seat (opus) is unchanged');
  assert.equal(never.fallbackSeats.feeling, 'opus');
  assert.ok(!Object.values(never.fallbackSeats).some(isFable), 'no fable head anywhere in the fallback');
  // a tail-fable chain seat is ALSO stripped in the fallback (the isFable head-check would miss it)
  const chainNo = fablePlan({ fableConsent: 'never', rigorLensTiers: { nasa: { truth: ['opus', 'fable'] } } }, 'nasa');
  assert.deepEqual(chainNo.fallbackSeats.truth, ['opus'], 'tail-fable chain stripped in the fallback');
  // the ask's "no" carries the SAME fallbackSeats ready even under the default ask consent
  const ask = fablePlan({}, 'high');
  assert.equal(ask.decision, 'ask');
  assert.equal(ask.fallbackSeats.truth, 'opus', 'the ask carries the "no" fallback for the fable seat (truth)');
});

test('ladder — backward compat: a string rigorLensTiers still sets EVERY seat (pre-fable form)', () => {
  const s = resolveSeatTiers({ rigorLensTiers: { nasa: 'sonnet' } }, 'nasa');
  assert.deepEqual(s, { data: 'sonnet', truth: 'sonnet', feeling: 'sonnet', adversary: 'sonnet' });
  // a chain form too
  const c = resolveSeatTiers({ rigorLensTiers: { high: ['opus', 'sonnet'] } }, 'high');
  assert.deepEqual(c.data, ['opus', 'sonnet']);
  assert.equal(fableCount({ rigorLensTiers: { high: 'opus' } }, 'high'), 0, 'a string override wipes the fable seat -> no ask');
});

test('ladder — a per-seat object override overlays only the named seats; lensTiers pins win', () => {
  // overlay only data, the rest keep the rigor default (standard = sonnet/opus/sonnet/opus)
  const o = resolveSeatTiers({ rigorLensTiers: { standard: { data: 'opus' } } }, 'standard');
  assert.deepEqual(o, { data: 'opus', truth: 'opus', feeling: 'sonnet', adversary: 'opus' });
  // lensTiers per-role pin (the existing key) wins over rigorLensTiers
  const p = resolveSeatTiers({ lensTiers: { data: 'haiku' }, rigorLensTiers: { nasa: { data: 'fable' } } }, 'nasa');
  assert.equal(p.data, 'haiku', 'lensTiers.data pin overrides the rigorLensTiers ladder');
});

test('degradeSeats — §2: unavailable tier -> main; no per-sub model-pick -> ALL main', () => {
  const nasa = resolveSeatTiers({}, 'nasa'); // { data:opus, truth:fable, feeling:opus, adversary:fable }
  // default context (canPickModel true, no availability list) = trust the ladder, unchanged
  assert.deepEqual(degradeSeats(nasa), nasa);
  // a platform with NO per-sub model-pick -> EVERY seat = main (all lenses run the parent model)
  const noPick = degradeSeats(nasa, { canPickModel: false });
  assert.ok(SEAT_ROLES.every((role) => noPick[role] === MAIN), 'every seat is main on a no-model-pick platform');
  // fable UNAVAILABLE this run -> the fable seats (truth, adversary) fall to main; the available opus
  // seats (data, feeling) keep the ladder — an unavailable tier degrades to the guaranteed-present model
  const noFable = degradeSeats(nasa, { availableModels: ['haiku', 'sonnet', 'opus'] });
  assert.equal(noFable.truth, MAIN, 'fable truth seat -> main (fable unavailable)');
  assert.equal(noFable.adversary, MAIN, 'fable adversary seat -> main (fable unavailable)');
  assert.equal(noFable.data, 'opus', 'an available seat keeps its ladder tier');
  assert.equal(noFable.feeling, 'opus');
  // a chain seat degrades on its HEAD's availability (what primarily runs)
  const chain = degradeSeats({ data: ['fable', 'opus'], truth: 'opus', feeling: 'opus', adversary: 'opus' }, { availableModels: ['opus'] });
  assert.equal(chain.data, MAIN, 'a chain whose HEAD (fable) is unavailable -> main');
  assert.equal(chain.truth, 'opus', 'an available head is kept');
  // MAIN is a distinct sentinel, NOT one of the ladder aliases
  assert.ok(!ALIAS_FLOOR.includes(MAIN));
});

test('config-schema — rigorLensTiers accepts the per-seat object form + fableConsent enum', () => {
  const rlt = CONFIG_SCHEMA.find((s) => s.key === 'rigorLensTiers');
  assert.equal(validateValue(rlt, { high: { data: 'fable', adversary: 'opus' } }), null, 'per-seat object is valid');
  assert.equal(validateValue(rlt, { nasa: ['opus', 'sonnet'] }), null, 'chain form still valid (backward compat)');
  assert.equal(validateValue(rlt, { standard: 'sonnet' }), null, 'string form still valid');
  assert.ok(validateValue(rlt, { high: { bogusSeat: 'opus' } }), 'an unknown seat name fails');
  assert.ok(validateValue(rlt, { high: { data: '' } }), 'an empty-string seat tier fails');
  const fc = CONFIG_SCHEMA.find((s) => s.key === 'fableConsent');
  assert.ok(fc, 'fableConsent key exists');
  assert.equal(validateValue(fc, 'ask'), null);
  assert.equal(validateValue(fc, 'always'), null);
  assert.equal(validateValue(fc, 'never'), null);
  assert.ok(validateValue(fc, 'sometimes'), 'a bad enum fails');
});

test('ladder — the shipped factory rigorLensTiers matches RIGOR_SEATS (no drift)', () => {
  const factoryPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'platform-configs', '.coalboard.json');
  const raw = fs.readFileSync(factoryPath, 'utf8');
  const factory = JSON.parse(raw.replace(/"(?:\\.|[^"\\])*"|\/\/.*|\/\*[\s\S]*?\*\//g, (m) => (m[0] === '"' ? m : '')));
  for (const r of ['relaxed', 'standard', 'high', 'nasa']) {
    assert.deepEqual(resolveSeatTiers(factory, r), RIGOR_SEATS[r], `factory ${r} ladder == code default (no drift)`);
  }
  assert.equal(factory.fableConsent, 'ask', 'factory fableConsent ships as ask');
  // the seat roles the code tiers are exactly the 4 the spec names
  assert.deepEqual(SEAT_ROLES, ['data', 'truth', 'feeling', 'adversary']);
});
