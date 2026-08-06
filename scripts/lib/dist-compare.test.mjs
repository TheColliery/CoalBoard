// Zero-dep unit tests for scripts/lib/dist-compare.mjs (board #59, scripts-quality §2).
// Exercises the EXACT function verify.mjs's two src-vs-dist parity checks import and
// call (`textFilesEqual`, imported at scripts/verify.mjs:8-9, used at its "plugin/
// dist in sync with source" and "plugin/ dist has no orphan" checks) — not a
// standalone reimplementation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { textFilesEqual } from './dist-compare.mjs';

function tmpFile(name, content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-dist-compare-'));
  const p = path.join(dir, name);
  fs.writeFileSync(p, content);
  return p;
}

test('textFilesEqual: a CRLF-only difference reads as IN-SYNC (no false FAIL)', () => {
  const src = tmpFile('src.md', 'line one\nline two\nline three\n');
  const dst = tmpFile('dst.md', 'line one\r\nline two\r\nline three\r\n');
  assert.equal(textFilesEqual(src, dst), true);
});

test('textFilesEqual: a real content edit under CRLF still FAILS LOUD', () => {
  const src = tmpFile('src.md', 'line one\r\nline two\r\nline three\r\n');
  const dst = tmpFile('dst.md', 'line one\r\nline TWO\r\nline three\r\n');
  assert.equal(textFilesEqual(src, dst), false);
});
