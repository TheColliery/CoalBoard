// CoalBoard verify gate — lean but real (fail loud). Checks the config-schema is
// well-formed, the manifest is valid, and the plugin/ dist is in sync with source.
// Each check is wrapped so one failure yields a clean FAIL line and the rest still run.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CONFIG_SCHEMA, validateValue, validateConfig } from './lib/config-schema.mjs';
import { DEFAULT_CRITICAL_PATHS, DEFAULT_CRITICAL_IMPORTS, DEFAULT_CRITICAL_KEYWORDS } from './lib/trigger.mjs';
import { textFilesEqual, filesEqual } from './lib/dist-compare.mjs';
import { checkConfigKeys } from './lib/config-keys.mjs';
import { checkPointers } from './lib/pointer-check.mjs';

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
  'skills/coalboard/references/lens-prompts.md',
  'hooks/coalboard-conductor.js',
  'hooks/hooks.json',
  'commands/update.md',
  'commands/stats.md',
  '.claude-plugin/plugin.json',
];
check('plugin/ dist in sync with source', () => {
  for (const rel of SHIP) {
    const dst = path.join(root, 'plugin', rel);
    if (!fs.existsSync(dst)) return `plugin/${rel} missing — run scripts/build-plugin.mjs`;
    if (!textFilesEqual(path.join(root, rel), dst)) {
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
      if (!filesEqual(src, abs)) return `plugin/${rel} differs from source — run scripts/build-plugin.mjs`;
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

// Skill-listing description cap: gate at 1024 = cross-platform-safe (agentskills.io / agnix);
// CC's own listing truncation is 1536 chars combined description+when_to_use
// (code.claude.com/docs/en/skills, verified 2026-07-16). USER standard 2026-07-16: never exceed.
const DESC_CAP = 1024;
function frontmatterField(text, key) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const lines = m[1].split(/\r?\n/);
  const i = lines.findIndex((l) => l.startsWith(key + ':'));
  if (i === -1) return null;
  let v = lines[i].slice(key.length + 1).trim();
  if (/^[>|][-+]?$/.test(v)) {
    const parts = [];
    for (let j = i + 1; j < lines.length && /^\s+\S/.test(lines[j]); j++) parts.push(lines[j].trim());
    return parts.join(' ');
  }
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  return v;
}
// Dynamic scan (skills/*/SKILL.md for any dir that has one, commands/*.md) so a
// new skill/command is covered without editing this gate.
const descTargets = [];
const skillsDirDesc = path.join(root, 'skills');
if (fs.existsSync(skillsDirDesc)) {
  for (const d of fs.readdirSync(skillsDirDesc, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const smd = path.join(skillsDirDesc, d.name, 'SKILL.md');
    if (fs.existsSync(smd)) descTargets.push([`skills/${d.name}/SKILL.md`, smd, true]);
  }
}
const commandsDirDesc = path.join(root, 'commands');
if (fs.existsSync(commandsDirDesc)) {
  for (const f of fs.readdirSync(commandsDirDesc)) {
    if (f.endsWith('.md')) descTargets.push([`commands/${f}`, path.join(commandsDirDesc, f), false]);
  }
}
for (const [label, p, isSkill] of descTargets) {
  check(`description length: ${label}`, () => {
    const text = fs.readFileSync(p, 'utf8');
    const len = (frontmatterField(text, 'description') || '').length + (frontmatterField(text, 'when_to_use') || '').length;
    if (isSkill && len === 0) return 'frontmatter description missing/unparsed';
    if (len > DESC_CAP) return `description+when_to_use ${len} chars exceeds the ${DESC_CAP}-char cap`;
    return null;
  });
}

// Leading-BOM strip for the plugin.json description check below, built from a char code
// rather than a typed escape sequence (board #64, CoalMine's own fix: retyping the literal
// BOM escape in an editor/tool-call can silently insert the actual BOM character in transit).
const BOM_RE = new RegExp('^' + String.fromCharCode(0xfeff));

// board #64: the loop above walked skill/command FRONTMATTER only -- .claude-plugin/plugin.json's
// OWN description field (the string a marketplace/plugin listing actually renders) was never
// read by this gate at all. CoalLedger shipped one at 1067 chars (over the 1024 cap) before a
// human eye caught it. plugin.json is plain JSON, not YAML frontmatter, so it reads the field
// directly rather than through frontmatterField; DESC_CAP is the same constant above, never
// redefined.
check('description length: .claude-plugin/plugin.json', () => {
  const pjPath = path.join(root, '.claude-plugin', 'plugin.json');
  const pj = JSON.parse(fs.readFileSync(pjPath, 'utf8').replace(BOM_RE, ''));
  const len = typeof pj.description === 'string' ? pj.description.length : 0;
  if (!pj.description) return 'description missing';
  if (len > DESC_CAP) return `description ${len} chars exceeds the ${DESC_CAP}-char cap`;
  return null;
});

// config-key drift (CWK-060, ported from CoalMine's CWK-059): every config key
// NAMED on a user-facing surface must RESOLVE in config-schema.mjs, or be declared
// in PENDING_KEYS / NOT_CONFIG / BLIND_KEYS (scripts/lib/config-keys.mjs owns the
// detection rule, the three declaration lists, and the full port-trap writeup --
// not restated here).
//
// SCOPE DERIVATION, stated rather than implied (AGENTS.md, THE MEASUREMENT'S OWN
// FOURTH TENSE): references/*.md is WALKED (readdir) -- a new reference file is
// covered the day it lands, no roster to keep complete. SKILL.md/README.md/
// PRIVACY.md/SECURITY.md are an ENUMERATED roster -- there is no stable "root
// docs" directory to walk without also picking up CHANGELOG.md, a DELIBERATE
// exclusion (config-keys.mjs's own SURFACES comment has the measured reason).
//
// THIS ROSTER IS DELIBERATELY NARROWER THAN pcSurfaces BELOW (CWK-078), and the gap is
// named rather than left as silent drift between two gates scanning "the docs": the
// pointer gate scans every doc surface a ship-text pointer could hide in; this one scans
// every surface a CONFIG KEY NAME could hide in, which is a real but smaller set. Measured
// at the gap: `commands/stats.md` (names `rigor`), `commands/update.md` (names `updateMode`,
// `updateCheckDays`), and `CONTRIBUTING.md` (names `rigor`) all name REAL keys and were
// unscanned -- added below. `NOTICE` stays OUT: it names none, and it is a legal text, not
// ship-text about config. `CHANGELOG.md` stays OUT, same reason config-keys.mjs's own
// SURFACES comment already gives for excluding it here: it is history, and it legitimately
// names RETIRED keys (`callFable`, `debateTimeoutSeconds`) that would redden this gate on
// correct historical text if scanned live rather than as the pointer gate's `historyOnly`
// surface.
const ckRefsDir = path.join(root, 'skills', 'coalboard', 'references');
const ckCommandsDir = path.join(root, 'commands');
const ckMdFiles = [
  'skills/coalboard/SKILL.md',
  ...fs.readdirSync(ckRefsDir).filter((f) => f.endsWith('.md')).map((f) => path.join('skills', 'coalboard', 'references', f).replace(/\\/g, '/')),
  ...fs.readdirSync(ckCommandsDir).filter((f) => f.endsWith('.md')).map((f) => path.join('commands', f).replace(/\\/g, '/')),
  'README.md',
  'PRIVACY.md',
  'SECURITY.md',
  'CONTRIBUTING.md',
];
const ckHookFiles = ['hooks/coalboard-conductor.js'];
const { findings: ckFindings, coverage: ckCoverage } = checkConfigKeys({
  schemaKeys: CONFIG_SCHEMA.map((s) => s.key),
  mdFiles: ckMdFiles,
  hookFiles: ckHookFiles,
  read: (f) => fs.readFileSync(path.join(root, f), 'utf8'),
  keyTables: [{ file: 'README.md', heading: 'Configure' }],
});
// PER-LOCATOR COVERAGE, printed every run regardless of pass/fail -- BYTES, never
// lines (this hook's own CRITICAL-signal notice is one very long line, so a line
// count would flatter it). This is what lets a reader tell a legitimate empty
// result apart from a silently-broken locator without re-deriving the numbers.
console.log('config keys coverage:');
console.log(`  --   md files scanned: ${ckCoverage.mdFiles.count} (${ckCoverage.mdFiles.bytes} bytes)`);
console.log(`  --   hook files scanned: ${ckCoverage.hookFiles.count}, write-call sites found: ${ckCoverage.hookFiles.sitesFound} (${ckCoverage.hookFiles.bytes} bytes)`);
for (const t of ckCoverage.keyTables) {
  console.log(`  --   key table ${t.file} ("${t.heading}"): ${t.found ? `${t.rows} row(s)` : 'HEADING NOT FOUND'}`);
}
const ckSkips = ckFindings.filter((f) => f.level === 'SKIP');
const ckHard = ckFindings.filter((f) => f.level !== 'SKIP');
for (const f of ckSkips) console.log('  --   ' + f.msg);
// The pass line is QUALIFIED when the gate has declared blind spots -- an
// unqualified "every config key ... resolves" is false while a declared key is
// being read and discarded, and a gate whose success line overclaims is the same
// defect it exists to catch.
const ckScope = ckSkips.some((f) => f.msg.startsWith('blind to')) ? 'every DETECTABLE config key' : 'every config key';
if (ckHard.length === 0) {
  check(`config keys: ${ckScope} named across ${ckMdFiles.length} doc + ${ckHookFiles.length} hook surface(s) resolves in the schema`, () => null);
} else {
  ckHard.forEach((f, idx) => check(`config keys: finding ${idx + 1}/${ckHard.length}`, () => f.msg));
}

// pointer gate (CWK-075, ported from CoalMine's CWK-075 at 092fd24): ship-text names a file,
// and nothing resolved it against this tree. scripts/lib/pointer-check.mjs owns the
// detection rule, the funnel measurement, and the two named blind spots -- not restated here.
//
// SCOPE, same discipline as the config-keys gate above: references/*.md is WALKED (readdir);
// SKILL.md/commands/*.md/README.md/SECURITY.md/CONTRIBUTING.md/PRIVACY.md/NOTICE are an
// ENUMERATED roster. CHANGELOG.md is included but marked historyOnly -- a running log, so a
// path that was correct when an entry was written is not a defect now; the gitignored-root
// branch still binds it regardless (pointer-check.mjs's own rule), so a scratchpad citation
// there still FAILs. scripts/*.mjs + scripts/lib/*.mjs + hooks/*.js are scanned by their
// // line-comment text only, never their code bodies (a code body's own backticked-looking
// tokens inside a string are not a ship-text claim about this tree).
function pcLineComments(text) {
  return (text.match(/\/\/[^\n]*/g) || []).join('\n');
}
const pcRefsDir = path.join(root, 'skills', 'coalboard', 'references');
const pcCommandsDir = path.join(root, 'commands');
const pcSurfaces = [
  { label: 'skills/coalboard/SKILL.md', text: fs.readFileSync(path.join(root, 'skills', 'coalboard', 'SKILL.md'), 'utf8') },
  ...fs.readdirSync(pcRefsDir).filter((f) => f.endsWith('.md')).map((f) => {
    const rel = path.join('skills', 'coalboard', 'references', f).replace(/\\/g, '/');
    return { label: rel, text: fs.readFileSync(path.join(root, rel), 'utf8') };
  }),
  ...fs.readdirSync(pcCommandsDir).filter((f) => f.endsWith('.md')).map((f) => {
    const rel = path.join('commands', f).replace(/\\/g, '/');
    return { label: rel, text: fs.readFileSync(path.join(root, rel), 'utf8') };
  }),
  ...['README.md', 'SECURITY.md', 'CONTRIBUTING.md', 'PRIVACY.md', 'NOTICE'].map((f) => ({
    label: f, text: fs.readFileSync(path.join(root, f), 'utf8'),
  })),
  {
    label: 'CHANGELOG.md',
    text: fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8'),
    historyOnly: true,
  },
];
for (const dir of ['scripts', 'scripts/lib', 'hooks']) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) continue;
  for (const f of fs.readdirSync(abs)) {
    if (!f.endsWith('.mjs') && !f.endsWith('.js')) continue;
    const rel = path.join(dir, f).replace(/\\/g, '/');
    pcSurfaces.push({ label: rel, text: pcLineComments(fs.readFileSync(path.join(root, rel), 'utf8')) });
  }
}
// ROOT-SET DERIVATION (CWK-078): the two rosters above USED TO BE frozen literals -- correct
// today (verified 7-for-7 against a full re-enumeration before this change), but a snapshot
// cannot track `.gitignore`; the day an entry is added there, a citation into it is dropped
// SILENTLY and PERMANENTLY. Derive both from `git check-ignore`, never parse `.gitignore`
// (one source of truth, the same rule `.gitignore` itself exists to keep). Degrades to a
// NAMED SKIP -- never a FAIL -- when git cannot answer (CoalHearth's design lesson: a FAIL
// here would redden a non-git user's gate over a question only git can answer). `ourRoots`
// deliberately includes root DOC FILES too, not directories only -- harmless per
// pointer-check.mjs's own INERTNESS BY CONSTRUCTION note (a file can never prefix a `/`-token
// at step 5), and simpler than filtering, since a future top-level DIRECTORY must still be
// caught the day it lands.
function pcDeriveRootSets(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const fed = entries.length;
  const ourRoots = new Set();
  const ignoredRoots = new Set();
  for (const e of entries) {
    const res = spawnSync('git', ['check-ignore', '--quiet', '--', e.name], { cwd: dir });
    if (res.error || (res.status !== 0 && res.status !== 1)) return { ok: false, fed };
    if (res.status === 0) ignoredRoots.add(e.name);
    else if (!e.name.startsWith('.')) ourRoots.add(e.name);
  }
  return { ok: true, fed, ignoredCount: ignoredRoots.size, ourRoots, ignoredRoots };
}
function pcResolve(rel) {
  try {
    execFileSync('git', ['ls-files', '--error-unmatch', '--', rel], { cwd: root, stdio: 'pipe' });
    return 'tracked';
  } catch {
    return fs.existsSync(path.join(root, rel)) ? 'untracked' : 'missing';
  }
}
const pcRoots = pcDeriveRootSets(root);
if (!pcRoots.ok) {
  // Every number printed here comes from the instrument, not a typed guess -- `fed` is the
  // count actually enumerated before git stopped answering, never the full directory size
  // assumed.
  console.log(`  --   pointer check: could not derive ourRoots/ignoredRoots -- git is unavailable or unusable here (${pcRoots.fed} top-level entr${pcRoots.fed === 1 ? 'y' : 'ies'} enumerated before giving up)`);
  check('pointer check: SKIPPED this run -- git is required to derive gitignored roots and none answered', () => null);
} else {
  console.log(`  --   top-level entries fed to git check-ignore: ${pcRoots.fed} (files + hidden included) -- ${pcRoots.ignoredCount} gitignored`);
  const pcFindings = checkPointers({
    surfaces: pcSurfaces,
    ourRoots: pcRoots.ourRoots,
    ignoredRoots: pcRoots.ignoredRoots,
    resolve: pcResolve,
  });
  const pcSkips = pcFindings.filter((f) => f.level === 'SKIP');
  const pcHard = pcFindings.filter((f) => f.level !== 'SKIP');
  for (const f of pcSkips) console.log('  --   ' + f.msg);
  // PARTIAL COVERAGE, STATED rather than implied: PATH is machine-checked; SECTION and SYMBOL
  // are not checked at all (scripts/lib/pointer-check.mjs's own header has the measurement that
  // decided this). Naming the file HERE by its own real path (not a bare filename) means this
  // very line is itself a citation the gate could check -- a bare "pointer-check.mjs" would be
  // dropped at the gate's own step 5 (no directory component), which would be the wrong shape
  // for a line whose whole point is not overclaiming.
  if (pcHard.length === 0) {
    check(`pointer check: every in-scope path citation resolves or is declared (scripts/lib/pointer-check.mjs -- PATH only, section/symbol not checked)`, () => null);
  } else {
    pcHard.forEach((f, idx) => check(`pointer check: finding ${idx + 1}/${pcHard.length}`, () => f.msg));
  }
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
  // cross-key: individually-valid keys can form a JOINTLY-dangerous combo (gateless auto-apply)
  const cross = validateConfig(cfg);
  if (cross) return `.coalboard.json ${cross}`;
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
