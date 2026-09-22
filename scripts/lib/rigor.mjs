// CoalBoard rigor preset -> a partial-config bundle. Phoenix-pure, deterministic.
// The preset sets DEFAULTS for the board knobs; an explicit .coalboard.json key ALWAYS
// overrides the preset (preset = convenience, never a lock — COALBOARD_BLUEPRINT.md Part A
// §11, "Config — the selling point"; that file is GITIGNORED and repo-local, unreachable
// from a clone or CI — cited here for the human maintainer reading source, not as a ship
// claim a user can follow). "nasa" is the strictest PRESET NAME (trust-nothing,
// human-signs-off), NOT a 10^-9 reliability claim.

export const RIGOR_PRESETS = {
  // active: does the board engage on a critical task at all
  // observerOnMaxStakes: summon the out-of-frame sub4 even on CONSENSUS (not just on deadlock)
  // allDomainGates: run every domain verify gate (vs the default subset)
  // adversaryLens: spawn the falsification lens (find-the-counterexample)
  // tier2Verify: property/fuzz/differential/metamorphic/mutation ground-truth gates
  // contestedRound: one surgical contested-point cross-exam on deadlock before sub4
  // diversifyModels: spread lenses across model generations when lensTiers unset
  relaxed:  { active: false, qaStrictness: 'off',      applyConsent: false, observerOnMaxStakes: false, allDomainGates: false, adversaryLens: false, tier2Verify: false, contestedRound: false, diversifyModels: false },
  standard: { active: true,  qaStrictness: 'standard', applyConsent: true,  observerOnMaxStakes: false, allDomainGates: false, adversaryLens: false, tier2Verify: false, contestedRound: false, diversifyModels: false },
  high:     { active: true,  qaStrictness: 'strict',   applyConsent: true,  observerOnMaxStakes: false, allDomainGates: false, adversaryLens: true,  tier2Verify: true,  contestedRound: true,  diversifyModels: false },
  nasa:     { active: true,  qaStrictness: 'strict',   applyConsent: true,  observerOnMaxStakes: true,  allDomainGates: true,  adversaryLens: true,  tier2Verify: true,  contestedRound: true,  diversifyModels: true },
};

export function rigorPreset(name) {
  const key = String(name == null ? 'standard' : name).toLowerCase();
  // Object.hasOwn, not a plain RIGOR_PRESETS[key] lookup: a plain lookup walks the prototype
  // chain, so rigor:"constructor" (a hand-edited .coalboard.json) resolves to the inherited
  // Object constructor -- truthy, so the || fallback below never runs. applyRigor then spreads
  // that function, which yields {}, silently dropping every rigor-controlled key including
  // applyConsent -- the CB-4 fail-safe two lines below checks applyConsent === false and never
  // sees it, because it is undefined, not false. CodeRabbit PR 19 comment 4045387931.
  return Object.hasOwn(RIGOR_PRESETS, key) ? RIGOR_PRESETS[key] : RIGOR_PRESETS.standard;
}

// Resolve the rigor-controlled knobs: start from the preset, then let an explicit
// config key win (preset = default, explicit override). Keys NOT controlled by rigor
// (consensusThreshold, maxRounds, …) come straight from the merged config elsewhere.
// `active` + `allDomainGates` are preset-SEMANTIC — the agent applies them via the SKILL
// contract, so they are intentionally NOT config keys and NOT in RIGOR_CONTROLLED
// (active ≈ coalboardMode, allDomainGates ≈ qaStrictness:strict — a key would just duplicate those).
const RIGOR_CONTROLLED = ['qaStrictness', 'applyConsent', 'observerOnMaxStakes', 'adversaryLens', 'tier2Verify', 'contestedRound', 'diversifyModels'];

export function applyRigor(cfg = {}) {
  const eff = { ...rigorPreset(cfg.rigor) };
  for (const k of RIGOR_CONTROLLED) {
    if (cfg[k] !== undefined) eff[k] = cfg[k]; // explicit key overrides the preset
  }
  // FAIL-SAFE: gateless auto-apply (coalboardMode:auto + applyConsent:false — explicit OR
  // inherited from rigor:relaxed) removes BOTH human gates. verify.mjs REJECTS it loudly; at
  // runtime we never silently honor it — force the apply-gate back ON. The human gate is the
  // load-bearing safety node (DESIGN); it is never config-able to off under auto. (CB-4)
  const mode = typeof cfg.coalboardMode === 'string' ? cfg.coalboardMode.toLowerCase() : 'ask';
  if (mode === 'auto' && eff.applyConsent === false) eff.applyConsent = true;
  return eff;
}
