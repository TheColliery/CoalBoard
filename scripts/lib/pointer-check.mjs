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
// SIX NAMED BLIND SPOTS, so a clean run is never read as coverage -- all found BY this
// room's own measurement, not inherited from the exemplar's. (A SEVENTH bound is not
// listed here because it belongs to `ignoredRoots`'s own DERIVATION, not to this funnel --
// the CWK-079 FOREIGN-NAME COLLISION bound, documented at its own `verify.mjs` call site.)
//
//   1. Step 7 used to exclude EVERY dot-dir; CWK-077 NARROWED it, it did not close it.
//      `ourRoots` never contains a dot-dir (deriveRootSets excludes every hidden entry by
//      design -- CWK-078's own `.github`-shape unit test pins that property), so admission
//      cannot go through `ourRoots` membership. Instead a dot-dir root is admitted only
//      when BOTH hold: its name is not `.github`, AND `resolve()` itself reports the root
//      TRACKED (`git ls-files --error-unmatch -- <dir>` succeeds as a directory PATHSPEC
//      whenever any tracked file lives under it) -- a real, run-time git query, never a
//      hand-kept name list, and never a blanket "any dot-dir" admission (an earlier draft
//      of this fix tried exactly that and flooded on every `.coalboard/...`-shaped path a
//      shipped doc uses to describe the SCANNED USER's own repo convention -- caught before
//      shipping by running the gate, not by re-reading the diff). A GITIGNORED or merely
//      untracked dot-dir (`.claude/...`, a bare `.coalboard.json` example) stays exactly as
//      invisible as before this change -- this is a narrow carve-out for one class, never a
//      general un-blinding. Measured effect on this repo: `.claude-plugin/plugin.json` is
//      cited FOUR times (CHANGELOG.md, CONTRIBUTING.md, commands/update.md, and this very
//      header's own example two paragraphs up) and now reaches resolve() -- but the
//      CHANGELOG.md occurrence sits on a `historyOnly` surface, so it is CITED, never
//      CHECKED (it `continue`s before `checked++`, same rule any historyOnly citation
//      follows). The honest count is +3 checked, +1 cited-on-history, 0 false positives --
//      never "+4 covered" (findings-back round 2 caught this file's own prior overstatement
//      of its own carve-out, the exact class this gate exists to catch, committed inside it).
//      `.github` STAYS excluded, by name, and this is the part still open:
//      it collides with the ORG's own `.github` repo, cited constantly in our own ship-text
//      for THAT tree (its benchmarks dir, its dependabot config) -- and no mechanical
//      discriminator exists yet to tell "our own .github" from "the org repo named
//      .github". A naive narrowing with no exclusion was measured and produces exactly
//      four false FAILs on this tree today, and they are NOT the four a first pass named
//      (a stated count beside its own list must be reconciled against it, or the count
//      survives only because two errors cancel -- findings-back round 2's own catch): one
//      `.github/.github/workflows/` citation in `references/audit.md`, one bare
//      `.github/...` ellipsis placeholder each in `scripts/verify.test.mjs` and this very
//      module's own header, and a SECOND `.github/.github/workflows/` citation inside this
//      module's header alongside the first -- a repo named `.github` legitimately nesting
//      its own directory of that name, `references/audit.md`'s own documented
//      false-positive class, occurring twice, not once. The ORG repo's own benchmarks-doc
//      citation does NOT fail: it lives in `CHANGELOG.md`, which is `historyOnly`. The day a
//      mechanical discriminator exists for "our .github vs the org's", this narrows
//      further; until then this is prose, not a machine.
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
//   5. A BACKSLASH CHARACTER (CWK-077 findings-back) is rejected outright, decided before
//      any root classification, rather than resolved -- a `/`-only segment-whole scan
//      cannot see a backslash-delimited segment, and a mixed-separator token's mis-split
//      first segment never matches a real root either way, so widening the split character
//      set would not close that quiet half. Cost, measured on this room's own tree: 18
//      backticked tokens contain a backslash across every scanned surface, 0 path-shaped
//      enough to reach this check -- every one is a regex fragment, an escape sequence, or
//      an already-excluded absolute Windows-path example. Full detail lives at the check
//      site inside `checkPointers()` (the backslash-rejection branch).
//
//   6. A leading `./` or `../` token (a common comment convention meaning "relative to
//      this file") is not treated as a candidate dot-dir ROOT -- it falls through to the
//      ordinary ourRoots test, fails it, and is silently out of scope, same as before
//      CWK-077. Deliberate, not an oversight: admitting a bare `.`/`..` as a root would let
//      `resolve('.')` trivially match the whole repo, the exact collision the isDotDir
//      exclusion at the check site exists to avoid. Measured cost: 2 such tokens exist on
//      this tree today, one a real citation of a real file nothing checks
//      (`scripts/verify.mjs` citing `./lib/derive-roots.mjs`), the other this header's own
//      illustrative example (`./lib/x.mjs`, at the isDotDir check site).
//
// ============================================================================
// IGNOREDROOTS IS LEGITIMATELY EMPTY ON A FRESH CLONE OR IN CI (measured CWK-078 RED, the
// hard way -- a test that cited this repo's own gitignored `scratchpad` directory passed on
// a dev box and failed identically to CI on a clean checkout). Every one of this repo's 7
// gitignored top-level entries (`MEMORY.md`, `AGENTS.md`, `CLAUDE.md`,
// `COALBOARD_BLUEPRINT.md`, `scratchpad`, `.claude`, `skillspector-20260702.json`) is
// LOCAL-ONLY tooling state, never committed -- a clone or CI checkout has NONE of them on
// disk, so `readdirSync` never even enumerates them and `ignoredRoots` derives to the EMPTY
// SET there. The gitignored branch this whole module is built around is therefore DEAD CODE
// on every CI run and for every ordinary user; it only ever fires on a MAINTAINER's own
// machine that has actually used this room's tools long enough to accumulate them. This is
// not a bug in the derivation -- it is exactly what "derive, never freeze" should do when
// the gitignored state genuinely differs by machine -- but a test asserting against it MUST
// build its own fixture repo (see `scripts/lib/derive-roots.test.mjs`) rather than depend on
// this fact being true wherever the test happens to run.
//
// INERTNESS BY CONSTRUCTION -- not every entry in either roster can ever matter, and that
// must be stated so a future reader does not pad either list expecting coverage it cannot
// buy (measured CWK-078, real fixtures run through checkPointers against this room's own
// live sets, not asserted from reading the code):
//
//   A root FILE (e.g. `MEMORY.md`, `CHANGELOG.md`) can NEVER be the first segment of a
//   token that reaches the gitignored branch -- step 5 drops any token with no directory
//   component, and a bare `MEMORY.md` or `MEMORY.md:12` has none (candidates=[] for both,
//   measured). Consequence: of our own 7-entry ignoredRoots (6 files + 1 directory), SIX
//   are INERT -- present, correctly gitignored, and structurally unable to ever reach the
//   branch that checks them. Only `scratchpad` (a non-hidden gitignored DIRECTORY) can --
//   named here with NO trailing slash, deliberately: adding one would itself form a token
//   this gate extracts and flags, the same self-reference trap blind spots 3 and 4 already
//   name and fix the same way.
//
//   A path into a HIDDEN ignored root (`.claude/...`) is dropped one step earlier, at step
//   7 (every dot-dir is excluded unconditionally, the same mechanism as blind spot 1) --
//   inert for the SAME reason a `.github/...` citation is invisible, not because
//   ignoredRoots failed to name it.
//
//   Symmetrically, ourRoots missing a root DOC FILE (`README.md`, `LICENSE`, ...) costs
//   NOTHING: step 5 already requires `first` to be followed by `/`, and a file can never be
//   a directory prefix. Deriving ourRoots to include the files anyway (rather than
//   filtering to directories only) is still the RIGHT shape -- a future top-level
//   DIRECTORY must be caught the day it appears -- but the file half of that derivation is
//   symmetry, never a fix for an exposure that existed.
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
// room's layout. A room supplies: its own surfaces (walked -- `DEFAULT_SURFACE_PLAN`
// below is THIS room's own declaration of that supply, not a hardcoded fact about every
// room), its own ourRoots and ignoredRoots (derived from ITS tree), its own resolve(),
// and its own pending list.

// SURFACE PLAN, DECLARED (CWK-090 fix c, ported from CoalMine's DEFAULT_SURFACE_PLAN /
// collectSurfaces -- CoalHearth's finding, ported through them: "scripts/ comments are a
// walked surface" was CODE here (`verify.mjs`'s own three-loop construction), not data, so
// an adopter had to READ the driver to know what it walks. Now it is DATA, one row per
// walked surface, each carrying its own `why`.
//
// THE NARROWING FORM, one sentence an adopter copies rather than guesses: a room that
// walks fewer surfaces DELETES the row and states its reason in the row's own `why`,
// never by editing `collectSurfaces` or leaving the row in place unused.
//
// DEVIATION FROM COALMINE, NAMED: CoalMine's own `walkMd`/`walkSrc` RECURSE into
// subdirectories, so a single `scripts` row there also reaches `scripts/lib`. Ours does
// NOT -- `collectSurfaces`'s own `io.walkMd`/`io.walkSrc` (wired in verify.mjs) are FLAT,
// one directory level only, matching this room's PRE-EXISTING behaviour byte-for-byte:
// the three-loop original scanned `scripts`, `scripts/lib`, and `hooks` as three
// SEPARATE, non-recursive listings (a bare `lib` directory entry never matched the
// `.mjs`/`.js` filter, so `scripts`'s own listing never reached its `lib/` child).
// Recursing here would silently DOUBLE the surface count for every `scripts/lib/*.mjs`
// file (once via a recursive `scripts` row, once via the separate `scripts/lib` row) --
// kept flat so the surface-IDENTITY proof this fix is measured against (CWK-090's own
// done-criterion: the pre-fix and post-fix gates must walk the same surfaces and produce
// the same counts) holds EXACTLY, not approximately.
//
// `kind` is one of three -- narrower than CoalMine's four (no `hash-comments`/`.githooks`
// row exists here today; a room that never walks a `#`-comment surface has nothing to
// declare for it, not a gap to fill for symmetry): `raw` (a single file's whole text, no
// `dir`) · `md` (a directory of markdown files, ONE LEVEL, whole text) · `comments` (a
// directory walk, ONE LEVEL, `//`/`*`-prefixed lines only, ext-filtered). `dir: true`
// means `root` is a directory to walk; its absence means `root` is one exact file.
// `historyOnly: true` marks a surface `checkPointers` binds to the gitignored-root case
// only, never the ordinary resolve check (CHANGELOG.md -- published history is never
// fixed forward).
export const DEFAULT_SURFACE_PLAN = [
  { kind: 'raw', root: 'skills/coalboard/SKILL.md',
    why: 'the debate contract every lens and the judge follow -- ship-text a user reads' },
  { kind: 'md', root: 'skills/coalboard/references', dir: true,
    why: 'the deep-detail surfaces SKILL.md defers to -- ship-text a user reads' },
  { kind: 'md', root: 'commands', dir: true,
    why: 'command docs are ship-text a user reads' },
  { kind: 'raw', root: 'README.md',
    why: 'the front door -- every install/config claim starts here' },
  { kind: 'raw', root: 'SECURITY.md',
    why: 'the disclosure surface, and it cites internal paths (e.g. a hook line ref)' },
  { kind: 'raw', root: 'CONTRIBUTING.md',
    why: 'the dev-facing surface, and it cites internal paths' },
  { kind: 'raw', root: 'PRIVACY.md',
    why: 'the privacy surface, and it cites internal paths' },
  { kind: 'raw', root: 'NOTICE',
    why: 'names no path today, but the enumerated-file roster stays complete rather than silently narrower than what verify.mjs actually reads' },
  { kind: 'raw', root: 'CHANGELOG.md', historyOnly: true,
    why: 'published history is never fixed forward -- a path correct when the entry was written is not a defect now, but a gitignored citation was never correct on any day' },
  { kind: 'comments', root: 'scripts', dir: true, ext: /\.(mjs|js)$/,
    why: 'a path inside CODE is exercised by the tests; a path inside a COMMENT is exercised by nothing at all' },
  { kind: 'comments', root: 'scripts/lib', dir: true, ext: /\.(mjs|js)$/,
    why: 'same class as the scripts/ row, lib/ side -- its OWN row because this room\'s walk is flat, never recursive (see the DEVIATION note above)' },
  { kind: 'comments', root: 'hooks', dir: true, ext: /\.(mjs|js)$/,
    why: 'same class as the scripts/ row, hooks/ side' },
];

// COLLECT -- plan-driven, DI'd fs so this module stays pure (it imports nothing today and
// must not start). `io.join`/`io.walkMd`/`io.walkSrc`/`io.read`/`io.rel` are the SAME
// filesystem primitives the caller already owns; `io.commentLines` is the comment-line
// filter. `io.walkMd(dir)` returns absolute `.md` paths ONE LEVEL DEEP; `io.walkSrc(dir,
// keep)` returns absolute paths, one level deep, whose basename passes `keep(name)`.
// Runs the plan in ORDER, so a room's own surface count/order is exactly its plan's --
// no hidden reordering.
export function collectSurfaces(repo, plan, io) {
  const surfaces = [];
  for (const row of plan) {
    if (row.dir) {
      const abs = io.join(repo, row.root);
      if (row.kind === 'md') {
        for (const f of io.walkMd(abs)) surfaces.push({ label: io.rel(f), text: io.read(f) });
      } else {
        const keep = row.ext ? (n) => row.ext.test(n) : () => true;
        for (const f of io.walkSrc(abs, keep)) {
          const src = io.read(f);
          const text = row.kind === 'comments' && src !== null ? io.commentLines(src) : src;
          surfaces.push({ label: io.rel(f), text });
        }
      }
    } else {
      const s = { label: row.root, text: io.read(io.join(repo, row.root)) };
      if (row.historyOnly) s.historyOnly = true;
      surfaces.push(s);
    }
  }
  return surfaces;
}

// A path this room deliberately points at BEFORE it exists. Ships EMPTY: at build time all
// 43 in-scope resolving pointers were already real, so nothing needed a declaration. The
// mechanism exists anyway -- without an escape hatch the first legitimate forward pointer
// hard-FAILs, and the cheapest way to make a FAIL go away is to delete the gate. Same
// EVENT-based expiry as CWK-060's PENDING_KEYS/NOT_CONFIG/BLIND_KEYS -- pruned by what
// BECOMES TRUE, never by a date nobody re-reads.
export const PENDING_POINTERS = [
  // { path: 'scripts/lib/thing.mjs', reason: 'CWK-000 -- landing next unit' },
];

// CHECK-IGNORE CLASSIFIER (CWK-090 fix a), pure -- takes the exact shape a
// `spawnSync('git', ['check-ignore', '--stdin'], {...})` result carries and answers ONE
// question: did this run actually tell us anything? Exit 0 and exit 1 both SUCCEED (1 =
// "none of the fed paths are ignored", not an error); a spawn error or any OTHER status
// (128 included -- a bad pattern, an unreadable `.gitignore`, a broken worktree) means
// the run answered NOTHING, and the caller must not treat an empty stdout as "zero
// ignored". THE PRE-FIX SHAPE (this room's own, before CWK-090) checked only `!ci.error`
// -- any non-0 status short of a spawn error fell through to "read stdout", silently
// produced an empty `ignoredRoots`, and printed a git-derived count over a run that
// derived no facts at all. That call site's own comment argued its safety ("only a
// genuine spawn error here would mean otherwise, and none has been observed") -- this
// room's own recurring signature class, an artefact's prose defending the defect it sits
// beside.
//
// Exported and kept pure so this classification is unit-testable without a real git
// child. Independently re-derived on THIS box (git 2.55.0.windows.5), never assumed from
// CoalMine's own measurement even though it runs the same git version: no reliable way
// was found to force `check-ignore --stdin` itself to a non-0/1 exit while `ls-files`
// (verify.mjs's own pre-gate, same cwd) still succeeds -- a `.cmd` shim placed first on a
// custom PATH was tried and never invoked (Node's `spawnSync('git', ...)` resolved
// straight past it to the real `git.exe`, the identical platform/runtime discrepancy
// CoalMine recorded on the same box). The one real non-0/1 exit reproduced (129, an
// unknown option) needs a flag verify.mjs never passes -- it proves the branch is
// reachable BY GIT, not that this room's own hardcoded call can be driven there today.
export function classifyCheckIgnoreResult(ci) {
  if (ci.error) {
    return { ok: false, message: `git check-ignore --stdin failed to spawn: ${ci.error.message}` };
  }
  if (ci.status !== 0 && ci.status !== 1) {
    const stderrLine = typeof ci.stderr === 'string' ? ci.stderr.split('\n')[0].trim() : '';
    return {
      ok: false,
      message: `git check-ignore --stdin exited ${ci.status}${stderrLine ? ` -- ${stderrLine}` : ''} -- cannot tell which cited roots are gitignored`,
    };
  }
  // NAMED BOUND -- exit 0 means at least one fed path matched, but a non-string or
  // empty-of-content stdout here would still answer ok with zero recovered roots: git
  // said something matched, this classifier would conclude nothing did. UNREACHABLE
  // today: `encoding: 'utf8'` (verify.mjs's own spawnSync call) makes `ci.stdout` a
  // string whenever the spawn itself did not error (caught above), and verify.mjs never
  // passes `-q` (the one flag that pairs a silent, empty stdout with exit 0). A stated
  // bound, not a guard -- adding a branch for a case nothing can reach is the
  // over-hardening this room's own rules ban.
  return { ok: true, stdout: typeof ci.stdout === 'string' ? ci.stdout : '' };
}

// APPLY the check-ignore probe's verdict onto `ignoredRoots`, or FAIL loudly. Built in
// this DI shape PROACTIVELY, not after a bounce round -- CoalMine's own history shows
// the naive inline `if (!verdict.ok) fail(...) else {...}` at the call site is
// untestable-by-mutation: their reviewer mutated that one condition to `if (false)` and
// their whole suite stayed byte-identically green, because nothing exercised the branch
// outside the real gate's own run. Moving the classify-then-fail-or-record logic into
// this exported function, the SAME DI shape `collectSurfaces(repo, plan, io)` already
// uses for the surface walk, means a unit test drives the EXACT code verify.mjs runs,
// with an injected `runCheckIgnore` in place of a real `spawnSync` -- no duplicate copy
// to fall out of sync. `runCheckIgnore(input)` takes the newline-joined probe input and
// returns the same `{status, stdout, stderr, error}` shape a real `spawnSync` result
// carries.
export function applyCheckIgnoreProbe({ toProbe, PROBE_SUFFIX, ignoredRoots, fail, runCheckIgnore }) {
  if (!toProbe.length) return;
  const ci = runCheckIgnore(toProbe.map((n) => n + PROBE_SUFFIX).join('\n') + '\n');
  const verdict = classifyCheckIgnoreResult(ci);
  if (!verdict.ok) {
    fail(verdict.message);
    return;
  }
  for (const line of verdict.stdout.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    ignoredRoots.add(t.endsWith(PROBE_SUFFIX) ? t.slice(0, -PROBE_SUFFIX.length) : t.replace(/\/$/, ''));
  }
}

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
    // A dot-dir is admitted here (CWK-077) -- checkPointers() decides root-by-root which
    // ones are IN SCOPE (blind spot 1, narrowed not closed: a dot-dir root is admitted only
    // when it is not `.github` AND resolve() itself reports it TRACKED -- naming only the
    // `.github` exclusion here, without the TRACKED requirement, is ship-text disagreeing
    // with the mechanism it introduces, inside the gate built to catch exactly that class).
    out.push(tok);
  }
  return out;
}

// LAST-SEGMENT SHAPE TEST (CWK-079) -- feeds ONLY verify.mjs's ignore-probe candidate-root
// derivation (which first segments get asked of `git check-ignore`), NEVER pointerCandidates'
// own resolve-path population above. Kept OUT of pointerCandidates deliberately: a token this
// test rejects may still be a real, existing, TRACKED citation into one of this room's own
// hidden-but-tracked directories that the ordinary resolve() check must keep seeing --
// narrowing pointerCandidates itself would silently drop those from resolution checking too,
// an unrelated regression from the one this test exists to fix. (Deliberately not backticked
// here -- a real example would itself become a candidate this file's own scan has to explain
// away, the self-reference trap the blind spots above already name.)
//
// THE DEFECT THIS CLOSES: a token containing a `/` is not necessarily a path -- the
// no-`/` drop above only proves the token HAS a slash, never what the slash SEPARATES.
// Measured over this room's own candidate tokens (83 distinct, 38 distinct first segments,
// re-derive live with a throwaway probe over pointerCandidates() -- never quote this number
// forward): an arithmetic ratio, two rule-force words joined by a slash, a lens-name pair, a
// CI class label, a model-tier list, and a bare `data`/`security` prose fragment all reach
// the ignore-probe's first-segment derivation with no path in them at all -- 10 of the 38
// first segments exist ONLY via such a token. Feeding any one of those bare names to
// `git check-ignore` and getting a hit would FAIL a real, harmless citation with the remedy
// "commit the file" -- incoherent for an arithmetic ratio or a rule-force pair.
//
// THE TEST: strip a trailing `:line(-line)?` ref (the same suffix `normalise()` strips for
// resolution below), then either the token ends in `/` (an explicit directory reference) or
// its LAST segment carries a `.ext`-shaped suffix (a filename). Both are the deliberate,
// common path conventions this room's own prose already uses; an arithmetic ratio or a
// rule-force pair carries neither.
//
// THIS GATES DISCOVERY ONLY, NEVER JUDGEMENT -- stated because the natural first reading is
// wrong. This test decides which roots verify.mjs adds to its ignore-probe candidate set; it
// is never consulted by `checkPointers`' own `ignoredRoots.has(first)` branch below, which
// judges EVERY token reaching it regardless of shape. So a token this test rejects is NOT
// excluded from the check -- it is excluded only from CONTRIBUTING ITS OWN ROOT to the set
// the check runs against. The true property is NON-LOCAL: a citation this test rejects (an
// extensionless path with no trailing slash) is checked IF AND ONLY IF some OTHER,
// unrelated, path-shaped citation anywhere in the surface set shares its first segment.
// Reword this test's own behaviour before "fixing" the sentence above -- making the check
// local would mean applying this shape test inside `checkPointers` too, which would silently
// stop FAILing a real gitignored citation that happens to be extensionless.
//
// THE RESIDUE, both directions, named rather than hidden:
//   - STILL LETS THROUGH: a token ending `/` is accepted with no check on what precedes it
//     -- a function-call-shaped token ending in `/` still reaches the probe. Harmless in
//     practice (no real `.gitignore` pattern is named that), named here rather than papered
//     over with a further heuristic. A latent accept-side case nobody has hit: the
//     last-segment test accepts an ALL-DIGIT "extension" (`.[A-Za-z0-9]{1,10}` matches
//     digits too), so a slash-separated version-shaped token would pass as filename-shaped.
//     Measured population on this room's tree today: ZERO. A THIRD, live-today case, same
//     class and same honesty bar: `OUTSIDE` (pointerCandidates, above) only rejects a URL
//     that carries a SCHEME -- a scheme-less `github.com/...` token reaches this test's
//     first-segment derivation unfiltered, and a real citation of that shape is on this
//     tree today (`SKILL.md`'s own issue-tracker URL). It is discovery-excluded only BY
//     LUCK here (its last segment carries no `.ext`-shaped suffix) -- a URL one path
//     segment longer, ending in a real filename, would shape-qualify and probe
//     `github.com` against OUR `.gitignore`. Measured population on this room's tree
//     today: ZERO (no such longer-shaped citation exists yet).
//   - DISCOVERY-EXCLUDED, but NOT check-exempt per the non-locality above: an extensionless
//     real path with no trailing slash is no longer a source of its OWN root. Measured on
//     this tree: every extensionless dot-dir citation this file's own header and the module's
//     comments already name (the `.github/...`, `.coalboard/...`, and `.claude/...` shapes
//     documented above) is discovery-excluded here -- live cost is ZERO regardless, because
//     none of those roots can ever reach this probe's judgement branch at all: a dot-dir
//     root is admitted or excluded entirely inside `checkPointers` (blind spot 1, above)
//     BEFORE the ignoredRoots check ever runs, so this shape test's residue on a dot-dir
//     token is structurally inert here -- a divergence from the exemplar, which holds a
//     separate agent-home set out of its probe for the same reason CoalBoard's dot-dir
//     admission already provides for free.
export function looksPathShaped(tok) {
  const t = tok.replace(/:\d+(-\d+)?$/, '');
  if (t.endsWith('/')) return true;
  return /\.[A-Za-z0-9]{1,10}$/.test(t.split('/').pop());
}

// `docs/x.md:12` and `scripts/` both name a real thing; the suffix and the trailing slash
// are punctuation, not part of the path.
function normalise(tok) {
  return tok.replace(/:\d+(-\d+)?$/, '').replace(/\/+$/, '');
}

export function checkPointers({
  surfaces = [],            // [{ label, text, historyOnly? }]
  ourRoots = new Set(),     // top-level names that belong to THIS repo
  ignoredRoots = new Set(), // first segments of CITED paths that .gitignore matches (CWK-079: existence-independent -- not a listing of dirs/files the caller has on disk)
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

  // MEDIUM-3 (CWK-077 findings-back round 2): `resolve(first)` is a real `git ls-files`
  // subprocess, and `seen` above is per-SURFACE, so the SAME root name was re-probed once
  // per surface that cited it -- measured live at 39 spawns to answer 5 distinct root
  // questions, ~+1.8s/~+65% per `verify` run for 4 citations. Memoized here, per
  // checkPointers() CALL (never across calls -- a fresh run must re-derive trackedness,
  // this only removes redundancy WITHIN one run), so a root name pays exactly one
  // subprocess however many surfaces cite it. `.github` is excluded by name before this
  // cache is ever consulted (see the admission check below), so it never occupies a slot.
  const dotDirRootCache = new Map(); // first-segment -> boolean tracked
  const dotDirRootsSeen = new Set();     // every dot-dir root NAME encountered, incl. .github
  const dotDirRootsAdmitted = new Set(); // roots that passed BOTH not-.github and TRACKED
  let dotDirCited = 0;   // citations under an admitted root that reached `cited.add`
  let dotDirChecked = 0; // of those, how many also reached `checked++` (excludes historyOnly)

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

      // BLIND SPOT 5 (CWK-077 findings-back) -- A BACKSLASH CHARACTER is rejected OUTRIGHT,
      // decided WITHOUT resolving and BEFORE any root classification -- a citation in this room's
      // own surfaces is `/`-delimited on every platform, so a backslash anywhere in the
      // token is never legitimate here. Deliberately NOT a widened dot-segment split: the
      // segment-escape check below splits on `/`, and a token shaped like two directories
      // up via a BACKSLASH pair, then a filename, splits into exactly two pieces on `/` --
      // the second piece (everything past the first slash) is never exactly `..`, so
      // widening the split CHARACTER SET would still miss it (named here WITHOUT a literal
      // backticked example, deliberately -- the self-reference trap blind spots 3/4 and
      // the INERTNESS note above already name and avoid). Checking the character here,
      // before `first` is ever classified, also closes the QUIET half of the same defect:
      // a token with a backslash BEFORE its first real slash mis-splits `first` into
      // something that never matches a real root in `ourRoots` -- previously dropped
      // SILENTLY as "someone else's tree" rather than named as out of scope. Binds a
      // `historyOnly` surface too, same reasoning as the gitignored-root check below: a
      // backslash-delimited citation was never valid syntax for this room's own
      // `/`-only convention, not even on the day it was written.
      //
      // BLIND SPOT 5, NAMED BOUND: a legitimate Windows-style citation (a human genuinely writing a
      // backslash) is now dropped unconditionally, never checked. Measured on this room's
      // own tree, not ported: 18 backticked tokens contain a backslash across every scanned
      // surface, 0 path-shaped enough to reach this test -- every one is a regex fragment
      // or escape sequence, or a Windows-path example already excluded by the absolute-path
      // filter regardless. Cost today is 0, but the cost is real, not hypothetical, and
      // this is the trade stated plainly rather than implied away.
      if (tok.includes('\\')) {
        cited.add(normalise(tok));
        checked++;
        findings.push({ level: 'FAIL', msg: `${s.label} cites \`${tok}\`, which contains a backslash -- rejected before resolution (a citation here is always \`/\`-delimited)` });
        continue;
      }

      // BLIND SPOT 6 -- a bare `.` or `..` FIRST SEGMENT is a relative-path marker, not a
      // directory NAME. `./lib/x.mjs` (a common comment convention meaning "relative to this
      // file") must never be treated as a candidate dot-dir ROOT for the carve-out below; it falls
      // through to the ordinary ourRoots test, fails it (neither is ever a real root name),
      // and is silently out of scope -- the exact same nothing-happens outcome it had before
      // this ticket, on purpose. The segment-escape check further down (item 2) is what
      // actually polices a `.`/`..` segment wherever one appears in an otherwise in-scope
      // path; this exclusion only keeps item 3's admission test from mis-firing on one.
      const isDotDir = first.startsWith('.') && first !== '.' && first !== '..';

      // BLIND SPOT 1, NARROWED (CWK-077) -- admission for a dot-dir root happens HERE,
      // BEFORE the gitignored check below, so nothing about this carve-out un-shadows the
      // rest of blind spot 1: a citation into a gitignored dot-dir (`.claude/...`) or one
      // merely describing the SCANNED USER's own repo convention (a shipped skill's own
      // runtime path, `.coalboard/proposed/` and its kin) stays exactly as invisible as it
      // was before this change -- this is a NARROW carve-out for one class, never a general
      // un-blinding. `ourRoots` never contains a dot-dir (deriveRootSets excludes every
      // hidden entry by design -- CWK-078's own `.github`-shape unit test pins that
      // property), so admission cannot go through `ourRoots` membership; instead a dot-dir
      // root is admitted only if `resolve()` itself reports it TRACKED -- `git ls-files
      // --error-unmatch -- <dir>` succeeds as a directory PATHSPEC whenever any tracked
      // file lives under it, so this is a real, run-time git query, never a hand-kept name
      // list. `.github` is excluded by name regardless of trackedness (it IS tracked here,
      // and is excluded anyway): it collides with the ORG's own `.github` repo, cited
      // constantly in our own ship-text for THAT tree, and no mechanical discriminator
      // exists yet to tell "our own .github" from "the org repo named .github" -- this is
      // still blind spot 1, narrowed, not closed. The subprocess itself is MEMOIZED
      // (MEDIUM-3, CWK-077 findings-back round 2) -- `first` is looked up in
      // `dotDirRootCache` before `resolve()` is ever called, and the answer is cached for
      // every later citation of the same root within this run.
      if (isDotDir) {
        dotDirRootsSeen.add(first);
        if (first === '.github') continue;
        let tracked = dotDirRootCache.get(first);
        if (tracked === undefined) {
          tracked = resolve(first) === 'tracked';
          dotDirRootCache.set(first, tracked);
        }
        if (!tracked) continue;
        dotDirRootsAdmitted.add(first);
      }

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
        if (isDotDir) { dotDirCited++; dotDirChecked++; }
        findings.push({
          level: 'FAIL',
          msg: `${s.label} cites \`${tok}\`, which lives under the gitignored \`${first}/\` -- not reachable from a clone. Cite the durable artefact (a commit SHA, a shipped doc) or commit the file.`,
        });
        continue;
      }

      if (!isDotDir && !ourRoots.has(first)) continue; // a path into someone else's tree

      cited.add(normalise(tok));
      if (isDotDir) dotDirCited++;

      // Published history is never fixed forward: a path that was correct when the entry
      // was written is not a defect now. Such a surface is checked for the gitignored case
      // above and nothing else. LOW-1 (CWK-077 findings-back round 2): this is exactly why
      // a `historyOnly` dot-dir citation is CITED but never CHECKED -- the header's own
      // blind-spot-1 paragraph states the split rather than a single "covered" count.
      if (s.historyOnly) continue;

      checked++;
      if (isDotDir) dotDirChecked++;
      const rel = normalise(tok);

      // A `.` OR `..` SEGMENT (CWK-077) survives every filter above and would otherwise
      // reach resolve() verbatim -- a caller's own path.join(root, rel) then ESCAPES the
      // repo root (two directories up plus a sibling room name resolves against a REAL
      // sibling room's file, producing a false "exists here but is UNTRACKED" claim about
      // another room's tree). Reject SEGMENT-WHOLE, before resolution, never a substring
      // match -- a legitimate name like two dots followed by letters must keep resolving
      // normally. Bans the shape outright (both a single dot and a double dot), not only
      // the segments that actually escape: the reference shape this rejects, not
      // normalises, on purpose.
      if (rel.split('/').some((seg) => seg === '.' || seg === '..')) {
        findings.push({ level: 'FAIL', msg: `${s.label} cites \`${tok}\`, which contains a \`.\`/\`..\` path segment -- rejected before resolution (a dot-segment can escape the repo root)` });
        continue;
      }

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
  // MEDIUM-3's coverage half (CWK-077 findings-back round 2): the gate prints CWK-078's root
  // derivation every run and said NOTHING about the dot-dir admission path -- a silently
  // broken admission (a resolve() that stops answering 'tracked', a renamed root) produces
  // byte-identical PASS output to today's correct run, the same legitimate-empty-vs-broken-
  // locator ambiguity the config-keys gate's per-locator coverage already exists to remove.
  // Every number here comes from the counters above, never re-derived or guessed.
  findings.dotDirCoverage = {
    rootsSeen: dotDirRootsSeen.size,       // every dot-dir NAME encountered, incl. .github
    rootsProbed: dotDirRootCache.size,     // roots that actually called resolve() (excl. .github)
    rootsAdmitted: Array.from(dotDirRootsAdmitted),
    citationsCited: dotDirCited,
    citationsChecked: dotDirChecked,
  };
  return findings;
}
