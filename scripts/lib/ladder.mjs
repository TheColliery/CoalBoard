// CoalBoard lens-tier LADDER + alias rank. Phoenix-pure: pure functions, no I/O, no
// network, no LLM. Deterministic. Zero-dep.
//
// CB has no ranking of its own beyond the CC alias FLOOR it knows DIRECTLY
// (haiku < sonnet < opus < fable). If CoalTipple is installed the board MAY inherit
// its richer ranking.json (a BONUS), but this floor is the standalone default
// (no-external-assumption: CB stands alone). This file is the canonical, tested spec of
// the tier resolution SKILL.md Step 1 states in prose (structure-not-prose: a CB invariant
// that MUST hold gets a receipt-checkable position).
//
// The ladder assigns a model tier to each of the 4 lens SEATS per rigor preset — a MIXED
// per-seat assignment that replaces the old one-tier-per-rigor default. Our config decision,
// self-contained, justified two ways: (1) RIGOR-SCALING — a stronger rigor seats stronger
// models, monotonic; (2) TIER-MIX — a board of one repeated model has ZERO model-decorrelation,
// so each rigor uses 2 tiers (a tier-MIX is the only actuatable model-decorrelation on Claude
// Code — different models share fewer blind spots); a LIGHT gain, secondary to the structural
// (prompt) diversity, NOT a full spread (high/nasa stay opus-heavy by design). No external
// benchmark or model-comparison is cited or needed.

import { rigorPreset } from './rigor.mjs';

// The alias FLOOR, weakest -> strongest. Index = capability rank. fable is the explicit TOP
// rung (was UNKNOWN->strong before; now first-class). Mirrors CoalTipple's derived
// FAMILY_RANK shape so the two skills rank the same families identically.
export const ALIAS_FLOOR = ['haiku', 'sonnet', 'opus', 'fable'];

// family token -> capability rank, DERIVED from the floor so it never drifts as the floor
// grows (add a rung to ALIAS_FLOOR and the rank follows). { haiku:0, sonnet:1, opus:2, fable:3 }.
export const FAMILY_RANK = Object.fromEntries(ALIAS_FLOOR.map((m, i) => [m, i]));

// The 4 lens seats the ladder tiers, split by ROLE in the assignment:
//   REASONING seats (truth, then adversary) — take the range CEIL, and fable FIRST (fable is a
//     reasoning-grade rung), in fable-PRIORITY order (truth before adversary).
//   SUPPORT seats (data, feeling) — take the range FLOOR always. data is empirical/fetch-bound, so
//     it NEVER resolves to fable at any rigor (structural: the range floor is never the fable rung).
// judge = MAIN (not a seat). The sub4/observer tiebreaker is NOT one of these seats — it is resolved
// by observerTier() below and IS always non-fable (final-arbiter robustness: it breaks
// security-sensitive deadlocks, exactly what Fable's safeguard reroutes). The adversary seat, by
// contrast, is now fable-ELIGIBLE (a domain-general logical-falsification lens, not a security seat).
export const SEAT_ROLES = ['data', 'truth', 'feeling', 'adversary'];
const REASON_SEATS = ['truth', 'adversary']; // ceil / fable-first, in fable-priority order
const SUPPORT_SEATS = ['data', 'feeling'];    // range floor always (never fable)

// The default epistemic lens set (adversary is additive via adversaryLens, never here).
const DEFAULT_LENSES = ['data', 'truth', 'feeling'];

// The RANK/RANGE ladder — the CODE stores RANKS (indices into ALIAS_FLOOR), never model-name
// literals, so a renamed/retired model cannot break it (mirrors CoalTipple's derived FAMILY_RANK).
// Each rigor = a 2-tier RANGE [lo..hi] (a sliding window UP the floor) + how many REASONING seats
// may seat fable when the ceil rung is fable. A LIGHT model-decorrelation over the old
// one-tier-per-rigor default (4 IDENTICAL models = zero decorrelation); secondary to the structural
// (prompt) diversity, high/nasa opus-heavy BY DESIGN. Locked invariants (asserted by the tests):
// fable count 0/0/1/2 · fable only on REASONING seats (truth at high; truth+adversary at nasa) ·
// data (a support seat) NEVER fable · monotonic per seat.
export const RIGOR_RANGE = {
  relaxed:  { lo: 0, hi: 1, fable: 0 }, // haiku .. sonnet
  standard: { lo: 1, hi: 2, fable: 0 }, // sonnet .. opus
  high:     { lo: 2, hi: 3, fable: 1 }, // opus .. fable — 1 reasoning seat fable (truth)
  nasa:     { lo: 2, hi: 3, fable: 2 }, // opus .. fable — 2 reasoning seats fable (truth + adversary)
};

// Resolve one rigor RANGE to its per-seat model map, DERIVED from the alias floor at call-time.
// Support seats = the range floor; reasoning seats take the ceil, fable-first up to `fable`, the
// rest falling to the range floor (the best non-fable rung in a 2-tier range whose ceil is fable).
function seatsForRange({ lo, hi, fable }) {
  const floor = ALIAS_FLOOR[lo];
  const ceil = ALIAS_FLOOR[hi];
  const ceilFable = ceil === 'fable';
  const seats = {};
  for (const role of SUPPORT_SEATS) seats[role] = floor;   // support = range floor (never fable)
  let budget = ceilFable ? fable : 0;                       // fable is seatable only when the ceil IS fable
  for (const role of REASON_SEATS) {                        // truth first, then adversary
    if (budget > 0) { seats[role] = 'fable'; budget -= 1; }
    else seats[role] = ceilFable ? floor : ceil;           // over budget → best non-fable in the range (floor)
  }
  return seats;
}

// The factory per-seat ladder, DERIVED from RIGOR_RANGE (resolved to today's floor names). The
// resolver starts from this as the STANDALONE default; a merged-config key overrides a seat.
export const RIGOR_SEATS = Object.fromEntries(
  Object.keys(RIGOR_RANGE).map((r) => [r, seatsForRange(RIGOR_RANGE[r])]),
);

const norm = (s) => String(s == null ? '' : s).trim().toLowerCase();

// A tier can be a plain model string OR a priority chain whose HEAD is the desired model.
// The seat runs fable iff the head is a fable-family model. SUBSTRING match (mirrors CoalTipple's
// isFableModel): catches the alias `fable` AND a pinned concrete id (`claude-fable-5`), so a
// real-money fable spawn is never missed. Fail-safe — it can only OVER-detect (ask needlessly), never under.
function tierHead(tier) { return norm(Array.isArray(tier) ? tier[0] : tier); }
export function isFable(tier) { return tierHead(tier).includes('fable'); }

// The strongest NON-fable alias in the floor — the fallback when fable consent is declined AND the
// sub4/observer non-fable floor. DERIVED from the rank (never hardcoded 'opus').
export function highestNonFable() {
  return [...ALIAS_FLOOR].reverse().find((m) => m !== 'fable');
}

// Strip fable from a tier (a string OR a priority chain) at ANY position. Used by observerTier
// (the sub4/observer tiebreaker, ALWAYS non-fable — final-arbiter robustness) AND by the fablePlan
// `no`/`never` consent fallback (every seat, when the user declines the real-money fable spend). A
// string fable -> highest non-fable; a chain -> fable entries removed (an all-fable chain ->
// [highest non-fable]). isFable (head-only) stays the ASK detector for the lens seats; stripFable
// removes fable even where it hides in a chain FALLBACK (a `['opus','fable']` the head-only check missed).
export function stripFable(tier) {
  if (Array.isArray(tier)) {
    const kept = tier.filter((m) => !norm(m).includes('fable'));
    return kept.length ? kept : [highestNonFable()];
  }
  return isFable(tier) ? highestNonFable() : tier;
}

// Resolve the 4 seat tiers for a rigor, applying the 2-level cascade the caller already merged
// into `cfg` (global < project, project wins). Precedence per seat, top wins:
//   1. lensTiers[role]           — the existing per-role pin (data/truth/feeling; adversary is
//                                   not a lensTiers role, so a pin never sets it)
//   2. rigorLensTiers[rigor]     — the config ladder: a per-seat OBJECT overlays per seat; a
//                                   string/chain sets EVERY seat (the pre-fable backward-compat form)
//   3. RIGOR_SEATS[rigor][role]  — the code default ladder
// The adversary seat is fable-ELIGIBLE (factory nasa seats it fable) — a domain-general
// falsification lens, NOT a security seat, so it is NOT stripped here. On security-CODE content a
// fable adversary's exploit-shaped output may trip Fable's safeguard → the EXISTING empty-return
// re-route (SKILL.md Step 1) falls that spawn to the highest non-fable rung, no code here. The
// ONLY hard-stripped seat is the sub4/observer tiebreaker (observerTier() — final-arbiter robustness).
export function resolveSeatTiers(cfg = {}, rigor = 'standard') {
  const r = norm(rigor);
  const seats = { ...(RIGOR_SEATS[r] || RIGOR_SEATS.standard) };
  const rlt = cfg && cfg.rigorLensTiers ? cfg.rigorLensTiers[r] : undefined;
  if (rlt !== undefined) {
    if (rlt && typeof rlt === 'object' && !Array.isArray(rlt)) {
      for (const role of SEAT_ROLES) if (rlt[role] !== undefined) seats[role] = rlt[role]; // per-seat overlay
    } else {
      for (const role of SEAT_ROLES) seats[role] = rlt; // string/chain -> every seat (backward compat)
    }
  }
  const perRole = (cfg && cfg.lensTiers) || {};
  for (const role of SEAT_ROLES) if (perRole[role] !== undefined) seats[role] = perRole[role];
  return seats; // adversary NOT stripped — it is fable-eligible (only observerTier() strips)
}

// The sub4/observer tiebreaker tier — a lensTiers.observer pin if set, else the highest non-fable
// rung; ALWAYS fable-stripped (final-arbiter robustness — a fable safeguard-block on a security
// deadlock would leave NO tiebreaker; the adversary, by contrast, is now fable-eligible). Resolved
// HERE so the non-fable guarantee is ENFORCED in code, not merely documented.
export function observerTier(cfg = {}) {
  const pin = cfg && cfg.lensTiers ? cfg.lensTiers.observer : undefined;
  return stripFable(pin !== undefined ? pin : highestNonFable());
}

// The ACTIVE epistemic lenses for this config (the configured `lenses`, else the default 3).
// A bogus/empty list falls back to the default (never "no lenses").
function activeLenses(cfg = {}) {
  const v = Array.isArray(cfg && cfg.lenses)
    ? cfg.lenses.map(norm).filter((x) => DEFAULT_LENSES.includes(x))
    : [];
  return v.length ? v : DEFAULT_LENSES;
}

// Is the falsification (adversary) lens active? Controlled by `adversaryLens` (an explicit key
// overrides, else the rigor preset — on under high/nasa), NOT by `lenses` (which only selects the
// 3 epistemic lenses). The adversary is now fable-ELIGIBLE, so it must be COUNTED as a fable seat
// when active — the old ladder stripped it, so it never could be.
function adversaryActive(cfg = {}, rigor = 'standard') {
  return cfg && cfg.adversaryLens !== undefined ? !!cfg.adversaryLens : !!rigorPreset(rigor).adversaryLens;
}

// The seats that will actually be SPAWNED: the active epistemic lenses (data/truth/feeling per
// `lenses`) + adversary when the falsification lens is active.
function activeSeats(cfg = {}, rigor = 'standard') {
  const lenses = activeLenses(cfg);
  return adversaryActive(cfg, rigor) ? [...lenses, 'adversary'] : lenses;
}

// The ACTIVE seats that RESOLVE to fable — the real-money seats the consent gate counts. By the
// factory ladder: relaxed [] · standard [] · high ['truth'] · nasa ['truth','adversary'].
export function fableSeats(cfg = {}, rigor = 'standard') {
  const seats = resolveSeatTiers(cfg, rigor);
  return activeSeats(cfg, rigor).filter((role) => isFable(seats[role]));
}
export function fableCount(cfg = {}, rigor = 'standard') {
  return fableSeats(cfg, rigor).length;
}

// The run plan for the fable consent gate. `fableConsent` (config): ask (default) | always | never.
//   decision 'seat'     -> spawn the resolved seats as-is (no fable involved, OR consent 'always')
//   decision 'ask'      -> fire the consent box BEFORE spawning the fable seats (fable seated AND
//                          consent 'ask'); on the box: once/always -> seats, no -> fallbackSeats
//   decision 'fallback' -> consent 'never' -> spawn fallbackSeats (every fable -> highest non-fable)
// fallbackSeats = seats with every fable tier stripped to the highest non-fable rung (at ANY
// chain position — the "no" path is truly fable-free). Note the ask gates ANY fable seating (a
// manual lensTiers/rigorLensTiers pin that seats fable outside high/nasa still asks — real-money
// spend is always consent-gated); the FACTORY ladder only seats fable at high/nasa, so by default
// the ask fires only there.
export function fablePlan(cfg = {}, rigor = 'standard') {
  const seats = resolveSeatTiers(cfg, rigor);
  const fseats = fableSeats(cfg, rigor);
  const consent = norm(cfg && cfg.fableConsent) || 'ask';
  const fallbackSeats = {};
  for (const role of SEAT_ROLES) fallbackSeats[role] = stripFable(seats[role]);
  let decision;
  if (fseats.length === 0) decision = 'seat';       // no fable -> nothing to gate
  else if (consent === 'always') decision = 'seat';
  else if (consent === 'never') decision = 'fallback';
  else decision = 'ask';                            // 'ask' (default) -> gate before the fable seats
  return { seats, fableSeats: fseats, fableCount: fseats.length, consent, decision, fallbackSeats };
}

// The MAIN sentinel — a seat degraded to "run on main's OWN model" (§2 robustness). main's model
// is the one model GUARANTEED present (it is already running), and the judge always runs on it. It
// is NOT a floor alias — it signals the orchestrator to spawn that seat on the parent model.
export const MAIN = 'main';

// Apply the §2 degrade rules to a resolved seat map, given the run's platform/availability context:
//   - `canPickModel` false (a platform with NO per-sub model-pick) -> EVERY seat = main (the ladder
//     cannot actuate; all lenses run the parent model — decorrelation then rides the PROMPTS only).
//   - else a seat whose HEAD model is not in `availableModels` (a model unavailable/access-gated
//     THIS run) -> that seat = main (an unavailable ladder tier degrades to the guaranteed-present
//     model, never a dead spawn). `availableModels` unset = trust the ladder (availability is
//     DISCOVERED at spawn; the SKILL empty-return re-route handles a spawn-time surprise).
// Distinct from the fable safeguard-BLOCK re-route (a content refusal on an AVAILABLE model ->
// highest non-fable, stripFable): this is true UNAVAILABILITY / no-pick-capability -> main. The
// judge is main already (not a seat here — SKILL.md Step 1 leaves it on the user's own main model).
export function degradeSeats(seats, { canPickModel = true, availableModels = null } = {}) {
  const avail = availableModels == null
    ? null
    : (availableModels instanceof Set ? availableModels : new Set(availableModels.map(norm)));
  const out = {};
  for (const role of SEAT_ROLES) {
    const unavailable = avail !== null && !avail.has(tierHead(seats[role]));
    out[role] = (!canPickModel || unavailable) ? MAIN : seats[role];
  }
  return out;
}
