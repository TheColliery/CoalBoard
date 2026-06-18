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
  'secret', 'token', 'session', 'migration', 'ledger', 'payment', 'timing-attack',
  'constant-time', 'race condition', 'mutex', 'deadlock', 'rocket', 'trajectory', 'proof',
];
const DEFAULT_EXCLUDE = ['node_modules', '.git', 'dist', 'vendor', 'build'];

// Lowercase contains-match for any fragment in `list`. Returns the matched fragments.
function matched(text, list) {
  const t = String(text || '').toLowerCase();
  return list.filter((f) => f && t.includes(String(f).toLowerCase()));
}

// Is this file path inside an excluded dir? (so the gate never fires on vendored code)
export function isExcluded(filePath, excludePaths = DEFAULT_EXCLUDE) {
  const p = String(filePath || '').replace(/\\/g, '/').toLowerCase();
  return excludePaths.some((d) => d && (p.includes(`/${String(d).toLowerCase()}/`) || p.startsWith(`${String(d).toLowerCase()}/`)));
}

// Detect the Layer-1 static signal in a piece of text (a prompt, or a file's content).
// `cfg` may carry criticalPaths / criticalImports / excludePaths / language overrides.
// Returns { hit: boolean, reasons: string[] } — reasons are short, human-readable.
export function detectStatic(text, cfg = {}) {
  const paths = Array.isArray(cfg.criticalPaths) ? cfg.criticalPaths : DEFAULT_CRITICAL_PATHS;
  const imports = Array.isArray(cfg.criticalImports) ? cfg.criticalImports : DEFAULT_CRITICAL_IMPORTS;
  const reasons = [];
  const pHit = matched(text, paths);
  const iHit = matched(text, imports);
  const kHit = matched(text, DEFAULT_CRITICAL_KEYWORDS);
  if (pHit.length) reasons.push(`critical path: ${pHit.join(', ')}`);
  if (iHit.length) reasons.push(`critical import: ${iHit.join(', ')}`);
  if (kHit.length) reasons.push(`critical keyword: ${[...new Set(kHit)].slice(0, 6).join(', ')}`);
  return { hit: reasons.length > 0, reasons };
}

// For a file-write backstop (a PreToolUse-style check): the Physical Matcher wants a
// critical PATH *and* a critical IMPORT together (a higher-confidence Layer-1 hit than
// a prompt keyword). Returns { hit, reasons } where hit requires BOTH path and import.
export function detectFileWrite(filePath, content, cfg = {}) {
  if (isExcluded(filePath, Array.isArray(cfg.excludePaths) ? cfg.excludePaths : DEFAULT_EXCLUDE)) {
    return { hit: false, reasons: [] };
  }
  const paths = Array.isArray(cfg.criticalPaths) ? cfg.criticalPaths : DEFAULT_CRITICAL_PATHS;
  const imports = Array.isArray(cfg.criticalImports) ? cfg.criticalImports : DEFAULT_CRITICAL_IMPORTS;
  const pHit = matched(filePath, paths);
  const iHit = matched(content, imports);
  if (pHit.length && iHit.length) {
    return { hit: true, reasons: [`critical path (${pHit.join(', ')}) + import (${iHit.join(', ')})`] };
  }
  return { hit: false, reasons: [] };
}
