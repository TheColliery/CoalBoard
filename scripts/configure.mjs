// CoalBoard configurator — edit .coalboard.json from the command line.
// Flags, parsing, validation, and help all come from one table
// (scripts/lib/config-schema.mjs, shared with verify.mjs): a key added there
// is automatically settable, validated, and documented here.
//
// Ported from CoalMine's scripts/configure.mjs (CWK-023, owner-signed ใบ D —
// configure.mjs is now a flock standard: config must be CLI-settable, not
// merely documented, per the 5-standard-systems requirement). Same SHAPE,
// not a re-derivation from description. Adaptations from CM's file, named:
//   - root-finding + read-order candidates are ported from THIS ROOM'S OWN
//     hooks/coalboard-conductor.js (AGENT_DIR_ORDER / projectCandidates /
//     findProjectCfg / parseJsonc), not CM's findGitRoot. CM resolves a
//     single git-marker ROOT then checks candidates once at that level;
//     CoalBoard's own conductor has NO root-marker concept — it checks all
//     4 read-order candidates at EVERY directory level from cwd up to home
//     (the conductor's own comment: "this room's existing upward walk has
//     no root-marker concept, unlike CoalWash's findProjectRoot"). Porting
//     CM's git-root shape here would give the CLI a DIFFERENT read order
//     than the hook that actually consumes the config — the two must agree,
//     so this file mirrors the conductor's walk, not CoalMine's.
//   - a fresh write with nothing found anywhere targets the first
//     AGENT_DIR_ORDER dir that already exists under CWD, else `.claude`
//     under CWD — CoalBoard's own read order names "the dir of the agent
//     actually executing" as step 1, and cwd is that dir; there is no
//     git-resolved root to prefer instead.
//   - CoalBoard's schema has TWO types CM's does not: 'str' (sastCommand,
//     formalCommand, stagingDir — free-form strings) and 'obj' (lensTiers,
//     rigorLensTiers, verifyGates — nested per-role/per-domain maps). The
//     three 'obj' keys are `noFlag: true` (validated + documented, never a
//     single CLI flag can express a nested map) — printHelp lists them
//     separately, and the flag lookup below never registers them, so
//     `--lensTiers <value>` is correctly "unrecognized", not a silent
//     no-op.
//   - no legacy-key migration block: CoalBoard has never renamed or retired
//     a schema key (checked: `git log -p --follow -- scripts/lib/config-
//     schema.mjs`; callFable was TOMBSTONED — removed with no successor key
//     to migrate TO, per the schema's own "do NOT resurrect" comment — not
//     renamed. A migration block exists to move an old VALUE onto a new
//     KEY; there is no new key here to migrate it onto).
import fs from 'fs';
import os from 'os';
import path from 'path';
import { CONFIG_SCHEMA, validateValue } from './lib/config-schema.mjs';

// String-aware JSONC strip + prototype-pollution guard — the SAME stripping
// regex and __proto__/constructor/prototype reviver as hooks/coalboard-
// conductor.js's own parseJsonc (verified at source before porting, not
// assumed present), but this one THROWS on malformed input instead of
// swallowing to {} — the hook is a fail-silent Phoenix-13 surface, this is
// a fail-loud CLI script (scripts-quality.md §1); the caller below tells
// "malformed, backed up" apart from "parsed to a legitimately empty {}"
// only if a parse failure actually reaches it as an error.
function parseJsonc(text) {
  const clean = String(text).replace(/"(?:\\.|[^"\\])*"|\/\/.*|\/\*[\s\S]*?\*\//g, (m) => (m[0] === '"' ? m : ''));
  const p = JSON.parse(clean, (k, v) => (k === '__proto__' || k === 'constructor' || k === 'prototype' ? undefined : v));
  if (!(p && typeof p === 'object' && !Array.isArray(p))) throw new Error('config root must be a JSON object');
  return p;
}

function physical(p) {
  try { return fs.realpathSync(p); } catch { return path.resolve(p); }
}

// Read order — IDENTICAL to hooks/coalboard-conductor.js's own AGENT_DIR_ORDER
// + projectCandidates + findProjectCfg (ported verbatim, not re-derived): the
// CLI must agree with the hook on where the config lives, or a value this
// tool writes could land somewhere the hook never reads.
const AGENT_DIR_ORDER = ['.claude', '.agents', '.gemini'];
function projectCandidates(dir) {
  const c = AGENT_DIR_ORDER.map((d) => path.join(dir, d, 'coal', 'coalboard.json'));
  c.push(path.join(dir, '.claude', '.coalboard.json')); // LEGACY, always last
  return c;
}
function findProjectCfg(startDir) {
  try {
    const home = physical(os.homedir());
    let dir = physical(startDir);
    for (let i = 0; i < 40; i++) {
      if (dir === home) break;
      for (const f of projectCandidates(dir)) {
        if (fs.existsSync(f)) return f;
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch {}
  return null;
}
function isDir(p) {
  try { return fs.statSync(p).isDirectory(); } catch { return false; }
}
// Fresh-default write target when NO config exists anywhere in the walk:
// the first agent dir CWD already has on disk (never a bare `.claude`
// planted ahead of an existing `.agents`/`.gemini`), else `.claude` under
// CWD — mirrors CM/CL's ownDirDefault, parameterized on cwd since this
// room's own walk has no git-resolved root to prefer instead.
function ownDirDefault(cwd) {
  const dir = AGENT_DIR_ORDER.find((d) => isDir(path.join(cwd, d))) ?? AGENT_DIR_ORDER[0];
  return path.join(cwd, dir, 'coal', 'coalboard.json');
}

function printHelp() {
  const lines = [
    'CoalBoard Configurator Utility',
    'Usage: node scripts/configure.mjs [options]',
    '',
    'Options:',
  ];
  for (const spec of CONFIG_SCHEMA) {
    if (spec.noFlag) continue; // nested obj keys (lensTiers/rigorLensTiers/verifyGates) -- JSON-only, see below
    const flags = [`--${spec.key}`, ...(spec.flags || [])].join(', ');
    lines.push(`  ${flags.padEnd(48)} ${spec.help}`);
  }
  lines.push(`  ${'--global'.padEnd(48)} Write ~/.claude/.coalboard.json (the global layer) instead of the project config`);
  lines.push(`  ${'--help, -h'.padEnd(48)} Show this help message`);
  lines.push('');
  const noFlagKeys = CONFIG_SCHEMA.filter((s) => s.noFlag);
  if (noFlagKeys.length) {
    lines.push(`Not CLI-settable (nested objects — edit the JSON file directly): ${noFlagKeys.map((s) => s.key).join(', ')}`);
    lines.push('');
  }
  lines.push('Examples:');
  lines.push('  node scripts/configure.mjs --rigor high --fableConsent ask');
  lines.push('  node scripts/configure.mjs --lenses data,truth,feeling');
  lines.push('  node scripts/configure.mjs --global --coalboardMode auto');
  console.log(lines.join('\n'));
}

// Parse one raw CLI value against a spec. Returns { value } or { error }.
function parseValue(spec, raw) {
  switch (spec.type) {
    case 'bool': {
      if (raw !== 'true' && raw !== 'false') {
        return { error: `${spec.key} needs true or false` };
      }
      return { value: raw === 'true' };
    }
    case 'int': {
      // Number() (not parseInt) so a float like "5.9" or a garbage tail like "50abc"
      // is rejected outright rather than silently truncated. validateValue then
      // enforces the integer + min/max contract -- the SAME check verify.mjs runs
      // on the JSON value, so the CLI parser and the JSON validator cannot drift apart.
      const n = Number(raw);
      const err = validateValue(spec, n);
      if (err) return { error: `${spec.key} ${err}` };
      return { value: n };
    }
    case 'str': {
      if (raw === undefined) return { error: `${spec.key} needs a value` };
      return { value: raw };
    }
    case 'enum': {
      const v = (raw || '').toLowerCase();
      if (!spec.values.includes(v)) {
        return { error: `${spec.key} must be one of: ${spec.values.join(', ')}` };
      }
      return { value: v };
    }
    case 'strArr': {
      if (raw === undefined) {
        return { error: `${spec.key} needs a comma-separated value (pass "" to clear the list)` };
      }
      if (raw === '' || raw === '""') return { value: [] };
      let items = raw.split(',').map((s) => s.trim()).filter(Boolean);
      if (spec.lower) items = items.map((s) => s.toLowerCase());
      return { value: items };
    }
    default:
      return { error: `internal: unknown spec type '${spec.type}' (obj keys are not CLI-settable -- see --help)` };
  }
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  // --global targets the global layer (~/.claude/.coalboard.json); default targets
  // the project config. The hook merges the two per key, project wins (mergeSafety
  // clamps two consent-bearing keys -- coalboardMode/updateMode -- toward the safer
  // of the two; every other key is plain project-wins, per hooks-safety.md §9).
  const globalIdx = args.indexOf('--global');
  const isGlobal = globalIdx !== -1;
  if (isGlobal) args.splice(globalIdx, 1);
  const cwd = process.cwd();
  const legacyPath = path.join(cwd, '.claude', '.coalboard.json');
  const readPath = isGlobal
    ? path.join(os.homedir(), '.claude', '.coalboard.json')
    : (findProjectCfg(cwd) ?? ownDirDefault(cwd));
  const writePath = isGlobal
    ? readPath
    : (readPath === legacyPath ? ownDirDefault(cwd) : readPath);

  let cfg = {};
  let hadComments = false;
  // Read once via try/catch (no existsSync precheck) so there is no check-to-use gap.
  let rawConfig = null;
  try { rawConfig = fs.readFileSync(readPath, 'utf8').replace(/^\uFEFF/, ''); } catch {}
  if (rawConfig !== null) {
    try {
      hadComments = rawConfig.includes('//');
      cfg = parseJsonc(rawConfig); // proto-pollution-guarded parse
    } catch (e) {
      // Fail loud (scripts-quality §1): a malformed config we silently overwrite is a
      // partial failure the user must notice -- flag the non-zero exit even though the
      // run continues from defaults (the old config is backed up where possible).
      process.exitCode = 1;
      try {
        fs.copyFileSync(readPath, readPath + '.bak');
        console.warn(`Warning: existing config is malformed — backed it up to ${readPath}.bak and rebuilding.`);
      } catch {
        console.warn('Warning: existing config is malformed. Overwriting.');
      }
    }
  }

  // Flag lookup: --<key> plus every alias in the table. noFlag (obj) keys are
  // deliberately excluded -- a nested map cannot be expressed by one CLI value,
  // so --lensTiers must read as "unrecognized option", never as a silent no-op
  // or a broken single-value assignment.
  const flagMap = new Map();
  for (const spec of CONFIG_SCHEMA) {
    if (spec.noFlag) continue;
    flagMap.set(`--${spec.key}`, spec);
    for (const f of spec.flags || []) flagMap.set(f, spec);
  }

  for (let i = 0; i < args.length; i++) {
    const spec = flagMap.get(args[i]);
    if (!spec) {
      console.error(`Error: Unrecognized option '${args[i]}'`);
      printHelp();
      process.exit(1);
    }
    const parsed = parseValue(spec, args[++i]);
    if (parsed.error) {
      console.error(`Error: ${parsed.error}`);
      process.exit(1);
    }
    cfg[spec.key] = parsed.value;
  }

  try {
    fs.mkdirSync(path.dirname(writePath), { recursive: true });
    fs.writeFileSync(writePath, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
    // Move-on-CONFIG-WRITE-only (no-old-version-leftover): the legacy file is
    // removed only AFTER the new-home write above succeeded, and only when this
    // write actually migrated it (readPath was the legacy file and writePath
    // moved away from it). Best-effort -- a failed delete here still leaves a
    // correctly-written new config; the stray legacy file is simply not cleaned
    // up this run.
    if (readPath === legacyPath && writePath !== legacyPath) {
      try { fs.rmSync(legacyPath, { force: true }); } catch {}
      console.log(`Migrated the project config from ${legacyPath} to ${writePath}.`);
    }
    if (hadComments) {
      console.warn('Note: inline comments were stripped (this tool writes plain JSON). Every key stays documented in platform-configs/.coalboard.json.');
    }
    console.log(`Successfully updated configuration in: ${writePath}`);
    console.log(JSON.stringify(cfg, null, 2));
  } catch (e) {
    console.error(`Error: Failed to write to config file: ${e.message}`);
    process.exit(1);
  }
}

main();
