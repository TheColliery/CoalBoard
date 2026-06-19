// CoalBoard secret-scrubber — redact credential patterns before ANY log / consent
// display / post-mortem (DESIGN §8 gap: the debate history + diff may carry secrets).
// Phoenix-pure, deterministic. Conservative: over-redact rather than leak.
// NOT a vault — a defense-in-depth filter on outbound text; it never guarantees a
// secret is caught, so the staging sandbox + read-only workers remain the real boundary.

const PATTERNS = [
  // PEM private keys (whole block)
  [/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/gi, '[REDACTED:private-key]'],
  // JWTs (three base64url segments; '=' allowed so base64-PADDED segments still match)
  [/\beyJ[A-Za-z0-9_=-]{8,}\.[A-Za-z0-9_=-]{8,}\.[A-Za-z0-9_=-]{8,}/g, '[REDACTED:jwt]'],
  // Authorization-header form: a scheme followed by a SPACE then the credential
  // (the `key=value` pattern below only catches `:`/`=` separators).
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{12,}/gi, '$1 [REDACTED]'],
  // Provider-prefixed API keys: sk-/pk-/rk-… , ghp_/gho_… , xoxb-…
  [/\b(?:sk|pk|rk)-[A-Za-z0-9_-]{16,}\b/g, '[REDACTED:api-key]'],
  [/\bgh[opsur]_[A-Za-z0-9]{20,}\b/g, '[REDACTED:gh-token]'],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, '[REDACTED:slack-token]'],
  // AWS access key id
  [/\bAKIA[0-9A-Z]{16}\b/g, '[REDACTED:aws-key]'],
  // Stripe / underscore-prefixed keys (the `sk-` pattern above only catches the hyphen form)
  [/\b(?:sk|pk|rk)_(?:live|test)_[0-9A-Za-z]{10,}\b/g, '[REDACTED:stripe-key]'],
  // Google API key (open-ended {35,} so an over-length run is fully redacted, never leaving a leaked tail)
  [/\bAIza[0-9A-Za-z_-]{35,}/g, '[REDACTED:google-key]'],
  // GitHub fine-grained PAT
  [/\bgithub_pat_[0-9A-Za-z_]{40,}\b/g, '[REDACTED:gh-pat]'],
  // HuggingFace, Replicate, Google OAuth client-secret prefixes
  [/\bhf_[A-Za-z0-9]{20,}\b/g, '[REDACTED:hf-token]'],
  [/\br8_[A-Za-z0-9]{20,}\b/g, '[REDACTED:replicate-token]'],
  [/\bGOCSPX-[A-Za-z0-9_-]{20,}/g, '[REDACTED:google-oauth-secret]'],
  // npm / GitLab / SendGrid / Square tokens; Azure storage AccountKey. Use {N,} (open-ended, like
  // EVERY pattern above) — an exact {N} + trailing \b fails the boundary on an over-length run and
  // would leak the WHOLE token; {N,} redacts it. AccountKey CAPTURES the key so its original casing
  // is preserved (a hardcoded replacement re-cased a lowercase `accountkey=`).
  [/\bnpm_[A-Za-z0-9]{36,}\b/g, '[REDACTED:npm-token]'],
  [/\bglpat-[A-Za-z0-9_-]{20,}\b/g, '[REDACTED:gitlab-token]'],
  [/\bSG\.[A-Za-z0-9_-]{22,}\.[A-Za-z0-9_-]{43,}\b/g, '[REDACTED:sendgrid-key]'],
  [/\bsq0atp-[A-Za-z0-9_-]{22,}\b/g, '[REDACTED:square-token]'],
  [/\b(AccountKey=)[^;\s]+/gi, '$1[REDACTED]'],
  // A credential in a URL userinfo — redact the password. `[^\s/]+` (greedy, allows '@')
  // backtracks to the LAST '@' before the path, so a password containing a literal '@'
  // (e.g. pass@word) is fully redacted, not partially.
  [/(:\/\/[^\s:/@]+:)[^\s/]+(@)/g, '$1[REDACTED]$2'],
  // key=value / key: value for a sensitive name — keep the name, drop the value. Fixes
  // over a naive \bsecret\b: (1) a lookbehind + an underscore/hyphen-delimited prefix/suffix
  // so a keyword EMBEDDED in a compound name matches (AWS_SECRET_ACCESS_KEY=, DB_PASSWORD=);
  // (2) the separator tolerates a JSON closing-quote on the key (`"password": "v"`) — a quote
  // between the name and the `:`/`=` used to defeat the whole match (JSON is the dominant
  // diff/config format); (3) the value branch takes a QUOTED multi-word value ("my secret pw")
  // OR an unquoted value to END-OF-LINE, so a multi-word passphrase (PASSWORD=correct horse …)
  // is fully redacted, not leaked after word 1. The {0,8} reps + the [^\n] class stay linear
  // (no catastrophic backtracking). The value branch carries an OPTIONAL auth-scheme prefix
  // (Bearer/Basic/…) so the WHOLE credential is redacted, not just the scheme word.
  [/(?<![A-Za-z0-9])((?:[A-Za-z][A-Za-z0-9]*[_-]){0,8}(?:authorization|bearer|client[_-]?secret|api[_-]?secret|api[_-]?key|access[_-]?key|access[_-]?token|refresh[_-]?token|oauth[_-]?token|id[_-]?token|token|secret|password|passwd|pwd|credentials?)(?:[_-][A-Za-z0-9]+){0,8})(\s*["']?\s*[:=]\s*)(?:(?:bearer|basic|digest|token)\s+)?(?:"[^"]*"|'[^']*'|[^\n"']+)/gi, '$1$2[REDACTED]'],
];

// Redact credential-shaped substrings in `text`. Returns a scrubbed copy.
export function scrub(text) {
  let s = String(text == null ? '' : text);
  for (const [re, rep] of PATTERNS) s = s.replace(re, rep);
  return s;
}

// True if scrubbing would change the text (i.e. a secret-shaped token was present) —
// useful to flag "output carried a credential pattern" without echoing it.
export function hasSecret(text) {
  return scrub(text) !== String(text == null ? '' : text);
}
