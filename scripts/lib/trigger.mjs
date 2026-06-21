// CoalBoard AND-gate — the STATIC (Layer-1) detection seed.
// Phoenix-pure: pure functions, no I/O, no network, no LLM. Deterministic.
//
// The full AND-gate is two layers (DESIGN §6):
//   Layer 1 (here) — a deterministic static signal: a critical PATH fragment, a
//     critical IMPORT name, or a critical KEYWORD appears in the text under review.
//   Layer 2 — the SEMANTIC check ("is the INTENT severe?"). A fail-silent hook cannot
//     run a classifier (no network/LLM), so Layer 2 is the MODEL's job: the conductor
//     injects this Layer-1 signal and tells the model to apply the gate by MEANING.
//
// A non-English prompt matches few/no English fragments — so a miss here is NOT an
// all-clear; the conductor always tells the model to grade by intent regardless.

export const DEFAULT_CRITICAL_PATHS = ['auth', 'payment', 'migration', 'security', 'crypto'];
export const DEFAULT_CRITICAL_IMPORTS = ['crypto', 'bcrypt', 'jsonwebtoken', 'child_process'];
// A small built-in seed (English). The model does the real, language-agnostic read.
export const DEFAULT_CRITICAL_KEYWORDS = [
  'auth', 'authentication', 'authorization', 'crypto', 'encrypt', 'decrypt', 'password',
  'secret', 'token', 'session', 'migration', 'ledger', 'payment', 'timing-attack', 'timing attack',
  'constant-time', 'race condition', 'mutex', 'deadlock', 'rocket', 'trajectory', 'proof',
];
const DEFAULT_EXCLUDE = ['node_modules', '.git', 'dist', 'vendor', 'build'];

// Lowercase contains-match for any fragment in `list`. Returns the matched fragments.
function matched(text, list) {
  const t = String(text || '').toLowerCase();
  return list.filter((f) => f && t.includes(String(f).toLowerCase()));
}

// Non-Latin script present? TRUE iff a non-Latin LETTER appears. Strip Latin-script chars +
// every NON-letter (digits, punctuation, symbols, EMOJI, C0 controls, whitespace) — what
// remains is a non-Latin letter (Thai/Arabic/CJK/Cyrillic/…). Unicode property escapes (u flag).
// The English keyword/path/import seed under-fires on a non-Latin prompt, so its mere PRESENCE
// is a signal to grade by intent (the model does Layer-2). Mirrored verbatim in the conductor hook.
export function hasNonLatin(s) {
  return String(s == null ? '' : s).replace(/[\p{Script=Latin}\P{L}]/gu, '').length > 0;
}

// Resolve a config list: use it ONLY if it has >=1 non-empty entry, else the default.
// An empty array or an all-'' array means "fall back to defaults", never "match nothing" —
// so `excludePaths: []` cannot silently disable exclusions and `criticalPaths: ['']`
// cannot silently disable the gate.
function cfgList(v, dflt) {
  if (!Array.isArray(v)) return dflt;
  const clean = v.filter(Boolean);
  return clean.length ? clean : dflt;
}

// Critical keywords are ADDITIVE: a user's `criticalKeywords` EXTEND the built-in seed
// (a config cannot silently DROP a default keyword by overriding the list).
function keywordList(v) {
  const extra = Array.isArray(v) ? v.filter(Boolean) : [];
  return extra.length ? [...DEFAULT_CRITICAL_KEYWORDS, ...extra] : DEFAULT_CRITICAL_KEYWORDS;
}

// Is this file path inside an excluded dir? (so the gate never fires on vendored code)
export function isExcluded(filePath, excludePaths = DEFAULT_EXCLUDE) {
  const list = cfgList(excludePaths, DEFAULT_EXCLUDE);
  const p = String(filePath || '').replace(/\\/g, '/').toLowerCase();
  return list.some((d) => d && (p.includes(`/${String(d).toLowerCase()}/`) || p.startsWith(`${String(d).toLowerCase()}/`)));
}

// Detect the Layer-1 static signal in a piece of text (a prompt, or a file's content).
// `cfg` may carry criticalPaths / criticalImports / criticalKeywords / excludePaths / language overrides.
// `opts.scriptSignal` (PROMPTS only) adds a non-Latin-script presence signal: a pure-Thai/CJK
// critical prompt matches NO English seed, so without this it would produce zero reasons and the
// conductor would emit nothing — a Thai-speaking user's critical prompt would slip the gate.
// Off by default so a file-content scan (which may legitimately hold non-Latin comments) never
// false-fires; the prompt path opts in. (CB-7)
// Returns { hit: boolean, reasons: string[] } — reasons are short, human-readable.
export function detectStatic(text, cfg = {}, opts = {}) {
  const paths = cfgList(cfg.criticalPaths, DEFAULT_CRITICAL_PATHS);
  const imports = cfgList(cfg.criticalImports, DEFAULT_CRITICAL_IMPORTS);
  const keywords = keywordList(cfg.criticalKeywords);
  const reasons = [];
  const pHit = matched(text, paths);
  const iHit = matched(text, imports);
  const kHit = matched(text, keywords);
  if (pHit.length) reasons.push(`critical path: ${pHit.join(', ')}`);
  if (iHit.length) reasons.push(`critical import: ${iHit.join(', ')}`);
  if (kHit.length) reasons.push(`critical keyword: ${[...new Set(kHit)].slice(0, 6).join(', ')}`);
  if (opts.scriptSignal && hasNonLatin(text)) reasons.push('non-Latin script: grade by intent');
  return { hit: reasons.length > 0, reasons };
}

// For a file-write backstop (a PreToolUse-style check): the Physical Matcher wants a
// critical PATH *and* a critical IMPORT together (a higher-confidence Layer-1 hit than
// a prompt keyword). Returns { hit, reasons } where hit requires BOTH path and import.
export function detectFileWrite(filePath, content, cfg = {}) {
  if (isExcluded(filePath, cfg.excludePaths)) {
    return { hit: false, reasons: [] };
  }
  const paths = cfgList(cfg.criticalPaths, DEFAULT_CRITICAL_PATHS);
  const imports = cfgList(cfg.criticalImports, DEFAULT_CRITICAL_IMPORTS);
  const pHit = matched(filePath, paths);
  const iHit = matched(content, imports);
  if (pHit.length && iHit.length) {
    return { hit: true, reasons: [`critical path (${pHit.join(', ')}) + import (${iHit.join(', ')})`] };
  }
  return { hit: false, reasons: [] };
}
