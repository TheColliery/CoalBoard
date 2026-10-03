// R15 item 4: scripts/test.mjs hands its test child a NODE_OPTIONS. It used to REPLACE the caller's value
// (the R14 reviewer's carried note 2), dropping flags the caller set on purpose (--require a preload,
// --enable-source-maps, a bigger heap). childNodeOptions() EXTENDS it with the heap cap instead.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { childNodeOptions, HEAP_CAP_FLAG } from './node-options.mjs';

test('no caller value: the child gets the heap cap alone', () => {
  assert.equal(childNodeOptions(undefined), HEAP_CAP_FLAG);
  assert.equal(childNodeOptions(''), HEAP_CAP_FLAG);
  assert.equal(childNodeOptions('   '), HEAP_CAP_FLAG);
});

test("a caller's own flags are KEPT and the cap is appended (the old code replaced them)", () => {
  const caller = '--enable-source-maps --require ./preload.cjs';
  assert.equal(childNodeOptions(caller), `${caller} ${HEAP_CAP_FLAG}`);
});

test("a caller's own heap cap is never duplicated or overridden, in either spelling or form", () => {
  for (const own of ['--max-old-space-size=4096', '--max_old_space_size=4096', '--max-old-space-size 4096', '--enable-source-maps --max-old-space-size=512']) {
    const out = childNodeOptions(own);
    assert.equal(out, own, `kept verbatim: ${own}`);
    assert.equal((out.match(/max[-_]old[-_]space[-_]size/g) || []).length, 1, `exactly one cap in: ${out}`);
  }
});

test('a flag that merely CONTAINS the cap name as a value is not mistaken for a cap', () => {
  const out = childNodeOptions('--require ./max-old-space-size-helper.cjs');
  assert.ok(out.endsWith(HEAP_CAP_FLAG), out);
});

test('surrounding whitespace in the caller value does not leak into the result', () => {
  assert.equal(childNodeOptions('  --enable-source-maps  '), `--enable-source-maps ${HEAP_CAP_FLAG}`);
});

test('the cap the suite is held to stays 2048 MiB (AGENTS.md hard-won lessons: a harness child runs with a heap cap)', () => {
  assert.equal(HEAP_CAP_FLAG, '--max-old-space-size=2048');
});

// The wiring, end to end: the real runner entry, asked what it WOULD hand its child (no suite is run).
// This is the leg the old code failed: the child's value replaced the caller's.
test('scripts/test.mjs hands its child the CALLER\'s NODE_OPTIONS plus the cap', () => {
  const runner = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'test.mjs');
  const run = (callerValue) => {
    const env = { ...process.env };
    if (callerValue === undefined) delete env.NODE_OPTIONS; else env.NODE_OPTIONS = callerValue;
    const r = spawnSync(process.execPath, [runner, '--print-child-options'], { encoding: 'utf8', env, timeout: 30000 });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout.trim();
  };
  assert.equal(run('--enable-source-maps'), `--enable-source-maps ${HEAP_CAP_FLAG}`);
  assert.equal(run('--max-old-space-size=4096'), '--max-old-space-size=4096');
  assert.equal(run(undefined), HEAP_CAP_FLAG);
});
