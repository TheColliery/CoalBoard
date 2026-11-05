// 29bo (CWK3-001): the plugin folder's README. plugin/README.md is generated from plugin-src/README.md by scripts/build-plugin.mjs, and
// the directory reads it. These legs prove the word count (code blocks do not count), the source map, every verify finding, and that a
// build with a missing source refuses BEFORE it removes the old dist. Fixtures are built under os.tmpdir() and removed in a teardown.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DIST_DOCS, DOC_MIN_WORDS, docWords, distDocSource, checkDistDocs } from './dist-docs.mjs';
import { buildDist } from '../build-plugin.mjs';
import { removeTree } from './test-teardown.mjs';

const words = (n, prefix = 'w') => Array.from({ length: n }, (_, i) => `${prefix}${i}`).join(' ');
const good = words(DOC_MIN_WORDS + 5);

function fixture(t, { src = good, dist = good, skipSrc = false, skipDist = false } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-distdocs-'));
  t.after(() => removeTree(tmp));
  const srcRoot = path.join(tmp, 'src');
  const distRoot = path.join(tmp, 'dist');
  fs.mkdirSync(path.join(srcRoot, 'plugin-src'), { recursive: true });
  fs.mkdirSync(distRoot, { recursive: true });
  if (!skipSrc) fs.writeFileSync(path.join(srcRoot, 'plugin-src', 'README.md'), src);
  if (!skipDist) fs.writeFileSync(path.join(distRoot, 'README.md'), dist);
  return { srcRoot, distRoot };
}

test('the map: plugin-src/README.md ships as plugin/README.md, and the directory minimum is 40 words', () => {
  assert.deepEqual(DIST_DOCS, [{ src: 'plugin-src/README.md', dst: 'README.md' }]);
  assert.equal(DOC_MIN_WORDS, 40);
});

test('docWords counts the words outside fenced code blocks only', () => {
  assert.equal(docWords('one two three\n```\na b c d e f g h i j\n```\nfour five'), 5);
});

test('docWords treats a fence that never closes as code, so the rest of the file does not count', () => {
  assert.equal(docWords('one two\n```\nx y z'), 2);
  assert.equal(docWords(''), 0);
});

test('distDocSource names the source of the dist README and nothing else', () => {
  assert.equal(distDocSource('README.md'), 'plugin-src/README.md');
  assert.equal(distDocSource('commands/update.md'), null);
});

test('a fresh copy that is byte-equal and at least 40 words is clean', (t) => {
  const { srcRoot, distRoot } = fixture(t);
  assert.deepEqual(checkDistDocs(distRoot, srcRoot), []);
});

test('a dist README that is missing is a finding naming plugin/README.md', (t) => {
  const { srcRoot, distRoot } = fixture(t, { skipDist: true });
  const f = checkDistDocs(distRoot, srcRoot);
  assert.equal(f.length, 1, f.join('\n'));
  assert.match(f[0], /plugin\/README\.md is missing/);
});

test('a dist README that differs from its source is a stale finding', (t) => {
  const { srcRoot, distRoot } = fixture(t, { dist: good + ' changed' });
  const f = checkDistDocs(distRoot, srcRoot);
  assert.equal(f.length, 1, f.join('\n'));
  assert.match(f[0], /plugin\/README\.md is stale vs plugin-src\/README\.md/);
});

test('a missing source is a finding naming plugin-src/README.md, and no word count is made of it', (t) => {
  const { srcRoot, distRoot } = fixture(t, { skipSrc: true });
  const f = checkDistDocs(distRoot, srcRoot);
  assert.equal(f.length, 1, f.join('\n'));
  assert.match(f[0], /plugin-src\/README\.md is missing/);
});

test('a source under the 40-word minimum is a finding that states the count', (t) => {
  const { srcRoot, distRoot } = fixture(t, { src: words(39), dist: words(39) });
  const f = checkDistDocs(distRoot, srcRoot);
  assert.equal(f.length, 1, f.join('\n'));
  assert.match(f[0], /has 39 words outside code blocks; the directory minimum is 40/);
});

test('code blocks do not satisfy the minimum: 10 prose words plus 100 code words is a finding of 10', (t) => {
  const text = words(10) + '\n```\n' + words(100, 'c') + '\n```\n';
  const { srcRoot, distRoot } = fixture(t, { src: text, dist: text });
  const f = checkDistDocs(distRoot, srcRoot);
  assert.match(f.join('\n'), /has 10 words outside code blocks/);
});

test('buildDist refuses a missing README source BEFORE it removes the old dist, which stays as it was', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-distbuild-'));
  t.after(() => removeTree(tmp));
  const srcRoot = path.join(tmp, 'src');
  const distRoot = path.join(tmp, 'dist');
  fs.mkdirSync(srcRoot, { recursive: true });
  fs.mkdirSync(distRoot, { recursive: true });
  fs.writeFileSync(path.join(distRoot, 'keep.txt'), 'old dist');
  assert.throws(() => buildDist(distRoot, srcRoot), /plugin-src\/README\.md is missing or not a file/);
  assert.equal(fs.readFileSync(path.join(distRoot, 'keep.txt'), 'utf8'), 'old dist');
});
