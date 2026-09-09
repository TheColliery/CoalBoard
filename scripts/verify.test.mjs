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
          { cwd: dir, encoding: 'utf8', input: [...candidateRoots].map((n) => n + '/').join('\n') + '\n' });
        if (!ci.error && typeof ci.stdout === 'string') {
          for (const line of ci.stdout.split('\n')) {
            const t = line.trim();
            if (t) ignoredRoots.add(t.replace(/\/$/, ''));
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
