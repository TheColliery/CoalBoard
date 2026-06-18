// Single source of truth for every .coalboard.json key.
// verify.mjs validates the factory config against it; configure.mjs builds its CLI
// flags, parsing, and help text from it — a key added here is automatically validated,
// settable, and documented, so the scripts can never drift apart.
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
  { key: 'triggerConfidence', type: 'int', min: 0, max: 100, flags: ['-c'], help: 'AND-gate Layer-2 semantic-classifier threshold 0-100 (default: 90)' },
  { key: 'triggerGradeFloor', type: 'int', min: 1, max: 5, flags: ['-g'], help: 'Board considered at >= this grade, or any sensitive task (reuses the CT grade rubric; default: 4)' },
  { key: 'excludePaths', type: 'strArr', lower: true, flags: ['-x', '--exclude'], help: 'Dirs the AND-gate skips so it never false-triggers on vendored code (default: node_modules, .git, dist, vendor, build)' },
  // — the board —
  { key: 'lenses', type: 'strArr', lower: true, flags: ['--lenses'], help: 'Active epistemic lenses (default: data, truth, feeling)' },
  { key: 'consensusThreshold', type: 'int', min: 0, max: 100, flags: ['-t'], help: 'Below this worker-agreement % = deadlock -> summon the out-of-frame sub4 (default: 80)' },
  { key: 'observerOnMaxStakes', type: 'bool', flags: ['-o'], help: 'Summon sub4 even on consensus when rigor=nasa — same-model agreement is weak evidence (default: true)' },
  { key: 'maxRounds', type: 'int', min: 1, max: 5, flags: ['-r'], help: '1 = single-turn (max independence); >1 = multi-round cross-examination (less independence). Default 1' },
  { key: 'debateTimeoutSeconds', type: 'int', min: 5, max: 600, flags: ['-d'], help: 'Per-worker/round debate soft cap in seconds (default: 60)' },
  { key: 'subagentTimeoutSeconds', type: 'int', min: 5, max: 3600, flags: ['-s'], help: 'Hard stall-reap: a silent worker past this is treated as failed (default: 150)' },
  { key: 'maxConcurrentSubagents', type: 'int', min: 1, max: 16, flags: ['--concurrency'], help: 'Concurrent worker cap — they share one rate limit (board needs 3-4; default: 4)' },
  { key: 'lensTiers', type: 'obj', noFlag: true, validate: validateLensTiers, help: 'Optional per-role tier/model pin { data | truth | feeling | observer | judge: "model" | ["priority","chain"] }; overrides the inherit-CT default' },
  // — verify / apply —
  { key: 'qaStrictness', type: 'enum', values: ['strict', 'standard', 'off'], flags: ['-q'], help: 'Verify rigor: strict | standard (default) | off' },
  { key: 'verifyGates', type: 'obj', noFlag: true, validate: validateVerifyGates, help: 'Per-domain gate list { code | math | text | research: ["compile","test",...] }; overrides the defaults' },
  { key: 'sastCommand', type: 'str', flags: ['--sast'], help: 'OPTIONAL external SAST command; empty (default) = a model security-review instead (no hard dependency)' },
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
    case 'strArr':
      return Array.isArray(v) && v.every((x) => typeof x === 'string')
        ? null
        : 'must be an array of strings';
    case 'obj':
      if (!(v && typeof v === 'object' && !Array.isArray(v))) return 'must be an object';
      return spec.validate ? spec.validate(v) : null;
    default:
      return `has an unknown spec type '${spec.type}'`;
  }
}

// A per-role pin is a model string OR a non-empty priority chain of model strings.
function validateLensTiers(pins) {
  const roles = ['data', 'truth', 'feeling', 'observer', 'judge'];
  for (const role of Object.keys(pins)) {
    if (!roles.includes(role)) return `lensTiers: unknown role '${role}' (use ${roles.join('/')})`;
    const val = pins[role];
    const okString = typeof val === 'string';
    const okChain = Array.isArray(val) && val.length > 0 && val.every((m) => typeof m === 'string');
    if (!okString && !okChain) return `lensTiers.${role} must be a model string or a non-empty array of strings`;
  }
  return null;
}

// A per-domain gate list maps a domain to an array of gate-name strings.
function validateVerifyGates(gates) {
  const domains = ['code', 'math', 'text', 'research'];
  for (const domain of Object.keys(gates)) {
    if (!domains.includes(domain)) return `verifyGates: unknown domain '${domain}' (use ${domains.join('/')})`;
    const list = gates[domain];
    if (!Array.isArray(list) || !list.every((g) => typeof g === 'string')) return `verifyGates.${domain} must be an array of gate-name strings`;
  }
  return null;
}
