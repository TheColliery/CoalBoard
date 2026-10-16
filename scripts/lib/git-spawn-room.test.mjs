// The room's half of the canon git-spawn census (09a): the canon census and its witness list live in git-env-census.test.mjs (adopted by blob id); this file
// runs the census over THIS room's own sources with the room's pins, and proves the pins stay honest. Hermetic: fixtures are strings and a temp dir.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanGitSpawns, gitBlobId } from './git-env-census.mjs';
import { PINS, roomSources, roomCensus } from './git-spawn-room.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('the room tree: every git spawn of scripts/ and hooks/ takes a checked env, and exactly the pinned files are exempt', () => {
  const r = roomCensus(repo);
  assert.deepEqual(r.findings, []);
  assert.ok(r.calls >= 20, `the census must see the room's spawns (saw ${r.calls})`);
  assert.equal(r.safe, r.calls, 'every counted spawn is safe');
  assert.equal(r.exempted, PINS.length, 'a pin that matches no file bytes is a finding, not an exemption');
});

test('every pin names a file of the room, with a reason, and matches that file as it is now', () => {
  assert.ok(PINS.length >= 1);
  for (const p of PINS) {
    assert.match(p.blob, /^[0-9a-f]{40}$/, `${p.rel}: a git blob id`);
    assert.ok(p.why && p.why.length > 40, `${p.rel}: the pin carries its reason`);
    const text = fs.readFileSync(path.join(repo, p.rel), 'utf8');
    assert.equal(gitBlobId(text), p.blob, `${p.rel} changed: re-derive the pin from the canon source or fix the file (a pin dies with its first edited byte)`);
  }
});

test('a pin is NEEDED: without it its file raises a finding, so no pin outlives the reason it was written for', () => {
  for (const p of PINS) {
    const text = fs.readFileSync(path.join(repo, p.rel), 'utf8');
    const r = scanGitSpawns([{ rel: p.rel, text }], []);
    assert.ok(r.findings.length >= 1, `${p.rel} passes the census with no pin: drop the pin`);
  }
});

test('the source set is scripts/**/*.mjs and hooks/*.js with forward-slash names (a hook is a git spawner too)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-room-census-'));
  try {
    fs.mkdirSync(path.join(dir, 'scripts', 'lib'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'hooks'));
    fs.writeFileSync(path.join(dir, 'scripts', 'lib', 'a.mjs'), 'export const a = 1;\n');
    fs.writeFileSync(path.join(dir, 'hooks', 'h.js'), "const { spawnSync } = require('child_process');\nspawnSync('git', ['status'], { env: process.env });\n");
    fs.writeFileSync(path.join(dir, 'hooks', 'hooks.json'), '{}');
    assert.deepEqual(roomSources(dir).map((f) => f.rel).sort(), ['hooks/h.js', 'scripts/lib/a.mjs']);
    const findings = roomCensus(dir).findings;
    assert.equal(findings.length, 1, findings.join('\n'));
    assert.match(findings[0], /^hooks\/h\.js:2 /);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
