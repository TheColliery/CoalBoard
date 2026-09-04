// CWK-075 — POINTER gate, ported from CoalMine's pointer-check.mjs (092fd24). Ship-text
// names a file, and nothing resolves it against the actual tree.
//
// WHY THIS IS NOT CWK-060's GATE. That one resolves KEYS against config-schema.mjs. These
// are POINTERS -- to a file or a directory -- and nothing resolved them. Same family,
// different resolver: the key gate asks "is this name in the schema", this one asks "is the
// thing this name points at REACHABLE FROM A CLONE".
//
// THE CHAIR'S RULING THIS ENFORCES (settled; this module does not re-decide it): a probe
// cited as proof is not a throwaway. Cite the DURABLE artefact -- a commit SHA, a reviewer
// return, a lab record -- and recycle the probe; if the probe file is the only evidence, it
// has stopped being a throwaway, so commit it or restate the claim. A GITIGNORED PATH IS NOT
// A DURABLE CITATION. The gate enforces that distinction. It does NOT ban citations, and the
// shape of that restraint is the whole detection rule below.
//
// ============================================================================
// DETECTION RULE, measured on THIS repo's own surfaces before it was chosen (AGENTS.md, THE
// SOURCE'S VARIABLES ARE NOT OURS -- CoalMine's own numbers describe CoalMine's tree, not
// ours; six rooms reached six different verdicts on CWK-060's filter and this family fares
// no better without its own measurement):
//
//   step                                              occurrences  distinct
//   0  every backticked token in prose                   1647         590
//   1  path-shaped (has `/`, or a file extension)          611         183
//   2  no whitespace                                       586         163
//   3  no `<placeholder>` angle brackets                   577         159
//   4  no glob metacharacters                              555         145
//   5  has a DIRECTORY component                           357          92
//   6  not absolute / `~` / a URL                          298          76
//   7  first segment is not a dot-dir                      240          61
//   8  first segment is OURS (or a gitignored root)          70          29
//
//   Final: 49 distinct (surface, token) candidates, 43 resolve tracked, 6 do NOT --
//   12.2% noise. Re-derive on demand; never quote these numbers forward as a live claim.
//
//   THE 6 NON-RESOLVERS, all in CHANGELOG.md, split three ways -- the split IS the design
//   being validated on our own data, not a single class of bug. Named here by FILENAME only,
//   deliberately never as a full backticked path: a bare filename has no directory component
//   and is excluded at step 5, so this very sentence cannot become a phantom in-scope citation
//   the gate then has to explain away (measured live while building this: an earlier draft
//   named these as full paths and the gate flagged its OWN header, four more findings, on
//   the first RED-FIRST run -- fixed the same way the exemplar's header already does it):
//   - 3 distinct scratchpad filenames, REAL DEFECTS: SKILL-BODY-SIZE-2026-08-16.md and
//     SKILL-VARIANCE-WALK.md (both under scratchpad/longrun/) and cb-inspect.out.json
//     (under scratchpad/ directly). Gitignored, unreachable from any clone -- never durable,
//     not even on the day they were written. Fixed by CWK-075 (repointed at the commit SHA
//     that carried the work; see CHANGELOG.md's own history for which).
//   - coalboard.md (under commands/) -- NOT a defect. That entry documents the file's OWN
//     removal; correct when written, and historyOnly is exactly what covers it (below).
//   - coalmine-scanner.md (under a SIBLING repo's agents/) and the prose "skills, hooks,
//     commands" -- NOT defects. The first is CoalMine's own file, cited here only for
//     comparison; the second was never a path at all, just three top-level dirs named in one
//     sentence (an earlier draft wrote it slash-joined, which reads as one pointer instead of
//     three nouns -- corrected in the same pass as the filename fix above).
//
// THE INSIGHT THAT MAKES THE RULE WORK, and a naive rule unusable: a shipped skill's prose
// names files in the SCANNED USER's repo (`.coalboard.json`, a bare `SKILL.md`) which by
// construction do not exist in ours. Steps 5-8 are four ways of saying the same thing: only
// a path ROOTED IN OUR OWN TREE is a claim this repo can be wrong about.
//
// FOUR NAMED BLIND SPOTS, so a clean run is never read as coverage -- all found BY this
// room's own measurement, not inherited from the exemplar's:
//
//   1. Step 7 excludes EVERY dot-dir, `.github/` included -- and `.github` IS TRACKED here
//      (`.github/workflows/*.yml`, `.github/dependabot.yml`), unlike CoalMine where the
//      exemplar's own equivalent note found zero live cost. A shipped doc citing
//      `.github/workflows/ci.yml` in OUR tree goes UNCHECKED. Measured cost today: zero (no
//      in-scope surface currently cites `.github/...`). The day one does, this rule must be
//      revisited by hand -- prose, not a machine.
//
//   2. Step 8 admits a SIBLING's file whenever its first segment happens to equal one of
//      OUR OWN roots too. coalmine-scanner.md (under a SIBLING repo's own agents/ dir) is
//      CoalMine's file, cited in our own CHANGELOG.md purely for comparison -- but CoalBoard
//      ALSO grew an agents/ root at v2.4.0 (CWK-040's per-seat custom agent defs), so step 8
//      cannot tell "our agents/" from "a sibling's agents/, coincidentally same top segment".
//      This produced a REAL false positive in our own measurement (not a hypothetical):
//      `resolve()` correctly reports it MISSING, and `historyOnly` is what actually excuses
//      it here, not a fix to the funnel itself. Recorded so the next reader does not
//      rediscover it as a new bug. (Named by filename only here too, for the same reason as
//      the block above -- the full path is exactly the shape this gate would flag.)
//
//   3. A cross-repo PREFIX is invisible at step 8, the SAME step as blind spot 2 above but
//      the opposite failure: not a same-named root, a DIFFERENT-named one. A citation
//      prefixed with the UMBRELLA's own name (e.g. a path rooted one level above this repo's
//      checkout) has a first segment matching neither ourRoots nor ignoredRoots -- step 8's
//      "not ours, not ignored" bucket, `if (!ourRoots.has(first)) continue`, drops it
//      SILENTLY as someone else's tree. Measured cost, found by a plain
//      `grep -c "scratchpad/"` after the gate itself was already GREEN (CWK-075 round 3):
//      three CHANGELOG.md citations into the umbrella's own gitignored scratchpad survived a
//      clean gate run, unseen, because their first segment read as an unrelated tree rather
//      than as the same gitignored-and-unreachable case blind spot 2 already names. This is
//      NOT the unbacktick case -- these were fully backticked, well-formed, `/`-containing
//      tokens; the funnel read them and correctly filed them as out of scope by its own rule.
//      Fixed by citation repair (repointed at the commits that carried the work), not by a
//      funnel change. Why the rule is not widened: "not ours, not ignored" is what makes the
//      whole scheme usable at all (the insight below) -- teaching it to also chase paths
//      shaped like a PARENT repo's tree means guessing at every possible ancestor-prefix
//      convention, which is exactly the false-positive flood step 8 exists to avoid. The cheap
//      backstop is the same one blind spot 2 already leans on: `historyOnly` for what
//      published history can no longer act on, and a human `grep` for the rest.
//
//   4. An UNBACKTICKED path is invisible to the ENTIRE funnel, at step 0, before any of the
//      eight filters run -- `pointerCandidates()` only reads inside `` `...` `` pairs, so a
//      path written in plain prose is never even a candidate. This is the funnel's WIDEST
//      limit, and it is a DIFFERENT thing from blind spot 3 above: 3 is a backticked,
//      well-formed token that the funnel reads and then drops; this is a path the funnel
//      never reads at all. Measured cost: the same three CHANGELOG.md citations blind spot 3
//      names were found by a plain `grep -rn "scratchpad/"` run AFTER `verify.mjs` was
//      already GREEN (CWK-075 round 3) -- a clean gate run means no BACKTICKED pointer
//      dangles, never that ship-text has no dangling pointer at all. Why the rule is not
//      widened to scan plain prose: a backtick is the only delimiter this funnel has to
//      anchor on; without it, every slash-shaped phrase in a sentence becomes a candidate
//      ("see the docs/notes on this" is not a path), which is exactly the false-positive
//      flood step 0 through 8 exist to keep out. The standing backstop is a human
//      `grep -rn "scratchpad/"` (or the equivalent for a room's own gitignored roots) run by
//      hand, same as blind spot 3's.
//
// ============================================================================
// WHAT IS NOT SHIPPED. Section and symbol resolvers were considered and are NOT built here,
// on the same measurement CoalMine already ran and reported (a section-reference matcher
// floods on natural-language "X ... below" phrasing -- 8 candidates, 6 dangling, all six
// false; a symbol resolver's false flags are dominated by names cited as REJECTED
// alternatives, not names we call). Re-deriving that measurement on our own surfaces was not
// repeated -- the mechanism-level finding (natural language defeats a purely lexical
// section/symbol matcher) does not depend on which repo's prose it is run against. Path is
// machine-checked; section and symbol are not checked at all -- see verify.mjs's own pass
// line, which states this rather than implying coverage it does not have.
//
// ============================================================================
// ADOPTER CONTRACT -- DATA, never LOGIC. Nothing below hardcodes CoalMine's or any other
// room's layout. A room supplies: its own surfaces (walked), its own ourRoots and
// ignoredRoots (derived from ITS tree), its own resolve(), and its own pending list.

// A path this room deliberately points at BEFORE it exists. Ships EMPTY: at build time all
// 43 in-scope resolving pointers were already real, so nothing needed a declaration. The
// mechanism exists anyway -- without an escape hatch the first legitimate forward pointer
// hard-FAILs, and the cheapest way to make a FAIL go away is to delete the gate. Same
// EVENT-based expiry as CWK-060's PENDING_KEYS/NOT_CONFIG/BLIND_KEYS -- pruned by what
// BECOMES TRUE, never by a date nobody re-reads.
export const PENDING_POINTERS = [
  // { path: 'scripts/lib/thing.mjs', reason: 'CWK-000 -- landing next unit' },
];

const GLOB = /[*?[\]{}|]/;
const OUTSIDE = /^([~/]|[A-Za-z]:|[a-z][a-z0-9+.-]*:\/\/)/;

// Candidate extraction. Exported so an adopter (or a future audit here) can measure its OWN
// funnel with the same instrument rather than re-implementing it and getting different
// numbers.
export function pointerCandidates(text) {
  const out = [];
  // Fenced code blocks are EXAMPLES, not prose claims about this tree.
  const prose = String(text).replace(/^```[\s\S]*?^```/gm, '');
  for (const m of prose.matchAll(/`([^`\n]+)`/g)) {
    const tok = m[1];
    if (/\s/.test(tok)) continue;          // a command or a table row, not a pointer
    if (/[<>]/.test(tok)) continue;        // <placeholder>
    if (GLOB.test(tok)) continue;          // a glob names a SET, not a file
    if (!tok.includes('/')) continue;      // a bare filename is the USER's repo's
    if (OUTSIDE.test(tok)) continue;       // absolute, home-relative, or a URL
    if (tok.startsWith('.')) continue;     // a dot-dir is an agent/tool home (blind spot 1)
    out.push(tok);
  }
  return out;
}

// `docs/x.md:12` and `scripts/` both name a real thing; the suffix and the trailing slash
// are punctuation, not part of the path.
function normalise(tok) {
  return tok.replace(/:\d+(-\d+)?$/, '').replace(/\/+$/, '');
}

export function checkPointers({
  surfaces = [],            // [{ label, text, historyOnly? }]
  ourRoots = new Set(),     // top-level names that belong to THIS repo
  ignoredRoots = new Set(), // top-level dirs/files this repo gitignores
  resolve,                  // (relPath) => 'tracked' | 'untracked' | 'missing'
  pending = PENDING_POINTERS,
} = {}) {
  const findings = [];
  if (typeof resolve !== 'function') {
    findings.push({ level: 'FAIL', msg: 'pointer check: no resolve() supplied -- the gate cannot answer its own question' });
    return findings;
  }

  const cited = new Set();
  let checked = 0;

  for (const s of surfaces) {
    if (typeof s.text !== 'string') {
      // NAME what could not be read. A caller that filters unreadable surfaces out first
      // hides its own scope gap -- the silent narrowing this family of gates exists to
      // catch, committed by the gate's own wiring.
      findings.push({ level: 'SKIP', msg: `pointer check could not read ${s.label}` });
      continue;
    }
    const seen = new Set();
    for (const tok of pointerCandidates(s.text)) {
      if (seen.has(tok)) continue;
      seen.add(tok);
      const first = tok.split('/')[0];

      // A GITIGNORED ROOT IS THE SHARP CASE, and it is decided WITHOUT resolving: from any
      // other machine "gitignored" and "does not exist" are indistinguishable, so such a
      // path was never durable -- not even on the day it was written. This branch runs
      // BEFORE `pending` is consulted, deliberately: a declaration can excuse a path that
      // does not exist YET, never one that exists and is unreachable from a clone. It also
      // binds a `historyOnly` surface, where the ordinary resolution check below does not --
      // the distinction: a renamed file was correct once, a scratchpad path never was.
      if (ignoredRoots.has(first)) {
        cited.add(normalise(tok));
        checked++;
        findings.push({
          level: 'FAIL',
          msg: `${s.label} cites \`${tok}\`, which lives under the gitignored \`${first}/\` -- not reachable from a clone. Cite the durable artefact (a commit SHA, a shipped doc) or commit the file.`,
        });
        continue;
      }

      if (!ourRoots.has(first)) continue; // a path into someone else's tree
      cited.add(normalise(tok));

      // Published history is never fixed forward: a path that was correct when the entry
      // was written is not a defect now. Such a surface is checked for the gitignored case
      // above and nothing else.
      if (s.historyOnly) continue;

      checked++;
      const rel = normalise(tok);
      const state = resolve(rel);
      if (state === 'tracked') continue;
      if (pending.some((p) => p && p.path === rel)) continue;
      if (state === 'untracked') {
        findings.push({ level: 'FAIL', msg: `${s.label} cites \`${tok}\`, which exists here but is UNTRACKED -- a clone does not have it. Commit it, or cite the durable artefact.` });
      } else {
        findings.push({ level: 'FAIL', msg: `${s.label} cites \`${tok}\`, which does not resolve in this repo` });
      }
    }
  }

  // EVENT-based expiry, both directions. A declaration list nobody prunes becomes a
  // permanent hole with an author's name on it.
  for (const p of pending) {
    if (!p || !p.path) { findings.push({ level: 'FAIL', msg: 'PENDING_POINTERS entry has no path' }); continue; }
    if (!p.reason) { findings.push({ level: 'FAIL', msg: `PENDING_POINTERS declares ${p.path} with no reason -- an allowlist of bare strings is a bypass with no author` }); }
    if (resolve(p.path) === 'tracked') {
      findings.push({ level: 'FAIL', msg: `PENDING_POINTERS declares ${p.path} as not-yet-existing, but it now resolves -- delete the entry` });
    } else if (!cited.has(p.path)) {
      findings.push({ level: 'FAIL', msg: `PENDING_POINTERS declares ${p.path}, but no in-scope surface cites it -- delete the entry` });
    }
  }

  findings.checked = checked;
  return findings;
}
