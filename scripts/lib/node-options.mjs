// The NODE_OPTIONS a test child runs under. scripts/test.mjs used to REPLACE the caller's value with the
// heap cap, silently dropping any flag the caller set on purpose (a --require preload, --enable-source-maps).
// This EXTENDS it: the caller's flags stay and the cap is appended. The cap itself is "2048 (or lower)"
// (CoalWorks dispatch-transport.md, ninth amendment: a runaway test child once took the box down), so a
// caller's own heap cap at or below 2048 is kept as theirs, and one ABOVE 2048 (or not a positive number)
// is replaced by 2048: a caller cannot lift the limit this runner exists to hold.
export const HEAP_CAP_MB = 2048;
export const HEAP_CAP_FLAG = `--max-old-space-size=${HEAP_CAP_MB}`;

// A cap flag as a whole token: `--max-old-space-size=N`, `--max_old_space_size=N`, or the space form. A flag
// that only mentions the name inside another token's value (`--require ./max-old-space-size-helper.cjs`)
// does not start a token with `--`, so it is not matched.
const OWN_CAP = /(^|\s)--max[-_]old[-_]space[-_]size(?:=|\s+)(\S+)/g;

export function childNodeOptions(existing) {
  const own = typeof existing === 'string' ? existing.trim() : '';
  if (!own) return HEAP_CAP_FLAG;
  let found = false;
  const out = own.replace(OWN_CAP, (whole, lead, value) => {
    found = true;
    const mb = Number(value);
    return Number.isFinite(mb) && mb > 0 && mb <= HEAP_CAP_MB ? whole : `${lead}${HEAP_CAP_FLAG}`;
  });
  return found ? out : `${own} ${HEAP_CAP_FLAG}`;
}
