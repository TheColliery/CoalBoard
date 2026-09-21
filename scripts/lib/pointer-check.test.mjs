// Zero-dep unit tests for scripts/lib/pointer-check.mjs (CWK-075). Drives checkPointers
// in-memory via its resolve() callback -- no tmpdir, no real git repo needed, the module's
// whole contract is a pure function over strings and a resolver it is handed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  checkPointers, pointerCandidates, looksPathShaped,
  classifyCheckIgnoreResult, applyCheckIgnoreProbe,
  DEFAULT_SURFACE_PLAN, collectSurfaces,
} from './pointer-check.mjs';

const NL = String.fromCharCode(10);

const OUR_ROOTS = new Set(['scripts', 'skills']);
const IGNORED_ROOTS = new Set(['scratchpad', 'AGENTS.md']);

function fakeResolve(states) {
  return (rel) => states[rel] ?? 'missing';
}

test('a clean surface with no citations reports zero findings', () => {
  const findings = checkPointers({
    surfaces: [{ label: 'README.md', text: 'No pointers here at all.' }],
    ourRoots: OUR_ROOTS,
    ignoredRoots: IGNORED_ROOTS,
    resolve: fakeResolve({}),
    pending: [],
  });
  assert.equal(findings.length, 0, JSON.stringify(findings));
});

test('a tracked citation is silent; an untracked one FAILs naming UNTRACKED', () => {
  const findings = checkPointers({
    surfaces: [{ label: 'README.md', text: 'See `scripts/verify.mjs` and `scripts/ghost.mjs`.' }],
    ourRoots: OUR_ROOTS,
    ignoredRoots: IGNORED_ROOTS,
    resolve: fakeResolve({ 'scripts/verify.mjs': 'tracked', 'scripts/ghost.mjs': 'untracked' }),
    pending: [],
  });
  assert.equal(findings.length, 1);
  assert.match(findings[0].msg, /scripts\/ghost\.mjs/);
  assert.match(findings[0].msg, /UNTRACKED/);
});

test('untracked vs missing produce DIFFERENT messages, not the same generic fail', () => {
  const untracked = checkPointers({
    surfaces: [{ label: 'a', text: 'See `scripts/x.mjs`.' }],
    ourRoots: OUR_ROOTS, ignoredRoots: IGNORED_ROOTS,
    resolve: fakeResolve({ 'scripts/x.mjs': 'untracked' }), pending: [],
  })[0].msg;
  const missing = checkPointers({
    surfaces: [{ label: 'a', text: 'See `scripts/x.mjs`.' }],
    ourRoots: OUR_ROOTS, ignoredRoots: IGNORED_ROOTS,
    resolve: fakeResolve({ 'scripts/x.mjs': 'missing' }), pending: [],
  })[0].msg;
  assert.notEqual(untracked, missing);
  assert.match(untracked, /UNTRACKED/);
  assert.match(missing, /does not resolve/);
});

test('the gitignored branch FAILs even though the path does not (yet) exist on disk', () => {
  const findings = checkPointers({
    surfaces: [{ label: 'CHANGELOG.md', text: 'See `scratchpad/notes.md` for the log.' }],
    ourRoots: OUR_ROOTS,
    ignoredRoots: IGNORED_ROOTS,
    resolve: fakeResolve({}), // resolve() never even needs to be asked
    pending: [],
  });
  assert.equal(findings.length, 1);
  assert.match(findings[0].msg, /gitignored `scratchpad\/`/);
});

test('the gitignored branch fires BEFORE `pending` is consulted -- a declared gitignored path still FAILs', () => {
  const findings = checkPointers({
    surfaces: [{ label: 'CHANGELOG.md', text: 'See `scratchpad/notes.md`.' }],
    ourRoots: OUR_ROOTS,
    ignoredRoots: IGNORED_ROOTS,
    resolve: fakeResolve({}),
    pending: [{ path: 'scratchpad/notes.md', reason: 'an attempted declaration -- must not launder a gitignored path' }],
  });
  assert.equal(findings.length, 1, 'pending must not excuse a gitignored citation');
  assert.match(findings[0].msg, /gitignored/);
});

test('the gitignored branch binds a historyOnly surface, while ordinary resolution does not', () => {
  const surfaces = [{
    label: 'CHANGELOG.md',
    historyOnly: true,
    text: 'Old entry cited `scratchpad/old-lab-notes.md` and `scripts/removed-tool.mjs`.',
  }];
  const findings = checkPointers({
    surfaces,
    ourRoots: OUR_ROOTS,
    ignoredRoots: IGNORED_ROOTS,
    // scripts/removed-tool.mjs no longer exists -- historyOnly means this is NOT a defect.
    resolve: fakeResolve({ 'scripts/removed-tool.mjs': 'missing' }),
    pending: [],
  });
  // Exactly one finding: the gitignored scratchpad citation. The ours-rooted-but-gone
  // scripts/removed-tool.mjs is excused by historyOnly and produces nothing.
  assert.equal(findings.length, 1);
  assert.match(findings[0].msg, /scratchpad\/old-lab-notes\.md/);
  assert.match(findings[0].msg, /gitignored/);
});

test('PENDING_KEYS-style expiry, direction 1: a pending path that NOW resolves is a lie -- FAIL', () => {
  const findings = checkPointers({
    surfaces: [{ label: 'a', text: 'See `scripts/new-thing.mjs`.' }],
    ourRoots: OUR_ROOTS,
    ignoredRoots: IGNORED_ROOTS,
    resolve: fakeResolve({ 'scripts/new-thing.mjs': 'tracked' }), // it landed
    pending: [{ path: 'scripts/new-thing.mjs', reason: 'CWK-000 -- landing next unit' }],
  });
  assert.ok(findings.some((f) => /now resolves/.test(f.msg)));
});

test('expiry, direction 2: a pending path no in-scope surface cites is dead weight -- FAIL', () => {
  const findings = checkPointers({
    surfaces: [{ label: 'a', text: 'Nothing relevant here.' }],
    ourRoots: OUR_ROOTS,
    ignoredRoots: IGNORED_ROOTS,
    resolve: fakeResolve({}), // still missing, so the first branch does not fire
    pending: [{ path: 'scripts/never-mentioned.mjs', reason: 'stale declaration' }],
  });
  assert.ok(findings.some((f) => /no in-scope surface cites it/.test(f.msg)));
});

test('a pending declaration that is genuinely still pending and still cited stays silent', () => {
  const findings = checkPointers({
    surfaces: [{ label: 'a', text: 'See `scripts/future-thing.mjs` (landing soon).' }],
    ourRoots: OUR_ROOTS,
    ignoredRoots: IGNORED_ROOTS,
    resolve: fakeResolve({ 'scripts/future-thing.mjs': 'missing' }),
    pending: [{ path: 'scripts/future-thing.mjs', reason: 'CWK-000 -- landing next unit' }],
  });
  assert.equal(findings.length, 0, JSON.stringify(findings));
});

test('a pending entry with no reason FAILs -- an allowlist of bare strings is a bypass with no author', () => {
  const findings = checkPointers({
    surfaces: [{ label: 'a', text: 'See `scripts/future-thing.mjs`.' }],
    ourRoots: OUR_ROOTS,
    ignoredRoots: IGNORED_ROOTS,
    resolve: fakeResolve({ 'scripts/future-thing.mjs': 'missing' }),
    pending: [{ path: 'scripts/future-thing.mjs' }],
  });
  assert.ok(findings.some((f) => /no reason/.test(f.msg)));
});

test('an unreadable surface reports a SKIP, never a silent pass', () => {
  const findings = checkPointers({
    surfaces: [{ label: 'ghost.md', text: undefined }],
    ourRoots: OUR_ROOTS,
    ignoredRoots: IGNORED_ROOTS,
    resolve: fakeResolve({}),
    pending: [],
  });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].level, 'SKIP');
  assert.match(findings[0].msg, /could not read ghost\.md/);
});

test('a path into someone else\'s tree (not ours, not ignored) is silently out of scope', () => {
  const findings = checkPointers({
    surfaces: [{ label: 'a', text: 'The user\'s own `platform-configs/other.json` lives there.' }],
    ourRoots: OUR_ROOTS,
    ignoredRoots: IGNORED_ROOTS,
    resolve: fakeResolve({}), // resolve() must never even be consulted for this token
    pending: [],
  });
  assert.equal(findings.length, 0, JSON.stringify(findings));
});

test('pointerCandidates: a bare filename (no directory component) is dropped', () => {
  assert.deepEqual(pointerCandidates('See `SKILL.md` for the contract.'), []);
});

test('pointerCandidates: a bare dot-FILE (no directory component) is dropped -- the no-slash rule, not a dot-dir rule', () => {
  assert.deepEqual(pointerCandidates('The user\'s own `.coalboard.json` lives in their project.'), []);
});

test('pointerCandidates: a multi-segment dot-dir token now SURVIVES extraction (CWK-077) -- admission is checkPointers()\'s job, not the extractor\'s', () => {
  assert.deepEqual(pointerCandidates('See `.claude-plugin/plugin.json` for the version.'), ['.claude-plugin/plugin.json']);
});

test('pointerCandidates: a command or table row (has whitespace) is not a pointer', () => {
  assert.deepEqual(pointerCandidates('Run `node scripts/verify.mjs now`.'), []);
});

test('pointerCandidates: a <placeholder> is not a literal path', () => {
  assert.deepEqual(pointerCandidates('See `plugin/skills/<name>/SKILL.md`.'), []);
});

test('pointerCandidates: a glob names a set, not a file', () => {
  assert.deepEqual(pointerCandidates('Every `scripts/*.mjs` file.'), []);
});

test('pointerCandidates: an absolute path, ~, and a URL are all out of scope', () => {
  assert.deepEqual(pointerCandidates('See `/etc/passwd`, `~/notes.md`, `https://example.com/x/y`.'), []);
});

test('pointerCandidates: a real repo-rooted path with a directory component survives', () => {
  assert.deepEqual(pointerCandidates('See `scripts/lib/pointer-check.mjs` for the rule.'), ['scripts/lib/pointer-check.mjs']);
});

test('normalise: a trailing line-range suffix and a trailing slash are stripped before resolving', () => {
  const seen = [];
  const findings = checkPointers({
    surfaces: [{ label: 'a', text: 'See `scripts/verify.mjs:12-40` and `scripts/lib/`.' }],
    ourRoots: OUR_ROOTS,
    ignoredRoots: IGNORED_ROOTS,
    resolve: (rel) => { seen.push(rel); return 'tracked'; },
    pending: [],
  });
  assert.equal(findings.length, 0, JSON.stringify(findings));
  assert.ok(seen.includes('scripts/verify.mjs'), 'the :12-40 suffix must be stripped before resolve() is called');
  assert.ok(seen.includes('scripts/lib'), 'the trailing slash must be stripped before resolve() is called');
});

test('a fenced code block is an EXAMPLE, not a ship-text claim -- its backticked content is not scanned', () => {
  const text = [
    'Prose citing `scripts/real.mjs`.',
    '```',
    'See `scripts/fake-in-code-block.mjs` -- this is illustrative code, not a claim.',
    '```',
  ].join('\n');
  const findings = checkPointers({
    surfaces: [{ label: 'a', text }],
    ourRoots: OUR_ROOTS,
    ignoredRoots: IGNORED_ROOTS,
    resolve: fakeResolve({ 'scripts/real.mjs': 'tracked' }),
    pending: [],
  });
  assert.equal(findings.length, 0, JSON.stringify(findings));
});

// CWK-077 item 2 -- a `.`/`..` path segment must never reach resolve() verbatim, or a
// caller's own path.join(root, rel) can escape the repo root and resolve against a REAL
// sibling room's file (a false "exists here but is UNTRACKED" claim about another tree).

test('a `.` or `..` path segment is rejected before resolution -- resolve() is never called, for any of the four shapes', () => {
  const cases = [
    'scripts/../../../etc/passwd',
    'scripts/../../CoalMine/MEMORY.md',
    'scripts/./lib/pointer-check.mjs',
    'scripts/lib/../lib/pointer-check.mjs',
  ];
  for (const tok of cases) {
    let resolveCalled = false;
    const findings = checkPointers({
      surfaces: [{ label: 'a', text: `See \`${tok}\`.` }],
      ourRoots: OUR_ROOTS,
      ignoredRoots: IGNORED_ROOTS,
      resolve: () => { resolveCalled = true; return 'tracked'; },
      pending: [],
    });
    assert.equal(findings.length, 1, tok);
    assert.match(findings[0].msg, /path segment -- rejected/, tok);
    assert.equal(resolveCalled, false, `resolve() must never be called for ${tok}`);
  }
});

// CWK-077 findings-back -- a `/`-only segment-whole scan cannot see a BACKSLASH-delimited
// segment: `scripts/..<BS>..<BS>escape.md` splits on `/` into two pieces, neither exactly
// `..`, so the dot-segment check above never fires; and a token with a backslash BEFORE its
// first real `/` mis-splits `first` into something that never matches a real root, so it was
// previously dropped SILENTLY rather than named. The backslash is built with
// String.fromCharCode(92), not typed literally -- this room's own recorded lesson about a
// bash heredoc eating a literal backslash on write.

test('a backslash anywhere in the token is rejected outright, before any classification -- resolve() is never called (both the escaping and the silently-skipped shape)', () => {
  const BS = String.fromCharCode(92);
  const cases = [
    `scripts/..${BS}..${BS}escape.md`, // the escaping shape -- would resolve OUTSIDE the repo root
    `scripts${BS}lib/x.mjs`,           // the previously-QUIET shape -- mis-split `first` never matched ourRoots
  ];
  for (const tok of cases) {
    let resolveCalled = false;
    const findings = checkPointers({
      surfaces: [{ label: 'a', text: `See \`${tok}\`.` }],
      ourRoots: OUR_ROOTS,
      ignoredRoots: IGNORED_ROOTS,
      resolve: () => { resolveCalled = true; return 'tracked'; },
      pending: [],
    });
    assert.equal(findings.length, 1, tok);
    assert.match(findings[0].msg, /contains a backslash -- rejected/, tok);
    assert.equal(resolveCalled, false, `resolve() must never be called for ${tok}`);
  }
});

test('a `/`-only citation with no backslash is unaffected -- still resolves normally', () => {
  const findings = checkPointers({
    surfaces: [{ label: 'a', text: 'See `scripts/lib/pointer-check.mjs`.' }],
    ourRoots: OUR_ROOTS,
    ignoredRoots: IGNORED_ROOTS,
    resolve: fakeResolve({ 'scripts/lib/pointer-check.mjs': 'tracked' }),
    pending: [],
  });
  assert.equal(findings.length, 0, JSON.stringify(findings));
});

test('a legitimate ..-containing NAME (not a whole segment) still resolves normally -- segment-WHOLE, never substring', () => {
  const findings = checkPointers({
    surfaces: [{ label: 'a', text: 'See `scripts/..foo/x.mjs`.' }],
    ourRoots: OUR_ROOTS,
    ignoredRoots: IGNORED_ROOTS,
    resolve: fakeResolve({ 'scripts/..foo/x.mjs': 'tracked' }),
    pending: [],
  });
  assert.equal(findings.length, 0, JSON.stringify(findings));
});

// CWK-077 item 3 -- a dot-dir root is admitted only when it is not `.github` AND resolve()
// itself reports the root TRACKED; `ourRoots` never contains a dot-dir (CWK-078), so this
// carve-out cannot go through `ourRoots` membership at all.

test('a tracked dot-dir root (not .github) is admitted -- resolve() then decides tracked/untracked/missing exactly like an ordinary path', () => {
  const findings = checkPointers({
    surfaces: [{ label: 'a', text: 'See `.claude-plugin/plugin.json` and `.claude-plugin/ghost.json`.' }],
    ourRoots: OUR_ROOTS,
    ignoredRoots: IGNORED_ROOTS,
    resolve: fakeResolve({
      '.claude-plugin': 'tracked',
      '.claude-plugin/plugin.json': 'tracked',
      '.claude-plugin/ghost.json': 'missing',
    }),
    pending: [],
  });
  assert.equal(findings.length, 1);
  assert.match(findings[0].msg, /\.claude-plugin\/ghost\.json/);
  assert.match(findings[0].msg, /does not resolve/);
});

test('`.github` stays excluded by name -- resolve() is never even asked whether the root itself is tracked', () => {
  let rootQueried = false;
  const findings = checkPointers({
    surfaces: [{ label: 'a', text: 'See `.github/workflows/ci.yml`.' }],
    ourRoots: OUR_ROOTS,
    ignoredRoots: IGNORED_ROOTS,
    resolve: (rel) => { if (rel === '.github') rootQueried = true; return 'tracked'; },
    pending: [],
  });
  assert.equal(findings.length, 0, JSON.stringify(findings));
  assert.equal(rootQueried, false, '.github must be excluded before resolve() is ever asked about the root');
});

test('a dot-dir root that is NOT tracked (and is not .github) is silently out of scope -- a shipped doc describing the SCANNED USER\'s own runtime convention', () => {
  const findings = checkPointers({
    surfaces: [{ label: 'a', text: 'The board plants `.coalboard/proposed/` in the user\'s own project.' }],
    ourRoots: OUR_ROOTS,
    ignoredRoots: IGNORED_ROOTS,
    resolve: fakeResolve({}), // '.coalboard' never resolves as tracked
    pending: [],
  });
  assert.equal(findings.length, 0, JSON.stringify(findings));
});

test('a bare `./`-relative token is silently out of scope, same as before this ticket -- never a dot-dir root candidate', () => {
  const findings = checkPointers({
    surfaces: [{ label: 'a', text: 'Mechanism lives in `./lib/derive-roots.mjs`.' }],
    ourRoots: OUR_ROOTS,
    ignoredRoots: IGNORED_ROOTS,
    resolve: () => 'tracked', // must never matter -- '.' is never admitted as a root
    pending: [],
  });
  assert.equal(findings.length, 0, JSON.stringify(findings));
});

// CWK-077 findings-back round 2, MEDIUM-3 -- the SAME dot-dir root cited from TWO different
// surfaces (via two different files, so the per-surface `seen` set cannot dedupe the TOKEN)
// must call resolve() for the root at most ONCE per checkPointers() run. `.github` never
// calls resolve() at all, per the existing exclusion test above -- proven again here inside
// a run that also exercises a real memoized root, so a future regression to "always call
// resolve()" cannot hide behind a run where `.github` was the only root present.
test('MEDIUM-3: the dot-dir root probe is memoized -- resolve() is called at most once per root name, however many citations or surfaces name it', () => {
  const resolveCalls = {};
  const resolve = (rel) => {
    resolveCalls[rel] = (resolveCalls[rel] || 0) + 1;
    if (rel === '.claude-plugin' || rel === '.claude-plugin/plugin.json' || rel === '.claude-plugin/marketplace.json') return 'tracked';
    return 'missing';
  };
  const findings = checkPointers({
    surfaces: [
      { label: 'a', text: 'See `.claude-plugin/plugin.json` and `.github/workflows/ci.yml`.' },
      { label: 'b', text: 'Also `.claude-plugin/marketplace.json` and `.coalboard/proposed/x.md`.' },
    ],
    ourRoots: OUR_ROOTS,
    ignoredRoots: IGNORED_ROOTS,
    resolve,
    pending: [],
  });
  assert.equal(findings.length, 0, JSON.stringify(findings));
  assert.equal(resolveCalls['.claude-plugin'], 1, 'the root probe must fire once, not once per citing surface');
  assert.equal(resolveCalls['.github'], undefined, '.github must never be probed at all');
  assert.equal(resolveCalls['.coalboard'], 1, 'an untracked root is still probed exactly once, not once per citation');

  const dc = findings.dotDirCoverage;
  assert.equal(dc.rootsSeen, 3, JSON.stringify(dc));           // .claude-plugin, .github, .coalboard
  assert.equal(dc.rootsProbed, 2, JSON.stringify(dc));         // .github excluded before any probe
  assert.deepEqual(dc.rootsAdmitted, ['.claude-plugin'], JSON.stringify(dc));
  assert.equal(dc.citationsCited, 2, JSON.stringify(dc));      // the two .claude-plugin file citations
  assert.equal(dc.citationsChecked, 2, JSON.stringify(dc));    // neither surface is historyOnly
});

// looksPathShaped (CWK-079) -- feeds ONLY verify.mjs's ignore-probe candidate-root
// derivation, never checkPointers' own judgement. Exhibits are this room's own, measured
// against the real gate's own surface walk: an arithmetic ratio, two rule-force words, a
// lens-name pair, a CI class label, and a model-tier list all reach the ignore-probe's
// first-segment derivation with no path in them at all.
test('looksPathShaped rejects this room\'s own non-path exhibits', () => {
  for (const tok of ['chars/4', 'prefer/should', 'sub4/observer', 'js/unused-local-variable', 'haiku/sonnet/opus/fable', '0.01/KLOC']) {
    assert.equal(looksPathShaped(tok), false, `${tok} is not a path and must not reach the probe`);
  }
});

test('looksPathShaped accepts a filename-shaped path, incl. one with a :line ref', () => {
  for (const tok of ['scripts/lib/pointer-check.mjs', 'docs/x.md:12', 'commands/stats.md:12']) {
    assert.equal(looksPathShaped(tok), true, `${tok} is filename-shaped and must still reach the probe`);
  }
});

test('looksPathShaped accepts an explicit trailing-slash directory reference', () => {
  for (const tok of ['scripts/lib/', 'skills/coalboard/references/']) {
    assert.equal(looksPathShaped(tok), true, `${tok} ends in / and must still reach the probe`);
  }
});

// THE RESIDUE, both directions, pinned so a future edit cannot silently narrow or widen it
// without this test noticing -- named, not hidden, per pointer-check.mjs's own comment.
test('looksPathShaped residue: a trailing-slash token is accepted with no check on what precedes it', () => {
  assert.equal(looksPathShaped('os.tmpdir()/coalboard/'), true,
    'a function call ending in / still passes -- harmless in practice, named as residue');
});

test('looksPathShaped residue: an extensionless real path with no trailing slash is discovery-excluded', () => {
  assert.equal(looksPathShaped('scripts/lib'), false,
    'reverts to the OLD silent-discovery miss for this one shape -- non-local judgement (below) still covers it');
});

// ============================================================================
// classifyCheckIgnoreResult (CWK-090 fix a) -- the batched `git check-ignore --stdin`
// spawn's classification, pulled out pure so it is testable without fighting the OS to
// force a specific exit code through verify.mjs's own hardcoded args. Every
// non-synthetic case below feeds the function a `ci` object taken from a REAL
// `git check-ignore --stdin` child process, never a hand-typed fake -- only the
// spawn-error case (git missing entirely) has no real subprocess to source from, since a
// missing git never reaches this call in production (verify.mjs's own `ls-files`
// pre-gate already SKIPs before this spawn fires).
function mkGitRepoForIgnoreProbe() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-ci-classify-'));
  const g = (args) => spawnSync('git', args, { cwd: tmp, encoding: 'utf8' });
  g(['init', '-q', '-b', 'main']);
  g(['config', 'user.email', 'test@test.invalid']);
  g(['config', 'user.name', 'Test']);
  g(['config', 'commit.gpgsign', 'false']);
  fs.writeFileSync(path.join(tmp, 'x.txt'), 'x');
  fs.writeFileSync(path.join(tmp, '.gitignore'), 'ignored-dir/' + NL);
  g(['add', '-A']);
  g(['commit', '-q', '-m', 'baseline']);
  return tmp;
}

// THE PRE-FIX LOGIC, byte-copied from this room's own `git show HEAD:scripts/verify.mjs`
// at the moment this fix started (only `!ci.error` gated the "read stdout" branch).
// Replayed against a REAL non-0/1 result below to show what it actually did: nothing --
// any status other than a spawn error fell through and silently produced zero ignored
// roots.
function preFixLogic(ci) {
  const ignored = new Set();
  if (!ci.error && typeof ci.stdout === 'string') {
    for (const line of ci.stdout.split('\n')) {
      const t = line.trim();
      if (t) ignored.add(t.replace(/\/$/, ''));
    }
  }
  return ignored;
}

// UMB-133 r5 (CI run 35656824596, ubuntu/node 24 only, then re-owed since UMB-124): `git check-ignore
// --stdin --bogus-flag` REJECTS the flag and can exit BEFORE draining stdin. Whether spawnSync's write of
// the input reaches a live reader is a RACE, and it has TWO real terminal shapes, both reachable on a
// supported platform:
//   (status-only) git drained stdin or spawnSync finished writing first -> { status: 129, error: undefined }
//   (error-set)   git exited first -> spawnSync's write fails (EPIPE on POSIX, EOF on Windows) ->
//                 { error: <set>, status: 129 } -- MEASURED here: status is STILL 129 alongside the error,
//                 not null, and classifyCheckIgnoreResult takes its spawn-error branch FIRST by design.
// Both are non-0/1 runs the gate must fail closed on. The old test pinned only the first spelling
// (/exited 129/), so it was a coin flip that only landed on the second shape under load. The invariant is
// asserted below over BOTH shapes, keyed on WHICH one occurred (never an ||-regex that would also pass if the
// classifier returned the WRONG branch), and each shape is FORCED by construction in its own test rather
// than waited for. Nothing here skips, retries or tolerates a shape as "inconclusive".
function assertFailClosedVerdict(ci) {
  const verdict = classifyCheckIgnoreResult(ci);
  assert.equal(verdict.ok, false, 'a non-0/1 real git run is a FAIL in BOTH terminal shapes -- this leg never branches');
  if (ci.error) {
    assert.ok(verdict.message.includes('failed to spawn: ' + ci.error.message),
      'error-set shape: the message names the spawn error itself, got: ' + verdict.message);
    assert.doesNotMatch(verdict.message, /exited/, 'error-set shape must take the spawn-error branch, not the exit-status one');
  } else {
    assert.match(verdict.message, new RegExp('exited ' + ci.status),
      'status-only shape: the message names the exit status, got: ' + verdict.message);
    assert.doesNotMatch(verdict.message, /failed to spawn/, 'status-only shape must take the exit-status branch, not the spawn-error one');
  }
  return verdict;
}

// RED, against the pre-fix logic, replayed on a REAL failing run. Only meaningful in the status-only shape:
// preFixLogic gated on `!ci.error`, so in the error-set shape it returns [] for a reason that has nothing
// to do with the bug. The status-only test below asserts that precondition explicitly.
function assertPreFixFailedOpen(ci) {
  assert.deepEqual([...preFixLogic(ci)], [],
    'the pre-fix logic (only checking ci.error) silently produces an empty ignoredRoots on a real non-0/1 exit -- this IS the bug');
}

test('classifyCheckIgnoreResult: a REAL git check-ignore --stdin exit other than 0/1 (an unknown-option 129) is a FAIL -- whichever terminal shape the stdin race lands on', () => {
  const tmp = mkGitRepoForIgnoreProbe();
  try {
    const ci = spawnSync('git', ['check-ignore', '--stdin', '--bogus-flag-xyz'],
      { cwd: tmp, encoding: 'utf8', input: 'ignored-dir/probe\n' });
    assert.notEqual(ci.status, 0, 'this probe only proves anything if git actually took a non-0/1 exit');
    assert.notEqual(ci.status, 1, 'this probe only proves anything if git actually took a non-0/1 exit');
    assertPreFixFailedOpen(ci);
    assertFailClosedVerdict(ci); // the naturally racy run: either shape is legitimate, both are asserted
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('classifyCheckIgnoreResult: FORCED status-only shape (stdin not connected) -- exit 129 is a FAIL naming the status, and the pre-fix logic failed open on it', () => {
  const tmp = mkGitRepoForIgnoreProbe();
  try {
    // stdio[0] = 'ignore': spawnSync never writes to git's stdin at all, so no EPIPE is possible.
    const ci = spawnSync('git', ['check-ignore', '--stdin', '--bogus-flag-xyz'],
      { cwd: tmp, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    assert.equal(ci.error, undefined, 'fixture precondition: this shape carries NO spawn error');
    assert.equal(ci.status, 129, 'fixture precondition: git rejected the unknown option with 129');
    assertPreFixFailedOpen(ci); // here the replay proves the ORIGINAL bug: no error to short-circuit it, yet nothing ignored
    const verdict = assertFailClosedVerdict(ci);
    assert.match(verdict.message, /exited 129/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('classifyCheckIgnoreResult: FORCED error-set shape (input far past the pipe buffer, git exits first) -- a spawn error is a FAIL naming that error', () => {
  const tmp = mkGitRepoForIgnoreProbe();
  try {
    // ~4 MB of input against a git that rejects its flag and exits without reading: the write cannot complete
    // into a pipe buffer orders of magnitude smaller, so the child closing its end surfaces as the spawn error
    // (EPIPE on POSIX, EOF on Windows). A fixture failure to reach this shape is a LOUD failure, never a skip.
    const big = ('x/' + 'a'.repeat(200) + '\n').repeat(20000);
    const ci = spawnSync('git', ['check-ignore', '--stdin', '--bogus-flag-xyz'],
      { cwd: tmp, encoding: 'utf8', input: big, maxBuffer: 1 << 26 });
    assert.ok(ci.error, 'fixture precondition: a 4 MB write to a git that exited without reading must surface as a spawn error');
    assertFailClosedVerdict(ci);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('classifyCheckIgnoreResult: a REAL exit 0 (a fed path IS ignored) succeeds, stdout carries the match', () => {
  const tmp = mkGitRepoForIgnoreProbe();
  try {
    const ci = spawnSync('git', ['check-ignore', '--stdin'],
      { cwd: tmp, encoding: 'utf8', input: 'ignored-dir/probe\n' });
    assert.equal(ci.status, 0);
    const verdict = classifyCheckIgnoreResult(ci);
    assert.equal(verdict.ok, true);
    assert.match(verdict.stdout, /ignored-dir/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('classifyCheckIgnoreResult: a REAL exit 1 (nothing fed is ignored) succeeds -- 1 is not an error', () => {
  const tmp = mkGitRepoForIgnoreProbe();
  try {
    const ci = spawnSync('git', ['check-ignore', '--stdin'],
      { cwd: tmp, encoding: 'utf8', input: 'not-ignored-at-all/probe\n' });
    assert.equal(ci.status, 1);
    const verdict = classifyCheckIgnoreResult(ci);
    assert.equal(verdict.ok, true);
    assert.equal(verdict.stdout.trim(), '');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('classifyCheckIgnoreResult: a genuine spawn error (git missing) is a FAIL naming the error message', () => {
  const verdict = classifyCheckIgnoreResult({ error: new Error('spawn git ENOENT'), status: null, stdout: null, stderr: null });
  assert.equal(verdict.ok, false);
  assert.match(verdict.message, /failed to spawn: spawn git ENOENT/);
});

// applyCheckIgnoreProbe -- built PROACTIVELY in this DI shape (never the naive inline
// `if (!verdict.ok)` at the call site), specifically because CoalMine's own history shows
// that shape is untestable-by-mutation: their reviewer mutated the equivalent condition
// to `if (false)` and their whole suite stayed byte-identically green, since nothing
// exercised the branch outside the real gate's own run. Proven here the same way --
// mutate the SAME condition inside this function and watch a dedicated test go RED.
test('applyCheckIgnoreProbe: a non-0/1 verdict calls fail() and leaves ignoredRoots empty -- WIRING, not just classification', () => {
  const failed = [];
  const fail = (msg) => failed.push(msg);
  const ignoredRoots = new Set();
  applyCheckIgnoreProbe({
    toProbe: ['totally-fake-root'],
    PROBE_SUFFIX: '/.pointer-check-probe',
    ignoredRoots,
    fail,
    runCheckIgnore: () => ({ status: 128, stderr: 'fatal: bad pattern', stdout: '' }),
  });
  assert.equal(failed.length, 1, 'fail() must be called exactly once');
  assert.match(failed[0], /exited 128/);
  assert.equal(ignoredRoots.size, 0, 'a run that answered nothing must record zero ignored roots');
});

test('applyCheckIgnoreProbe: an ok verdict records the recovered root, stripped of its probe suffix', () => {
  const fail = () => { throw new Error('fail() must not be called on an ok verdict'); };
  const ignoredRoots = new Set();
  applyCheckIgnoreProbe({
    toProbe: ['dist'],
    PROBE_SUFFIX: '/.pointer-check-probe',
    ignoredRoots,
    fail,
    runCheckIgnore: () => ({ status: 0, stdout: 'dist/.pointer-check-probe\n', stderr: '' }),
  });
  assert.deepEqual([...ignoredRoots], ['dist']);
});

test('applyCheckIgnoreProbe: an empty toProbe list never spawns and never fails', () => {
  const fail = () => { throw new Error('fail() must not be called'); };
  const ignoredRoots = new Set();
  let spawned = false;
  applyCheckIgnoreProbe({
    toProbe: [],
    PROBE_SUFFIX: '/.pointer-check-probe',
    ignoredRoots,
    fail,
    runCheckIgnore: () => { spawned = true; return { status: 0, stdout: '', stderr: '' }; },
  });
  assert.equal(spawned, false);
  assert.equal(ignoredRoots.size, 0);
});

// ============================================================================
// DEFAULT_SURFACE_PLAN + collectSurfaces (CWK-090 fix c) -- the walked-surface assembly,
// DECLARED as data instead of verify.mjs's own five-piece array-literal/loop
// construction. Tested purely, with a fake in-memory `io` -- no real filesystem, so this
// exercises the plan/collector contract directly rather than re-proving verify.mjs's own
// wiring (verify.test.mjs's own end-to-end fixtures cover that).
test('DEFAULT_SURFACE_PLAN: every row has a non-empty why, and dir rows resolve to a real kind', () => {
  for (const row of DEFAULT_SURFACE_PLAN) {
    assert.equal(typeof row.why, 'string');
    assert.ok(row.why.length > 0, 'a declared row without a why is the same defect as no declaration at all');
    assert.ok(['raw', 'md', 'comments'].includes(row.kind), `unknown kind '${row.kind}'`);
    if (row.dir) assert.ok(row.kind === 'md' || row.kind === 'comments', 'a dir row must be md or comments');
  }
});

test('DEFAULT_SURFACE_PLAN: the shipped default declares the scripts/lib comments row as its OWN row, not folded into scripts/ (this room\'s walk is flat, never recursive)', () => {
  const scriptsRow = DEFAULT_SURFACE_PLAN.find((r) => r.kind === 'comments' && r.root === 'scripts');
  const libRow = DEFAULT_SURFACE_PLAN.find((r) => r.kind === 'comments' && r.root === 'scripts/lib');
  assert.ok(scriptsRow, 'the scripts comments row must exist');
  assert.ok(libRow, 'the scripts/lib comments row must exist as its own row -- a recursive walk would fold it into scripts/ and this ticket\'s surface-identity proof would break');
});

function fakeIo(files) {
  const commentLines = (src) => src.split('\n').filter((l) => /^\s*(\/\/|\*)/.test(l)).join('\n');
  return {
    join: (a, b) => `${a}/${b}`,
    read: (p) => (files.has(p) ? files.get(p) : null),
    rel: (p) => p.replace(/^REPO\//, ''),
    commentLines,
    walkMd: (dir) => [...files.keys()].filter((p) => p.startsWith(dir + '/') && p.endsWith('.md') && !p.slice(dir.length + 1).includes('/')),
    walkSrc: (dir, keep) => [...files.keys()].filter((p) => p.startsWith(dir + '/') && !p.slice(dir.length + 1).includes('/') && keep(p.slice(p.lastIndexOf('/') + 1))),
  };
}

test('collectSurfaces + checkPointers: a citation reachable ONLY through the scripts comments row FAILs under the default plan and is unseen -- not just un-failing -- once that row is narrowed away', () => {
  // The fixture's own comment marker is built from PARTS, deliberately: a literal
  // double-slash immediately followed by a backticked path, sitting in THIS file's own
  // raw source text, would itself become a candidate the real gate's comment scan
  // extracts (that scan is not comment-anchored -- it matches a double slash anywhere on
  // a line) -- this room's own scans-itself trap, this module's header already names for
  // its own backticked examples elsewhere.
  const ghostLine = '/' + '/' + ' see `scripts/ghost-target.md` for the real shape';
  const files = new Map([
    // The ghost citation lives ONLY inside a comment line, in a file the `scripts`
    // comments row is the sole reader of (the sibling `scripts/lib` row has a DIFFERENT
    // root, so it never sees a file directly under `scripts/`).
    ['REPO/scripts/foo.mjs', ghostLine + '\nconst x = 1;\n'],
  ]);
  const io = fakeIo(files);
  const resolveAlwaysMissing = () => 'missing';
  const opts = { ourRoots: new Set(['scripts']), ignoredRoots: new Set(), resolve: resolveAlwaysMissing };

  // RED against the DEFAULT plan first: the citation is read and genuinely FAILs.
  const defaultSurfaces = collectSurfaces('REPO', DEFAULT_SURFACE_PLAN, io);
  const scriptsSurface = defaultSurfaces.find((s) => s.label === 'scripts/foo.mjs');
  assert.ok(scriptsSurface, 'the scripts comments row must have surfaced scripts/foo.mjs under the default plan');
  assert.match(scriptsSurface.text, /ghost-target\.md/, 'the comment line carrying the citation must be included, not stripped');
  const defaultFindings = checkPointers({ surfaces: defaultSurfaces, ...opts });
  assert.ok(defaultFindings.some((f) => f.level === 'FAIL' && f.msg.includes('ghost-target.md')),
    'the default plan must catch the dead citation -- this is the RED case, proven before narrowing');

  // Now narrow: delete the scripts comments row, per the module's own narrowing form
  // ("a room that walks fewer surfaces deletes the row ... never by editing the walk").
  const narrowed = DEFAULT_SURFACE_PLAN.filter((r) => !(r.kind === 'comments' && r.root === 'scripts'));
  const narrowedSurfaces = collectSurfaces('REPO', narrowed, io);
  assert.ok(!narrowedSurfaces.some((s) => s.label === 'scripts/foo.mjs'),
    'scripts/foo.mjs must not be surfaced at all once its only reading row is deleted -- narrowing stops the READ, not merely the verdict');
  const narrowedFindings = checkPointers({ surfaces: narrowedSurfaces, ...opts });
  assert.ok(!narrowedFindings.some((f) => f.msg.includes('ghost-target.md')),
    'the same citation that FAILed under the default plan must produce no finding at all under the narrowed one');
});
