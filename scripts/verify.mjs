// CoalBoard verify gate — lean but real (fail loud). Checks the config-schema is
// well-formed, the manifest is valid, and the plugin/ dist is in sync with source.
// Each check is wrapped so one failure yields a clean FAIL line and the rest still run.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG_SCHEMA } from './lib/config-schema.mjs';
import { DEFAULT_CRITICAL_PATHS, DEFAULT_CRITICAL_IMPORTS, DEFAULT_CRITICAL_KEYWORDS } from './lib/trigger.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const fails = [];
const oks = [];
function check(name, fn) {
  try { const e = fn(); if (e) fails.push(`FAIL ${name}: ${e}`); else oks.push(name); }
  catch (e) { fails.push(`FAIL ${name}: ${e && e.message ? e.message : e}`); }
}

check('config-schema well-formed', () => {
  const seen = new Set();
  for (const s of CONFIG_SCHEMA) {
    if (!s.key) return 'a spec has no key';
    if (seen.has(s.key)) return `duplicate key '${s.key}'`;
    seen.add(s.key);
    if (!s.type) return `'${s.key}' has no type`;
    if (!s.help) return `'${s.key}' has no help`;
    if (s.type === 'enum' && !Array.isArray(s.values)) return `'${s.key}' is enum without values`;
  }
  return null;
});

let version = '';
check('plugin.json valid', () => {
  const p = JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin', 'plugin.json'), 'utf8'));
  if (!p.name || !p.version) return 'missing name/version';
  version = p.version;
  return null;
});

check('marketplace.json valid + points at ./plugin', () => {
  const m = JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin', 'marketplace.json'), 'utf8'));
  if (!Array.isArray(m.plugins) || !m.plugins.length) return 'no plugins[]';
  if (m.plugins[0].source !== './plugin') return `plugin source is '${m.plugins[0].source}', expected ./plugin`;
  return null;
});

const SHIP = [
  'skills/coalboard/SKILL.md',
  'hooks/coalboard-conductor.js',
  'hooks/hooks.json',
  'commands/coalboard.md',
  'commands/update.md',
  '.claude-plugin/plugin.json',
];
check('plugin/ dist in sync with source', () => {
  for (const rel of SHIP) {
    const dst = path.join(root, 'plugin', rel);
    if (!fs.existsSync(dst)) return `plugin/${rel} missing — run scripts/build-plugin.mjs`;
    if (fs.readFileSync(path.join(root, rel), 'utf8') !== fs.readFileSync(dst, 'utf8')) {
      return `plugin/${rel} is stale vs source — run scripts/build-plugin.mjs`;
    }
  }
  return null;
});

check('conductor inline detect lists match trigger.mjs (no silent drift)', () => {
  const src = fs.readFileSync(path.join(root, 'hooks', 'coalboard-conductor.js'), 'utf8');
  const grab = (name) => {
    const m = src.match(new RegExp(`const ${name} = (\\[[^\\]]*\\]);`));
    if (!m) return null;
    try { return JSON.parse(m[1].replace(/'/g, '"')); } catch { return null; }
  };
  for (const [name, expected] of [['D_PATHS', DEFAULT_CRITICAL_PATHS], ['D_IMPORTS', DEFAULT_CRITICAL_IMPORTS], ['D_KEYWORDS', DEFAULT_CRITICAL_KEYWORDS]]) {
    const got = grab(name);
    if (!got) return `could not parse conductor ${name}`;
    if (JSON.stringify(got) !== JSON.stringify(expected)) return `conductor ${name} drifted from trigger.mjs — re-sync`;
  }
  return null;
});

check('shipped hook has no NUL byte (control-char/BOM hazard)', () => {
  const buf = fs.readFileSync(path.join(root, 'hooks', 'coalboard-conductor.js'));
  return buf.includes(0) ? 'a 0x00 byte is present in coalboard-conductor.js (build it from char codes, never typed literals)' : null;
});

for (const o of oks) console.log(`  ok   ${o}`);
if (fails.length) {
  for (const f of fails) console.log(f);
  console.log('VERIFY: FAIL');
  process.exitCode = 1;
} else {
  console.log(`VERIFY: PASS (coalboard v${version})`);
}
