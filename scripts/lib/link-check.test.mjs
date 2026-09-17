// r34 CW-017. Tests for scripts/lib/link-check.mjs against CWK-098's measured slug
// oracle (scratchpad/r34/ref/slug-oracle-2026-09.test-vectors.json -- untracked, so the
// 39 vectors are embedded here verbatim, invisible code points as explicit \u escapes
// where a literal character risks silent mis-transcription).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { slug, renderInline, anchorsFor, checkFile, Anchorer } from './link-check.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ENGINE = path.resolve(REPO_ROOT, 'scripts/lib/link-check.mjs');

// The 39 canonical vectors (10 census, 29 probe), from slug-oracle-2026-09.test-vectors.json.
const VECTORS = [
  { where: 'CoalMine-README:145', heading: 'Commands', anchor: 'commands', needsHistory: false },
  { where: 'CoalHearth-README:3', heading: '🔥 CoalHearth', anchor: '-coalhearth', needsHistory: false },
  { where: 'CoalMine-README:171', heading: '⚙️ Configure (.coalmine.json)', anchor: '️-configure-coalminejson', needsHistory: false },
  { where: 'CoalHearth-README:83', heading: 'Claude Code — validated', anchor: 'claude-code--validated', needsHistory: false },
  { where: 'CoalHearth-README:118', heading: 'Gemini CLI · Copilot CLI · Devin CLI · Kiro · Augment — works with (config-only ports)', anchor: 'gemini-cli--copilot-cli--devin-cli--kiro--augment--works-with-config-only-ports', needsHistory: false },
  { where: 'CoalMine-README:139', heading: '3. Verify & Uninstall', anchor: '3-verify--uninstall', needsHistory: false },
  { where: 'CoalMine-CHANGELOG:394', heading: '[3.8.4] — 2026-07-02', anchor: '384--2026-07-02', needsHistory: false },
  { where: 'CoalMine-README:119', heading: 'Option A3 — claude.ai (web / desktop app)', anchor: 'option-a3--claudeai-web--desktop-app', needsHistory: false },
  { where: 'CoalBoard-CHANGELOG:98', heading: 'Fixed (carve round 4 — the confirmation-wave REGRESSION, `1e66b4e`\'s own 4 lines)', anchor: 'fixed-carve-round-4--the-confirmation-wave-regression-1e66b4es-own-4-lines', needsHistory: false },
  { where: 'CoalMine-CHANGELOG:30', heading: 'Fixed', anchor: 'fixed-1', needsHistory: true },
  { where: 'PROBE:1', heading: 'tab\tbetween', anchor: 'tabbetween', needsHistory: false },
  { where: 'PROBE:2', heading: 'two  spaces', anchor: 'two--spaces', needsHistory: false },
  { where: 'PROBE:4', heading: 'nbsp inside', anchor: 'nbspinside', needsHistory: false },
  { where: 'PROBE2:17', heading: 'ideo　space zs', anchor: 'ideospace-zs', needsHistory: false },
  { where: 'PROBE:5', heading: 'trailing bang !', anchor: 'trailing-bang-', needsHistory: false },
  { where: 'PROBE2:21', heading: 'snake_case_word raw', anchor: 'snake_case_word-raw', needsHistory: false },
  { where: 'PROBE:25', heading: 'an _uemph_ word', anchor: 'an-uemph-word', needsHistory: false },
  { where: 'PROBE:24', heading: 'an *emph* and **strong** word', anchor: 'an-emph-and-strong-word', needsHistory: false },
  { where: 'PROBE:13', heading: 'hyphen--run---kept', anchor: 'hyphen--run---kept', needsHistory: false },
  { where: 'PROBE:11', heading: 'en – dash', anchor: 'en--dash', needsHistory: false },
  { where: 'PROBE:14', heading: 'หัวข้อ การติดตั้ง', anchor: 'หัวข้อ-การติดตั้ง', needsHistory: false },
  { where: 'PROBE:15', heading: '日本語 テスト', anchor: '日本語-テスト', needsHistory: false },
  { where: 'PROBE:16', heading: 'ÉCOLE ΣΟΦ', anchor: 'école-σοφ', needsHistory: false },
  { where: 'PROBE3:4', heading: 'wordΣ end', anchor: 'wordσ-end', needsHistory: false },
  { where: 'PROBE2:19', heading: 'İstanbul case', anchor: 'i̇stanbul-case', needsHistory: false },
  { where: 'PROBE:17', heading: 'x² squared', anchor: 'x-squared', needsHistory: false },
  { where: 'PROBE2:12', heading: 'digit ٣ nd', anchor: 'digit-٣-nd', needsHistory: false },
  { where: 'PROBE3:1', heading: 'circled Ⓐ so', anchor: 'circled-ⓐ-so', needsHistory: false },
  { where: 'PROBE:20', heading: '👨‍💻 zwj coder', anchor: '‍-zwj-coder', needsHistory: false },
  { where: 'PROBE2:7', heading: 'zw‌nj cf', anchor: 'zw‌nj-cf', needsHistory: false },
  { where: 'PROBE2:6', heading: 'zw​sp cf', anchor: 'zwsp-cf', needsHistory: false },
  { where: 'PROBE:21', heading: '1️⃣ keycap one', anchor: '1️⃣-keycap-one', needsHistory: false },
  { where: 'PROBE:26', heading: 'see [the docs](https://example.com) now', anchor: 'see-the-docs-now', needsHistory: false },
  { where: 'PROBE:27', heading: 'html <code>tag</code> inside', anchor: 'html-tag-inside', needsHistory: false },
  { where: 'PROBE:29', heading: 'amp &amp; entity', anchor: 'amp--entity', needsHistory: false },
  { where: 'PROBE2:23', heading: 'num &#35; entity raw', anchor: 'num--entity-raw', needsHistory: false },
  { where: 'PROBE:28', heading: 'escaped \\* star', anchor: 'escaped--star', needsHistory: false },
  { where: 'PROBE2:15', heading: 'math = < > | ~ sm', anchor: 'math------sm', needsHistory: false },
  { where: 'PROBE:33', heading: 'Duplicate Heading 1', anchor: 'duplicate-heading-1-1', needsHistory: true },
];

test('RED-FIRST: a naive [^\\w -]+run-collapse slug fails an oracle vector', () => {
  const naive = (s) => s.toLowerCase().replace(/[^\w -]/g, '').replace(/\s+/g, '-');
  const v = VECTORS.find((x) => x.where === 'CoalHearth-README:83'); // em dash between two spaces
  assert.notEqual(naive(v.heading), v.anchor, 'the naive slug was expected to diverge from GitHub here');
  assert.equal(slug(renderInline(v.heading)), v.anchor, 'the oracle slug must still match');
});

test('oracle vectors: slug(renderInline(heading)) matches GitHub, per CWK-098', () => {
  for (const v of VECTORS) {
    if (v.needsHistory) continue; // the two duplicate-suffix rows, replayed below
    assert.equal(slug(renderInline(v.heading)), v.anchor, v.where);
  }
});

test('oracle vector 10 (needsHistory): a second "Fixed" in one document gets -1', () => {
  const ancr = new Anchorer();
  ancr.anchor(slug(renderInline('Fixed'))); // the earlier ### Fixed already registered
  const v = VECTORS.find((x) => x.where === 'CoalMine-CHANGELOG:30');
  assert.equal(ancr.anchor(slug(renderInline(v.heading))), v.anchor);
});

test('oracle vector 39 (needsHistory): a literal "-1" collides with the counter -> -1-1', () => {
  const ancr = new Anchorer();
  const base = slug(renderInline('Duplicate Heading'));
  ancr.anchor(base);
  ancr.anchor(base);
  ancr.anchor(base); // three "Duplicate Heading" rows already registered
  const v = VECTORS.find((x) => x.where === 'PROBE:33');
  assert.equal(ancr.anchor(slug(renderInline(v.heading))), v.anchor);
});

test('renderInline never leaves < or > in a slug -- CodeQL js/incomplete-multi-character-sanitization dismissal proof (r34)', () => {
  const adversarial = ['<<a>b>', '<scr<script>ipt>', '<<<x>>>', 'a <script b'];
  for (const heading of adversarial) {
    const s = slug(renderInline(heading));
    assert.ok(!s.includes('<') && !s.includes('>'), `slug ${JSON.stringify(s)} from ${JSON.stringify(heading)} contains < or >`);
  }
});

test('anchorsFor: a heading-looking line inside a fenced code block is not a heading (CommonMark 4.5)', () => {
  const anchors = anchorsFor('```\n# not a heading\n```\n\n# Real Heading\n');
  assert.ok(!anchors.has('not-a-heading'));
  assert.ok(anchors.has('real-heading'));
});

test('checkFile: a broken-looking link inside a fenced code block is not checked', (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'link-check-fence-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(path.join(dir, 'doc.md'), '# Doc\n\n```\n[bad](./nope.md)\n```\n');
  assert.deepEqual(checkFile('doc.md', dir), []);
});

test('checkFile: the clean fixture has no findings', () => {
  const findings = checkFile('scripts/fixtures/link-check/clean.md', REPO_ROOT);
  assert.deepEqual(findings, []);
});

test('checkFile: the broken fixture reports both planted defects', () => {
  const findings = checkFile('scripts/fixtures/link-check/broken.md', REPO_ROOT);
  assert.equal(findings.length, 2);
  assert.ok(findings.some((f) => f.reason === 'file target does not exist'));
  assert.ok(findings.some((f) => f.reason === 'anchor not found'));
});

// CLI-spawn tests -- CoalTipple's HIGH-1 lesson: the exit code is the gate's ONLY
// mechanism, so it is the exit code that gets tested, not the exported functions.
test('CLI: exits 1 on a broken fixture (real spawned process)', () => {
  const res = spawnSync(process.execPath, [ENGINE, 'scripts/fixtures/link-check/broken.md'], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.equal(res.status, 1);
});

test('CLI: exits 0 on a clean fixture (real spawned process)', () => {
  const res = spawnSync(process.execPath, [ENGINE, 'scripts/fixtures/link-check/clean.md'], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.equal(res.status, 0);
});

test('CLI: exits 1 on a genuinely empty tracked-.md list -- CoalTipple HIGH-1 lesson (git init, no commits, no walk-exclusion involved)', (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'link-check-empty-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const init = spawnSync('git', ['init', '-q'], { cwd: dir, encoding: 'utf8' });
  assert.equal(init.status, 0);
  // Dispatch-transport.md's fixture-safety rule: assert the fixture's OWN .git exists
  // before trusting anything about it (here: before running git ls-files against it).
  assert.ok(existsSync(path.join(dir, '.git')), 'git init must have created .git first');
  const res = spawnSync(process.execPath, [ENGINE], { cwd: dir, encoding: 'utf8' });
  assert.equal(res.status, 1);
  assert.ok(res.stdout.includes('0 file(s) to scan'));
});

// r34 FIXBACK 1: the Write/Edit tool layer can silently convert a typed `\u0000`
// escape into a literal 0x00 BYTE in source (this room's own recorded hazard,
// edit-tool-converts-control-escapes) -- git then classifies the file BINARY and
// hides every future diff. Pinned directly on the byte stream, not on behaviour.
for (const f of ['scripts/lib/link-check.mjs', 'scripts/lib/link-check.test.mjs']) {
  test(`${f}: contains zero literal NUL (0x00) bytes`, () => {
    const buf = readFileSync(path.resolve(REPO_ROOT, f));
    let count = 0;
    for (let i = 0; i < buf.length; i++) if (buf[i] === 0) count++;
    assert.equal(count, 0, `${f} has ${count} literal NUL byte(s) -- git will show it as binary`);
  });
}

// Reading a shipped workflow file in a test is legitimate -- main's ruling for
// CoalHearth (cited per the r34 order's own instruction to name the precedent).
test('.github/workflows/link-check.yml: the engine step is real, no continue-on-error, and a non-empty-list guard exists', () => {
  const yml = readFileSync(path.resolve(REPO_ROOT, '.github/workflows/link-check.yml'), 'utf8');
  assert.ok(yml.includes('node scripts/lib/link-check.mjs'), 'the step must run the real CLI, not a stub');
  assert.ok(!/continue-on-error\s*:/.test(yml), 'this is a real gate, never continue-on-error');
  assert.ok(/if \[ -z "\$files" \]/.test(yml), 'a non-empty tracked-.md list guard must exist before the engine runs');
});
