// Hermetic spawn tests for scripts/verify.mjs (CWK-078) -- the gate has no per-item report
// contract to unit-test in isolation (it operates on THIS repo's own tree, not a parameter),
// so its two new derivation properties are proven the way node/runtime.md's own testing
// convention asks for a gate/CLI entry: spawn the real file, assert exit code and the
// sanctioned-output shape. Every mutation is reverted in a finally block; nothing here
// leaves the tree touched on either the pass or the fail path.
//
// NOT tested here: whether a hidden entry (the `.github` shape) can ever enter ourRoots.
// That property is unobservable through this file's own end-to-end behaviour -- a hidden
// token is dropped by pointerCandidates()'s dot-dir filter BEFORE ourRoots is ever
// consulted (pointer-check.mjs's blind spot 1), so a spawn-and-grep test asserting the gate
// "still passes" with a `.github/...` citation planted would pass identically whether the
// derivation's own hidden-entry filter is correct OR broken -- a vacuous test wearing a
// real one's name (findings-back on CWK-078, self-caught before shipping). The actual
// membership property is unit-tested directly against `deriveRootSets`'s return value in
// `scripts/lib/derive-roots.test.mjs`, which is the only place it is genuinely observable.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { deriveRootSets } from './lib/derive-roots.mjs';
import { checkPointers, pointerCandidates, looksPathShaped } from './lib/pointer-check.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const verifyPath = path.join(root, 'scripts', 'verify.mjs');
const NL = String.fromCharCode(10);

function runVerify(env) {
  return spawnSync(process.execPath, [verifyPath], { cwd: root, env: env ?? process.env, encoding: 'utf8' });
}

test('pointer check root-derivation degrades to a named SKIP, never a FAIL, when git is unavailable', () => {
  // pcResolve(), deriveRootSets(), and the CWK-079 candidateRoots ignore-probe are the only
  // things that shell out to git in this file (grep-confirmed) -- but the candidateRoots
  // probe sits behind `if (!pcRoots.ok)`, so an unreachable git never lets it run in the
  // first place; pointing PATH at an EMPTY directory makes both of the FIRST two unreachable,
  // which is exactly the
  // condition this test exists to exercise, without touching anything else the gate checks.
  //
  // A NAME-FILTER on the real PATH's entries (`.filter(p => !/git/i.test(p))`) was tried
  // first and is WRONG -- a platform-shaped heuristic standing in for a capability probe
  // (node/runtime.md §4's own class). `C:\Program Files\Git\cmd` matches `/git/i` and
  // disappears; POSIX git lives at `/usr/bin/git`, and `/usr/bin` does not match `/git/i` --
  // so the filter hid git on Windows and left it fully reachable on ubuntu/macOS, and this
  // test passed on the one OS it was authored on while failing on the other two in CI
  // (CWK-078 RED round 3). An empty directory has no name to dodge and is unreachable the
  // same way on every OS.
  const emptyPathDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cwk078-empty-path-'));
  try {
    const env = { ...process.env, PATH: emptyPathDir, Path: emptyPathDir };
    const res = runVerify(env);
    assert.match(res.stdout, /pointer check.*(could not derive|SKIPPED)/i, res.stdout);
    assert.doesNotMatch(res.stdout, /FAIL pointer check/);
    assert.equal(res.status, 0, `expected the gate to still PASS overall with git absent -- got:\n${res.stdout}`);
  } finally {
    fs.rmSync(emptyPathDir, { recursive: true, force: true });
  }
});

test('the derived ignoredRoots (git check-ignore, not a hardcoded literal) still FAILs a citation into a non-hidden gitignored dir', () => {
  // `checkPointers` is generic over WHERE `ignoredRoots` came from -- CWK-079 replaced
  // verify.mjs's own SOURCE for the pointer gate (disk-derived here -> citation-derived
  // there), but this test still targets a real, load-bearing property of `deriveRootSets`
  // itself (kept for its own tested invariants, see derive-roots.mjs's own header), not a
  // claim about what the pointer gate currently feeds it.
  //
  // CWK-078 RED: the previous version of this test cited a scratchpad path against THIS
  // repo's own real tree, which only has gitignored top-level entries on a machine that has
  // actually accumulated this room's local-only tooling state. A fresh clone or CI checkout
  // has ZERO of them (`scratchpad`, `MEMORY.md`, `.claude`, ... are all local-only), so
  // `deriveRootSets` legitimately derives an EMPTY `ignoredRoots` there and the planted
  // citation never resolves to a gitignored match -- the test passed on a dev box and
  // failed identically to what CI reported, in every OS/Node leg, because the property
  // being asserted depended on developer machine state rather than the fixture's own
  // construction. Fixed the same way as `scripts/lib/derive-roots.test.mjs`'s
  // `.github`-shape test: build a throwaway git repo, derive its roots for real, and run
  // `checkPointers` directly against that derivation -- never against the real CoalBoard
  // tree, so this passes identically on a dev box, in a fresh clone, and in CI.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cwk078-red-fixture-'));
  try {
    execFileSync('git', ['init', '--quiet'], { cwd: dir });
    fs.writeFileSync(path.join(dir, '.gitignore'), 'ignored-dir/\n');
    fs.mkdirSync(path.join(dir, 'ignored-dir'));
    const roots = deriveRootSets(dir);
    assert.equal(roots.ok, true);
    assert.ok(roots.ignoredRoots.has('ignored-dir'), 'the fixture ignored dir must actually derive as ignored');
    const findings = checkPointers({
      surfaces: [{ label: 'fixture.md', text: 'See `ignored-dir/notes.md` for detail.' }],
      ourRoots: roots.ourRoots,
      ignoredRoots: roots.ignoredRoots,
      resolve: () => 'missing',
    });
    assert.equal(findings.length, 1);
    assert.match(findings[0].msg, /gitignored `ignored-dir\//);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('CWK-079 non-locality: a shape-rejected citation under a gitignored root is still CHECKED once another path-shaped citation shares the root -- discovery and judgement are different questions', () => {
  // `looksPathShaped()` gates DISCOVERY only -- which roots verify.mjs's own candidateRoots
  // derivation feeds to `git check-ignore` -- never JUDGEMENT: `checkPointers`' own
  // `ignoredRoots.has(first)` branch judges every token reaching it regardless of shape. So
  // a shape-rejected token (an extensionless path, no trailing slash) is NOT exempt from the
  // check -- it is exempt only from CONTRIBUTING ITS OWN ROOT to the set the check runs
  // against. Proven with a two-plant pair, mirroring verify.mjs's OWN derivation loop
  // (candidateRoots -> one batched `git check-ignore --stdin` call -> ignoredRoots) against
  // a real throwaway git repo, never a hardcoded literal.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cwk079-nonlocal-'));
  try {
    execFileSync('git', ['init', '--quiet'], { cwd: dir });
    fs.writeFileSync(path.join(dir, '.gitignore'), 'throwaway-build/\n');
    fs.mkdirSync(path.join(dir, 'throwaway-build'));

    // Mirrors verify.mjs's OWN derivation loop exactly, including the CWK-090 fix b
    // injection-site feed (a path UNDER the root, not the bare root + '/') -- kept in
    // sync with the real gate so this test's own claim to mirror it stays true.
    const PROBE_SUFFIX = '/.pointer-check-probe';
    function deriveIgnoredRoots(surfaces) {
      const candidateRoots = new Set();
      for (const s of surfaces) {
        for (const tok of pointerCandidates(s.text)) {
          if (looksPathShaped(tok)) candidateRoots.add(tok.split('/')[0]);
        }
      }
      const ignoredRoots = new Set();
      if (candidateRoots.size) {
        const ci = spawnSync('git', ['check-ignore', '--stdin'],
          { cwd: dir, encoding: 'utf8', input: [...candidateRoots].map((n) => n + PROBE_SUFFIX).join('\n') + '\n' });
        if (!ci.error && ci.status !== 128 && typeof ci.stdout === 'string') {
          for (const line of ci.stdout.split('\n')) {
            const t = line.trim();
            if (!t) continue;
            ignoredRoots.add(t.endsWith(PROBE_SUFFIX) ? t.slice(0, -PROBE_SUFFIX.length) : t.replace(/\/$/, ''));
          }
        }
      }
      return ignoredRoots;
    }

    // PLANT A alone: an extensionless citation under the gitignored root. Shape-rejected at
    // discovery -- it can never itself put `throwaway-build` into `ignoredRoots`.
    const surfacesAlone = [{ label: 'a', text: 'Notes: `throwaway-build/notes`.' }];
    const ignoredAlone = deriveIgnoredRoots(surfacesAlone);
    assert.equal(ignoredAlone.has('throwaway-build'), false,
      'an extensionless citation alone must never discover its own root');
    const findingsAlone = checkPointers({ surfaces: surfacesAlone, ourRoots: new Set(), ignoredRoots: ignoredAlone, resolve: () => 'missing' });
    assert.equal(findingsAlone.length, 0, 'plant A alone must stay silent -- its root was never discovered');

    // PLANT B, same tree, a SECOND, path-shaped citation under the SAME root. This one alone
    // is enough to discover the root -- and once discovered, `checkPointers` judges EVERY
    // token sharing that root, including plant A's.
    const surfacesBoth = [
      { label: 'a', text: 'Notes: `throwaway-build/notes`.' },
      { label: 'b', text: 'Reference: `throwaway-build/readme.md`.' },
    ];
    const ignoredBoth = deriveIgnoredRoots(surfacesBoth);
    assert.equal(ignoredBoth.has('throwaway-build'), true, 'the path-shaped citation must discover the root');
    const findingsBoth = checkPointers({ surfaces: surfacesBoth, ourRoots: new Set(), ignoredRoots: ignoredBoth, resolve: () => 'missing' });
    assert.equal(findingsBoth.length, 2, JSON.stringify(findingsBoth));
    const findA = findingsBoth.find((f) => f.msg.includes('notes'));
    const findB = findingsBoth.find((f) => f.msg.includes('readme'));
    assert.match(findA.msg, /gitignored/, 'plant A must now FAIL -- it was never exempt from the check, only from discovering its own root');
    assert.match(findB.msg, /gitignored/, 'plant B, the citation that discovered the root, must FAIL too');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// CWK-090 fix b -- the bare `first + '/'` feed to `git check-ignore --stdin` can
// FALSE-MATCH a NONEXISTENT, un-patterned root when the `.gitignore` carries a line
// whose entire content is a lone stray CR (CoalFace's finding, ported via CoalMine).
// INDEPENDENTLY RE-MEASURED on THIS box, not assumed: our real `.gitignore` carries zero
// lone-CR lines today (checked: no live false-match on this tree), but a throwaway
// fixture reproduces the class on this exact git binary (2.55.0.windows.5) -- see the
// discriminating pair below, run at the git level first, then the real gate end-to-end.
test('verify.mjs pointer gate FIX 2: a lone-CR .gitignore line false-matches an absent root under the bare feed; the injection-site feed and the real gate are immune', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-pointer-lonecr-'));
  try {
    for (const d of ['scripts', 'skills', 'hooks', 'plugin', '.claude-plugin', 'commands', 'agents', 'platform-configs']) {
      const src = path.join(root, d);
      if (fs.existsSync(src)) fs.cpSync(src, path.join(tmp, d), { recursive: true });
    }
    for (const f of ['README.md', 'CONTRIBUTING.md', 'SECURITY.md', 'PRIVACY.md', 'CHANGELOG.md', 'NOTICE']) {
      fs.copyFileSync(path.join(root, f), path.join(tmp, f));
    }
    // A real pattern (this room's own already-gitignored scratchpad root, deliberately
    // not backticked here -- the self-reference trap this file's own scanned-surface
    // status makes real: a backticked example here would itself become a candidate)
    // plus a lone-CR blank line -- the shape that false-matches. Written as raw bytes
    // so the CR survives untouched through core.autocrlf's smudge filter.
    fs.writeFileSync(path.join(tmp, '.gitignore'), Buffer.from('scratchpad/\r\n\r\n', 'binary'));
    // A citation to a root that is ABSENT from disk and named by no pattern -- the
    // shape that reproduces. Under the bug this would be swallowed into a FALSE
    // "gitignored" FAIL instead of the silent out-of-scope skip it correctly gets.
    fs.appendFileSync(path.join(tmp, 'commands', 'stats.md'),
      NL + 'See `totally-fake-root/notes.md` for details.' + NL);

    const git = (args) => {
      const r = spawnSync('git', args, { cwd: tmp, encoding: 'utf8' });
      if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr || r.error?.message}`);
      return r.stdout;
    };
    git(['init', '-q', '-b', 'main']);
    git(['config', 'user.email', 'test@test.invalid']);
    git(['config', 'user.name', 'Test']);
    git(['config', 'commit.gpgsign', 'false']);
    git(['config', 'core.autocrlf', 'true']);
    git(['add', '-A']);
    git(['commit', '-q', '-m', 'baseline']);
    assert.ok(fs.readFileSync(path.join(tmp, '.gitignore'), 'utf8').includes('\r\n\r\n'),
      'the working-tree .gitignore must actually carry the lone-CR blank line');
    assert.ok(!fs.existsSync(path.join(tmp, 'totally-fake-root')),
      'the probed root must be genuinely absent -- that absence is what the false match depends on');

    // THE DISCRIMINATING PAIR, at the git level, on this exact fixture.
    const bare = spawnSync('git', ['check-ignore', '--stdin'], { cwd: tmp, encoding: 'utf8', input: 'totally-fake-root/\n' });
    assert.equal(bare.status, 0,
      'RED: the bare feed must reproduce the false match on THIS fixture -- an absent, un-patterned root reported ignored');
    const probed = spawnSync('git', ['check-ignore', '--stdin'], { cwd: tmp, encoding: 'utf8', input: 'totally-fake-root/.pointer-check-probe\n' });
    assert.equal(probed.status, 1, 'the injection-site feed correctly reports the SAME root as NOT ignored');

    // CONTROL: a genuinely-ignored root still matches under BOTH feeds -- the fix loses
    // no true positive.
    assert.equal(spawnSync('git', ['check-ignore', '--stdin'], { cwd: tmp, encoding: 'utf8', input: 'scratchpad/\n' }).status, 0);
    assert.equal(spawnSync('git', ['check-ignore', '--stdin'], { cwd: tmp, encoding: 'utf8', input: 'scratchpad/.pointer-check-probe\n' }).status, 0);

    // END-TO-END: the real gate, driven against this exact fixture, must still catch a
    // genuine gitignored citation and must NOT false-FAIL the absent, un-patterned one.
    fs.appendFileSync(path.join(tmp, 'commands', 'stats.md'), NL + 'Notes: `scratchpad/notes.md`.' + NL);
    const r = spawnSync(process.execPath, [path.join(tmp, 'scripts', 'verify.mjs')], { cwd: tmp, encoding: 'utf8' });
    assert.match(r.stdout, /FAIL.*cites `scratchpad\/notes\.md`.*gitignored/,
      'the real gate, driven end-to-end against the lone-CR fixture, must still catch the genuinely-ignored citation');
    assert.doesNotMatch(r.stdout, /totally-fake-root/,
      'the real gate must never false-FAIL the absent, un-patterned root under the lone-CR fixture');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
