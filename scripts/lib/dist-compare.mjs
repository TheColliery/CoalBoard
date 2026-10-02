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
// Assumption, stated because it matters: `textFilesEqual` below is TEXT-only —
// safe for the SHIP-list sync check (every entry there is .md/.mjs/.js/.json
// by construction), NOT safe to point at a binary file (corrupts on the utf8
// read alone). `filesEqual` (board #59 findings-back) is the binary-safe
// variant for the orphan-check, which walks the WHOLE dist tree and must stay
// correct for a future non-text asset (an icon, etc.), not just today's set.
import fs from 'node:fs';

const utf8Decoder = new TextDecoder('utf-8', { fatal: true });

function tryDecodeUtf8(buf) {
  try { return utf8Decoder.decode(buf); } catch { return null; }
}

export function normalizeEOL(text) {
  return text.replace(/\r\n/g, '\n');
}

export function textFilesEqual(pathA, pathB) {
  const a = normalizeEOL(fs.readFileSync(pathA, 'utf8'));
  const b = normalizeEOL(fs.readFileSync(pathB, 'utf8'));
  return a === b;
}

// EOL-tolerant when both sides decode as valid UTF-8 text; falls back to an
// exact byte compare when either side does not (a real binary file, or a text
// file that isn't valid UTF-8) — never masks a genuine binary difference
// behind a lossy decode.
export function filesEqual(pathA, pathB) {
  const bufA = fs.readFileSync(pathA);
  const bufB = fs.readFileSync(pathB);
  const a = tryDecodeUtf8(bufA);
  const b = tryDecodeUtf8(bufB);
  if (a === null || b === null) return Buffer.compare(bufA, bufB) === 0;
  return normalizeEOL(a) === normalizeEOL(b);
}
