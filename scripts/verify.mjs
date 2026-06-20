// CoalBoard verify gate — lean but real (fail loud). Checks the config-schema is
// well-formed, the manifest is valid, and the plugin/ dist is in sync with source.
// Each check is wrapped so one failure yields a clean FAIL line and the rest still run.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG_SCHEMA, validateValue } from './lib/config-schema.mjs';
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

// Doc-transition gate: a version bump that forgets the CHANGELOG silently rots (scripts-quality
// per-version checklist). Assert the plugin.json version has a matching CHANGELOG heading.
check('CHANGELOG has an entry for the plugin.json version', () => {
  if (!version) return null; // the plugin.json check already reported the real failure
  const cl = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
  return cl.includes(`## [${version}]`) ? null : `CHANGELOG.md has no '## [${version}]' entry — add one before tagging`;
});

const SHIP = [
  'skills/coalboard/SKILL.md',
  'skills/coalboard/references/wizard.md',
  'skills/coalboard/references/audit.md',
  'hooks/coalboard-conductor.js',
  'hooks/hooks.json',
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

// Both-direction (scripts-quality §1): SHIP above is source->dist; this walks the WHOLE
// dist tree so a 7th shipped file (a new command/skill/asset) cannot ship UNVERIFIED —
// every dist file must have an in-sync source. (build-plugin cpSyncs whole dirs, so a
// dist file's source is root/<same relative path>.)
check('plugin/ dist has no orphan (every dist file has an in-sync source)', () => {
  const distRoot = path.join(root, 'plugin');
  if (!fs.existsSync(distRoot)) return 'plugin/ missing — run scripts/build-plugin.mjs';
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) { const r = walk(abs); if (r) return r; continue; }
      const rel = path.relative(distRoot, abs).replace(/\\/g, '/');
      const src = path.join(root, rel);
      if (!fs.existsSync(src)) return `plugin/${rel} is a dist ORPHAN (no source) — it would ship unverified`;
      if (Buffer.compare(fs.readFileSync(src), fs.readFileSync(abs)) !== 0) return `plugin/${rel} differs from source — run scripts/build-plugin.mjs`;
    }
    return null;
  };
  return walk(distRoot);
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

// Strip // and /* */ comments, string-aware, so the JSONC factory config parses as JSON.
function stripJsonc(src) {
  let out = '', inStr = false, esc = false, inLine = false, inBlock = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (inLine) { if (c === '\n') { inLine = false; out += c; } continue; }
    if (inBlock) { if (c === '*' && n === '/') { inBlock = false; i++; } continue; }
    if (inStr) { out += c; if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') { inStr = true; out += c; continue; }
    if (c === '/' && n === '/') { inLine = true; i++; continue; }
    if (c === '/' && n === '*') { inBlock = true; i++; continue; }
    out += c;
  }
  return out;
}

check('factory config valid against schema', () => {
  const raw = fs.readFileSync(path.join(root, 'platform-configs', '.coalboard.json'), 'utf8');
  let cfg;
  try { cfg = JSON.parse(stripJsonc(raw)); }
  catch (e) { return `platform-configs/.coalboard.json is not valid JSONC: ${e && e.message ? e.message : e}`; }
  const byKey = new Map(CONFIG_SCHEMA.map((s) => [s.key, s]));
  for (const [k, v] of Object.entries(cfg)) {
    const spec = byKey.get(k);
    if (!spec) return `unknown key '${k}' in .coalboard.json (not in config-schema.mjs)`;
    const err = validateValue(spec, v);
    if (err) return `.coalboard.json '${k}' ${err}`;
  }
  return null;
});

for (const o of oks) console.log(`  ok   ${o}`);
if (fails.length) {
  for (const f of fails) console.log(f);
  console.log('VERIFY: FAIL');
  process.exitCode = 1;
} else {
  console.log(`VERIFY: PASS (coalboard v${version})`);
}
