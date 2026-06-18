// CoalBoard rigor preset -> a partial-config bundle. Phoenix-pure, deterministic.
// The preset sets DEFAULTS for the board knobs; an explicit .coalboard.json key ALWAYS
// overrides the preset (preset = convenience, never a lock — DESIGN §11). "nasa" is the
// strictest PRESET NAME (trust-nothing, human-signs-off), NOT a 10^-9 reliability claim.

export const RIGOR_PRESETS = {
  // active: does the board engage on a critical task at all
  // sub4Trigger: when the out-of-frame solver is summoned
  // allDomainGates: run every domain verify gate (vs the default subset)
  relaxed:  { active: false, qaStrictness: 'off',      applyConsent: false, observerOnMaxStakes: false, sub4Trigger: 'off',      allDomainGates: false },
  standard: { active: true,  qaStrictness: 'standard', applyConsent: true,  observerOnMaxStakes: false, sub4Trigger: 'deadlock', allDomainGates: false },
  high:     { active: true,  qaStrictness: 'strict',   applyConsent: true,  observerOnMaxStakes: false, sub4Trigger: 'deadlock', allDomainGates: false },
  nasa:     { active: true,  qaStrictness: 'strict',   applyConsent: true,  observerOnMaxStakes: true,  sub4Trigger: 'always',   allDomainGates: true },
};

export function rigorPreset(name) {
  const key = String(name == null ? 'standard' : name).toLowerCase();
  return RIGOR_PRESETS[key] || RIGOR_PRESETS.standard;
}

// Resolve the rigor-controlled knobs: start from the preset, then let an explicit
// config key win (preset = default, explicit override). Keys NOT controlled by rigor
// (consensusThreshold, maxRounds, …) come straight from the merged config elsewhere.
const RIGOR_CONTROLLED = ['qaStrictness', 'applyConsent', 'observerOnMaxStakes'];

export function applyRigor(cfg = {}) {
  const eff = { ...rigorPreset(cfg.rigor) };
  for (const k of RIGOR_CONTROLLED) {
    if (cfg[k] !== undefined) eff[k] = cfg[k]; // explicit key overrides the preset
  }
  return eff;
}
