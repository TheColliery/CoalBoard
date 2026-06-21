// Single source of truth for every .coalboard.json key.
// verify.mjs validates the factory config (platform-configs/.coalboard.json) against it —
// a key added here is automatically validated and documented, so they cannot drift apart.
// The `flags`/`noFlag` fields feed a configure.mjs CLI (a planned CoalMine/CoalTipple parity
// follow-up — NOT yet shipped; today the JSONC factory config is hand-edited).
// (Mirrors CoalMine/CoalTipple config-schema.mjs for series parity.)
//
// Spec fields:
//   key       canonical .coalboard.json key
//   type      'bool' | 'int' | 'enum' | 'str' | 'strArr' | 'obj'
//   values    allowed values for 'enum' (compared case-insensitively)
//   min/max   inclusive bounds for 'int'
//   lower     lowercase each 'strArr' item on write
//   flags     extra CLI aliases besides --<key>
//   noFlag    validated + documented but not CLI-settable (nested objects)
//   validate  optional deep validator for 'obj' (returns an error fragment or null)
//   help      one-line description for --help

export const CONFIG_SCHEMA = [
  // — activation / trigger —
  { key: 'coalboardMode', type: 'enum', values: ['ask', 'auto', 'off'], flags: ['-m'], help: 'On a critical task: ask (default — per-instance consent) | auto (activate without asking) | off (never)' },
  { key: 'criticalPaths', type: 'strArr', lower: true, flags: ['--paths'], help: 'AND-gate Layer-1 path fragments (default: auth, payment, migration, security, crypto)' },
  { key: 'criticalImports', type: 'strArr', lower: true, flags: ['--imports'], help: 'AND-gate Layer-1 import names (default: crypto, bcrypt, jsonwebtoken, child_process)' },
  { key: 'criticalKeywords', type: 'strArr', lower: true, flags: ['--keywords'], help: 'EXTRA Layer-1 keywords ADDED to the built-in seed (additive, never a replacement) — domain terms the seed misses, e.g. "surgical", "trajectory" (default: none added)' },
  { key: 'triggerConfidence', type: 'int', min: 0, max: 100, flags: ['-c'], help: 'AND-gate Layer-2 semantic-classifier threshold 0-100 (default: 90)' },
  { key: 'triggerGradeFloor', type: 'int', min: 1, max: 5, flags: ['-g'], help: 'Board considered at >= this grade, or any sensitive task (reuses the CT grade rubric; default: 4)' },
  { key: 'excludePaths', type: 'strArr', lower: true, flags: ['-x', '--exclude'], help: 'Dirs/files the board SCAN + audit SKIP (and the OPTIONAL PreToolUse backstop). The dev-contamination floor (CLAUDE.md, MEMORY.md, AGENTS.md, .claude, .agents) is ALWAYS excluded ON TOP of this — config ADDS to the floor, never weakens it (a lens must never read the dev governance). Default: CLAUDE.md, MEMORY.md, AGENTS.md, .claude, .agents, node_modules, .git, dist, vendor, build, .coalboard' },
  // — the board —
  { key: 'lenses', type: 'strArr', lower: true, values: ['data', 'truth', 'feeling'], flags: ['--lenses'], help: 'Active epistemic lenses — each must be one of: data, truth, feeling (adversary is additive via adversaryLens, NOT selectable here). Default: data, truth, feeling' },
  { key: 'consensusThreshold', type: 'int', min: 0, max: 100, flags: ['-t'], help: 'Below this worker-agreement % = deadlock -> summon the out-of-frame sub4 (default: 80)' },
  { key: 'observerOnMaxStakes', type: 'bool', flags: ['-o'], help: 'Summon the out-of-frame sub4 even on CONSENSUS (not just on deadlock). The rigor preset sets it (on under nasa, off under standard/high); set it here to force. Same-model agreement is weak evidence' },
  { key: 'maxRounds', type: 'int', min: 1, max: 5, flags: ['-r'], help: '1 = single-turn (max independence); >1 = multi-round cross-examination (less independence). Default 1' },
  { key: 'debateTimeoutSeconds', type: 'int', min: 5, max: 600, flags: ['-d'], help: 'Per-worker/round debate soft cap in seconds (default: 60)' },
  { key: 'subagentTimeoutSeconds', type: 'int', min: 5, max: 3600, flags: ['-s'], help: 'Hard stall-reap: a silent worker past this is treated as failed (default: 150)' },
  { key: 'maxConcurrentSubagents', type: 'int', min: 1, max: 16, flags: ['--concurrency'], help: 'Concurrent worker cap — they share one rate limit (board needs 3-4; default: 4)' },
  { key: 'lensTiers', type: 'obj', noFlag: true, validate: validateLensTiers, help: 'Optional per-role tier/model pin { data | truth | feeling | observer | judge: "model" | ["priority","chain"] }; overrides BOTH rigorLensTiers and the inherit-CT default' },
  { key: 'rigorLensTiers', type: 'obj', noFlag: true, validate: validateRigorLensTiers, help: 'Deterministic rigor->lens-tier map { relaxed | standard | high | nasa : "haiku"|"sonnet"|"opus"|model | ["priority","chain"] } — the LENS model scales with rigor; the agent READS this verbatim (never interprets) so the assignment is identical every run. The judge is always the top tier; the adversary always the rigor tier (never undetermined). lensTiers (per-role) overrides this. Default: relaxed/standard->haiku, high->sonnet, nasa->opus' },
  // — sharpness levers (the rigor preset sets these; an explicit key overrides) —
  { key: 'adversaryLens', type: 'bool', flags: ['--adversary'], help: 'Spawn the red-team falsification lens — "find the ONE input that breaks it; could-not-break-it is your only failure" (sharper recall than the show-me skeptic). Adds a worker; rigor sets it (on under high/nasa). Default off' },
  { key: 'contestedRound', type: 'bool', flags: ['--contested'], help: 'On deadlock, run ONE surgical cross-exam on the CONTESTED point only (feed the counter-claim, not full answers) before sub4 — cross-examination without global anchoring. rigor sets it (on under high/nasa). Default off' },
  { key: 'diversifyModels', type: 'bool', flags: ['--diversify'], help: 'INERT on alias-only platforms (Claude Code): the spawn tool takes only aliases (haiku/sonnet/opus) — it CANNOT pin a model GENERATION, so "spread across generations" is a no-op here (kept degrade-safe for a platform that can pin generations). On CC the only actuatable model-decorrelation is a tier-MIX (3 different models, partial, at a lens-strength cost); the REAL decorrelation is the diverse lens prompts + adversary + sub4, never the model. rigor sets it (nasa). Default off' },
  // — verify / apply —
  { key: 'qaStrictness', type: 'enum', values: ['strict', 'standard', 'off'], flags: ['-q'], help: 'Verify rigor: strict | standard (default) | off' },
  { key: 'verifyGates', type: 'obj', noFlag: true, validate: validateVerifyGates, help: 'Per-domain gate list { code | math | text | research: ["compile","test",...] }; overrides the defaults' },
  { key: 'sastCommand', type: 'str', flags: ['--sast'], help: 'OPTIONAL external SAST command; empty (default) = a model security-review instead (no hard dependency)' },
  { key: 'tier2Verify', type: 'bool', flags: ['--tier2'], help: 'Ground-truth verification beyond example tests: property-based + fuzz (timeboxed) + differential (vs sub4 blind impl) + metamorphic (no-oracle domains) + mutation (test quality) — non-model ground-truth beats correlated agreement. rigor sets it (on under high/nasa). Default off' },
  { key: 'fuzzTimeboxSeconds', type: 'int', min: 5, max: 3600, flags: ['--fuzz-timebox'], help: 'Hard per-run cap so tier2Verify stays bounded-cost (default: 60)' },
  { key: 'formalCommand', type: 'str', flags: ['--formal'], help: 'OPTIONAL external formal-methods command (TLA+/Alloy/SPARK) for the most critical checkable properties; empty (default) = skip (no hard dependency — present-use/absent-degrade)' },
  { key: 'applyConsent', type: 'bool', flags: ['-a'], help: 'Require the 2nd consent gate (the staged diff) before writing to live files (default: true)' },
  { key: 'stagingDir', type: 'str', flags: ['--staging'], help: 'Staging sandbox path, relative to the project (default: .coalboard/proposed/)' },
  // — strictness preset (bundles the above; individual keys override) —
  { key: 'rigor', type: 'enum', values: ['nasa', 'high', 'standard', 'relaxed'], flags: ['-R'], help: 'Strictness preset: relaxed | standard (default) | high | nasa. A preset that sets defaults for the keys above — "nasa" = maximum-paranoia (trust nothing, human signs off), NOT a 10^-9 / 0.01-defects-per-KLOC reliability claim' },
  // — self-update (series-standard, kind-1) —
  { key: 'updateMode', type: 'enum', values: ['ask', 'auto', 'remind', 'off'], flags: ['-u', '--update-mode'], help: 'Self-update behavior at session start (ask, auto, remind, off; default: ask). Orthogonal to the board — its own off-switch' },
  { key: 'updateCheckDays', type: 'int', min: 1, max: 365, flags: ['-p', '--update-days'], help: 'Days between self-update checks/reminders (range 1-365, default: 14)' },
  // — shared —
  { key: 'language', type: 'enum', values: ['auto', 'th', 'en', 'ja', 'zh', 'es'], flags: ['-l'], help: 'Language override for the consent box, post-mortem, and final synthesis (auto, th, en, ja, zh, es)' },
];

// Validate an already-parsed JSON value against a spec.
// Returns an error message fragment ("must be ...") or null when valid.
export function validateValue(spec, v) {
  switch (spec.type) {
    case 'bool':
      return typeof v === 'boolean' ? null : 'must be a boolean';
    case 'int':
      if (typeof v !== 'number' || !Number.isFinite(v)) return 'must be a finite number';
      if (!Number.isInteger(v)) return 'must be an integer';
      if (spec.min != null && v < spec.min) return `must be >= ${spec.min}`;
      if (spec.max != null && v > spec.max) return `must be <= ${spec.max}`;
      return null;
    case 'enum':
      return typeof v === 'string' && spec.values.includes(v.toLowerCase())
        ? null
        : `must be one of: ${spec.values.join(', ')}`;
    case 'str':
      return typeof v === 'string' ? null : 'must be a string';
    case 'strArr': {
      if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) return 'must be an array of strings';
      if (spec.values) {
        if (v.length === 0) return `must list at least one of: ${spec.values.join(', ')} (an empty list = no board)`;
        const allowed = spec.values.map((s) => s.toLowerCase());
        const bad = v.find((x) => !allowed.includes(x.toLowerCase()));
        if (bad != null) return `contains '${bad}' — each item must be one of: ${spec.values.join(', ')}`;
      }
      return null;
    }
    case 'obj':
      if (!(v && typeof v === 'object' && !Array.isArray(v))) return 'must be an object';
      return spec.validate ? spec.validate(v) : null;
    default:
      return `has an unknown spec type '${spec.type}'`;
  }
}

// Cross-key validation — a combination that is individually-valid but JOINTLY dangerous.
// validateValue checks one key in isolation; this catches the unsafe PAIR. Returns an
// error fragment or null. (SKILL.md "No gateless auto-apply" is the prose form of this —
// here it is mechanically guarded so the safety does not rest on the model recalling a line.)
//   coalboardMode:auto + applyConsent:false = gateless auto-apply: the board convenes
//   WITHOUT asking AND writes to live files WITHOUT the staged-diff sign-off = BOTH human
//   gates removed. The human gate is the load-bearing safety node (DESIGN) — never gateless.
// `applyConsent` may arrive explicitly OR inherited from a preset (rigor:relaxed sets it
// false) — so the check is on the EFFECTIVE value the caller passes, not just an explicit key.
export function validateConfig(cfg = {}) {
  if (!cfg || typeof cfg !== 'object') return null;
  const mode = typeof cfg.coalboardMode === 'string' ? cfg.coalboardMode.toLowerCase() : 'ask';
  if (mode === 'auto' && cfg.applyConsent === false) {
    return 'coalboardMode:auto with applyConsent:false = gateless auto-apply (both human gates removed) — set applyConsent:true, or use coalboardMode:ask';
  }
  return null;
}

// A per-role pin is a model string OR a non-empty priority chain of model strings.
function validateLensTiers(pins) {
  const roles = ['data', 'truth', 'feeling', 'observer', 'judge'];
  for (const role of Object.keys(pins)) {
    if (!roles.includes(role)) return `lensTiers: unknown role '${role}' (use ${roles.join('/')})`;
    const val = pins[role];
    const okString = typeof val === 'string' && val.trim().length > 0;
    const okChain = Array.isArray(val) && val.length > 0 && val.every((m) => typeof m === 'string' && m.trim().length > 0);
    if (!okString && !okChain) return `lensTiers.${role} must be a non-empty model string or a non-empty array of non-empty strings`;
  }
  return null;
}

// A rigor->tier map: each rigor name -> a model string OR a non-empty priority chain.
function validateRigorLensTiers(map) {
  const rigors = ['relaxed', 'standard', 'high', 'nasa'];
  for (const r of Object.keys(map)) {
    if (!rigors.includes(r)) return `rigorLensTiers: unknown rigor '${r}' (use ${rigors.join('/')})`;
    const val = map[r];
    const okString = typeof val === 'string' && val.trim().length > 0;
    const okChain = Array.isArray(val) && val.length > 0 && val.every((m) => typeof m === 'string' && m.trim().length > 0);
    if (!okString && !okChain) return `rigorLensTiers.${r} must be a non-empty model string or a non-empty array of non-empty strings`;
  }
  return null;
}

// A per-domain gate list maps a domain to an array of gate-name strings.
function validateVerifyGates(gates) {
  const domains = ['code', 'math', 'text', 'research'];
  for (const domain of Object.keys(gates)) {
    if (!domains.includes(domain)) return `verifyGates: unknown domain '${domain}' (use ${domains.join('/')})`;
    const list = gates[domain];
    if (!Array.isArray(list) || list.length === 0 || !list.every((g) => typeof g === 'string' && g.trim().length > 0)) return `verifyGates.${domain} must be a non-empty array of non-empty gate-name strings`;
  }
  return null;
}
