// CWK-060 — documentation-vs-schema drift gate, ported from CoalMine's config-keys.mjs
// (CWK-059). Every config key NAMED on a user-facing surface must RESOLVE in
// config-schema.mjs, or be declared. PORTABILITY NOTICE: the SHAPE is CoalMine's;
// every number, list, and the hook-scanning MECHANISM below are CoalBoard's OWN,
// measured against this room's own surfaces before this file was written
// (AGENTS.md, THE SOURCE'S VARIABLES ARE NOT OURS) — do not re-port a number from
// the exemplar's own comments, they describe a different repo.
//
// WHY: CWK-054 (CoalMine)'s own MEDIUM was a fix over-claiming inside the fix. This
// room paid the identical class TWICE, both closed this week: `applyConsent`'s
// help string named "the 2nd consent gate" while SKILL.md's own ledger numbers it
// GATE 3 (CWK-052b) — a real key, wrong description, not this gate's class, but the
// same documentation-vs-code divergence family; and `wizard.md`'s "DISPATCH defaults
// ... config-overridable" names a dispatch config key that does not exist anywhere
// in this room's 31 (found while writing this module) — and it is NOT caught by
// this gate either: that sentence carries no backticked camelCase token at all, so
// there is nothing for the detector to resolve. Same family, structurally outside
// this gate's reach, same as CWK-052b's `applyConsent` (a REAL key with a wrong
// DESCRIPTION — this gate checks resolution, never description accuracy).
//
// DETECTION RULE, measured on THIS repo, not copied from CoalMine's numbers:
//   - naive identifier-shaped backticked token (any `[A-Za-z][A-Za-z0-9]*` in
//     backticks, across SKILL.md + all 7 skills/coalboard/references/*.md +
//     README.md + PRIVACY.md + SECURITY.md, 11 files): 90 candidates, 60 of them
//     NOT keys — 67% noise.
//   - + KEY_SHAPE (camelCase, at least one internal capital): 28 candidates, 1
//     unresolved (`agentId`) — ~4% noise. THE RULE TRANSFERS HERE. This is NOT a
//     given: CoalWash independently measured the same rule NOT transferring on its
//     own surfaces (a different false-positive shape) — the rule is re-measured per
//     room, never inherited on the exemplar's say-so (AGENTS.md, same file).
//   - + "a config marker on the same line" (the filter CoalMine tested and
//     REJECTED; CoalWash independently found it removed 48 legitimate candidates on
//     ITS surfaces): on OUR surfaces it removes 8 candidates, including the 1 false
//     positive (`agentId`). REJECTED HERE TOO, and the reason is OURS, not copied:
//     it buys removing exactly ONE one-line declaration (BLIND_KEYS' whole job) at
//     the cost of a real miss risk on the other 7 narrowed-out candidates. Declaring
//     one token in a list a human reads is cheaper than a narrowing rule that can
//     silently hide a real drift on a FUTURE candidate this measurement never saw.
//
// Residue after KEY_SHAPE: 1 token (`agentId`), declared in NOT_CONFIG below.
const KEY_SHAPE = /^[a-z][a-z0-9]*[A-Z][A-Za-z0-9]*$/;

// A key that is NAMED but not yet IMPLEMENTED — see CoalMine's config-keys.mjs for
// the full self-cleaning-rule rationale (ported verbatim as PORTABILITY above says);
// not restated here because restating it is exactly the token-tax §1 already bans.
// EMPTY TODAY, and empty is correct, not a reason to drop the mechanism (the empty
// case is a shipped, tested state — the two self-cleaning rules below still run
// against an empty object and still assert nothing has silently gone stale).
export const PENDING_KEYS = {};

// A schema key this gate's detection rule CANNOT SEE, declared with the reason it
// is accepted. MANDATORY, not optional (same rule as CoalMine's): any key in the
// schema that fails KEY_SHAPE and is NOT declared here is a hard FAIL — see
// checkConfigKeys' precondition below.
//
// THREE KEYS, not CoalMine's one and not CoalWash's five — each earns ITS OWN
// reason rather than sharing one, because they fail the shape rule for two
// DIFFERENT reasons and collapsing them into one bullet would hide that:
export const BLIND_KEYS = {
  language: 'AGENTS.md 5 Standard Systems #2 mandates it flock-wide, in every room, forever — widening KEY_SHAPE to catch a bare lowercase word was measured (on CoalMine’s surfaces) at +33 false positives, and every adopting room hits this collision on its first port by construction',
  lenses: 'an ordinary lowercase English word (also the schema’s own strArr key name, restricted to data/truth/feeling) — indistinguishable from the plain noun “lenses” in prose without the same widened-shape cost as `language`',
  rigor: 'an ordinary lowercase English word — indistinguishable from the plain noun “rigor” in prose for the identical reason; not the `rigorLensTiers` key, which fails no shape check and needs no declaration',
};

export const NOT_CONFIG = {
  agentId: 'the Claude Code platform worker identifier for a spawned lens/sub, named throughout SKILL.md and references/failure-modes.md, references/opinion-board.md, references/platform-cc.md — never a .coalboard.json key',
};

// SURFACES — chosen by MEASUREMENT, each in/out with its reason.
//   IN  skills/coalboard/SKILL.md              the agent-facing contract.
//   IN  skills/coalboard/references/*.md       WALKED (readdir), not enumerated —
//       a new reference file is covered the day it lands, no roster to keep
//       complete. Measured 7 today (audit, failure-modes, lens-prompts,
//       opinion-board, platform-antigravity, platform-cc, wizard) — a count
//       stated once here as a snapshot, never trusted forward; the wiring below
//       re-derives it live every run.
//   IN  README.md / PRIVACY.md / SECURITY.md   root docs a user actually reads;
//       an ENUMERATED roster (unlike references/), because there is no stable
//       "all our root docs" directory to walk without also picking up
//       CONTRIBUTING.md and CHANGELOG.md, the next bullet's deliberate exclusion.
//   OUT CHANGELOG.md   measured: 116 naive / 46 shaped / 22 shaped-UNRESOLVED,
//       including `callFable` and `debateTimeoutSeconds` — both RETIRED keys
//       named BY DESIGN as history, plus function names this gate has no
//       business grading (`mergeSafety`, `stripFable`, `findProjectCfg`, ...).
//       Reddening on accurate history is not merely noisy, it is WRONG — the
//       CHANGELOG's job is to record what a key once was.
//   OUT platform-configs/.coalboard.json   it IS config, already schema-validated
//       by verify.mjs's own factory-config check; scanning it would double-report
//       a key that check already owns.
//   OUT plugin/**   byte-identical twins of the SOURCE surfaces above, enforced
//       by verify.mjs's own dist-sync check. Scanning both sides doubles every
//       finding for zero added coverage.
//
// THE THREE PORT TRAPS, verified at source before this file was written (a
// straight copy of CoalMine's shape would have shipped blind on all three):
//
//   1. NO `const TRANSLATIONS`. `hook.indexOf('const TRANSLATIONS')` on
//      hooks/coalboard-conductor.js returns -1. CoalMine's noticeRegion() keys
//      entirely off that marker; ported unmodified it returns '' here, scans
//      ZERO bytes, and reports GREEN having checked nothing.
//   2. QUOTE STYLE DIFFERS AND IS MIXED. This hook's two user-facing notices are
//      emitted at `process.stdout.write(...)` call sites: one plain single-quoted
//      string, one backtick TEMPLATE LITERAL with `${...}` interpolation.
//      CoalMine's single-quote-only JS_STRING regex catches the first and MISSES
//      the second outright.
//   3. NO OBJECT-LITERAL END SENTINEL. CoalMine's region ends on the literal text
//      '\n};' (a `const X = {...};` block). This hook has no such block to bound
//      a region against — there is no region here to speak of.
//
//   SO THIS FILE LOCATES BY SITE, NOT BY REGION: find every occurrence of the
//   write-call marker (default 'process.stdout.write('), take the CALL'S OWN
//   ARGUMENT text (paren-balanced, so a nested `${reasons.join(' · ')}` does not
//   truncate the scan early), extract every quoted-literal region inside it
//   (single/double/backtick, escape-aware), strip `${...}` interpolation blocks
//   from a backtick literal BEFORE scanning it (interpolation is CODE — a
//   variable name, never a user-visible key name), then scan what remains for
//   KEY_SHAPE identifiers.
//
//   MEASURED on this hook: 3 sites (lines ~258, ~275, ~289 as of this writing),
//   1,477 bytes of argument text, ZERO shaped candidates. This is a LEGITIMATE
//   EMPTY RESULT, not a broken locator — the coverage the wiring below prints
//   (site count AND bytes, not lines: the CRITICAL-signal notice is one very
//   long line, so a line count would flatter this file) is what lets a reader
//   tell the two apart without re-deriving the numbers by hand.
//
//   NAMED LIMIT, stated rather than hidden: this scans only the write() CALL's
//   own argument text. Site 3 (`process.stdout.write(msg)`) passes a bare
//   variable — its actual message text lives in two EARLIER assignments to
//   `msg` (one double-quoted, one single-quoted-with-literal-backticks-as-
//   markdown-not-template-syntax) that this scanner never reaches, by design:
//   reaching them needs a mini dataflow trace (which assignment reached which
//   write call), a materially different and heavier mechanism than a site
//   locator, and this gate's own design principle is UNDER-FIRE BY DESIGN (a
//   miss is a bug, a flood is a dead gate — CoalMine's own comment, and it
//   transfers here unmodified). Both of `msg`'s assignments are ALSO scanned
//   directly wherever their surrounding markdown/prose is walked; this residue
//   is the hook file's own internal JS source between two write() calls, not a
//   surface this gate claims to cover.
//
// A SCHEMA-TO-DOCS LITERAL PASS was considered and rejected on the identical
// reasoning CoalMine's own comment gives (a literal built from the schema can
// only ever find keys already in the schema — it answers "is this key
// documented", never "is a named key real"); not re-derived here, see
// CoalMine's config-keys.mjs for the argument in full.
//
// STRUCTURED SURFACE (the one place shape-blindness is NOT irreducible): a key
// TABLE's first cell is a key claim by the table's OWN CONTRACT, whatever its
// shape, so this is where `lenses` and `rigor` — both BLIND_KEYS above — are
// actually caught in practice. MEASURED: README.md's "Configure" heading bounds
// a 15-line region holding exactly 7 backticked-first-cell rows — rigor,
// coalboardMode, triggerConfidence, lenses, fableConsent, consensusThreshold,
// maxRounds — all 7 resolve in the schema, zero false positives, and 2 of the 7
// (`rigor`, `lenses`) are exactly the shape-blind keys the prose rule cannot see.
const NL = String.fromCharCode(10);
const BS = String.fromCharCode(92); // a literal backslash, built not typed
const TICK = new RegExp('`([^`' + BS + 'n]+)`', 'g');
const IDENT = new RegExp(BS + 'b([a-z][a-z0-9]*[A-Z][A-Za-z0-9]*)' + BS + 'b', 'g');
// A markdown table row whose FIRST cell is a single backticked token. The pipe is
// a character class [|], not an escape -- a hand-built backslash-pipe is one
// keystroke from ALTERNATION instead of a literal (CoalMine's own recorded bug).
const ROW_KEY = new RegExp('^' + BS + 's*[|]' + BS + 's*`([^`|]+)`' + BS + 's*[|]');
// Any of the three JS string-literal forms this hook actually uses, escape-aware
// on all three so a value ending in a backslash cannot leak escape state into the
// next token (single, double, backtick -- exactly the mixed style port trap #2
// names above). Interpolation inside a backtick literal is stripped by the caller
// BEFORE the IDENT scan, never here -- this regex only finds and delimits the
// literal, it does not judge its contents.
const STR_ANY = new RegExp(
  "'((?:" + BS + BS + '.|[^\'' + BS + BS + "])*)'"
    + '|"((?:' + BS + BS + '.|[^"' + BS + BS + '])*)"'
    + '|`((?:' + BS + BS + '.|[^`' + BS + BS + '])*)`',
  'g',
);
const INTERP = new RegExp(BS + '$\\{[^}]*\\}', 'g');
const JS_ESCAPE = new RegExp(BS + BS + '[a-zA-Z]', 'g');

function candidatesInMarkdown(text) {
  const out = new Set();
  for (const m of text.matchAll(TICK)) if (KEY_SHAPE.test(m[1])) out.add(m[1]);
  return out;
}

// One write-call SITE's own argument text, paren-balanced so a nested call inside
// the argument (e.g. `${reasons.join(' · ')}`) does not truncate the scan at its
// own inner ')'. Returns null if the marker's opening '(' has no matching close
// (a malformed/edited-mid-write file) -- callers treat that as one fewer site
// found, never a crash.
function siteArgument(text, markerStart) {
  const openParen = text.indexOf('(', markerStart);
  if (openParen === -1) return null;
  let depth = 0;
  for (let i = openParen; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')') {
      depth--;
      if (depth === 0) return text.slice(openParen + 1, i);
    }
  }
  return null;
}

// Every write-call SITE in a hook file, by the literal marker (default
// 'process.stdout.write(' -- a room with a different notice call passes its own).
// Exported (unlike CoalMine's internal-only region helpers) because the wiring
// needs the SITE COUNT and BYTE TOTAL for its own coverage print -- a number this
// module computes once and the caller should never have to re-derive.
export function hookWriteSites(text, marker = 'process.stdout.write(') {
  const sites = [];
  let i = -1;
  while ((i = text.indexOf(marker, i + 1)) !== -1) {
    const arg = siteArgument(text, i);
    if (arg !== null) sites.push(arg);
  }
  return sites;
}

function candidatesInHookSites(sites) {
  const out = new Set();
  for (const site of sites) {
    for (const m of site.matchAll(STR_ANY)) {
      const isTemplate = m[3] !== undefined;
      let lit = m[1] ?? m[2] ?? m[3];
      if (isTemplate) lit = lit.replace(INTERP, ' '); // interpolation is CODE, not a key name
      const clean = lit.replace(JS_ESCAPE, ' ');
      for (const id of clean.matchAll(IDENT)) if (KEY_SHAPE.test(id[1])) out.add(id[1]);
    }
  }
  return out;
}

// Returns null when the heading itself is not found (a LOCATOR failure -- the
// heading was renamed or removed), or an array of lines (possibly empty) bounded
// between that heading and the next one at any level. The null/[] distinction is
// what lets checkConfigKeys apply ZERO-MATCHES-MUST-FAIL to a missing heading
// without also failing a heading that genuinely bounds zero rows.
function tableRegion(text, heading) {
  const lines = text.split(NL);
  const start = lines.findIndex((l) => /^#{1,6}\s/.test(l) && l.includes(heading));
  if (start === -1) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^#{1,6}\s/.test(l));
  return end === -1 ? rest : rest.slice(0, end);
}

function keysInTable(lines) {
  const out = new Set();
  for (const ln of lines) {
    const m = ROW_KEY.exec(ln);
    if (m) out.add(m[1]);
  }
  return out;
}

// findings: [{ level, msg }], same shape every other verify.mjs check returns.
// COVERAGE is a SEPARATE return field, NOT a finding -- a deliberate departure
// from CoalMine's return contract (findings-array-only), because CWK-060 asks for
// per-locator numbers verify.mjs's wiring prints every run REGARDLESS of whether
// anything failed, and folding those into `findings` would make every clean run
// emit non-SKIP entries that verify.mjs's generic SKIP-vs-fail split would read
// as failures.
// PORTABILITY: an adopting room supplies its own schemaKeys, surfaces, and
// declarations; nothing below hardcodes CoalBoard's layout.
export function checkConfigKeys({
  schemaKeys, mdFiles = [], hookFiles = [], read,
  writeSiteMarker = 'process.stdout.write(',
  keyTables = [], // [{ file, heading }]
  pending = PENDING_KEYS,
  notConfig = NOT_CONFIG,
  blind = BLIND_KEYS,
}) {
  const findings = [];
  const known = new Set(schemaKeys);

  // PRECONDITION -- a HARD GATE. Any schema key KEY_SHAPE cannot see must be
  // DECLARED in BLIND_KEYS with its reason, or this FAILs: the gate refuses to
  // run while silently checking less than it claims. A declared key STILL emits
  // a visible SKIP -- disclosure and stop are both owed, never traded for one
  // another (CoalMine's own corrected mistake, ported as the fix rather than the
  // bug).
  const invisible = [...known].filter((k) => !KEY_SHAPE.test(k)).sort();
  const accepted = invisible.filter((k) => Object.hasOwn(blind, k));
  if (accepted.length) {
    findings.push({
      level: 'SKIP',
      msg: 'blind to ' + accepted.length + ' DECLARED schema key(s) this gate cannot detect: '
        + accepted.join(', ') + ' -- named on any surface they are read and discarded, so the '
        + 'pass line above does not cover them (accepted in BLIND_KEYS)',
    });
  }
  for (const k of invisible) {
    if (Object.hasOwn(blind, k)) continue;
    findings.push({
      level: 'FAIL',
      msg: 'schema key ' + k + ' cannot be detected by this gate (it does not match the '
        + 'camelCase-with-an-internal-capital shape), so any mention of it in docs is read and '
        + 'discarded. Declare it in BLIND_KEYS with the reason it is accepted, or rename the key',
    });
  }

  const seen = new Map(); // candidate -> Set(file)
  const unreadable = [];  // a named surface we could not read
  const tableReported = new Set();
  const note = (tok, file) => {
    if (!seen.has(tok)) seen.set(tok, new Set());
    seen.get(tok).add(file);
  };

  const coverage = {
    mdFiles: { count: mdFiles.length, bytes: 0 },
    hookFiles: { count: hookFiles.length, sitesFound: 0, bytes: 0 },
    keyTables: [],
  };

  for (const f of mdFiles) {
    let text;
    try { text = read(f); } catch { unreadable.push(f); continue; } // absent surface is not a finding
    coverage.mdFiles.bytes += text.length;
    for (const tok of candidatesInMarkdown(text)) note(tok, f);
  }

  for (const f of hookFiles) {
    let text;
    try { text = read(f); } catch { unreadable.push(f); continue; }
    const sites = hookWriteSites(text, writeSiteMarker);
    coverage.hookFiles.sitesFound += sites.length;
    for (const s of sites) coverage.hookFiles.bytes += s.length;
    for (const tok of candidatesInHookSites(sites)) note(tok, f);
  }
  // ZERO-MATCHES-MUST-FAIL (hard rule, not a printed note): a hook file we could
  // READ but which yields zero write-call sites at all is a BROKEN LOCATOR, not a
  // clean scan -- the marker text changed, or the notice mechanism moved, and
  // either way this gate is now silently checking nothing. Gated on at least one
  // hook file having been successfully READ, so an empty hookFiles list (a room
  // with no hooks) or an entirely-unreadable list (already reported via the
  // declaration-pruning SKIP below) does not also trip this.
  const hookFilesRead = hookFiles.length - unreadable.filter((f) => hookFiles.includes(f)).length;
  if (hookFilesRead > 0 && coverage.hookFiles.sitesFound === 0) {
    findings.push({
      level: 'FAIL',
      msg: 'hook site locator found 0 \'' + writeSiteMarker + '\' sites across ' + hookFilesRead
        + ' successfully-read hook file(s) -- the marker text changed or the hook no longer emits '
        + 'user-facing notices; verify before trusting a clean scan (this room shipped 3 sites the '
        + 'day this gate was built)',
    });
  }

  for (const { file, heading } of keyTables) {
    let text;
    try { text = read(file); } catch { unreadable.push(file); continue; }
    const region = tableRegion(text, heading);
    // ZERO-MATCHES-MUST-FAIL, the table-region instance: the heading itself not
    // being found is a LOCATOR failure (renamed/removed heading), never a quiet
    // pass -- distinct from a FOUND heading bounding zero rows, which is a
    // content fact reported via coverage, not a hard fail.
    if (region === null) {
      findings.push({
        level: 'FAIL',
        msg: 'key table heading "' + heading + '" not found in ' + file
          + ' -- the locator is broken, or the heading was renamed/removed',
      });
      coverage.keyTables.push({ file, heading, found: false, rows: 0 });
      continue;
    }
    const rowTokens = keysInTable(region);
    coverage.keyTables.push({ file, heading, found: true, rows: rowTokens.size });
    for (const tok of rowTokens) {
      // A table row IS a mention (self-cleaning rule 2 must see it), but `note`
      // is shape-free here, so the token would ALSO reach THE CHECK below --
      // tableReported keeps one defect to one finding.
      note(tok, file);
      if (known.has(tok) || Object.hasOwn(notConfig, tok) || Object.hasOwn(pending, tok)) continue;
      tableReported.add(tok);
      findings.push({
        level: 'FAIL',
        msg: 'key table ' + file + ' (under "' + heading + '") documents ' + tok
          + ', which does not resolve in the schema -- a table row IS a key claim whatever its '
          + 'shape, so this is caught even where the prose rule is blind. Implement it, or declare '
          + 'it in PENDING_KEYS / NOT_CONFIG',
      });
    }
  }

  // THE CHECK. A named token must resolve, or be declared.
  for (const [tok, files] of [...seen].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (known.has(tok)) continue;
    if (tableReported.has(tok)) continue;
    if (Object.hasOwn(notConfig, tok)) continue;
    if (Object.hasOwn(pending, tok)) continue;
    findings.push({
      level: 'FAIL',
      msg: 'config key ' + tok + ' is named in ' + [...files].sort().join(', ') + ' but does not '
        + 'resolve in the schema -- implement it, or declare it in PENDING_KEYS (planned, with its '
        + 'ticket) or NOT_CONFIG (never a key, with its reason)',
    });
  }

  // SELF-CLEANING RULE 1 -- a declaration that is no longer true.
  for (const tok of Object.keys(pending)) {
    if (known.has(tok)) findings.push({ level: 'FAIL', msg: 'PENDING_KEYS lists ' + tok + ', but it now resolves in the schema -- implemented, so delete the entry' });
  }
  for (const tok of Object.keys(notConfig)) {
    if (known.has(tok)) findings.push({ level: 'FAIL', msg: 'NOT_CONFIG lists ' + tok + ' as never-a-config-key, but it now resolves in the schema -- the entry is a lie, delete it' });
  }
  for (const tok of Object.keys(blind)) {
    if (!known.has(tok)) {
      findings.push({ level: 'FAIL', msg: 'BLIND_KEYS declares ' + tok + ', but it is not in the schema at all -- the key is gone, delete the entry' });
    } else if (KEY_SHAPE.test(tok)) {
      findings.push({ level: 'FAIL', msg: 'BLIND_KEYS declares ' + tok + ' as undetectable, but it now matches the shape rule -- the gate can see it, delete the entry' });
    }
  }

  // SELF-CLEANING RULE 2 -- a declaration protecting nothing is dead weight.
  // GATED ON A COMPLETE SCAN: a partial scan (some named surface unreadable) may
  // not convict a declaration as dead -- it degrades to a visible SKIP, never a
  // silent pass and never a false accusation (CoalMine's own recorded lesson:
  // its fixture tests omit README.md and reddened this rule unconditionally).
  if (unreadable.length) {
    findings.push({ level: 'SKIP', msg: 'declaration-pruning not checked: ' + unreadable.length + ' named surface(s) unreadable (' + unreadable.slice(0, 3).sort().join(', ') + (unreadable.length > 3 ? ', ...' : '') + ') -- a partial scan cannot prove a declaration is dead' });
  } else {
    for (const [tok, why] of [...Object.entries(pending), ...Object.entries(notConfig)]) {
      if (!seen.has(tok)) findings.push({ level: 'FAIL', msg: 'no scanned surface names ' + tok + ' (' + why + ') -- the declaration protects nothing, delete it' });
    }
  }

  return { findings, coverage };
}
