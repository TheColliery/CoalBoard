// The NODE_OPTIONS a test child runs under. scripts/test.mjs used to REPLACE the caller's value with the
// heap cap, silently dropping any flag the caller set on purpose (a --require preload, --enable-source-maps,
// a larger heap). This EXTENDS it: the caller's flags stay, the cap is appended, and a heap cap the caller
// already set is never duplicated or lowered (their number wins, it is their box).
export const HEAP_CAP_FLAG = '--max-old-space-size=2048';

// A cap flag as a whole token: `--max-old-space-size=N`, `--max_old_space_size=N`, or the space form. A flag
// that only mentions the name inside another token's value (`--require ./max-old-space-size-helper.cjs`)
// does not start a token with `--`, so it is not matched.
const OWN_CAP = /(^|\s)--max[-_]old[-_]space[-_]size(=|\s|$)/;

export function childNodeOptions(existing) {
  const own = typeof existing === 'string' ? existing.trim() : '';
  if (!own) return HEAP_CAP_FLAG;
  if (OWN_CAP.test(own)) return own;
  return `${own} ${HEAP_CAP_FLAG}`;
}
