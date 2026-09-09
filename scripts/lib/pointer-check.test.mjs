// Zero-dep unit tests for scripts/lib/pointer-check.mjs (CWK-075). Drives checkPointers
// in-memory via its resolve() callback -- no tmpdir, no real git repo needed, the module's
// whole contract is a pure function over strings and a resolver it is handed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkPointers, pointerCandidates } from './pointer-check.mjs';

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
