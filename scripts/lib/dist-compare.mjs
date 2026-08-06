// Shared content-equality helper for verify.mjs's two src-vs-dist parity checks
// (board #59). .gitattributes' `* text=auto eol=lf` normalizes line endings ON
// COMMIT, not on every checkout of an already-checked-out tree — so two
// legitimate checkouts of the SAME git blob can carry different CRLF/LF bytes
// on disk while holding identical content. A plain string/byte compare then
// reads that as stale/orphaned when it is not (false FAIL).
//
// Fix: normalize CRLF-only (`\r\n` -> `\n`) on both sides before comparing. A
// lone bare `\r` (old-Mac-style, unpaired with `\n`) is left untouched by the
// regex, so it still counts as a real difference if it's the actual delta.
//
// Assumption, stated because it matters: every file verify.mjs's two
// dist-parity checks compare is TEXT (.md/.mjs/.js/.json) — this helper is not
// safe to point at a binary file, which would corrupt on the utf8 read alone.
import fs from 'node:fs';

export function normalizeEOL(text) {
  return text.replace(/\r\n/g, '\n');
}

export function textFilesEqual(pathA, pathB) {
  const a = normalizeEOL(fs.readFileSync(pathA, 'utf8'));
  const b = normalizeEOL(fs.readFileSync(pathB, 'utf8'));
  return a === b;
}
