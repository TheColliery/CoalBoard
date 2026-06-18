// CoalBoard secret-scrubber — redact credential patterns before ANY log / consent
// display / post-mortem (DESIGN §8 gap: the debate history + diff may carry secrets).
// Phoenix-pure, deterministic. Conservative: over-redact rather than leak.
// NOT a vault — a defense-in-depth filter on outbound text; it never guarantees a
// secret is caught, so the staging sandbox + read-only workers remain the real boundary.

const PATTERNS = [
  // PEM private keys (whole block)
  [/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g, '[REDACTED:private-key]'],
  // JWTs (three base64url segments)
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '[REDACTED:jwt]'],
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
  // Google API key
  [/\bAIza[0-9A-Za-z_-]{35}/g, '[REDACTED:google-key]'],
  // GitHub fine-grained PAT
  [/\bgithub_pat_[0-9A-Za-z_]{40,}\b/g, '[REDACTED:gh-pat]'],
  // A credential in a URL userinfo (DB connection string / basic-auth-in-URL) — redact the password
  [/(:\/\/[^\s:/@]+:)[^\s@/]+(@)/g, '$1[REDACTED]$2'],
  // key=value / key: value for sensitive names (keep the name, drop the value)
  [/\b(bearer|authorization|api[_-]?key|access[_-]?token|secret|client[_-]?secret|password|passwd|pwd)\b(\s*[:=]\s*)(["']?)[^\s"']+\3/gi, '$1$2[REDACTED]'],
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
