// Zero-dep unit tests for scripts/lib/dist-compare.mjs (board #59 + its
// findings-back, scripts-quality §2). Exercises the EXACT functions
// verify.mjs's two src-vs-dist parity checks import and call: `textFilesEqual`
// at the "plugin/ dist in sync with source" (SHIP-list, text-only) check, and
// `filesEqual` at the "plugin/ dist has no orphan" (whole-tree, binary-safe)
// check — not a standalone reimplementation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { textFilesEqual, filesEqual } from './dist-compare.mjs';

function tmpFile(name, content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-dist-compare-'));
  const p = path.join(dir, name);
  fs.writeFileSync(p, content);
  return { path: p, dir };
}

test('textFilesEqual: a CRLF-only difference reads as IN-SYNC (no false FAIL)', () => {
  const src = tmpFile('src.md', 'line one\nline two\nline three\n');
  const dst = tmpFile('dst.md', 'line one\r\nline two\r\nline three\r\n');
  try {
    assert.equal(textFilesEqual(src.path, dst.path), true);
  } finally {
    fs.rmSync(src.dir, { recursive: true, force: true });
    fs.rmSync(dst.dir, { recursive: true, force: true });
  }
});

test('textFilesEqual: a real content edit under CRLF still FAILS LOUD', () => {
  const src = tmpFile('src.md', 'line one\r\nline two\r\nline three\r\n');
  const dst = tmpFile('dst.md', 'line one\r\nline TWO\r\nline three\r\n');
  try {
    assert.equal(textFilesEqual(src.path, dst.path), false);
  } finally {
    fs.rmSync(src.dir, { recursive: true, force: true });
    fs.rmSync(dst.dir, { recursive: true, force: true });
  }
});

test('filesEqual: two DIFFERENT binary files are not masked as equal by a lossy UTF-8 decode', () => {
  const src = tmpFile('icon-a.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0xff, 0xfe, 0x00, 0x01]));
  const dst = tmpFile('icon-b.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0xff, 0xfe, 0x00, 0x02]));
  try {
    assert.equal(filesEqual(src.path, dst.path), false);
  } finally {
    fs.rmSync(src.dir, { recursive: true, force: true });
    fs.rmSync(dst.dir, { recursive: true, force: true });
  }
});
