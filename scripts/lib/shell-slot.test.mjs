// Route legs run steps.md's checker line through a real shell, against a fixture whose target name is built in code, and assert that no part of the name ran.
// Class legs hold the shipped text to one rule: no value on a command line, except a slot that names the skill's own folder.
// The route legs and the live-tree leg read steps.md's shipped text: the file form, with the checker in the skill folder. Every fixture is built under
// os.tmpdir() with a registered teardown; no leg runs a shell in the real tree.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { findShellSlots } from './shell-slots.mjs';
import { removeTree } from './test-teardown.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..');
const SKILL = path.join(ROOT, 'skills', 'coalboard');
const STEPS = path.join(SKILL, 'references', 'steps.md');
const CHECKER = path.join(SKILL, 'scripts', 'apply-target.mjs');

// The target name is built from parts in code, so this file holds no shell syntax. It carries no double quote, no backslash and no `>` (Windows rejects `>`
// in a name), so it is a legal file name on every platform.
const CANARY = 'ran-marker';
const DOLLAR = String.fromCharCode(36);
const NAME = 'x' + DOLLAR + '(mkdir ' + CANARY + ').js';

const fwd = (p) => p.replace(/\\/g, '/'); // a bash argument: a single backslash in a Windows path would be read as an escape

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-slot-'));
  t.after(() => removeTree(dir));
  const proj = path.join(dir, 'proj');
  fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });
  fs.copyFileSync(CHECKER, path.join(dir, 'scripts', 'apply-target.mjs'));
  fs.mkdirSync(proj, { recursive: true });
  fs.writeFileSync(path.join(proj, NAME), 'x\n');
  return { dir, proj };
}

// A shell counts only if it actually runs a command and prints what was asked; a probe, not a platform name.
const shells = {};
function shellFor(kind) {
  if (kind in shells) return shells[kind];
  const cands = kind === 'bash'
    ? [['C:/Program Files/Git/bin/bash.exe', ['-c', 'echo ok']], ['bash', ['-c', 'echo ok']]]
    : [['powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', "'ok'"]], ['pwsh', ['-NoProfile', '-NonInteractive', '-Command', "'ok'"]]];
  shells[kind] = null;
  for (const [exe, args] of cands) {
    const r = spawnSync(exe, args, { encoding: 'utf8', timeout: 20000, windowsHide: true });
    if (!r.error && r.status === 0 && r.stdout.trim() === 'ok') { shells[kind] = { exe, args: args.slice(0, -1) }; break; }
  }
  return shells[kind];
}

// The checker line, as steps.md writes it: the first code span that names the checker.
function checkerSpan() {
  const spans = [...fs.readFileSync(STEPS, 'utf8').matchAll(/`([^`\n]*apply-target\.mjs[^`\n]*)`/g)].map((m) => m[1]);
  return spans[0] ?? null;
}

// Fill every <slot> the way an agent would: the skill folder first, then the root or the target name. Any other slot is unknown and throws.
function fill(span, { root, name, skillDir, quoteName }) {
  return span.replace(/<([^<>]+)>/g, (_, slot) => {
    if (/skill/i.test(slot)) return skillDir;
    if (/root|project/i.test(slot)) return root;
    if (/target/i.test(slot)) return quoteName ? `"${name}"` : name;
    throw new Error(`steps.md has a slot this test does not know how to fill: <${slot}>`);
  });
}

function runRoute(t, kind, { quoteName = false } = {}) {
  const sh = shellFor(kind);
  if (!sh) { t.skip(`no ${kind} on this box runs a command and prints it back`); return; }
  const span = checkerSpan();
  assert.ok(span, 'steps.md names the checker in a code span');
  const f = fixture(t);
  const root = fwd(f.proj);
  // The file form: the agent writes the targets file in the project, and the span names it by a path that is not a slot.
  const targetsPath = path.join(f.proj, '.coalboard', 'memory', 'apply-targets.json');
  if (span.includes('--targets-file')) {
    fs.mkdirSync(path.dirname(targetsPath), { recursive: true });
    fs.writeFileSync(targetsPath, JSON.stringify({ root, targets: [NAME] }));
  }
  const line = fill(span, { root, name: NAME, skillDir: fwd(f.dir), quoteName });
  // The value is off the line whenever the span holds no target slot: neither the name nor any part of it may appear on the line.
  if (!/<[^<>]*target[^<>]*>/i.test(span)) {
    for (const part of [NAME, DOLLAR + '(', 'mkdir', CANARY]) assert.ok(!line.includes(part), `the checker line carries a part of the target name (${part}): ${line}`);
  }
  const env = { ...process.env, HOME: f.dir, USERPROFILE: f.dir, TEMP: f.dir, TMP: f.dir, TMPDIR: f.dir };
  const r = spawnSync(sh.exe, [...sh.args, line], { cwd: f.proj, env, encoding: 'utf8', timeout: 60000, killSignal: 'SIGKILL', windowsHide: true });
  assert.equal(fs.existsSync(path.join(f.dir, CANARY)), false, `the target name ran a command (skill folder): ${line}`);
  assert.equal(fs.existsSync(path.join(f.proj, CANARY)), false, `the target name ran a command (project): ${line}`);
  assert.ok(r.stdout.includes(NAME), `the checker did not name the file literally. line: ${line}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);
}

// ---- route legs: steps.md's checker line, through a real shell -----------------------------------------------------------------------------
test('steps.md checker line carries no target name, run through bash', (t) => runRoute(t, 'bash'));
test('steps.md checker line carries no target name, run through PowerShell', (t) => runRoute(t, 'powershell'));
test('steps.md checker line carries no target name in double quotes, run through bash', (t) => runRoute(t, 'bash', { quoteName: true }));
test('steps.md checker line carries no target name in double quotes, run through PowerShell', (t) => runRoute(t, 'powershell', { quoteName: true }));

// ---- class legs: findShellSlots over fixture text (these pass now) --------------------------------------------------------------------------
test('a shell line with a bare <each target> slot is a hit, whether it sits in a code span or a fence', () => {
  assert.equal(findShellSlots('Run `node scripts/apply-target.mjs <project root> <each target>` first.').length, 2); // both slots of the line
  assert.equal(findShellSlots('```\nnode x.mjs <each target>\n```\n').length, 1);
});

test('a shell line with a target slot in double quotes or in backticks is a hit', () => {
  assert.equal(findShellSlots('`node x.mjs "<each target>"`').length, 1);
  assert.equal(findShellSlots('```\nnode x.mjs `$TARGET`\n```\n').length, 1); // a fenced line, not an inline span
});

test('a shell line with a ${VAR}, %VAR% or --flag=VALUE slot is a hit', () => {
  assert.equal(findShellSlots('`node x.mjs ${TARGET}`').length, 1);
  assert.equal(findShellSlots('`node x.mjs %TARGET%`').length, 1);
  assert.equal(findShellSlots('`node x.mjs --targets-file=TARGETS_FILE`').length, 1);
});

test('a slot that names the skill folder is allowed; the shell\'s own variables are not slots', () => {
  assert.equal(findShellSlots('`node <skill folder>/scripts/apply-target.mjs x`').length, 0);
  assert.equal(findShellSlots('`cd $HOME && ls`').length, 0);
});

test('a span with no shell runner is not a shell line, whatever slot it holds', () => {
  assert.equal(findShellSlots('Pick `<each target>` from the list.').length, 0);
});

// ---- the live tree: every shipped text, zero hits ------------------------------------------------------------------------------------------
test('no shipped skill, command, agent or plugin README puts a value slot on a shell line', () => {
  const files = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.md')) files.push(p);
    }
  };
  walk(path.join(ROOT, 'skills'));
  for (const top of ['commands', 'agents']) {
    const d = path.join(ROOT, top);
    if (fs.existsSync(d)) for (const e of fs.readdirSync(d)) if (e.endsWith('.md')) files.push(path.join(d, e));
  }
  const readme = path.join(ROOT, 'plugin-src', 'README.md');
  if (fs.existsSync(readme)) files.push(readme);
  const hits = [];
  for (const f of files) for (const h of findShellSlots(fs.readFileSync(f, 'utf8'))) hits.push(`${path.relative(ROOT, f)}:${h.line} ${h.span}`);
  assert.deepEqual(hits, []);
});
